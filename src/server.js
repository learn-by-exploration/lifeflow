const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const initDatabase = require('./db');
const createHelpers = require('./helpers');
const createAuthMiddleware = require('./middleware/auth');
const { createRequirePassword } = require('./middleware/auth');
const errorHandler = require('./middleware/errors');
const createCsrfMiddleware = require('./middleware/csrf');
const createAuditLogger = require('./services/audit');
const pkg = require('../package.json');

const app = express();
const PORT = process.env.PORT || 3456;

const dbDir = process.env.DB_DIR || path.join(__dirname, '..');
const { db, rebuildSearchIndex } = initDatabase(dbDir);
const helpers = createHelpers(db);
const deps = { db, dbDir, rebuildSearchIndex, ...helpers };

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
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));

// ─── CORS (same-origin by default) ───
app.use(cors({ origin: false }));

// ─── Rate limiting (skipped in test to avoid false blocks) ───
const isTest = process.env.NODE_ENV === 'test';
if (!isTest) {
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
  });
  app.use('/api/', globalLimiter);
}

const authLimiter = isTest ? (req, res, next) => next() : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── CSRF Protection ───
const csrfProtection = createCsrfMiddleware();
if (!isTest) {
  app.use('/api', csrfProtection);
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
app.use('/api/import', requirePassword);
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

// Serve share page
app.get('/share/:token', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{24}$/.test(token)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, '..', 'public', 'share.html'));
});

// ─── Health check ───
app.get('/health', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  const status = dbOk ? 'ok' : 'error';
  const code = dbOk ? 200 : 503;
  res.status(code).json({ status, dbOk });
});

// ─── Login page (accessible without auth) ───
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
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
  app.listen(PORT, () => console.log(`\n  LifeFlow running at http://localhost:${PORT}\n`));
}

module.exports = { app, db };

