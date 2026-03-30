const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, today, daysFromNow, makeArea, makeHabit } = require('./helpers');

describe('Habit System Edge Cases', () => {
  let db;
  before(() => { ({ db } = setup()); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── Streak edge cases ─────────────────────────────────────────

  describe('Streak calculation', () => {
    it('streak is 0 when no logs exist', async () => {
      await agent().post('/api/habits').send({ name: 'NoLogs', target: 1 });
      const res = await agent().get('/api/habits');
      assert.equal(res.body[0].streak, 0);
      assert.equal(res.body[0].completed, false);
    });

    it('streak=1 when logged today only', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'TodayOnly', target: 1 });
      await agent().post(`/api/habits/${h.id}/log`).send({ date: today() });
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.streak, 1);
      assert.equal(habit.completed, true);
    });

    it('streak=1 when logged yesterday only (not today)', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'YestOnly', target: 1 });
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, daysFromNow(-1), 1);
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.streak, 1);
      assert.equal(habit.completed, false);
    });

    it('gap in logs resets streak', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'GapStreak', target: 1 });
      // Log today and 3 days ago (gap at -1 and -2)
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, today(), 1);
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, daysFromNow(-3), 1);
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      // Streak should be 1 (today only), gap at -1 breaks it
      assert.equal(habit.streak, 1);
    });

    it('streak requires count >= target for multi-target habits', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'MultiTarget', target: 3 });
      // Log today with count=2 (below target=3) and yesterday with count=3
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, today(), 2);
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, daysFromNow(-1), 3);
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      // Today count < target, so streak starts from yesterday: streak=1
      assert.equal(habit.streak, 1);
      assert.equal(habit.completed, false);
    });
  });

  // ── Multi-target completion ───────────────────────────────────

  describe('Multi-target completion', () => {
    it('target=3: 1 log → todayCount=1, not completed', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'T3', target: 3 });
      await agent().post(`/api/habits/${h.id}/log`).send({});
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.todayCount, 1);
      assert.equal(habit.completed, false);
    });

    it('target=3: 3 logs → todayCount=3, completed', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'T3Done', target: 3 });
      await agent().post(`/api/habits/${h.id}/log`).send({});
      await agent().post(`/api/habits/${h.id}/log`).send({});
      await agent().post(`/api/habits/${h.id}/log`).send({});
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.todayCount, 3);
      assert.equal(habit.completed, true);
    });

    it('target=3: undo from count=3 → todayCount=2, not completed', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'T3Undo', target: 3 });
      await agent().post(`/api/habits/${h.id}/log`).send({});
      await agent().post(`/api/habits/${h.id}/log`).send({});
      await agent().post(`/api/habits/${h.id}/log`).send({});
      await agent().delete(`/api/habits/${h.id}/log`).send({});
      const res = await agent().get('/api/habits');
      const habit = res.body.find(x => x.id === h.id);
      assert.equal(habit.todayCount, 2);
      assert.equal(habit.completed, false);
    });
  });

  // ── Log boundary conditions ───────────────────────────────────

  describe('Log boundary conditions', () => {
    it('undo when no log exists → graceful 200', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'NoLog', target: 1 });
      const res = await agent().delete(`/api/habits/${h.id}/log`).send({});
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
    });

    it('log future date → accepted', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Future', target: 1 });
      const futureDate = daysFromNow(30);
      const res = await agent().post(`/api/habits/${h.id}/log`).send({ date: futureDate });
      assert.equal(res.status, 200);
      assert.equal(res.body.date, futureDate);
      assert.equal(res.body.count, 1);
    });

    it('log very old date → accepted', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Old', target: 1 });
      const res = await agent().post(`/api/habits/${h.id}/log`).send({ date: '2020-01-01' });
      assert.equal(res.status, 200);
      assert.equal(res.body.date, '2020-01-01');
      assert.equal(res.body.count, 1);
    });

    it('undo for specific past date removes log', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'UndoPast', target: 1 });
      const pastDate = daysFromNow(-5);
      await agent().post(`/api/habits/${h.id}/log`).send({ date: pastDate });
      const res = await agent().delete(`/api/habits/${h.id}/log`).send({ date: pastDate });
      assert.equal(res.status, 200);
      // Verify log is deleted
      const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(h.id, pastDate);
      assert.equal(log, undefined);
    });
  });

  // ── Archived habits ───────────────────────────────────────────

  describe('Archived habits', () => {
    it('heatmap still accessible for archived habit', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Archive', target: 1 });
      await agent().post(`/api/habits/${h.id}/log`).send({});
      await agent().put(`/api/habits/${h.id}`).send({ archived: 1 });
      const res = await agent().get(`/api/habits/${h.id}/heatmap`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('unarchive restores habit to GET list', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Restore', target: 1 });
      await agent().put(`/api/habits/${h.id}`).send({ archived: 1 });
      let list = await agent().get('/api/habits');
      assert.equal(list.body.length, 0);
      await agent().put(`/api/habits/${h.id}`).send({ archived: 0 });
      list = await agent().get('/api/habits');
      assert.equal(list.body.length, 1);
      assert.equal(list.body[0].name, 'Restore');
    });

    it('logging an archived habit still works', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'ArcLog', target: 1 });
      await agent().put(`/api/habits/${h.id}`).send({ archived: 1 });
      const res = await agent().post(`/api/habits/${h.id}/log`).send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 1);
    });
  });

  // ── Area association ──────────────────────────────────────────

  describe('Habit area association', () => {
    it('habit with valid area_id returns area_name and area_icon', async () => {
      const area = makeArea({ name: 'Health', icon: '🏥' });
      const res = await agent().post('/api/habits').send({ name: 'WithArea', area_id: area.id });
      assert.equal(res.status, 201);
      // GET list should include area info via JOIN
      const list = await agent().get('/api/habits');
      const habit = list.body.find(x => x.name === 'WithArea');
      assert.equal(habit.area_name, 'Health');
      assert.equal(habit.area_icon, '🏥');
    });

    it('invalid area_id → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'BadArea', area_id: 99999 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('null area_id → accepted (no area)', async () => {
      const res = await agent().post('/api/habits').send({ name: 'NoArea', area_id: null });
      assert.equal(res.status, 201);
      assert.equal(res.body.area_id, null);
    });

    it('area deletion leaves habit with null area_name in list', async () => {
      const area = makeArea({ name: 'Temp', icon: '🗑️' });
      await agent().post('/api/habits').send({ name: 'Orphan', area_id: area.id });
      // Delete the area via API
      await agent().delete(`/api/areas/${area.id}`);
      const list = await agent().get('/api/habits');
      const habit = list.body.find(x => x.name === 'Orphan');
      assert.ok(habit);
      assert.equal(habit.area_name, null);
    });
  });

  // ── Frequency & schedule validation ───────────────────────────

  describe('Frequency & schedule validation', () => {
    it('daily frequency accepted', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Daily', frequency: 'daily' });
      assert.equal(res.status, 201);
      assert.equal(res.body.frequency, 'daily');
    });

    it('weekly with schedule_days accepted', async () => {
      const res = await agent().post('/api/habits').send({
        name: 'WeekHabit', frequency: 'weekly', schedule_days: ['mon', 'wed', 'fri']
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.frequency, 'weekly');
      assert.deepEqual(res.body.schedule_days, ['mon', 'wed', 'fri']);
    });

    it('monthly with schedule_days (day numbers) accepted', async () => {
      const res = await agent().post('/api/habits').send({
        name: 'MonthHabit', frequency: 'monthly', schedule_days: [1, 15]
      });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.schedule_days, [1, 15]);
    });

    it('yearly frequency accepted', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Yearly', frequency: 'yearly' });
      assert.equal(res.status, 201);
      assert.equal(res.body.frequency, 'yearly');
    });

    it('invalid frequency → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Bad', frequency: 'biweekly' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('frequency'));
    });

    it('weekly schedule_days with invalid day → 400', async () => {
      const res = await agent().post('/api/habits').send({
        name: 'BadDay', frequency: 'weekly', schedule_days: ['mon', 'funday']
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });
  });

  // ── preferred_time validation ─────────────────────────────────

  describe('preferred_time validation', () => {
    it('valid time "14:30" → accepted', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Timed', preferred_time: '14:30' });
      assert.equal(res.status, 201);
      assert.equal(res.body.preferred_time, '14:30');
    });

    it('invalid time "25:00" → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'BadTime', preferred_time: '25:00' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('null preferred_time → accepted', async () => {
      const res = await agent().post('/api/habits').send({ name: 'NoTime', preferred_time: null });
      assert.equal(res.status, 201);
      assert.equal(res.body.preferred_time, null);
    });

    it('empty string preferred_time → stored as null', async () => {
      const res = await agent().post('/api/habits').send({ name: 'EmptyTime', preferred_time: '' });
      assert.equal(res.status, 201);
      assert.equal(res.body.preferred_time, null);
    });
  });

  // ── Name & target validation ──────────────────────────────────

  describe('Name & target validation', () => {
    it('empty name → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: '' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('whitespace-only name → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: '   ' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('name > 100 chars → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'x'.repeat(101) });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('100'));
    });

    it('target=0 → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Zero', target: 0 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('non-integer target → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Float', target: 2.5 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('negative target → 400', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Neg', target: -1 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });
  });

  // ── Heatmap boundaries ────────────────────────────────────────

  describe('Heatmap boundaries', () => {
    it('multiple logs return correct date/count pairs', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'Heat', target: 1 });
      const d1 = daysFromNow(-1);
      const d2 = daysFromNow(-2);
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, d1, 3);
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, d2, 1);
      const res = await agent().get(`/api/habits/${h.id}/heatmap`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
      const log1 = res.body.find(l => l.date === d1);
      assert.equal(log1.count, 3);
      const log2 = res.body.find(l => l.date === d2);
      assert.equal(log2.count, 1);
    });

    it('logs older than 90 days excluded from heatmap', async () => {
      const { body: h } = await agent().post('/api/habits').send({ name: 'OldHeat', target: 1 });
      // Insert log 100 days ago (outside 90-day window)
      const oldDate = daysFromNow(-100);
      const recentDate = daysFromNow(-5);
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, oldDate, 1);
      db.prepare('INSERT INTO habit_logs (habit_id, date, count) VALUES (?,?,?)').run(h.id, recentDate, 1);
      const res = await agent().get(`/api/habits/${h.id}/heatmap`);
      assert.equal(res.status, 200);
      // Only the recent log should be included
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].date, recentDate);
    });
  });
});
