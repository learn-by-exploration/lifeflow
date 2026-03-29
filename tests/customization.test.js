const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeList, makeListItem, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Enhanced Recurring Engine ───
describe('Enhanced recurring engine', () => {
  it('biweekly recurring spawns next task 14 days later', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Biweekly', recurring: 'biweekly', due_date: '2026-03-01', status: 'todo' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    // Check that a new task was spawned
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id && x.recurring === 'biweekly');
    assert.ok(next, 'Next recurring task should exist');
    assert.equal(next.due_date, '2026-03-15');
  });

  it('every-N-days pattern works (every-3-days)', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Every 3', recurring: 'every-3-days', due_date: '2026-03-10', status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id && x.recurring);
    assert.ok(next);
    assert.equal(next.due_date, '2026-03-13');
  });

  it('JSON recurring pattern with specific days', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    // '2026-03-24' is a Tuesday (day 2). specific-days [1,3,5] = Mon,Wed,Fri
    const rec = JSON.stringify({ pattern: 'specific-days', days: [1, 3, 5] });
    const t = makeTask(g.id, { title: 'MWF', recurring: rec, due_date: '2026-03-24', status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id && x.recurring);
    assert.ok(next);
    assert.equal(next.due_date, '2026-03-25'); // Wednesday
  });

  it('JSON recurring with endDate stops spawning', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const rec = JSON.stringify({ pattern: 'daily', endDate: '2026-03-25' });
    const t = makeTask(g.id, { title: 'Limited', recurring: rec, due_date: '2026-03-25', status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    // Next would be 2026-03-26 which is past endDate, so no spawn
    const next = all.body.find(x => x.id !== t.id && x.recurring);
    assert.equal(next, undefined, 'Should not spawn past endDate');
  });

  it('weekdays recurring skips weekends', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    // 2026-03-20 is a Friday
    const t = makeTask(g.id, { title: 'Weekday', recurring: 'weekdays', due_date: '2026-03-20', status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id && x.recurring);
    assert.ok(next);
    assert.equal(next.due_date, '2026-03-23'); // Monday
  });

  it('recurring tasks list endpoint returns recurring tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Daily task', recurring: 'daily', due_date: '2026-03-24' });
    makeTask(g.id, { title: 'Normal task' });
    const res = await agent().get('/api/tasks/recurring');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Daily task');
  });

  it('skip recurring task spawns next occurrence', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Skip me', recurring: 'weekly', due_date: '2026-03-24' });
    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.equal(res.status, 200);
    assert.ok(res.body.next);
    assert.equal(res.body.next.due_date, '2026-03-31');
  });
});

// ─── Save Goal/List as Template ───
describe('Save as template', () => {
  it('POST /api/goals/:id/save-as-template creates template from goal tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id, { title: 'Sprint' });
    makeTask(g.id, { title: 'Task 1' });
    makeTask(g.id, { title: 'Task 2' });
    const res = await agent().post(`/api/goals/${g.id}/save-as-template`).send({ name: 'Sprint Template' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Sprint Template');
    assert.equal(res.body.tasks.length, 2);
  });

  it('POST /api/lists/:id/save-as-template creates template from list items', async () => {
    const l = makeList({ name: 'Checklist' });
    makeListItem(l.id, { title: 'Item 1' });
    makeListItem(l.id, { title: 'Item 2' });
    makeListItem(l.id, { title: 'Item 3' });
    const res = await agent().post(`/api/lists/${l.id}/save-as-template`).send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Checklist');
    assert.equal(res.body.tasks.length, 3);
  });

  it('save-as-template fails for non-existent goal', async () => {
    const res = await agent().post('/api/goals/99999/save-as-template').send({});
    assert.equal(res.status, 404);
  });

  it('save-as-template fails for non-existent list', async () => {
    const res = await agent().post('/api/lists/99999/save-as-template').send({});
    assert.equal(res.status, 404);
  });
});

// ─── Default View per Area ───
describe('Default view per area', () => {
  it('PUT /api/areas/:id with default_view stores it', async () => {
    const a = makeArea();
    const res = await agent().put(`/api/areas/${a.id}`).send({ default_view: 'board' });
    assert.equal(res.status, 200);
    assert.equal(res.body.default_view, 'board');
  });

  it('GET /api/areas returns default_view field', async () => {
    const a = makeArea();
    await agent().put(`/api/areas/${a.id}`).send({ default_view: 'calendar' });
    const res = await agent().get('/api/areas');
    const found = res.body.find(x => x.id === a.id);
    assert.equal(found.default_view, 'calendar');
  });

  it('default_view can be set to null to use global default', async () => {
    const a = makeArea();
    await agent().put(`/api/areas/${a.id}`).send({ default_view: 'board' });
    await agent().put(`/api/areas/${a.id}`).send({ default_view: '' });
    const res = await agent().get('/api/areas');
    const found = res.body.find(x => x.id === a.id);
    assert.equal(found.default_view, null);
  });
});

// ─── Badges ───
describe('Badges', () => {
  it('GET /api/badges returns empty array initially', async () => {
    const res = await agent().get('/api/badges');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('POST /api/badges/check awards first-10-tasks after 10 completions', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 10; i++) {
      makeTask(g.id, { title: `Task ${i}`, status: 'done' });
    }
    const res = await agent().post('/api/badges/check').send({});
    assert.equal(res.status, 200);
    assert.ok(res.body.earned.includes('first-10-tasks'));
  });

  it('badges are not duplicated on repeated checks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 10; i++) makeTask(g.id, { title: `T ${i}`, status: 'done' });
    await agent().post('/api/badges/check').send({});
    const res2 = await agent().post('/api/badges/check').send({});
    assert.deepEqual(res2.body.earned, []);
    // But badge still exists
    const badges = await agent().get('/api/badges');
    assert.equal(badges.body.length, 1);
  });
});

