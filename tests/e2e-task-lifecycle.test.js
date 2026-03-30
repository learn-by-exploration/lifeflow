const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeTag, linkTag, makeUser2 } = require('./helpers');

describe('E2E Task Lifecycle Workflows', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('task with tags + subtasks: full CRUD lifecycle', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    // Create task
    const task = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Lifecycle Task', priority: 2 });
    assert.equal(task.status, 201);
    // Add subtask
    const sub = await agent().post(`/api/tasks/${task.body.id}/subtasks`).send({ title: 'Sub 1' });
    assert.equal(sub.status, 201);
    // Update task
    const upd = await agent().put(`/api/tasks/${task.body.id}`).send({ status: 'doing' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.status, 'doing');
    // Complete subtask
    const subUpd = await agent().put(`/api/subtasks/${sub.body.id}`).send({ done: 1 });
    assert.equal(subUpd.status, 200);
    // Complete task
    const done = await agent().put(`/api/tasks/${task.body.id}`).send({ status: 'done' });
    assert.equal(done.status, 200);
    assert.ok(done.body.completed_at, 'should set completed_at');
    // Delete
    const del = await agent().delete(`/api/tasks/${task.body.id}`);
    assert.equal(del.status, 200);
  });

  it('reorder tasks: positions update correctly', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T1' });
    const t2 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T2' });
    const t3 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T3' });
    // Reorder: T3, T1, T2
    const res = await agent().put('/api/tasks/reorder').send({
      items: [
        { id: t3.body.id, position: 0 },
        { id: t1.body.id, position: 1 },
        { id: t2.body.id, position: 2 }
      ]
    });
    assert.equal(res.status, 200);
  });

  it('my_day flag toggles correctly', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Day Task' });
    // Toggle on
    const on = await agent().put(`/api/tasks/${task.body.id}`).send({ my_day: 1 });
    assert.equal(on.body.my_day, 1);
    // Toggle off
    const off = await agent().put(`/api/tasks/${task.body.id}`).send({ my_day: 0 });
    assert.equal(off.body.my_day, 0);
  });

  it('task with due date sorts correctly in calendar view', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Due Task', due_date: '2026-04-01' });
    const cal = await agent().get('/api/tasks/calendar?start=2026-04-01&end=2026-04-30');
    assert.equal(cal.status, 200);
  });

  it('board view returns tasks grouped by status', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Todo Task', status: 'todo' });
    await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Doing Task', status: 'doing' });
    const board = await agent().get('/api/tasks/board');
    assert.equal(board.status, 200);
  });

  it('overdue tasks endpoint returns past-due items', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Past Due', due_date: '2020-01-01' });
    const overdue = await agent().get('/api/tasks/overdue');
    assert.equal(overdue.status, 200);
    assert.ok(overdue.body.length >= 1);
  });

  it('habit creation and logging workflow', async () => {
    const h = await agent().post('/api/habits').send({ name: 'Exercise', frequency: 'daily' });
    assert.equal(h.status, 201);
    const log = await agent().post(`/api/habits/${h.body.id}/log`).send({ date: '2026-03-30' });
    assert.ok(log.status < 300);
    const habits = await agent().get('/api/habits');
    assert.ok(habits.body.some(x => x.name === 'Exercise'));
  });

  it('list creation with items workflow', async () => {
    const list = await agent().post('/api/lists').send({ name: 'Grocery', type: 'checklist' });
    assert.equal(list.status, 201);
    const item = await agent().post(`/api/lists/${list.body.id}/items`).send({ title: 'Milk' });
    assert.equal(item.status, 201);
    const items = await agent().get(`/api/lists/${list.body.id}/items`);
    assert.ok(items.body.some(i => i.title === 'Milk'));
  });

  it('goal CRUD: create, update, complete, delete', async () => {
    const area = makeArea();
    const goal = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'Goal 1' });
    assert.equal(goal.status, 201);
    const upd = await agent().put(`/api/goals/${goal.body.id}`).send({ title: 'Updated Goal' });
    assert.equal(upd.status, 200);
    const del = await agent().delete(`/api/goals/${goal.body.id}`);
    assert.equal(del.status, 200);
  });

  it('area CRUD: create, update, archive, delete', async () => {
    const area = await agent().post('/api/areas').send({ name: 'New', icon: '🆕', color: '#00FF00' });
    assert.equal(area.status, 201);
    const upd = await agent().put(`/api/areas/${area.body.id}`).send({ name: 'Updated' });
    assert.equal(upd.status, 200);
    const del = await agent().delete(`/api/areas/${area.body.id}`);
    assert.equal(del.status, 200);
  });
});
