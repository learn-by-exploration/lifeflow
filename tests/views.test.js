const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

describe('Views API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/tasks/my-day', () => {
    it('returns tasks with my_day=1', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'My day task', my_day: 1 });
      makeTask(goal.id, { title: 'Not my day', my_day: 0 });

      const res = await agent().get('/api/tasks/my-day').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'My day task');
    });

    it('includes tasks due today even without my_day flag', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Due today', due_date: today(), my_day: 0 });

      const res = await agent().get('/api/tasks/my-day').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Due today');
    });

    it('returns enriched tasks with area and goal info', async () => {
      const area = makeArea({ name: 'Health', icon: '💪' });
      const goal = makeGoal(area.id, { title: 'Fitness', color: '#00FF00' });
      makeTask(goal.id, { title: 'Workout', my_day: 1 });

      const res = await agent().get('/api/tasks/my-day').expect(200);
      assert.equal(res.body[0].area_name, 'Health');
      assert.equal(res.body[0].goal_title, 'Fitness');
      assert.ok(Array.isArray(res.body[0].tags));
    });

    it('orders by priority descending', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Low', my_day: 1, priority: 1 });
      makeTask(goal.id, { title: 'High', my_day: 1, priority: 3 });

      const res = await agent().get('/api/tasks/my-day').expect(200);
      assert.equal(res.body[0].title, 'High');
      assert.equal(res.body[1].title, 'Low');
    });
  });

  describe('GET /api/tasks/all', () => {
    it('returns all tasks with enrichment', async () => {
      const area = makeArea({ name: 'Work' });
      const goal = makeGoal(area.id, { title: 'Project' });
      makeTask(goal.id, { title: 'Task A' });
      makeTask(goal.id, { title: 'Task B' });

      const res = await agent().get('/api/tasks/all').expect(200);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].area_name, 'Work');
      assert.equal(res.body[0].goal_title, 'Project');
    });

    it('orders by status, priority, due_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Done', status: 'done', priority: 3 });
      makeTask(goal.id, { title: 'Doing', status: 'doing', priority: 1 });
      makeTask(goal.id, { title: 'Todo Hi', status: 'todo', priority: 3 });

      const res = await agent().get('/api/tasks/all').expect(200);
      // doing < todo < done in sort, then priority DESC
      assert.equal(res.body[0].title, 'Doing');
    });
  });

  describe('GET /api/tasks/board', () => {
    it('returns all board tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'A' });
      makeTask(goal.id, { title: 'B' });

      const res = await agent().get('/api/tasks/board').expect(200);
      assert.equal(res.body.length, 2);
    });

    it('filters by goal_id', async () => {
      const area = makeArea();
      const goal1 = makeGoal(area.id, { title: 'G1' });
      const goal2 = makeGoal(area.id, { title: 'G2' });
      makeTask(goal1.id, { title: 'In G1' });
      makeTask(goal2.id, { title: 'In G2' });

      const res = await agent().get(`/api/tasks/board?goal_id=${goal1.id}`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'In G1');
    });

    it('filters by area_id', async () => {
      const area1 = makeArea({ name: 'A1' });
      const area2 = makeArea({ name: 'A2' });
      const goal1 = makeGoal(area1.id);
      const goal2 = makeGoal(area2.id);
      makeTask(goal1.id, { title: 'In A1' });
      makeTask(goal2.id, { title: 'In A2' });

      const res = await agent().get(`/api/tasks/board?area_id=${area1.id}`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'In A1');
    });

    it('filters by priority', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'High', priority: 3 });
      makeTask(goal.id, { title: 'Low', priority: 1 });

      const res = await agent().get('/api/tasks/board?priority=3').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'High');
    });

    it('filters by tag_id', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const tag = makeTag({ name: 'urgent' });
      const t1 = makeTask(goal.id, { title: 'Tagged' });
      makeTask(goal.id, { title: 'Untagged' });
      linkTag(t1.id, tag.id);

      const res = await agent().get(`/api/tasks/board?tag_id=${tag.id}`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Tagged');
    });

    it('combines multiple filters', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Match', priority: 3 });
      makeTask(goal.id, { title: 'No match', priority: 1 });

      const res = await agent()
        .get(`/api/tasks/board?goal_id=${goal.id}&priority=3`)
        .expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Match');
    });
  });

  describe('GET /api/tasks/calendar', () => {
    it('returns tasks within date range', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'In range', due_date: '2025-07-15' });
      makeTask(goal.id, { title: 'Out of range', due_date: '2025-08-15' });
      makeTask(goal.id, { title: 'No date', due_date: null });

      const res = await agent()
        .get('/api/tasks/calendar?start=2025-07-01&end=2025-07-31')
        .expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'In range');
    });

    it('returns 400 when start or end is missing', async () => {
      await agent().get('/api/tasks/calendar?start=2025-07-01').expect(400);
      await agent().get('/api/tasks/calendar?end=2025-07-31').expect(400);
      await agent().get('/api/tasks/calendar').expect(400);
    });

    it('returns enriched tasks with area/goal info', async () => {
      const area = makeArea({ name: 'Health' });
      const goal = makeGoal(area.id, { title: 'Fitness' });
      makeTask(goal.id, { title: 'Run', due_date: '2025-07-15' });

      const res = await agent()
        .get('/api/tasks/calendar?start=2025-07-01&end=2025-07-31')
        .expect(200);
      assert.equal(res.body[0].area_name, 'Health');
      assert.equal(res.body[0].goal_title, 'Fitness');
    });
  });

  describe('GET /api/tasks/overdue', () => {
    it('returns tasks with due_date in the past that are not done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Overdue', due_date: '2020-01-01', status: 'todo' });
      makeTask(goal.id, { title: 'Done overdue', due_date: '2020-01-01', status: 'done' });
      makeTask(goal.id, { title: 'Future', due_date: daysFromNow(30), status: 'todo' });

      const res = await agent().get('/api/tasks/overdue').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Overdue');
    });

    it('returns empty array when nothing is overdue', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Future', due_date: daysFromNow(10) });

      const res = await agent().get('/api/tasks/overdue').expect(200);
      assert.equal(res.body.length, 0);
    });
  });

  describe('GET /api/tasks/search', () => {
    it('searches tasks by title', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Buy groceries' });
      makeTask(goal.id, { title: 'Write report' });

      const res = await agent().get('/api/tasks/search?q=groceries').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Buy groceries');
    });

    it('searches tasks by note', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Task A', note: 'important meeting notes' });
      makeTask(goal.id, { title: 'Task B', note: '' });

      const res = await agent().get('/api/tasks/search?q=meeting').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Task A');
    });

    it('searches by subtask title', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Parent' });
      makeSubtask(task.id, { title: 'Specific subtask name' });

      const res = await agent().get('/api/tasks/search?q=Specific%20subtask').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Parent');
    });

    it('returns empty array for empty query', async () => {
      const res = await agent().get('/api/tasks/search?q=').expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('returns empty array when q is missing', async () => {
      const res = await agent().get('/api/tasks/search').expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('is case-insensitive', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'UPPERCASE task' });

      const res = await agent().get('/api/tasks/search?q=uppercase').expect(200);
      assert.equal(res.body.length, 1);
    });

    it('limits results to 50', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      for (let i = 0; i < 60; i++) {
        makeTask(goal.id, { title: `searchable-${i}` });
      }

      const res = await agent().get('/api/tasks/search?q=searchable').expect(200);
      assert.equal(res.body.length, 50);
    });
  });
});
