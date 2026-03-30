const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeTag, linkTag, makeSubtask } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

// Helper: measure async operation timing
async function timed(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

describe('Performance Baseline Tests', () => {

  // ── Setup helper: create bulk test data ──
  async function seedBulkData() {
    const { db } = setup();
    const areas = [];
    for (let i = 0; i < 5; i++) {
      const r = db.prepare('INSERT INTO life_areas (name, icon, color, position, user_id) VALUES (?,?,?,?,1)').run(`Area ${i}`, '📋', '#2563EB', i);
      areas.push(r.lastInsertRowid);
    }
    const goals = [];
    for (let i = 0; i < 10; i++) {
      const areaId = areas[i % 5];
      const r = db.prepare('INSERT INTO goals (area_id, title, position, user_id) VALUES (?,?,?,1)').run(areaId, `Goal ${i}`, i);
      goals.push(r.lastInsertRowid);
    }
    for (let i = 0; i < 100; i++) {
      const goalId = goals[i % 10];
      const status = ['todo', 'doing', 'done'][i % 3];
      const priority = i % 4;
      const dueDate = i % 5 === 0 ? '2026-04-15' : null;
      db.prepare('INSERT INTO tasks (goal_id, title, status, priority, due_date, position, user_id) VALUES (?,?,?,?,?,?,1)')
        .run(goalId, `Task ${i}`, status, priority, dueDate, i);
    }
    return { areas, goals };
  }

  describe('Response time assertions', () => {
    it('GET /api/tasks/all responds in <2s with 100 tasks', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/tasks/all'));
      assert.equal(result.status, 200);
      assert.ok(result.body.length >= 100, `should have ≥100 tasks, got ${result.body.length}`);
      assert.ok(ms < 2000, `should respond in <2s, took ${ms}ms`);
    });

    it('GET /api/stats responds in <1s', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/stats'));
      assert.equal(result.status, 200);
      assert.ok(ms < 1000, `should respond in <1s, took ${ms}ms`);
    });

    it('GET /api/tasks/board responds in <2s', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/tasks/board'));
      assert.equal(result.status, 200);
      assert.ok(ms < 2000, `should respond in <2s, took ${ms}ms`);
    });

    it('GET /api/tasks/my-day responds in <1s', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/tasks/my-day'));
      assert.equal(result.status, 200);
      assert.ok(ms < 1000, `should respond in <1s, took ${ms}ms`);
    });

    it('GET /api/areas responds in <1s with 5 areas', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/areas'));
      assert.equal(result.status, 200);
      assert.ok(result.body.length >= 5);
      assert.ok(ms < 1000, `should respond in <1s, took ${ms}ms`);
    });

    it('GET /api/tags responds in <500ms', async () => {
      const { db } = setup();
      for (let i = 0; i < 50; i++) {
        try { db.prepare('INSERT INTO tags (name, color, user_id) VALUES (?,?,1)').run(`perf-tag-${i}`, '#000'); } catch {}
      }
      const { result, ms } = await timed(() => agent().get('/api/tags'));
      assert.equal(result.status, 200);
      assert.ok(result.body.length >= 50);
      assert.ok(ms < 500, `should respond in <500ms, took ${ms}ms`);
    });
  });

  describe('Bulk operation performance', () => {
    it('creating 50 tasks sequentially in <5s', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const start = Date.now();
      for (let i = 0; i < 50; i++) {
        const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `Bulk task ${i}` });
        assert.equal(res.status, 201);
      }
      const ms = Date.now() - start;
      assert.ok(ms < 5000, `should create 50 tasks in <5s, took ${ms}ms`);
    });

    it('batch status update responds in <2s', async () => {
      await seedBulkData();
      const all = await agent().get('/api/tasks/all');
      const ids = all.body.slice(0, 20).map(t => t.id);
      const { result, ms } = await timed(() =>
        agent().patch('/api/tasks/batch').send({ ids, updates: { status: 'done' } })
      );
      assert.ok([200, 204].includes(result.status), `expected 200/204, got ${result.status}`);
      assert.ok(ms < 2000, `should batch update in <2s, took ${ms}ms`);
    });
  });

  describe('Large dataset handling', () => {
    it('enrichTasks works correctly with 100 tasks', async () => {
      await seedBulkData();
      const { db } = setup();
      // Add tags and subtasks to some tasks
      const tasks = db.prepare('SELECT id FROM tasks LIMIT 20').all();
      try { db.prepare('INSERT INTO tags (name, color, user_id) VALUES (?,?,1)').run('perf-enrich', '#000'); } catch {}
      const tag = db.prepare("SELECT id FROM tags WHERE name='perf-enrich'").get();
      for (const t of tasks) {
        db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(t.id, tag.id);
        db.prepare('INSERT INTO subtasks (task_id, title, done) VALUES (?,?,0)').run(t.id, `Sub of ${t.id}`);
      }
      const { result, ms } = await timed(() => agent().get('/api/tasks/all'));
      assert.equal(result.status, 200);
      // Verify enrichment works
      const enriched = result.body.find(t => t.id === tasks[0].id);
      assert.ok(enriched.tags.length >= 1, 'should have tags');
      assert.ok(enriched.subtask_total >= 1, 'should have subtasks');
      assert.ok(ms < 3000, `enriched 100 tasks in <3s, took ${ms}ms`);
    });
  });

  describe('Search performance', () => {
    it('GET /api/search?q=test responds in <2s', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/search?q=Task'));
      assert.equal(result.status, 200);
      assert.ok(ms < 2000, `search should respond in <2s, took ${ms}ms`);
    });

    it('empty search result returns quickly', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/search?q=zzzznonexistent'));
      assert.equal(result.status, 200);
      assert.ok(ms < 1000, `empty search in <1s, took ${ms}ms`);
    });
  });

  describe('Export performance', () => {
    it('export with 100 tasks responds in <3s', async () => {
      await seedBulkData();
      const { result, ms } = await timed(() => agent().get('/api/export'));
      assert.equal(result.status, 200);
      assert.ok(result.body.tasks || result.body.areas, 'export should have data');
      assert.ok(ms < 3000, `export in <3s, took ${ms}ms`);
    });

    it('export response is valid JSON', async () => {
      await seedBulkData();
      const res = await agent().get('/api/export');
      assert.equal(res.status, 200);
      assert.equal(typeof res.body, 'object');
    });
  });

  describe('Concurrent request handling', () => {
    it('5 parallel GET requests all succeed', async () => {
      await seedBulkData();
      const promises = [
        agent().get('/api/tasks/all'),
        agent().get('/api/areas'),
        agent().get('/api/tags'),
        agent().get('/api/stats'),
        agent().get('/api/tasks/my-day'),
      ];
      const results = await Promise.all(promises);
      for (const res of results) {
        assert.equal(res.status, 200);
      }
    });

    it('mixed read/write operations do not deadlock', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const promises = [];
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          promises.push(agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `Concurrent ${i}` }));
        } else {
          promises.push(agent().get('/api/tasks/all'));
        }
      }
      const results = await Promise.all(promises);
      for (const res of results) {
        assert.ok([200, 201].includes(res.status), `expected 200/201, got ${res.status}`);
      }
    });
  });
});
