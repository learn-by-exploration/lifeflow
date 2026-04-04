// Audit logging service — logs security-sensitive events
'use strict';

module.exports = function createAuditLogger(db) {
  // Ensure audit_log table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource TEXT,
      resource_id TEXT,
      ip TEXT,
      ua TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)');

  const insertStmt = db.prepare(
    'INSERT INTO audit_log (user_id, action, resource, resource_id, ip, ua, detail) VALUES (?,?,?,?,?,?,?)'
  );

  function log(userId, action, resource, resourceId, req, detail) {
    try {
      const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
      const ua = req ? (req.headers['user-agent'] || '') : '';
      insertStmt.run(
        userId || null,
        action,
        resource || null,
        resourceId !== null && resourceId !== undefined ? String(resourceId) : null,
        typeof ip === 'string' ? ip.slice(0, 45) : '',
        typeof ua === 'string' ? ua.slice(0, 256) : '',
        detail || null
      );
    } catch (e) {
      // Never let audit failures break application flow
      const logger = require('../logger');
      logger.warn({ err: e }, 'Audit log write failed');
    }
  }

  // Purge records older than 90 days
  function purge() {
    try {
      db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')").run();
    } catch (e) {
      const logger = require('../logger');
      logger.warn({ err: e }, 'Audit purge failed');
    }
  }

  return { log, purge };
};
