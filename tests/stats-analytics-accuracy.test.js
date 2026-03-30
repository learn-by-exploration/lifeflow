const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, setup, makeArea, makeGoal, makeTask, makeFocus, agent, today, daysFromNow, serverLocalDate } = require('./helpers');

describe('Stats & Analytics Accuracy', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── Dashboard stats accuracy ────────────────────────────────────────────────

  describe('Dashboard stats accuracy', () => {
    it('total matches actual task count', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { status: 'todo' });
      makeTask(goal.id, { status: 'doing' });
      makeTask(goal.id, { status: 'done' });
      makeTask(goal.id, { status: 'todo' });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.total, 4);
    });

    it('done count matches tasks with status=done only', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { status: 'todo' });
      makeTask(goal.id, { status: 'doing' });
      makeTask(goal.id, { status: 'done' });
      makeTask(goal.id, { status: 'done' });
      makeTask(goal.id, { status: 'done' });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.done, 3);
    });

    it('overdue count accurate for past due_date + not done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // Overdue: past date and not done
      makeTask(goal.id, { status: 'todo', due_date: '2020-01-01' });
      makeTask(goal.id, { status: 'doing', due_date: '2020-06-15' });
      // Not overdue: done task with past date
      makeTask(goal.id, { status: 'done', due_date: '2020-01-01' });
      // Not overdue: future date
      makeTask(goal.id, { status: 'todo', due_date: daysFromNow(30) });
      // Not overdue: no due date
      makeTask(goal.id, { status: 'todo' });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.overdue, 2);
    });

    it('dueToday accurate for today date tasks not done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { status: 'todo', due_date: today() });
      makeTask(goal.id, { status: 'doing', due_date: today() });
      // Done task due today should NOT count
      makeTask(goal.id, { status: 'done', due_date: today() });
      // Not today
      makeTask(goal.id, { status: 'todo', due_date: daysFromNow(1) });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.dueToday, 2);
    });

    it('thisWeek count matches tasks completed in last 7 days', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      // Completed today
      const t1 = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(t1.id);
      // Completed 3 days ago
      const t2 = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now', '-3 days') WHERE id=?").run(t2.id);
      // Completed 10 days ago — should NOT count
      const t3 = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now', '-10 days') WHERE id=?").run(t3.id);

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.thisWeek, 2);
    });

    it('byPriority breakdown sums to total', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { priority: 0 });
      makeTask(goal.id, { priority: 1 });
      makeTask(goal.id, { priority: 2 });
      makeTask(goal.id, { priority: 3 });
      makeTask(goal.id, { priority: 1 });

      const res = await agent().get('/api/stats').expect(200);
      const prioritySum = res.body.byPriority.reduce((s, p) => s + p.total, 0);
      assert.equal(prioritySum, 5);
      assert.equal(prioritySum, res.body.total);
    });
  });

  // ─── Streak calculation ──────────────────────────────────────────────────────

  describe('Streak calculation', () => {
    it('no completions → streak=0', async () => {
      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(res.body.streak, 0);
      assert.equal(res.body.bestStreak, 0);
    });

    it('single day completion today → streak=1', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();
      const todayStr = serverLocalDate(0);
      const t = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(todayStr, t.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(res.body.streak, 1);
    });

    it('consecutive days → correct streak count', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      // Complete tasks on 3 consecutive days: today, yesterday, day before
      for (let i = 0; i < 3; i++) {
        const dateStr = serverLocalDate(-i);
        const t = makeTask(goal.id, { title: `Day -${i}`, status: 'done' });
        db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(dateStr, t.id);
      }

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(res.body.streak, 3);
    });

    it('gap in completions → streak resets', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      // Today + yesterday = 2-day streak
      const t1 = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(0), t1.id);
      const t2 = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(-1), t2.id);
      // Skip day -2, complete day -3 (should not extend streak)
      const t3 = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(-3), t3.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(res.body.streak, 2);
    });

    it('best streak tracked separately from current', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      // Old 4-day streak: -10, -9, -8, -7
      for (let i = 10; i >= 7; i--) {
        const t = makeTask(goal.id, { status: 'done' });
        db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(-i), t.id);
      }
      // Current 2-day streak: today + yesterday
      const t1 = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(0), t1.id);
      const t2 = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(serverLocalDate(-1), t2.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(res.body.streak, 2);
      assert.ok(res.body.bestStreak >= 4, `bestStreak=${res.body.bestStreak} should be >= 4`);
    });
  });

  // ─── Heatmap data ───────────────────────────────────────────────────────────

  describe('Heatmap data', () => {
    it('heatmap returns array with completion data', async () => {
      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.ok(Array.isArray(res.body.heatmap));
    });

    it('completion on specific date reflected in heatmap', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();
      const targetDate = serverLocalDate(-5);
      const t = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(targetDate, t.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      const entry = res.body.heatmap.find(h => h.day === targetDate);
      assert.ok(entry, `Expected heatmap entry for ${targetDate}`);
      assert.equal(entry.count, 1);
    });

    it('multiple completions on same date → count > 1', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();
      const targetDate = serverLocalDate(-2);

      for (let i = 0; i < 3; i++) {
        const t = makeTask(goal.id, { status: 'done' });
        db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(targetDate, t.id);
      }

      const res = await agent().get('/api/stats/streaks').expect(200);
      const entry = res.body.heatmap.find(h => h.day === targetDate);
      assert.ok(entry);
      assert.equal(entry.count, 3);
    });

    it('empty history → empty heatmap array', async () => {
      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.deepStrictEqual(res.body.heatmap, []);
    });
  });

  // ─── Trends / velocity ──────────────────────────────────────────────────────

  describe('Trends / velocity', () => {
    it('weekly trends return week groupings', async () => {
      const res = await agent().get('/api/stats/trends').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      assert.ok(res.body[0].week_start);
      assert.ok(res.body[0].week_end);
      assert.equal(typeof res.body[0].completed, 'number');
    });

    it('completion counts per week accurate', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      // Complete 3 tasks 1-3 days ago (within current week window but not today,
      // since the trends endpoint uses date-only comparison and today's tasks
      // with timestamps fall outside the < endDate boundary)
      for (let i = 0; i < 3; i++) {
        const t = makeTask(goal.id, { status: 'done' });
        db.prepare("UPDATE tasks SET completed_at=datetime('now', '-' || ? || ' days') WHERE id=?").run(i + 1, t.id);
      }

      const res = await agent().get('/api/stats/trends').expect(200);
      // The last week entry should have the 3 completions
      const lastWeek = res.body[res.body.length - 1];
      assert.ok(lastWeek.completed >= 3, `Latest week completed=${lastWeek.completed}, expected >= 3`);
    });

    it('empty weeks → count=0', async () => {
      const res = await agent().get('/api/stats/trends').expect(200);
      // With no tasks, all weeks should have 0 completions
      for (const week of res.body) {
        assert.equal(week.completed, 0);
      }
    });

    it('weeks ordered chronologically', async () => {
      const res = await agent().get('/api/stats/trends').expect(200);
      for (let i = 1; i < res.body.length; i++) {
        assert.ok(res.body[i].week_start >= res.body[i - 1].week_start,
          `week ${i} (${res.body[i].week_start}) should be >= week ${i - 1} (${res.body[i - 1].week_start})`);
      }
    });
  });

  // ─── Activity log ────────────────────────────────────────────────────────────

  describe('Activity log', () => {
    it('GET /api/activity returns completed tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      const t1 = makeTask(goal.id, { title: 'Done1', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(t1.id);
      makeTask(goal.id, { title: 'NotDone', status: 'todo' });

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.items[0].title, 'Done1');
    });

    it('pagination returns correct subset', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      for (let i = 0; i < 7; i++) {
        const t = makeTask(goal.id, { title: `Task ${i}`, status: 'done' });
        db.prepare("UPDATE tasks SET completed_at=datetime('now', '-' || ? || ' minutes') WHERE id=?").run(i, t.id);
      }

      const res = await agent().get('/api/activity?page=2&limit=3').expect(200);
      assert.equal(res.body.total, 7);
      assert.equal(res.body.page, 2);
      assert.equal(res.body.items.length, 3);
      assert.equal(res.body.pages, 3); // ceil(7/3)
    });

    it('activity ordered by completion date desc', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      const t1 = makeTask(goal.id, { title: 'Earlier', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now', '-2 hours') WHERE id=?").run(t1.id);
      const t2 = makeTask(goal.id, { title: 'Later', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(t2.id);

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.items[0].title, 'Later');
      assert.equal(res.body.items[1].title, 'Earlier');
    });

    it('only done tasks appear in activity', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      makeTask(goal.id, { title: 'Todo', status: 'todo' });
      makeTask(goal.id, { title: 'Doing', status: 'doing' });
      const t1 = makeTask(goal.id, { title: 'Done', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(t1.id);

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.items.length, 1);
      assert.equal(res.body.items[0].status, 'done');
    });
  });

  // ─── Balance / time analytics ────────────────────────────────────────────────

  describe('Balance / time analytics', () => {
    it('balance shows area distribution', async () => {
      const area1 = makeArea({ name: 'Work' });
      const area2 = makeArea({ name: 'Health' });
      const g1 = makeGoal(area1.id);
      const g2 = makeGoal(area2.id);
      // 3 tasks in Work, 1 in Health
      makeTask(g1.id, { status: 'todo', due_date: today() });
      makeTask(g1.id, { status: 'todo', due_date: today() });
      makeTask(g1.id, { status: 'todo', due_date: today() });
      makeTask(g2.id, { status: 'todo', due_date: today() });

      const res = await agent().get('/api/stats/balance').expect(200);
      assert.ok(Array.isArray(res.body.areas));
      assert.equal(res.body.total, 4);
      // Dominant should be Work (75%)
      const work = res.body.areas.find(a => a.name === 'Work');
      assert.ok(work);
      assert.equal(work.task_count, 3);
      assert.equal(work.pct, 75);
    });

    it('time analytics matches focus session totals', async () => {
      const area = makeArea({ name: 'Dev' });
      const goal = makeGoal(area.id);
      const { db } = setup();
      const t = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET estimated_minutes=60, actual_minutes=45, completed_at=datetime('now') WHERE id=?").run(t.id);

      const res = await agent().get('/api/stats/time-analytics').expect(200);
      assert.ok(Array.isArray(res.body.byArea));
      const devArea = res.body.byArea.find(a => a.name === 'Dev');
      assert.ok(devArea);
      assert.equal(devArea.total_estimated, 60);
      assert.equal(devArea.total_actual, 45);
    });

    it('area breakdown sums correctly across multiple tasks', async () => {
      const area = makeArea({ name: 'Study' });
      const goal = makeGoal(area.id);
      const { db } = setup();

      const t1 = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET estimated_minutes=30, actual_minutes=25, completed_at=datetime('now') WHERE id=?").run(t1.id);
      const t2 = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET estimated_minutes=45, actual_minutes=50, completed_at=datetime('now') WHERE id=?").run(t2.id);

      const res = await agent().get('/api/stats/time-analytics').expect(200);
      const studyArea = res.body.byArea.find(a => a.name === 'Study');
      assert.ok(studyArea);
      assert.equal(studyArea.total_estimated, 75);
      assert.equal(studyArea.total_actual, 75);
      assert.equal(studyArea.task_count, 2);
    });

    it('empty data → sensible defaults', async () => {
      const res = await agent().get('/api/stats/balance').expect(200);
      assert.deepStrictEqual(res.body.areas, []);
      assert.equal(res.body.total, 0);
      assert.equal(res.body.dominant, null);
      assert.equal(res.body.lowest, null);
    });
  });

  // ─── Focus stats ─────────────────────────────────────────────────────────────

  describe('Focus stats', () => {
    it('focus stats reflect actual session durations', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Focus task' });
      makeFocus(task.id, { duration_sec: 1500 });
      makeFocus(task.id, { duration_sec: 900 });

      const res = await agent().get('/api/focus/stats').expect(200);
      // Today's total should be 1500 + 900 = 2400
      assert.equal(res.body.today, 2400);
      assert.equal(res.body.sessions, 2);
    });

    it('today focus time only counts today sessions', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const { db } = setup();

      // A session from today (default)
      makeFocus(task.id, { duration_sec: 600 });
      // A session from 3 days ago
      const oldSession = makeFocus(task.id, { duration_sec: 1200 });
      db.prepare("UPDATE focus_sessions SET started_at=datetime('now', '-3 days') WHERE id=?").run(oldSession.id);

      const res = await agent().get('/api/focus/stats').expect(200);
      assert.equal(res.body.today, 600);
      assert.equal(res.body.sessions, 1); // only today's sessions count
    });

    it('weekly focus time includes last 7 days', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const { db } = setup();

      // Today
      makeFocus(task.id, { duration_sec: 600 });
      // 3 days ago (within 7 days)
      const s2 = makeFocus(task.id, { duration_sec: 900 });
      db.prepare("UPDATE focus_sessions SET started_at=datetime('now', '-3 days') WHERE id=?").run(s2.id);
      // 10 days ago (outside 7 days)
      const s3 = makeFocus(task.id, { duration_sec: 1200 });
      db.prepare("UPDATE focus_sessions SET started_at=datetime('now', '-10 days') WHERE id=?").run(s3.id);

      const res = await agent().get('/api/focus/stats').expect(200);
      assert.equal(res.body.week, 1500); // 600 + 900
    });
  });
});
