const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { setup, cleanDb, teardown, agent, rawAgent, makeUser2 } = require('./helpers');

// TOTP generator matching server implementation
function generateTOTP(base32Secret, timeStep = 30, counterOffset = 0) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const c of base32Secret.toUpperCase()) {
    const idx = base32Chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xFF); bits -= 8; }
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / timeStep) + counterOffset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xFFFFFFFF, 4);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xF;
  const otp = ((hmac[offset] & 0x7F) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
  return otp.toString().padStart(6, '0');
}

// Helper: enable 2FA for default test user and return secret
async function enable2FA() {
  const setupRes = await agent().post('/api/auth/2fa/setup');
  const secret = setupRes.body.secret;
  const token = generateTOTP(secret);
  await agent().post('/api/auth/2fa/verify').send({ token });
  return secret;
}

describe('2FA Security Hardening', () => {
  before(() => { setup(); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Status endpoint safety ───

  it('GET /api/auth/2fa/status returns enabled:false when 2FA not set up', async () => {
    const res = await agent().get('/api/auth/2fa/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);
    // Must NOT contain secret
    assert.equal(res.body.secret, undefined);
    assert.equal(res.body.totp_secret, undefined);
  });

  it('GET /api/auth/2fa/status returns enabled:true after enabling, no secret leaked', async () => {
    await enable2FA();
    const res = await agent().get('/api/auth/2fa/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    // Secret must NEVER be returned in status
    assert.equal(res.body.secret, undefined);
    assert.equal(res.body.totp_secret, undefined);
  });

  // ─── Secret not exposed in GET endpoints ───

  it('2FA secret not exposed in GET /api/auth/me', async () => {
    await enable2FA();
    const res = await agent().get('/api/auth/me');
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('totp_secret'), 'totp_secret must not appear in /me response');
    assert.ok(!body.includes('totp_pending'), 'totp_pending must not appear in /me response');
  });

  it('2FA secret not exposed in GET /api/users', async () => {
    await enable2FA();
    const res = await agent().get('/api/users');
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('totp_secret'), 'totp_secret must not appear in /users');
  });

  // ─── Disable 2FA requires password ───

  it('DELETE /api/auth/2fa without password → 400', async () => {
    await enable2FA();
    const res = await agent().delete('/api/auth/2fa');
    assert.equal(res.status, 400);
    // 2FA should still be enabled
    const status = await agent().get('/api/auth/2fa/status');
    assert.equal(status.body.enabled, true);
  });

  it('DELETE /api/auth/2fa with wrong password → 401', async () => {
    await enable2FA();
    const res = await agent().delete('/api/auth/2fa').send({ password: 'wrongpassword123!' });
    assert.equal(res.status, 401);
    // 2FA should still be enabled
    const status = await agent().get('/api/auth/2fa/status');
    assert.equal(status.body.enabled, true);
  });

  it('DELETE /api/auth/2fa with correct password → disables 2FA', async () => {
    await enable2FA();
    const res = await agent().delete('/api/auth/2fa').send({ password: 'testpassword' });
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);
    // Verify it's actually disabled
    const status = await agent().get('/api/auth/2fa/status');
    assert.equal(status.body.enabled, false);
  });

  // ─── Source code: constant-time comparison ───

  it('2FA token comparison uses timingSafeEqual (source code check)', () => {
    const authSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8'
    );
    // The login 2FA check and 2FA verify endpoint should use constant-time comparison
    // Look for timingSafeEqual or a safe comparison helper
    assert.ok(
      authSrc.includes('timingSafeEqual'),
      'auth.js must use crypto.timingSafeEqual for TOTP comparison (timing attack prevention)'
    );
    // Should NOT use direct !== for token comparison
    // Find the 2FA verification sections and ensure they don't use plain string comparison
    const verifySection = authSrc.substring(
      authSrc.indexOf('// Verify TOTP'),
      authSrc.indexOf('// Enable 2FA')
    );
    assert.ok(
      !verifySection.includes("token !== currentToken"),
      '2FA verify must not use !== for token comparison'
    );
  });

  it('disable 2FA endpoint requires password (source code check)', () => {
    const authSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8'
    );
    // Find the DELETE /api/auth/2fa handler
    const deleteIndex = authSrc.indexOf("router.delete('/api/auth/2fa'");
    assert.ok(deleteIndex > 0, 'DELETE /api/auth/2fa route must exist');
    // The handler section should include password verification
    const handlerSection = authSrc.substring(deleteIndex, deleteIndex + 600);
    assert.ok(
      handlerSection.includes('password') && handlerSection.includes('bcrypt'),
      'DELETE /api/auth/2fa must verify current password before disabling'
    );
  });

  // ─── API token auth bypasses 2FA ───

  it('API token auth bypasses 2FA (pre-authenticated)', async () => {
    await enable2FA();

    // Create an API token
    const tokenRes = await agent().post('/api/auth/tokens').send({ name: '2fa-test-token' });
    assert.equal(tokenRes.status, 201);
    const apiToken = tokenRes.body.token;

    // Use the API token to access a protected endpoint — should work without TOTP
    const { app } = setup();
    const request = require('supertest');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${apiToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
  });

  // ─── Login with 2FA ───

  it('login with 2FA enabled but no TOTP → 403 requires_2fa', async () => {
    await enable2FA();
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword'
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.requires_2fa, true);
    assert.ok(res.body.error.includes('2FA'));
  });

  it('login with 2FA enabled and correct TOTP → success', async () => {
    const secret = await enable2FA();
    const token = generateTOTP(secret);
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword',
      totp_token: token
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
  });

  it('login with 2FA enabled and wrong TOTP → 401', async () => {
    await enable2FA();
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword',
      totp_token: '000000'
    });
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  // ─── Cross-user isolation ───

  it('2FA setting for one user does not affect another', async () => {
    // Enable 2FA for default user
    await enable2FA();

    // User 2 should NOT have 2FA enabled
    const u2 = makeUser2();
    const status = await u2.agent.get('/api/auth/2fa/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.enabled, false);
  });

  // ─── 2FA verify input validation ───

  it('2FA verify rejects non-6-digit tokens', async () => {
    await agent().post('/api/auth/2fa/setup');

    // Too short
    let res = await agent().post('/api/auth/2fa/verify').send({ token: '123' });
    assert.equal(res.status, 400);

    // Too long
    res = await agent().post('/api/auth/2fa/verify').send({ token: '1234567' });
    assert.equal(res.status, 400);

    // Non-numeric
    res = await agent().post('/api/auth/2fa/verify').send({ token: 'abcdef' });
    assert.equal(res.status, 400);

    // Empty
    res = await agent().post('/api/auth/2fa/verify').send({ token: '' });
    assert.equal(res.status, 400);

    // Missing
    res = await agent().post('/api/auth/2fa/verify').send({});
    assert.equal(res.status, 400);
  });

  // ─── Setup requires auth ───

  it('2FA endpoints require authentication', async () => {
    const r1 = await rawAgent().post('/api/auth/2fa/setup');
    assert.equal(r1.status, 401);

    const r2 = await rawAgent().post('/api/auth/2fa/verify').send({ token: '123456' });
    assert.equal(r2.status, 401);

    const r3 = await rawAgent().delete('/api/auth/2fa');
    assert.equal(r3.status, 401);

    const r4 = await rawAgent().get('/api/auth/2fa/status');
    assert.equal(r4.status, 401);
  });
});
