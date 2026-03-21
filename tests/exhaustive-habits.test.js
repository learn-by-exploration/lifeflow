const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, today, daysFromNow } = require('./helpers');

describe('Habits API – exhaustive coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── GET /api/habits ─────────────────────────────────────────────

  it('returns empty array when no habits', async () => {
    const res = await agent().get('/api/habits');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('is_completed_today is false when not logged today', async () => {
    await agent().post('/api/habits').send({ name: 'Yoga', icon: '🧘', target: 1 });
    const res = await agent().get('/api/habits');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].completed, false);
    assert.equal(res.body[0].todayCount, 0);
  });

  it('computes streak for consecutive days', async () => {
    const { db } = setup();
    const { body: h } = await agent().post('/api/habits').send({ name: 'Run', icon: '🏃', target: 1 });

    // Insert logs for yesterday, day before, and day before that
    const d1 = daysFromNow(-1);
    const d2 = daysFromNow(-2);
    const d3 = daysFromNow(-3);
    db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, d1, 1);
    db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, d2, 1);
    db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, d3, 1);

    const res = await agent().get('/api/habits');
    const habit = res.body.find(x => x.id === h.id);
    assert.ok(habit.streak >= 3, `Expected streak >= 3, got ${habit.streak}`);
  });

  // ── POST /api/habits ────────────────────────────────────────────

  it('uses default icon/color/frequency/target when omitted', async () => {
    const res = await agent().post('/api/habits').send({ name: 'Basic' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Basic');
    assert.equal(res.body.icon, '✅');
    assert.equal(res.body.color, '#22C55E');
    assert.equal(res.body.frequency, 'daily');
    assert.equal(res.body.target, 1);
    assert.equal(res.body.position, 0);
  });

  it('creates with custom frequency and target', async () => {
    const res = await agent().post('/api/habits').send({
      name: 'Gym', icon: '🏋️', color: '#3B82F6', frequency: 'weekly', target: 3
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.frequency, 'weekly');
    assert.equal(res.body.target, 3);
    assert.equal(res.body.color, '#3B82F6');
  });

  // ── PUT /api/habits/:id ─────────────────────────────────────────

  it('returns 404 for nonexistent habit', async () => {
    const res = await agent().put('/api/habits/99999').send({ name: 'Ghost' });
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('partial update – only name', async () => {
    const { body: h } = await agent().post('/api/habits').send({
      name: 'Read', icon: '📖', color: '#FF0000', target: 2
    });
    const res = await agent().put('/api/habits/' + h.id).send({ name: 'Read Books' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Read Books');
    // Other fields unchanged
    assert.equal(res.body.icon, '📖');
    assert.equal(res.body.color, '#FF0000');
    assert.equal(res.body.target, 2);
  });

  it('partial update – only archived flag', async () => {
    const { body: h } = await agent().post('/api/habits').send({ name: 'Meditate', icon: '🧘' });
    assert.equal(h.archived, 0);

    const res = await agent().put('/api/habits/' + h.id).send({ archived: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.body.archived, 1);
    assert.equal(res.body.name, 'Meditate');  // name unchanged

    // Archived habit no longer shows in GET list (which filters archived=0)
    const list = await agent().get('/api/habits');
    assert.equal(list.body.length, 0);
  });

  // ── DELETE /api/habits/:id ──────────────────────────────────────

  it('cascades to logs when deleting habit', async () => {
    const { db } = setup();
    const { body: h } = await agent().post('/api/habits').send({ name: 'Stretch', icon: '🤸', target: 1 });

    // Log the habit a couple of times
    await agent().post('/api/habits/' + h.id + '/log').send({});
    await agent().post('/api/habits/' + h.id + '/log').send({ date: daysFromNow(-1) });

    // Verify logs exist
    const logsBefore = db.prepare('SELECT COUNT(*) as c FROM habit_logs WHERE habit_id=?').get(h.id);
    assert.ok(logsBefore.c >= 2);

    // Delete the habit
    const del = await agent().delete('/api/habits/' + h.id);
    assert.equal(del.status, 200);
    assert.deepEqual(del.body, { ok: true });

    // Logs should be cascade-deleted
    const logsAfter = db.prepare('SELECT COUNT(*) as c FROM habit_logs WHERE habit_id=?').get(h.id);
    assert.equal(logsAfter.c, 0);
  });

  // ── POST /api/habits/:id/log ────────────────────────────────────

  it('returns 404 when logging nonexistent habit', async () => {
    const res = await agent().post('/api/habits/99999/log').send({});
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('defaults date to today when not provided', async () => {
    const { body: h } = await agent().post('/api/habits').send({ name: 'Water', icon: '💧', target: 1 });
    const res = await agent().post('/api/habits/' + h.id + '/log').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.date, today());
    assert.equal(res.body.count, 1);
  });

  it('increments count on repeated log for same date', async () => {
    const { body: h } = await agent().post('/api/habits').send({ name: 'Push-ups', icon: '💪', target: 5 });
    await agent().post('/api/habits/' + h.id + '/log').send({});
    await agent().post('/api/habits/' + h.id + '/log').send({});
    const res = await agent().post('/api/habits/' + h.id + '/log').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 3);
    assert.equal(res.body.date, today());
  });

  it('can log for a specific past date', async () => {
    const { body: h } = await agent().post('/api/habits').send({ name: 'Journal', icon: '📝', target: 1 });
    const pastDate = daysFromNow(-5);
    const res = await agent().post('/api/habits/' + h.id + '/log').send({ date: pastDate });
    assert.equal(res.status, 200);
    assert.equal(res.body.date, pastDate);
    assert.equal(res.body.count, 1);
  });

  // ── DELETE /api/habits/:id/log ──────────────────────────────────

  it('returns 404 when unlogging nonexistent habit', async () => {
    const res = await agent().delete('/api/habits/99999/log').send({});
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('decrements count but keeps log if count > 1', async () => {
    const { db } = setup();
    const { body: h } = await agent().post('/api/habits').send({ name: 'Sit-ups', icon: '🏋️', target: 3 });

    // Log 3 times to get count=3
    await agent().post('/api/habits/' + h.id + '/log').send({});
    await agent().post('/api/habits/' + h.id + '/log').send({});
    await agent().post('/api/habits/' + h.id + '/log').send({});

    // Unlog once → count should be 2
    await agent().delete('/api/habits/' + h.id + '/log').send({});

    const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(h.id, today());
    assert.ok(log, 'log row should still exist');
    assert.equal(log.count, 2);
  });

  it('removes log entirely when count reaches 0', async () => {
    const { db } = setup();
    const { body: h } = await agent().post('/api/habits').send({ name: 'Walk', icon: '🚶', target: 1 });

    // Log once, then unlog once
    await agent().post('/api/habits/' + h.id + '/log').send({});
    await agent().delete('/api/habits/' + h.id + '/log').send({});

    const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(h.id, today());
    assert.equal(log, undefined, 'log row should be deleted');
  });

  // ── GET /api/habits/:id/heatmap ─────────────────────────────────

  it('returns 404 for nonexistent habit heatmap', async () => {
    const res = await agent().get('/api/habits/99999/heatmap');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns empty array when habit has no logs', async () => {
    const { body: h } = await agent().post('/api/habits').send({ name: 'Code', icon: '💻', target: 1 });
    const res = await agent().get('/api/habits/' + h.id + '/heatmap');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
});
