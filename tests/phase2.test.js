const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent, today, daysFromNow } = require('./helpers');

describe('Phase 2 Features', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('Task Comments API', () => {
    async function makeChain() {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      return { a, g, t };
    }

    it('creates a comment on a task', async () => {
      const { t } = await makeChain();
      const res = await agent().post(`/api/tasks/${t.id}/comments`).send({ text: 'First comment' });
      assert.equal(res.status, 201);
      assert.equal(res.body.text, 'First comment');
      assert.equal(res.body.task_id, t.id);
      assert.ok(res.body.id);
      assert.ok(res.body.created_at);
    });

    it('lists comments for a task', async () => {
      const { t } = await makeChain();
      await agent().post(`/api/tasks/${t.id}/comments`).send({ text: 'Comment A' });
      await agent().post(`/api/tasks/${t.id}/comments`).send({ text: 'Comment B' });
      const res = await agent().get(`/api/tasks/${t.id}/comments`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('deletes a comment', async () => {
      const { t } = await makeChain();
      const { body: c } = await agent().post(`/api/tasks/${t.id}/comments`).send({ text: 'To delete' });
      const del = await agent().delete(`/api/tasks/${t.id}/comments/${c.id}`);
      assert.equal(del.status, 200);
      const list = await agent().get(`/api/tasks/${t.id}/comments`);
      assert.equal(list.body.length, 0);
    });

    it('returns 400 for empty comment text', async () => {
      const { t } = await makeChain();
      const res = await agent().post(`/api/tasks/${t.id}/comments`).send({ text: '' });
      assert.equal(res.status, 400);
    });

    it('comments are isolated per task', async () => {
      const { t } = await makeChain();
      const a2 = makeArea({ name: 'Area2' });
      const g2 = makeGoal(a2.id);
      const t2 = makeTask(g2.id);
      await agent().post(`/api/tasks/${t.id}/comments`).send({ text: 'For task 1' });
      await agent().post(`/api/tasks/${t2.id}/comments`).send({ text: 'For task 2' });
      const r1 = await agent().get(`/api/tasks/${t.id}/comments`);
      const r2 = await agent().get(`/api/tasks/${t2.id}/comments`);
      assert.equal(r1.body.length, 1);
      assert.equal(r2.body.length, 1);
      assert.equal(r1.body[0].text, 'For task 1');
    });
  });

  describe('Goal Milestones API', () => {
    async function makeChain() {
      const a = makeArea();
      const g = makeGoal(a.id);
      return { a, g };
    }

    it('creates a milestone', async () => {
      const { g } = await makeChain();
      const res = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'First milestone' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'First milestone');
      assert.equal(res.body.done, 0);
      assert.ok(res.body.id);
    });

    it('lists milestones for a goal', async () => {
      const { g } = await makeChain();
      await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'MS 1' });
      await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'MS 2' });
      const res = await agent().get(`/api/goals/${g.id}/milestones`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('toggles milestone done', async () => {
      const { g } = await makeChain();
      const { body: ms } = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Toggle me' });
      const res = await agent().put(`/api/milestones/${ms.id}`).send({ done: 1 });
      assert.equal(res.status, 200);
      assert.equal(res.body.done, 1);
      assert.ok(res.body.completed_at);
      const res2 = await agent().put(`/api/milestones/${ms.id}`).send({ done: 0 });
      assert.equal(res2.body.done, 0);
      assert.equal(res2.body.completed_at, null);
    });

    it('deletes a milestone', async () => {
      const { g } = await makeChain();
      const { body: ms } = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Delete me' });
      const del = await agent().delete(`/api/milestones/${ms.id}`);
      assert.equal(del.status, 200);
      const list = await agent().get(`/api/goals/${g.id}/milestones`);
      assert.equal(list.body.length, 0);
    });

    it('milestones are isolated per goal', async () => {
      const a = makeArea();
      const g1 = makeGoal(a.id, { title: 'Goal 1' });
      const g2 = makeGoal(a.id, { title: 'Goal 2' });
      await agent().post(`/api/goals/${g1.id}/milestones`).send({ title: 'G1 MS' });
      await agent().post(`/api/goals/${g2.id}/milestones`).send({ title: 'G2 MS' });
      const r1 = await agent().get(`/api/goals/${g1.id}/milestones`);
      assert.equal(r1.body.length, 1);
      assert.equal(r1.body[0].title, 'G1 MS');
    });
  });

  describe('Goal Progress API', () => {
    it('returns goal progress with task counts and milestone status', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { status: 'todo' });
      makeTask(g.id, { status: 'done' });
      makeTask(g.id, { status: 'done' });
      await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'MS1' });
      const { body: ms } = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'MS2' });
      await agent().put(`/api/milestones/${ms.id}`).send({ done: 1 });
      const res = await agent().get(`/api/goals/${g.id}/progress`);
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 3);
      assert.equal(res.body.done, 2);
      assert.equal(res.body.milestones.length, 2);
      assert.equal(res.body.milestones.filter(m => m.done).length, 1);
    });
  });

  describe('Day Planner API', () => {
    it('returns scheduled and unscheduled tasks for a date', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const d = today();
      // Use API to create tasks with time_block fields (makeTask helper doesn't support them)
      await agent().post(`/api/goals/${g.id}/tasks`).send({ title: 'Blocked', due_date: d, time_block_start: '09:00', time_block_end: '10:00' });
      await agent().post(`/api/goals/${g.id}/tasks`).send({ title: 'Unblocked', due_date: d });
      await agent().post(`/api/goals/${g.id}/tasks`).send({ title: 'Other day', due_date: daysFromNow(1) });
      const res = await agent().get(`/api/planner/${d}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.scheduled.length, 1);
      assert.equal(res.body.unscheduled.length, 1);
      assert.equal(res.body.scheduled[0].time_block_start, '09:00');
    });

    it('returns empty arrays if no tasks for date', async () => {
      const res = await agent().get(`/api/planner/${today()}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.scheduled.length, 0);
      assert.equal(res.body.unscheduled.length, 0);
    });
  });

  describe('Time Block Fields', () => {
    it('creates a task with time block fields', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const res = await agent().post(`/api/goals/${g.id}/tasks`).send({
        title: 'Blocked task', time_block_start: '14:00', time_block_end: '15:30'
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.time_block_start, '14:00');
      assert.equal(res.body.time_block_end, '15:30');
    });

    it('updates time block fields', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post(`/api/goals/${g.id}/tasks`).send({ title: 'Update me' });
      const res = await agent().put(`/api/tasks/${t.id}`).send({ time_block_start: '08:00', time_block_end: '09:00' });
      assert.equal(res.status, 200);
      assert.equal(res.body.time_block_start, '08:00');
      assert.equal(res.body.time_block_end, '09:00');
    });

    it('clears time block fields', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post(`/api/goals/${g.id}/tasks`).send({
        title: 'Clear me', time_block_start: '10:00', time_block_end: '11:00'
      });
      const res = await agent().put(`/api/tasks/${t.id}`).send({ time_block_start: null, time_block_end: null });
      assert.equal(res.status, 200);
      assert.equal(res.body.time_block_start, null);
      assert.equal(res.body.time_block_end, null);
    });
  });

  describe('Productivity Trends API', () => {
    it('returns 8 weekly trend buckets', async () => {
      const res = await agent().get('/api/stats/trends');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 8);
      res.body.forEach(w => {
        assert.ok('week_start' in w);
        assert.ok('week_end' in w);
        assert.ok('completed' in w);
        assert.equal(typeof w.completed, 'number');
      });
    });

    it('counts completed tasks in the right week', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);
      const yesterday = daysFromNow(-1);
      const t = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(yesterday + 'T12:00:00.000Z', t.id);
      const res = await agent().get('/api/stats/trends');
      assert.equal(res.status, 200);
      const total = res.body.reduce((sum, w) => sum + w.completed, 0);
      assert.ok(total >= 1, 'Should count at least 1 completed task');
    });
  });

  describe('My Day Toggle via API', () => {
    it('toggles my_day on a task', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post(`/api/goals/${g.id}/tasks`).send({ title: 'Toggle my day' });
      assert.equal(t.my_day, 0);
      const on = await agent().put(`/api/tasks/${t.id}`).send({ my_day: 1 });
      assert.equal(on.body.my_day, 1);
      const off = await agent().put(`/api/tasks/${t.id}`).send({ my_day: 0 });
      assert.equal(off.body.my_day, 0);
    });
  });
});
