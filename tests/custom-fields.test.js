const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, agent, setup } = require('./helpers');

describe('Custom Fields API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── Field Definition CRUD ──
  describe('POST /api/custom-fields', () => {
    it('creates a text field', async () => {
      const res = await agent()
        .post('/api/custom-fields')
        .send({ name: 'Client', field_type: 'text' })
        .expect(201);
      assert.equal(res.body.name, 'Client');
      assert.equal(res.body.field_type, 'text');
      assert.equal(res.body.position, 0);
    });

    it('creates a select field with options', async () => {
      const res = await agent()
        .post('/api/custom-fields')
        .send({ name: 'Energy', field_type: 'select', options: ['Low', 'Medium', 'High'] })
        .expect(201);
      assert.equal(res.body.field_type, 'select');
      assert.deepEqual(JSON.parse(res.body.options), ['Low', 'Medium', 'High']);
    });

    it('creates a number field', async () => {
      const res = await agent()
        .post('/api/custom-fields')
        .send({ name: 'Budget', field_type: 'number' })
        .expect(201);
      assert.equal(res.body.field_type, 'number');
    });

    it('creates a date field', async () => {
      const res = await agent()
        .post('/api/custom-fields')
        .send({ name: 'Deadline', field_type: 'date' })
        .expect(201);
      assert.equal(res.body.field_type, 'date');
    });

    it('rejects duplicate name', async () => {
      await agent().post('/api/custom-fields').send({ name: 'Client', field_type: 'text' }).expect(201);
      const res = await agent().post('/api/custom-fields').send({ name: 'Client', field_type: 'text' }).expect(409);
      assert.ok(res.body.error);
    });

    it('rejects missing name', async () => {
      await agent().post('/api/custom-fields').send({ field_type: 'text' }).expect(400);
    });

    it('rejects invalid field_type', async () => {
      await agent().post('/api/custom-fields').send({ name: 'Bad', field_type: 'boolean' }).expect(400);
    });

    it('sets show_in_card flag', async () => {
      const res = await agent()
        .post('/api/custom-fields')
        .send({ name: 'Visible', field_type: 'text', show_in_card: true })
        .expect(201);
      assert.equal(res.body.show_in_card, 1);
    });
  });

  describe('GET /api/custom-fields', () => {
    it('lists fields ordered by position', async () => {
      await agent().post('/api/custom-fields').send({ name: 'B', field_type: 'text', position: 1 }).expect(201);
      await agent().post('/api/custom-fields').send({ name: 'A', field_type: 'text', position: 0 }).expect(201);
      const res = await agent().get('/api/custom-fields').expect(200);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].name, 'A');
      assert.equal(res.body[1].name, 'B');
    });
  });

  describe('PUT /api/custom-fields/:id', () => {
    it('updates field name', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Old', field_type: 'text' }).expect(201);
      const res = await agent().put(`/api/custom-fields/${f.body.id}`).send({ name: 'New' }).expect(200);
      assert.equal(res.body.name, 'New');
    });

    it('updates options for select field', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Priority', field_type: 'select', options: ['A'] }).expect(201);
      const res = await agent().put(`/api/custom-fields/${f.body.id}`).send({ options: ['A', 'B', 'C'] }).expect(200);
      assert.deepEqual(JSON.parse(res.body.options), ['A', 'B', 'C']);
    });

    it('returns 404 for non-existent field', async () => {
      await agent().put('/api/custom-fields/9999').send({ name: 'X' }).expect(404);
    });
  });

  describe('DELETE /api/custom-fields/:id', () => {
    it('deletes field and cascades values', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Temp', field_type: 'text' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'test' }] }).expect(200);
      await agent().delete(`/api/custom-fields/${f.body.id}`).expect(204);
      // Verify field gone
      const res = await agent().get('/api/custom-fields').expect(200);
      assert.equal(res.body.length, 0);
      // Verify values cascaded
      const vals = await agent().get(`/api/tasks/${task.id}/custom-fields`).expect(200);
      assert.equal(vals.body.length, 0);
    });

    it('returns 404 for non-existent field', async () => {
      await agent().delete('/api/custom-fields/9999').expect(404);
    });
  });

  // ── Task Custom Values ──
  describe('PUT /api/tasks/:id/custom-fields', () => {
    it('sets text value on task', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Client', field_type: 'text' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent()
        .put(`/api/tasks/${task.id}/custom-fields`)
        .send({ fields: [{ field_id: f.body.id, value: 'Acme Corp' }] })
        .expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].value, 'Acme Corp');
    });

    it('validates number values', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Budget', field_type: 'number' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: '5000' }] }).expect(200);
      const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'not-a-number' }] }).expect(400);
      assert.ok(res.body.error);
    });

    it('validates date values', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Deadline', field_type: 'date' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: '2025-07-01' }] }).expect(200);
      const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'not-a-date' }] }).expect(400);
      assert.ok(res.body.error);
    });

    it('validates select values against options', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Energy', field_type: 'select', options: ['Low', 'High'] }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'High' }] }).expect(200);
      const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'Medium' }] }).expect(400);
      assert.ok(res.body.error);
    });

    it('upserts existing value', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Note', field_type: 'text' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'v1' }] }).expect(200);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'v2' }] }).expect(200);
      const vals = await agent().get(`/api/tasks/${task.id}/custom-fields`).expect(200);
      assert.equal(vals.body.length, 1);
      assert.equal(vals.body[0].value, 'v2');
    });
  });

  describe('GET /api/tasks/:id/custom-fields', () => {
    it('returns all custom field values with field metadata', async () => {
      const f1 = await agent().post('/api/custom-fields').send({ name: 'Client', field_type: 'text' }).expect(201);
      const f2 = await agent().post('/api/custom-fields').send({ name: 'Budget', field_type: 'number' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
        fields: [
          { field_id: f1.body.id, value: 'Acme' },
          { field_id: f2.body.id, value: '5000' }
        ]
      }).expect(200);

      const res = await agent().get(`/api/tasks/${task.id}/custom-fields`).expect(200);
      assert.equal(res.body.length, 2);
      const client = res.body.find(v => v.name === 'Client');
      assert.equal(client.value, 'Acme');
      assert.equal(client.field_type, 'text');
    });

    it('returns empty array for task with no custom fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().get(`/api/tasks/${task.id}/custom-fields`).expect(200);
      assert.deepEqual(res.body, []);
    });
  });

  // ── Integration ──
  describe('Custom fields integration', () => {
    it('enrichTask includes custom_fields array', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Client', field_type: 'text', show_in_card: true }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'Acme' }] }).expect(200);

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.ok(Array.isArray(res.body.custom_fields));
      assert.equal(res.body.custom_fields.length, 1);
      assert.equal(res.body.custom_fields[0].value, 'Acme');
    });

    it('deleting task cascades custom values', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'CF', field_type: 'text' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: 'val' }] }).expect(200);
      await agent().delete(`/api/tasks/${task.id}`).expect(200);
      // Values should be gone via cascade
      const { db } = setup();
      const count = db.prepare('SELECT COUNT(*) as c FROM task_custom_values WHERE task_id=?').get(task.id).c;
      assert.equal(count, 0);
    });

    it('text value respects max length of 500', async () => {
      const f = await agent().post('/api/custom-fields').send({ name: 'Long', field_type: 'text' }).expect(201);
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const long = 'x'.repeat(501);
      const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({ fields: [{ field_id: f.body.id, value: long }] }).expect(400);
      assert.ok(res.body.error);
    });
  });
});
