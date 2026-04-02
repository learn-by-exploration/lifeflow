const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, agent } = require('./helpers');
const path = require('path');
const fs = require('fs');
const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');

let _db, _dir;
before(() => { const s = setup(); _db = s.db; _dir = s.dir; });
beforeEach(() => cleanDb());
after(() => teardown());

describe('Data Integrity Safety Guards', () => {

  describe('WAL checkpoint on DB open', () => {
    it('database uses WAL journal mode', () => {
      const mode = _db.pragma('journal_mode', { simple: true });
      assert.equal(mode, 'wal');
    });

    it('foreign keys are enabled', () => {
      const fk = _db.pragma('foreign_keys', { simple: true });
      assert.equal(fk, 1);
    });

    it('WAL checkpoint can be run without error', () => {
      assert.doesNotThrow(() => {
        _db.pragma('wal_checkpoint(TRUNCATE)');
      });
    });
  });

  describe('Seeding safety — never re-seed over existing data', () => {
    it('does not re-seed areas when tasks exist but areas are empty (WAL corruption scenario)', () => {
      // Use a fresh DB directory to test seeding from scratch
      const freshDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-seed-test-'));
      const initDatabase = require('../src/db/index');

      // First init — seeds default areas, tags, templates
      const first = initDatabase(freshDir);
      const firstDb = first.db;

      const areaId = firstDb.prepare('SELECT id FROM life_areas LIMIT 1').get()?.id;
      assert.ok(areaId, 'Seeded areas should exist');

      // Simulate real user data: add a goal and task manually (seeding doesn't create goals)
      firstDb.prepare("INSERT INTO goals (area_id, title, color, status, position, user_id) VALUES (?, 'User Goal', '#6C63FF', 'active', 0, 1)").run(areaId);
      const goalId = firstDb.prepare('SELECT id FROM goals LIMIT 1').get().id;
      firstDb.prepare("INSERT INTO tasks (goal_id, title, status, priority, position, user_id) VALUES (?, 'Real user task', 'todo', 0, 0, 1)").run(goalId);

      // Simulate WAL corruption: areas get wiped (CASCADE deletes goals/tasks too)
      firstDb.prepare('DELETE FROM life_areas').run();
      const areaCount = firstDb.prepare('SELECT COUNT(*) as c FROM life_areas').get().c;
      assert.equal(areaCount, 0, 'Areas should be empty after simulated corruption');

      firstDb.close();

      // Re-initialize (simulating server restart after corruption)
      const second = initDatabase(freshDir);
      const secondDb = second.db;

      // _seed_completed marker should prevent re-seeding regardless
      const marker = secondDb.prepare("SELECT value FROM settings WHERE key='_seed_completed' AND user_id=0").get();
      assert.ok(marker, '_seed_completed marker should prevent re-seeding');

      // Default areas should NOT be re-created
      const postAreas = secondDb.prepare("SELECT * FROM life_areas WHERE name IN ('Health', 'Career', 'Finance')").all();
      assert.equal(postAreas.length, 0, 'Default areas should NOT be re-seeded when _seed_completed marker exists');

      secondDb.close();
      rmSync(freshDir, { recursive: true, force: true });
    });

    it('_seed_completed marker prevents re-seeding even with empty tables', () => {
      const freshDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-seed-marker-'));
      const initDatabase = require('../src/db/index');

      // First init — seeds everything
      const first = initDatabase(freshDir);
      first.db.close();

      // Wipe all content but keep the marker
      const Database = require('better-sqlite3');
      const rawDb = new Database(path.join(freshDir, 'lifeflow.db'));
      rawDb.exec('DELETE FROM tasks');
      rawDb.exec('DELETE FROM goals');
      rawDb.exec('DELETE FROM life_areas');
      rawDb.exec('DELETE FROM tags');
      // Keep settings (including _seed_completed marker)
      const marker = rawDb.prepare("SELECT value FROM settings WHERE key='_seed_completed' AND user_id=0").get();
      assert.ok(marker, 'Marker should exist before re-init');
      rawDb.close();

      // Re-initialize
      const second = initDatabase(freshDir);

      // No default areas should be seeded
      const areas = second.db.prepare('SELECT COUNT(*) as c FROM life_areas').get().c;
      assert.equal(areas, 0, 'No default areas should be seeded when marker exists');

      second.db.close();
      rmSync(freshDir, { recursive: true, force: true });
    });

    it('seeds default data on truly fresh database', () => {
      const freshDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-fresh-'));
      const initDatabase = require('../src/db/index');

      const fresh = initDatabase(freshDir);

      const areas = fresh.db.prepare('SELECT COUNT(*) as c FROM life_areas').get().c;
      const tags = fresh.db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
      assert.ok(areas > 0, 'Fresh DB should get default areas');
      assert.ok(tags > 0, 'Fresh DB should get default tags');

      // Marker should be set
      const marker = fresh.db.prepare("SELECT value FROM settings WHERE key='_seed_completed' AND user_id=0").get();
      assert.ok(marker, '_seed_completed marker should be set after seeding');

      fresh.db.close();
      rmSync(freshDir, { recursive: true, force: true });
    });

    it('auto-restores from backup when DB is empty after previous use', () => {
      const freshDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-autorestore-'));
      const initDatabase = require('../src/db/index');

      // First init — seeds data + sets marker
      const first = initDatabase(freshDir);
      const firstDb = first.db;

      // Simulate real user adding data
      const areaId = firstDb.prepare('SELECT id FROM life_areas LIMIT 1').get().id;
      firstDb.prepare("INSERT INTO goals (area_id,title,color,status,position,user_id) VALUES (?,'User Goal','#6C63FF','active',0,1)").run(areaId);
      const goalId = firstDb.prepare('SELECT id FROM goals LIMIT 1').get().id;
      firstDb.prepare("INSERT INTO tasks (goal_id,title,status,priority,position,user_id) VALUES (?,'Important task','todo',2,0,1)").run(goalId);

      // Create a backup (simulating what the scheduler does)
      const backupDir = path.join(freshDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const areas = firstDb.prepare('SELECT * FROM life_areas').all();
      const goals = firstDb.prepare('SELECT * FROM goals').all();
      const tasks = firstDb.prepare('SELECT * FROM tasks').all();
      const tags = firstDb.prepare('SELECT * FROM tags').all();
      fs.writeFileSync(path.join(backupDir, 'lifeflow-backup-2026-01-01.json'),
        JSON.stringify({ backupDate: new Date().toISOString(), areas, goals, tasks, tags }));

      // Simulate total data loss (but marker and user survive)
      firstDb.exec('DELETE FROM tasks');
      firstDb.exec('DELETE FROM goals');
      firstDb.exec('DELETE FROM life_areas');
      firstDb.exec('DELETE FROM tags');
      firstDb.close();

      // Re-initialize — should auto-restore
      const second = initDatabase(freshDir);
      const restoredAreas = second.db.prepare('SELECT COUNT(*) as c FROM life_areas').get().c;
      const restoredTasks = second.db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
      assert.ok(restoredAreas > 0, 'Areas should be auto-restored from backup');
      assert.ok(restoredTasks > 0, 'Tasks should be auto-restored from backup');
      const taskTitle = second.db.prepare("SELECT title FROM tasks WHERE title='Important task'").get();
      assert.ok(taskTitle, 'Specific user task should be restored');

      second.db.close();
      rmSync(freshDir, { recursive: true, force: true });
    });

    it('does NOT auto-restore on fresh install (no marker)', () => {
      const freshDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-norestore-'));

      // Create a fake backup BEFORE first init
      const backupDir = path.join(freshDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'lifeflow-backup-2026-01-01.json'),
        JSON.stringify({ backupDate: new Date().toISOString(),
          areas: [{ id: 1, name: 'Fake', icon: '📁', color: '#FF0000', position: 0 }],
          goals: [{ id: 1, area_id: 1, title: 'Fake Goal' }],
          tasks: [{ goal_id: 1, title: 'Fake Task', status: 'todo' }],
          tags: [] }));

      const initDatabase = require('../src/db/index');
      const fresh = initDatabase(freshDir);

      // Should have default seeded data, not the fake backup
      const fakeTask = fresh.db.prepare("SELECT title FROM tasks WHERE title='Fake Task'").get();
      assert.equal(fakeTask, undefined, 'Should NOT restore from backup on fresh install');

      fresh.db.close();
      rmSync(freshDir, { recursive: true, force: true });
    });
  });

  describe('Backup safety — never overwrite good backups with empty data', () => {
    it('POST /api/backup returns null file when DB is empty', async () => {
      // cleanDb() already wiped all data — DB is empty
      const res = await agent().post('/api/backup').expect(200);
      assert.equal(res.body.file, null, 'Backup should be skipped when DB is empty');
    });

    it('POST /api/backup creates a backup when data exists', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);

      const res = await agent().post('/api/backup').expect(200);
      assert.ok(res.body.file, 'Backup file should be created');

      // Verify backup file has content
      const backupPath = path.join(_dir, 'backups', res.body.file);
      const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      assert.ok(data.areas.length > 0, 'Backup should have areas');
      assert.ok(data.tasks.length > 0, 'Backup should have tasks');
    });

    it('GET /api/backups lists available backups', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);
      await agent().post('/api/backup').expect(200);

      const res = await agent().get('/api/backups').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 1);
      assert.ok(res.body[0].name);
      assert.ok(res.body[0].size > 0);
    });
  });

  describe('Health endpoint verifies DB integrity', () => {
    it('GET /health returns WAL and data status', async () => {
      const res = await agent().get('/health').expect(200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.dbOk, true);
      assert.equal(res.body.walOk, true);
      assert.equal(res.body.dataOk, true);
    });
  });

  describe('Data watermark', () => {
    it('POST /api/backup saves data watermark in settings', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);
      makeTask(goal.id);

      await agent().post('/api/backup').expect(200);

      const wm = _db.prepare("SELECT value FROM settings WHERE key='_data_watermark' AND user_id=0").get();
      assert.ok(wm, 'Watermark should exist after backup');
      const parsed = JSON.parse(wm.value);
      assert.ok(parsed.areas >= 1, 'Watermark should record area count');
      assert.ok(parsed.tasks >= 2, 'Watermark should record task count');
      assert.ok(parsed.at, 'Watermark should record timestamp');
    });

    it('watermark triggers restore when tasks drop to zero', () => {
      const freshDir = mkdtempSync(path.join(tmpdir(), 'lifeflow-watermark-'));
      const initDatabase = require('../src/db/index');

      // First init + add data
      const first = initDatabase(freshDir);
      const firstDb = first.db;
      const areaId = firstDb.prepare('SELECT id FROM life_areas LIMIT 1').get().id;
      firstDb.prepare("INSERT INTO goals (area_id,title,color,status,position,user_id) VALUES (?,'G','#6C63FF','active',0,1)").run(areaId);
      const goalId = firstDb.prepare('SELECT id FROM goals LIMIT 1').get().id;
      firstDb.prepare("INSERT INTO tasks (goal_id,title,status,priority,position,user_id) VALUES (?,'WM Task','todo',0,0,1)").run(goalId);

      // Set watermark (simulating what backup does)
      firstDb.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_data_watermark', ?)").run(
        JSON.stringify({ areas: 6, goals: 1, tasks: 1, tags: 5, at: new Date().toISOString() })
      );

      // Create backup
      const backupDir = path.join(freshDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const areas = firstDb.prepare('SELECT * FROM life_areas').all();
      const goals = firstDb.prepare('SELECT * FROM goals').all();
      const tasks = firstDb.prepare('SELECT * FROM tasks').all();
      const tags = firstDb.prepare('SELECT * FROM tags').all();
      fs.writeFileSync(path.join(backupDir, 'lifeflow-backup-2026-01-01.json'),
        JSON.stringify({ backupDate: new Date().toISOString(), areas, goals, tasks, tags }));

      // Wipe tasks (simulate partial data loss)
      firstDb.exec('DELETE FROM tasks');
      firstDb.exec('DELETE FROM goals');
      firstDb.exec('DELETE FROM life_areas');
      firstDb.close();

      // Re-init should detect watermark mismatch and restore
      const second = initDatabase(freshDir);
      const restoredTasks = second.db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
      assert.ok(restoredTasks > 0, 'Tasks should be auto-restored when watermark detects loss');

      second.db.close();
      rmSync(freshDir, { recursive: true, force: true });
    });
  });

  describe('Data import safety', () => {
    it('POST /api/import requires password confirmation for destructive operation', async () => {
      const res = await agent().post('/api/import')
        .send({
          areas: [{ id: 1, name: 'Test' }],
          goals: [{ id: 1, title: 'Goal', area_id: 1 }],
          tasks: [{ title: 'Task', goal_id: 1 }],
          tags: []
        })
        .expect(403);
      assert.ok(res.body.error.includes('Password confirmation required'),
        'Import should require password confirmation as a destructive action');
    });
  });

  describe('Docker deployment safety', () => {
    it('docker-compose.yml does not use read_only: true', () => {
      const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
      assert.ok(!compose.includes('read_only: true'), 'read_only: true prevents WAL checkpoint and causes data loss');
    });

    it('docker-compose.yml has stop_grace_period for clean shutdown', () => {
      const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
      assert.ok(compose.includes('stop_grace_period'), 'stop_grace_period required for WAL checkpoint during shutdown');
    });

    it('docker-compose.yml mounts data volume', () => {
      const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
      assert.ok(compose.includes('./data:/app/data'), 'Data directory must be bind-mounted');
    });

    it('Dockerfile sets DB_DIR to /app/data', () => {
      const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
      assert.ok(dockerfile.includes('DB_DIR=/app/data'), 'DB_DIR must point to the mounted volume');
    });
  });

  describe('Graceful shutdown WAL safety', () => {
    it('server.js contains WAL checkpoint in shutdown handler', () => {
      const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
      assert.ok(serverSrc.includes("wal_checkpoint(TRUNCATE)"), 'Shutdown must force WAL checkpoint');
    });

    it('db/index.js contains WAL checkpoint on open', () => {
      const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'index.js'), 'utf8');
      assert.ok(dbSrc.includes("wal_checkpoint(TRUNCATE)"), 'DB init must run WAL checkpoint');
    });
  });

  describe('Seeding logic has data presence guard', () => {
    it('db/index.js checks tasks table before seeding areas', () => {
      const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'index.js'), 'utf8');
      assert.ok(dbSrc.includes('hasExistingData'), 'Seeding must check for existing task/goal data');
      assert.ok(dbSrc.includes('_seed_completed'), 'Seeding must use a completion marker');
    });
  });

  describe('Backup retention policy', () => {
    it('keeps at least 14 backups (not 7)', () => {
      const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'data.js'), 'utf8');
      assert.ok(dataSrc.includes('files.length > 14'), 'Backup rotation should keep at least 14 files');
    });
  });
});
