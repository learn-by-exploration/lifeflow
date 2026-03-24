const express = require('express');
const path = require('path');
const fs = require('fs');
const initDatabase = require('./db');
const createHelpers = require('./helpers');

const app = express();
const PORT = process.env.PORT || 3456;

const dbDir = process.env.DB_DIR || path.join(__dirname, '..');
const { db, rebuildSearchIndex } = initDatabase(dbDir);
const helpers = createHelpers(db);
const deps = { db, dbDir, rebuildSearchIndex, ...helpers };

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Export for testing; start server only when run directly
if (require.main === module) {
  app.listen(PORT, () => console.log(`\n  LifeFlow running at http://localhost:${PORT}\n`));
}

module.exports = { app, db };

