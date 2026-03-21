const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

describe('Phase 4 Features', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('Time Analytics API', () => {
    it('returns time analytics structure', async () => {
      const res = await agent().get('/api/stats/time-analytics');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.byArea));
      assert.ok(Array.isArray(res.body.byHour));
      assert.ok(Array.isArray(res.body.weeklyVelocity));
      assert.ok(res.body.accuracy !== undefined);
    });

    it('counts time by area for completed tasks', async () => {
      const a = makeArea({ name: 'Work' });
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { status: 'done' });
      // Add time tracking via API
      await agent().put('/api/tasks/' + t.id).send({ estimated_minutes: 60, actual_minutes: 45 });
      const res = await agent().get('/api/stats/time-analytics');
      assert.equal(res.status, 200);
      const area = res.body.byArea.find(x => x.name === 'Work');
      assert.ok(area);
      assert.equal(area.total_actual, 45);
      assert.equal(area.total_estimated, 60);
    });

    it('tracks estimation accuracy', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { status: 'done' });
      const t2 = makeTask(g.id, { status: 'done' });
      await agent().put('/api/tasks/' + t1.id).send({ estimated_minutes: 30, actual_minutes: 25 });
      await agent().put('/api/tasks/' + t2.id).send({ estimated_minutes: 60, actual_minutes: 90 });
      const res = await agent().get('/api/stats/time-analytics');
      assert.equal(res.body.accuracy.total, 2);
      assert.equal(res.body.accuracy.on_time, 1);
      assert.equal(res.body.accuracy.over, 1);
    });
  });

  describe('Automation Rules API', () => {
    it('creates a rule', async () => {
      const res = await agent().post('/api/rules').send({
        name: 'Auto My Day',
        trigger_type: 'task_completed',
        action_type: 'add_to_myday'
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'Auto My Day');
      assert.equal(res.body.enabled, 1);
    });

    it('lists rules', async () => {
      await agent().post('/api/rules').send({ name: 'R1', trigger_type: 'task_completed', action_type: 'add_to_myday' });
      await agent().post('/api/rules').send({ name: 'R2', trigger_type: 'task_updated', action_type: 'set_priority' });
      const res = await agent().get('/api/rules');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('updates a rule', async () => {
      const { body: r } = await agent().post('/api/rules').send({ name: 'Old', trigger_type: 'task_completed', action_type: 'add_to_myday' });
      const res = await agent().put('/api/rules/' + r.id).send({ name: 'Updated', enabled: 0 });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'Updated');
      assert.equal(res.body.enabled, 0);
    });

    it('deletes a rule', async () => {
      const { body: r } = await agent().post('/api/rules').send({ name: 'Delete me', trigger_type: 'task_completed', action_type: 'add_to_myday' });
      await agent().delete('/api/rules/' + r.id);
      const list = await agent().get('/api/rules');
      assert.equal(list.body.length, 0);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await agent().post('/api/rules').send({ name: 'Missing' });
      assert.equal(res.status, 400);
    });

    it('executes add_to_myday rule on task completion', async () => {
      // Create a rule
      await agent().post('/api/rules').send({
        name: 'Add completed to My Day',
        trigger_type: 'task_completed',
        action_type: 'add_to_myday'
      });
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Test rule' });
      assert.equal(t.my_day, 0);
      // Complete the task
      await agent().put('/api/tasks/' + t.id).send({ status: 'done' });
      const updated = await agent().get('/api/tasks/' + t.id);
      assert.equal(updated.body.my_day, 1);
    });

    it('executes create_followup rule on task completion', async () => {
      await agent().post('/api/rules').send({
        name: 'Create follow-up',
        trigger_type: 'task_completed',
        action_type: 'create_followup',
        action_config: { title: 'Follow-up: review results' }
      });
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Original task' });
      await agent().put('/api/tasks/' + t.id).send({ status: 'done' });
      // Check that a follow-up task was created
      const tasks = await agent().get('/api/goals/' + g.id + '/tasks');
      const followup = tasks.body.find(x => x.title === 'Follow-up: review results');
      assert.ok(followup, 'Follow-up task should have been created');
    });

    it('disabled rules do not execute', async () => {
      const { body: r } = await agent().post('/api/rules').send({
        name: 'Disabled rule',
        trigger_type: 'task_completed',
        action_type: 'add_to_myday'
      });
      await agent().put('/api/rules/' + r.id).send({ enabled: 0 });
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Disabled test' });
      await agent().put('/api/tasks/' + t.id).send({ status: 'done' });
      const updated = await agent().get('/api/tasks/' + t.id);
      assert.equal(updated.body.my_day, 0);
    });
  });
});
