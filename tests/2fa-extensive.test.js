const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');
const crypto = require('crypto');

let db;

// Reimplement generateTOTP for test verification (same algorithm as server)
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

describe('2FA — Extensive Tests', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('GET /api/auth/2fa/status when not enabled → { enabled: false }', async () => {
    const res = await agent().get('/api/auth/2fa/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);
  });

  it('POST /api/auth/2fa/setup → returns secret + otpauth URI', async () => {
    const res = await agent().post('/api/auth/2fa/setup');
    assert.equal(res.status, 200);
    assert.ok(res.body.secret, 'should return base32 secret');
    assert.ok(res.body.otpauth_uri, 'should return otpauth URI');
    assert.ok(res.body.otpauth_uri.startsWith('otpauth://totp/'));
  });

  it('POST /api/auth/2fa/verify with correct token → enables 2FA', async () => {
    const setupRes = await agent().post('/api/auth/2fa/setup');
    const secret = setupRes.body.secret;
    const token = generateTOTP(secret);

    const res = await agent().post('/api/auth/2fa/verify').send({ token });
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);

    // Verify status is now enabled
    const status = await agent().get('/api/auth/2fa/status');
    assert.equal(status.body.enabled, true);
  });

  it('POST /api/auth/2fa/verify with wrong token → 400', async () => {
    await agent().post('/api/auth/2fa/setup');
    const res = await agent().post('/api/auth/2fa/verify').send({ token: '000000' });
    assert.equal(res.status, 400);
  });

  it('POST /api/auth/2fa/verify when not in setup state → 400', async () => {
    const res = await agent().post('/api/auth/2fa/verify').send({ token: '123456' });
    assert.equal(res.status, 400);
  });

  it('login with 2FA enabled but no token → 403 "2FA required"', async () => {
    // Setup and enable 2FA
    const setupRes = await agent().post('/api/auth/2fa/setup');
    const secret = setupRes.body.secret;
    await agent().post('/api/auth/2fa/verify').send({ token: generateTOTP(secret) });

    // Try to login without 2FA token
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword'
    });
    assert.equal(res.status, 403);
    assert.ok(res.body.requires_2fa);
  });

  it('login with 2FA enabled and correct token → success', async () => {
    const setupRes = await agent().post('/api/auth/2fa/setup');
    const secret = setupRes.body.secret;
    await agent().post('/api/auth/2fa/verify').send({ token: generateTOTP(secret) });

    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword',
      totp_token: generateTOTP(secret)
    });
    assert.equal(res.status, 200);
  });

  it('login with 2FA enabled and wrong token → 401', async () => {
    const setupRes = await agent().post('/api/auth/2fa/setup');
    const secret = setupRes.body.secret;
    await agent().post('/api/auth/2fa/verify').send({ token: generateTOTP(secret) });

    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword',
      totp_token: '000000'
    });
    assert.equal(res.status, 401);
  });

  it('DELETE /api/auth/2fa → disables, login works without token', async () => {
    const setupRes = await agent().post('/api/auth/2fa/setup');
    const secret = setupRes.body.secret;
    await agent().post('/api/auth/2fa/verify').send({ token: generateTOTP(secret) });

    // Disable 2FA
    await agent().delete('/api/auth/2fa').send({ password: 'testpassword' });

    // Login without token should work again
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'admin@localhost', password: 'testpassword'
    });
    assert.equal(res.status, 200);
  });

  it('2FA time drift: token from adjacent time step → accepted (±1)', async () => {
    const setupRes = await agent().post('/api/auth/2fa/setup');
    const secret = setupRes.body.secret;
    // Use the previous time step's token
    const prevToken = generateTOTP(secret, 30, -1);
    const res = await agent().post('/api/auth/2fa/verify').send({ token: prevToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
  });
});
