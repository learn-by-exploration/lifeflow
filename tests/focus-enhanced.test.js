const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeFocus, agent, setup } = require('./helpers');

describe('Enhanced Focus API (Phase A)', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── POST /api/focus with scheduled_at ──
  describe('POST /api/focus (scheduled_at)', () => {
    it('creates a session with scheduled_at', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const when = '2026-03-25T09:00:00';

      const res = await agent()
        .post('/api/focus')
        .send({ task_id: task.id, duration_sec: 0, type: 'pomodoro', scheduled_at: when })
        .expect(201);
      assert.equal(res.body.task_id, task.id);
      assert.equal(res.body.scheduled_at, when);
    });

    it('allows null scheduled_at (start now)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .post('/api/focus')
        .send({ task_id: task.id })
        .expect(201);
      assert.equal(res.body.scheduled_at, null);
    });
  });

  // ── PUT /api/focus/:id/end ──
  describe('PUT /api/focus/:id/end', () => {
    it('ends a session with ended_at and duration', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id, { duration_sec: 0 });

      const res = await agent()
        .put(`/api/focus/${focus.id}/end`)
        .send({ duration_sec: 1500 })
        .expect(200);
      assert.equal(res.body.duration_sec, 1500);
      assert.ok(res.body.ended_at);
    });

    it('returns 404 for non-existent session', async () => {
      await agent().put('/api/focus/99999/end').send({}).expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().put('/api/focus/abc/end').send({}).expect(400);
    });
  });

  // ── POST /api/focus/:id/meta ──
  describe('POST /api/focus/:id/meta', () => {
    it('creates session meta with intention', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ intention: 'Finish login form', strategy: 'pomodoro', steps_planned: 3 })
        .expect(200);
      assert.equal(res.body.session_id, focus.id);
      assert.equal(res.body.intention, 'Finish login form');
      assert.equal(res.body.steps_planned, 3);
      assert.equal(res.body.strategy, 'pomodoro');
    });

    it('updates existing meta (upsert)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/meta`).send({ intention: 'Start' }).expect(200);
      const res = await agent()
        .post(`/api/focus/${focus.id}/meta`)
        .send({ reflection: 'Went well', focus_rating: 4, steps_completed: 2 })
        .expect(200);
      assert.equal(res.body.intention, 'Start');
      assert.equal(res.body.reflection, 'Went well');
      assert.equal(res.body.focus_rating, 4);
      assert.equal(res.body.steps_completed, 2);
    });

    it('rejects invalid focus_rating', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/meta`).send({ focus_rating: 6 }).expect(400);
    });

    it('returns 404 for non-existent session', async () => {
      await agent().post('/api/focus/99999/meta').send({ intention: 'test' }).expect(404);
    });
  });

  // ── GET /api/focus/:id/meta ──
  describe('GET /api/focus/:id/meta', () => {
    it('returns session meta', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/meta`).send({ intention: 'Build auth' });
      const res = await agent().get(`/api/focus/${focus.id}/meta`).expect(200);
      assert.equal(res.body.intention, 'Build auth');
    });

    it('returns 404 when no meta exists', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().get(`/api/focus/${focus.id}/meta`).expect(404);
    });
  });

  // ── POST /api/focus/:id/steps ──
  describe('POST /api/focus/:id/steps', () => {
    it('creates steps from string array', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/steps`)
        .send({ steps: ['Step 1', 'Step 2', 'Step 3'] })
        .expect(201);
      assert.equal(res.body.length, 3);
      assert.equal(res.body[0].text, 'Step 1');
      assert.equal(res.body[0].done, 0);
      assert.equal(res.body[0].position, 0);
      assert.equal(res.body[2].position, 2);
    });

    it('creates steps from object array', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      const res = await agent()
        .post(`/api/focus/${focus.id}/steps`)
        .send({ steps: [{ text: 'Do A' }, { text: 'Do B' }] })
        .expect(201);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].text, 'Do A');
    });

    it('returns 400 for empty steps', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/steps`).send({ steps: [] }).expect(400);
    });

    it('returns 400 for missing steps', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/steps`).send({}).expect(400);
    });

    it('returns 404 for non-existent session', async () => {
      await agent().post('/api/focus/99999/steps').send({ steps: ['a'] }).expect(404);
    });
  });

  // ── GET /api/focus/:id/steps ──
  describe('GET /api/focus/:id/steps', () => {
    it('returns steps for a session', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/steps`).send({ steps: ['A', 'B'] });
      const res = await agent().get(`/api/focus/${focus.id}/steps`).expect(200);
      assert.equal(res.body.length, 2);
    });

    it('returns empty array when no steps', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      const res = await agent().get(`/api/focus/${focus.id}/steps`).expect(200);
      assert.deepStrictEqual(res.body, []);
    });
  });

  // ── PUT /api/focus/steps/:stepId ──
  describe('PUT /api/focus/steps/:stepId', () => {
    it('toggles step done status', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      const steps = (await agent().post(`/api/focus/${focus.id}/steps`).send({ steps: ['Step 1'] })).body;
      const stepId = steps[0].id;

      // Toggle on
      const res1 = await agent().put(`/api/focus/steps/${stepId}`).expect(200);
      assert.equal(res1.body.done, 1);
      assert.ok(res1.body.completed_at);

      // Toggle off
      const res2 = await agent().put(`/api/focus/steps/${stepId}`).expect(200);
      assert.equal(res2.body.done, 0);
      assert.equal(res2.body.completed_at, null);
    });

    it('returns 404 for non-existent step', async () => {
      await agent().put('/api/focus/steps/99999').expect(404);
    });
  });

  // ── GET /api/focus/insights ──
  describe('GET /api/focus/insights', () => {
    it('returns insights structure', async () => {
      const res = await agent().get('/api/focus/insights').expect(200);
      assert.ok(Array.isArray(res.body.peakHours));
      assert.ok(Array.isArray(res.body.byStrategy));
      assert.equal(typeof res.body.avgRating, 'number');
      assert.ok(res.body.completionRate);
    });

    it('includes peak hours from sessions', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      makeFocus(task.id, { duration_sec: 1500 });
      makeFocus(task.id, { duration_sec: 1200 });

      const res = await agent().get('/api/focus/insights').expect(200);
      assert.ok(res.body.peakHours.length > 0);
    });
  });

  // ── GET /api/focus/streak ──
  describe('GET /api/focus/streak', () => {
    it('returns streak structure', async () => {
      const res = await agent().get('/api/focus/streak').expect(200);
      assert.equal(typeof res.body.streak, 'number');
      assert.equal(typeof res.body.bestStreak, 'number');
      assert.ok(Array.isArray(res.body.heatmap));
    });

    it('counts streak from today', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      // Use SQLite's date('now') to get the current UTC date consistently
      const { db } = setup();
      const todayStr = db.prepare("SELECT date('now') as d").get().d;
      db.prepare("INSERT INTO focus_sessions (task_id, duration_sec, type, started_at) VALUES (?,?,?,?)").run(
        task.id, 1500, 'pomodoro', todayStr + ' 12:00:00'
      );

      const res = await agent().get('/api/focus/streak').expect(200);
      assert.ok(res.body.streak >= 1);
    });
  });

  // ── GET /api/focus/goal ──
  describe('GET /api/focus/goal', () => {
    it('returns daily focus goal progress', async () => {
      const res = await agent().get('/api/focus/goal').expect(200);
      assert.equal(typeof res.body.goalMinutes, 'number');
      assert.equal(typeof res.body.todayMinutes, 'number');
      assert.equal(typeof res.body.todaySec, 'number');
      assert.equal(typeof res.body.pct, 'number');
    });

    it('uses custom goal from settings', async () => {
      const { db } = setup();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('dailyFocusGoalMinutes', '60')").run();

      const res = await agent().get('/api/focus/goal').expect(200);
      assert.equal(res.body.goalMinutes, 60);
    });

    it('calculates percentage correctly', async () => {
      const { db } = setup();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('dailyFocusGoalMinutes', '60')").run();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      makeFocus(task.id, { duration_sec: 1800 }); // 30 minutes

      const res = await agent().get('/api/focus/goal').expect(200);
      assert.equal(res.body.pct, 50);
    });
  });

  // ── Cascade delete ──
  describe('Cascade delete', () => {
    it('deletes meta and steps when session is deleted', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);

      await agent().post(`/api/focus/${focus.id}/meta`).send({ intention: 'test' });
      await agent().post(`/api/focus/${focus.id}/steps`).send({ steps: ['a', 'b'] });

      await agent().delete(`/api/focus/${focus.id}`).expect(200);

      // Meta and steps should be gone
      const { db } = setup();
      const meta = db.prepare('SELECT * FROM focus_session_meta WHERE session_id=?').get(focus.id);
      const steps = db.prepare('SELECT * FROM focus_steps WHERE session_id=?').all(focus.id);
      assert.equal(meta, undefined);
      assert.equal(steps.length, 0);
    });
  });
});
