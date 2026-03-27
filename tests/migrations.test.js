const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { tmpdir } = require('os');
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require('fs');

describe('Migration Runner', () => {
  let db, tmpDir, migrationsDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-mig-test-'));
    db = new Database(':memory:');
    migrationsDir = path.join(tmpDir, 'migrations');
    mkdirSync(migrationsDir);
  });

  afterEach(() => {
    try { db.close(); } catch {}
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  // Inline migration runner that uses custom dir instead of __dirname
  function runMigrations(db, dir) {
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    if (!fs.existsSync(dir)) return { applied: 0, total: 0 };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    if (files.length === 0) return { applied: 0, total: 0 };
    const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));
    let count = 0;
    const applyStmt = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8').trim();
      if (!sql) continue;
      db.exec(sql);
      applyStmt.run(file);
      count++;
    }
    return { applied: count, total: files.length };
  }

  it('applies all migrations in sorted order on fresh DB', () => {
    writeFileSync(path.join(migrationsDir, '001_create_test.sql'),
      'CREATE TABLE test1 (id INTEGER PRIMARY KEY, name TEXT);');
    writeFileSync(path.join(migrationsDir, '002_create_test2.sql'),
      'CREATE TABLE test2 (id INTEGER PRIMARY KEY, value TEXT);');

    const result = runMigrations(db, migrationsDir);
    assert.equal(result.applied, 2);
    assert.equal(result.total, 2);
    // Both tables should exist
    const t1 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test1'").get();
    const t2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test2'").get();
    assert.ok(t1, 'test1 table should exist');
    assert.ok(t2, 'test2 table should exist');
  });

  it('skips already-applied migrations (idempotent)', () => {
    writeFileSync(path.join(migrationsDir, '001_create.sql'),
      'CREATE TABLE idempotent_test (id INTEGER PRIMARY KEY);');

    const r1 = runMigrations(db, migrationsDir);
    assert.equal(r1.applied, 1);

    // Run again — should skip
    const r2 = runMigrations(db, migrationsDir);
    assert.equal(r2.applied, 0);
    assert.equal(r2.total, 1);
  });

  it('tracks applied migrations in _migrations table', () => {
    writeFileSync(path.join(migrationsDir, '001_test.sql'),
      'CREATE TABLE tracked (id INTEGER);');

    runMigrations(db, migrationsDir);
    const rows = db.prepare('SELECT name, applied_at FROM _migrations').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, '001_test.sql');
    assert.ok(rows[0].applied_at, 'applied_at should have a timestamp');
  });

  it('throws on malformed SQL migration', () => {
    writeFileSync(path.join(migrationsDir, '001_bad.sql'),
      'THIS IS NOT VALID SQL;');

    assert.throws(() => runMigrations(db, migrationsDir));
  });

  it('handles empty migrations directory', () => {
    const result = runMigrations(db, migrationsDir);
    assert.equal(result.applied, 0);
    assert.equal(result.total, 0);
  });

  it('executes migrations in alphabetical order', () => {
    // Create out-of-order filenames
    writeFileSync(path.join(migrationsDir, '003_third.sql'),
      'CREATE TABLE third (id INTEGER, val TEXT DEFAULT \'third\');');
    writeFileSync(path.join(migrationsDir, '001_first.sql'),
      'CREATE TABLE first (id INTEGER);');
    writeFileSync(path.join(migrationsDir, '002_second.sql'),
      'CREATE TABLE second (id INTEGER, ref INTEGER REFERENCES first(id));');

    const result = runMigrations(db, migrationsDir);
    assert.equal(result.applied, 3);

    const rows = db.prepare('SELECT name FROM _migrations ORDER BY id').all();
    assert.equal(rows[0].name, '001_first.sql');
    assert.equal(rows[1].name, '002_second.sql');
    assert.equal(rows[2].name, '003_third.sql');
  });
});
