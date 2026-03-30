const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeUser2 } = require('./helpers');

describe('Webhook Security', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  const VALID_URL = 'https://example.com/webhook';

  // ── URL Validation ──

  it('reject http:// URL (must be HTTPS)', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'http://example.com/hook', events: ['task.created']
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('https'));
  });

  it('reject localhost URL (SSRF prevention)', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'https://localhost/hook', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('reject 127.0.0.1 URL (SSRF prevention)', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'https://127.0.0.1/hook', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('reject 10.x.x.x private IP', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'https://10.0.0.1/hook', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('reject 172.16.x.x private IP', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'https://172.16.0.1/hook', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('reject 192.168.x.x private IP', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'https://192.168.1.1/hook', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('reject 169.254.x.x link-local (cloud metadata SSRF)', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'https://169.254.169.254/latest/meta-data/', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  it('URL validated with URL constructor (reject invalid)', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: 'not-a-url', events: ['task.created']
    });
    assert.equal(res.status, 400);
  });

  // ── Secret & Signing ──

  it('webhook secret generated on creation', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'secret-test', url: VALID_URL, events: ['task.created']
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.secret, 'should return secret on creation');
    assert.ok(res.body.secret.length >= 32, 'secret should be at least 32 chars');
  });

  it('webhook service signs payload with HMAC-SHA256', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'services', 'webhook.js'), 'utf8'
    );
    assert.ok(src.includes("createHmac('sha256'"), 'should use HMAC-SHA256 signing');
    assert.ok(src.includes('X-Webhook-Signature'), 'should set signature header');
  });

  it('webhook service uses AbortController with 5s timeout', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'services', 'webhook.js'), 'utf8'
    );
    assert.ok(src.includes('AbortController'), 'should use AbortController');
    assert.ok(src.includes('5000'), 'should have 5s timeout');
  });

  // ── Event Validation ──

  it('only valid event types accepted', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: VALID_URL, events: ['invalid.event']
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.allowed, 'should return allowed events');
  });

  it('at least one event required', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: VALID_URL, events: []
    });
    assert.equal(res.status, 400);
  });

  it('duplicate events deduplicated', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'dedup', url: VALID_URL, events: ['task.created', 'task.created', 'task.completed']
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.events.length, 2, 'duplicate events should be removed');
  });

  // ── Rate Limiting ──

  it('max 10 webhooks per user', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await agent().post('/api/webhooks').send({
        name: `hook-${i}`, url: VALID_URL, events: ['task.created']
      });
      assert.equal(r.status, 201, `webhook ${i} should succeed`);
    }
    const r11 = await agent().post('/api/webhooks').send({
      name: 'hook-11', url: VALID_URL, events: ['task.created']
    });
    assert.equal(r11.status, 400, 'should reject 11th webhook');
  });

  // ── IDOR Protection ──

  it('user2 cannot read user1 webhooks', async () => {
    await agent().post('/api/webhooks').send({
      name: 'user1-hook', url: VALID_URL, events: ['task.created']
    });
    const { agent: agent2 } = makeUser2();
    const list = await agent2.get('/api/webhooks');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 0, 'user2 should see no webhooks');
  });

  it('user2 cannot update user1 webhook', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'user1-hook', url: VALID_URL, events: ['task.created']
    });
    const { agent: agent2 } = makeUser2();
    const upd = await agent2.put(`/api/webhooks/${res.body.id}`).send({ name: 'hacked' });
    assert.equal(upd.status, 404);
  });

  it('user2 cannot delete user1 webhook', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'user1-hook', url: VALID_URL, events: ['task.created']
    });
    const { agent: agent2 } = makeUser2();
    const del = await agent2.delete(`/api/webhooks/${res.body.id}`);
    assert.equal(del.status, 404);
    // Verify still exists
    const list = await agent().get('/api/webhooks');
    assert.ok(list.body.some(h => h.id === res.body.id));
  });

  // ── List Security ──

  it('list webhooks does not expose secret', async () => {
    await agent().post('/api/webhooks').send({
      name: 'secret-test', url: VALID_URL, events: ['task.created']
    });
    const list = await agent().get('/api/webhooks');
    for (const h of list.body) {
      assert.ok(!h.secret, 'should not expose secret in listing');
    }
  });

  // ── Update Validation ──

  it('update rejects http:// URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: VALID_URL, events: ['task.created']
    });
    const upd = await agent().put(`/api/webhooks/${res.body.id}`).send({
      url: 'http://example.com/hook'
    });
    assert.equal(upd.status, 400);
  });

  it('update rejects private IP URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'test', url: VALID_URL, events: ['task.created']
    });
    const upd = await agent().put(`/api/webhooks/${res.body.id}`).send({
      url: 'https://10.0.0.1/hook'
    });
    assert.equal(upd.status, 400);
  });

  // ── Name Validation ──

  it('webhook name required', async () => {
    const r1 = await agent().post('/api/webhooks').send({ url: VALID_URL, events: ['task.created'] });
    assert.equal(r1.status, 400);
    const r2 = await agent().post('/api/webhooks').send({ name: '', url: VALID_URL, events: ['task.created'] });
    assert.equal(r2.status, 400);
  });

  it('webhook URL required', async () => {
    const res = await agent().post('/api/webhooks').send({ name: 'test', events: ['task.created'] });
    assert.equal(res.status, 400);
  });
});
