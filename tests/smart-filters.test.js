const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

describe('Phase 5 - Smart Filters, Bulk Ops, Briefing, Recurring, Command Palette', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── SMART FILTERS ───
  describe('Smart Filters', () => {
    it('GET /api/filters/smart/stale returns old tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      // Create a task with old created_at
      const { db } = setup();
      db.prepare("INSERT INTO tasks (goal_id,title,status,created_at) VALUES (?,'Old task','todo',datetime('now','-10 days'))").run(g.id);
      makeTask(g.id, { title: 'Recent task' }); // fresh task
      const res = await agent().get('/api/filters/smart/stale').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some(t => t.title === 'Old task'));
      assert.ok(!res.body.some(t => t.title === 'Recent task'));
    });

    it('GET /api/filters/smart/quickwins returns quick unblocked tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { db } = setup();
      // Quick win task with estimated_minutes
      db.prepare("INSERT INTO tasks (goal_id,title,status,estimated_minutes) VALUES (?,'Quick task','todo',10)").run(g.id);
      // Long task (not a quick win)
      db.prepare("INSERT INTO tasks (goal_id,title,status,estimated_minutes) VALUES (?,'Long task','todo',60)").run(g.id);
      const res = await agent().get('/api/filters/smart/quickwins').expect(200);
      assert.ok(res.body.some(t => t.title === 'Quick task'));
      assert.ok(!res.body.some(t => t.title === 'Long task'));
    });

    it('GET /api/filters/smart/blocked returns blocked tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Blocker' });
      const t2 = makeTask(g.id, { title: 'Blocked task' });
      const { db } = setup();
      db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(t2.id, t1.id);
      const res = await agent().get('/api/filters/smart/blocked').expect(200);
      assert.ok(res.body.some(t => t.title === 'Blocked task'));
      assert.ok(!res.body.some(t => t.title === 'Blocker'));
    });

    it('GET /api/filters/counts returns badge counts', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { priority: 2 });
      // Create a saved filter for priority 2
      const fRes = await agent().post('/api/filters').send({
        name: 'High Priority', filters: { priority: '2' }
      }).expect(201);
      const res = await agent().get('/api/filters/counts').expect(200);
      assert.ok(Array.isArray(res.body));
      const entry = res.body.find(c => c.id === fRes.body.id);
      assert.ok(entry);
      assert.equal(entry.count, 1);
    });

    it('GET /api/filters/execute supports stale_days param', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { db } = setup();
      db.prepare("INSERT INTO tasks (goal_id,title,status,created_at) VALUES (?,'Stale','todo',datetime('now','-14 days'))").run(g.id);
      makeTask(g.id, { title: 'Fresh' });
      const res = await agent().get('/api/filters/execute?stale_days=7').expect(200);
      assert.ok(res.body.some(t => t.title === 'Stale'));
      assert.ok(!res.body.some(t => t.title === 'Fresh'));
    });
  });

  // ─── BULK OPERATIONS ───
  describe('Bulk Operations', () => {
    it('PUT /api/tasks/bulk updates multiple tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Task A' });
      const t2 = makeTask(g.id, { title: 'Task B' });
      const res = await agent().put('/api/tasks/bulk').send({
        ids: [t1.id, t2.id],
        changes: { priority: 3 }
      }).expect(200);
      assert.equal(res.body.updated, 2);
      // Verify
      const r1 = await agent().get('/api/tasks/' + t1.id).expect(200);
      const r2 = await agent().get('/api/tasks/' + t2.id).expect(200);
      assert.equal(r1.body.priority, 3);
      assert.equal(r2.body.priority, 3);
    });

    it('PUT /api/tasks/bulk can complete tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id);
      const t2 = makeTask(g.id);
      const res = await agent().put('/api/tasks/bulk').send({
        ids: [t1.id, t2.id],
        changes: { status: 'done' }
      }).expect(200);
      assert.equal(res.body.updated, 2);
      const r1 = await agent().get('/api/tasks/' + t1.id).expect(200);
      assert.equal(r1.body.status, 'done');
      assert.ok(r1.body.completed_at);
    });

    it('PUT /api/tasks/bulk can add tags', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id);
      const tag = makeTag({ name: 'urgent' });
      const res = await agent().put('/api/tasks/bulk').send({
        ids: [t1.id],
        changes: { add_tag_id: tag.id }
      }).expect(200);
      assert.equal(res.body.updated, 1);
      const r = await agent().get('/api/tasks/' + t1.id).expect(200);
      assert.ok(r.body.tags.some(tg => tg.name === 'urgent'));
    });

    it('POST /api/tasks/bulk-myday sets my_day on multiple tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id);
      const t2 = makeTask(g.id);
      const res = await agent().post('/api/tasks/bulk-myday').send({
        ids: [t1.id, t2.id]
      }).expect(200);
      assert.equal(res.body.updated, 2);
      const r1 = await agent().get('/api/tasks/' + t1.id).expect(200);
      assert.equal(r1.body.my_day, 1);
    });

    it('POST /api/tasks/reschedule updates due dates and clears myday', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { my_day: 1 });
      const tomorrow = daysFromNow(1);
      const res = await agent().post('/api/tasks/reschedule').send({
        ids: [t1.id],
        due_date: tomorrow,
        clear_myday: true
      }).expect(200);
      assert.equal(res.body.updated, 1);
      const r1 = await agent().get('/api/tasks/' + t1.id).expect(200);
      assert.equal(r1.body.due_date, tomorrow);
      assert.equal(r1.body.my_day, 0);
    });
  });

  // ─── DAILY BRIEFING ───
  describe('Daily Briefing (Planner Suggest)', () => {
    it('GET /api/planner/suggest returns categorized suggestions', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Overdue', due_date: daysFromNow(-3) });
      makeTask(g.id, { title: 'Today', due_date: today() });
      makeTask(g.id, { title: 'High Pri', priority: 3 });
      makeTask(g.id, { title: 'Upcoming', due_date: daysFromNow(2) });
      const res = await agent().get('/api/planner/suggest').expect(200);
      assert.ok(Array.isArray(res.body.overdue));
      assert.ok(Array.isArray(res.body.dueToday));
      assert.ok(Array.isArray(res.body.highPriority));
      assert.ok(Array.isArray(res.body.upcoming));
      assert.ok(res.body.overdue.some(t => t.title === 'Overdue'));
      assert.ok(res.body.dueToday.some(t => t.title === 'Today'));
      assert.ok(res.body.highPriority.some(t => t.title === 'High Pri'));
      assert.ok(res.body.upcoming.some(t => t.title === 'Upcoming'));
    });

    it('excludes tasks already in My Day from dueToday', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Already planned', due_date: today(), my_day: 1 });
      makeTask(g.id, { title: 'Not planned', due_date: today() });
      const res = await agent().get('/api/planner/suggest').expect(200);
      assert.ok(!res.body.dueToday.some(t => t.title === 'Already planned'));
      assert.ok(res.body.dueToday.some(t => t.title === 'Not planned'));
    });
  });

  // ─── RECURRING TASKS ───
  describe('Recurring Tasks', () => {
    it('POST /api/tasks/:id/skip skips and spawns next occurrence', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Weekly report', recurring: 'weekly', due_date: today() });
      const res = await agent().post('/api/tasks/' + t.id + '/skip').expect(200);
      assert.equal(res.body.skipped, t.id);
      assert.ok(res.body.next);
      assert.equal(res.body.next.title, 'Weekly report');
      assert.equal(res.body.next.recurring, 'weekly');
      assert.ok(res.body.next.due_date !== today()); // should be next week
      // Original should be done
      const orig = await agent().get('/api/tasks/' + t.id).expect(200);
      assert.equal(orig.body.status, 'done');
    });

    it('POST /api/tasks/:id/skip rejects non-recurring tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Normal task' });
      await agent().post('/api/tasks/' + t.id + '/skip').expect(400);
    });

    it('GET /api/tasks/recurring returns active recurring tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Weekly', recurring: 'weekly' });
      makeTask(g.id, { title: 'Non-recurring' });
      const res = await agent().get('/api/tasks/recurring').expect(200);
      assert.ok(res.body.some(t => t.title === 'Weekly'));
      assert.ok(!res.body.some(t => t.title === 'Non-recurring'));
    });

    it('POST /api/tasks/:id/move moves task to different goal', async () => {
      const a = makeArea();
      const g1 = makeGoal(a.id, { title: 'Goal 1' });
      const g2 = makeGoal(a.id, { title: 'Goal 2' });
      const t = makeTask(g1.id, { title: 'Movable' });
      const res = await agent().post('/api/tasks/' + t.id + '/move').send({ goal_id: g2.id }).expect(200);
      assert.equal(res.body.goal_id, g2.id);
    });
  });

  // ─── BULK EDGE CASES ───
  describe('Bulk Edge Cases', () => {
    it('PUT /api/tasks/bulk rejects empty ids', async () => {
      await agent().put('/api/tasks/bulk').send({ ids: [], changes: { priority: 1 } }).expect(400);
    });

    it('PUT /api/tasks/bulk rejects missing changes', async () => {
      await agent().put('/api/tasks/bulk').send({ ids: [1] }).expect(400);
    });

    it('PUT /api/tasks/bulk skips nonexistent tasks', async () => {
      const res = await agent().put('/api/tasks/bulk').send({
        ids: [99999],
        changes: { priority: 1 }
      }).expect(200);
      assert.equal(res.body.updated, 0);
    });
  });
});
