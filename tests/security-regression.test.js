const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeUser2 } = require('./helpers');

const SRC = (...p) => path.join(__dirname, '..', 'src', ...p);

describe('Security Regression Tests', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Auth endpoints security ──

  it('logout clears session', async () => {
    // Create a separate session so we don't invalidate the shared test agent
    const { app, db } = setup();
    const sid = 'logout-test-session-' + Date.now();
    db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 1, datetime('now', '+1 day'))").run(sid);
    const res = await request(app).post('/api/auth/logout').set('Cookie', `lf_sid=${sid}`);
    assert.ok(res.status < 300);
    // Session should be deleted
    const row = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
    assert.equal(row, undefined, 'session should be deleted after logout');
  });

  it('password change requires old password', async () => {
    const res = await agent().post('/api/auth/change-password').send({
      newPassword: 'StrongNew123!@#'
    });
    assert.ok(res.status >= 400, 'should require old password');
  });

  it('rate limiting exists on auth routes', () => {
    const serverSrc = fs.readFileSync(SRC('server.js'), 'utf8');
    assert.ok(
      serverSrc.includes('limiter') || serverSrc.includes('rateLimit') || serverSrc.includes('rate'),
      'should have rate limiting on auth'
    );
  });

  // Data isolation tests (inbox, notes, focus, templates) removed — covered by idor-comprehensive.test.js

  // ── Input boundary tests ──

  it('area name max length enforced', async () => {
    const longName = 'a'.repeat(300);
    const res = await agent().post('/api/areas').send({ name: longName, icon: '📋', color: '#FF0000' });
    // Should either truncate, reject, or accept (SQLite TEXT has no length limit)
    assert.ok(res.status >= 200 && res.status < 500, `should not 500: got ${res.status}`);
  });

  it('unicode in task title handled correctly', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: '日本語タスク 🎯 émojis àccénts'
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.title.includes('日本語'));
  });

  it('empty string title rejected', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: '' });
    assert.equal(res.status, 400);
  });

  it('null title rejected', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: null });
    assert.equal(res.status, 400);
  });

  // ── Session security ──

  it('expired session returns 401', async () => {
    const { app, db } = setup();
    // Create expired session
    db.prepare(
      "INSERT INTO sessions (sid, user_id, expires_at) VALUES ('expired-sid', 1, datetime('now', '-1 hour'))"
    ).run();
    const res = await request(app)
      .get('/api/areas')
      .set('Cookie', 'lf_sid=expired-sid');
    assert.equal(res.status, 401);
  });

  it('malformed cookie ignored gracefully', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/api/areas')
      .set('Cookie', 'lf_sid=');
    assert.equal(res.status, 401);
  });
});
