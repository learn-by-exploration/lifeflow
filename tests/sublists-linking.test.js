const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeList, makeListItem, agent, setup } = require('./helpers');

describe('Sub-lists & Task-to-List Linking', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── SUB-LISTS ───

  describe('Sub-list CRUD', () => {
    it('creates a sub-list with parent_id', async () => {
      const parent = makeList({ name: 'Parent List' });
      const res = await agent().post('/api/lists').send({ name: 'Child List', parent_id: parent.id }).expect(201);
      assert.equal(res.body.name, 'Child List');
      assert.equal(res.body.parent_id, parent.id);
    });

    it('rejects nesting deeper than 1 level', async () => {
      const parent = makeList({ name: 'L1' });
      const child = makeList({ name: 'L2', parent_id: parent.id });
      const res = await agent().post('/api/lists').send({ name: 'L3', parent_id: child.id }).expect(400);
      assert.match(res.body.error, /nest/i);
    });

    it('rejects invalid parent_id', async () => {
      await agent().post('/api/lists').send({ name: 'Bad', parent_id: 99999 }).expect(400);
    });

    it('GET /api/lists/:id/sublists returns child lists', async () => {
      const parent = makeList({ name: 'Parent' });
      makeList({ name: 'Child A', parent_id: parent.id });
      makeList({ name: 'Child B', parent_id: parent.id });
      const res = await agent().get(`/api/lists/${parent.id}/sublists`).expect(200);
      assert.equal(res.body.length, 2);
      assert.ok(res.body.some(l => l.name === 'Child A'));
      assert.ok(res.body.some(l => l.name === 'Child B'));
    });

    it('sublists have item counts', async () => {
      const parent = makeList({ name: 'Parent' });
      const child = makeList({ name: 'Child', parent_id: parent.id });
      makeListItem(child.id, { title: 'Item 1', checked: 1 });
      makeListItem(child.id, { title: 'Item 2', checked: 0 });
      const res = await agent().get(`/api/lists/${parent.id}/sublists`).expect(200);
      assert.equal(res.body[0].item_count, 2);
      assert.equal(res.body[0].checked_count, 1);
    });

    it('sublists endpoint returns 404 for missing parent', async () => {
      await agent().get('/api/lists/99999/sublists').expect(404);
    });
  });

  describe('Sub-list cascading delete', () => {
    it('deleting parent cascades to children', async () => {
      const parent = makeList({ name: 'Parent' });
      const child = makeList({ name: 'Child', parent_id: parent.id });
      makeListItem(child.id, { title: 'Orphan item' });
      await agent().delete(`/api/lists/${parent.id}`).expect(200);
      // Both parent and child should be gone
      const lists = await agent().get('/api/lists').expect(200);
      assert.equal(lists.body.length, 0);
    });

    it('deleting child does not affect parent', async () => {
      const parent = makeList({ name: 'Parent' });
      const child = makeList({ name: 'Child', parent_id: parent.id });
      await agent().delete(`/api/lists/${child.id}`).expect(200);
      const lists = await agent().get('/api/lists').expect(200);
      assert.equal(lists.body.length, 1);
      assert.equal(lists.body[0].name, 'Parent');
    });
  });

  describe('Sub-list update (PUT)', () => {
    it('moves list to become a sub-list', async () => {
      const parent = makeList({ name: 'Parent' });
      const standalone = makeList({ name: 'Standalone' });
      const res = await agent().put(`/api/lists/${standalone.id}`).send({ parent_id: parent.id }).expect(200);
      assert.equal(res.body.parent_id, parent.id);
    });

    it('rejects self-parent', async () => {
      const list = makeList({ name: 'List' });
      const res = await agent().put(`/api/lists/${list.id}`).send({ parent_id: list.id }).expect(400);
      assert.match(res.body.error, /own parent/i);
    });

    it('rejects moving under a child (prevents 2-level nesting)', async () => {
      const parent = makeList({ name: 'Parent' });
      const child = makeList({ name: 'Child', parent_id: parent.id });
      const other = makeList({ name: 'Other' });
      const res = await agent().put(`/api/lists/${other.id}`).send({ parent_id: child.id }).expect(400);
      assert.match(res.body.error, /nest/i);
    });

    it('removes parent_id by setting null', async () => {
      const parent = makeList({ name: 'Parent' });
      const child = makeList({ name: 'Child', parent_id: parent.id });
      const res = await agent().put(`/api/lists/${child.id}`).send({ parent_id: null }).expect(200);
      assert.equal(res.body.parent_id, null);
    });
  });

  // ─── TASK-TO-LIST LINKING ───

  describe('Task creation with list_id', () => {
    it('creates task linked to a list', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const list = makeList({ name: 'Sprint Backlog' });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Linked Task', list_id: list.id }).expect(201);
      assert.equal(res.body.list_id, list.id);
      assert.equal(res.body.list_name, 'Sprint Backlog');
    });

    it('creates task without list_id (null by default)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Unlinked' }).expect(201);
      assert.equal(res.body.list_id, null);
    });

    it('rejects invalid list_id on task creation', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Bad Link', list_id: 99999 }).expect(400);
    });
  });

  describe('Task update with list_id', () => {
    it('links existing task to a list via PUT', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Existing Task' });
      const list = makeList({ name: 'Groceries', type: 'grocery' });
      const res = await agent().put(`/api/tasks/${task.id}`).send({ list_id: list.id }).expect(200);
      assert.equal(res.body.list_id, list.id);
      assert.equal(res.body.list_name, 'Groceries');
    });

    it('unlinks task from list by setting list_id to null', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const list = makeList({ name: 'My List' });
      const task = makeTask(goal.id, { title: 'Linked', list_id: list.id });
      const res = await agent().put(`/api/tasks/${task.id}`).send({ list_id: null }).expect(200);
      assert.equal(res.body.list_id, null);
    });

    it('rejects invalid list_id on task update', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}`).send({ list_id: 99999 }).expect(400);
    });
  });

  describe('enrichTask() resolves list info', () => {
    it('task detail includes list_name, list_icon, list_color', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const list = makeList({ name: 'Design Tasks', icon: '🎨', color: '#FF5722' });
      const task = makeTask(goal.id, { title: 'Design logo', list_id: list.id });
      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const t = res.body.find(x => x.id === task.id);
      assert.equal(t.list_name, 'Design Tasks');
      assert.equal(t.list_icon, '🎨');
      assert.equal(t.list_color, '#FF5722');
    });

    it('task without list_id has no list fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Plain task' });
      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(res.body[0].list_name, undefined);
    });
  });

  describe('Cascade: deleting list sets task.list_id to NULL', () => {
    it('task survives list deletion', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const list = makeList({ name: 'Temp List' });
      makeTask(goal.id, { title: 'Keep Me', list_id: list.id });
      await agent().delete(`/api/lists/${list.id}`).expect(200);
      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Keep Me');
      assert.equal(res.body[0].list_id, null);
    });
  });

  // ─── HEALTH ENDPOINT ───

  describe('GET /health', () => {
    it('returns ok status with dbOk', async () => {
      const res = await agent().get('/health').expect(200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.dbOk, true);
    });
  });

  // ─── BATCH enrichTasks (N+1 fix) ───

  describe('Batch enrichTasks performance', () => {
    it('enriches multiple tasks with list info correctly', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const listA = makeList({ name: 'List A', icon: '🅰️', color: '#111' });
      const listB = makeList({ name: 'List B', icon: '🅱️', color: '#222' });
      makeTask(goal.id, { title: 'Task 1', list_id: listA.id });
      makeTask(goal.id, { title: 'Task 2', list_id: listB.id });
      makeTask(goal.id, { title: 'Task 3' }); // no list
      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(res.body.length, 3);
      const t1 = res.body.find(t => t.title === 'Task 1');
      const t2 = res.body.find(t => t.title === 'Task 2');
      const t3 = res.body.find(t => t.title === 'Task 3');
      assert.equal(t1.list_name, 'List A');
      assert.equal(t2.list_name, 'List B');
      assert.equal(t3.list_name, undefined);
    });
  });
});
