const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Stress & Performance Resilience', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Volume tests ──

  it('create 100 tasks: all operations succeed', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 100; i++) {
      const r = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `Task ${i}` });
      assert.equal(r.status, 201);
    }
    const tasks = await agent().get(`/api/goals/${goal.id}/tasks`);
    assert.ok(tasks.body.length >= 100);
  });

  it('create 50 areas: list endpoint responds quickly', async () => {
    const { db } = setup();
    for (let i = 0; i < 50; i++) {
      db.prepare('INSERT INTO life_areas (name, icon, color, position, user_id) VALUES (?,?,?,?,1)')
        .run(`Area ${i}`, '📋', '#FF0000', i);
    }
    const start = Date.now();
    const res = await agent().get('/api/areas');
    const elapsed = Date.now() - start;
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 50);
    assert.ok(elapsed < 2000, `areas list took ${elapsed}ms, should be < 2000ms`);
  });

  it('create 200 tags: tag list responds', async () => {
    const { db } = setup();
    for (let i = 0; i < 200; i++) {
      db.prepare('INSERT INTO tags (name, color, user_id) VALUES (?,?,1)')
        .run(`tag-${i}`, '#' + (100000 + i).toString().slice(0, 6));
    }
    const res = await agent().get('/api/tags');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 200);
  });

  it('100 list items: list loads successfully', async () => {
    const list = await agent().post('/api/lists').send({ name: 'BigList', type: 'checklist' });
    const { db } = setup();
    for (let i = 0; i < 100; i++) {
      db.prepare('INSERT INTO list_items (list_id, title, position) VALUES (?,?,?)')
        .run(list.body.id, `Item ${i}`, i);
    }
    const res = await agent().get(`/api/lists/${list.body.id}/items`);
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 100);
  });

  // ── Payload validation ──

  it('task title at 500 chars accepted', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const title = 'a'.repeat(500);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title });
    assert.equal(res.status, 201);
  });

  it('note with 10000-char content accepted', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const content = 'x'.repeat(10000);
    const res = await agent().post('/api/notes').send({ title: 'Big Note', content, goalId: goal.id });
    // Should succeed (200 or 201)
    assert.ok(res.status < 300, `expected success, got ${res.status}`);
  });

  // ── Cascade performance ──

  it('delete area with 10 goals: cascade completes', async () => {
    const area = makeArea();
    for (let i = 0; i < 10; i++) {
      makeGoal(area.id, { title: `Goal ${i}` });
    }
    const start = Date.now();
    const res = await agent().delete(`/api/areas/${area.id}`);
    const elapsed = Date.now() - start;
    assert.equal(res.status, 200);
    assert.ok(elapsed < 2000, `cascade took ${elapsed}ms`);
  });

  it('delete goal with 50 tasks: cascade completes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const { db } = setup();
    for (let i = 0; i < 50; i++) {
      db.prepare('INSERT INTO tasks (goal_id, title, status, priority, position, user_id) VALUES (?,?,?,?,?,1)')
        .run(goal.id, `Task ${i}`, 'todo', 0, i);
    }
    const start = Date.now();
    const res = await agent().delete(`/api/goals/${goal.id}`);
    const elapsed = Date.now() - start;
    assert.equal(res.status, 200);
    assert.ok(elapsed < 2000, `cascade took ${elapsed}ms`);
  });

  // ── Sequential API calls ──

  it('20 rapid sequential requests all succeed', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 20; i++) {
      const r = await agent().get('/api/areas');
      assert.equal(r.status, 200);
    }
  });

  // ── Concurrent task creates: unique positions ──

  it('concurrent task creates get unique IDs', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `Concurrent ${i}` }));
    }
    const results = await Promise.all(promises);
    const ids = results.map(r => r.body.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 10, 'all tasks should have unique IDs');
  });

  // ── Memory stability ──

  it('100 sequential API calls: no crash', async () => {
    for (let i = 0; i < 100; i++) {
      const r = await agent().get('/api/areas');
      assert.equal(r.status, 200);
    }
  });
});
