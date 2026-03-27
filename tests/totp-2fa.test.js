const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

// Re-implement generateTOTP for test usage (same as server)
function generateTOTP(base32Secret, timeStep = 30, counterOffset = 0) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const c of base32Secret.toUpperCase()) {
    const idx = base32Chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
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

// Helper: enable 2FA for the test user (setup + verify with valid token)
async function enable2FA(ag, db) {
  const setupRes = await ag.post('/api/auth/2fa/setup').send({});
  const secret = setupRes.body.secret;
  const validToken = generateTOTP(secret);
  await ag.post('/api/auth/2fa/verify').send({ token: validToken });
  return secret;
}

// Helper: get the test user's email from the DB
function getTestEmail(db) {
  return db.prepare('SELECT email FROM users WHERE id = 1').get().email;
}

describe('TOTP 2FA', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('POST /api/auth/2fa/setup generates TOTP secret and QR URI', async () => {
    const res = await agent().post('/api/auth/2fa/setup').send({});
    assert.equal(res.status, 200);
    assert.ok(res.body.secret, 'Should return a secret');
    assert.ok(res.body.otpauth_uri, 'Should return otpauth URI');
    assert.ok(res.body.otpauth_uri.startsWith('otpauth://totp/'));
  });

  it('POST /api/auth/2fa/verify rejects invalid token', async () => {
    await agent().post('/api/auth/2fa/setup').send({});
    const res = await agent().post('/api/auth/2fa/verify').send({ token: '000000' });
    assert.equal(res.status, 400);
  });

  it('POST /api/auth/2fa/verify accepts valid token', async () => {
    const setupRes = await agent().post('/api/auth/2fa/setup').send({});
    const secret = setupRes.body.secret;
    const validToken = generateTOTP(secret);
    const res = await agent().post('/api/auth/2fa/verify').send({ token: validToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
  });

  it('DELETE /api/auth/2fa disables 2FA', async () => {
    await agent().post('/api/auth/2fa/setup').send({});
    const res = await agent().delete('/api/auth/2fa');
    assert.equal(res.status, 200);
  });

  it('GET /api/auth/2fa/status shows 2FA state', async () => {
    const res = await agent().get('/api/auth/2fa/status');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.enabled, 'boolean');
  });

  // ─── 2FA Login Enforcement ───

  it('login without totp_token when 2FA enabled → 403 requires_2fa', async () => {
    const secret = await enable2FA(agent(), db);
    const res = await rawAgent().post('/api/auth/login')
      .send({ email: getTestEmail(db), password: 'testpassword' });
    assert.equal(res.status, 403);
    assert.equal(res.body.requires_2fa, true);
  });

  it('login with valid totp_token when 2FA enabled → 200', async () => {
    const secret = await enable2FA(agent(), db);
    const token = generateTOTP(secret);
    const res = await rawAgent().post('/api/auth/login')
      .send({ email: getTestEmail(db), password: 'testpassword', totp_token: token });
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
  });

  it('login with invalid totp_token when 2FA enabled → 401', async () => {
    const secret = await enable2FA(agent(), db);
    const res = await rawAgent().post('/api/auth/login')
      .send({ email: getTestEmail(db), password: 'testpassword', totp_token: '000000' });
    assert.equal(res.status, 401);
  });

  it('login without 2FA enabled → 200 (no totp_token needed)', async () => {
    const res = await rawAgent().post('/api/auth/login')
      .send({ email: getTestEmail(db), password: 'testpassword' });
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
  });

  it('enable 2FA → disable 2FA → login without totp_token → 200', async () => {
    await enable2FA(agent(), db);
    await agent().delete('/api/auth/2fa');
    const res = await rawAgent().post('/api/auth/login')
      .send({ email: getTestEmail(db), password: 'testpassword' });
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
  });

  it('adjacent time-step (±1) token is accepted', async () => {
    const secret = await enable2FA(agent(), db);
    // Use the previous time step token (should be accepted with ±1 tolerance)
    const prevToken = generateTOTP(secret, 30, -1);
    const res = await rawAgent().post('/api/auth/login')
      .send({ email: getTestEmail(db), password: 'testpassword', totp_token: prevToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.user);
  });
});
