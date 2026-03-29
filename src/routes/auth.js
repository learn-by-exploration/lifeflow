const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const SESSION_TTL_DEFAULT = 24 * 60 * 60;       // 24 hours in seconds
const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60;  // 30 days in seconds
// Dummy hash for timing-attack mitigation — always call bcrypt even if user not found
const DUMMY_HASH = bcrypt.hashSync('__dummy_timing_pad__', SALT_ROUNDS);

// Account lockout constants
const LOCKOUT_THRESHOLD = 5;          // max failed attempts before lockout
const LOCKOUT_WINDOW_MINUTES = 15;    // time window for counting failures
const LOCKOUT_DURATION_MINUTES = 15;  // how long the lockout lasts

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
    const { email, password, remember, totp_token } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = String(email).trim().toLowerCase();

    // ─── Account lockout check ───
    const lockoutRow = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(trimmedEmail);
    if (lockoutRow && lockoutRow.locked_until) {
      const lockedUntil = new Date(lockoutRow.locked_until + 'Z');
      if (lockedUntil > new Date()) {
        // Still locked — don't even check password (prevents timing leak)
        // Run bcrypt anyway to prevent timing-based lockout detection
        bcrypt.compareSync(String(password), DUMMY_HASH);
        if (audit) audit.log(null, 'login_locked', 'auth', null, req, trimmedEmail);
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      // Lockout expired — reset
      db.prepare('DELETE FROM login_attempts WHERE email = ?').run(trimmedEmail);
    }

    // Check if failures are outside the window (stale attempts)
    if (lockoutRow && !lockoutRow.locked_until && lockoutRow.first_attempt_at) {
      const firstAttempt = new Date(lockoutRow.first_attempt_at + 'Z');
      const windowEnd = new Date(firstAttempt.getTime() + LOCKOUT_WINDOW_MINUTES * 60 * 1000);
      if (new Date() > windowEnd) {
        // Window expired — reset counter
        db.prepare('DELETE FROM login_attempts WHERE email = ?').run(trimmedEmail);
      }
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);

    // Always call bcrypt to prevent timing attacks
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(String(password), hashToCompare);
    if (!user || !valid) {
      // ─── Track failed attempt ───
      const existing = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(trimmedEmail);
      if (existing) {
        const newAttempts = existing.attempts + 1;
        if (newAttempts >= LOCKOUT_THRESHOLD) {
          // Lock the account
          db.prepare(
            "UPDATE login_attempts SET attempts = ?, locked_until = datetime('now', '+' || ? || ' minutes') WHERE email = ?"
          ).run(newAttempts, LOCKOUT_DURATION_MINUTES, trimmedEmail);
        } else {
          db.prepare('UPDATE login_attempts SET attempts = ? WHERE email = ?').run(newAttempts, trimmedEmail);
        }
      } else {
        db.prepare(
          "INSERT INTO login_attempts (email, attempts, first_attempt_at) VALUES (?, 1, datetime('now'))"
        ).run(trimmedEmail);
      }
      if (audit) audit.log(null, 'login_failed', 'auth', null, req, trimmedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // ─── 2FA enforcement ───
    const totpEnabled = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'totp_enabled'").get(user.id);
    if (totpEnabled && totpEnabled.value === '1') {
      if (!totp_token) {
        return res.status(403).json({ error: '2FA token required', requires_2fa: true });
      }
      const secretRow = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'totp_secret'").get(user.id);
      if (!secretRow) {
        return res.status(500).json({ error: '2FA misconfigured' });
      }
      // Check current and adjacent time steps (±1) for 30-second drift tolerance
      const secret = secretRow.value;
      const currentToken = generateTOTP(secret);
      const prevToken = generateTOTP(secret, 30, -1);
      const nextToken = generateTOTP(secret, 30, 1);
      if (totp_token !== currentToken && totp_token !== prevToken && totp_token !== nextToken) {
        if (audit) audit.log(null, 'login_2fa_failed', 'auth', null, req, trimmedEmail);
        return res.status(401).json({ error: 'Invalid 2FA token' });
      }
    }

    // ─── Successful login: reset failure counter ───
    db.prepare('DELETE FROM login_attempts WHERE email = ?').run(trimmedEmail);

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

    // Clear the session cookie — user must re-login
    res.setHeader('Set-Cookie', 'lf_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    if (audit) audit.log(req.userId, 'password_changed', 'user', req.userId, req);
    res.json({ ok: true });
  });

  // ─── TOTP 2FA ───

  // Setup 2FA — generates secret, returns QR URI
  router.post('/api/auth/2fa/setup', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    // Generate 20-byte secret encoded as base32
    const secret = crypto.randomBytes(20);
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let base32 = '';
    let bits = 0, value = 0;
    for (const byte of secret) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        base32 += base32Chars[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) base32 += base32Chars[(value << (5 - bits)) & 31];

    // Store pending secret (not yet verified)
    db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'totp_pending_secret', ?)")
      .run(req.userId, base32);

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
    const issuer = 'LifeFlow';
    const otpauth_uri = `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${base32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    res.json({ secret: base32, otpauth_uri });
  });

  // Verify TOTP token to enable 2FA
  router.post('/api/auth/2fa/verify', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    const { token } = req.body;
    if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid token format (6 digits required)' });
    }

    const pending = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'totp_pending_secret'").get(req.userId);
    if (!pending) return res.status(400).json({ error: 'No 2FA setup in progress' });

    // Verify TOTP — check current and adjacent time steps
    const secret = pending.value;
    const currentToken = generateTOTP(secret);
    const prevToken = generateTOTP(secret, 30, -1);
    const nextToken = generateTOTP(secret, 30, 1);
    if (token !== currentToken && token !== prevToken && token !== nextToken) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Enable 2FA: move secret from pending to active
    db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'totp_secret', ?)").run(req.userId, secret);
    db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'totp_enabled', '1')").run(req.userId);
    db.prepare("DELETE FROM settings WHERE user_id = ? AND key = 'totp_pending_secret'").run(req.userId);

    res.json({ enabled: true });
  });

  // Disable 2FA
  router.delete('/api/auth/2fa', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    db.prepare("DELETE FROM settings WHERE user_id = ? AND key IN ('totp_secret', 'totp_enabled', 'totp_pending_secret')").run(req.userId);
    res.json({ enabled: false });
  });

  // Check 2FA status
  router.get('/api/auth/2fa/status', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    const enabled = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'totp_enabled'").get(req.userId);
    res.json({ enabled: enabled?.value === '1' });
  });

  // ─── List Users (for assignment picker) ───
  router.get('/api/users', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
    const users = db.prepare('SELECT id, display_name FROM users').all();
    res.json(users);
  });

  // ─── API Token Management ───

  // Create a new API token
  router.post('/api/auth/tokens', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    const { name, expires_in_days } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Token name is required' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
      : null;

    const result = db.prepare(
      'INSERT INTO api_tokens (user_id, name, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(req.userId, name.trim().slice(0, 100), tokenHash, expiresAt);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      name: name.trim().slice(0, 100),
      token,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    });
  });

  // List tokens (no hashes exposed)
  router.get('/api/auth/tokens', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    const tokens = db.prepare(
      'SELECT id, name, last_used_at, created_at, expires_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.userId);
    res.json(tokens);
  });

  // Rename a token
  router.put('/api/auth/tokens/:id', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Token name is required' });
    }

    const token = db.prepare('SELECT id FROM api_tokens WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!token) return res.status(404).json({ error: 'Token not found' });

    db.prepare('UPDATE api_tokens SET name = ? WHERE id = ?').run(name.trim().slice(0, 100), token.id);
    res.json({ id: token.id, name: name.trim().slice(0, 100) });
  });

  // Revoke (delete) a token
  router.delete('/api/auth/tokens/:id', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

    const token = db.prepare('SELECT id FROM api_tokens WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.userId);
    if (!token) return res.status(404).json({ error: 'Token not found' });

    db.prepare('DELETE FROM api_tokens WHERE id = ?').run(token.id);
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

/**
 * Generate a TOTP code (RFC 6238) from a base32-encoded secret.
 */
function generateTOTP(base32Secret, timeStep = 30, counterOffset = 0) {
  // Decode base32
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const c of base32Secret.toUpperCase()) {
    const idx = base32Chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
  }
  const key = Buffer.from(bytes);

  // Calculate counter from current time with optional offset
  const counter = Math.floor(Date.now() / 1000 / timeStep) + counterOffset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xFFFFFFFF, 4);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xF;
  const otp = ((hmac[offset] & 0x7F) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
  return otp.toString().padStart(6, '0');
}
