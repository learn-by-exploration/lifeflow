const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, agent } = require('./helpers');

describe('Subtasks API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/tasks/:taskId/subtasks', () => {
    it('returns subtasks ordered by position', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      makeSubtask(task.id, { title: 'Second', position: 1 });
      makeSubtask(task.id, { title: 'First', position: 0 });

      const res = await agent().get(`/api/tasks/${task.id}/subtasks`).expect(200);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].title, 'First');
      assert.equal(res.body[1].title, 'Second');
    });

    it('returns empty array when task has no subtasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent().get(`/api/tasks/${task.id}/subtasks`).expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('returns 400 for invalid task ID', async () => {
      await agent().get('/api/tasks/abc/subtasks').expect(400);
    });
  });

  describe('POST /api/tasks/:taskId/subtasks', () => {
    it('creates a subtask', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: 'New Subtask' })
        .expect(201);
      assert.equal(res.body.title, 'New Subtask');
      assert.equal(res.body.task_id, task.id);
      assert.equal(res.body.done, 0);
      assert.ok(res.body.id);
    });

    it('trims the title', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: '  Trimmed  ' })
        .expect(201);
      assert.equal(res.body.title, 'Trimmed');
    });

    it('auto-increments position', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const r1 = await agent().post(`/api/tasks/${task.id}/subtasks`).send({ title: 'A' }).expect(201);
      const r2 = await agent().post(`/api/tasks/${task.id}/subtasks`).send({ title: 'B' }).expect(201);
      assert.equal(r1.body.position, 0);
      assert.equal(r2.body.position, 1);
    });

    it('returns 400 when title is missing', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().post(`/api/tasks/${task.id}/subtasks`).send({}).expect(400);
    });

    it('returns 400 when title is whitespace', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().post(`/api/tasks/${task.id}/subtasks`).send({ title: '   ' }).expect(400);
    });

    it('returns 400 for invalid task ID', async () => {
      await agent().post('/api/tasks/abc/subtasks').send({ title: 'Test' }).expect(400);
    });
  });

  describe('PUT /api/subtasks/:id', () => {
    it('updates subtask title', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { title: 'Old' });

      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ title: 'New' })
        .expect(200);
      assert.equal(res.body.title, 'New');
    });

    it('toggles done status', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { done: 0 });

      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: true })
        .expect(200);
      assert.equal(res.body.done, 1);

      const res2 = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: false })
        .expect(200);
      assert.equal(res2.body.done, 0);
    });

    it('updates note', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id);

      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ note: 'Some notes here' })
        .expect(200);
      assert.equal(res.body.note, 'Some notes here');
    });

    it('returns 404 for nonexistent subtask', async () => {
      await agent().put('/api/subtasks/99999').send({ title: 'Nope' }).expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().put('/api/subtasks/abc').send({ title: 'Bad' }).expect(400);
    });
  });

  describe('DELETE /api/subtasks/:id', () => {
    it('deletes a subtask', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id);

      await agent().delete(`/api/subtasks/${sub.id}`).expect(200);

      const res = await agent().get(`/api/tasks/${task.id}/subtasks`).expect(200);
      assert.equal(res.body.length, 0);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().delete('/api/subtasks/abc').expect(400);
    });
  });

  describe('Subtask enrichment in parent task', () => {
    it('enriches task with subtask counts', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      makeSubtask(task.id, { title: 'Done', done: 1 });
      makeSubtask(task.id, { title: 'Pending', done: 0 });

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.equal(res.body.subtask_total, 2);
      assert.equal(res.body.subtask_done, 1);
      assert.equal(res.body.subtasks.length, 2);
    });
  });
});
