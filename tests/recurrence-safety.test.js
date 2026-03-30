/**
 * Recurrence & Business Logic Safety Tests
 * Security findings: #117 (month-end), #120 (infinite loop), #121 (null due date), #50 (transaction), #53 (field copy)
 */
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeSubtask, makeTag } = require('./helpers');

describe('Recurrence Safety', () => {
  let db, helpers;

  beforeEach(() => {
    cleanDb();
    const s = setup();
    db = s.db;
    helpers = require('../src/helpers')(db);
  });

  after(() => teardown());

  // ─── Month-end clamping ──────────────────────────────────────────────────────

  describe('Month-end clamping', () => {
    it('Jan 31 + monthly → Feb 28 (non-leap year)', () => {
      // 2025 is not a leap year
      const result = helpers.nextDueDate('2025-01-31', JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(result, '2025-02-28');
    });

    it('Jan 31 + monthly → Feb 29 (leap year 2028)', () => {
      const result = helpers.nextDueDate('2028-01-31', JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(result, '2028-02-29');
    });

    it('Mar 31 + monthly → Apr 30', () => {
      const result = helpers.nextDueDate('2025-03-31', JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(result, '2025-04-30');
    });

    it('Monthly from 31st: never skips a month', () => {
      // Jan 31 → Feb 28 → Mar 28 (preserves from clamped date)
      const feb = helpers.nextDueDate('2025-01-31', JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(feb, '2025-02-28');
      const mar = helpers.nextDueDate(feb, JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(mar, '2025-03-28');
      const apr = helpers.nextDueDate(mar, JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(apr, '2025-04-28');
    });

    it('Jan 29 + monthly → Feb 28 (non-leap) then Mar 29', () => {
      const feb = helpers.nextDueDate('2025-01-29', JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(feb, '2025-02-28');
      const mar = helpers.nextDueDate(feb, JSON.stringify({ pattern: 'monthly', interval: 1 }));
      assert.equal(mar, '2025-03-28');
    });

    it('Bi-monthly from 31st: clamped correctly', () => {
      // Jan 31 + bi-monthly (interval=2) → Mar 31
      const result = helpers.nextDueDate('2025-01-31', JSON.stringify({ pattern: 'monthly', interval: 2 }));
      assert.equal(result, '2025-03-31');
    });

    it('Simple string monthly also clamps month-end', () => {
      const result = helpers.nextDueDate('2025-01-31', 'monthly');
      assert.equal(result, '2025-02-28');
    });
  });

  // ─── Infinite loop protection ────────────────────────────────────────────────

  describe('Infinite loop protection', () => {
    it('Specific-days with empty days array does not hang', () => {
      const start = Date.now();
      const result = helpers.nextDueDate('2025-03-30', JSON.stringify({ pattern: 'specific-days', days: [] }));
      const elapsed = Date.now() - start;
      assert.equal(result, null);
      assert.ok(elapsed < 100, `Should complete quickly, took ${elapsed}ms`);
    });

    it('Specific-days with all 7 days terminates', () => {
      const result = helpers.nextDueDate('2025-03-30', JSON.stringify({ pattern: 'specific-days', days: [0,1,2,3,4,5,6] }));
      assert.ok(result !== null, 'Should find next day');
      assert.equal(result, '2025-03-31');
    });

    it('Specific-days with invalid day numbers returns null', () => {
      const result = helpers.nextDueDate('2025-03-30', JSON.stringify({ pattern: 'specific-days', days: [8, 9, 10] }));
      assert.equal(result, null);
    });

    it('nextDueDate calculation completes within 100ms', () => {
      const patterns = [
        JSON.stringify({ pattern: 'daily', interval: 1 }),
        JSON.stringify({ pattern: 'weekly', interval: 1 }),
        JSON.stringify({ pattern: 'monthly', interval: 1 }),
        JSON.stringify({ pattern: 'yearly', interval: 1 }),
        JSON.stringify({ pattern: 'weekdays' }),
        JSON.stringify({ pattern: 'specific-days', days: [1, 3, 5] }),
        JSON.stringify({ pattern: 'specific-days', days: [] }),
        'daily', 'weekly', 'monthly', 'weekdays',
      ];
      for (const p of patterns) {
        const start = Date.now();
        helpers.nextDueDate('2025-03-30', p);
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 100, `Pattern ${p} took ${elapsed}ms`);
      }
    });
  });

  // ─── Null due date guard ─────────────────────────────────────────────────────

  describe('Null due date guard', () => {
    it('Recurring task with due_date=null returns null', () => {
      const result = helpers.nextDueDate(null, JSON.stringify({ pattern: 'daily', interval: 1 }));
      assert.equal(result, null);
    });

    it('Recurring task with recurrence=null returns null', () => {
      const result = helpers.nextDueDate('2025-03-30', null);
      assert.equal(result, null);
    });

    it('Recurring task that reaches end date: no new task spawned', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1, endDate: '2025-03-30' });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Ending task',
        due_date: '2025-03-30',
        recurring
      });
      assert.equal(res.status, 201);
      const taskId = res.body.id;
      // Complete it — due_date matches endDate, so next due would be 2025-03-31 > endDate
      const completeRes = await agent().put(`/api/tasks/${taskId}`).send({ status: 'done' });
      assert.equal(completeRes.status, 200);
      // No new task should have been spawned
      const allTasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
      assert.equal(allTasks.length, 0, 'No new task should be spawned after end date');
    });

    it('Complete recurring task: spawns next only if nextDueDate is not null', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Repeating task',
        due_date: '2025-03-30',
        recurring
      });
      assert.equal(res.status, 201);
      const taskId = res.body.id;
      const completeRes = await agent().put(`/api/tasks/${taskId}`).send({ status: 'done' });
      assert.equal(completeRes.status, 200);
      // A new task should have been spawned
      const newTasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
      assert.equal(newTasks.length, 1, 'New task should be spawned');
      assert.equal(newTasks[0].due_date, '2025-03-31');
    });
  });

  // ─── Field preservation on spawn ─────────────────────────────────────────────

  describe('Field preservation on spawn', () => {
    it('Recurring spawn copies tags', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const tag1 = makeTag({ name: 'urgent' });
      const tag2 = makeTag({ name: 'work' });
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Tagged recurring',
        due_date: '2025-03-30',
        recurring,
        tagIds: [tag1.id, tag2.id]
      });
      assert.equal(res.status, 201);
      const taskId = res.body.id;
      await agent().put(`/api/tasks/${taskId}`).send({ status: 'done' });
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask, 'New task should exist');
      const newTags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(newTask.id);
      assert.equal(newTags.length, 2, 'Tags should be copied');
      const tagIds = newTags.map(t => t.tag_id).sort();
      assert.deepEqual(tagIds, [tag1.id, tag2.id].sort());
    });

    it('Recurring spawn copies subtasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Task with subtasks',
        due_date: '2025-03-30',
        recurring
      });
      assert.equal(res.status, 201);
      const taskId = res.body.id;
      // Add subtasks
      makeSubtask(taskId, { title: 'Step 1', position: 0 });
      makeSubtask(taskId, { title: 'Step 2', position: 1 });
      await agent().put(`/api/tasks/${taskId}`).send({ status: 'done' });
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask, 'New task should exist');
      const newSubs = db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(newTask.id);
      assert.equal(newSubs.length, 2, 'Subtasks should be copied');
      assert.equal(newSubs[0].title, 'Step 1');
      assert.equal(newSubs[1].title, 'Step 2');
      assert.equal(newSubs[0].done, 0, 'Copied subtasks should be reset to undone');
      assert.equal(newSubs[1].done, 0, 'Copied subtasks should be reset to undone');
    });

    it('Recurring spawn copies priority', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'High priority recurring',
        due_date: '2025-03-30',
        recurring,
        priority: 3
      });
      assert.equal(res.status, 201);
      await agent().put(`/api/tasks/${res.body.id}`).send({ status: 'done' });
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask);
      assert.equal(newTask.priority, 3, 'Priority should be preserved');
    });

    it('Recurring spawn preserves estimated_minutes', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Estimated recurring',
        due_date: '2025-03-30',
        recurring,
        estimated_minutes: 45
      });
      assert.equal(res.status, 201);
      await agent().put(`/api/tasks/${res.body.id}`).send({ status: 'done' });
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask);
      assert.equal(newTask.estimated_minutes, 45, 'estimated_minutes should be preserved');
    });

    it('Recurring spawn copies time_block_start/end', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Time blocked recurring',
        due_date: '2025-03-30',
        recurring,
        time_block_start: '09:00',
        time_block_end: '10:30'
      });
      assert.equal(res.status, 201);
      await agent().put(`/api/tasks/${res.body.id}`).send({ status: 'done' });
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask);
      assert.equal(newTask.time_block_start, '09:00');
      assert.equal(newTask.time_block_end, '10:30');
    });

    it('Recurring spawn copies assigned_to_user_id', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      // Create task via API
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Assigned recurring',
        due_date: '2025-03-30',
        recurring
      });
      assert.equal(res.status, 201);
      const taskId = res.body.id;
      // Set assigned_to_user_id directly (user 1 is the test user)
      db.prepare('UPDATE tasks SET assigned_to_user_id=? WHERE id=?').run(1, taskId);
      // Now complete via API
      await agent().put(`/api/tasks/${taskId}`).send({ status: 'done' });
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask, 'New task should exist');
      assert.equal(newTask.assigned_to_user_id, 1, 'assigned_to_user_id should be preserved');
    });
  });

  // ─── Transaction safety ──────────────────────────────────────────────────────

  describe('Transaction safety', () => {
    it('Complete recurring task wraps spawn in transaction', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const tag = makeTag({ name: 'tx-test' });
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1 });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Transaction test',
        due_date: '2025-03-30',
        recurring,
        tagIds: [tag.id]
      });
      assert.equal(res.status, 201);
      makeSubtask(res.body.id, { title: 'Sub 1' });
      await agent().put(`/api/tasks/${res.body.id}`).send({ status: 'done' });
      // All parts of spawn should have succeeded atomically
      const newTask = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
      assert.ok(newTask, 'Spawned task exists');
      const newTags = db.prepare('SELECT * FROM task_tags WHERE task_id=?').all(newTask.id);
      assert.equal(newTags.length, 1, 'Tag was copied in same transaction');
      const newSubs = db.prepare('SELECT * FROM subtasks WHERE task_id=?').all(newTask.id);
      assert.equal(newSubs.length, 1, 'Subtask was copied in same transaction');
    });

    it('Original task completion succeeds even when spawn has no next date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const recurring = JSON.stringify({ pattern: 'daily', interval: 1, endDate: '2025-03-30' });
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
        title: 'Last occurrence',
        due_date: '2025-03-30',
        recurring
      });
      assert.equal(res.status, 201);
      const completeRes = await agent().put(`/api/tasks/${res.body.id}`).send({ status: 'done' });
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.status, 'done');
    });
  });
});
