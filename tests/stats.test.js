const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeFocus, agent, setup, today, daysFromNow, serverLocalDate } = require('./helpers');

describe('Stats & Focus API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/stats', () => {
    it('returns zero counts when no data', async () => {
      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.total, 0);
      assert.equal(res.body.done, 0);
      assert.equal(res.body.overdue, 0);
      assert.equal(res.body.dueToday, 0);
      assert.equal(res.body.thisWeek, 0);
      assert.deepStrictEqual(res.body.byArea, []);
      assert.deepStrictEqual(res.body.byPriority, []);
      assert.deepStrictEqual(res.body.recentDone, []);
    });

    it('returns correct counts', async () => {
      const area = makeArea({ name: 'Work' });
      const goal = makeGoal(area.id);
      makeTask(goal.id, { status: 'todo' });
      makeTask(goal.id, { status: 'doing' });
      makeTask(goal.id, { status: 'done' });
      makeTask(goal.id, { status: 'todo', due_date: '2020-01-01' }); // overdue
      makeTask(goal.id, { status: 'todo', due_date: today() }); // due today

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.total, 5);
      assert.equal(res.body.done, 1);
      assert.equal(res.body.overdue, 1);
      assert.equal(res.body.dueToday, 1);
    });

    it('returns byArea breakdown', async () => {
      const area1 = makeArea({ name: 'Health', position: 0 });
      const area2 = makeArea({ name: 'Work', position: 1 });
      const g1 = makeGoal(area1.id);
      const g2 = makeGoal(area2.id);
      makeTask(g1.id, { status: 'todo' });
      makeTask(g1.id, { status: 'done' });
      makeTask(g2.id, { status: 'todo' });

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.byArea.length, 2);
      assert.equal(res.body.byArea[0].name, 'Health');
      assert.equal(res.body.byArea[0].total, 2);
      assert.equal(res.body.byArea[0].done, 1);
    });

    it('returns byPriority breakdown', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { priority: 0 });
      makeTask(goal.id, { priority: 3, status: 'done' });

      const res = await agent().get('/api/stats').expect(200);
      assert.ok(res.body.byPriority.length >= 1);
    });

    it('returns recentDone list', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();
      const task = makeTask(goal.id, { title: 'Completed task', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);

      const res = await agent().get('/api/stats').expect(200);
      assert.equal(res.body.recentDone.length, 1);
      assert.equal(res.body.recentDone[0].title, 'Completed task');
    });
  });

  describe('GET /api/stats/streaks', () => {
    it('returns streak and heatmap structure', async () => {
      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.equal(typeof res.body.streak, 'number');
      assert.equal(typeof res.body.bestStreak, 'number');
      assert.ok(Array.isArray(res.body.heatmap));
    });

    it('counts streak of consecutive days with completions', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      // Use same date calculation as server's streak code (local midnight → UTC)
      const todayStr = serverLocalDate(0);
      const yesterdayStr = serverLocalDate(-1);

      const t1 = makeTask(goal.id, { title: 'Today', status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(todayStr, t1.id);

      const t2 = makeTask(goal.id, { title: 'Yesterday', status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(yesterdayStr, t2.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.ok(res.body.streak >= 2);
    });

    it('includes heatmap data for last 365 days', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      const task = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=date('now') WHERE id=?").run(task.id);

      const res = await agent().get('/api/stats/streaks').expect(200);
      assert.ok(res.body.heatmap.length >= 1);
      assert.ok(res.body.heatmap[0].day);
      assert.ok(res.body.heatmap[0].count >= 1);
    });
  });

  describe('POST /api/focus', () => {
    it('creates a focus session', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .post('/api/focus')
        .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' })
        .expect(201);
      assert.equal(res.body.task_id, task.id);
      assert.equal(res.body.duration_sec, 1500);
      assert.equal(res.body.type, 'pomodoro');
      assert.ok(res.body.id);
    });

    it('uses defaults for optional fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .post('/api/focus')
        .send({ task_id: task.id })
        .expect(201);
      assert.equal(res.body.duration_sec, 0);
      assert.equal(res.body.type, 'pomodoro');
    });

    it('returns 400 when task_id is missing', async () => {
      await agent().post('/api/focus').send({}).expect(400);
    });

    it('returns 400 when task_id is not a number', async () => {
      await agent().post('/api/focus').send({ task_id: 'abc' }).expect(400);
    });
  });

  describe('GET /api/focus/stats', () => {
    it('returns focus statistics', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Focus task' });
      makeFocus(task.id, { duration_sec: 1500 });
      makeFocus(task.id, { duration_sec: 900 });

      const res = await agent().get('/api/focus/stats').expect(200);
      assert.equal(typeof res.body.today, 'number');
      assert.equal(typeof res.body.week, 'number');
      assert.equal(typeof res.body.sessions, 'number');
      assert.ok(Array.isArray(res.body.byTask));
    });

    it('returns zero stats when no sessions', async () => {
      const res = await agent().get('/api/focus/stats').expect(200);
      assert.equal(res.body.today, 0);
      assert.equal(res.body.week, 0);
      assert.equal(res.body.sessions, 0);
      assert.deepStrictEqual(res.body.byTask, []);
    });
  });

  describe('GET /api/activity', () => {
    it('returns paginated completed tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      for (let i = 0; i < 5; i++) {
        const task = makeTask(goal.id, { title: `Done ${i}`, status: 'done' });
        db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);
      }

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.total, 5);
      assert.equal(res.body.page, 1);
      assert.ok(res.body.pages >= 1);
      assert.equal(res.body.items.length, 5);
    });

    it('respects page and limit parameters', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();

      for (let i = 0; i < 10; i++) {
        const task = makeTask(goal.id, { title: `Done ${i}`, status: 'done' });
        db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);
      }

      const res = await agent().get('/api/activity?page=2&limit=3').expect(200);
      assert.equal(res.body.page, 2);
      assert.equal(res.body.items.length, 3);
      assert.equal(res.body.pages, 4); // ceil(10/3)
    });

    it('clamps limit to max 100', async () => {
      const res = await agent().get('/api/activity?limit=500').expect(200);
      // Should not crash; limit is clamped internally
      assert.ok(res.body);
    });

    it('returns enriched tasks with goal/area info', async () => {
      const area = makeArea({ name: 'Health' });
      const goal = makeGoal(area.id, { title: 'Fitness' });
      const { db } = setup();
      const task = makeTask(goal.id, { title: 'Run', status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);

      const res = await agent().get('/api/activity').expect(200);
      assert.equal(res.body.items[0].area_name, 'Health');
      assert.equal(res.body.items[0].goal_title, 'Fitness');
    });
  });
});
