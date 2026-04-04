const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, agent: makeAgent } = require('./helpers');

let app, db, agent;

describe('Phase 2-3 Features', () => {
  before(() => {
    const env = setup();
    app = env.app;
    db = env.db;
    agent = makeAgent();
  });
  after(() => teardown());


  // ─── SUGGESTIONS ───
  describe('My Day Suggestions', () => {
    beforeEach(() => cleanDb());

    it('GET /api/tasks/suggestions returns scored suggestions', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      makeTask(goal.id, { title: 'Overdue task', due_date: yesterday, priority: 3 });
      makeTask(goal.id, { title: 'Today task', due_date: today, priority: 2 });
      makeTask(goal.id, { title: 'Far task', due_date: nextMonth, priority: 0 });

      const r = await agent.get('/api/tasks/suggestions');
      assert.equal(r.status, 200);
      assert(Array.isArray(r.body));
      assert(r.body.length >= 2);
      assert(r.body[0].score >= r.body[1].score);
      assert(Array.isArray(r.body[0].reasons));
    });

    it('returns empty when all tasks are done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Done', status: 'done' });
      const r = await agent.get('/api/tasks/suggestions');
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 0);
    });

    it('excludes tasks already in my_day', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'In my day', my_day: 1, due_date: new Date().toISOString().slice(0, 10), priority: 3 });
      makeTask(goal.id, { title: 'Not in my day', due_date: new Date().toISOString().slice(0, 10), priority: 2 });
      const r = await agent.get('/api/tasks/suggestions');
      assert.equal(r.status, 200);
      const titles = r.body.map(t => t.title);
      assert(!titles.includes('In my day'));
      assert(titles.includes('Not in my day'));
    });
  });

  // ─── UPCOMING ───
  describe('Upcoming View', () => {
    beforeEach(() => cleanDb());

    it('GET /api/tasks/upcoming returns grouped tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      makeTask(goal.id, { title: 'Overdue', due_date: yesterday });
      makeTask(goal.id, { title: 'Tomorrow', due_date: tomorrow });
      makeTask(goal.id, { title: 'Undated' });

      const r = await agent.get('/api/tasks/upcoming?days=7');
      assert.equal(r.status, 200);
      assert(Array.isArray(r.body.overdue));
      assert(Array.isArray(r.body.upcoming));
      assert(Array.isArray(r.body.undated));
      assert(r.body.overdue.length >= 1);
      assert(r.body.upcoming.length >= 1);
      assert(r.body.undated.length >= 1);
    });

    it('default days=30', async () => {
      const r = await agent.get('/api/tasks/upcoming');
      assert.equal(r.status, 200);
      assert(r.body.overdue !== undefined);
    });
  });

  // ─── GAMIFICATION ───
  describe('Gamification XP', () => {
    beforeEach(() => cleanDb());

    it('GET /api/gamification/stats returns initial state', async () => {
      const r = await agent.get('/api/gamification/stats');
      assert.equal(r.status, 200);
      assert.equal(typeof r.body.level, 'number');
      assert(r.body.daily_goal > 0);
      assert(r.body.weekly_goal > 0);
      assert(Array.isArray(r.body.recent_xp));
    });

    it('POST /api/gamification/award gives task_complete XP', async () => {
      const r = await agent.post('/api/gamification/award').send({ reason: 'task_complete' });
      assert.equal(r.status, 200);
      assert.equal(r.body.xp_gained, 10);
      assert(r.body.xp_total >= 10);
    });

    it('POST /api/gamification/award gives habit_log XP', async () => {
      const r = await agent.post('/api/gamification/award').send({ reason: 'habit_log' });
      assert.equal(r.status, 200);
      assert.equal(r.body.xp_gained, 5);
    });

    it('POST /api/gamification/award rejects invalid reason', async () => {
      const r = await agent.post('/api/gamification/award').send({ reason: 'hacking' });
      assert.equal(r.status, 400);
    });

    it('POST /api/gamification/award rejects empty body', async () => {
      const r = await agent.post('/api/gamification/award').send({});
      assert.equal(r.status, 400);
    });

    it('PUT /api/gamification/goals updates daily and weekly goals', async () => {
      const r = await agent.put('/api/gamification/goals').send({ daily_goal: 8, weekly_goal: 40 });
      assert.equal(r.status, 200);
      const s = await agent.get('/api/gamification/stats');
      assert.equal(s.body.daily_goal, 8);
      assert.equal(s.body.weekly_goal, 40);
    });

    it('PUT /api/gamification/goals validates daily_goal range', async () => {
      const r1 = await agent.put('/api/gamification/goals').send({ daily_goal: 0 });
      assert.equal(r1.status, 400);
      const r2 = await agent.put('/api/gamification/goals').send({ daily_goal: 101 });
      assert.equal(r2.status, 400);
    });

    it('PUT /api/gamification/goals validates weekly_goal range', async () => {
      const r1 = await agent.put('/api/gamification/goals').send({ weekly_goal: 0 });
      assert.equal(r1.status, 400);
      const r2 = await agent.put('/api/gamification/goals').send({ weekly_goal: 501 });
      assert.equal(r2.status, 400);
    });

    it('tracks XP history in stats', async () => {
      await agent.post('/api/gamification/award').send({ reason: 'task_complete' });
      await agent.post('/api/gamification/award').send({ reason: 'focus_session' });
      const s = await agent.get('/api/gamification/stats');
      assert(s.body.recent_xp.length >= 2);
      assert.equal(s.body.recent_xp[0].reason, 'focus_session');
    });

    it('levels up at 100 XP threshold', async () => {
      for (let i = 0; i < 10; i++) {
        await agent.post('/api/gamification/award').send({ reason: 'task_complete' });
      }
      const s = await agent.get('/api/gamification/stats');
      assert(s.body.level >= 2);
      assert(s.body.xp_total >= 100);
    });
  });

  // ─── FILE ATTACHMENTS ───
  describe('File Attachments', () => {
    let taskId;
    beforeEach(async () => {
      cleanDb();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      taskId = task.id;
    });

    it('GET /api/tasks/:id/attachments returns empty initially', async () => {
      const r = await agent.get(`/api/tasks/${taskId}/attachments`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, []);
    });

    it('POST /api/tasks/:id/attachments uploads file', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/attachments`)
        .set('Content-Type', 'application/octet-stream')
        .set('X-Filename', 'readme.txt')
        .set('X-Mime-Type', 'text/plain')
        .send(Buffer.from('hello world'));
      assert.equal(r.status, 201);
      assert(r.body.id);
      assert.equal(r.body.original_name, 'readme.txt');
      assert.equal(r.body.mime_type, 'text/plain');
      assert.equal(r.body.size_bytes, 11);
    });

    it('lists uploaded attachments', async () => {
      await agent.post(`/api/tasks/${taskId}/attachments`)
        .set('Content-Type', 'application/octet-stream')
        .set('X-Filename', 'doc.txt')
        .set('X-Mime-Type', 'text/plain')
        .send(Buffer.from('data'));
      const r = await agent.get(`/api/tasks/${taskId}/attachments`);
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 1);
    });

    it('DELETE /api/tasks/:id/attachments/:attachId removes', async () => {
      const up = await agent.post(`/api/tasks/${taskId}/attachments`)
        .set('Content-Type', 'application/octet-stream')
        .set('X-Filename', 'del.txt')
        .set('X-Mime-Type', 'text/plain')
        .send(Buffer.from('to delete'));
      const r = await agent.delete(`/api/tasks/${taskId}/attachments/${up.body.id}`);
      assert.equal(r.status, 200);
      const list = await agent.get(`/api/tasks/${taskId}/attachments`);
      assert.equal(list.body.length, 0);
    });

    it('rejects disallowed mime types', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/attachments`)
        .set('Content-Type', 'application/octet-stream')
        .set('X-Filename', 'evil.exe')
        .set('X-Mime-Type', 'application/x-executable')
        .send(Buffer.from('malware'));
      assert.equal(r.status, 400);
    });

    it('returns 404 for non-existent task', async () => {
      const r = await agent.get('/api/tasks/999999/attachments');
      assert.equal(r.status, 404);
    });

    it('returns 404 for non-existent attachment delete', async () => {
      const r = await agent.delete(`/api/tasks/${taskId}/attachments/999999`);
      assert.equal(r.status, 404);
    });
  });

  // ─── CUSTOM STATUSES ───
  describe('Custom Statuses', () => {
    let goalId;
    beforeEach(async () => {
      cleanDb();
      const area = makeArea();
      const goal = makeGoal(area.id);
      goalId = goal.id;
    });

    it('GET /api/goals/:goalId/statuses returns empty', async () => {
      const r = await agent.get(`/api/goals/${goalId}/statuses`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, []);
    });

    it('POST creates a status', async () => {
      const r = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: 'In Review', color: '#f59e0b' });
      assert.equal(r.status, 201);
      assert.equal(r.body.name, 'In Review');
      assert.equal(r.body.color, '#f59e0b');
      assert.equal(r.body.is_done, 0);
    });

    it('POST with is_done=true', async () => {
      const r = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: 'Shipped', is_done: true });
      assert.equal(r.status, 201);
      assert.equal(r.body.is_done, 1);
    });

    it('PUT updates a status', async () => {
      const cr = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: 'Draft' });
      const r = await agent.put(`/api/goals/${goalId}/statuses/${cr.body.id}`).send({ name: 'QA', color: '#10b981' });
      assert.equal(r.status, 200);
      assert.equal(r.body.name, 'QA');
    });

    it('DELETE removes a status', async () => {
      const cr = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: 'To Delete' });
      const r = await agent.delete(`/api/goals/${goalId}/statuses/${cr.body.id}`);
      assert.equal(r.status, 200);
    });

    it('rejects name too long', async () => {
      const r = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: 'x'.repeat(51) });
      assert.equal(r.status, 400);
    });

    it('rejects empty name', async () => {
      const r = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: '' });
      assert.equal(r.status, 400);
    });

    it('enforces max 10 statuses per goal', async () => {
      for (let i = 0; i < 10; i++) await agent.post(`/api/goals/${goalId}/statuses`).send({ name: `S${i}` });
      const r = await agent.post(`/api/goals/${goalId}/statuses`).send({ name: 'Overflow' });
      assert.equal(r.status, 400);
    });

    it('returns 404 for non-existent goal', async () => {
      const r = await agent.get('/api/goals/999999/statuses');
      assert.equal(r.status, 404);
    });
  });

  // ─── @MENTIONS ───
  describe('@Mentions in Comments', () => {
    let taskId;
    beforeEach(async () => {
      cleanDb();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      taskId = task.id;
    });

    it('POST extracts @mentions', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/comments`).send({ text: 'Hey @alice and @bob check this' });
      assert.equal(r.status, 201);
      assert.deepEqual(r.body.mentions, ['alice', 'bob']);
    });

    it('PUT extracts @mentions on update', async () => {
      const cr = await agent.post(`/api/tasks/${taskId}/comments`).send({ text: 'First version' });
      const r = await agent.put(`/api/tasks/${taskId}/comments/${cr.body.id}`).send({ text: 'Updated @charlie' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.mentions, ['charlie']);
    });

    it('no mentions returns empty array', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/comments`).send({ text: 'No mentions at all' });
      assert.deepEqual(r.body.mentions, []);
    });

    it('handles underscore and dot in usernames', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/comments`).send({ text: 'CC @first.last and @my_name' });
      assert.deepEqual(r.body.mentions, ['first.last', 'my_name']);
    });
  });

  // ─── NESTED SUBTASKS ───
  describe('Nested Subtasks', () => {
    let taskId;
    beforeEach(async () => {
      cleanDb();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      taskId = task.id;
    });

    it('creates a root subtask', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root' });
      assert.equal(r.status, 201);
      assert.equal(r.body.parent_id, null);
    });

    it('creates nested subtask under root', async () => {
      const root = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root' });
      const r = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Child', parent_id: root.body.id });
      assert.equal(r.status, 201);
      assert.equal(r.body.parent_id, root.body.id);
    });

    it('creates 3rd level nested subtask', async () => {
      const root = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root' });
      const child = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Child', parent_id: root.body.id });
      const r = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Grandchild', parent_id: child.body.id });
      assert.equal(r.status, 201);
      assert.equal(r.body.parent_id, child.body.id);
    });

    it('rejects 4th level nesting', async () => {
      const root = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root' });
      const child = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Child', parent_id: root.body.id });
      const grandchild = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Grandchild', parent_id: child.body.id });
      const r = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Too deep', parent_id: grandchild.body.id });
      assert.equal(r.status, 400);
      assert(r.body.error.includes('3 levels'));
    });

    it('rejects non-existent parent_id', async () => {
      const r = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Bad', parent_id: 999999 });
      assert.equal(r.status, 400);
    });

    it('updates parent_id via PUT', async () => {
      const root = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root 1' });
      const root2 = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root 2' });
      const child = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Child', parent_id: root.body.id });
      const r = await agent.put(`/api/subtasks/${child.body.id}`).send({ parent_id: root2.body.id });
      assert.equal(r.status, 200);
      assert.equal(r.body.parent_id, root2.body.id);
    });

    it('rejects self-referencing parent_id', async () => {
      const root = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root' });
      const r = await agent.put(`/api/subtasks/${root.body.id}`).send({ parent_id: root.body.id });
      assert.equal(r.status, 400);
    });

    it('GET returns subtasks with parent_id', async () => {
      const root = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Root' });
      await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: 'Child', parent_id: root.body.id });
      const r = await agent.get(`/api/tasks/${taskId}/subtasks`);
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 2);
      const child = r.body.find(s => s.parent_id);
      assert(child);
      assert.equal(child.parent_id, root.body.id);
    });
  });

  // ─── DATA EXPORT ───
  describe('Data Export includes Phase 2-3', () => {
    beforeEach(() => cleanDb());

    it('export JSON includes new tables', async () => {
      const r = await agent.get('/api/export');
      assert.equal(r.status, 200);
      assert(Array.isArray(r.body.user_xp));
      assert(Array.isArray(r.body.task_attachments));
      assert(Array.isArray(r.body.custom_statuses));
    });
  });
});
