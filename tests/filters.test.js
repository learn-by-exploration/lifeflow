const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

describe('Saved Filters API', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('CRUD', () => {
    it('creates a filter', async () => {
      const res = await agent().post('/api/filters').send({ name: 'High Priority', icon: '🔴', filters: { priority: '3' } });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'High Priority');
      assert.ok(res.body.id);
    });

    it('lists filters', async () => {
      await agent().post('/api/filters').send({ name: 'F1', icon: '🔵', filters: {} });
      await agent().post('/api/filters').send({ name: 'F2', icon: '🟢', filters: {} });
      const res = await agent().get('/api/filters');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('updates a filter', async () => {
      const { body: f } = await agent().post('/api/filters').send({ name: 'Old', icon: '🔵', filters: {} });
      const res = await agent().put('/api/filters/' + f.id).send({ name: 'New', icon: '🟢' });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'New');
    });

    it('deletes a filter', async () => {
      const { body: f } = await agent().post('/api/filters').send({ name: 'Temp', icon: '🗑', filters: {} });
      const del = await agent().delete('/api/filters/' + f.id);
      assert.equal(del.status, 200);
      const list = await agent().get('/api/filters');
      assert.equal(list.body.length, 0);
    });
  });

  describe('Execute', () => {
    it('filters by priority', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Low', priority: 1 });
      makeTask(goal.id, { title: 'Critical', priority: 3 });
      const res = await agent().get('/api/filters/execute?priority=3');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Critical');
    });

    it('filters by status', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Todo', status: 'todo' });
      makeTask(goal.id, { title: 'Done', status: 'done' });
      const res = await agent().get('/api/filters/execute?status=done');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Done');
    });

    it('filters by due=today', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const today = new Date().toISOString().slice(0, 10);
      makeTask(goal.id, { title: 'Today', due_date: today });
      makeTask(goal.id, { title: 'No date' });
      const res = await agent().get('/api/filters/execute?due=today');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Today');
    });

    it('filters by my_day', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'MyDay', my_day: 1 });
      makeTask(goal.id, { title: 'Normal' });
      const res = await agent().get('/api/filters/execute?my_day=1');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'MyDay');
    });

    it('returns all tasks when no filters', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'A' });
      makeTask(goal.id, { title: 'B' });
      const res = await agent().get('/api/filters/execute');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });
  });
});
