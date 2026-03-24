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
  /**
   * requireAuth — rejects with 401 if no valid session.
   */
  function requireAuth(req, res, next) {
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
    next();
  }

  /**
   * optionalAuth — sets req.userId if valid session exists, otherwise continues.
   */
  function optionalAuth(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.lf_sid;

    if (sid) {
      const session = db.prepare(
        "SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')"
      ).get(sid);
      if (session) {
        req.userId = session.user_id;
        req.sessionId = sid;
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
  return function requirePassword(req, res, next) {
    const { password } = req.body;
    if (!password) {
      return res.status(403).json({ error: 'Password confirmation required for this action' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.userId);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    next();
  };
}

module.exports = createAuthMiddleware;
module.exports.createRequirePassword = createRequirePassword;
