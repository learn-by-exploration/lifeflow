const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Custom Recurring Patterns (5.1) ───
describe('Custom recurring patterns (JSON config)', () => {
  it('JSON specific-days pattern spawns on correct day', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const cfg = JSON.stringify({ pattern: 'specific-days', days: [1, 3, 5] }); // Mon, Wed, Fri
    const t = makeTask(g.id, { title: 'MWF Task', recurring: cfg, due_date: '2026-03-09', status: 'todo' }); // Monday
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id && x.recurring);
    assert.ok(next, 'Next recurring task should exist');
    // Next should be Wednesday (2026-03-11)
    assert.equal(next.due_date, '2026-03-11');
  });

  it('JSON pattern with endDate stops spawning after date', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const cfg = JSON.stringify({ pattern: 'daily', endDate: '2026-03-02' });
    const t = makeTask(g.id, { title: 'End soon', recurring: cfg, due_date: '2026-03-03', status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id && x.recurring);
    assert.ok(!next, 'Should NOT spawn after endDate');
  });

  it('JSON pattern with interval multiplier', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const cfg = JSON.stringify({ pattern: 'weekly', interval: 2 });
    const t = makeTask(g.id, { title: 'Biweekly JSON', recurring: cfg, due_date: '2026-03-01', status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id);
    assert.ok(next);
    assert.equal(next.due_date, '2026-03-15');
  });

  it('weekdays pattern skips Saturday and Sunday', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Weekday', recurring: 'weekdays', due_date: '2026-03-06', status: 'todo' }); // Friday
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const all = await agent().get(`/api/goals/${g.id}/tasks`);
    const next = all.body.find(x => x.id !== t.id);
    assert.ok(next);
    assert.equal(next.due_date, '2026-03-09'); // Monday
  });
});

// ─── Keyboard Shortcut Rebinding (5.2) ───
describe('Keyboard shortcut rebinding', () => {
  it('shortcut defaults are defined in app.js', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('DEFAULT_SHORTCUTS'), 'Should define DEFAULT_SHORTCUTS');
    assert.ok(appJs.includes('_shortcutMap'), 'Should define _shortcutMap');
    assert.ok(appJs.includes('_matchShortcut'), 'Should define _matchShortcut');
  });

  it('shortcuts settings tab has rebind buttons', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('kb-rebind'), 'Should have rebind button class');
    assert.ok(appJs.includes('set-reset-shortcuts'), 'Should have reset shortcuts button');
  });

  it('saves shortcuts to server via settings API', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes("api.put('/api/settings',{keyboardShortcuts:"), 'Should save via settings API');
  });

  it('has conflict detection when rebinding', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('already used by'), 'Should show conflict message');
  });
});

// ─── Shareable Cards (5.3 + 5.4) ───
describe('Shareable summary and focus cards', () => {
  it('generateShareCard function exists in app.js', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('function generateShareCard'), 'Should have generateShareCard');
  });

  it('shareWeeklySummary function exists', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('async function shareWeeklySummary'), 'Should have shareWeeklySummary');
    assert.ok(appJs.includes('Weekly Summary'), 'Should render weekly title');
  });

  it('shareFocusCard function exists', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes('function shareFocusCard'), 'Should have shareFocusCard');
    assert.ok(appJs.includes('Focus Session Complete'), 'Should render focus title');
  });
});

// ─── Achievement Badges (5.5) ───
describe('Achievement badges API', () => {
  it('GET /api/badges returns empty initially', async () => {
    const res = await agent().get('/api/badges');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });

  it('POST /api/badges/check awards first-10-tasks badge', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 10; i++) {
      makeTask(g.id, { title: `Task ${i}`, status: 'done' });
    }
    const res = await agent().post('/api/badges/check').send({});
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.earned));
    assert.ok(res.body.earned.includes('first-10-tasks'), 'Should earn first-10-tasks badge');
  });

  it('POST /api/badges/check does not duplicate badges', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 10; i++) {
      makeTask(g.id, { title: `Task ${i}`, status: 'done' });
    }
    await agent().post('/api/badges/check').send({});
    const res2 = await agent().post('/api/badges/check').send({});
    assert.equal(res2.body.earned.length, 0, 'Should not duplicate');
  });

  it('badge gallery exists in settings', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes("settingsTab==='badges'"), 'Should have badges tab');
    assert.ok(appJs.includes('Achievement Badges'), 'Should render badge gallery title');
    assert.ok(appJs.includes('emoji_events'), 'Should use emoji_events icon');
  });

  it('POST /api/badges/check awards streak-7 badge', async () => {
    const { db } = setup();
    const a = makeArea();
    const g = makeGoal(a.id);
    // Create tasks completed over 7 consecutive recent days
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      db.prepare('INSERT INTO tasks (title, goal_id, status, completed_at) VALUES (?,?,?,?)').run(`Day${i}`, g.id, 'done', `${ds}T12:00:00.000Z`);
    }
    const res = await agent().post('/api/badges/check').send({});
    assert.ok(res.body.earned.includes('streak-7'), 'Should earn streak-7 badge');
  });
});

// ─── Settings keyboard shortcuts persistence ───
describe('Settings persistence for shortcuts', () => {
  it('keyboardShortcuts setting key exists in defaults', async () => {
    const res = await agent().get('/api/settings');
    assert.equal(res.status, 200);
    assert.ok('keyboardShortcuts' in res.body, 'Should have keyboardShortcuts key');
  });

  it('can save and retrieve keyboard shortcuts', async () => {
    const shortcuts = JSON.stringify({ search: 'ctrl+k', 'quick-add': 'ctrl+n' });
    await agent().put('/api/settings').send({ keyboardShortcuts: shortcuts });
    const res = await agent().get('/api/settings');
    assert.equal(res.body.keyboardShortcuts, shortcuts);
  });
});
