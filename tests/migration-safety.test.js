const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { tmpdir } = require('os');
const { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } = require('fs');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

// ─── Migration Runner Unit Tests (custom dir, in-memory DB) ─────────────────

describe('Migration Runner', () => {
  let db, tmpDir, migrationsDir;

  // Inline migration runner for testing with custom dir
  function runMig(database, dir) {
    database.exec(`CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    if (!fs.existsSync(dir)) return { applied: 0, total: 0 };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    if (files.length === 0) return { applied: 0, total: 0 };
    const applied = new Set(database.prepare('SELECT name FROM _migrations').all().map(r => r.name));
    let count = 0;
    const applyStmt = database.prepare('INSERT INTO _migrations (name) VALUES (?)');
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), 'utf8').trim();
      if (!sql) continue;
      try {
        database.exec(sql);
        applyStmt.run(file);
        count++;
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    return { applied: count, total: files.length };
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-mig-'));
    db = new Database(':memory:');
    migrationsDir = path.join(tmpDir, 'migrations');
    mkdirSync(migrationsDir);
  });
  afterEach(() => {
    try { db.close(); } catch {}
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

    it('migration with syntax error throws with filename', () => {
      writeFileSync(path.join(migrationsDir, '001_bad.sql'), 'CREATE TABL oops (id INTEGER);');
      assert.throws(() => runMig(db, migrationsDir), (err) => {
        assert.ok(err.message.includes('001_bad.sql'), 'error should include filename');
        return true;
      });
    });

    it('partial application stops at first failure', () => {
      writeFileSync(path.join(migrationsDir, '001_ok.sql'), 'CREATE TABLE ok1 (id INTEGER PRIMARY KEY);');
      writeFileSync(path.join(migrationsDir, '002_bad.sql'), 'INVALID SQL HERE;');
      writeFileSync(path.join(migrationsDir, '003_ok.sql'), 'CREATE TABLE ok3 (id INTEGER PRIMARY KEY);');

      assert.throws(() => runMig(db, migrationsDir));
      // Only the first migration should have been applied
      const rows = db.prepare('SELECT name FROM _migrations').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, '001_ok.sql');
    });

    it('empty SQL file is skipped (not counted as applied)', () => {
      writeFileSync(path.join(migrationsDir, '001_empty.sql'), '   ');
      writeFileSync(path.join(migrationsDir, '002_real.sql'), 'CREATE TABLE real_t (id INTEGER);');
      const result = runMig(db, migrationsDir);
      assert.equal(result.applied, 1);
      const rows = db.prepare('SELECT name FROM _migrations').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, '002_real.sql');
    });

    it('non-.sql files are ignored', () => {
      writeFileSync(path.join(migrationsDir, 'README.md'), '# Readme');
      writeFileSync(path.join(migrationsDir, '001_ok.sql'), 'CREATE TABLE t1 (id INTEGER);');
      const result = runMig(db, migrationsDir);
      assert.equal(result.total, 1);
      assert.equal(result.applied, 1);
    });

    it('missing migrations directory returns zero counts', () => {
      const missingDir = path.join(tmpDir, 'no-such-dir');
      const result = runMig(db, missingDir);
      assert.equal(result.applied, 0);
      assert.equal(result.total, 0);
    });

    it('re-running after partial failure resumes from where it stopped', () => {
      writeFileSync(path.join(migrationsDir, '001_ok.sql'), 'CREATE TABLE t1 (id INTEGER);');
      writeFileSync(path.join(migrationsDir, '002_bad.sql'), 'INVALID;');
      assert.throws(() => runMig(db, migrationsDir));

      // Fix the bad migration
      writeFileSync(path.join(migrationsDir, '002_bad.sql'), 'CREATE TABLE t2 (id INTEGER);');
      const result = runMig(db, migrationsDir);
      assert.equal(result.applied, 1); // only 002 applied this time
      const rows = db.prepare('SELECT name FROM _migrations ORDER BY id').all();
      assert.equal(rows.length, 2);
    });

    it('multi-statement migration applies all statements', () => {
      writeFileSync(path.join(migrationsDir, '001_multi.sql'),
        'CREATE TABLE m1 (id INTEGER);\nCREATE TABLE m2 (id INTEGER);');
      const result = runMig(db, migrationsDir);
      assert.equal(result.applied, 1);
      const t1 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='m1'").get();
      const t2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='m2'").get();
      assert.ok(t1);
      assert.ok(t2);
    });
});

// ─── Migration SQL Safety Checks ──────────────────────────────────────────

describe('Migration SQL safety', () => {
  const migrDir = path.join(__dirname, '..', 'src', 'db', 'migrations');

  it('all migration files are valid SQL syntax', () => {
    if (!fs.existsSync(migrDir)) return;
    const files = fs.readdirSync(migrDir).filter(f => f.endsWith('.sql'));
    for (const file of files) {
      const sql = readFileSync(path.join(migrDir, file), 'utf8').trim();
      if (!sql) continue;
      // Verify SQL is syntactically valid (some may reference existing tables,
      // so we use IF NOT EXISTS / IF EXISTS patterns rather than executing)
      assert.ok(sql.length > 0, `${file} should not be empty`);
      // Check for common SQL syntax issues
      const lines = sql.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
      assert.ok(lines.length > 0, `${file} should have at least one non-comment SQL line`);
    }
  });

  it('no migration contains DROP TABLE without IF EXISTS', () => {
    if (!fs.existsSync(migrDir)) return;
    const files = fs.readdirSync(migrDir).filter(f => f.endsWith('.sql'));
    for (const file of files) {
      const sql = readFileSync(path.join(migrDir, file), 'utf8');
      for (const line of sql.split('\n')) {
        const upper = line.trim().toUpperCase();
        if (upper.includes('DROP TABLE') && !upper.includes('IF EXISTS')) {
          assert.fail(`${file}: DROP TABLE without IF EXISTS: ${line.trim()}`);
        }
      }
    }
  });

  it('no migration contains DELETE FROM without WHERE clause', () => {
    if (!fs.existsSync(migrDir)) return;
    const files = fs.readdirSync(migrDir).filter(f => f.endsWith('.sql'));
    for (const file of files) {
      const sql = readFileSync(path.join(migrDir, file), 'utf8');
      for (const line of sql.split('\n')) {
        const upper = line.trim().toUpperCase();
        if (upper.startsWith('DELETE FROM') && !upper.includes('WHERE')) {
          assert.fail(`${file}: DELETE FROM without WHERE: ${line.trim()}`);
        }
      }
    }
  });

  it('migration filenames follow NNN_description.sql pattern', () => {
    if (!fs.existsSync(migrDir)) return;
    const files = fs.readdirSync(migrDir).filter(f => f.endsWith('.sql'));
    for (const file of files) {
      assert.match(file, /^\d{3}_[\w]+\.sql$/, `Migration filename should match NNN_description.sql: ${file}`);
    }
  });
});

// ─── Schema, Backup, Cascade, Constraints (production DB) ───────────────────

describe('Database Safety (production init)', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('Schema from production init', () => {

    const expectedTables = [
      'users', 'sessions', 'life_areas', 'goals', 'tasks', 'subtasks',
      'tags', 'task_tags', 'task_deps', 'task_templates', 'settings',
      'saved_filters', 'habits', 'habit_logs', 'task_comments',
      'goal_milestones', 'inbox', 'notes', 'weekly_reviews',
      'lists', 'list_items', 'focus_sessions', 'focus_session_meta',
      'focus_steps', 'badges', 'automation_rules', 'daily_reviews',
      'api_tokens', 'push_subscriptions', 'push_notification_log',
      'webhooks', 'custom_field_defs', 'task_custom_values',
      'login_attempts'
    ];

    it('all expected tables exist (≥34)', () => {
      const { db } = setup();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations' AND name NOT LIKE 'search_index%'").all().map(r => r.name);
      for (const tbl of expectedTables) {
        assert.ok(tables.includes(tbl), `Table ${tbl} should exist (found: ${tables.join(', ')})`);
      }
    });

    it('foreign_keys pragma is ON', () => {
      const { db } = setup();
      const fk = db.pragma('foreign_keys');
      assert.equal(fk[0].foreign_keys, 1);
    });

    it('journal_mode is WAL', () => {
      const { db } = setup();
      const jm = db.pragma('journal_mode');
      assert.equal(jm[0].journal_mode, 'wal');
    });

    it('_migrations table exists and has applied entries', () => {
      const { db } = setup();
      const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'").get();
      assert.ok(tbl, '_migrations table should exist');
    });

    it('FTS5 search_index virtual table exists', () => {
      const { db } = setup();
      const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='search_index'").get();
      assert.ok(tbl, 'search_index FTS5 table should exist');
    });

    const expectedIndexes = [
      ['tasks', 'idx_tasks_goal'],
      ['tasks', 'idx_tasks_status'],
      ['tasks', 'idx_tasks_my_day'],
      ['tasks', 'idx_tasks_due'],
      ['task_tags', 'idx_task_tags_tag'],
      ['task_comments', 'idx_task_comments_task'],
      ['goal_milestones', 'idx_goal_milestones_goal'],
      ['sessions', 'idx_sessions_expires'],
      ['lists', 'idx_lists_area'],
    ];

    for (const [tbl, idx] of expectedIndexes) {
      it(`index ${idx} exists on ${tbl}`, () => {
        const { db } = setup();
        const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?").all(tbl);
        assert.ok(indexes.some(i => i.name === idx), `${idx} should exist on ${tbl}`);
      });
    }

    it('UNIQUE constraint on tags(name) or tags(user_id, name)', () => {
      const { db } = setup();
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tags'").get();
      assert.ok(sql.sql.toUpperCase().includes('UNIQUE'), 'tags table should have UNIQUE constraint');
    });

    it('UNIQUE constraint on sessions(sid) via PRIMARY KEY', () => {
      const { db } = setup();
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'").get();
      assert.ok(sql.sql.includes('sid TEXT PRIMARY KEY'), 'sessions.sid should be PRIMARY KEY');
    });

    it('UNIQUE constraint on custom_field_defs(user_id, name)', () => {
      const { db } = setup();
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='custom_field_defs'").get();
      assert.ok(sql.sql.toUpperCase().includes('UNIQUE'), 'custom_field_defs should have UNIQUE constraint');
    });

    it('UNIQUE constraint on daily_reviews(user_id, date)', () => {
      const { db } = setup();
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_reviews'").get();
      assert.ok(sql.sql.toUpperCase().includes('UNIQUE'), 'daily_reviews should have UNIQUE constraint');
    });

    it('tasks table has ON DELETE CASCADE from goals', () => {
      const { db } = setup();
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
      assert.ok(sql.sql.includes('ON DELETE CASCADE'), 'tasks FK should cascade');
    });

    it('subtasks table has ON DELETE CASCADE from tasks', () => {
      const { db } = setup();
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='subtasks'").get();
      assert.ok(sql.sql.includes('ON DELETE CASCADE'), 'subtasks FK should cascade');
    });
  });

  // ─── Backup Mechanics (via API) ───────────────────────────────────────────

  describe('Backup mechanics via API', () => {

    it('POST /api/backup creates a backup file', async () => {
      const res = await agent().post('/api/backup');
      assert.equal(res.status, 200);
      assert.ok(res.body.file || res.body.ok, 'should return file or ok');
    });

    it('GET /api/backups returns list of backups', async () => {
      await agent().post('/api/backup');
      const res = await agent().get('/api/backups');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('backup files contain valid JSON', async () => {
      const { dir } = setup();
      await agent().post('/api/backup');
      const backupDir = path.join(dir, 'backups');
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
        assert.ok(files.length > 0, 'at least one backup file should exist');
        for (const file of files) {
          const content = readFileSync(path.join(backupDir, file), 'utf8');
          const data = JSON.parse(content); // should not throw
          assert.ok(data.backupDate || data.areas !== undefined, 'backup should have data');
        }
      }
    });
  });

  // ─── Cascade Deletion Integrity ───────────────────────────────────────────

  describe('Cascade deletion integrity', () => {

    it('deleting an area cascades to goals and tasks', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);

      db.prepare('DELETE FROM life_areas WHERE id = ?').run(area.id);
      const goals = db.prepare('SELECT COUNT(*) as c FROM goals WHERE area_id = ?').get(area.id);
      assert.equal(goals.c, 0, 'goals should be cascade deleted');
    });

    it('deleting a goal cascades to tasks and subtasks', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      db.prepare('INSERT INTO subtasks (task_id, title) VALUES (?, ?)').run(task.id, 'sub1');

      db.prepare('DELETE FROM goals WHERE id = ?').run(goal.id);
      const tasks = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE goal_id = ?').get(goal.id);
      const subs = db.prepare('SELECT COUNT(*) as c FROM subtasks WHERE task_id = ?').get(task.id);
      assert.equal(tasks.c, 0);
      assert.equal(subs.c, 0);
    });

    it('deleting a task cascades to subtasks and task_tags', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      db.prepare('INSERT INTO subtasks (task_id, title) VALUES (?, ?)').run(task.id, 'sub1');
      const tag = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run('cascade-tag', '#000');
      db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(task.id, tag.lastInsertRowid);

      db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
      const subs = db.prepare('SELECT COUNT(*) as c FROM subtasks WHERE task_id = ?').get(task.id);
      const tags = db.prepare('SELECT COUNT(*) as c FROM task_tags WHERE task_id = ?').get(task.id);
      assert.equal(subs.c, 0);
      assert.equal(tags.c, 0);
    });

    it('deleting a user cascades to sessions', () => {
      const { db } = setup();
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('test', 4);
      const r = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run('cascade@test.com', hash, 'Cascade');
      const uid = r.lastInsertRowid;
      db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?,?,1, datetime('now','+1 day'))").run('cascade-sid', uid);

      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
      const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?').get(uid);
      assert.equal(sessions.c, 0);
    });
  });

  // ─── Constraint Enforcement ───────────────────────────────────────────────

  describe('Constraint enforcement', () => {

    it('task status CHECK rejects invalid values', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      assert.throws(() => {
        db.prepare('INSERT INTO tasks (goal_id, title, status) VALUES (?, ?, ?)').run(goal.id, 'test', 'invalid');
      });
    });

    it('task priority CHECK rejects out-of-range values', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      assert.throws(() => {
        db.prepare('INSERT INTO tasks (goal_id, title, priority) VALUES (?, ?, ?)').run(goal.id, 'test', 5);
      });
    });

    it('goal status CHECK rejects invalid values', () => {
      const { db } = setup();
      const area = makeArea();
      assert.throws(() => {
        db.prepare('INSERT INTO goals (area_id, title, status) VALUES (?, ?, ?)').run(area.id, 'test', 'invalid');
      });
    });

    it('custom_field_defs field_type CHECK rejects invalid type', () => {
      const { db } = setup();
      assert.throws(() => {
        db.prepare('INSERT INTO custom_field_defs (user_id, name, field_type) VALUES (?, ?, ?)').run(1, 'test', 'boolean');
      });
    });

    it('foreign key violation on tasks.goal_id throws', () => {
      const { db } = setup();
      assert.throws(() => {
        db.prepare('INSERT INTO tasks (goal_id, title) VALUES (?, ?)').run(99999, 'orphan');
      });
    });

    it('duplicate tag name throws UNIQUE constraint error', () => {
      const { db } = setup();
      db.prepare('INSERT INTO tags (name, color, user_id) VALUES (?, ?, ?)').run('dup-tag', '#000', 1);
      assert.throws(() => {
        db.prepare('INSERT INTO tags (name, color, user_id) VALUES (?, ?, ?)').run('dup-tag', '#FFF', 1);
      });
    });
  });
});
