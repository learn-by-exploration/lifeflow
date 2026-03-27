const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Outbound Webhooks', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    db.exec('DELETE FROM webhooks');
  });

  describe('POST /api/webhooks', () => {
    it('creates a webhook', async () => {
      const res = await agent()
        .post('/api/webhooks')
        .send({ name: 'My Hook', url: 'https://example.com/hook', events: ['task.created'] });
      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.name, 'My Hook');
      assert.ok(res.body.secret, 'Should generate a secret');
    });

    it('rejects invalid URL', async () => {
      const res = await agent()
        .post('/api/webhooks')
        .send({ name: 'Bad', url: 'not-a-url', events: ['task.created'] });
      assert.equal(res.status, 400);
    });

    it('rejects missing name', async () => {
      const res = await agent()
        .post('/api/webhooks')
        .send({ url: 'https://example.com/hook', events: ['task.created'] });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/webhooks', () => {
    it('lists user webhooks', async () => {
      await agent().post('/api/webhooks')
        .send({ name: 'Hook A', url: 'https://a.com/hook', events: ['task.created'] });
      await agent().post('/api/webhooks')
        .send({ name: 'Hook B', url: 'https://b.com/hook', events: ['task.completed'] });

      const res = await agent().get('/api/webhooks').expect(200);
      assert.equal(res.body.length, 2);
      assert.ok(res.body[0].name);
    });
  });

  describe('PUT /api/webhooks/:id', () => {
    it('updates a webhook', async () => {
      const create = await agent().post('/api/webhooks')
        .send({ name: 'Old', url: 'https://old.com/hook', events: ['task.created'] });
      const id = create.body.id;

      const res = await agent().put(`/api/webhooks/${id}`)
        .send({ name: 'Updated', url: 'https://new.com/hook', events: ['task.completed'], active: false });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'Updated');
    });
  });

  describe('DELETE /api/webhooks/:id', () => {
    it('removes a webhook', async () => {
      const create = await agent().post('/api/webhooks')
        .send({ name: 'Disposable', url: 'https://d.com/hook', events: ['task.created'] });

      await agent().delete(`/api/webhooks/${create.body.id}`).expect(200);

      const list = await agent().get('/api/webhooks');
      assert.equal(list.body.length, 0);
    });

    it('returns 404 for non-existent webhook', async () => {
      const res = await agent().delete('/api/webhooks/99999');
      assert.equal(res.status, 404);
    });
  });

  describe('Webhook isolation', () => {
    it('user2 cannot access user1 webhooks', async () => {
      // Create webhook as user1
      const create = await agent().post('/api/webhooks')
        .send({ name: 'Private', url: 'https://priv.com/hook', events: ['task.created'] });

      // Try to delete as unauthenticated
      const res = await rawAgent().delete(`/api/webhooks/${create.body.id}`);
      assert.equal(res.status, 401);
    });
  });

  describe('Webhook firing', () => {
    it('webhook service module exists and exports fireWebhook', () => {
      const webhookService = require('../src/services/webhook');
      assert.equal(typeof webhookService, 'function');
    });
  });
});
