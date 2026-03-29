const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, agent } = require('./helpers');

// ─── REMINDERS ───
describe('Reminders API', () => {
  beforeEach(() => cleanDb());

  it('returns empty when no tasks have due dates', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    makeTask(g.id, { title: 'No due date' });
    const res = await agent().get('/api/reminders').expect(200);
    assert.equal(res.body.total, 0);
    assert.deepEqual(res.body.overdue, []);
    assert.deepEqual(res.body.today, []);
    assert.deepEqual(res.body.upcoming, []);
  });

  it('returns overdue tasks', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Past due', due_date: '2020-01-01' });
    const res = await agent().get('/api/reminders').expect(200);
    assert.equal(res.body.overdue.length, 1);
    assert.equal(res.body.overdue[0].title, 'Past due');
    assert.equal(res.body.total, 1);
  });

  it('returns today tasks', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const today = new Date().toISOString().slice(0, 10);
    makeTask(g.id, { title: 'Due today', due_date: today });
    const res = await agent().get('/api/reminders').expect(200);
    assert.equal(res.body.today.length, 1);
    assert.equal(res.body.today[0].title, 'Due today');
  });

  it('returns upcoming tasks within 3 days', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const d = new Date(); d.setDate(d.getDate() + 2);
    makeTask(g.id, { title: 'Soon', due_date: d.toISOString().slice(0, 10) });
    const res = await agent().get('/api/reminders').expect(200);
    assert.equal(res.body.upcoming.length, 1);
  });

  it('excludes done tasks', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Done overdue', due_date: '2020-01-01', status: 'done' });
    const res = await agent().get('/api/reminders').expect(200);
    assert.equal(res.body.total, 0);
  });
});

// ─── DEPENDENCIES ───
describe('Dependencies API', () => {
  beforeEach(() => cleanDb());

  it('returns empty deps for task with none', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const res = await agent().get(`/api/tasks/${t.id}/deps`).expect(200);
    assert.deepEqual(res.body.blockedBy, []);
    assert.deepEqual(res.body.blocking, []);
  });

  it('sets and retrieves blocked_by deps', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t1 = makeTask(g.id, { title: 'Blocker' });
    const t2 = makeTask(g.id, { title: 'Blocked' });
    await agent().put(`/api/tasks/${t2.id}/deps`).send({ blockedByIds: [t1.id] }).expect(200);
    const res = await agent().get(`/api/tasks/${t2.id}/deps`).expect(200);
    assert.equal(res.body.blockedBy.length, 1);
    assert.equal(res.body.blockedBy[0].id, t1.id);
  });

  it('shows blocking from the other side', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t1 = makeTask(g.id, { title: 'Blocker' });
    const t2 = makeTask(g.id, { title: 'Blocked' });
    await agent().put(`/api/tasks/${t2.id}/deps`).send({ blockedByIds: [t1.id] }).expect(200);
    const res = await agent().get(`/api/tasks/${t1.id}/deps`).expect(200);
    assert.equal(res.body.blocking.length, 1);
    assert.equal(res.body.blocking[0].id, t2.id);
  });

  it('silently ignores self-dependency', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const res = await agent().put(`/api/tasks/${t.id}/deps`).send({ blockedByIds: [t.id] }).expect(200);
    assert.deepEqual(res.body.blockedBy, []);
  });

  it('can update deps (replaces old)', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t1 = makeTask(g.id, { title: 'A' });
    const t2 = makeTask(g.id, { title: 'B' });
    const t3 = makeTask(g.id, { title: 'C' });
    await agent().put(`/api/tasks/${t3.id}/deps`).send({ blockedByIds: [t1.id] }).expect(200);
    await agent().put(`/api/tasks/${t3.id}/deps`).send({ blockedByIds: [t2.id] }).expect(200);
    const res = await agent().get(`/api/tasks/${t3.id}/deps`).expect(200);
    assert.equal(res.body.blockedBy.length, 1);
    assert.equal(res.body.blockedBy[0].id, t2.id);
  });

  it('enriches tasks with blocked_by array', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t1 = makeTask(g.id, { title: 'Blocker' });
    const t2 = makeTask(g.id, { title: 'Blocked' });
    await agent().put(`/api/tasks/${t2.id}/deps`).send({ blockedByIds: [t1.id] }).expect(200);
    const res = await agent().get(`/api/goals/${g.id}/tasks`).expect(200);
    const blocked = res.body.find(t => t.title === 'Blocked');
    assert.ok(blocked.blocked_by);
    assert.equal(blocked.blocked_by.length, 1);
  });
});

