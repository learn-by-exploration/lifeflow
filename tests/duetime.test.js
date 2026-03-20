const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, agent } = require('./helpers');

describe('Due Time', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('creates a task with due_time', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post('/api/goals/' + goal.id + '/tasks').send({ title: 'Meeting', due_date: '2025-03-15', due_time: '14:00' });
    assert.equal(res.status, 201);
    assert.equal(res.body.due_time, '14:00');
  });

  it('updates due_time on a task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const { body: t } = await agent().post('/api/goals/' + goal.id + '/tasks').send({ title: 'Call' });
    const res = await agent().put('/api/tasks/' + t.id).send({ due_time: '09:30' });
    assert.equal(res.status, 200);
    assert.equal(res.body.due_time, '09:30');
  });

  it('clears due_time when set to null', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const { body: t } = await agent().post('/api/goals/' + goal.id + '/tasks').send({ title: 'Review', due_time: '16:00' });
    const res = await agent().put('/api/tasks/' + t.id).send({ due_time: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.due_time, null);
  });

  it('returns due_time in task list', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post('/api/goals/' + goal.id + '/tasks').send({ title: 'Standup', due_time: '10:00' });
    const res = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(res.status, 200);
    const task = res.body.find(t => t.title === 'Standup');
    assert.equal(task.due_time, '10:00');
  });
});
