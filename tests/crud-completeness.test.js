const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeFocus, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Phase 4: CRUD Completeness Tests ───

describe('PUT /api/tasks/:id/comments/:commentId', () => {
  it('updates comment text', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const c = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: 'Original' }).expect(201);
    const res = await agent().put(`/api/tasks/${task.id}/comments/${c.body.id}`).send({ text: 'Updated' }).expect(200);
    assert.equal(res.body.text, 'Updated');
  });

  it('returns 404 for nonexistent comment', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().put(`/api/tasks/${task.id}/comments/9999`).send({ text: 'Nope' }).expect(404);
  });

  it('rejects empty text', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const c = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: 'Original' }).expect(201);
    await agent().put(`/api/tasks/${task.id}/comments/${c.body.id}`).send({ text: '' }).expect(400);
  });
});

describe('PUT /api/focus/:id', () => {
  it('updates focus session duration', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const f = makeFocus(task.id, { duration_sec: 1500 });
    const res = await agent().put(`/api/focus/${f.id}`).send({ duration_sec: 3000 }).expect(200);
    assert.equal(res.body.duration_sec, 3000);
  });

  it('returns 404 for nonexistent session', async () => {
    await agent().put('/api/focus/9999').send({ duration_sec: 100 }).expect(404);
  });
});

describe('DELETE /api/focus/:id', () => {
  it('deletes focus session', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const f = makeFocus(task.id);
    await agent().delete(`/api/focus/${f.id}`).expect(200);
    // Verify gone — stats should show 0
    const stats = await agent().get('/api/focus/stats').expect(200);
    assert.equal(stats.body.sessions, 0);
  });

  it('returns 404 for nonexistent session', async () => {
    await agent().delete('/api/focus/9999').expect(404);
  });
});

describe('PUT /api/templates/:id', () => {
  it('updates template name and tasks', async () => {
    const tmpl = await agent().post('/api/templates').send({
      name: 'Original', tasks: [{ title: 'Step 1', priority: 0 }]
    }).expect(200);
    const res = await agent().put(`/api/templates/${tmpl.body.id}`).send({
      name: 'Updated', tasks: [{ title: 'Step A', priority: 1 }, { title: 'Step B', priority: 2 }]
    }).expect(200);
    assert.equal(res.body.name, 'Updated');
    assert.equal(res.body.tasks.length, 2);
    assert.equal(res.body.tasks[0].title, 'Step A');
  });

  it('returns 404 for nonexistent template', async () => {
    await agent().put('/api/templates/9999').send({ name: 'Nope' }).expect(404);
  });

  it('partial update - only name', async () => {
    const tmpl = await agent().post('/api/templates').send({
      name: 'Before', tasks: [{ title: 'Keepme', priority: 1 }]
    }).expect(200);
    const res = await agent().put(`/api/templates/${tmpl.body.id}`).send({ name: 'After' }).expect(200);
    assert.equal(res.body.name, 'After');
    assert.equal(res.body.tasks.length, 1); // tasks unchanged
    assert.equal(res.body.tasks[0].title, 'Keepme');
  });
});

describe('DELETE /api/reviews/:id', () => {
  it('deletes weekly review', async () => {
    const rev = await agent().post('/api/reviews').send({
      week_start: '2025-01-06', reflection: 'Good week'
    }).expect(201);
    await agent().delete(`/api/reviews/${rev.body.id}`).expect(200);
    // Verify gone
    const all = await agent().get('/api/reviews').expect(200);
    assert.equal(all.body.length, 0);
  });

  it('returns 404 for nonexistent review', async () => {
    await agent().delete('/api/reviews/9999').expect(404);
  });
});

// ─── Daily Micro-Review API ───

describe('POST /api/reviews/daily', () => {
  it('creates a daily review entry', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id, { status: 'done' });
    const res = await agent().post('/api/reviews/daily').send({
      date: '2026-03-27',
      note: 'Good productive day'
    }).expect(201);
    assert.equal(res.body.date, '2026-03-27');
    assert.equal(res.body.note, 'Good productive day');
    assert.ok(res.body.id);
  });

  it('upserts on duplicate date', async () => {
    await agent().post('/api/reviews/daily').send({
      date: '2026-03-27', note: 'First draft'
    }).expect(201);
    const res = await agent().post('/api/reviews/daily').send({
      date: '2026-03-27', note: 'Updated reflection'
    }).expect(200);
    assert.equal(res.body.note, 'Updated reflection');
    // Only one review for this date
    const get = await agent().get('/api/reviews/daily/2026-03-27').expect(200);
    assert.equal(get.body.note, 'Updated reflection');
  });
});

describe('GET /api/reviews/daily/:date', () => {
  it('returns the review for a given date', async () => {
    await agent().post('/api/reviews/daily').send({
      date: '2026-03-27', note: 'Evening reflections'
    }).expect(201);
    const res = await agent().get('/api/reviews/daily/2026-03-27').expect(200);
    assert.equal(res.body.note, 'Evening reflections');
    assert.equal(res.body.date, '2026-03-27');
  });

  it('includes completed_count for the date', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id);
    const t2 = makeTask(goal.id, { title: 'Task 2' });
    makeTask(goal.id, { title: 'Task 3' });
    // Complete two tasks via API (sets completed_at to today)
    await agent().put(`/api/tasks/${t1.id}`).send({ status: 'done' }).expect(200);
    await agent().put(`/api/tasks/${t2.id}`).send({ status: 'done' }).expect(200);
    const today = new Date().toISOString().split('T')[0];
    await agent().post('/api/reviews/daily').send({
      date: today, note: 'Busy day'
    }).expect(201);
    const res = await agent().get(`/api/reviews/daily/${today}`).expect(200);
    assert.equal(res.body.completed_count, 2);
  });
});
