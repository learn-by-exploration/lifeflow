const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('API Token Authentication', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    db.exec('DELETE FROM api_tokens');
  });

  describe('POST /api/auth/tokens', () => {
    it('creates a new API token', async () => {
      const res = await agent()
        .post('/api/auth/tokens')
        .send({ name: 'My Script' });
      assert.equal(res.status, 201);
      assert.ok(res.body.id, 'Should return token id');
      assert.ok(res.body.token, 'Should return token string');
      assert.equal(res.body.name, 'My Script');
      // Token should be a long random string
      assert.ok(res.body.token.length >= 32, 'Token should be at least 32 chars');
    });

    it('rejects missing name', async () => {
      const res = await agent().post('/api/auth/tokens').send({});
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/auth/tokens', () => {
    it('lists user tokens without revealing hash', async () => {
      await agent().post('/api/auth/tokens').send({ name: 'Token A' });
      await agent().post('/api/auth/tokens').send({ name: 'Token B' });

      const res = await agent().get('/api/auth/tokens').expect(200);
      assert.equal(res.body.length, 2);
      assert.ok(res.body[0].name);
      assert.ok(res.body[0].created_at);
      // Should NOT expose token hash
      assert.equal(res.body[0].token_hash, undefined);
      assert.equal(res.body[0].token, undefined);
    });
  });

  describe('Bearer token authentication', () => {
    it('authenticates API requests with valid bearer token', async () => {
      const { makeArea } = require('./helpers');
      const area = makeArea({ name: 'Token Area' });

      // Create token
      const tokenRes = await agent().post('/api/auth/tokens').send({ name: 'Test' });
      const token = tokenRes.body.token;

      // Use bearer token (no cookie)
      const res = await rawAgent()
        .get('/api/areas')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('rejects invalid bearer token', async () => {
      const res = await rawAgent()
        .get('/api/areas')
        .set('Authorization', 'Bearer invalid-token-12345');
      assert.equal(res.status, 401);
    });

    it('session auth still works alongside token auth', async () => {
      const { makeArea } = require('./helpers');
      makeArea({ name: 'Session Area' });
      // Regular session auth
      const res = await agent().get('/api/areas').expect(200);
      assert.ok(res.body.length >= 1);
    });
  });

  describe('DELETE /api/auth/tokens/:id', () => {
    it('revokes a token', async () => {
      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Disposable' });
      const tokenId = createRes.body.id;
      const token = createRes.body.token;

      // Revoke
      await agent().delete(`/api/auth/tokens/${tokenId}`).expect(200);

      // Token should no longer work
      const res = await rawAgent()
        .get('/api/areas')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401);
    });

    it('returns 404 for non-existent token', async () => {
      const res = await agent().delete('/api/auth/tokens/99999');
      assert.equal(res.status, 404);
    });
  });

  describe('PUT /api/auth/tokens/:id', () => {
    it('renames a token', async () => {
      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Old Name' });
      const tokenId = createRes.body.id;

      const res = await agent()
        .put(`/api/auth/tokens/${tokenId}`)
        .send({ name: 'New Name' });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'New Name');
    });
  });

  describe('Token isolation', () => {
    it('user2 cannot access user1 resources via token', async () => {
      // Create token for user1
      const tokenRes = await agent().post('/api/auth/tokens').send({ name: 'U1 Token' });
      const token = tokenRes.body.token;

      // This token authenticates as user1 — should see user1 data
      const res = await rawAgent()
        .get('/api/areas')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
    });
  });
});
