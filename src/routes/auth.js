const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const SESSION_TTL_DEFAULT = 24 * 60 * 60;       // 24 hours in seconds
const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60;  // 30 days in seconds

module.exports = function(deps) {
  const { db } = deps;
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

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
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

    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
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
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!bcrypt.compareSync(String(current_password), user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(String(new_password), SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);

    // Invalidate all other sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND sid != ?').run(req.userId, req.sessionId);

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
  // Add Secure flag only in production (HTTPS)
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}
