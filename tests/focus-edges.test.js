/**
 * Focus System Edge Cases
 *
 * Tests edge cases and boundary conditions for the focus/pomodoro system:
 * - Session lifecycle (create, end, delete)
 * - actual_minutes increment behavior
 * - Meta boundaries (focus_rating, intention/reflection)
 * - Steps lifecycle (create, toggle, duplicates)
 * - Streak calculation and heatmap
 * - Insights with no data
 * - Daily goal progress
 * - Stats accuracy
 * - Task deletion cascade
 */
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeFocus, agent, setup } = require('./helpers');

describe('Focus System Edge Cases', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  // Helper: create area → goal → task chain
  function scaffold() {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    return { area, goal, task };
  }

  // ── Focus session lifecycle ──────────────────────────────────────────────
  describe('Focus session lifecycle', () => {
    it('POST /api/focus creates session with started_at', async () => {
      const { task } = scaffold();
      const res = await agent()
        .post('/api/focus')
        .send({ task_id: task.id, duration_sec: 0, type: 'pomodoro' })
        .expect(201);
      assert.equal(res.body.task_id, task.id);
      assert.ok(res.body.started_at, 'should have started_at');
      assert.equal(res.body.duration_sec, 0);
    });

    it('PUT /api/focus/:id/end sets ended_at and updates task actual_minutes', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id, { duration_sec: 0 });

      const res = await agent()
        .put(`/api/focus/${focus.id}/end`)
        .send({ duration_sec: 1800 }) // 30 minutes
        .expect(200);
      assert.ok(res.body.ended_at, 'should have ended_at');
      assert.equal(res.body.duration_sec, 1800);

      // Check task actual_minutes was updated
      const { db } = setup();
      const t = db.prepare('SELECT actual_minutes FROM tasks WHERE id=?').get(task.id);
      assert.equal(t.actual_minutes, 30);
    });

    it('actual_minutes increments (does not replace)', async () => {
      const { task } = scaffold();

      // First session: 30 min
      const f1 = makeFocus(task.id, { duration_sec: 0 });
      await agent().put(`/api/focus/${f1.id}/end`).send({ duration_sec: 1800 }).expect(200);

      // Second session: 15 min
      const f2 = makeFocus(task.id, { duration_sec: 0 });
      await agent().put(`/api/focus/${f2.id}/end`).send({ duration_sec: 900 }).expect(200);

      const { db } = setup();
      const t = db.prepare('SELECT actual_minutes FROM tasks WHERE id=?').get(task.id);
      assert.equal(t.actual_minutes, 45); // 30 + 15
    });

    it('DELETE /api/focus/:id deletes session', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      await agent().delete(`/api/focus/${focus.id}`).expect(200);

      // Verify gone
      const { db } = setup();
      const row = db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(focus.id);
      assert.equal(row, undefined);
    });

    it('DELETE /api/focus/:id returns 404 for non-existent', async () => {
      await agent().delete('/api/focus/99999').expect(404);
    });

    it('ending session with 0 duration does not add actual_minutes', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id, { duration_sec: 0 });

      await agent().put(`/api/focus/${focus.id}/end`).send({ duration_sec: 0 }).expect(200);

      const { db } = setup();
      const t = db.prepare('SELECT actual_minutes FROM tasks WHERE id=?').get(task.id);
      // 0 seconds → 0 minutes → nothing added
      assert.ok(t.actual_minutes === null || t.actual_minutes === 0);
    });
  });

  // ── Focus meta boundaries ──────────────────────────────────────────────
  describe('Focus meta boundaries', () => {
    it('focus_rating 0 accepted', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ focus_rating: 0 })
        .expect(200);
      assert.equal(res.body.focus_rating, 0);
    });

    it('focus_rating 5 accepted', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ focus_rating: 5 })
        .expect(200);
      assert.equal(res.body.focus_rating, 5);
    });

    it('focus_rating -1 rejected', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ focus_rating: -1 })
        .expect(400);
    });

    it('focus_rating 6 rejected', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ focus_rating: 6 })
        .expect(400);
    });

    it('long intention text accepted', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);
      const longText = 'A'.repeat(2000);

      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ intention: longText })
        .expect(200);
      assert.equal(res.body.intention, longText);
    });

    it('long reflection text accepted', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);
      const longText = 'B'.repeat(2000);

      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ reflection: longText })
        .expect(200);
      assert.equal(res.body.reflection, longText);
    });

    it('meta upsert preserves previous fields', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      // Set intention first
      await agent().post(`/api/focus/${focus.id}/meta`).send({ intention: 'Start coding' }).expect(200);

      // Update with reflection only
      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ reflection: 'Went great', focus_rating: 4 })
        .expect(200);

      assert.equal(res.body.intention, 'Start coding');
      assert.equal(res.body.reflection, 'Went great');
      assert.equal(res.body.focus_rating, 4);
    });
  });

  // ── Focus steps lifecycle ──────────────────────────────────────────────
  describe('Focus steps lifecycle', () => {
    it('POST /api/focus/:id/steps creates steps', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/steps`)
        .send({ steps: ['Write tests', 'Fix bugs', 'Review'] })
        .expect(201);

      assert.equal(res.body.length, 3);
      assert.equal(res.body[0].text, 'Write tests');
      assert.equal(res.body[1].text, 'Fix bugs');
      assert.equal(res.body[2].text, 'Review');
    });

    it('PUT /api/focus/steps/:stepId toggles done on and off', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      const steps = (await agent()
        .post(`/api/focus/${focus.id}/steps`)
        .send({ steps: ['One'] })
        .expect(201)).body;

      // Toggle on
      const r1 = await agent().put(`/api/focus/steps/${steps[0].id}`).expect(200);
      assert.equal(r1.body.done, 1);
      assert.ok(r1.body.completed_at);

      // Toggle off
      const r2 = await agent().put(`/api/focus/steps/${steps[0].id}`).expect(200);
      assert.equal(r2.body.done, 0);
      assert.equal(r2.body.completed_at, null);
    });

    it('duplicate step titles accepted', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/steps`)
        .send({ steps: ['Same', 'Same', 'Same'] })
        .expect(201);

      assert.equal(res.body.length, 3);
      assert.equal(res.body[0].text, 'Same');
      assert.equal(res.body[2].text, 'Same');
    });

    it('steps positions are sequential', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/steps`)
        .send({ steps: ['A', 'B', 'C'] })
        .expect(201);

      assert.equal(res.body[0].position, 0);
      assert.equal(res.body[1].position, 1);
      assert.equal(res.body[2].position, 2);
    });
  });

  // ── Focus streak ──────────────────────────────────────────────────────
  describe('Focus streak', () => {
    it('consecutive days with sessions → streak count correct', async () => {
      const { task } = scaffold();
      const { db } = setup();

      // Use SQLite's date('now') for consistency
      const todayStr = db.prepare("SELECT date('now') as d").get().d;

      // Insert sessions for today and yesterday
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1500, 'pomodoro', todayStr + ' 10:00:00');
      const yesterday = db.prepare("SELECT date('now', '-1 day') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1500, 'pomodoro', yesterday + ' 10:00:00');

      const res = await agent().get('/api/focus/streak').expect(200);
      assert.ok(res.body.streak >= 2);
    });

    it('gap resets streak', async () => {
      const { task } = scaffold();
      const { db } = setup();

      const todayStr = db.prepare("SELECT date('now') as d").get().d;

      // Session today only (skip yesterday)
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1500, 'pomodoro', todayStr + ' 10:00:00');
      // Session 3 days ago (gap of 2 days)
      const threeDaysAgo = db.prepare("SELECT date('now', '-3 days') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1500, 'pomodoro', threeDaysAgo + ' 10:00:00');

      const res = await agent().get('/api/focus/streak').expect(200);
      assert.equal(res.body.streak, 1); // Only today counts
    });

    it('heatmap data correct', async () => {
      const { task } = scaffold();
      const { db } = setup();

      const todayStr = db.prepare("SELECT date('now') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1500, 'pomodoro', todayStr + ' 08:00:00');
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 900, 'pomodoro', todayStr + ' 14:00:00');

      const res = await agent().get('/api/focus/streak').expect(200);
      const todayEntry = res.body.heatmap.find(h => h.day === todayStr);
      assert.ok(todayEntry, 'should have heatmap entry for today');
      assert.equal(todayEntry.sessions, 2);
      assert.equal(todayEntry.total_sec, 2400); // 1500 + 900
    });
  });

  // ── Focus insights ────────────────────────────────────────────────────
  describe('Focus insights', () => {
    it('peak hours with no data → empty array', async () => {
      const res = await agent().get('/api/focus/insights').expect(200);
      assert.ok(Array.isArray(res.body.peakHours));
      assert.equal(res.body.peakHours.length, 0);
    });

    it('completion rate with no planned steps → zero totals', async () => {
      const res = await agent().get('/api/focus/insights').expect(200);
      assert.equal(res.body.completionRate.total, 0);
    });

    it('completion rate calculates correctly with data', async () => {
      const { task } = scaffold();
      const { db } = setup();

      // Create two sessions with meta
      const f1 = makeFocus(task.id);
      const f2 = makeFocus(task.id);

      // Session 1: planned 3 steps, completed 3 (completed)
      await agent().post(`/api/focus/${f1.id}/meta`)
        .send({ steps_planned: 3, steps_completed: 3 }).expect(200);
      // Session 2: planned 2 steps, completed 1 (not completed)
      await agent().post(`/api/focus/${f2.id}/meta`)
        .send({ steps_planned: 2, steps_completed: 1 }).expect(200);

      const res = await agent().get('/api/focus/insights').expect(200);
      assert.equal(res.body.completionRate.total, 2);
      assert.equal(res.body.completionRate.completed, 1);
    });

    it('avgRating reflects actual ratings', async () => {
      const { task } = scaffold();

      const f1 = makeFocus(task.id);
      const f2 = makeFocus(task.id);

      await agent().post(`/api/focus/${f1.id}/meta`).send({ focus_rating: 4 }).expect(200);
      await agent().post(`/api/focus/${f2.id}/meta`).send({ focus_rating: 2 }).expect(200);

      const res = await agent().get('/api/focus/insights').expect(200);
      assert.equal(res.body.avgRating, 3); // (4+2)/2
    });
  });

  // ── Focus daily goal ──────────────────────────────────────────────────
  describe('Focus daily goal', () => {
    it('progress percentage correct', async () => {
      const { task } = scaffold();
      const { db } = setup();

      // Set goal to 60 minutes
      db.prepare("INSERT OR REPLACE INTO settings (key, value, user_id) VALUES ('dailyFocusGoalMinutes', '60', 1)").run();

      // Add 30 minutes of focus today
      const todayStr = db.prepare("SELECT date('now') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1800, 'pomodoro', todayStr + ' 09:00:00');

      const res = await agent().get('/api/focus/goal').expect(200);
      assert.equal(res.body.goalMinutes, 60);
      assert.equal(res.body.todayMinutes, 30);
      assert.equal(res.body.pct, 50);
    });

    it('default goal is 120 minutes', async () => {
      const res = await agent().get('/api/focus/goal').expect(200);
      assert.equal(res.body.goalMinutes, 120);
    });

    it('pct caps at 100', async () => {
      const { task } = scaffold();
      const { db } = setup();

      db.prepare("INSERT OR REPLACE INTO settings (key, value, user_id) VALUES ('dailyFocusGoalMinutes', '10', 1)").run();

      const todayStr = db.prepare("SELECT date('now') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1200, 'pomodoro', todayStr + ' 09:00:00'); // 20 min > 10 min goal

      const res = await agent().get('/api/focus/goal').expect(200);
      assert.equal(res.body.pct, 100);
    });
  });

  // ── Focus stats accuracy ──────────────────────────────────────────────
  describe('Focus stats accuracy', () => {
    it('today/week aggregation correct', async () => {
      const { task } = scaffold();
      const { db } = setup();

      const todayStr = db.prepare("SELECT date('now') as d").get().d;
      // Two sessions today
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 1500, 'pomodoro', todayStr + ' 10:00:00');
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(task.id, 900, 'pomodoro', todayStr + ' 14:00:00');

      const res = await agent().get('/api/focus/stats').expect(200);
      assert.equal(res.body.today, 2400); // 1500 + 900
      assert.ok(res.body.week >= 2400);
      assert.equal(res.body.sessions, 2);
    });

    it('by-task breakdown sums correctly', async () => {
      const { area, goal } = scaffold();
      const t1 = makeTask(goal.id, { title: 'Task A' });
      const t2 = makeTask(goal.id, { title: 'Task B' });
      const { db } = setup();

      const todayStr = db.prepare("SELECT date('now') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(t1.id, 1500, 'pomodoro', todayStr + ' 10:00:00');
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(t1.id, 900, 'pomodoro', todayStr + ' 12:00:00');
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at, user_id) VALUES (?,?,?,?,1)")
        .run(t2.id, 600, 'pomodoro', todayStr + ' 14:00:00');

      const res = await agent().get('/api/focus/stats').expect(200);
      const taskA = res.body.byTask.find(bt => bt.title === 'Task A');
      const taskB = res.body.byTask.find(bt => bt.title === 'Task B');
      assert.ok(taskA);
      assert.equal(taskA.total_sec, 2400);
      assert.equal(taskA.sessions, 2);
      assert.ok(taskB);
      assert.equal(taskB.total_sec, 600);
      assert.equal(taskB.sessions, 1);
    });

    it('no sessions → zero stats', async () => {
      const res = await agent().get('/api/focus/stats').expect(200);
      assert.equal(res.body.today, 0);
      assert.equal(res.body.week, 0);
      assert.equal(res.body.sessions, 0);
      assert.deepStrictEqual(res.body.byTask, []);
    });
  });

  // ── Focus with task deletion ──────────────────────────────────────────
  describe('Focus with task deletion', () => {
    it('delete task → focus sessions cascade deleted', async () => {
      const { task } = scaffold();
      const focus = makeFocus(task.id);
      const { db } = setup();

      // Verify session exists
      const before = db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(focus.id);
      assert.ok(before);

      // Delete the task
      await agent().delete(`/api/tasks/${task.id}`).expect(200);

      // Focus sessions should be cascade deleted (FK ON DELETE CASCADE)
      const after = db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(focus.id);
      assert.equal(after, undefined);
    });
  });
});
