const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Input Validation Comprehensive', () => {
  let area, goal;

  before(() => setup());
  beforeEach(() => {
    cleanDb();
    area = makeArea();
    goal = makeGoal(area.id);
  });
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════
  // Task Title Validation
  // ═══════════════════════════════════════════════════════════

  it('Task title empty string → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('Task title whitespace-only → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: '   ' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('Task title > 500 chars → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'x'.repeat(501) });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too long|max 500/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Task Note Validation
  // ═══════════════════════════════════════════════════════════

  it('Task note > 5000 chars → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Valid', note: 'n'.repeat(5001) });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too long|max 5000/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Task Priority Validation
  // ═══════════════════════════════════════════════════════════

  it('Task priority not 0-3 → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', priority: 5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /priority/i);
  });

  it('Task priority floating point → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', priority: 1.5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /priority/i);
  });

  it('Task priority negative → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', priority: -1 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /priority/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Task Status Validation
  // ═══════════════════════════════════════════════════════════

  it('Task status not todo/doing/done → 400', async () => {
    const task = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${task.id}`).send({ status: 'invalid' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /status/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Task Due Date Validation
  // ═══════════════════════════════════════════════════════════

  it('Task due_date invalid format → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', due_date: '2024/01/01' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /due_date/i);
  });

  it('Task due_date not a real date (2024-13-01) → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', due_date: '2024-13-01' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /due_date|invalid.*date/i);
  });

  it('Task due_date impossible day (2024-02-30) → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', due_date: '2024-02-30' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /due_date|invalid.*date/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Task Recurring Validation
  // ═══════════════════════════════════════════════════════════

  it('Task recurring invalid JSON structure → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', recurring: { type: 'bogus', freq: 999 } });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ═══════════════════════════════════════════════════════════
  // Time Block Validation
  // ═══════════════════════════════════════════════════════════

  it('time_block_start invalid format → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', time_block_start: '25:00' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /time_block_start|time/i);
  });

  it('time_block_end invalid format → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', time_block_end: 'not-a-time' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /time_block_end|time/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Estimated Minutes Validation
  // ═══════════════════════════════════════════════════════════

  it('estimated_minutes negative → 400', async () => {
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', estimated_minutes: -10 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /estimated_minutes/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Focus Session Validation
  // ═══════════════════════════════════════════════════════════

  it('Focus session duration_sec negative → 400', async () => {
    const task = makeTask(goal.id);
    const res = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: -100 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /duration_sec|non-negative/i);
  });

  it('Focus session duration_sec zero → accepted (timer-start pattern)', async () => {
    const task = makeTask(goal.id);
    const res = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 0 });
    assert.equal(res.status, 201);
    assert.equal(res.body.duration_sec, 0);
  });

  // ═══════════════════════════════════════════════════════════
  // Area Validation
  // ═══════════════════════════════════════════════════════════

  it('Area name empty → 400', async () => {
    const res = await agent().post('/api/areas').send({ name: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('Area name > 100 chars → 400', async () => {
    const res = await agent().post('/api/areas').send({ name: 'x'.repeat(101) });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ═══════════════════════════════════════════════════════════
  // Goal Validation
  // ═══════════════════════════════════════════════════════════

  it('Goal title empty → 400', async () => {
    const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('Goal title > 200 chars → 400', async () => {
    const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'y'.repeat(201) });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too long|max 200/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Tag Validation
  // ═══════════════════════════════════════════════════════════

  it('Tag name empty → 400', async () => {
    const res = await agent().post('/api/tags').send({ name: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('Tag name > 50 chars → 400', async () => {
    const res = await agent().post('/api/tags').send({ name: 'z'.repeat(51) });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ═══════════════════════════════════════════════════════════
  // List Validation
  // ═══════════════════════════════════════════════════════════

  it('List name empty → 400', async () => {
    const res = await agent().post('/api/lists').send({ name: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ═══════════════════════════════════════════════════════════
  // Habit Validation
  // ═══════════════════════════════════════════════════════════

  it('Habit name empty → 400', async () => {
    const res = await agent().post('/api/habits').send({ name: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ═══════════════════════════════════════════════════════════
  // Note Validation
  // ═══════════════════════════════════════════════════════════

  it('Note title empty → 400', async () => {
    const res = await agent().post('/api/notes').send({ title: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ═══════════════════════════════════════════════════════════
  // ID Parameter Validation
  // ═══════════════════════════════════════════════════════════

  it('ID parameter: non-integer string → 400', async () => {
    const res = await agent().get('/api/tasks/abc');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid.*id/i);
  });

  it('ID parameter: negative → 400', async () => {
    const res = await agent().get('/api/tasks/-1');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid.*id/i);
  });

  it('ID parameter: float → 400', async () => {
    const res = await agent().get('/api/tasks/1.5');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid.*id/i);
  });

  it('ID parameter: zero → 400', async () => {
    const res = await agent().get('/api/tasks/0');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid.*id/i);
  });

  // ═══════════════════════════════════════════════════════════
  // Body Size Limit
  // ═══════════════════════════════════════════════════════════

  it('Request with very large JSON body → 413', async () => {
    // The server has a 1mb limit on JSON bodies
    const largeBody = { title: 'x'.repeat(1024 * 1024 + 1) };
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send(largeBody);
    assert.ok([413, 400].includes(res.status), `Expected 413 or 400, got ${res.status}`);
  });
});
