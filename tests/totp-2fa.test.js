const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

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
});
