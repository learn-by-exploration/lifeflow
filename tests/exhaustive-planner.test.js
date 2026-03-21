const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeFocus, agent, today, daysFromNow } = require('./helpers');

describe('Planner, Time Tracking & Focus – exhaustive coverage', () => {
  let db;
  before(() => { db = setup().db; });
  beforeEach(() => cleanDb());
  after(() => teardown());

  // helper: scaffold area → goal → task
  function scaffold(taskOverrides = {}) {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, taskOverrides);
    return { area, goal, task };
  }

  // ── POST /api/tasks/:id/time ──────────────────────────────────

  it('time: returns 404 for nonexistent task', async () => {
    const res = await agent().post('/api/tasks/99999/time').send({ minutes: 10 });
    assert.equal(res.status, 404);
  });

  it('time: accumulates minutes across multiple calls', async () => {
    const { task } = scaffold();
    await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 15 });
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 25 });
    assert.equal(res.status, 200);
    assert.equal(res.body.actual_minutes, 40);
  });

  it('time: returns 400 for minutes=0', async () => {
    const { task } = scaffold();
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 0 });
    assert.equal(res.status, 400);
  });

  it('time: returns 400 for negative minutes', async () => {
    const { task } = scaffold();
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: -5 });
    assert.equal(res.status, 400);
  });

  it('time: returns 400 for missing minutes', async () => {
    const { task } = scaffold();
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({});
    assert.equal(res.status, 400);
  });

  // ── GET /api/planner/:date ────────────────────────────────────

  it('planner/:date returns 400 for invalid date format', async () => {
    const res = await agent().get('/api/planner/not-a-date');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('planner/:date returns empty scheduled/unscheduled when no matching tasks', async () => {
    const res = await agent().get(`/api/planner/${today()}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.scheduled, []);
    assert.deepEqual(res.body.unscheduled, []);
  });

  it('planner/:date separates time-blocked vs non-time-blocked tasks', async () => {
    const { goal } = scaffold({ title: 'Blocked', due_date: today() });
    // first task already created by scaffold – give it a time block
    const { task: t1 } = { task: db.prepare('SELECT * FROM tasks WHERE goal_id=?').get(goal.id) };
    db.prepare('UPDATE tasks SET time_block_start=?, time_block_end=? WHERE id=?').run('09:00', '10:00', t1.id);
    // second task – no time block
    makeTask(goal.id, { title: 'Unblocked', due_date: today() });

    const res = await agent().get(`/api/planner/${today()}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.scheduled.length, 1);
    assert.equal(res.body.scheduled[0].title, 'Blocked');
    assert.equal(res.body.unscheduled.length, 1);
    assert.equal(res.body.unscheduled[0].title, 'Unblocked');
  });

  // ── GET /api/planner/suggest ──────────────────────────────────

  it('suggest: overdue array empty when nothing overdue', async () => {
    // create a task due in the future – not overdue
    scaffold({ due_date: daysFromNow(5) });
    const res = await agent().get('/api/planner/suggest');
    assert.equal(res.status, 200);
    assert.equal(res.body.overdue.length, 0);
  });

  it('suggest: dueToday excludes my_day tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'In My Day', due_date: today(), my_day: 1 });
    makeTask(goal.id, { title: 'Not My Day', due_date: today(), my_day: 0 });

    const res = await agent().get('/api/planner/suggest');
    assert.equal(res.status, 200);
    const titles = res.body.dueToday.map(t => t.title);
    assert.ok(titles.includes('Not My Day'));
    assert.ok(!titles.includes('In My Day'));
  });

  it('suggest: highPriority includes p2 and p3 tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'P3 Task', priority: 3 });
    makeTask(goal.id, { title: 'P2 Task', priority: 2 });
    makeTask(goal.id, { title: 'P1 Task', priority: 1 });

    const res = await agent().get('/api/planner/suggest');
    assert.equal(res.status, 200);
    const titles = res.body.highPriority.map(t => t.title);
    assert.ok(titles.includes('P3 Task'));
    assert.ok(titles.includes('P2 Task'));
    assert.ok(!titles.includes('P1 Task'));
  });

  it('suggest: upcoming returns tasks due within 3 days', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Tomorrow', due_date: daysFromNow(1) });
    makeTask(goal.id, { title: 'In 2 days', due_date: daysFromNow(2) });
    makeTask(goal.id, { title: 'In 5 days', due_date: daysFromNow(5) });

    const res = await agent().get('/api/planner/suggest');
    assert.equal(res.status, 200);
    const titles = res.body.upcoming.map(t => t.title);
    assert.ok(titles.includes('Tomorrow'));
    assert.ok(titles.includes('In 2 days'));
    assert.ok(!titles.includes('In 5 days'));
  });

  // ── GET /api/planner/smart ────────────────────────────────────

  it('smart: returns max_minutes in response', async () => {
    const res = await agent().get('/api/planner/smart?max_minutes=120');
    assert.equal(res.status, 200);
    assert.equal(res.body.max_minutes, 120);
  });

  it('smart: stops adding when total exceeds max_minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    // each task defaults to 30 min estimated → max_minutes=50 should fit only 1
    makeTask(goal.id, { title: 'A', due_date: daysFromNow(-1) });
    makeTask(goal.id, { title: 'B', due_date: daysFromNow(-1) });
    makeTask(goal.id, { title: 'C', due_date: daysFromNow(-1) });

    const res = await agent().get('/api/planner/smart?max_minutes=50');
    assert.equal(res.status, 200);
    // 30 min fits once, second would be 60 > 50, so only 1
    assert.equal(res.body.suggested.length, 1);
    assert.ok(res.body.total_minutes <= 50);
  });

  it('smart: limits to 8 tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    // create 12 overdue tasks with tiny estimated_minutes to fit within budget
    for (let i = 0; i < 12; i++) {
      const t = makeTask(goal.id, { title: `Task ${i}`, due_date: daysFromNow(-1) });
      db.prepare('UPDATE tasks SET estimated_minutes=? WHERE id=?').run(5, t.id);
    }

    const res = await agent().get('/api/planner/smart?max_minutes=9999');
    assert.equal(res.status, 200);
    assert.ok(res.body.suggested.length <= 8);
  });

  // ── GET /api/focus/history ────────────────────────────────────

  it('focus history: returns empty items when no focus data', async () => {
    const res = await agent().get('/api/focus/history');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
    assert.deepEqual(res.body.items, []);
  });

  it('focus history: pagination page and limit work', async () => {
    const { task } = scaffold();
    for (let i = 0; i < 5; i++) makeFocus(task.id, { duration_sec: 300 });

    const res = await agent().get('/api/focus/history?page=1&limit=2');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.total, 5);

    const res2 = await agent().get('/api/focus/history?page=2&limit=2');
    assert.equal(res2.status, 200);
    assert.equal(res2.body.items.length, 2);
    assert.equal(res2.body.page, 2);
  });

  it('focus history: includes task_title in session', async () => {
    const { task } = scaffold({ title: 'Focus Target' });
    makeFocus(task.id);

    const res = await agent().get('/api/focus/history');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].task_title, 'Focus Target');
  });

  // ── GET /api/reminders ────────────────────────────────────────

  it('reminders: returns empty arrays when nothing due', async () => {
    const res = await agent().get('/api/reminders');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.overdue, []);
    assert.deepEqual(res.body.today, []);
    assert.deepEqual(res.body.upcoming, []);
  });

  it('reminders: excludes done tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Done Overdue', due_date: daysFromNow(-2), status: 'done' });
    makeTask(goal.id, { title: 'Done Today', due_date: today(), status: 'done' });
    makeTask(goal.id, { title: 'Done Upcoming', due_date: daysFromNow(1), status: 'done' });

    const res = await agent().get('/api/reminders');
    assert.equal(res.status, 200);
    assert.equal(res.body.overdue.length, 0);
    assert.equal(res.body.today.length, 0);
    assert.equal(res.body.upcoming.length, 0);
  });
});
