'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, rawAgent } = require('./helpers');

const STRONG_PW = 'Str0ng!Pass#99';

describe('Password Policy & Strength', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    const { db } = setup();
    db.exec("DELETE FROM sessions WHERE user_id != 1");
    db.exec("DELETE FROM users WHERE id != 1");
  });

  // ─── Registration password validation ───

  it('rejects register with 7-char password (400)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'short7@example.com', password: 'Aa1!xyz' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('rejects register with 11-char password (400, need 12+)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'short11@example.com', password: 'Aa1!xyzabcd' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('12'));
  });

  it('rejects register with 12 chars all lowercase (need complexity)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'lower@example.com', password: 'abcdefghijkl' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('accepts register with 12 chars + upper + number + special (201)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'strong@example.com', password: STRONG_PW });
    assert.equal(res.status, 201);
    assert.ok(res.body.user);
  });

  it('rejects register with common password "Password123!" (400)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'common1@example.com', password: 'Password123!' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('common'));
  });

  it('rejects register with common password "Qwerty12345!" (400)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'common2@example.com', password: 'Qwerty12345!' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('common'));
  });

  // ─── Change password validation ───

  it('rejects change-password to weak password (400)', async () => {
    const regRes = await rawAgent().post('/api/auth/register')
      .send({ email: 'chgweak@example.com', password: STRONG_PW });
    const cookie = String(regRes.headers['set-cookie']).match(/lf_sid=([^;]+)/)[1];

    const res = await rawAgent().post('/api/auth/change-password')
      .set('Cookie', `lf_sid=${cookie}`)
      .send({ current_password: STRONG_PW, new_password: 'short' });
    assert.equal(res.status, 400);
  });

  it('accepts change-password to strong password (200)', async () => {
    const regRes = await rawAgent().post('/api/auth/register')
      .send({ email: 'chgstrong@example.com', password: STRONG_PW });
    const cookie = String(regRes.headers['set-cookie']).match(/lf_sid=([^;]+)/)[1];

    const res = await rawAgent().post('/api/auth/change-password')
      .set('Cookie', `lf_sid=${cookie}`)
      .send({ current_password: STRONG_PW, new_password: 'NewStr0ng!Pass#1' });
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
  });

  // ─── Error message quality ───

  it('error message explains password requirements', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'msg@example.com', password: 'abc' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('12'), 'should mention minimum length');
  });

  // ─── Max length ───

  it('rejects password longer than 128 chars (400)', async () => {
    const longPw = 'Aa1!' + 'x'.repeat(126); // 130 chars
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'longpw@example.com', password: longPw });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('128'));
  });

  it('accepts password of exactly 128 chars', async () => {
    const pw128 = 'Aa1!' + 'x'.repeat(124); // exactly 128 chars
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'exact128@example.com', password: pw128 });
    assert.equal(res.status, 201);
  });

  // ─── Unicode ───

  it('accepts unicode passwords (international chars)', async () => {
    const res = await rawAgent().post('/api/auth/register')
      .send({ email: 'unicode@example.com', password: 'Ünïcödé!Pass1' });
    assert.equal(res.status, 201);
    assert.ok(res.body.user);
  });

  // ─── Unit tests for validatePassword ───

  it('validatePassword returns structured errors', () => {
    const { validatePassword } = require('../src/utils/password-policy');
    const result = validatePassword('abc');
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
  });

  it('validatePassword accepts valid password', () => {
    const { validatePassword } = require('../src/utils/password-policy');
    const result = validatePassword(STRONG_PW);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('validatePassword catches common passwords', () => {
    const { validatePassword } = require('../src/utils/password-policy');
    const result = validatePassword('Password123!');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.toLowerCase().includes('common')));
  });
});
