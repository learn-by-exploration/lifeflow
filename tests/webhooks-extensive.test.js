const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

let db;

describe('Webhooks — Extensive Tests', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    try { db.exec('DELETE FROM webhooks'); } catch (e) {}
  });

  it('create webhook → 201 with secret + events', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'My Hook', url: 'https://example.com/hook', events: ['task.created']
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.secret, 'should generate a secret');
    assert.ok(res.body.id);
  });

  it('create webhook with invalid URL → 400', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'Bad', url: 'not-a-url', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('create webhook with empty events array → rejected (at least one required)', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'No Events', url: 'https://example.com/hook', events: []
    });
    assert.equal(res.status, 400);
  });

  it('list webhooks → returns all user webhooks', async () => {
    await agent().post('/api/webhooks').send({ name: 'H1', url: 'https://example.com/h1', events: ['task.created'] });
    await agent().post('/api/webhooks').send({ name: 'H2', url: 'https://example.com/h2', events: ['task.completed'] });

    const res = await agent().get('/api/webhooks');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  it('update webhook (name, url, events, active) → 200', async () => {
    const cr = await agent().post('/api/webhooks').send({
      name: 'Original', url: 'https://example.com/hook', events: ['task.created']
    });
    const res = await agent().put(`/api/webhooks/${cr.body.id}`).send({
      name: 'Updated', url: 'https://example.com/new', events: ['task.completed'], active: false
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated');
  });

  it('delete webhook → 200', async () => {
    const cr = await agent().post('/api/webhooks').send({
      name: 'Delete Me', url: 'https://example.com/hook', events: ['task.created']
    });
    const res = await agent().delete(`/api/webhooks/${cr.body.id}`);
    assert.ok([200, 204].includes(res.status));
  });

  it('get webhook events list → returns supported event types', async () => {
    const res = await agent().get('/api/webhooks/events');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.includes('task.created'));
    assert.ok(res.body.includes('task.completed'));
  });

  it('webhook IDOR: other user cannot access, update, or delete webhook', async () => {
    // Create webhook as the default user (user 1)
    const cr = await agent().post('/api/webhooks').send({
      name: 'Private', url: 'https://example.com/hook', events: ['task.created']
    });
    assert.equal(cr.status, 201);
    const hookId = cr.body.id;

    // Create a second user and get their authenticated session
    const bcrypt = require('bcryptjs');
    const existing = db.prepare('SELECT id FROM users WHERE id = 2').get();
    if (!existing) {
      const hash = bcrypt.hashSync('testpassword', 4);
      db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
        'user2@test.com', hash, 'User Two'
      );
    }
    const { setup: setupFn } = require('./helpers');
    const { app } = setupFn();
    const request = require('supertest');
    // Login as user 2
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'user2@test.com', password: 'testpassword' });
    const cookie = loginRes.headers['set-cookie'];

    // Try to update user 1's webhook as user 2
    const updateRes = await request(app).put(`/api/webhooks/${hookId}`).set('Cookie', cookie).send({ name: 'Hacked' });
    assert.equal(updateRes.status, 404, 'should not find another user\'s webhook');

    // Try to delete user 1's webhook as user 2
    const deleteRes = await request(app).delete(`/api/webhooks/${hookId}`).set('Cookie', cookie);
    assert.equal(deleteRes.status, 404, 'should not be able to delete another user\'s webhook');

    // Verify webhook still exists and is unmodified
    const verify = await agent().get('/api/webhooks');
    const hook = verify.body.find(h => h.id === hookId);
    assert.ok(hook, 'webhook should still exist');
    assert.equal(hook.name, 'Private', 'webhook name should be unchanged');
  });

  it('webhook secret is unique per webhook', async () => {
    const h1 = await agent().post('/api/webhooks').send({
      name: 'H1', url: 'https://example.com/h1', events: ['task.created']
    });
    const h2 = await agent().post('/api/webhooks').send({
      name: 'H2', url: 'https://example.com/h2', events: ['task.created']
    });
    assert.notEqual(h1.body.secret, h2.body.secret, 'secrets should be unique');
  });

  it('disable webhook (active=false) → persisted correctly', async () => {
    const cr = await agent().post('/api/webhooks').send({
      name: 'Toggle', url: 'https://example.com/hook', events: ['task.created']
    });
    await agent().put(`/api/webhooks/${cr.body.id}`).send({ active: false });

    const list = await agent().get('/api/webhooks');
    const hook = list.body.find(h => h.id === cr.body.id);
    assert.equal(hook.active, 0, 'active should be persisted as false/0');
  });
});
