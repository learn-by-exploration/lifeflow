const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeUser2, today } = require('./helpers');

describe('Multi-User Exhaustive Isolation', () => {
  let u2;
  before(() => { setup(); u2 = makeUser2(); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // Helper: User1 creates full hierarchy via API
  async function u1Setup() {
    const areaRes = await agent().post('/api/areas').send({ name: 'U1 Area', icon: '🔹', color: '#FF0000' });
    const area = areaRes.body;
    const goalRes = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'U1 Goal' });
    const goal = goalRes.body;
    const taskRes = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'U1 Task' });
    const task = taskRes.body;
    return { area, goal, task };
  }

  // ─── 1. Data isolation per entity (~10 tests) ────────────────────────────────
  describe('Data isolation per entity', () => {
    it('User B cannot list User A areas', async () => {
      await u1Setup();
      const res = await u2.agent.get('/api/areas');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0, 'User B should see no areas from User A');
    });

    it('User B cannot GET User A goals via areas endpoint', async () => {
      const { area } = await u1Setup();
      const res = await u2.agent.get(`/api/areas/${area.id}/goals`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0, 'User B should see no goals from User A area');
    });

    it('User B cannot GET User A task', async () => {
      const { task } = await u1Setup();
      const res = await u2.agent.get(`/api/tasks/${task.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User B cannot PUT User A task', async () => {
      const { task } = await u1Setup();
      const res = await u2.agent.put(`/api/tasks/${task.id}`).send({ title: 'Hacked' });
      assert.ok([403, 404].includes(res.status));
    });

    it('User B cannot DELETE User A task', async () => {
      const { task } = await u1Setup();
      const res = await u2.agent.delete(`/api/tasks/${task.id}`);
      assert.ok([403, 404].includes(res.status));
    });

    it('User B cannot access User A subtasks', async () => {
      const { task } = await u1Setup();
      await agent().post(`/api/tasks/${task.id}/subtasks`).send({ title: 'U1 Subtask' });
      const res = await u2.agent.get(`/api/tasks/${task.id}/subtasks`);
      assert.ok([403, 404].includes(res.status));
    });

    it('User B cannot see User A tags', async () => {
      await agent().post('/api/tags').send({ name: 'u1-private-tag', color: '#FF0000' });
      const res = await u2.agent.get('/api/tags');
      assert.equal(res.status, 200);
      const names = res.body.map(t => t.name);
      assert.ok(!names.includes('u1-private-tag'), 'User B should not see User A tags');
    });

    it('User B cannot see User A habits', async () => {
      await agent().post('/api/habits').send({ name: 'U1 Secret Habit' });
      const res = await u2.agent.get('/api/habits');
      assert.equal(res.status, 200);
      const names = res.body.map(h => h.name);
      assert.ok(!names.includes('U1 Secret Habit'), 'User B should not see User A habits');
    });

    it('User B cannot access User A notes', async () => {
      const noteRes = await agent().post('/api/notes').send({ title: 'U1 Note', content: 'Secret content' });
      const res = await u2.agent.get(`/api/notes/${noteRes.body.id}`);
      assert.ok([403, 404].includes(res.status));
    });

    it('User B cannot list User A notes', async () => {
      await agent().post('/api/notes').send({ title: 'U1 Private Note', content: 'Secret' });
      const res = await u2.agent.get('/api/notes');
      assert.equal(res.status, 200);
      const titles = (Array.isArray(res.body) ? res.body : []).map(n => n.title);
      assert.ok(!titles.includes('U1 Private Note'), 'User B should not list User A notes');
    });

    it('User B cannot access User A lists', async () => {
      const listRes = await agent().post('/api/lists').send({ name: 'U1 List' });
      const res = await u2.agent.get(`/api/lists/${listRes.body.id}/items`);
      assert.ok([403, 404].includes(res.status));
    });

    it('User B cannot list User A lists', async () => {
      await agent().post('/api/lists').send({ name: 'U1 Private List' });
      const res = await u2.agent.get('/api/lists');
      assert.equal(res.status, 200);
      const names = (Array.isArray(res.body) ? res.body : []).map(l => l.name);
      assert.ok(!names.includes('U1 Private List'), 'User B should not list User A lists');
    });

    it('User B cannot see User A custom fields', async () => {
      await agent().post('/api/custom-fields').send({ name: 'U1 Field', field_type: 'text' });
      const res = await u2.agent.get('/api/custom-fields');
      assert.equal(res.status, 200);
      const names = (Array.isArray(res.body) ? res.body : []).map(f => f.name);
      assert.ok(!names.includes('U1 Field'), 'User B should not see User A custom fields');
    });
  });

  // ─── 2. Search isolation (~3 tests) ──────────────────────────────────────────
  describe('Search isolation', () => {
    it('task search only returns requesting user results', async () => {
      await u1Setup(); // creates "U1 Task"
      // User B creates their own task
      const u2area = await u2.agent.post('/api/areas').send({ name: 'U2 Area', icon: '🟢', color: '#00FF00' });
      const u2goal = await u2.agent.post(`/api/areas/${u2area.body.id}/goals`).send({ title: 'U2 Goal' });
      await u2.agent.post(`/api/goals/${u2goal.body.id}/tasks`).send({ title: 'U2 Task' });

      const res = await u2.agent.get('/api/tasks/search?q=Task');
      assert.equal(res.status, 200);
      const titles = res.body.map(t => t.title);
      assert.ok(!titles.includes('U1 Task'), 'Search should not return User A tasks');
      assert.ok(titles.includes('U2 Task'), 'Search should return User B own tasks');
    });

    it('searching for User A task title as User B returns empty', async () => {
      await u1Setup();
      const res = await u2.agent.get('/api/tasks/search?q=U1+Task');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0, 'User B should get no results for User A task title');
    });

    it('global search scoped to user', async () => {
      await u1Setup();
      const res = await u2.agent.get('/api/search?q=U1');
      assert.equal(res.status, 200);
      assert.equal(res.body.results.length, 0, 'Global search should not return User A data');
    });
  });

  // ─── 3. Stats isolation (~4 tests) ───────────────────────────────────────────
  describe('Stats isolation', () => {
    it('GET /api/stats only counts requesting user tasks', async () => {
      // Create tasks for User A
      const { task } = await u1Setup();
      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' });

      // User B stats should be empty
      const res = await u2.agent.get('/api/stats');
      assert.equal(res.status, 200);
      assert.equal(res.body.total || 0, 0, 'User B stats should show 0 tasks');
      assert.equal(res.body.done || 0, 0, 'User B stats should show 0 done');
    });

    it('GET /api/stats/streaks only counts requesting user completions', async () => {
      const { task } = await u1Setup();
      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' });

      const res = await u2.agent.get('/api/stats/streaks');
      assert.equal(res.status, 200);
      assert.equal(res.body.current || 0, 0, 'User B streaks should be 0');
    });

    it('GET /api/activity only shows requesting user activity', async () => {
      const { task } = await u1Setup();
      await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' });

      const res = await u2.agent.get('/api/activity');
      assert.equal(res.status, 200);
      const items = Array.isArray(res.body) ? res.body : (res.body.tasks || []);
      assert.equal(items.length, 0, 'User B activity should be empty');
    });

    it('GET /api/focus/stats only counts requesting user sessions', async () => {
      const { task } = await u1Setup();
      await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });

      const res = await u2.agent.get('/api/focus/stats');
      assert.equal(res.status, 200);
      assert.equal(res.body.total_sessions || 0, 0, 'User B focus stats should show 0 sessions');
    });
  });

  // ─── 4. Export/Import isolation (~3 tests) ────────────────────────────────────
  describe('Export/Import isolation', () => {
    it('GET /api/export only exports requesting user data', async () => {
      await u1Setup(); // User A creates area/goal/task

      const res = await u2.agent.get('/api/export');
      assert.equal(res.status, 200);
      assert.equal(res.body.areas.length, 0, 'Export should not include User A areas');
      assert.equal(res.body.goals.length, 0, 'Export should not include User A goals');
      assert.equal(res.body.tasks.length, 0, 'Export should not include User A tasks');
    });

    it('POST /api/import only affects requesting user data', async () => {
      // User A creates data
      await u1Setup();

      // User B imports their own data (must have valid non-empty arrays with IDs)
      const importData = {
        confirm: 'DESTROY_ALL_DATA',
        password: 'testpassword',
        areas: [{ id: 900, name: 'U2 Imported Area', icon: '📦', color: '#0000FF' }],
        goals: [{ id: 901, area_id: 900, title: 'U2 Imported Goal' }],
        tasks: [{ id: 902, goal_id: 901, title: 'U2 Imported Task' }],
        tags: [],
      };
      const res = await u2.agent.post('/api/import').send(importData);
      assert.equal(res.status, 200);

      // User A data should be untouched
      const u1Areas = await agent().get('/api/areas');
      assert.ok(u1Areas.body.length >= 1, 'User A areas should be untouched after User B import');
      assert.equal(u1Areas.body[0].name, 'U1 Area');
    });

    it('User A data untouched after User B export', async () => {
      await u1Setup();
      // User B exports (should be empty, and shouldn't affect User A)
      await u2.agent.get('/api/export');

      // Verify User A still has data
      const u1Areas = await agent().get('/api/areas');
      assert.ok(u1Areas.body.length >= 1, 'User A areas intact after User B export');
    });
  });

  // ─── 5. Cross-user operations (~5 tests) ─────────────────────────────────────
  describe('Cross-user operations', () => {
    it('User B cannot reorder User A areas', async () => {
      const { area } = await u1Setup();
      // Create a second area for User A
      const area2Res = await agent().post('/api/areas').send({ name: 'U1 Area 2', icon: '🔸', color: '#00FF00' });
      const area2 = area2Res.body;

      const res = await u2.agent.put('/api/areas/reorder').send([
        { id: area2.id, position: 0 },
        { id: area.id, position: 1 },
      ]);
      // Should succeed (200) but only affect User B's areas (which are none)
      assert.equal(res.status, 200);

      // Verify User A order is unchanged
      const u1Areas = await agent().get('/api/areas');
      assert.equal(u1Areas.body[0].name, 'U1 Area', 'User A area order should be unchanged');
    });

    it('User B cannot move User A task to a different goal', async () => {
      const { task, goal } = await u1Setup();
      // User B creates their own goal
      const u2area = await u2.agent.post('/api/areas').send({ name: 'U2 Area', icon: '🟢', color: '#00FF00' });
      const u2goal = await u2.agent.post(`/api/areas/${u2area.body.id}/goals`).send({ title: 'U2 Goal' });

      const res = await u2.agent.put(`/api/tasks/${task.id}`).send({ goal_id: u2goal.body.id });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);

      // Verify task still belongs to original goal
      const taskRes = await agent().get(`/api/tasks/${task.id}`);
      assert.equal(taskRes.body.goal_id, goal.id, 'Task should still belong to User A goal');
    });

    it('User B cannot set tags on User A task', async () => {
      const { task } = await u1Setup();
      const u2Tag = await u2.agent.post('/api/tags').send({ name: 'u2-tag', color: '#0000FF' });

      const res = await u2.agent.put(`/api/tasks/${task.id}/tags`).send({ tagIds: [u2Tag.body.id] });
      assert.ok([403, 404].includes(res.status));
    });

    it('automation rules only list requesting user rules', async () => {
      // User A creates a rule
      await agent().post('/api/rules').send({
        name: 'U1 Rule', trigger_type: 'task_completed', action_type: 'add_tag',
        trigger_config: {}, action_config: {},
      });

      // User B should not see it
      const res = await u2.agent.get('/api/rules');
      assert.equal(res.status, 200);
      const names = (Array.isArray(res.body) ? res.body : []).map(r => r.name);
      assert.ok(!names.includes('U1 Rule'), 'User B should not see User A rules');
    });

    it('templates only list requesting user templates', async () => {
      // User A creates a template
      await agent().post('/api/templates').send({ name: 'U1 Template', tasks: [{ title: 'T1' }] });

      // User B should not see it
      const res = await u2.agent.get('/api/templates');
      assert.equal(res.status, 200);
      const names = (Array.isArray(res.body) ? res.body : []).map(t => t.name);
      assert.ok(!names.includes('U1 Template'), 'User B should not see User A templates');
    });
  });

  // ─── 6. Session isolation (~5 tests) ──────────────────────────────────────────
  describe('Session isolation', () => {
    it('User B session cannot access User A data via areas', async () => {
      await u1Setup();
      const res = await u2.agent.get('/api/areas');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0);
    });

    it('expired session returns 401', async () => {
      const { db } = setup();
      const crypto = require('crypto');
      const expiredSid = 'expired-session-' + crypto.randomUUID();
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '-1 hour'))"
      ).run(expiredSid, u2.userId);

      const request = require('supertest');
      const { app } = setup();
      const res = await request(app)
        .get('/api/areas')
        .set('Cookie', `lf_sid=${expiredSid}`);
      assert.equal(res.status, 401);
    });

    it('invalid session token returns 401', async () => {
      const request = require('supertest');
      const { app } = setup();
      const res = await request(app)
        .get('/api/areas')
        .set('Cookie', 'lf_sid=totally-invalid-session-token');
      assert.equal(res.status, 401);
    });

    it('User A logout does not affect User B session', async () => {
      // Create a separate session for User A to logout
      const { db } = setup();
      const crypto = require('crypto');
      const u1LogoutSid = 'u1-logout-' + crypto.randomUUID();
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
      ).run(u1LogoutSid, 1);

      const request = require('supertest');
      const { app } = setup();
      // User A logs out this session
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `lf_sid=${u1LogoutSid}`);

      // User B session should still work
      const res = await u2.agent.get('/api/areas');
      assert.equal(res.status, 200);
    });

    it('multiple concurrent sessions per user both work', async () => {
      const { db } = setup();
      const crypto = require('crypto');
      const sid1 = 'multi-session-1-' + crypto.randomUUID();
      const sid2 = 'multi-session-2-' + crypto.randomUUID();
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
      ).run(sid1, u2.userId);
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
      ).run(sid2, u2.userId);

      const request = require('supertest');
      const { app } = setup();
      const res1 = await request(app).get('/api/areas').set('Cookie', `lf_sid=${sid1}`);
      const res2 = await request(app).get('/api/areas').set('Cookie', `lf_sid=${sid2}`);
      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);
    });
  });
});
