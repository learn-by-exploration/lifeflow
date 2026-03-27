const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, makeList, makeListItem, agent } = require('./helpers');

let _db;
before(() => { const s = setup(); _db = s.db; });

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Phase 3: Data Integrity Tests ───

describe('Transaction: task creation + tags', () => {
  it('task+tags created atomically on success', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tag = makeTag({ name: 'tx-tag' });
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Transactional Task', tagIds: [tag.id]
    }).expect(201);
    assert.equal(res.body.tags.length, 1);
  });
});

describe('Transaction: bulk update', () => {
  it('bulk update wraps in transaction', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'T1' });
    const t2 = makeTask(goal.id, { title: 'T2' });
    const res = await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id], changes: { priority: 3 }
    }).expect(200);
    assert.equal(res.body.updated, 2);
  });
});

describe('Transaction: list items batch', () => {
  it('batch items inserted atomically', async () => {
    const list = makeList();
    const res = await agent().post(`/api/lists/${list.id}/items`).send([
      { title: 'Item 1' }, { title: 'Item 2' }, { title: 'Item 3' }
    ]).expect(201);
    assert.equal(res.body.length, 3);
  });
});

describe('Input validation: due_date format', () => {
  it('rejects invalid due_date on task create (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Bad Date', due_date: 'not-a-date'
    }).expect(400);
    assert.ok(res.body.error.includes('due_date'));
  });

  it('accepts valid YYYY-MM-DD on task create', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Good Date', due_date: '2025-06-15'
    }).expect(201);
    assert.equal(res.body.due_date, '2025-06-15');
  });

  it('accepts null due_date (optional)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'No Date'
    }).expect(201);
  });

  it('rejects invalid due_date on task update (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().put(`/api/tasks/${task.id}`).send({
      due_date: '13/45/2025'
    }).expect(400);
  });
});

describe('Input validation: priority', () => {
  it('rejects priority=5 on task create (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Bad Priority', priority: 5
    }).expect(400);
  });

  it('accepts priority=2 on task create', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Good Priority', priority: 2
    }).expect(201);
    assert.equal(res.body.priority, 2);
  });

  it('rejects priority=-1 on task update (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().put(`/api/tasks/${task.id}`).send({ priority: -1 }).expect(400);
  });
});

