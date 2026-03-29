const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask, makeTag, linkTag, today, daysFromNow } = require('./helpers');

describe('Phase 0 Gap Tests', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── 0.6: Error Handler Edge Cases ──
  describe('Error handler middleware', () => {
    it('returns 400 for validation error', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // Missing required title
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ note: 'no title' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('returns 400 on malformed JSON body', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');
      assert.equal(res.status, 400);
    });

    it('returns 404 for NotFoundError (task not found)', async () => {
      const res = await agent().get('/api/tasks/99999');
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
    });

    it('does not expose stack trace in error response', async () => {
      const res = await agent().get('/api/tasks/99999');
      assert.equal(res.body.stack, undefined, 'Stack trace should not be exposed');
      assert.equal(typeof res.body.error, 'string');
    });
  });

  // ── 0.7: Comment UPDATE Route ──
  describe('PUT /api/tasks/:id/comments/:commentId', () => {
    it('updates comment text', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      // Create a comment
      const createRes = await agent()
        .post(`/api/tasks/${task.id}/comments`)
        .send({ text: 'Original text' });
      assert.equal(createRes.status, 201);
      const commentId = createRes.body.id;

      // Update comment
      const updateRes = await agent()
        .put(`/api/tasks/${task.id}/comments/${commentId}`)
        .send({ text: 'Updated text' });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.text, 'Updated text');
    });

    it('rejects empty comment text', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const createRes = await agent()
        .post(`/api/tasks/${task.id}/comments`)
        .send({ text: 'Some text' });
      const commentId = createRes.body.id;

      const res = await agent()
        .put(`/api/tasks/${task.id}/comments/${commentId}`)
        .send({ text: '' });
      assert.equal(res.status, 400);
    });

    it('returns 404 for non-existent comment', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}/comments/99999`)
        .send({ text: 'Will not work' });
      assert.equal(res.status, 404);
    });
  });

  // ── 0.8: Task Lifecycle → Dashboard Stats E2E ──
  describe('Task lifecycle reflects in dashboard stats', () => {
    it('completed task appears in recentDone', async () => {
      const area = makeArea({ name: 'Stats Area' });
      const goal = makeGoal(area.id, { title: 'Stats Goal' });
      const task = makeTask(goal.id, { title: 'E2E Stats Task', due_date: today() });

      // Complete the task
      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      // Check stats
      const res = await agent().get('/api/stats').expect(200);
      assert.ok(res.body.done >= 1, 'done count should be at least 1');
      const recent = res.body.recentDone;
      assert.ok(Array.isArray(recent));
      const found = recent.find(r => r.title === 'E2E Stats Task');
      assert.ok(found, 'Task should appear in recentDone');
    });

    it('completed task increments done count', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t1 = makeTask(goal.id, { title: 'Done 1' });
      const t2 = makeTask(goal.id, { title: 'Done 2' });
      makeTask(goal.id, { title: 'Not done' });

      await agent().put(`/api/tasks/${t1.id}`).send({ status: 'done' }).expect(200);
      await agent().put(`/api/tasks/${t2.id}`).send({ status: 'done' }).expect(200);

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.done, 2);
      assert.equal(res.body.total, 3);
    });

    it('byArea percentages reflect task completion', async () => {
      const area1 = makeArea({ name: 'Work' });
      const area2 = makeArea({ name: 'Personal' });
      const g1 = makeGoal(area1.id, { title: 'Work Goal' });
      const g2 = makeGoal(area2.id, { title: 'Personal Goal' });
      const t1 = makeTask(g1.id, { title: 'Work Task 1' });
      makeTask(g1.id, { title: 'Work Task 2' });
      makeTask(g2.id, { title: 'Personal Task' });

      await agent().put(`/api/tasks/${t1.id}`).send({ status: 'done' }).expect(200);

      const res = await agent().get('/api/stats').expect(200);
      const workArea = res.body.byArea.find(a => a.name === 'Work');
      assert.ok(workArea, 'Work area should be in byArea');
      assert.equal(workArea.total, 2);
      assert.equal(workArea.done, 1);
    });
  });
});