// ─── Demo Mode ───
describe('Demo mode', () => {
  it('POST /api/demo/start creates sample data', async () => {
    const res = await agent().post('/api/demo/start').send({});
    assert.equal(res.status, 200);
    const areasRes = await agent().get('/api/areas');
    assert.ok(areasRes.body.length >= 3);
    const allTasks = await agent().get('/api/tasks/all');
    assert.ok(allTasks.body.length >= 15);
  });

  it('POST /api/demo/reset clears all data', async () => {
    await agent().post('/api/demo/start').send({});
    await agent().post('/api/demo/reset').send({ password: 'testpassword' });
    const areasRes = await agent().get('/api/areas');
    assert.equal(areasRes.body.length, 0);
    const allTasks = await agent().get('/api/tasks/all');
    assert.equal(allTasks.body.length, 0);
  });
});

// ─── Onboarding settings ───
describe('Onboarding settings', () => {
  it('settings include onboardingComplete and userPersona keys', async () => {
    const res = await agent().get('/api/settings');
    assert.equal(res.status, 200);
    assert.equal(res.body.onboardingComplete, 'false');
    assert.equal(res.body.userPersona, '');
  });

  it('can save onboarding persona', async () => {
    await agent().put('/api/settings').send({ userPersona: 'student', onboardingComplete: 'true' });
    const res = await agent().get('/api/settings');
    assert.equal(res.body.userPersona, 'student');
    assert.equal(res.body.onboardingComplete, 'true');
  });
});

// ─── Tag management (existing API) ───
describe('Tag management', () => {
  it('GET /api/tags returns tag list', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run('work', '#FF0000');
    db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run('personal', '#00FF00');
    const res = await agent().get('/api/tags');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 2);
  });

  it('PUT /api/tags/:id renames a tag', async () => {
    const { db } = setup();
    const r = db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run('old-name', '#FF0000');
    const res = await agent().put(`/api/tags/${r.lastInsertRowid}`).send({ name: 'new-name' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'new-name');
  });

  it('DELETE /api/tags/:id removes a tag', async () => {
    const { db } = setup();
    const r = db.prepare('INSERT INTO tags (name, color) VALUES (?,?)').run('temp-tag', '#000');
    const res = await agent().delete(`/api/tags/${r.lastInsertRowid}`);
    assert.equal(res.status, 200);
  });
});

// ─── Template CRUD with source_type ───
describe('Template CRUD', () => {
  it('POST /api/templates creates a user template', async () => {
    const res = await agent().post('/api/templates').send({
      name: 'My Template', tasks: [{ title: 'Step 1' }]
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
  });

  it('PUT /api/templates/:id updates template', async () => {
    const cr = await agent().post('/api/templates').send({ name: 'Old', tasks: [{ title: 'A' }] });
    const res = await agent().put(`/api/templates/${cr.body.id}`).send({ name: 'New' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'New');
  });

  it('DELETE /api/templates/:id removes template', async () => {
    const cr = await agent().post('/api/templates').send({ name: 'Del', tasks: [{ title: 'A' }] });
    const res = await agent().delete(`/api/templates/${cr.body.id}`);
    assert.equal(res.status, 200);
  });

  it('POST /api/templates/:id/apply creates tasks in goal', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const cr = await agent().post('/api/templates').send({
      name: 'Apply Me', tasks: [{ title: 'T1', priority: 1 }, { title: 'T2', priority: 0 }]
    });
    const res = await agent().post(`/api/templates/${cr.body.id}/apply`).send({ goalId: g.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.created.length, 2);
  });
});