// ─── SUBTASK REORDER ───
describe('Subtask Reorder API', () => {
  beforeEach(() => cleanDb());

  it('reorders subtasks by position', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const s1 = makeSubtask(t.id, { title: 'First', position: 0 });
    const s2 = makeSubtask(t.id, { title: 'Second', position: 1 });
    const s3 = makeSubtask(t.id, { title: 'Third', position: 2 });
    await agent().put('/api/subtasks/reorder').send({
      items: [{ id: s3.id, position: 0 }, { id: s1.id, position: 1 }, { id: s2.id, position: 2 }]
    }).expect(200);
    const res = await agent().get(`/api/tasks/${t.id}/subtasks`).expect(200);
    assert.equal(res.body[0].title, 'Third');
    assert.equal(res.body[1].title, 'First');
    assert.equal(res.body[2].title, 'Second');
  });

  it('returns 400 without items', async () => {
    await agent().put('/api/subtasks/reorder').send({}).expect(400);
  });
});

// ─── ENHANCED SEARCH ───
describe('Enhanced Search', () => {
  beforeEach(() => cleanDb());

  it('filters by area_id', async () => {
    const a1 = makeArea({ name: 'Area1' }); const a2 = makeArea({ name: 'Area2' });
    const g1 = makeGoal(a1.id); const g2 = makeGoal(a2.id);
    makeTask(g1.id, { title: 'TaskA' }); makeTask(g2.id, { title: 'TaskB' });
    const res = await agent().get(`/api/tasks/search?q=Task&area_id=${a1.id}`).expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'TaskA');
  });

  it('filters by goal_id', async () => {
    const a = makeArea(); const g1 = makeGoal(a.id, { title: 'G1' }); const g2 = makeGoal(a.id, { title: 'G2' });
    makeTask(g1.id, { title: 'In G1' }); makeTask(g2.id, { title: 'In G2' });
    const res = await agent().get(`/api/tasks/search?q=In&goal_id=${g2.id}`).expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'In G2');
  });

  it('filters by status', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Open task', status: 'todo' });
    makeTask(g.id, { title: 'Done task', status: 'done' });
    const res = await agent().get('/api/tasks/search?q=task&status=done').expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Done task');
  });

  it('combines multiple filters', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Match', status: 'done' });
    makeTask(g.id, { title: 'Match', status: 'todo' });
    const res = await agent().get(`/api/tasks/search?q=Match&status=todo&goal_id=${g.id}`).expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].status, 'todo');
  });

  it('works with filters only (no q)', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Alpha', status: 'done' });
    makeTask(g.id, { title: 'Beta', status: 'todo' });
    const res = await agent().get(`/api/tasks/search?status=done`).expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Alpha');
  });
});

// ─── RECURRING ENHANCEMENTS ───
describe('Recurring Enhancements', () => {
  beforeEach(() => cleanDb());

  it('accepts yearly recurring', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Annual', due_date: '2024-06-15', recurring: 'yearly' });
    await agent().put(`/api/tasks/${t.id}`, ).send({ status: 'done' }).expect(200);
    const tasks = await agent().get(`/api/goals/${g.id}/tasks`).expect(200);
    const next = tasks.body.find(x => x.status === 'todo' && x.title === 'Annual');
    assert.ok(next);
    assert.equal(next.due_date, '2025-06-15');
  });

  it('accepts weekdays recurring', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    // Use a Monday so the next weekday is Tuesday
    const t = makeTask(g.id, { title: 'Weekday task', due_date: '2025-01-06', recurring: 'weekdays' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' }).expect(200);
    const tasks = await agent().get(`/api/goals/${g.id}/tasks`).expect(200);
    const next = tasks.body.find(x => x.status === 'todo' && x.title === 'Weekday task');
    assert.ok(next);
    assert.equal(next.due_date, '2025-01-07'); // Tuesday
  });

  it('accepts every-N-days recurring', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Every 5 days', due_date: '2025-01-01', recurring: 'every-5-days' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' }).expect(200);
    const tasks = await agent().get(`/api/goals/${g.id}/tasks`).expect(200);
    const next = tasks.body.find(x => x.status === 'todo' && x.title === 'Every 5 days');
    assert.ok(next);
    assert.equal(next.due_date, '2025-01-06');
  });

  it('accepts every-N-weeks recurring', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Biweekly', due_date: '2025-01-01', recurring: 'every-2-weeks' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' }).expect(200);
    const tasks = await agent().get(`/api/goals/${g.id}/tasks`).expect(200);
    const next = tasks.body.find(x => x.status === 'todo' && x.title === 'Biweekly');
    assert.ok(next);
    assert.equal(next.due_date, '2025-01-15');
  });
});

after(() => teardown());
