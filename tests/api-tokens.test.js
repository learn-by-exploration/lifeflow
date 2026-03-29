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

  // ── Task 3.2 — API Tokens Expansion ──

  describe('Token creation details', () => {
    it('returns plaintext token ONCE at creation, never on list', async () => {
      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Once Only' });
      assert.ok(createRes.body.token, 'creation response should include plaintext token');
      assert.ok(createRes.body.token.length >= 32);

      const listRes = await agent().get('/api/auth/tokens');
      for (const tok of listRes.body) {
        assert.equal(tok.token, undefined, 'list should not expose plaintext token');
        assert.equal(tok.token_hash, undefined, 'list should not expose token hash');
      }
    });

    it('create token with empty name → 400', async () => {
      const res = await agent().post('/api/auth/tokens').send({ name: '   ' });
      assert.equal(res.status, 400);
    });
  });

  describe('Bearer token expiration', () => {
    it('expired bearer token → 401', async () => {
      // Create a token that expires immediately
      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Short Lived', expires_in_days: 0 });
      const token = createRes.body.token;

      // Manually set expiration to past
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare("UPDATE api_tokens SET expires_at = datetime('now', '-1 hour') WHERE token_hash = ?").run(tokenHash);

      const res = await rawAgent()
        .get('/api/areas')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401);
    });
  });

  describe('Bearer token behavior', () => {
    it('bearer token sets req.userId correctly', async () => {
      const { makeArea } = require('./helpers');
      makeArea({ name: 'User1 Area' });

      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Verify User' });
      const token = createRes.body.token;

      // Bearer token should see user1's areas
      const res = await rawAgent()
        .get('/api/areas')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.some(a => a.name === 'User1 Area'));
    });

    it('bearer token updates last_used_at on use', async () => {
      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Track Usage' });
      const token = createRes.body.token;
      const tokenId = createRes.body.id;

      // Use the token
      await rawAgent().get('/api/areas').set('Authorization', `Bearer ${token}`);

      // Check last_used_at is set
      const row = db.prepare('SELECT last_used_at FROM api_tokens WHERE id=?').get(tokenId);
      assert.ok(row.last_used_at, 'last_used_at should be set after use');
    });

    it('token works for POST/PUT/DELETE, not just GET', async () => {
      const { makeArea, makeGoal } = require('./helpers');
      const area = makeArea();
      const goal = makeGoal(area.id);

      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Full Access' });
      const token = createRes.body.token;

      // POST via bearer token
      const postRes = await rawAgent()
        .post(`/api/goals/${goal.id}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Token Task' });
      assert.equal(postRes.status, 201);

      // PUT via bearer token
      const putRes = await rawAgent()
        .put(`/api/tasks/${postRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Token Task' });
      assert.equal(putRes.status, 200);

      // DELETE via bearer token
      const delRes = await rawAgent()
        .delete(`/api/tasks/${postRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      assert.ok([200, 204].includes(delRes.status), 'delete should succeed');
    });

    it('delete token → subsequent bearer auth fails', async () => {
      const createRes = await agent().post('/api/auth/tokens').send({ name: 'Revokable' });
      const token = createRes.body.token;
      const tokenId = createRes.body.id;

      // Works before deletion
      const before = await rawAgent().get('/api/areas').set('Authorization', `Bearer ${token}`);
      assert.equal(before.status, 200);

      // Delete
      await agent().delete(`/api/auth/tokens/${tokenId}`);

      // Fails after deletion
      const after = await rawAgent().get('/api/areas').set('Authorization', `Bearer ${token}`);
      assert.equal(after.status, 401);
    });
  });
});
