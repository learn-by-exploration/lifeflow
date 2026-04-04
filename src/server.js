const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const initDatabase = require('./db');
const createHelpers = require('./helpers');
const createAuthMiddleware = require('./middleware/auth');
const { createRequirePassword } = require('./middleware/auth');
const errorHandler = require('./middleware/errors');
const createCsrfMiddleware = require('./middleware/csrf');
const createAuditLogger = require('./services/audit');
const createRequestLogger = require('./middleware/request-logger');
const createScheduler = require('./scheduler');
const logger = require('./logger');
const { AutomationEngine } = require('./services/automation-engine');

const app = express();
const PORT = config.port;

// ─── Trust proxy when behind reverse proxy (Nginx, Caddy, etc.) ───
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const { db, rebuildSearchIndex } = initDatabase(config.dbDir);
const helpers = createHelpers(db);

// ─── Automation Engine ───
const automationEngine = new AutomationEngine(db, logger, helpers);
app.locals.automationEngine = automationEngine;

const deps = { db, dbDir: config.dbDir, rebuildSearchIndex, automationEngine, ...helpers };

// ─── Audit logger ───
const audit = createAuditLogger(db);
deps.audit = audit;
// Purge old audit records daily
setInterval(() => audit.purge(), 24 * 60 * 60 * 1000);

const { requireAuth, optionalAuth } = createAuthMiddleware(db);
const bcrypt = require('bcryptjs');
const requirePassword = createRequirePassword(db, bcrypt);

// ─── Security headers ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      // Only upgrade requests when behind HTTPS proxy (breaks plain HTTP on LAN)
      upgradeInsecureRequests: config.trustProxy ? [] : null
    }
  },
  // Only enable HSTS when behind HTTPS proxy
  strictTransportSecurity: config.trustProxy,
  referrerPolicy: { policy: 'same-origin' }
}));

// ─── No-cache on all API responses ───
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ─── CORS (same-origin by default, configurable via ALLOWED_ORIGINS) ───
if (config.allowedOrigins.length > 0) {
  app.use(cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (same-origin, curl, mobile apps)
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));
} else {
  app.use(cors({ origin: false }));
}

// ─── Rate limiting (skipped in test to avoid false blocks) ───
if (!config.isTest) {
  const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
  });
  app.use('/api/', globalLimiter);
}

const authLimiter = config.isTest ? (req, res, next) => next() : rateLimit({
  windowMs: config.auth.authLimitWindowMs,
  max: config.auth.authLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

app.use(express.json({ limit: '1mb' }));
// Guard: ensure req.body is always an object for API POST/PUT/PATCH routes
// (prevents 500 when non-JSON Content-Type sends unparsed body)
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.body) req.body = {};
  next();
});

// ─── Response compression ───
const compression = require('compression');
app.use(compression());

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── CSRF Protection ───
const csrfProtection = createCsrfMiddleware();
if (!config.isTest) {
  app.use('/api', csrfProtection);
}

// ─── Request Logging ───
if (!config.isTest) {
  app.use(createRequestLogger(logger));
}

// ─── Apply auth middleware to all /api/* routes ───
app.use('/api', (req, res, next) => {
  // Auth endpoints use optionalAuth (sets req.userId if session exists, but doesn't require it)
  if (req.path.startsWith('/auth/')) return optionalAuth(req, res, next);
  requireAuth(req, res, next);
});

// ─── Auth routes ───
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use(require('./routes/auth')(deps));

// ─── Destructive endpoint protection (require password re-entry) ───
app.use('/api/import', express.json({ limit: '10mb' }));
// Only require password for the main import endpoint (full data restore), not for external importers
app.post('/api/import', requirePassword);
app.use('/api/demo/reset', requirePassword);

// ─── Route modules ───
app.use(require('./routes/tags')(deps));
app.use(require('./routes/areas')(deps));
app.use(require('./routes/tasks')(deps));
app.use(require('./routes/stats')(deps));
app.use(require('./routes/features')(deps));
app.use(require('./routes/filters')(deps));
app.use(require('./routes/data')(deps));
app.use(require('./routes/productivity')(deps));
app.use(require('./routes/lists')(deps));
app.use(require('./routes/custom-fields')(deps));

// Serve share page
app.get('/share/:token', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{24}$/.test(token)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, '..', 'public', 'share.html'));
});

// ─── Health & readiness checks ───
app.get('/health', (req, res) => {
  let dbOk = false;
  let walOk = false;
  let dataOk = false;
  let watermark = null;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
    const walMode = db.pragma('journal_mode', { simple: true });
    walOk = walMode === 'wal';
    // Data integrity check against watermark
    const wmRow = db.prepare("SELECT value FROM settings WHERE key='_data_watermark' AND user_id=0").get();
    const taskCount = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const areaCount = db.prepare('SELECT COUNT(*) as c FROM life_areas').get().c;
    if (wmRow) {
      watermark = JSON.parse(wmRow.value);
      // Data is OK if counts haven't dropped to zero when watermark says they shouldn't be
      dataOk = !(watermark.tasks > 0 && taskCount === 0) && !(watermark.areas > 0 && areaCount === 0);
    } else {
      dataOk = true; // No watermark yet = fresh install
    }
  } catch {}
  const status = dbOk && walOk && dataOk ? 'ok' : 'degraded';
  const code = dbOk ? 200 : 503;
  res.status(code).json({ status, dbOk, walOk, dataOk, watermark });
});

app.get('/ready', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  if (!dbOk) return res.status(503).json({ ready: false });
  res.json({ ready: true });
});

// ─── Login page (accessible without auth) ───
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// ─── API 404 catch-all (must come before SPA fallback) ───
app.all('/api/{*splat}', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback (requires auth — redirect to login if not authenticated)
app.get('/{*splat}', (req, res) => {
  // Check if user has a valid session
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/lf_sid=([^;]+)/);
  if (match) {
    const session = db.prepare("SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')").get(match[1]);
    if (session) {
      return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
  }
  // Not authenticated — redirect to login
  res.redirect('/login');
});

// ─── Global error handler (must be last) ───
app.use(errorHandler);

// Export for testing; start server only when run directly
if (require.main === module) {
  // ─── Process-level error handlers (must be before app.listen) ───
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — forcing shutdown');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection — forcing shutdown');
    process.exit(1);
  });

  const server = app.listen(PORT, () => logger.info({ port: PORT, version: config.version }, 'LifeFlow started'));

  // ─── Background Scheduler ───
  const scheduler = createScheduler(db, logger);
  scheduler.setAutomationEngine(automationEngine);
  scheduler.registerBuiltinJobs();
  scheduler.start();

  // ─── Graceful shutdown ───
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received, draining connections...');
    scheduler.stop();
    server.close(() => {
      logger.info('HTTP server closed');
      try {
        // Force WAL checkpoint before closing — flushes all WAL data into main DB file
        db.pragma('wal_checkpoint(TRUNCATE)');
        logger.info('WAL checkpoint completed');
        db.close();
      } catch (e) {
        logger.error({ err: e }, 'Error during DB shutdown');
        try { db.close(); } catch {}
      }
      logger.info('Database closed');
      process.exit(0);
    });
    // Force exit after timeout
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch {}
      process.exit(1);
    }, config.shutdownTimeoutMs || 10000);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, db, rebuildSearchIndex };

