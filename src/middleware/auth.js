/**
 * Authentication middleware for LifeFlow.
 * Reads lf_sid cookie, validates session, sets req.userId.
 */

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function createAuthMiddleware(db) {
  const crypto = require('crypto');

  /**
   * Try to authenticate via Authorization: Bearer <token> header.
   * Returns user_id if valid, null otherwise.
   */
  function tryBearerAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    if (!token) return null;

    // Hash the token with SHA-256 to look up in DB
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = db.prepare(
      "SELECT id, user_id, expires_at FROM api_tokens WHERE token_hash = ?"
    ).get(tokenHash);

    if (!row) return null;
    // Check expiration
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    // Update last_used_at
    db.prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    return row.user_id;
  }

  /**
   * requireAuth — rejects with 401 if no valid session or bearer token.
   */
  function requireAuth(req, res, next) {
    // Try bearer token first
    const bearerUserId = tryBearerAuth(req);
    if (bearerUserId) {
      req.userId = bearerUserId;
      req.authMethod = 'bearer';
      return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.lf_sid;

    if (!sid) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const session = db.prepare(
      "SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')"
    ).get(sid);

    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    req.userId = session.user_id;
    req.sessionId = sid;
    req.authMethod = 'session';
    next();
  }

  /**
   * optionalAuth — sets req.userId if valid session or bearer token exists, otherwise continues.
   */
  function optionalAuth(req, res, next) {
    // Try bearer token first
    const bearerUserId = tryBearerAuth(req);
    if (bearerUserId) {
      req.userId = bearerUserId;
      req.authMethod = 'bearer';
      return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.lf_sid;

    if (sid) {
      const session = db.prepare(
        "SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')"
      ).get(sid);
      if (session) {
        req.userId = session.user_id;
        req.sessionId = sid;
        req.authMethod = 'session';
      }
    }
    next();
  }

  return { requireAuth, optionalAuth };
}

/**
 * requirePassword — middleware for destructive endpoints.
 * Requires `password` in request body; verifies it against the user's stored hash.
 * Must be used AFTER requireAuth (needs req.userId).
 */
function createRequirePassword(db, bcrypt) {
  // Dummy hash for timing-attack mitigation
  const DUMMY_HASH = bcrypt.hashSync('__dummy_timing_pad__', 12);
  return function requirePassword(req, res, next) {
    const { password } = req.body;
    if (!password) {
      return res.status(403).json({ error: 'Password confirmation required for this action' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.userId);
    // Always call bcrypt to prevent timing attacks
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hashToCompare);
    if (!user || !valid) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    next();
  };
}

module.exports = createAuthMiddleware;
module.exports.createRequirePassword = createRequirePassword;
