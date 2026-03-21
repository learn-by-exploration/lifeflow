const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

describe('Exhaustive Saved Filters API', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── COUNTS ───
  describe('GET /api/filters/counts', () => {
    it('returns empty array when no saved filters', async () => {
      const res = await agent().get('/api/filters/counts');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it('counts correctly with area_id filter', async () => {
      const a1 = makeArea({ name: 'Work' });
      const a2 = makeArea({ name: 'Personal' });
      const g1 = makeGoal(a1.id);
      const g2 = makeGoal(a2.id);
      makeTask(g1.id, { title: 'Work task 1' });
      makeTask(g1.id, { title: 'Work task 2' });
      makeTask(g2.id, { title: 'Personal task' });

      const fRes = await agent().post('/api/filters').send({
        name: 'Work Only', filters: { area_id: a1.id }
      });
      assert.equal(fRes.status, 201);

      const res = await agent().get('/api/filters/counts');
      assert.equal(res.status, 200);
      const entry = res.body.find(c => c.id === fRes.body.id);
      assert.ok(entry);
      assert.equal(entry.count, 2);
    });

    it('counts correctly with tag_id filter', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Tagged' });
      makeTask(g.id, { title: 'Untagged' });
      const tag = makeTag({ name: 'urgent' });
      linkTag(t1.id, tag.id);

      const fRes = await agent().post('/api/filters').send({
        name: 'By Tag', filters: { tag_id: tag.id }
      });
      assert.equal(fRes.status, 201);

      const res = await agent().get('/api/filters/counts');
      const entry = res.body.find(c => c.id === fRes.body.id);
      assert.ok(entry);
      assert.equal(entry.count, 1);
    });

    it('counts correctly with due=overdue filter', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Overdue', due_date: daysFromNow(-3), status: 'todo' });
      makeTask(g.id, { title: 'Future', due_date: daysFromNow(5) });
      makeTask(g.id, { title: 'No date' });

      const fRes = await agent().post('/api/filters').send({
        name: 'Overdue', filters: { due: 'overdue' }
      });

      const res = await agent().get('/api/filters/counts');
      const entry = res.body.find(c => c.id === fRes.body.id);
      assert.ok(entry);
      assert.equal(entry.count, 1);
    });

    it('counts correctly with due=none filter', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Has date', due_date: today() });
      makeTask(g.id, { title: 'No date 1' });
      makeTask(g.id, { title: 'No date 2' });

      const fRes = await agent().post('/api/filters').send({
        name: 'No Due Date', filters: { due: 'none' }
      });

      const res = await agent().get('/api/filters/counts');
      const entry = res.body.find(c => c.id === fRes.body.id);
      assert.ok(entry);
      assert.equal(entry.count, 2);
    });

    it('counts correctly with my_day filter', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'My day', my_day: 1 });
      makeTask(g.id, { title: 'Not my day', my_day: 0 });

      const fRes = await agent().post('/api/filters').send({
        name: 'My Day', filters: { my_day: 1 }
      });

      const res = await agent().get('/api/filters/counts');
      const entry = res.body.find(c => c.id === fRes.body.id);
      assert.ok(entry);
      assert.equal(entry.count, 1);
    });
  });

  // ─── SMART FILTERS ───
  describe('GET /api/filters/smart/:type', () => {
    it('returns 400 for unknown type', async () => {
      const res = await agent().get('/api/filters/smart/nonexistent');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('smart/stale returns empty when no stale tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Fresh task' }); // created now, not stale
      const res = await agent().get('/api/filters/smart/stale');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0);
    });

    it('smart/quickwins returns empty when no quick wins', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      // Task with no estimated_minutes – not a quick win
      makeTask(g.id, { title: 'No estimate' });
      // Task with high estimate – not a quick win
      const { db } = setup();
      db.prepare("INSERT INTO tasks (goal_id,title,status,estimated_minutes) VALUES (?,'Long task','todo',120)").run(g.id);
      const res = await agent().get('/api/filters/smart/quickwins');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0);
    });

    it('smart/blocked returns empty when no blocked tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Independent task' });
      const res = await agent().get('/api/filters/smart/blocked');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0);
    });
  });

  // ─── EXECUTE FILTERS ───
  describe('GET /api/filters/execute', () => {
    it('filters by area_id', async () => {
      const a1 = makeArea({ name: 'Work' });
      const a2 = makeArea({ name: 'Home' });
      const g1 = makeGoal(a1.id);
      const g2 = makeGoal(a2.id);
      makeTask(g1.id, { title: 'Work task' });
      makeTask(g2.id, { title: 'Home task' });

      const res = await agent().get(`/api/filters/execute?area_id=${a1.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Work task');
    });

    it('filters by goal_id', async () => {
      const a = makeArea();
      const g1 = makeGoal(a.id, { title: 'Goal A' });
      const g2 = makeGoal(a.id, { title: 'Goal B' });
      makeTask(g1.id, { title: 'Task in A' });
      makeTask(g2.id, { title: 'Task in B' });

      const res = await agent().get(`/api/filters/execute?goal_id=${g1.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Task in A');
    });

    it('filters by tag_id', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Tagged task' });
      makeTask(g.id, { title: 'Untagged task' });
      const tag = makeTag({ name: 'focus' });
      linkTag(t1.id, tag.id);

      const res = await agent().get(`/api/filters/execute?tag_id=${tag.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Tagged task');
    });

    it('filters by due=overdue', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Overdue', due_date: daysFromNow(-5), status: 'todo' });
      makeTask(g.id, { title: 'Future', due_date: daysFromNow(3) });
      makeTask(g.id, { title: 'Done overdue', due_date: daysFromNow(-2), status: 'done' });

      const res = await agent().get('/api/filters/execute?due=overdue');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Overdue');
    });

    it('filters by due=week', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'This week', due_date: daysFromNow(3) });
      makeTask(g.id, { title: 'Far away', due_date: daysFromNow(30) });
      makeTask(g.id, { title: 'Overdue', due_date: daysFromNow(-2) });

      const res = await agent().get('/api/filters/execute?due=week');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'This week');
    });

    it('filters by due=none', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'No date' });
      makeTask(g.id, { title: 'Has date', due_date: today() });

      const res = await agent().get('/api/filters/execute?due=none');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'No date');
    });

    it('combines multiple params', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Match', priority: 3, my_day: 1, status: 'todo' });
      makeTask(g.id, { title: 'Wrong priority', priority: 1, my_day: 1 });
      makeTask(g.id, { title: 'Not my day', priority: 3, my_day: 0 });

      const res = await agent().get('/api/filters/execute?priority=3&my_day=1');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Match');
    });

    it('filters by max_estimated', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { db } = setup();
      const t1 = makeTask(g.id, { title: 'Quick', status: 'todo' });
      const t2 = makeTask(g.id, { title: 'Long', status: 'todo' });
      const t3 = makeTask(g.id, { title: 'No estimate', status: 'todo' });
      db.prepare('UPDATE tasks SET estimated_minutes=? WHERE id=?').run(10, t1.id);
      db.prepare('UPDATE tasks SET estimated_minutes=? WHERE id=?').run(60, t2.id);

      const res = await agent().get('/api/filters/execute?max_estimated=15');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Quick');
    });

    it('filters by is_blocked', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const blocker = makeTask(g.id, { title: 'Blocker', status: 'todo' });
      const blocked = makeTask(g.id, { title: 'Blocked', status: 'todo' });
      makeTask(g.id, { title: 'Free', status: 'todo' });
      const { db } = setup();
      db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(blocked.id, blocker.id);

      const res = await agent().get('/api/filters/execute?is_blocked=1');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Blocked');
    });
  });

  // ─── CRUD ERROR PATHS ───
  describe('CRUD error paths', () => {
    it('PUT /api/filters/:id returns 404 for nonexistent filter', async () => {
      const res = await agent().put('/api/filters/99999').send({ name: 'Ghost' });
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
    });

    it('POST /api/filters stores filters as JSON string', async () => {
      const criteria = { area_id: 1, priority: 3, due: 'overdue' };
      const res = await agent().post('/api/filters').send({
        name: 'Complex', filters: criteria
      });
      assert.equal(res.status, 201);
      // The response has filters as a JSON string
      const stored = typeof res.body.filters === 'string'
        ? JSON.parse(res.body.filters)
        : res.body.filters;
      assert.equal(stored.area_id, 1);
      assert.equal(stored.priority, 3);
      assert.equal(stored.due, 'overdue');
    });
  });
});
