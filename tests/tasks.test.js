const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent, setup, daysFromNow } = require('./helpers');

describe('Tasks API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('POST /api/goals/:goalId/tasks', () => {
    it('creates a task with all fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({
          title: 'New Task',
          note: 'A note',
          priority: 2,
          due_date: '2025-08-01',
          recurring: 'weekly',
          assigned_to: 'Alice',
          my_day: true
        })
        .expect(201);
      assert.equal(res.body.title, 'New Task');
      assert.equal(res.body.note, 'A note');
      assert.equal(res.body.priority, 2);
      assert.equal(res.body.due_date, '2025-08-01');
      assert.equal(res.body.recurring, 'weekly');
      assert.equal(res.body.assigned_to, 'Alice');
      assert.equal(res.body.my_day, 1);
      assert.equal(res.body.status, 'todo');
    });

    it('creates a task with tags', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const tag1 = makeTag({ name: 'urgent' });
      const tag2 = makeTag({ name: 'blocked' });

      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Tagged task', tagIds: [tag1.id, tag2.id] })
        .expect(201);
      assert.equal(res.body.tags.length, 2);
      const tagNames = res.body.tags.map(t => t.name).sort();
      assert.deepStrictEqual(tagNames, ['blocked', 'urgent']);
    });

    it('returns 400 when title is missing', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().post(`/api/goals/${goal.id}/tasks`).send({}).expect(400);
    });

    it('returns 400 when title is whitespace', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: '   ' }).expect(400);
    });

    it('trims the title', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: '  Trimmed  ' })
        .expect(201);
      assert.equal(res.body.title, 'Trimmed');
    });

    it('auto-increments position within goal', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const r1 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'A' }).expect(201);
      const r2 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'B' }).expect(201);
      assert.equal(r1.body.position, 0);
      assert.equal(r2.body.position, 1);
    });

    it('returns enriched task with subtasks and tags arrays', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Enriched' })
        .expect(201);
      assert.ok(Array.isArray(res.body.tags));
      assert.ok(Array.isArray(res.body.subtasks));
      assert.equal(res.body.subtask_done, 0);
      assert.equal(res.body.subtask_total, 0);
    });
  });

  describe('GET /api/goals/:goalId/tasks', () => {
    it('returns tasks for a goal ordered by status, position', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Done', status: 'done', position: 0 });
      makeTask(goal.id, { title: 'Doing', status: 'doing', position: 0 });
      makeTask(goal.id, { title: 'Todo', status: 'todo', position: 0 });

      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(res.body.length, 3);
      assert.equal(res.body[0].title, 'Doing');
      assert.equal(res.body[1].title, 'Todo');
      assert.equal(res.body[2].title, 'Done');
    });

    it('returns 400 for invalid goal ID', async () => {
      await agent().get('/api/goals/abc/tasks').expect(400);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns enriched single task with joins', async () => {
      const area = makeArea({ name: 'Health', icon: '💪' });
      const goal = makeGoal(area.id, { title: 'Run', color: '#FF0000' });
      const task = makeTask(goal.id, { title: 'Morning run' });

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.equal(res.body.title, 'Morning run');
      assert.equal(res.body.goal_title, 'Run');
      assert.equal(res.body.goal_color, '#FF0000');
      assert.equal(res.body.area_name, 'Health');
      assert.equal(res.body.area_icon, '💪');
      assert.ok(Array.isArray(res.body.tags));
      assert.ok(Array.isArray(res.body.subtasks));
    });

    it('returns 404 for nonexistent task', async () => {
      await agent().get('/api/tasks/99999').expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().get('/api/tasks/abc').expect(400);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('updates basic fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Old' });

      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ title: 'New', note: 'Updated', priority: 3 })
        .expect(200);
      assert.equal(res.body.title, 'New');
      assert.equal(res.body.note, 'Updated');
      assert.equal(res.body.priority, 3);
    });

    it('sets completed_at when transitioning to done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'done' })
        .expect(200);
      assert.equal(res.body.status, 'done');
      assert.ok(res.body.completed_at);
    });

    it('clears completed_at when transitioning away from done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { status: 'done' });
      // Manually set completed_at
      const { db } = setup();
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'todo' })
        .expect(200);
      assert.equal(res.body.status, 'todo');
      assert.equal(res.body.completed_at, null);
    });

    it('spawns next recurring task when completed (daily)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Daily standup',
        recurring: 'daily',
        due_date: '2025-07-01',
        priority: 2
      });

      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'done' })
        .expect(200);

      // Check that a new task was spawned
      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id && t.title === 'Daily standup');
      assert.ok(spawned, 'Spawned task should exist');
      assert.equal(spawned.due_date, '2025-07-02');
      assert.equal(spawned.recurring, 'daily');
      assert.equal(spawned.priority, 2);
      assert.equal(spawned.status, 'todo');
    });

    it('spawns next recurring task (weekly)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Weekly review',
        recurring: 'weekly',
        due_date: '2025-07-01'
      });

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.equal(spawned.due_date, '2025-07-08');
    });

    it('spawns next recurring task (monthly)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Monthly report',
        recurring: 'monthly',
        due_date: '2025-07-15'
      });

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.equal(spawned.due_date, '2025-08-15');
    });

    it('copies tags to spawned recurring task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const tag = makeTag({ name: 'routine' });
      const task = makeTask(goal.id, {
        title: 'Tagged recurring',
        recurring: 'daily',
        due_date: '2025-07-01'
      });
      linkTag(task.id, tag.id);

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.equal(spawned.tags.length, 1);
      assert.equal(spawned.tags[0].name, 'routine');
    });

    it('does not spawn recurring task if already done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const { db } = setup();
      const task = makeTask(goal.id, { title: 'Already done', status: 'done', recurring: 'daily', due_date: '2025-07-01' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);

      // Setting to done again shouldn't spawn (status is already done)
      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(tasks.body.length, 1); // Only original task
    });

    it('updates my_day flag', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { my_day: 0 });

      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ my_day: true })
        .expect(200);
      assert.equal(res.body.my_day, 1);
    });

    it('moves task to different goal', async () => {
      const area = makeArea();
      const goal1 = makeGoal(area.id, { title: 'Goal 1' });
      const goal2 = makeGoal(area.id, { title: 'Goal 2' });
      const task = makeTask(goal1.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ goal_id: goal2.id })
        .expect(200);
      assert.equal(res.body.goal_id, goal2.id);
    });

    it('returns 404 for nonexistent task', async () => {
      await agent().put('/api/tasks/99999').send({ title: 'Nope' }).expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().put('/api/tasks/abc').send({ title: 'Bad' }).expect(400);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);

      await agent().delete(`/api/tasks/${task.id}`).expect(200);

      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(res.body.length, 0);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().delete('/api/tasks/abc').expect(400);
    });
  });

  describe('PUT /api/tasks/reorder', () => {
    it('reorders tasks by position', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t1 = makeTask(goal.id, { title: 'A', position: 0 });
      const t2 = makeTask(goal.id, { title: 'B', position: 1 });

      await agent()
        .put('/api/tasks/reorder')
        .send({ items: [{ id: t1.id, position: 1 }, { id: t2.id, position: 0 }] })
        .expect(200);

      const { db } = setup();
      const updated1 = db.prepare('SELECT position FROM tasks WHERE id=?').get(t1.id);
      const updated2 = db.prepare('SELECT position FROM tasks WHERE id=?').get(t2.id);
      assert.equal(updated1.position, 1);
      assert.equal(updated2.position, 0);
    });

    it('updates due_date during reorder (drag to date column)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { due_date: '2025-07-01' });

      await agent()
        .put('/api/tasks/reorder')
        .send({ items: [{ id: task.id, position: 0, due_date: '2025-07-05' }] })
        .expect(200);

      const { db } = setup();
      const updated = db.prepare('SELECT due_date FROM tasks WHERE id=?').get(task.id);
      assert.equal(updated.due_date, '2025-07-05');
    });

    it('returns 400 when items is not an array', async () => {
      await agent().put('/api/tasks/reorder').send({ items: 'bad' }).expect(400);
    });

    it('returns 400 when items is missing', async () => {
      await agent().put('/api/tasks/reorder').send({}).expect(400);
    });
  });
});
