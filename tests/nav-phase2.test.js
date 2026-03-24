const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent, today, daysFromNow } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Settings: New keys (Features 2.4–2.7) ───

describe('Settings: custom labels & thresholds', () => {
  it('GET /api/settings returns default statusLabels', async () => {
    const res = await agent().get('/api/settings').expect(200);
    assert.ok(res.body.statusLabels);
    const sl = JSON.parse(res.body.statusLabels);
    assert.equal(sl.todo, 'To Do');
    assert.equal(sl.doing, 'In Progress');
    assert.equal(sl.done, 'Done');
  });

  it('PUT /api/settings saves statusLabels', async () => {
    const labels = JSON.stringify({ todo: 'Backlog', doing: 'Active', done: 'Complete' });
    const res = await agent().put('/api/settings').send({ statusLabels: labels }).expect(200);
    const sl = JSON.parse(res.body.statusLabels);
    assert.equal(sl.todo, 'Backlog');
    assert.equal(sl.done, 'Complete');
  });

  it('GET /api/settings returns default priorityLabels', async () => {
    const res = await agent().get('/api/settings').expect(200);
    const pl = JSON.parse(res.body.priorityLabels);
    assert.equal(pl['0'], 'None');
    assert.equal(pl['3'], 'Critical');
  });

  it('PUT /api/settings saves priorityLabels and priorityColors', async () => {
    const labels = JSON.stringify({ '0': 'Low', '1': 'Medium', '2': 'High', '3': 'Urgent' });
    const colors = JSON.stringify({ '0': '#999', '1': '#0AF', '2': '#FA0', '3': '#F00' });
    await agent().put('/api/settings').send({ priorityLabels: labels, priorityColors: colors }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    const pl = JSON.parse(res.body.priorityLabels);
    assert.equal(pl['3'], 'Urgent');
    const pc = JSON.parse(res.body.priorityColors);
    assert.equal(pc['3'], '#F00');
  });

  it('GET /api/settings returns default smartFilterStale', async () => {
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.smartFilterStale, '7');
  });

  it('PUT /api/settings changes smartFilterStale', async () => {
    await agent().put('/api/settings').send({ smartFilterStale: '14' }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.smartFilterStale, '14');
  });

  it('PUT /api/settings changes smartFilterQuickWin', async () => {
    await agent().put('/api/settings').send({ smartFilterQuickWin: '30' }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.smartFilterQuickWin, '30');
  });

  it('PUT /api/settings saves groceryCategories', async () => {
    const cats = JSON.stringify(['Dairy', 'Produce', 'Bakery']);
    await agent().put('/api/settings').send({ groceryCategories: cats }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.groceryCategories, cats);
  });
});

// ─── Smart Filters: Configurable thresholds (Feature 2.7) ───

describe('Smart filter configurable thresholds', () => {
  it('stale filter uses customized threshold', async () => {
    const a = makeArea({ name: 'Work' });
    const g = makeGoal(a.id, { title: 'Project' });
    // Create an old task (20 days ago)
    const t = makeTask(g.id, { title: 'Old task' });
    const { db } = setup();
    db.prepare("UPDATE tasks SET created_at = datetime('now', '-20 days') WHERE id = ?").run(t.id);
    // Default threshold is 7 days — should appear
    let res = await agent().get('/api/filters/smart/stale').expect(200);
    assert.ok(res.body.some(x => x.id === t.id));
    // Set threshold to 30 days — should NOT appear (only 20 days old)
    await agent().put('/api/settings').send({ smartFilterStale: '30' }).expect(200);
    res = await agent().get('/api/filters/smart/stale').expect(200);
    assert.ok(!res.body.some(x => x.id === t.id));
  });

  it('quickwins filter uses customized threshold', async () => {
    const a = makeArea({ name: 'Work' });
    const g = makeGoal(a.id, { title: 'Project' });
    const t = makeTask(g.id, { title: '20min task' });
    const { db } = setup();
    db.prepare('UPDATE tasks SET estimated_minutes = 20 WHERE id = ?').run(t.id);
    // Default threshold is 15 min — should NOT appear
    let res = await agent().get('/api/filters/smart/quickwins').expect(200);
    assert.ok(!res.body.some(x => x.id === t.id));
    // Set threshold to 30 min — should appear
    await agent().put('/api/settings').send({ smartFilterQuickWin: '30' }).expect(200);
    res = await agent().get('/api/filters/smart/quickwins').expect(200);
    assert.ok(res.body.some(x => x.id === t.id));
  });
});

// ─── Weekly Review: Enhanced (Feature 2.3) ───

describe('Weekly Review: enhanced', () => {
  it('GET /api/reviews/current includes areaStats', async () => {
    const a = makeArea({ name: 'Health' });
    const res = await agent().get('/api/reviews/current').expect(200);
    assert.ok(Array.isArray(res.body.areaStats));
    assert.ok(res.body.areaStats.some(x => x.name === 'Health'));
  });

  it('GET /api/reviews/current includes inboxCount', async () => {
    const res = await agent().get('/api/reviews/current').expect(200);
    assert.equal(typeof res.body.inboxCount, 'number');
  });

  it('POST /api/reviews accepts rating', async () => {
    const data = await agent().get('/api/reviews/current').expect(200);
    const res = await agent().post('/api/reviews').send({
      week_start: data.body.weekStart,
      top_accomplishments: ['Built feature'],
      reflection: 'Good week',
      next_week_priorities: ['Ship it'],
      rating: 4
    }).expect(201);
    assert.equal(res.body.rating, 4);
  });

  it('POST /api/reviews clamps rating to 1-5', async () => {
    const data = await agent().get('/api/reviews/current').expect(200);
    const res = await agent().post('/api/reviews').send({
      week_start: data.body.weekStart,
      rating: 99
    }).expect(201);
    assert.equal(res.body.rating, 5);
  });

  it('GET /api/reviews returns rating in past reviews', async () => {
    const data = await agent().get('/api/reviews/current').expect(200);
    await agent().post('/api/reviews').send({ week_start: data.body.weekStart, rating: 3 }).expect(201);
    const res = await agent().get('/api/reviews').expect(200);
    assert.ok(res.body.length > 0);
    assert.equal(res.body[0].rating, 3);
  });
});

// ─── Grocery categories (Feature 2.6) ───

describe('Grocery category settings', () => {
  it('GET /api/lists/categories/configured returns defaults', async () => {
    const res = await agent().get('/api/lists/categories/configured').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
  });

  it('GET /api/lists/categories/configured reads from settings', async () => {
    const cats = ['Dairy', 'Produce', 'Bakery'];
    await agent().put('/api/settings').send({ groceryCategories: JSON.stringify(cats) }).expect(200);
    const res = await agent().get('/api/lists/categories/configured').expect(200);
    assert.deepEqual(res.body, cats);
  });
});

// ─── Static file: store.js (Feature 2.10) ───

describe('store.js static file', () => {
  it('GET /store.js returns JavaScript', async () => {
    await agent().get('/store.js').expect(200).expect('content-type', /javascript/);
  });
});
