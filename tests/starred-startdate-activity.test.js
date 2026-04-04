const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Phase 1 Quick Wins: Starred, Start Date, Activity Feed', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Starred Tasks ───
  describe('Starred tasks', () => {
    it('creates a task with starred=true', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Star me', starred: true }).expect(201);
      assert.equal(res.body.starred, 1);
    });

    it('creates a task with starred defaulting to 0', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'No star' }).expect(201);
      assert.equal(res.body.starred, 0);
    });

    it('stars an existing task via PUT', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ starred: 1 }).expect(200);
      assert.equal(res.body.starred, 1);
    });

    it('unstars a task via PUT', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}`).send({ starred: 1 });
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ starred: 0 }).expect(200);
      assert.equal(res.body.starred, 0);
    });

    it('preserves starred when updating other fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}`).send({ starred: 1 });
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ priority: 2 }).expect(200);
      assert.equal(res.body.starred, 1);
      assert.equal(res.body.priority, 2);
    });

    it('includes starred in task list response', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'T1' });
      const res = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(typeof res.body[0].starred, 'number');
    });
  });

  // ─── Start Date ───
  describe('Start date', () => {
    it('creates a task with start_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'With start', start_date: '2026-04-10' }).expect(201);
      assert.equal(res.body.start_date, '2026-04-10');
    });

    it('creates a task without start_date (null)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'No start' }).expect(201);
      assert.equal(res.body.start_date, null);
    });

    it('sets start_date via PUT', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ start_date: '2026-04-05' }).expect(200);
      assert.equal(res.body.start_date, '2026-04-05');
    });

    it('clears start_date to null via PUT', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}`).send({ start_date: '2026-04-05' });
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ start_date: null }).expect(200);
      assert.equal(res.body.start_date, null);
    });

    it('rejects invalid start_date format', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ start_date: 'not-a-date' }).expect(400);
      assert.ok(res.body.error.includes('start_date'));
    });

    it('rejects invalid start_date on create', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Bad start', start_date: '04/05/2026' }).expect(400);
      assert.ok(res.body.error.includes('start_date'));
    });

    it('preserves start_date when updating other fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent().put(`/api/tasks/${task.id}`).send({ start_date: '2026-04-05' });
      const res = await agent().put(`/api/tasks/${task.id}`)
        .send({ priority: 3 }).expect(200);
      assert.equal(res.body.start_date, '2026-04-05');
    });

    it('can set both start_date and due_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Date range', start_date: '2026-04-01', due_date: '2026-04-15' }).expect(201);
      assert.equal(res.body.start_date, '2026-04-01');
      assert.equal(res.body.due_date, '2026-04-15');
    });
  });

  // ─── Activity Feed ───
  describe('Task activity feed', () => {
    it('returns empty array for task with no activity', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().get(`/api/tasks/${task.id}/activity`).expect(200);
      assert.ok(Array.isArray(res.body));
    });

    it('records task creation in audit log', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const createRes = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Audited task' }).expect(201);
      const taskId = createRes.body.id;
      const res = await agent().get(`/api/tasks/${taskId}/activity`).expect(200);
      assert.ok(res.body.length >= 1);
      const created = res.body.find(a => a.action === 'task_created');
      assert.ok(created, 'Should have task_created entry');
      assert.equal(created.detail, 'Audited task');
    });

    it('records task updates in audit log', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const createRes = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Track updates' }).expect(201);
      const taskId = createRes.body.id;
      // Update status
      await agent().put(`/api/tasks/${taskId}`)
        .send({ status: 'doing' }).expect(200);
      const res = await agent().get(`/api/tasks/${taskId}/activity`).expect(200);
      const updated = res.body.find(a => a.action === 'task_updated');
      assert.ok(updated, 'Should have task_updated entry');
      assert.ok(updated.detail.includes('status'));
    });

    it('records star/unstar in audit log', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const createRes = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Star audit' }).expect(201);
      const taskId = createRes.body.id;
      await agent().put(`/api/tasks/${taskId}`)
        .send({ starred: 1 }).expect(200);
      const res = await agent().get(`/api/tasks/${taskId}/activity`).expect(200);
      const starEntry = res.body.find(a => a.action === 'task_updated' && a.detail && a.detail.includes('starred'));
      assert.ok(starEntry, 'Should record starring');
    });

    it('returns 404 for non-existent task', async () => {
      await agent().get('/api/tasks/99999/activity').expect(404);
    });

    it('returns 400 for invalid task id', async () => {
      await agent().get('/api/tasks/abc/activity').expect(400);
    });

    it('limits results via query param', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const createRes = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Limit test' }).expect(201);
      const taskId = createRes.body.id;
      // Make several updates
      for (let i = 1; i <= 3; i++) {
        await agent().put(`/api/tasks/${taskId}`)
          .send({ priority: i % 4 }).expect(200);
      }
      const res = await agent().get(`/api/tasks/${taskId}/activity?limit=2`).expect(200);
      assert.ok(res.body.length <= 2);
    });

    it('activity is ordered newest first', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const createRes = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Order test' }).expect(201);
      const taskId = createRes.body.id;
      await agent().put(`/api/tasks/${taskId}`)
        .send({ priority: 2 }).expect(200);
      const res = await agent().get(`/api/tasks/${taskId}/activity`).expect(200);
      if (res.body.length >= 2) {
        const d0 = new Date(res.body[0].created_at);
        const d1 = new Date(res.body[1].created_at);
        assert.ok(d0 >= d1, 'Should be newest first');
      }
    });
  });

  // ─── Export/Import with new fields ───
  describe('Export includes starred and start_date', () => {
    it('exports tasks with starred and start_date fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Starred export', starred: true, start_date: '2026-04-01' }).expect(201);
      const res = await agent().get('/api/export').expect(200);
      const task = res.body.tasks.find(t => t.title === 'Starred export');
      assert.ok(task, 'Task should be in export');
      assert.equal(task.starred, 1);
      assert.equal(task.start_date, '2026-04-01');
    });
  });

  // ─── Edge cases ───
  describe('Edge cases', () => {
    it('starred accepts boolean true and stores as 1', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Bool star', starred: true }).expect(201);
      assert.equal(res.body.starred, 1);
    });

    it('starred accepts boolean false and stores as 0', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Bool no star', starred: false }).expect(201);
      assert.equal(res.body.starred, 0);
    });

    it('can create starred task with start_date AND due_date together', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Full combo', starred: true, start_date: '2026-04-01', due_date: '2026-04-30' }).expect(201);
      assert.equal(res.body.starred, 1);
      assert.equal(res.body.start_date, '2026-04-01');
      assert.equal(res.body.due_date, '2026-04-30');
    });

    it('IDOR: cannot read activity for another user task', async () => {
      const { db } = setup();
      // Create user2
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('pass2', 4);
      db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (2, ?, ?)').run('user2@test.com', hash);
      const area2 = db.prepare('INSERT INTO life_areas (name,icon,color,position,user_id) VALUES (?,?,?,?,?)').run('Area2','📋','#000',0,2);
      const goal2 = db.prepare('INSERT INTO goals (area_id,title,color,status,position,user_id) VALUES (?,?,?,?,?,?)').run(area2.lastInsertRowid,'Goal2','#000','active',0,2);
      const task2 = db.prepare('INSERT INTO tasks (goal_id,title,status,user_id) VALUES (?,?,?,?)').run(goal2.lastInsertRowid,'Secret task','todo',2);
      // User 1 should not see user 2's task activity
      await agent().get(`/api/tasks/${task2.lastInsertRowid}/activity`).expect(404);
    });
  });
});
