const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

describe('Phase 6 - Polish & UX Enhancements', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── ENHANCED AREAS API ───
  describe('Areas API - total_tasks & done_tasks', () => {
    it('GET /api/areas includes total_tasks and done_tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Task 1', status: 'todo' });
      makeTask(g.id, { title: 'Task 2', status: 'done' });
      makeTask(g.id, { title: 'Task 3', status: 'doing' });
      const res = await agent().get('/api/areas').expect(200);
      const area = res.body.find(x => x.id === a.id);
      assert.equal(area.total_tasks, 3);
      assert.equal(area.done_tasks, 1);
      assert.equal(area.pending_tasks, 2); // todo + doing
    });

    it('GET /api/areas returns 0 for area with no tasks', async () => {
      const a = makeArea();
      makeGoal(a.id); // goal but no tasks
      const res = await agent().get('/api/areas').expect(200);
      const area = res.body.find(x => x.id === a.id);
      assert.equal(area.total_tasks, 0);
      assert.equal(area.done_tasks, 0);
      assert.equal(area.pending_tasks, 0);
    });

    it('GET /api/areas returns correct counts across multiple goals', async () => {
      const a = makeArea();
      const g1 = makeGoal(a.id);
      const g2 = makeGoal(a.id, { title: 'Goal 2' });
      makeTask(g1.id, { title: 'T1', status: 'done' });
      makeTask(g1.id, { title: 'T2', status: 'done' });
      makeTask(g2.id, { title: 'T3', status: 'todo' });
      const res = await agent().get('/api/areas').expect(200);
      const area = res.body.find(x => x.id === a.id);
      assert.equal(area.total_tasks, 3);
      assert.equal(area.done_tasks, 2);
      assert.equal(area.pending_tasks, 1);
    });
  });

  // ─── FRONTEND POLISH FEATURES (API backing) ───
  describe('Polish API stability', () => {
    it('My Day endpoint still works correctly', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'My task', my_day: 1 });
      const res = await agent().get('/api/tasks/my-day').expect(200);
      assert.ok(res.body.some(x => x.id === t.id));
    });

    it('All tasks endpoint returns area/goal info', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Linked task' });
      const res = await agent().get('/api/tasks/all').expect(200);
      assert.ok(res.body.length >= 1);
      assert.ok(res.body[0].area_name !== undefined);
    });

    it('Tags endpoint returns array', async () => {
      const res = await agent().get('/api/tags').expect(200);
      assert.ok(Array.isArray(res.body));
    });
  });
});
