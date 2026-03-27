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
});
