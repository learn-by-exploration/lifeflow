const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const SESSION_TTL_DEFAULT = 24 * 60 * 60;       // 24 hours in seconds
const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60;  // 30 days in seconds
// Dummy hash for timing-attack mitigation — always call bcrypt even if user not found
const DUMMY_HASH = bcrypt.hashSync('__dummy_timing_pad__', SALT_ROUNDS);

// Color validation helper (used by area/goal routes)
const COLOR_HEX_RE = /^#[0-9A-Fa-f]{3,6}$/;

// Password policy: 12+ chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least 1 uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least 1 lowercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least 1 digit';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least 1 special character';
  return null;
}

module.exports = function(deps) {
  const { db, audit } = deps;
  const router = Router();

  // ─── Register ───
  router.post('/api/auth/register', (req, res) => {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const pwErr = validatePassword(String(password));
    if (pwErr) {
      return res.status(400).json({ error: pwErr });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      // Return identical response to prevent account enumeration
      return res.status(201).json({ user: { id: 0, email: trimmedEmail, display_name: '', created_at: new Date().toISOString() } });
    }

    const hash = bcrypt.hashSync(String(password), SALT_ROUNDS);
    const name = display_name ? String(display_name).trim().slice(0, 100) : '';
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
    ).run(trimmedEmail, hash, name);

    const user = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);

    // Auto-login after register
    const sid = crypto.randomUUID();
    const ttl = SESSION_TTL_DEFAULT;
    db.prepare(
      "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '+' || ? || ' seconds'))"
    ).run(sid, user.id, ttl);

    res.setHeader('Set-Cookie', buildCookie(sid, ttl, req));
    res.status(201).json({ user });
  });

  // ─── Login ───
  router.post('/api/auth/login', (req, res) => {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);

    // Always call bcrypt to prevent timing attacks
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(String(password), hashToCompare);
    if (!user || !valid) {
      if (audit) audit.log(null, 'login_failed', 'auth', null, req, trimmedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last_login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const sid = crypto.randomUUID();
    const ttl = remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
    db.prepare(
      "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, ?, datetime('now', '+' || ? || ' seconds'))"
    ).run(sid, user.id, remember ? 1 : 0, ttl);

    res.setHeader('Set-Cookie', buildCookie(sid, ttl, req));
    if (audit) audit.log(user.id, 'login', 'session', sid, req);
    res.json({
      user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at }
    });
  });

  // ─── Logout ───
  router.post('/api/auth/logout', (req, res) => {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/lf_sid=([^;]+)/);
    if (match) {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(match[1]);
    }
    // Clear cookie
    res.setHeader('Set-Cookie', 'lf_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  // ─── Current User ───
  router.get('/api/auth/me', (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = db.prepare('SELECT id, email, display_name, created_at, last_login FROM users WHERE id = ?')
      .get(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user });
  });

  // ─── Change Password ───
  router.post('/api/auth/change-password', (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new passwords required' });
    }
    const npwErr = validatePassword(String(new_password));
    if (npwErr) {
      return res.status(400).json({ error: npwErr });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!bcrypt.compareSync(String(current_password), user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(String(new_password), SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);

    // Invalidate ALL sessions (including current) — force re-login
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.userId);

    // Create a new session for the current user
    const sid = crypto.randomUUID();
    const ttl = SESSION_TTL_DEFAULT;
    db.prepare(
      "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '+' || ? || ' seconds'))"
    ).run(sid, req.userId, ttl);

    res.setHeader('Set-Cookie', buildCookie(sid, ttl, req));
    if (audit) audit.log(req.userId, 'password_changed', 'user', req.userId, req);
    res.json({ ok: true });
  });

  return router;
};

function buildCookie(sid, ttlSeconds, req) {
  const parts = [
    `lf_sid=${sid}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${ttlSeconds}`
  ];
  // Add Secure flag only when the connection is actually HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    parts.push('Secure');
  }
  return parts.join('; ');
}
