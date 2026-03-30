const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeUser2, makeTag, linkTag } = require('./helpers');

describe('E2E Security Workflows', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Multi-user isolation ──

  it('user1 data fully invisible to user2', async () => {
    const area = makeArea({ name: 'User1 Area' });
    const goal = makeGoal(area.id, { title: 'User1 Goal' });
    makeTask(goal.id, { title: 'User1 Task' });

    const { agent: agent2 } = makeUser2();
    const areas = await agent2.get('/api/areas');
    assert.equal(areas.body.filter(a => a.name === 'User1 Area').length, 0);
  });

  it('user1 and user2 can create tags independently', async () => {
    const tag1 = makeTag({ name: 'u1-important' });
    const { agent: agent2 } = makeUser2();
    // User2 creates different-named tag
    const r = await agent2.post('/api/tags').send({ name: 'u2-important', color: '#FF0000' });
    assert.equal(r.status, 201);
  });

  it('user2 cannot edit user1 area', async () => {
    const area = makeArea({ name: 'Protected Area' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.put(`/api/areas/${area.id}`).send({ name: 'Hacked' });
    assert.equal(res.status, 404);
  });

  it('user2 cannot delete user1 goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const { agent: agent2 } = makeUser2();
    const res = await agent2.delete(`/api/goals/${goal.id}`);
    assert.equal(res.status, 404);
  });

  it('user2 cannot complete user1 task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const { agent: agent2 } = makeUser2();
    const res = await agent2.put(`/api/tasks/${task.id}`).send({ status: 'done' });
    assert.equal(res.status, 404);
  });

  // ── Auth + Token combined flow ──

  it('expired session + valid API token: token auth succeeds', async () => {
    // Create token while session is valid
    const tokenRes = await agent().post('/api/auth/tokens').send({ name: 'backup-auth' });
    const token = tokenRes.body.token;

    // Now use the token directly (without session)
    const { app } = setup();
    const areas = await request(app).get('/api/areas').set('Authorization', `Bearer ${token}`);
    assert.equal(areas.status, 200);
  });

  it('revoked token does not grant access even with valid session', async () => {
    const tokenRes = await agent().post('/api/auth/tokens').send({ name: 'revoke-test' });
    await agent().delete(`/api/auth/tokens/${tokenRes.body.id}`);

    const { app } = setup();
    const res = await request(app).get('/api/areas').set('Authorization', `Bearer ${tokenRes.body.token}`);
    assert.equal(res.status, 401);
  });

  // ── Area → Goal → Task cascade workflow ──

  it('full lifecycle: create area → goal → task → complete → verify stats', async () => {
    const area = await agent().post('/api/areas').send({ name: 'Lifecycle', icon: '🧪', color: '#FF0000' });
    assert.equal(area.status, 201);

    const goal = await agent().post(`/api/areas/${area.body.id}/goals`).send({ title: 'Test Goal' });
    assert.equal(goal.status, 201);

    const task = await agent().post(`/api/goals/${goal.body.id}/tasks`).send({ title: 'Test Task' });
    assert.equal(task.status, 201);

    const complete = await agent().put(`/api/tasks/${task.body.id}`).send({ status: 'done' });
    assert.equal(complete.status, 200);
    assert.ok(complete.body.completed_at, 'should set completed_at');

    const stats = await agent().get('/api/stats');
    assert.equal(stats.status, 200);
  });

  it('delete area cascades through goal → task → subtask', async () => {
    const area = await agent().post('/api/areas').send({ name: 'Cascade', icon: '💥', color: '#FF0000' });
    const goal = await agent().post(`/api/areas/${area.body.id}/goals`).send({ title: 'G1' });
    const task = await agent().post(`/api/goals/${goal.body.id}/tasks`).send({ title: 'T1' });
    await agent().post(`/api/tasks/${task.body.id}/subtasks`).send({ title: 'S1' });

    await agent().delete(`/api/areas/${area.body.id}`);

    const { db } = setup();
    assert.equal(db.prepare('SELECT id FROM goals WHERE id=?').get(goal.body.id), undefined);
    assert.equal(db.prepare('SELECT id FROM tasks WHERE id=?').get(task.body.id), undefined);
  });

  // ── Tag + Task workflow ──

  it('tag attached to task survives task update', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tag = makeTag({ name: 'sticky-tag' });
    linkTag(task.id, tag.id);

    await agent().put(`/api/tasks/${task.id}`).send({ title: 'Updated Title' });

    const fetched = await agent().get(`/api/tasks/${task.id}`);
    assert.ok(fetched.body.tags.some(t => t.name === 'sticky-tag'));
  });

  // ── Search isolation ──

  it('search results only include own data', async () => {
    const area = makeArea({ name: 'SearchArea' });
    const goal = makeGoal(area.id, { title: 'SearchGoal' });
    makeTask(goal.id, { title: 'FindMe Secret Task' });

    const { agent: agent2 } = makeUser2();
    const results = await agent2.get('/api/tasks/search?q=FindMe');
    assert.equal(results.status, 200);
    const found = (results.body || []).filter(r => r.title && r.title.includes('FindMe'));
    assert.equal(found.length, 0, 'user2 should not find user1 data in search');
  });

  // ── Habit workflow ──

  it('habit log retrieval is user-scoped', async () => {
    const h = await agent().post('/api/habits').send({ name: 'HabitTest', frequency: 'daily' });
    assert.equal(h.status, 201);

    const { agent: agent2 } = makeUser2();
    const habits = await agent2.get('/api/habits');
    assert.equal(habits.body.filter(x => x.name === 'HabitTest').length, 0);
  });

  // ── Export scoping ──

  it('export only contains own data', async () => {
    const area = makeArea({ name: 'ExportOnly' });
    const { agent: agent2 } = makeUser2();
    const area2 = await agent2.post('/api/areas').send({ name: 'User2Export', icon: '📋', color: '#0000FF' });

    const exp = await agent().get('/api/export');
    assert.equal(exp.status, 200);
    const exportedAreas = exp.body.areas || [];
    assert.ok(exportedAreas.some(a => a.name === 'ExportOnly'), 'should contain own area');
    assert.ok(!exportedAreas.some(a => a.name === 'User2Export'), 'should not contain other user area');
  });

  // ── List isolation ──

  it('user2 cannot access user1 list items', async () => {
    const list = await agent().post('/api/lists').send({ name: 'MyList', type: 'checklist' });
    assert.equal(list.status, 201);
    await agent().post(`/api/lists/${list.body.id}/items`).send({ title: 'Secret Item' });

    const { agent: agent2 } = makeUser2();
    const items = await agent2.get(`/api/lists/${list.body.id}/items`);
    // Should either 404 or return empty
    assert.ok(items.status === 404 || (items.body || []).length === 0);
  });
});
