const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

describe('Life Areas API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/areas', () => {
    it('returns empty array when no areas exist', async () => {
      const res = await agent().get('/api/areas').expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('returns areas with computed goal_count and pending_tasks', async () => {
      const area = makeArea({ name: 'Health' });
      const goal = makeGoal(area.id);
      makeTask(goal.id, { status: 'todo' });
      makeTask(goal.id, { status: 'done' });

      const res = await agent().get('/api/areas').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].name, 'Health');
      assert.equal(res.body[0].goal_count, 1);
      assert.equal(res.body[0].pending_tasks, 1);
    });

    it('returns areas ordered by position', async () => {
      makeArea({ name: 'Second', position: 1 });
      makeArea({ name: 'First', position: 0 });

      const res = await agent().get('/api/areas').expect(200);
      assert.equal(res.body[0].name, 'First');
      assert.equal(res.body[1].name, 'Second');
    });
  });

  describe('POST /api/areas', () => {
    it('creates a new area with all fields', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({ name: 'Fitness', icon: '💪', color: '#22C55E' })
        .expect(201);
      assert.equal(res.body.name, 'Fitness');
      assert.equal(res.body.icon, '💪');
      assert.equal(res.body.color, '#22C55E');
      assert.ok(res.body.id);
    });

    it('uses default icon and color when not provided', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({ name: 'Minimal' })
        .expect(201);
      assert.equal(res.body.icon, '📋');
      assert.equal(res.body.color, '#2563EB');
    });

    it('trims the name', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({ name: '  Trimmed  ' })
        .expect(201);
      assert.equal(res.body.name, 'Trimmed');
    });

    it('returns 400 when name is missing', async () => {
      await agent().post('/api/areas').send({}).expect(400);
    });

    it('returns 400 when name is whitespace only', async () => {
      await agent().post('/api/areas').send({ name: '   ' }).expect(400);
    });

    it('auto-increments position', async () => {
      const r1 = await agent().post('/api/areas').send({ name: 'A' }).expect(201);
      const r2 = await agent().post('/api/areas').send({ name: 'B' }).expect(201);
      assert.equal(r1.body.position, 0);
      assert.equal(r2.body.position, 1);
    });
  });

  describe('PUT /api/areas/:id', () => {
    it('updates an existing area', async () => {
      const area = makeArea({ name: 'Old' });
      const res = await agent()
        .put(`/api/areas/${area.id}`)
        .send({ name: 'New', icon: '🎯', color: '#000000' })
        .expect(200);
      assert.equal(res.body.name, 'New');
      assert.equal(res.body.icon, '🎯');
      assert.equal(res.body.color, '#000000');
    });

    it('partially updates (COALESCE keeps existing values)', async () => {
      const area = makeArea({ name: 'Keep', icon: '🏠', color: '#111111' });
      const res = await agent()
        .put(`/api/areas/${area.id}`)
        .send({ name: 'Changed' })
        .expect(200);
      assert.equal(res.body.name, 'Changed');
      assert.equal(res.body.icon, '🏠');
      assert.equal(res.body.color, '#111111');
    });

    it('returns 404 for nonexistent area', async () => {
      await agent().put('/api/areas/99999').send({ name: 'Nope' }).expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().put('/api/areas/abc').send({ name: 'Bad' }).expect(400);
    });
  });

  describe('DELETE /api/areas/:id', () => {
    it('deletes an area', async () => {
      const area = makeArea();
      await agent().delete(`/api/areas/${area.id}`).expect(200);
      const res = await agent().get('/api/areas').expect(200);
      assert.equal(res.body.length, 0);
    });

    it('cascades delete to goals and tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);

      await agent().delete(`/api/areas/${area.id}`).expect(200);

      // Goal should be gone - GET goals for this area returns empty
      const goals = await agent().get(`/api/areas/${area.id}/goals`).expect(200);
      assert.equal(goals.body.length, 0);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().delete('/api/areas/abc').expect(400);
    });
  });
});