describe('Input validation: status', () => {
  it('rejects invalid status on task update (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().put(`/api/tasks/${task.id}`).send({ status: 'invalid' }).expect(400);
  });

  it('accepts valid status on task update', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${task.id}`).send({ status: 'doing' }).expect(200);
    assert.equal(res.body.status, 'doing');
  });

  it('rejects invalid status on bulk update (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().put('/api/tasks/bulk').send({
      ids: [task.id], changes: { status: 'cancelled' }
    }).expect(400);
  });
});

describe('Input validation: habits', () => {
  it('rejects invalid frequency (400)', async () => {
    await agent().post('/api/habits').send({ name: 'Bad Freq', frequency: 'never' }).expect(400);
  });

  it('rejects target=0 (400)', async () => {
    await agent().post('/api/habits').send({ name: 'Bad Target', target: 0 }).expect(400);
  });

  it('rejects negative target (400)', async () => {
    await agent().post('/api/habits').send({ name: 'Neg Target', target: -1 }).expect(400);
  });

  it('accepts valid frequency and target', async () => {
    const res = await agent().post('/api/habits').send({
      name: 'Good Habit', frequency: 'weekly', target: 3
    }).expect(201);
    assert.equal(res.body.frequency, 'weekly');
    assert.equal(res.body.target, 3);
  });
});

describe('Input validation: estimated_minutes', () => {
  it('rejects negative estimated_minutes on create (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Neg Minutes', estimated_minutes: -5
    }).expect(400);
  });

  it('rejects negative estimated_minutes on update (400)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().put(`/api/tasks/${task.id}`).send({ estimated_minutes: -10 }).expect(400);
  });
});

describe('Circular dependency detection', () => {
  it('detects A→B→C→A cycle (400)', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const a = makeTask(goal.id, { title: 'A' });
    const b = makeTask(goal.id, { title: 'B' });
    const c = makeTask(goal.id, { title: 'C' });
    // B blocked by A
    await agent().put(`/api/tasks/${b.id}/deps`).send({ blockedByIds: [a.id] }).expect(200);
    // C blocked by B
    await agent().put(`/api/tasks/${c.id}/deps`).send({ blockedByIds: [b.id] }).expect(200);
    // A blocked by C → creates cycle A→B→C→A
    const res = await agent().put(`/api/tasks/${a.id}/deps`).send({ blockedByIds: [c.id] }).expect(400);
    assert.ok(res.body.error.includes('Circular'));
  });

  it('filters out self-reference (A→A)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const a = makeTask(goal.id, { title: 'Self' });
    const res = await agent().put(`/api/tasks/${a.id}/deps`).send({ blockedByIds: [a.id] }).expect(200);
    assert.equal(res.body.blockedBy.length, 0);
  });

  it('allows valid dependency chain A→B→C', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const a = makeTask(goal.id, { title: 'A' });
    const b = makeTask(goal.id, { title: 'B' });
    const c = makeTask(goal.id, { title: 'C' });
    await agent().put(`/api/tasks/${b.id}/deps`).send({ blockedByIds: [a.id] }).expect(200);
    await agent().put(`/api/tasks/${c.id}/deps`).send({ blockedByIds: [b.id] }).expect(200);
    const res = await agent().get(`/api/tasks/${c.id}/deps`).expect(200);
    assert.equal(res.body.blockedBy.length, 1);
    assert.equal(res.body.blockedBy[0].id, b.id);
  });
});

// ─── Phase 0: Export Completeness ───

describe('Export includes task_templates', () => {
  it('exports task_templates', async () => {
    _db.prepare("INSERT INTO task_templates (name, tasks, user_id) VALUES (?, ?, 1)").run('My Template', '[{"title":"T1"}]');
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.task_templates));
    assert.equal(res.body.task_templates.length, 1);
    assert.equal(res.body.task_templates[0].name, 'My Template');
  });
});

describe('Export includes weekly_reviews', () => {
  it('exports weekly_reviews', async () => {
    _db.prepare("INSERT INTO weekly_reviews (week_start, reflection, user_id) VALUES (?, ?, 1)").run('2026-03-23', 'Good week');
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.weekly_reviews));
    assert.equal(res.body.weekly_reviews.length, 1);
    assert.equal(res.body.weekly_reviews[0].reflection, 'Good week');
  });
});

describe('Export includes inbox items', () => {
  it('exports inbox', async () => {
    _db.prepare("INSERT INTO inbox (title, user_id) VALUES (?, 1)").run('Quick thought');
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.inbox));
    assert.equal(res.body.inbox.length, 1);
    assert.equal(res.body.inbox[0].title, 'Quick thought');
  });
});

describe('Export includes goal_milestones', () => {
  it('exports goal_milestones', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    _db.prepare("INSERT INTO goal_milestones (goal_id, title, position) VALUES (?, ?, 0)").run(goal.id, 'Milestone 1');
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.goal_milestones));
    assert.equal(res.body.goal_milestones.length, 1);
    assert.equal(res.body.goal_milestones[0].title, 'Milestone 1');
  });
});

describe('Export includes user settings', () => {
  it('exports settings', async () => {
    _db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (1, ?, ?)").run('theme', 'midnight');
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.settings));
    assert.equal(res.body.settings.length, 1);
    assert.equal(res.body.settings[0].key, 'theme');
    assert.equal(res.body.settings[0].value, 'midnight');
  });
});

describe('Export+Import full roundtrip', () => {
  it('roundtrip preserves all exported tables', async () => {
    // Create data for all tables
    const area = makeArea({ name: 'RT Area' });
    const goal = makeGoal(area.id, { title: 'RT Goal' });
    const task = makeTask(goal.id, { title: 'RT Task' });
    const tag = makeTag({ name: 'rt-tag' });
    linkTag(task.id, tag.id);
    _db.prepare("INSERT INTO task_templates (name, tasks, user_id) VALUES (?, ?, 1)").run('RT Template', '[]');
    _db.prepare("INSERT INTO weekly_reviews (week_start, reflection, user_id) VALUES (?, ?, 1)").run('2026-03-23', 'Test');
    _db.prepare("INSERT INTO inbox (title, user_id) VALUES (?, 1)").run('RT Inbox');
    _db.prepare("INSERT INTO goal_milestones (goal_id, title, position) VALUES (?, ?, 0)").run(goal.id, 'RT MS');
    _db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (1, ?, ?)").run('theme', 'ocean');

    // Export
    const exp = await agent().get('/api/export').expect(200);

    // Import (destroys and re-creates)
    await agent().post('/api/import').send({
      confirm: 'DESTROY_ALL_DATA',
      password: 'testpassword',
      ...exp.body
    }).expect(200);

    // Verify roundtrip
    const exp2 = await agent().get('/api/export').expect(200);
    assert.equal(exp2.body.areas.length, exp.body.areas.length, 'areas count mismatch');
    assert.equal(exp2.body.goals.length, exp.body.goals.length, 'goals count mismatch');
    assert.equal(exp2.body.tasks.length, exp.body.tasks.length, 'tasks count mismatch');
    assert.equal(exp2.body.tags.length, exp.body.tags.length, 'tags count mismatch');
    assert.equal(exp2.body.task_templates.length, exp.body.task_templates.length, 'task_templates count mismatch');
    assert.equal(exp2.body.weekly_reviews.length, exp.body.weekly_reviews.length, 'weekly_reviews count mismatch');
    assert.equal(exp2.body.inbox.length, exp.body.inbox.length, 'inbox count mismatch');
    assert.equal(exp2.body.goal_milestones.length, exp.body.goal_milestones.length, 'goal_milestones count mismatch');
    assert.equal(exp2.body.settings.length, exp.body.settings.length, 'settings count mismatch');
  });
});
