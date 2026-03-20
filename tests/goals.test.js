const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

describe('Goals API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/areas/:areaId/goals', () => {
    it('returns goals for an area with computed counts', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { title: 'Run marathon' });
      makeTask(goal.id, { status: 'todo' });
      makeTask(goal.id, { status: 'done' });

      const res = await agent().get(`/api/areas/${area.id}/goals`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Run marathon');
      assert.equal(res.body[0].total_tasks, 2);
      assert.equal(res.body[0].done_tasks, 1);
      assert.equal(res.body[0].pending_tasks, 1);
    });

    it('returns empty array for area with no goals', async () => {
      const area = makeArea();
      const res = await agent().get(`/api/areas/${area.id}/goals`).expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('returns goals ordered by position', async () => {
      const area = makeArea();
      makeGoal(area.id, { title: 'Second', position: 1 });
      makeGoal(area.id, { title: 'First', position: 0 });

      const res = await agent().get(`/api/areas/${area.id}/goals`).expect(200);
      assert.equal(res.body[0].title, 'First');
      assert.equal(res.body[1].title, 'Second');
    });

    it('returns 400 for invalid area ID', async () => {
      await agent().get('/api/areas/abc/goals').expect(400);
    });
  });

  describe('GET /api/goals', () => {
    it('returns all active goals with area info', async () => {
      const area = makeArea({ name: 'Health', icon: '💪' });
      makeGoal(area.id, { title: 'Active Goal', status: 'active' });
      makeGoal(area.id, { title: 'Archived Goal', status: 'archived' });

      const res = await agent().get('/api/goals').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Active Goal');
      assert.equal(res.body[0].area_name, 'Health');
      assert.equal(res.body[0].area_icon, '💪');
    });
  });

  describe('POST /api/areas/:areaId/goals', () => {
    it('creates a goal with all fields', async () => {
      const area = makeArea();
      const res = await agent()
        .post(`/api/areas/${area.id}/goals`)
        .send({ title: 'New Goal', description: 'Desc', color: '#FF0000', due_date: '2025-12-31' })
        .expect(201);
      assert.equal(res.body.title, 'New Goal');
      assert.equal(res.body.description, 'Desc');
      assert.equal(res.body.color, '#FF0000');
      assert.equal(res.body.due_date, '2025-12-31');
      assert.equal(res.body.area_id, area.id);
    });

    it('uses defaults when optional fields omitted', async () => {
      const area = makeArea();
      const res = await agent()
        .post(`/api/areas/${area.id}/goals`)
        .send({ title: 'Minimal' })
        .expect(201);
      assert.equal(res.body.description, '');
      assert.equal(res.body.color, '#6C63FF');
      assert.equal(res.body.status, 'active');
    });

    it('returns 400 when title is missing', async () => {
      const area = makeArea();
      await agent().post(`/api/areas/${area.id}/goals`).send({}).expect(400);
    });

    it('returns 400 when title is whitespace', async () => {
      const area = makeArea();
      await agent().post(`/api/areas/${area.id}/goals`).send({ title: '  ' }).expect(400);
    });

    it('trims the title', async () => {
      const area = makeArea();
      const res = await agent()
        .post(`/api/areas/${area.id}/goals`)
        .send({ title: '  Trimmed  ' })
        .expect(201);
      assert.equal(res.body.title, 'Trimmed');
    });

    it('auto-increments position within area', async () => {
      const area = makeArea();
      const r1 = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'A' }).expect(201);
      const r2 = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'B' }).expect(201);
      assert.equal(r1.body.position, 0);
      assert.equal(r2.body.position, 1);
    });
  });

  describe('PUT /api/goals/:id', () => {
    it('updates goal fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { title: 'Old' });
      const res = await agent()
        .put(`/api/goals/${goal.id}`)
        .send({ title: 'Updated', status: 'completed', color: '#000' })
        .expect(200);
      assert.equal(res.body.title, 'Updated');
      assert.equal(res.body.status, 'completed');
      assert.equal(res.body.color, '#000');
    });

    it('clears due_date when set to null', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { due_date: '2025-01-01' });
      const res = await agent()
        .put(`/api/goals/${goal.id}`)
        .send({ due_date: null })
        .expect(200);
      assert.equal(res.body.due_date, null);
    });

    it('returns 404 for nonexistent goal', async () => {
      await agent().put('/api/goals/99999').send({ title: 'Nope' }).expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().put('/api/goals/abc').send({ title: 'Bad' }).expect(400);
    });
  });

  describe('DELETE /api/goals/:id', () => {
    it('deletes a goal', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().delete(`/api/goals/${goal.id}`).expect(200);

      const res = await agent().get(`/api/areas/${area.id}/goals`).expect(200);
      assert.equal(res.body.length, 0);
    });

    it('cascades delete to tasks and subtasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const { makeSubtask } = require('./helpers');
      makeSubtask(task.id);

      await agent().delete(`/api/goals/${goal.id}`).expect(200);

      // Tasks should be gone
      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(tasks.body.length, 0);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().delete('/api/goals/abc').expect(400);
    });
  });
});
