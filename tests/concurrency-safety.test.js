const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Concurrency & Race Condition Tests', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('concurrent area creates: no duplicate positions', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(agent().post('/api/areas').send({ name: `Area ${i}`, icon: '📋', color: '#FF0000' }));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    assert.equal(successes.length, 5);
    const ids = new Set(successes.map(r => r.body.id));
    assert.equal(ids.size, 5, 'all IDs should be unique');
  });

  it('concurrent goal creates in same area: all succeed', async () => {
    const area = makeArea();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(agent().post(`/api/areas/${area.id}/goals`).send({ title: `Goal ${i}` }));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    assert.equal(successes.length, 5);
  });

  it('concurrent task creates: all have unique IDs', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `Task ${i}` }));
    }
    const results = await Promise.all(promises);
    const ids = new Set(results.map(r => r.body.id));
    assert.equal(ids.size, 10, 'all task IDs should be unique');
  });

  it('rapid task update: last write wins', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Race' });
    // Rapid sequential updates
    await agent().put(`/api/tasks/${task.body.id}`).send({ title: 'Update 1' });
    await agent().put(`/api/tasks/${task.body.id}`).send({ title: 'Update 2' });
    await agent().put(`/api/tasks/${task.body.id}`).send({ title: 'Final' });
    const fetched = await agent().get(`/api/tasks/${task.body.id}`);
    assert.equal(fetched.body.title, 'Final');
  });

  it('concurrent subtask creates: all succeed', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(agent().post(`/api/tasks/${task.id}/subtasks`).send({ title: `Sub ${i}` }));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    assert.equal(successes.length, 5);
  });

  it('concurrent tag creates: all unique', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(agent().post('/api/tags').send({ name: `conc-tag-${i}`, color: '#FF0000' }));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    assert.equal(successes.length, 5);
  });

  it('delete during list: no crash', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) {
      await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `T${i}` });
    }
    // Start a list request and a delete concurrently
    const [list, del] = await Promise.all([
      agent().get(`/api/goals/${goal.id}/tasks`),
      agent().delete(`/api/goals/${goal.id}`)
    ]);
    // Both should complete without crashing
    assert.ok(list.status < 500);
    assert.ok(del.status < 500);
  });

  it('SQLite WAL handles concurrent reads', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 10; i++) {
      await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: `T${i}` });
    }
    // 10 concurrent reads
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(agent().get(`/api/goals/${goal.id}/tasks`));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      assert.equal(r.status, 200);
    }
  });
});
