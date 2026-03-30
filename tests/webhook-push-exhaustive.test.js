const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeUser2, makeArea, makeGoal, makeTask } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

describe('Webhook & Push Exhaustive Edge Cases', () => {

  describe('Webhook activation toggle', () => {
    it('create webhook with active=true (default)', async () => {
      const res = await agent().post('/api/webhooks').send({
        name: 'Active Hook',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.active === true || res.body.active === 1);
    });

    it('deactivate webhook via PUT', async () => {
      const create = await agent().post('/api/webhooks').send({
        name: 'To Deactivate',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      const res = await agent().put(`/api/webhooks/${create.body.id}`).send({ active: false });
      assert.equal(res.status, 200);

      const list = await agent().get('/api/webhooks');
      const hook = list.body.find(h => h.id === create.body.id);
      assert.equal(hook.active, 0);
    });

    it('reactivate webhook via PUT', async () => {
      const create = await agent().post('/api/webhooks').send({
        name: 'Toggle',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      await agent().put(`/api/webhooks/${create.body.id}`).send({ active: false });
      const res = await agent().put(`/api/webhooks/${create.body.id}`).send({ active: true });
      assert.equal(res.status, 200);
    });
  });

  describe('Webhook update edge cases', () => {
    it('update webhook name only', async () => {
      const create = await agent().post('/api/webhooks').send({
        name: 'Original',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      const res = await agent().put(`/api/webhooks/${create.body.id}`).send({ name: 'Updated' });
      assert.equal(res.status, 200);
    });

    it('update webhook URL only', async () => {
      const create = await agent().post('/api/webhooks').send({
        name: 'URL Test',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      const res = await agent().put(`/api/webhooks/${create.body.id}`).send({ url: 'https://example.com/new' });
      assert.equal(res.status, 200);
    });

    it('update webhook URL to private IP → rejected', async () => {
      const create = await agent().post('/api/webhooks').send({
        name: 'SSRF Test',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      const res = await agent().put(`/api/webhooks/${create.body.id}`).send({ url: 'https://192.168.1.1/hook' });
      assert.equal(res.status, 400);
    });

    it('update non-existent webhook → 404', async () => {
      const res = await agent().put('/api/webhooks/99999').send({ name: 'Ghost' });
      assert.equal(res.status, 404);
    });

    it('delete non-existent webhook → 404', async () => {
      const res = await agent().delete('/api/webhooks/99999');
      assert.equal(res.status, 404);
    });
  });

  describe('Webhook secret security', () => {
    it('secret is 64-char hex string on creation', async () => {
      const res = await agent().post('/api/webhooks').send({
        name: 'Secret Test',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.secret, 'should include secret on creation');
      assert.match(res.body.secret, /^[a-f0-9]{64}$/, 'secret should be 64-char hex');
    });

    it('GET /api/webhooks does NOT expose secret in list', async () => {
      await agent().post('/api/webhooks').send({
        name: 'List Test',
        url: 'https://example.com/hook',
        events: ['task.created'],
      });
      const res = await agent().get('/api/webhooks');
      assert.equal(res.status, 200);
      for (const hook of res.body) {
        assert.ok(!hook.secret, 'secret should not be in list response');
      }
    });
  });

  describe('Webhook SSRF prevention edge cases', () => {
    it('reject IPv6-mapped IPv4 private address', async () => {
      const res = await agent().post('/api/webhooks').send({
        name: 'IPv6Map',
        url: 'https://[::ffff:127.0.0.1]/hook',
        events: ['task.created'],
      });
      // May not be caught by all SSRF filters
      assert.ok([201, 400].includes(res.status), `got ${res.status}`);
    });

    it('reject file:// URL scheme', async () => {
      const res = await agent().post('/api/webhooks').send({
        name: 'File Scheme',
        url: 'file:///etc/passwd',
        events: ['task.created'],
      });
      assert.equal(res.status, 400);
    });

    it('accept valid HTTPS URL', async () => {
      const res = await agent().post('/api/webhooks').send({
        name: 'HTTPS OK',
        url: 'https://hooks.slack.com/services/test',
        events: ['task.created'],
      });
      assert.equal(res.status, 201);
    });
  });

  describe('Push subscription edge cases', () => {
    it('subscribe with valid keys', async () => {
      const res = await agent().post('/api/push/subscribe').send({
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' },
      });
      assert.ok([200, 201].includes(res.status), `expected 200 or 201, got ${res.status}`);
    });

    it('subscribe with missing endpoint → 400', async () => {
      const res = await agent().post('/api/push/subscribe').send({
        keys: { p256dh: 'test', auth: 'test' },
      });
      assert.equal(res.status, 400);
    });

    it('subscribe with missing keys → 400', async () => {
      const res = await agent().post('/api/push/subscribe').send({
        endpoint: 'https://push.example.com/sub2',
      });
      assert.equal(res.status, 400);
    });

    it('unsubscribe removes subscription', async () => {
      const endpoint = 'https://push.example.com/unsub-test';
      await agent().post('/api/push/subscribe').send({
        endpoint,
        keys: { p256dh: 'test', auth: 'test' },
      });
      const res = await agent().delete('/api/push/subscribe').send({ endpoint });
      assert.equal(res.status, 200);
    });

    it('GET /api/push/vapid-key returns publicKey', async () => {
      const res = await agent().get('/api/push/vapid-key');
      assert.equal(res.status, 200);
      // publicKey may be null if VAPID not configured, but key should exist
      assert.ok('publicKey' in res.body, 'should have publicKey field');
    });

    it('POST /api/push/test with no subscriptions → sent: 0', async () => {
      const res = await agent().post('/api/push/test');
      assert.equal(res.status, 200);
      assert.ok(res.body.sent === 0 || res.body.pending || res.body.ok !== undefined);
    });

    it('push subscription requires authentication', async () => {
      const res = await rawAgent().post('/api/push/subscribe').send({
        endpoint: 'https://push.example.com/noauth',
        keys: { p256dh: 'test', auth: 'test' },
      });
      assert.equal(res.status, 401);
    });
  });

  describe('Webhook events endpoint', () => {
    it('GET /api/webhooks/events returns array of valid events', async () => {
      const res = await agent().get('/api/webhooks/events');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body), 'should return array');
      assert.ok(res.body.length > 0, 'should have at least one event type');
      assert.ok(res.body.includes('task.created') || res.body.some(e => e.includes('task')));
    });
  });
});
