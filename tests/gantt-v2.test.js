const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Gantt V2 — Timeline API', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('GET /api/tasks/timeline includes blocked_by arrays', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Task A', due_date: '2026-04-01' });
    const t2 = makeTask(goal.id, { title: 'Task B', due_date: '2026-04-05' });
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(t2.id, t1.id);

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31').expect(200);
    const tasks = res.body.tasks;
    assert.ok(Array.isArray(tasks));

    const taskB = tasks.find(t => t.id === t2.id);
    assert.ok(taskB, 'Task B should be in timeline');
    assert.ok(Array.isArray(taskB.blocked_by), 'Should have blocked_by array');
    assert.ok(taskB.blocked_by.includes(t1.id), 'Task B should be blocked by Task A');
  });

  it('tasks with dependencies — both present in response', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Prereq', due_date: '2026-04-01' });
    const t2 = makeTask(goal.id, { title: 'Dependent', due_date: '2026-04-10' });
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(t2.id, t1.id);

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31');
    const ids = res.body.tasks.map(t => t.id);
    assert.ok(ids.includes(t1.id));
    assert.ok(ids.includes(t2.id));
  });

  it('tasks without dates excluded from timeline', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'No Date', due_date: null });
    makeTask(goal.id, { title: 'Has Date', due_date: '2026-05-01' });

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31').expect(200);
    const titles = res.body.tasks.map(t => t.title);
    assert.ok(!titles.includes('No Date'));
    assert.ok(titles.includes('Has Date'));
  });

  it('progress reflects subtask completion ratio', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id, { title: 'With Subtasks', due_date: '2026-04-15' });
    db.prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?,?,?,?)').run(t.id, 'Sub1', 1, 0);
    db.prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?,?,?,?)').run(t.id, 'Sub2', 0, 1);

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31').expect(200);
    const task = res.body.tasks.find(r => r.id === t.id);
    assert.ok(task);
    assert.equal(task.subtask_done, 1);
    assert.equal(task.subtask_total, 2);
  });

  it('batched dependency query populates blocked_by for multiple tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'T1', due_date: '2026-04-01' });
    const t2 = makeTask(goal.id, { title: 'T2', due_date: '2026-04-02' });
    const t3 = makeTask(goal.id, { title: 'T3', due_date: '2026-04-03' });
    // T2 blocked by T1, T3 blocked by T1 and T2
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(t2.id, t1.id);
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(t3.id, t1.id);
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(t3.id, t2.id);

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31').expect(200);
    const tasks = res.body.tasks;
    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));

    assert.deepEqual(taskMap[t1.id].blocked_by, []);
    assert.deepEqual(taskMap[t2.id].blocked_by, [t1.id]);
    assert.ok(taskMap[t3.id].blocked_by.includes(t1.id));
    assert.ok(taskMap[t3.id].blocked_by.includes(t2.id));
    assert.equal(taskMap[t3.id].blocked_by.length, 2);
  });

  // ── Task 3.6 — Gantt View Expansion ──

  it('GET /api/tasks/timeline returns tasks within date range', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'In Range', due_date: '2026-06-15' });
    makeTask(goal.id, { title: 'Out of Range', due_date: '2027-01-01' });

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31');
    assert.equal(res.status, 200);
    const titles = res.body.tasks.map(t => t.title);
    assert.ok(titles.includes('In Range'));
    assert.ok(!titles.includes('Out of Range'));
  });

  it('GET /api/tasks/timeline excludes tasks without due_date', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'No Due', due_date: null });

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31');
    assert.equal(res.status, 200);
    assert.ok(!res.body.tasks.some(t => t.title === 'No Due'));
  });

  it('timeline tasks include area_name and goal_color', async () => {
    const area = makeArea({ name: 'Work Area' });
    const goal = makeGoal(area.id, { color: '#FF5733' });
    makeTask(goal.id, { due_date: '2026-06-01' });

    const res = await agent().get('/api/tasks/timeline?start=2026-01-01&end=2026-12-31');
    const task = res.body.tasks[0];
    assert.ok(task.area_name);
    assert.ok(task.goal_color);
  });

  it('frontend: renderGantt function exists in app.js', () => {
    const fs = require('fs');
    const path = require('path');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(/renderGantt|renderTimeline/.test(appJs), 'app.js should have gantt/timeline render function');
  });

  it('frontend: gantt-bar class used in gantt rendering', () => {
    const fs = require('fs');
    const path = require('path');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(/gantt-bar/.test(appJs), 'app.js should use gantt-bar class in SVG rendering');
  });

  it('timeline requires start and end params', async () => {
    const res = await agent().get('/api/tasks/timeline');
    assert.equal(res.status, 400);
  });
});
