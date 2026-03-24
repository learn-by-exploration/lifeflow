const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeList, makeListItem, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Landing Page (6.1) ───
describe('Landing page', () => {
  it('landing.html exists with required sections', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'landing.html'), 'utf8');
    assert.ok(html.includes('LifeFlow'), 'Should mention LifeFlow');
    assert.ok(html.includes('id="features"'), 'Should have features section');
    assert.ok(html.includes('id="get-started"'), 'Should have get-started section');
  });

  it('landing.css exists', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'landing.css'), 'utf8');
    assert.ok(css.includes('.ln-hero'), 'Should have hero styles');
    assert.ok(css.includes('.ln-card'), 'Should have card styles');
  });
});

// ─── Changelog View (6.2) ───
describe('Changelog view', () => {
  it('renderChangelog function exists in app.js', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('function renderChangelog'), 'Should have renderChangelog');
    assert.ok(appJs.includes("currentView==='changelog'"), 'Should handle changelog view');
  });

  it('changelog button exists in sidebar', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('sb-changelog-btn'), 'Should have changelog button in sidebar');
  });

  it('changelog button is wired in app.js', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes("sb-changelog-btn"), 'Should wire changelog button');
    assert.ok(appJs.includes("go('changelog')"), 'Should navigate to changelog');
  });
});

// ─── Bug Bash Regression (6.3) — Full API round-trip tests ───
describe('Bug bash: full regression', () => {
  it('task CRUD full lifecycle', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    // Create
    const cr = await agent().post(`/api/goals/${g.id}/tasks`).send({ title: 'Regression test', priority: 3 });
    assert.ok(cr.status === 200 || cr.status === 201);
    const id = cr.body.id;
    // Read
    const rd = await agent().get(`/api/tasks/${id}`);
    assert.equal(rd.body.title, 'Regression test');
    // Update
    const up = await agent().put(`/api/tasks/${id}`).send({ title: 'Updated', priority: 1 });
    assert.equal(up.status, 200);
    assert.equal(up.body.title, 'Updated');
    // Complete
    const done = await agent().put(`/api/tasks/${id}`).send({ status: 'done' });
    assert.equal(done.status, 200);
    // Delete
    const del = await agent().delete(`/api/tasks/${id}`);
    assert.equal(del.status, 200);
  });

  it('area → goal → task hierarchy is consistent', async () => {
    const a = makeArea({ name: 'Regression Area' });
    const g = makeGoal(a.id, { title: 'Regression Goal' });
    const t = makeTask(g.id, { title: 'Regression Task' });
    const areas = await agent().get('/api/areas');
    assert.ok(areas.body.some(x => x.id === a.id));
    const goals = await agent().get(`/api/areas/${a.id}/goals`);
    assert.ok(goals.body.some(x => x.id === g.id));
    const tasks = await agent().get(`/api/goals/${g.id}/tasks`);
    assert.ok(tasks.body.some(x => x.id === t.id));
  });

  it('settings save and retrieve round-trip', async () => {
    await agent().put('/api/settings').send({ theme: 'dark', focusDuration: '30' });
    const res = await agent().get('/api/settings');
    assert.equal(res.body.theme, 'dark');
    assert.equal(res.body.focusDuration, '30');
  });

  it('search works across all entity types', async () => {
    const a = makeArea({ name: 'SearchArea' });
    const g = makeGoal(a.id, { title: 'SearchGoal' });
    makeTask(g.id, { title: 'SearchTask' });
    const res = await agent().get('/api/tasks/search?q=Search');
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
  });

  it('focus session full lifecycle', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Focus target' });
    // Start
    const start = await agent().post('/api/focus').send({ task_id: t.id, duration_sec: 1500, type: 'pomodoro' });
    assert.ok(start.status === 200 || start.status === 201);
    const sid = start.body.id;
    // Update
    const end = await agent().put(`/api/focus/${sid}`).send({ duration_sec: 1500 });
    assert.equal(end.status, 200);
    // History
    const hist = await agent().get('/api/focus/history');
    assert.ok(hist.body.items.length >= 1);
  });

  it('habit logging works correctly', async () => {
    const { db } = setup();
    const hid = db.prepare('INSERT INTO habits (name, frequency) VALUES (?,?)').run('Test habit', 'daily').lastInsertRowid;
    const today = new Date().toISOString().slice(0, 10);
    const res = await agent().post(`/api/habits/${hid}/log`).send({ date: today });
    assert.ok(res.status === 200 || res.status === 201);
    // Verify via heatmap endpoint
    const hm = await agent().get(`/api/habits/${hid}/heatmap`);
    assert.equal(hm.status, 200);
  });

  it('template create and apply round-trip', async () => {
    // Create template
    const cr = await agent().post('/api/templates').send({ name: 'Regression Template', tasks: [{ title: 'Step 1' }] });
    assert.equal(cr.status, 200);
    const tid = cr.body.id;
    // Apply
    const a = makeArea();
    const g = makeGoal(a.id);
    const ap = await agent().post(`/api/templates/${tid}/apply`).send({ goalId: g.id });
    assert.equal(ap.status, 200);
    const tasks = await agent().get(`/api/goals/${g.id}/tasks`);
    assert.ok(tasks.body.length >= 1);
  });

  it('demo mode start and reset', async () => {
    const start = await agent().post('/api/demo/start').send({});
    assert.equal(start.status, 200);
    const areas = await agent().get('/api/areas');
    assert.ok(areas.body.length >= 3, 'Demo should create areas');
    const reset = await agent().post('/api/demo/reset').send({});
    assert.equal(reset.status, 200);
    const areasAfter = await agent().get('/api/areas');
    assert.equal(areasAfter.body.length, 0, 'Reset should clear all');
  });

  it('badges check returns valid response', async () => {
    const res = await agent().post('/api/badges/check').send({});
    assert.equal(res.status, 200);
    assert.ok('earned' in res.body);
    assert.ok(Array.isArray(res.body.earned));
  });
});

// ─── Performance Audit (6.4) ───
describe('Performance audit', () => {
  it('GET /api/areas responds under 50ms', async () => {
    const start = performance.now();
    await agent().get('/api/areas');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Areas API took ${elapsed.toFixed(1)}ms (expected <50ms)`);
  });

  it('GET /api/stats responds under 100ms', async () => {
    // Create some data for realistic load
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 50; i++) makeTask(g.id, { title: `Perf task ${i}`, status: i < 25 ? 'done' : 'todo' });
    const start = performance.now();
    await agent().get('/api/stats');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `Stats API took ${elapsed.toFixed(1)}ms (expected <100ms)`);
  });

  it('GET /api/tasks/search responds under 100ms with data', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 50; i++) makeTask(g.id, { title: `Search perf task ${i}` });
    const start = performance.now();
    await agent().get('/api/tasks/search?q=perf');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `Search API took ${elapsed.toFixed(1)}ms (expected <100ms)`);
  });
});

// ─── PWA & Meta (6.6) ───
describe('PWA manifest and meta tags', () => {
  it('manifest.json has correct fields', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, 'LifeFlow');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.length >= 2, 'Should have at least 2 icons');
    assert.ok(manifest.shortcuts.length >= 1, 'Should have at least 1 shortcut');
  });

  it('index.html has required meta tags', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('apple-mobile-web-app-capable'), 'Should have apple-mobile-web-app-capable');
    assert.ok(html.includes('theme-color'), 'Should have theme-color');
    assert.ok(html.includes('rel="manifest"'), 'Should link to manifest');
    assert.ok(html.includes('rel="icon"'), 'Should have favicon');
  });
});
