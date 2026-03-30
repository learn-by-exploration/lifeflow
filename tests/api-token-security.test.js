const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, cleanDb, teardown, agent, makeUser2 } = require('./helpers');

describe('API Token Security', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('create token returns token value once', async () => {
    const res = await agent().post('/api/auth/tokens').send({ name: 'test-token' });
    assert.equal(res.status, 201);
    assert.ok(res.body.token, 'should return token value');
    assert.ok(res.body.token.length >= 32, 'token should be at least 32 chars');
  });

  it('token stored as hash, not plaintext', async () => {
    const { db } = setup();
    const res = await agent().post('/api/auth/tokens').send({ name: 'hash-test' });
    const row = db.prepare('SELECT token_hash FROM api_tokens WHERE name = ?').get('hash-test');
    assert.ok(row, 'token row should exist');
    assert.notEqual(row.token_hash, res.body.token, 'stored hash should differ from raw token');
  });

  it('Bearer token auth: valid token grants access', async () => {
    const res = await agent().post('/api/auth/tokens').send({ name: 'bearer-test' });
    const token = res.body.token;
    const { app } = setup();
    const areas = await request(app).get('/api/areas').set('Authorization', `Bearer ${token}`);
    assert.equal(areas.status, 200);
  });

  it('Bearer token auth: invalid token returns 401', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/areas').set('Authorization', 'Bearer invalid-token-xxx');
    assert.equal(res.status, 401);
  });

  it('revoke token then subsequent use returns 401', async () => {
    const res = await agent().post('/api/auth/tokens').send({ name: 'revoke-test' });
    const token = res.body.token;
    const del = await agent().delete(`/api/auth/tokens/${res.body.id}`);
    assert.equal(del.status, 200);
    const { app } = setup();
    const afterRevoke = await request(app).get('/api/areas').set('Authorization', `Bearer ${token}`);
    assert.equal(afterRevoke.status, 401);
  });

  it('list tokens does not return token value or hash', async () => {
    await agent().post('/api/auth/tokens').send({ name: 'list-test' });
    const list = await agent().get('/api/auth/tokens');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body));
    for (const t of list.body) {
      assert.ok(!t.token, 'should not have token value');
      assert.ok(!t.token_hash, 'should not have token hash');
      assert.ok(t.name, 'should have name');
    }
  });

  it('source code hashes tokens with SHA-256', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8'
    );
    assert.ok(src.includes('sha256'), 'auth.js should use sha256 hashing for tokens');
  });

  it('token creation limited to 10 per user', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await agent().post('/api/auth/tokens').send({ name: `token-${i}` });
      assert.equal(r.status, 201, `token ${i} should succeed`);
    }
    const r11 = await agent().post('/api/auth/tokens').send({ name: 'token-11' });
    assert.equal(r11.status, 400, 'should reject 11th token');
  });

  it('cross-user token isolation: cannot use another users token to access their data', async () => {
    // User1 creates a token
    const res = await agent().post('/api/auth/tokens').send({ name: 'user1-token' });
    const token1 = res.body.token;

    // User2 creates an area
    const { agent: agent2 } = makeUser2();
    await agent2.post('/api/areas').send({ name: 'User2 Area', icon: '🏠', color: '#FF0000' });

    // Token1 should authenticate as user1, not see user2's area
    const { app } = setup();
    const areas = await request(app).get('/api/areas').set('Authorization', `Bearer ${token1}`);
    assert.equal(areas.status, 200);
    const user2Areas = areas.body.filter(a => a.name === 'User2 Area');
    assert.equal(user2Areas.length, 0, 'user1 token should not see user2 areas');
  });

  it('cannot delete another users token', async () => {
    const res = await agent().post('/api/auth/tokens').send({ name: 'owned-token' });
    const tokenId = res.body.id;

    const { agent: agent2 } = makeUser2();
    const del = await agent2.delete(`/api/auth/tokens/${tokenId}`);
    assert.equal(del.status, 404, 'should not find other users token');

    // Verify token still exists
    const list = await agent().get('/api/auth/tokens');
    assert.ok(list.body.some(t => t.id === tokenId), 'token should still exist');
  });

  it('expired token returns 401', async () => {
    const { db } = setup();
    const res = await agent().post('/api/auth/tokens').send({ name: 'expiry-test', expires_in_days: 1 });
    const token = res.body.token;

    // Manually set expires_at to the past
    db.prepare("UPDATE api_tokens SET expires_at = datetime('now', '-1 hour') WHERE name = ?")
      .run('expiry-test');

    const { app } = setup();
    const afterExpiry = await request(app).get('/api/areas').set('Authorization', `Bearer ${token}`);
    assert.equal(afterExpiry.status, 401, 'expired token should be rejected');
  });

  it('last_used_at updated on bearer auth', async () => {
    const { db } = setup();
    const res = await agent().post('/api/auth/tokens').send({ name: 'usage-track' });
    const token = res.body.token;

    // Before use, last_used_at should be null
    const before = db.prepare('SELECT last_used_at FROM api_tokens WHERE name = ?').get('usage-track');
    assert.equal(before.last_used_at, null, 'last_used_at should be null before use');

    // Use the token
    const { app } = setup();
    await request(app).get('/api/areas').set('Authorization', `Bearer ${token}`);

    const afterUse = db.prepare('SELECT last_used_at FROM api_tokens WHERE name = ?').get('usage-track');
    assert.ok(afterUse.last_used_at, 'last_used_at should be set after use');
  });

  it('token name required and validated', async () => {
    const r1 = await agent().post('/api/auth/tokens').send({});
    assert.equal(r1.status, 400);

    const r2 = await agent().post('/api/auth/tokens').send({ name: '' });
    assert.equal(r2.status, 400);

    const r3 = await agent().post('/api/auth/tokens').send({ name: '   ' });
    assert.equal(r3.status, 400);
  });
});
