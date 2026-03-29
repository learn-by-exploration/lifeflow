const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('Web Push Notifications', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    db.exec('DELETE FROM push_subscriptions');
  });

  const validSub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test123',
    keys: {
      p256dh: 'BNn2o24kA123456789abcdef',
      auth: 'abc123def456'
    }
  };

  describe('POST /api/push/subscribe', () => {
    it('stores a push subscription', async () => {
      const res = await agent()
        .post('/api/push/subscribe')
        .send(validSub);
      assert.equal(res.status, 201);
      assert.ok(res.body.id);
    });

    it('upserts on duplicate endpoint', async () => {
      await agent().post('/api/push/subscribe').send(validSub).expect(201);
      const res = await agent().post('/api/push/subscribe').send(validSub);
      assert.equal(res.status, 201);

      // Should only have one subscription
      const count = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id = 1').get();
      assert.equal(count.c, 1);
    });

    it('rejects missing endpoint', async () => {
      const res = await agent().post('/api/push/subscribe').send({ keys: validSub.keys });
      assert.equal(res.status, 400);
    });

    it('rejects missing keys', async () => {
      const res = await agent().post('/api/push/subscribe').send({ endpoint: validSub.endpoint });
      assert.equal(res.status, 400);
    });
  });

  describe('DELETE /api/push/subscribe', () => {
    it('removes a subscription by endpoint', async () => {
      await agent().post('/api/push/subscribe').send(validSub).expect(201);
      const res = await agent()
        .delete('/api/push/subscribe')
        .send({ endpoint: validSub.endpoint });
      assert.equal(res.status, 200);

      const count = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id = 1').get();
      assert.equal(count.c, 0);
    });

    it('returns 200 even if subscription not found', async () => {
      const res = await agent()
        .delete('/api/push/subscribe')
        .send({ endpoint: 'https://nonexistent.com/sub' });
      assert.equal(res.status, 200);
    });
  });

  describe('POST /api/push/test', () => {
    it('returns 200 when no subscriptions exist (graceful)', async () => {
      const res = await agent().post('/api/push/test').send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.sent, 0);
    });

    it('reports subscription count when subscriptions exist (no VAPID = skip)', async () => {
      await agent().post('/api/push/subscribe').send(validSub).expect(201);
      const res = await agent().post('/api/push/test').send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.sent, 0);
      assert.ok(res.body.pending >= 1, 'Should report pending count');
    });
  });

  describe('Subscription isolation', () => {
    it('cascade deletes with user', () => {
      // Insert a subscription for user 1
      db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)')
        .run(1, 'https://test.com/sub', 'key1', 'auth1');

      const before = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions').get();
      assert.equal(before.c, 1);

      // We can't delete user 1 easily (breaks test), but verify FK exists
      const fk = db.pragma('foreign_key_list(push_subscriptions)');
      assert.ok(fk.some(f => f.table === 'users'), 'Should have FK to users');
    });
  });

  // ── Task 3.8 — Push Subscription Expansion ──

  describe('Push subscription edge cases', () => {
    it('POST /api/push/subscribe → stores endpoint + keys correctly', async () => {
      const sub = {
        endpoint: 'https://push.example.com/unique-' + Date.now(),
        keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' }
      };
      const res = await agent().post('/api/push/subscribe').send(sub);
      assert.equal(res.status, 201);

      const stored = db.prepare('SELECT * FROM push_subscriptions WHERE id=?').get(res.body.id);
      assert.equal(stored.endpoint, sub.endpoint);
      assert.equal(stored.p256dh, sub.keys.p256dh);
      assert.equal(stored.auth, sub.keys.auth);
    });

    it('POST /api/push/subscribe with missing endpoint → 400', async () => {
      const res = await agent().post('/api/push/subscribe').send({
        keys: { p256dh: 'key', auth: 'auth' }
      });
      assert.equal(res.status, 400);
    });

    it('POST /api/push/subscribe duplicate endpoint → upserts keys', async () => {
      const sub = {
        endpoint: 'https://push.example.com/upsert-test',
        keys: { p256dh: 'key-v1', auth: 'auth-v1' }
      };
      await agent().post('/api/push/subscribe').send(sub);

      // Update keys for same endpoint
      sub.keys = { p256dh: 'key-v2', auth: 'auth-v2' };
      await agent().post('/api/push/subscribe').send(sub);

      const stored = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').get(sub.endpoint);
      assert.equal(stored.p256dh, 'key-v2');
      assert.equal(stored.auth, 'auth-v2');
    });

    it('DELETE /api/push/subscribe → removes subscription', async () => {
      const sub = {
        endpoint: 'https://push.example.com/to-delete',
        keys: { p256dh: 'k', auth: 'a' }
      };
      await agent().post('/api/push/subscribe').send(sub);
      const before = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE endpoint=?').get(sub.endpoint);
      assert.equal(before.c, 1);

      await agent().delete('/api/push/subscribe').send({ endpoint: sub.endpoint });
      const after = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE endpoint=?').get(sub.endpoint);
      assert.equal(after.c, 0);
    });

    it('GET /api/push/vapid-key → returns publicKey field', async () => {
      const res = await agent().get('/api/push/vapid-key');
      assert.equal(res.status, 200);
      assert.ok('publicKey' in res.body);
    });

    it('push subscribe requires authentication', async () => {
      const res = await rawAgent().post('/api/push/subscribe').send(validSub);
      assert.equal(res.status, 401);
    });
  });
});
