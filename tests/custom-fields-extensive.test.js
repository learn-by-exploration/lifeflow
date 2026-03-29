const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

let db;

describe('Custom Fields — Extensive Tests', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Field Definition CRUD ──

  it('create text field → 201 with correct type', async () => {
    const res = await agent().post('/api/custom-fields').send({ name: 'Notes Field', field_type: 'text' });
    assert.equal(res.status, 201);
    assert.equal(res.body.field_type, 'text');
    assert.equal(res.body.name, 'Notes Field');
  });

  it('create number field → validates field_type enum', async () => {
    const res = await agent().post('/api/custom-fields').send({ name: 'Count', field_type: 'number' });
    assert.equal(res.status, 201);
    assert.equal(res.body.field_type, 'number');

    const bad = await agent().post('/api/custom-fields').send({ name: 'Bad', field_type: 'boolean' });
    assert.equal(bad.status, 400);
  });

  it('create select field with options array → stored correctly', async () => {
    const res = await agent().post('/api/custom-fields').send({
      name: 'Status', field_type: 'select', options: ['Open', 'In Progress', 'Closed']
    });
    assert.equal(res.status, 201);
    const opts = JSON.parse(res.body.options);
    assert.deepEqual(opts, ['Open', 'In Progress', 'Closed']);
  });

  it('create select field without options → 400', async () => {
    const res = await agent().post('/api/custom-fields').send({ name: 'Bad Select', field_type: 'select' });
    assert.equal(res.status, 400);
  });

  it('create field with empty name → 400', async () => {
    const res = await agent().post('/api/custom-fields').send({ name: '', field_type: 'text' });
    assert.equal(res.status, 400);
  });

  it('create field with duplicate name → 409', async () => {
    await agent().post('/api/custom-fields').send({ name: 'Dupe', field_type: 'text' });
    const res = await agent().post('/api/custom-fields').send({ name: 'Dupe', field_type: 'number' });
    assert.equal(res.status, 409);
  });

  it('update field name → 200', async () => {
    const cr = await agent().post('/api/custom-fields').send({ name: 'Old Name', field_type: 'text' });
    const res = await agent().put(`/api/custom-fields/${cr.body.id}`).send({ name: 'New Name' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'New Name');
  });

  it('update field position → 200', async () => {
    const cr = await agent().post('/api/custom-fields').send({ name: 'Pos Test', field_type: 'text' });
    const res = await agent().put(`/api/custom-fields/${cr.body.id}`).send({ position: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.position, 5);
  });

  it('delete field → cascades to task_custom_values', async () => {
    const field = await agent().post('/api/custom-fields').send({ name: 'Cascade', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
      fields: [{ field_id: field.body.id, value: 'test' }]
    });

    // Verify value exists
    const valsBefore = db.prepare('SELECT * FROM task_custom_values WHERE field_id=?').all(field.body.id);
    assert.equal(valsBefore.length, 1);

    // Delete field
    await agent().delete(`/api/custom-fields/${field.body.id}`);

    // Values should cascade
    const valsAfter = db.prepare('SELECT * FROM task_custom_values WHERE field_id=?').all(field.body.id);
    assert.equal(valsAfter.length, 0);
  });

  it('list fields → ordered by position', async () => {
    await agent().post('/api/custom-fields').send({ name: 'C', field_type: 'text', position: 3 });
    await agent().post('/api/custom-fields').send({ name: 'A', field_type: 'text', position: 1 });
    await agent().post('/api/custom-fields').send({ name: 'B', field_type: 'text', position: 2 });

    const res = await agent().get('/api/custom-fields');
    assert.equal(res.status, 200);
    assert.equal(res.body[0].name, 'A');
    assert.equal(res.body[1].name, 'B');
    assert.equal(res.body[2].name, 'C');
  });

  // ── Value Operations ──

  it('set text value → 200, value stored', async () => {
    const field = await agent().post('/api/custom-fields').send({ name: 'Notes', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
      fields: [{ field_id: field.body.id, value: 'Hello world' }]
    });
    assert.equal(res.status, 200);

    const vals = await agent().get(`/api/tasks/${task.id}/custom-fields`);
    assert.equal(vals.body[0].value, 'Hello world');
  });

  it('set number value with non-numeric string → 400', async () => {
    const field = await agent().post('/api/custom-fields').send({ name: 'Count', field_type: 'number' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
      fields: [{ field_id: field.body.id, value: 'not a number' }]
    });
    assert.equal(res.status, 400);
  });

  it('set date value with invalid format → 400', async () => {
    const field = await agent().post('/api/custom-fields').send({ name: 'Due', field_type: 'date' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
      fields: [{ field_id: field.body.id, value: '13/01/2025' }]
    });
    assert.equal(res.status, 400);
  });

  it('set select value not in options → 400', async () => {
    const field = await agent().post('/api/custom-fields').send({
      name: 'Priority', field_type: 'select', options: ['Low', 'Medium', 'High']
    });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
      fields: [{ field_id: field.body.id, value: 'Critical' }]
    });
    assert.equal(res.status, 400);
  });

  it('delete task → custom values cascade deleted', async () => {
    const field = await agent().post('/api/custom-fields').send({ name: 'Cascade2', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    await agent().put(`/api/tasks/${task.id}/custom-fields`).send({
      fields: [{ field_id: field.body.id, value: 'test' }]
    });

    const valsBefore = db.prepare('SELECT * FROM task_custom_values WHERE task_id=?').all(task.id);
    assert.equal(valsBefore.length, 1);

    await agent().delete(`/api/tasks/${task.id}`);

    const valsAfter = db.prepare('SELECT * FROM task_custom_values WHERE task_id=?').all(task.id);
    assert.equal(valsAfter.length, 0);
  });
});
