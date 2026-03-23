const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, makeSubtask, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Phase 2: Performance Tests ───

describe('GET /api/habits — batched queries', () => {
  it('returns correct todayCount for habit with logs', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position) VALUES (?,?,?,?,?,?)').run('Drink Water', '💧', '#22C55E', 'daily', 3, 0);
    const habit = db.prepare('SELECT id FROM habits').get();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO habit_logs (habit_id,date,count) VALUES (?,?,?)').run(habit.id, today, 2);

    const res = await agent().get('/api/habits').expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].todayCount, 2);
    assert.equal(res.body[0].completed, false); // 2 < 3
  });

  it('returns todayCount=0 for habit with no logs', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position) VALUES (?,?,?,?,?,?)').run('Exercise', '🏃', '#22C55E', 'daily', 1, 0);

    const res = await agent().get('/api/habits').expect(200);
    assert.equal(res.body[0].todayCount, 0);
    assert.equal(res.body[0].completed, false);
    assert.equal(res.body[0].streak, 0);
  });

  it('returns correct streak for consecutive days', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position) VALUES (?,?,?,?,?,?)').run('Read', '📚', '#22C55E', 'daily', 1, 0);
    const habit = db.prepare('SELECT id FROM habits').get();
    const today = new Date();
    // Log today and 2 previous days
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      db.prepare('INSERT INTO habit_logs (habit_id,date,count) VALUES (?,?,?)').run(habit.id, ds, 1);
    }

    const res = await agent().get('/api/habits').expect(200);
    assert.equal(res.body[0].streak, 3);
  });

  it('returns streak=0 when yesterday not completed', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position) VALUES (?,?,?,?,?,?)').run('Meditate', '🧘', '#22C55E', 'daily', 1, 0);
    const habit = db.prepare('SELECT id FROM habits').get();
    // Only log 2 days ago (gap yesterday)
    const d = new Date();
    d.setDate(d.getDate() - 2);
    db.prepare('INSERT INTO habit_logs (habit_id,date,count) VALUES (?,?,?)').run(habit.id, d.toISOString().slice(0, 10), 1);

    const res = await agent().get('/api/habits').expect(200);
    assert.equal(res.body[0].streak, 0);
  });

  it('returns empty array when no habits exist', async () => {
    const res = await agent().get('/api/habits').expect(200);
    assert.deepEqual(res.body, []);
  });
});

describe('enrichTask — delegates to enrichTasks batch', () => {
  it('single task enriched correctly with tags, subtasks, deps', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'With Extras' });
    const tag = makeTag({ name: 'enrichtest' });
    linkTag(task.id, tag.id);
    makeSubtask(task.id, { title: 'Sub1', done: 0 });
    makeSubtask(task.id, { title: 'Sub2', done: 1 });

    const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
    assert.equal(res.body.tags.length, 1);
    assert.equal(res.body.tags[0].name, 'enrichtest');
    assert.equal(res.body.subtasks.length, 2);
    assert.equal(res.body.subtask_done, 1);
    assert.equal(res.body.subtask_total, 2);
  });

  it('single task enriched identically to batch', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Batch Compare' });
    const tag = makeTag({ name: 'batchtest' });
    linkTag(task.id, tag.id);

    // Single
    const single = await agent().get(`/api/tasks/${task.id}`).expect(200);
    // Batch (via /api/tasks/all)
    const all = await agent().get('/api/tasks/all').expect(200);
    const found = all.body.find(t => t.id === task.id);

    assert.deepEqual(single.body.tags.map(t => t.name), found.tags.map(t => t.name));
    assert.equal(single.body.subtask_total, found.subtask_total);
  });
});

describe('getNextPosition helper', () => {
  it('returns 0 for empty table (areas)', async () => {
    const res = await agent().post('/api/areas').send({ name: 'First Area' }).expect(201);
    assert.equal(res.body.position, 0);
  });

  it('returns N+1 for populated table', async () => {
    await agent().post('/api/areas').send({ name: 'Area 0' });
    const res = await agent().post('/api/areas').send({ name: 'Area 1' }).expect(201);
    assert.equal(res.body.position, 1);
  });

  it('scoped correctly per goal_id for tasks', async () => {
    const area = makeArea();
    const g1 = makeGoal(area.id, { title: 'Goal A' });
    const g2 = makeGoal(area.id, { title: 'Goal B' });
    makeTask(g1.id, { position: 0 });
    makeTask(g1.id, { position: 1 });
    // g2 has no tasks, so next position should be 0
    const res = await agent().post(`/api/goals/${g2.id}/tasks`).send({ title: 'First in G2' }).expect(201);
    assert.equal(res.body.position, 0);
  });
});
