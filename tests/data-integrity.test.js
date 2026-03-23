const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, makeList, makeListItem, agent } = require('./helpers');

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
