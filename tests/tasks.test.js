const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, agent, setup, daysFromNow } = require('./helpers');

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

    it('copies subtasks to spawned recurring task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Clean house',
        recurring: 'weekly',
        due_date: '2025-07-01'
      });
      makeSubtask(task.id, { title: 'Kitchen', position: 0 });
      makeSubtask(task.id, { title: 'Bathroom', position: 1 });
      makeSubtask(task.id, { title: 'Bedroom', position: 2 });

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.ok(spawned, 'Spawned task should exist');
      assert.equal(spawned.subtasks.length, 3);
      assert.deepEqual(spawned.subtasks.map(s => s.title), ['Kitchen', 'Bathroom', 'Bedroom']);
      spawned.subtasks.forEach(s => assert.equal(s.done, 0, 'Subtasks should be reset to undone'));
    });

    it('copies subtask notes to spawned recurring task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Weekly checklist',
        recurring: 'weekly',
        due_date: '2025-07-01'
      });
      makeSubtask(task.id, { title: 'Review PRs', position: 0 });
      // Add note directly via DB since makeSubtask doesn't support note
      const { db } = setup();
      db.prepare('UPDATE subtasks SET note=? WHERE task_id=? AND title=?').run('Check all open PRs', task.id, 'Review PRs');

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.equal(spawned.subtasks.length, 1);
      assert.equal(spawned.subtasks[0].note, 'Check all open PRs');
    });

    it('spawns recurring task with no subtasks without error', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'No subtasks recurring',
        recurring: 'daily',
        due_date: '2025-07-01'
      });

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.ok(spawned, 'Spawned task should exist');
      assert.equal(spawned.subtasks.length, 0);
    });

    it('copies subtasks when skipping recurring task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Skip with subs',
        recurring: 'weekly',
        due_date: '2025-07-01'
      });
      makeSubtask(task.id, { title: 'Step A', position: 0 });
      makeSubtask(task.id, { title: 'Step B', position: 1 });

      const res = await agent().post(`/api/tasks/${task.id}/skip`).expect(200);

      assert.ok(res.body.next, 'Next task should exist');
      assert.equal(res.body.next.subtasks.length, 2);
      assert.deepEqual(res.body.next.subtasks.map(s => s.title), ['Step A', 'Step B']);
      res.body.next.subtasks.forEach(s => assert.equal(s.done, 0));
    });

    it('preserves subtask positions in spawned recurring task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'Ordered subs',
        recurring: 'daily',
        due_date: '2025-07-01'
      });
      makeSubtask(task.id, { title: 'Third', position: 2 });
      makeSubtask(task.id, { title: 'First', position: 0 });
      makeSubtask(task.id, { title: 'Second', position: 1 });

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      const positions = spawned.subtasks.map(s => ({ title: s.title, position: s.position }));
      assert.deepEqual(positions, [
        { title: 'First', position: 0 },
        { title: 'Second', position: 1 },
        { title: 'Third', position: 2 }
      ]);
    });

    it('copies custom field values to spawned recurring task', async () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'With custom fields',
        recurring: 'weekly',
        due_date: '2025-07-01'
      });
      // Create custom field def and set value on task
      db.prepare('INSERT INTO custom_field_defs (user_id, name, field_type) VALUES (1,?,?)').run('Client', 'text');
      const fieldId = db.prepare('SELECT id FROM custom_field_defs WHERE name=?').get('Client').id;
      db.prepare('INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?,?,?)').run(task.id, fieldId, 'Acme Corp');

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.ok(spawned, 'Spawned task should exist');
      assert.ok(spawned.custom_fields, 'Spawned task should have custom_fields');
      const cf = spawned.custom_fields.find(f => f.name === 'Client');
      assert.ok(cf, 'Client custom field should be present');
      assert.equal(cf.value, 'Acme Corp');
    });

    it('spawns recurring task with no custom fields without error', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, {
        title: 'No custom fields recurring',
        recurring: 'daily',
        due_date: '2025-07-01'
      });

      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);

      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      const spawned = tasks.body.find(t => t.id !== task.id);
      assert.ok(spawned, 'Spawned task should exist');
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

  describe('Recurring field validation', () => {
    it('accepts simple recurring strings on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      for (const r of ['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'weekdays']) {
        const res = await agent()
          .post(`/api/goals/${goal.id}/tasks`)
          .send({ title: `Task ${r}`, recurring: r, due_date: '2025-07-01' })
          .expect(201);
        assert.equal(res.body.recurring, r);
      }
    });

    it('accepts every-N-days/weeks pattern on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const r1 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Every 3 days', recurring: 'every-3-days', due_date: '2025-07-01' }).expect(201);
      assert.equal(r1.body.recurring, 'every-3-days');
      const r2 = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'Every 2 weeks', recurring: 'every-2-weeks', due_date: '2025-07-01' }).expect(201);
      assert.equal(r2.body.recurring, 'every-2-weeks');
    });

    it('accepts advanced JSON recurring config on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const cfg = { pattern: 'specific-days', days: [1, 3, 5] };
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'MWF task', recurring: JSON.stringify(cfg), due_date: '2025-07-01' })
        .expect(201);
      const parsed = JSON.parse(res.body.recurring);
      assert.equal(parsed.pattern, 'specific-days');
      assert.deepEqual(parsed.days, [1, 3, 5]);
    });

    it('accepts object recurring config on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'With endAfter', recurring: { pattern: 'daily', endAfter: 10 }, due_date: '2025-07-01' })
        .expect(201);
      const parsed = JSON.parse(res.body.recurring);
      assert.equal(parsed.pattern, 'daily');
      assert.equal(parsed.endAfter, 10);
    });

    it('rejects invalid recurring string on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Bad recurring', recurring: 'every-other-day', due_date: '2025-07-01' })
        .expect(400);
      assert.ok(res.body.error);
    });

    it('rejects invalid recurring JSON on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Bad JSON', recurring: '{"pattern":"bogus"}', due_date: '2025-07-01' })
        .expect(400);
      assert.ok(res.body.error);
    });

    it('rejects recurring object with extra fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Extra fields', recurring: { pattern: 'daily', evil: 'payload' }, due_date: '2025-07-01' })
        .expect(400);
      assert.ok(res.body.error);
    });

    it('rejects invalid recurring on update', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ recurring: 'not-valid' })
        .expect(400);
      assert.ok(res.body.error);
    });

    it('accepts null recurring to clear on update', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { recurring: 'daily', due_date: '2025-07-01' });
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ recurring: null })
        .expect(200);
      assert.equal(res.body.recurring, null);
    });
  });

  describe('GET /api/tasks/table', () => {
    it('returns tasks with total count', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Task A', due_date: '2025-07-01' });
      makeTask(goal.id, { title: 'Task B', due_date: '2025-07-02' });

      const res = await agent().get('/api/tasks/table').expect(200);
      assert.ok(Array.isArray(res.body.tasks));
      assert.equal(res.body.total, 2);
      assert.equal(res.body.tasks.length, 2);
    });

    it('sorts by priority DESC', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Low', priority: 0 });
      makeTask(goal.id, { title: 'Critical', priority: 3 });
      makeTask(goal.id, { title: 'High', priority: 2 });

      const res = await agent().get('/api/tasks/table?sort_by=priority&sort_dir=desc').expect(200);
      assert.equal(res.body.tasks[0].title, 'Critical');
      assert.equal(res.body.tasks[1].title, 'High');
      assert.equal(res.body.tasks[2].title, 'Low');
    });

    it('sorts by due_date ASC with nulls last', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'No date' });
      makeTask(goal.id, { title: 'Later', due_date: '2025-07-10' });
      makeTask(goal.id, { title: 'Sooner', due_date: '2025-07-01' });

      const res = await agent().get('/api/tasks/table?sort_by=due_date&sort_dir=asc').expect(200);
      assert.equal(res.body.tasks[0].title, 'Sooner');
      assert.equal(res.body.tasks[1].title, 'Later');
      assert.equal(res.body.tasks[2].title, 'No date');
    });

    it('groups by area', async () => {
      const a1 = makeArea({ name: 'Work' });
      const a2 = makeArea({ name: 'Personal' });
      const g1 = makeGoal(a1.id);
      const g2 = makeGoal(a2.id);
      makeTask(g1.id, { title: 'Work task 1' });
      makeTask(g1.id, { title: 'Work task 2' });
      makeTask(g2.id, { title: 'Personal task' });

      const res = await agent().get('/api/tasks/table?group_by=area').expect(200);
      assert.ok(Array.isArray(res.body.groups));
      assert.equal(res.body.groups.length, 2);
      const workGroup = res.body.groups.find(g => g.name === 'Work');
      assert.ok(workGroup);
      assert.equal(workGroup.count, 2);
    });

    it('filters by status', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Todo', status: 'todo' });
      makeTask(goal.id, { title: 'Done', status: 'done' });

      const res = await agent().get('/api/tasks/table?status=todo').expect(200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.tasks[0].title, 'Todo');
    });

    it('filters by area_id', async () => {
      const a1 = makeArea({ name: 'Work' });
      const a2 = makeArea({ name: 'Home' });
      const g1 = makeGoal(a1.id);
      const g2 = makeGoal(a2.id);
      makeTask(g1.id, { title: 'Work' });
      makeTask(g2.id, { title: 'Home' });

      const res = await agent().get(`/api/tasks/table?area_id=${a1.id}`).expect(200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.tasks[0].title, 'Work');
    });

    it('paginates with limit and offset', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      for (let i = 0; i < 5; i++) makeTask(goal.id, { title: `Task ${i}`, priority: i % 4 });

      const res = await agent().get('/api/tasks/table?limit=2&offset=0').expect(200);
      assert.equal(res.body.tasks.length, 2);
      assert.equal(res.body.total, 5);

      const res2 = await agent().get('/api/tasks/table?limit=2&offset=2').expect(200);
      assert.equal(res2.body.tasks.length, 2);
    });

    it('returns empty for no matching tasks', async () => {
      const res = await agent().get('/api/tasks/table?status=done').expect(200);
      assert.deepEqual(res.body, { tasks: [], total: 0, groups: [] });
    });

    it('returns enriched tasks with tags and subtasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Enriched' });
      const tag = makeTag({ name: 'table-tag' });
      linkTag(task.id, tag.id);
      makeSubtask(task.id, { title: 'Sub 1' });

      const res = await agent().get('/api/tasks/table').expect(200);
      assert.ok(res.body.tasks[0].tags.length >= 1);
      assert.ok(res.body.tasks[0].subtasks.length >= 1);
    });
  });

  describe('GET /api/tasks/timeline', () => {
    it('returns tasks with due dates in range', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'In range', due_date: '2025-07-05' });
      makeTask(goal.id, { title: 'Out of range', due_date: '2025-08-01' });
      makeTask(goal.id, { title: 'No date' });

      const res = await agent().get('/api/tasks/timeline?start=2025-07-01&end=2025-07-31').expect(200);
      assert.ok(Array.isArray(res.body.tasks));
      assert.equal(res.body.tasks.length, 1);
      assert.equal(res.body.tasks[0].title, 'In range');
    });

    it('excludes tasks without due_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'No date' });

      const res = await agent().get('/api/tasks/timeline?start=2025-07-01&end=2025-07-31').expect(200);
      assert.equal(res.body.tasks.length, 0);
    });

    it('includes dependency data', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t1 = makeTask(goal.id, { title: 'Blocker', due_date: '2025-07-01' });
      const t2 = makeTask(goal.id, { title: 'Blocked', due_date: '2025-07-05' });
      const { db } = setup();
      db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(t2.id, t1.id);

      const res = await agent().get('/api/tasks/timeline?start=2025-07-01&end=2025-07-31').expect(200);
      const blocked = res.body.tasks.find(t => t.title === 'Blocked');
      assert.ok(blocked.blocked_by.length >= 1);
    });

    it('returns tasks sorted by due_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Later', due_date: '2025-07-10' });
      makeTask(goal.id, { title: 'Earlier', due_date: '2025-07-02' });

      const res = await agent().get('/api/tasks/timeline?start=2025-07-01&end=2025-07-31').expect(200);
      assert.equal(res.body.tasks[0].title, 'Earlier');
      assert.equal(res.body.tasks[1].title, 'Later');
    });

    it('returns 400 when start or end missing', async () => {
      await agent().get('/api/tasks/timeline').expect(400);
      await agent().get('/api/tasks/timeline?start=2025-07-01').expect(400);
    });

    it('includes completed tasks in range', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Done task', due_date: '2025-07-05', status: 'done' });

      const res = await agent().get('/api/tasks/timeline?start=2025-07-01&end=2025-07-31').expect(200);
      assert.equal(res.body.tasks.length, 1);
    });
  });

  // ─── Suggested tasks ───
  describe('GET /api/tasks/suggested', () => {
    it('returns up to 5 tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      for (let i = 0; i < 8; i++) makeTask(goal.id, { title: `T${i}` });
      const res = await agent().get('/api/tasks/suggested').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length <= 5);
    });

    it('ranks overdue tasks higher than non-overdue', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Future', due_date: daysFromNow(30) });
      makeTask(goal.id, { title: 'Overdue', due_date: '2020-01-01' });
      const res = await agent().get('/api/tasks/suggested').expect(200);
      assert.equal(res.body[0].title, 'Overdue');
    });

    it('excludes tasks already in My Day', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'InMyDay', my_day: 1 });
      makeTask(goal.id, { title: 'Not InMyDay' });
      const res = await agent().get('/api/tasks/suggested').expect(200);
      assert.ok(res.body.every(t => t.title !== 'InMyDay'));
    });

    it('returns empty array when all tasks are done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Done', status: 'done' });
      const res = await agent().get('/api/tasks/suggested').expect(200);
      assert.equal(res.body.length, 0);
    });
  });

  // ─── Batch operations ───
  describe('PATCH /api/tasks/batch', () => {
    it('moves all tasks to new goal', async () => {
      const area = makeArea();
      const g1 = makeGoal(area.id, { title: 'G1' });
      const g2 = makeGoal(area.id, { title: 'G2' });
      const t1 = makeTask(g1.id);
      const t2 = makeTask(g1.id);
      const res = await agent().patch('/api/tasks/batch').send({
        ids: [t1.id, t2.id], updates: { goal_id: g2.id }
      }).expect(200);
      assert.equal(res.body.updated, 2);
    });

    it('reschedules all tasks with due_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t1 = makeTask(goal.id);
      const t2 = makeTask(goal.id);
      const res = await agent().patch('/api/tasks/batch').send({
        ids: [t1.id, t2.id], updates: { due_date: '2026-04-01' }
      }).expect(200);
      assert.equal(res.body.updated, 2);
    });

    it('flags all tasks as My Day', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t1 = makeTask(goal.id);
      const t2 = makeTask(goal.id);
      const res = await agent().patch('/api/tasks/batch').send({
        ids: [t1.id, t2.id], updates: { my_day: 1 }
      }).expect(200);
      assert.equal(res.body.updated, 2);
    });

    it('adds tags to all tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t1 = makeTask(goal.id);
      const t2 = makeTask(goal.id);
      const tag = makeTag({ name: 'batch-tag' });
      const res = await agent().patch('/api/tasks/batch').send({
        ids: [t1.id, t2.id], add_tags: [tag.id]
      }).expect(200);
      assert.equal(res.body.updated, 2);
    });

    it('rejects with invalid task IDs', async () => {
      await agent().patch('/api/tasks/batch').send({
        ids: [99999], updates: { priority: 1 }
      }).expect(400);
    });
  });

  // ─── Recurring task management ───
  describe('GET /api/tasks/recurring', () => {
    it('returns only recurring tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Normal' });
      makeTask(goal.id, { title: 'Daily', recurring: JSON.stringify({ type: 'daily' }) });
      const res = await agent().get('/api/tasks/recurring').expect(200);
      const items = res.body.items || res.body;
      assert.ok(items.every(t => t.recurring !== null));
      assert.ok(items.some(t => t.title === 'Daily'));
    });
  });

  describe('POST /api/tasks/:id/skip', () => {
    it('advances due_date to next occurrence', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t = makeTask(goal.id, { title: 'Weekly', due_date: '2026-03-27', recurring: JSON.stringify({ type: 'weekly' }) });
      const res = await agent().post(`/api/tasks/${t.id}/skip`).expect(200);
      assert.ok(res.body.skipped);
      assert.ok(res.body.next);
      assert.notEqual(res.body.next.due_date, '2026-03-27');
    });

    it('rejects skip on non-recurring task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const t = makeTask(goal.id, { title: 'Not recurring' });
      await agent().post(`/api/tasks/${t.id}/skip`).expect(400);
    });

    it('recurring badge indicator present in task card HTML', async () => {
      const fs = require('fs');
      const path = require('path');
      const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      assert.ok(
        appJs.includes('recurring') && (appJs.includes('repeat') || appJs.includes('🔁') || appJs.includes('loop')),
        'app.js should have recurring indicator in task cards'
      );
    });
  });
});
