const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeHabit, logHabit, agent, today, daysFromNow, serverLocalDate } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Habits Area Link (Feature 1.6) ───

describe('Habits area_id', () => {
  it('POST /api/habits accepts area_id', async () => {
    const a = makeArea({ name: 'Health' });
    const res = await agent().post('/api/habits').send({ name: 'Exercise', area_id: a.id }).expect(201);
    assert.equal(res.body.area_id, a.id);
  });

  it('POST /api/habits with null area_id works', async () => {
    const res = await agent().post('/api/habits').send({ name: 'Meditate' }).expect(201);
    assert.equal(res.body.area_id, null);
  });

  it('POST /api/habits rejects invalid area_id', async () => {
    await agent().post('/api/habits').send({ name: 'X', area_id: 99999 }).expect(400);
  });

  it('GET /api/habits includes area_name and area_icon', async () => {
    const a = makeArea({ name: 'Fitness', icon: '💪' });
    makeHabit({ name: 'Run', area_id: a.id });
    const res = await agent().get('/api/habits').expect(200);
    const hab = res.body.find(h => h.name === 'Run');
    assert.equal(hab.area_name, 'Fitness');
    assert.equal(hab.area_icon, '💪');
  });

  it('GET /api/habits returns null area fields when no area', async () => {
    makeHabit({ name: 'Solo' });
    const res = await agent().get('/api/habits').expect(200);
    const hab = res.body.find(h => h.name === 'Solo');
    assert.equal(hab.area_name, null);
  });

  it('PUT /api/habits/:id updates area_id', async () => {
    const a = makeArea({ name: 'Work' });
    const hab = makeHabit({ name: 'Read' });
    const res = await agent().put('/api/habits/' + hab.id).send({ area_id: a.id }).expect(200);
    assert.equal(res.body.area_id, a.id);
  });

  it('PUT /api/habits/:id can clear area_id', async () => {
    const a = makeArea({ name: 'Work' });
    const hab = makeHabit({ name: 'Read', area_id: a.id });
    const res = await agent().put('/api/habits/' + hab.id).send({ area_id: null }).expect(200);
    assert.equal(res.body.area_id, null);
  });
});

// ─── Habit total_completions & logged_today (Feature 1.5) ───

describe('Habit enrichment', () => {
  it('GET /api/habits returns total_completions', async () => {
    const hab = makeHabit({ name: 'Stretch' });
    logHabit(hab.id, serverLocalDate(0));
    logHabit(hab.id, serverLocalDate(-1));
    logHabit(hab.id, serverLocalDate(-2));
    const res = await agent().get('/api/habits').expect(200);
    const h = res.body.find(x => x.name === 'Stretch');
    assert.equal(h.total_completions, 3);
  });

  it('GET /api/habits returns logged_today', async () => {
    const hab = makeHabit({ name: 'Water' });
    logHabit(hab.id, today());
    const res = await agent().get('/api/habits').expect(200);
    const h = res.body.find(x => x.name === 'Water');
    assert.equal(h.logged_today, true);
  });

  it('GET /api/habits logged_today is false when not logged', async () => {
    const hab = makeHabit({ name: 'Nap' });
    const res = await agent().get('/api/habits').expect(200);
    const h = res.body.find(x => x.name === 'Nap');
    assert.equal(h.logged_today, false);
  });
});

// ─── Balance Alert (Feature 1.7) ───

describe('GET /api/stats/balance', () => {
  it('returns empty areas when no tasks', async () => {
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.deepEqual(res.body.areas, []);
    assert.equal(res.body.dominant, null);
  });

  it('returns area percentages', async () => {
    const a1 = makeArea({ name: 'Work' });
    const a2 = makeArea({ name: 'Health' });
    const g1 = makeGoal(a1.id, { title: 'Ship Feature' });
    const g2 = makeGoal(a2.id, { title: 'Exercise' });
    makeTask(g1.id, { title: 'Code' });
    makeTask(g1.id, { title: 'Review' });
    makeTask(g1.id, { title: 'Deploy' });
    makeTask(g2.id, { title: 'Run' });
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.equal(res.body.areas.length, 2);
    assert.equal(res.body.total, 4);
    // Work has 3/4 = 75%
    const work = res.body.areas.find(a => a.name === 'Work');
    assert.equal(work.pct, 75);
  });

  it('identifies dominant area >60%', async () => {
    const a1 = makeArea({ name: 'Career' });
    const a2 = makeArea({ name: 'Health' });
    const g1 = makeGoal(a1.id, { title: 'Ship' });
    const g2 = makeGoal(a2.id, { title: 'Gym' });
    for (let i = 0; i < 8; i++) makeTask(g1.id, { title: 'T' + i });
    makeTask(g2.id, { title: 'Run' });
    makeTask(g2.id, { title: 'Yoga' });
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.ok(res.body.dominant);
    assert.equal(res.body.dominant.name, 'Career');
    assert.ok(res.body.dominant.pct > 60);
  });

  it('returns null dominant when balanced', async () => {
    const a1 = makeArea({ name: 'A' });
    const a2 = makeArea({ name: 'B' });
    const g1 = makeGoal(a1.id, { title: 'G1' });
    const g2 = makeGoal(a2.id, { title: 'G2' });
    makeTask(g1.id, { title: 'T1' });
    makeTask(g2.id, { title: 'T2' });
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.equal(res.body.dominant, null);
  });

  it('includes lowest area', async () => {
    const a1 = makeArea({ name: 'Work' });
    const a2 = makeArea({ name: 'Fun' });
    const g1 = makeGoal(a1.id, { title: 'G' });
    const g2 = makeGoal(a2.id, { title: 'G' });
    for (let i = 0; i < 5; i++) makeTask(g1.id, { title: 'W' + i });
    makeTask(g2.id, { title: 'F1' });
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.ok(res.body.lowest);
    assert.equal(res.body.lowest.name, 'Fun');
  });
});
