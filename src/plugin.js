'use strict';

/**
 * LifeFlow Plugin Adapter for Synclyf Monolith.
 *
 * Wraps all LifeFlow routes into a plugin interface.
 * Route style: ABSOLUTE paths (/api/tags, /api/tasks, etc.)
 * The monolith mounts this at /api/lf and prepends /api/ to req.url
 * so the original absolute-path routes still match.
 */

const { Router } = require('express');

module.exports = function initPlugin(context) {
  if (!context?.authDb || !context?.config || !context?.logger) {
    throw new Error('LifeFlow plugin context incomplete: missing authDb, config, or logger');
  }

  const { authDb, config, logger } = context;

  // ─── Initialize LifeFlow's own database ───
  const initDatabase = require('./db');
  const { db, rebuildSearchIndex } = initDatabase(config.dataDir);

  // ─── Create LifeFlow dependencies ───
  const createHelpers = require('./helpers');
  const helpers = createHelpers(db);
  const createAuditLogger = require('./services/audit');
  const audit = createAuditLogger(db);
  const { AutomationEngine } = require('./services/automation-engine');
  const automationEngine = new AutomationEngine(db, logger, helpers);
  const createScheduler = require('./scheduler');

  const deps = { db, dbDir: config.dataDir, rebuildSearchIndex, automationEngine, audit, ...helpers };

  // ─── Ensure user exists in LifeFlow DB ───
  function ensureUser(req, _res, next) {
    if (!req.userId) return next();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.userId);
    if (!existing) {
      const authUser = authDb.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(req.userId);
      if (authUser) {
        // Insert with matching ID — password_hash unused but column must exist for schema compat
        db.prepare(
          'INSERT OR IGNORE INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(authUser.id, authUser.email, 'MONOLITH_MANAGED', authUser.display_name || '', authUser.created_at);
      }
    }
    next();
  }

  // ─── Build router with all LifeFlow routes ───
  const router = Router();

  // Auth routes are handled by monolith — skip LifeFlow's auth
  // Mount all feature routes (they use absolute paths like /api/tags)
  router.use(require('./routes/tags')(deps));
  router.use(require('./routes/areas')(deps));
  router.use(require('./routes/tasks')(deps));
  router.use(require('./routes/stats')(deps));
  router.use(require('./routes/features')(deps));
  router.use(require('./routes/filters')(deps));
  router.use(require('./routes/data')(deps));
  router.use(require('./routes/productivity')(deps));
  router.use(require('./routes/lists')(deps));
  router.use(require('./routes/custom-fields')(deps));

  // ─── Scheduler ───
  const scheduler = createScheduler(db, logger);
  scheduler.setAutomationEngine(automationEngine);
  scheduler.registerBuiltinJobs();

  return {
    name: 'lifeflow',
    router,
    ensureUser,
    scheduler,

    healthCheck() {
      try {
        db.prepare('SELECT 1').get();
        const walMode = db.pragma('journal_mode', { simple: true });
        return { status: walMode === 'wal' ? 'ok' : 'degraded', walMode };
      } catch (err) {
        return { status: 'error', message: err.message };
      }
    },

    shutdown() {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch (err) {
        logger.error({ err, plugin: 'lifeflow' }, 'DB close error');
        try { db.close(); } catch {}
      }
    },
  };
};
