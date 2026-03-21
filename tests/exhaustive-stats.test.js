const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeFocus, agent, today, daysFromNow, serverLocalDate } = require('./helpers');

describe('Exhaustive Stats, Trends & Time Analytics', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── GET /api/stats ───

  describe('GET /api/stats', () => {
    it('overdue count is correct', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      // overdue: past due_date + not done
      makeTask(g.id, { status: 'todo', due_date: '2020-01-01' });
      makeTask(g.id, { status: 'doing', due_date: '2021-06-15' });
      // NOT overdue: done task with past due_date
      makeTask(g.id, { status: 'done', due_date: '2020-01-01' });
      // NOT overdue: future due_date
      makeTask(g.id, { status: 'todo', due_date: daysFromNow(10) });
      // NOT overdue: no due_date
      makeTask(g.id, { status: 'todo' });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.overdue, 2);
    });

    it('done count only counts status=done', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { status: 'doing' });
      makeTask(g.id, { status: 'doing' });
      makeTask(g.id, { status: 'todo' });
      makeTask(g.id, { status: 'done' });
      makeTask(g.id, { status: 'done' });
      makeTask(g.id, { status: 'done' });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.total, 6);
      assert.equal(res.body.done, 3);
    });

    it('recentDone includes goal_title', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id, { title: 'My Special Goal' });
      const t = makeTask(g.id, { title: 'Finished work', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(t.id);

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.recentDone.length, 1);
      assert.equal(res.body.recentDone[0].goal_title, 'My Special Goal');
      assert.equal(res.body.recentDone[0].title, 'Finished work');
      assert.ok(res.body.recentDone[0].completed_at);
    });

    it('byPriority includes all used priorities', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { priority: 0 });
      makeTask(g.id, { priority: 1 });
      makeTask(g.id, { priority: 2 });
      makeTask(g.id, { priority: 3 });

      const res = await agent().get('/api/stats').expect(200);
      const priorities = res.body.byPriority.map(p => p.priority);
      assert.ok(priorities.includes(0), 'should include priority 0');
      assert.ok(priorities.includes(1), 'should include priority 1');
      assert.ok(priorities.includes(2), 'should include priority 2');
      assert.ok(priorities.includes(3), 'should include priority 3');
      assert.equal(res.body.byPriority.length, 4);
      res.body.byPriority.forEach(p => {
        assert.equal(p.total, 1);
      });
    });
  });

  // ─── GET /api/stats/streaks ───

  describe('GET /api/stats/streaks', () => {
    it('returns 0 streak when no completions', async () => {
      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(res.body.streak, 0);
      assert.equal(res.body.bestStreak, 0);
      assert.ok(Array.isArray(res.body.heatmap));
      assert.equal(res.body.heatmap.length, 0);
    });

    it('best_streak tracks maximum even after streak breaks', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);

      // Build a 3-day streak far in the past (days -30, -29, -28)
      for (let i = -30; i <= -28; i++) {
        const t = makeTask(g.id, { status: 'done' });
        db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(i), t.id);
      }
      // Gap at -27 through -2 (no completions)
      // 1-day streak: yesterday only
      const t2 = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(-1), t2.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.ok(res.body.bestStreak >= 3, `bestStreak should be >= 3, got ${res.body.bestStreak}`);
      // current streak is only 1 (yesterday), unless today also has completions
      assert.ok(res.body.streak <= res.body.bestStreak);
    });

    it('heatmap has entries for days with completions', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);

      // Create completions on 3 specific dates
      const dates = [serverLocalDate(-5), serverLocalDate(-10), serverLocalDate(-20)];
      for (const d of dates) {
        const t = makeTask(g.id, { status: 'done' });
        db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(d, t.id);
      }

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.ok(res.body.heatmap.length >= 3, `heatmap should have >=3 entries, got ${res.body.heatmap.length}`);
      for (const d of dates) {
        const entry = res.body.heatmap.find(h => h.day === d);
        assert.ok(entry, `heatmap should have entry for ${d}`);
        assert.equal(entry.count, 1);
      }
    });
  });

  // ─── GET /api/stats/trends ───

  describe('GET /api/stats/trends', () => {
    it('returns 8 buckets even with no data', async () => {
      const res = await agent().get('/api/stats/trends').expect(200);
      assert.ok(Array.isArray(res.body));
      // Server generates i=0..7 (8 iterations), so length can be 8 or 9
      assert.ok(res.body.length >= 8, `expected >=8 buckets, got ${res.body.length}`);
      res.body.forEach(w => {
        assert.ok('week_start' in w);
        assert.ok('week_end' in w);
        assert.ok('completed' in w);
      });
    });

    it('completed is 0 for weeks with no completions', async () => {
      const res = await agent().get('/api/stats/trends').expect(200);
      res.body.forEach(w => {
        assert.equal(w.completed, 0, `week ${w.week_start} should have 0 completions`);
      });
    });
  });

  // ─── GET /api/stats/time-analytics ───

  describe('GET /api/stats/time-analytics', () => {
    it('returns empty arrays with no data', async () => {
      const res = await agent().get('/api/stats/time-analytics').expect(200);
      assert.deepStrictEqual(res.body.byArea, []);
      assert.deepStrictEqual(res.body.byHour, []);
      assert.deepStrictEqual(res.body.weeklyVelocity, []);
      assert.ok(res.body.accuracy !== undefined);
    });

    it('byHour groups by hour of completion', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);

      // Two tasks completed at 14:xx
      const t1 = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run('2025-03-10T14:30:00Z', t1.id);
      const t2 = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run('2025-03-11T14:45:00Z', t2.id);
      // One task completed at 09:xx
      const t3 = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run('2025-03-12T09:00:00Z', t3.id);

      const res = await agent().get('/api/stats/time-analytics').expect(200);
      const hour14 = res.body.byHour.find(h => h.hour === 14);
      const hour9 = res.body.byHour.find(h => h.hour === 9);
      assert.ok(hour14, 'should have hour 14 entry');
      assert.equal(hour14.count, 2);
      assert.ok(hour9, 'should have hour 9 entry');
      assert.equal(hour9.count, 1);
    });

    it('accuracy returns null avg_ratio when no tasks have both estimated and actual', async () => {
      // With no data at all, accuracy.total should be 0
      const res = await agent().get('/api/stats/time-analytics').expect(200);
      assert.equal(res.body.accuracy.total, 0);
      // SUM() returns null when no rows match the WHERE clause
      assert.equal(res.body.accuracy.on_time, null);
      assert.equal(res.body.accuracy.over, null);
      assert.equal(res.body.accuracy.avg_ratio, null);
    });

    it('weeklyVelocity counts completions by week', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);

      // Create tasks completed within the last 56 days
      const recentDate = daysFromNow(-3);
      for (let i = 0; i < 5; i++) {
        const t = makeTask(g.id, { status: 'done' });
        db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(recentDate + 'T12:00:00Z', t.id);
      }

      const res = await agent().get('/api/stats/time-analytics').expect(200);
      assert.ok(res.body.weeklyVelocity.length >= 1, 'should have at least 1 week entry');
      const totalCount = res.body.weeklyVelocity.reduce((sum, w) => sum + w.count, 0);
      assert.equal(totalCount, 5, 'total completions should be 5');
    });
  });

  // ─── GET /api/activity ───

  describe('GET /api/activity', () => {
    it('returns empty when no completed tasks', async () => {
      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.total, 0);
      assert.deepStrictEqual(res.body.items, []);
      assert.equal(res.body.page, 1);
    });

    it('default page=1 and limit=50', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(t.id);

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.page, 1);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.items.length, 1);
    });

    it('tasks ordered by completed_at desc', async () => {
      const { db } = setup();
      const a = makeArea();
      const g = makeGoal(a.id);

      const t1 = makeTask(g.id, { title: 'First', status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run('2025-01-10T10:00:00Z', t1.id);
      const t2 = makeTask(g.id, { title: 'Second', status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run('2025-01-15T10:00:00Z', t2.id);
      const t3 = makeTask(g.id, { title: 'Third', status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run('2025-01-20T10:00:00Z', t3.id);

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.items.length, 3);
      assert.equal(res.body.items[0].title, 'Third');
      assert.equal(res.body.items[1].title, 'Second');
      assert.equal(res.body.items[2].title, 'First');
    });
  });
});
