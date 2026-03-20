const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Habits API', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('CRUD', () => {
    it('creates a habit', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Exercise', icon: '💪', color: '#FF5733', target: 1, frequency: 'daily' });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'Exercise');
      assert.equal(res.body.icon, '💪');
      assert.equal(res.body.target, 1);
      assert.ok(res.body.id);
    });

    it('lists habits', async () => {
      await agent().post('/api/habits').send({ name: 'Read', icon: '📖' });
      await agent().post('/api/habits').send({ name: 'Meditate', icon: '🧘' });
      const res = await agent().get('/api/habits');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('updates a habit', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Run', icon: '🏃' });
      const res = await agent().put('/api/habits/' + h.id).send({ name: 'Jog', target: 2 });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'Jog');
      assert.equal(res.body.target, 2);
    });

    it('deletes a habit', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Drink Water', icon: '💧' });
      const del = await agent().delete('/api/habits/' + h.id);
      assert.equal(del.status, 200);
      const list = await agent().get('/api/habits');
      assert.equal(list.body.length, 0);
    });
  });

  describe('Logging', () => {
    it('logs a completion and increments count', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Push-ups', icon: '💪', target: 3 });
      await agent().post('/api/habits/' + h.id + '/log').send({});
      await agent().post('/api/habits/' + h.id + '/log').send({});
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.todayCount, 2);
    });

    it('unlogs a completion', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Walk', icon: '🚶', target: 1 });
      await agent().post('/api/habits/' + h.id + '/log').send({});
      await agent().delete('/api/habits/' + h.id + '/log');
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.todayCount, 0);
    });

    it('marks completed when target reached', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Stretch', icon: '🤸', target: 1 });
      await agent().post('/api/habits/' + h.id + '/log').send({});
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.completed, true);
    });
  });

  describe('Heatmap', () => {
    it('returns heatmap data', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Journal', icon: '📝', target: 1 });
      await agent().post('/api/habits/' + h.id + '/log').send({});
      const res = await agent().get('/api/habits/' + h.id + '/heatmap');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      assert.equal(res.body[0].count, 1);
    });
  });

  describe('Streak calculation', () => {
    it('returns streak of 1 after logging today', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Code', icon: '💻', target: 1 });
      await agent().post('/api/habits/' + h.id + '/log').send({});
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.ok(habit.streak >= 1);
    });
  });
});
