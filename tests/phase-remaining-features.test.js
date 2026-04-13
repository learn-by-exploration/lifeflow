const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, makeArea, makeGoal, makeTask, makeHabit, logHabit } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

describe('Remaining phase APIs', () => {
  it('persists pinned area settings', async () => {
    const areaA = makeArea({ name: 'Health' });
    const areaB = makeArea({ name: 'Work', position: 1 });

    await agent().put('/api/settings').send({ pinnedAreas: JSON.stringify([areaB.id, areaA.id]) }).expect(200);
    const res = await agent().get('/api/settings').expect(200);

    assert.equal(res.body.pinnedAreas, JSON.stringify([areaB.id, areaA.id]));
  });

  it('returns habit analytics summary and per-habit data', async () => {
    const area = makeArea({ name: 'Health' });
    const habit = makeHabit({ name: 'Read', area_id: area.id, target: 1 });
    const today = new Date();
    for (let offset = 0; offset < 5; offset++) {
      const day = new Date(today);
      day.setDate(day.getDate() - offset);
      const ds = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      logHabit(habit.id, ds);
    }

    const res = await agent().get('/api/stats/habits').expect(200);

    assert.equal(res.body.overall.totalHabits, 1);
    assert.ok(Array.isArray(res.body.trends));
    assert.ok(Array.isArray(res.body.heatmap));
    assert.equal(res.body.habits.length, 1);
    assert.equal(res.body.habits[0].name, 'Read');
    assert.ok(res.body.habits[0].completion_rate_30 >= 0);
    assert.ok(Array.isArray(res.body.habits[0].sparkline_30));
  });

  it('returns hierarchical planner data grouped by area and goal', async () => {
    const area = makeArea({ name: 'Work' });
    const goal = makeGoal(area.id, { title: 'Launch' });
    const task = makeTask(goal.id, { title: 'Draft outline' });

    const res = await agent().get('/api/tasks/planner').expect(200);

    assert.ok(Array.isArray(res.body.areas));
    assert.equal(res.body.areas[0].name, 'Work');
    assert.equal(res.body.areas[0].goals[0].title, 'Launch');
    assert.equal(res.body.areas[0].goals[0].tasks[0].id, task.id);
  });

  it('moves selected tasks to a different goal', async () => {
    const area = makeArea({ name: 'Ops' });
    const sourceGoal = makeGoal(area.id, { title: 'Backlog' });
    const targetGoal = makeGoal(area.id, { title: 'Next Up', position: 1 });
    const taskA = makeTask(sourceGoal.id, { title: 'Task A' });
    const taskB = makeTask(sourceGoal.id, { title: 'Task B', position: 1 });

    const res = await agent().post('/api/tasks/batch-move').send({
      task_ids: [taskA.id, taskB.id],
      target_goal_id: targetGoal.id,
    }).expect(200);

    assert.equal(res.body.moved_count, 2);

    const planner = await agent().get('/api/tasks/planner').expect(200);
    const nextUp = planner.body.areas[0].goals.find(goal => goal.id === targetGoal.id);
    assert.deepEqual(nextUp.tasks.map(task => task.id), [taskA.id, taskB.id]);
  });

  it('rejects batch moves larger than 100 tasks', async () => {
    const area = makeArea({ name: 'Ops' });
    const targetGoal = makeGoal(area.id, { title: 'Target' });

    const res = await agent().post('/api/tasks/batch-move').send({
      task_ids: new Array(101).fill(1),
      target_goal_id: targetGoal.id,
    }).expect(400);

    assert.match(res.body.error, /Too many task_ids/);
  });
});