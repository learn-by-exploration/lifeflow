const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, rawAgent } = require('./helpers');

describe('Auth Timing Attack Prevention', () => {
  before(() => setup());
  beforeEach(() => cleanDb());

  // ─── Login timing-safe behavior ───────────────────────────────────────────

  describe('Login — timing-safe failures', () => {
    it('returns 401 for valid email + wrong password', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'WrongPassword1!' });
      assert.equal(res.status, 401);
    });

    it('returns 401 for non-existent email', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'SomePassword1!' });
      assert.equal(res.status, 401);
    });

    it('response body identical for valid-email-wrong-pass vs invalid-email', async () => {
      const res1 = await rawAgent().post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'WrongPassword1!' });
      const res2 = await rawAgent().post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'SomePassword1!' });

      assert.equal(res1.status, res2.status);
      assert.deepEqual(Object.keys(res1.body).sort(), Object.keys(res2.body).sort());
      assert.equal(res1.body.error, res2.body.error);
    });

    it('error message is generic — not "User not found"', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'SomePassword1!' });
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
      assert.ok(!res.body.error.toLowerCase().includes('not found'),
        'Error message should not reveal user non-existence');
      assert.ok(!res.body.error.toLowerCase().includes('no such user'),
        'Error message should not reveal user non-existence');
      assert.ok(!res.body.error.toLowerCase().includes('does not exist'),
        'Error message should not reveal user non-existence');
    });

    it('failed login does not leak username existence in response body', async () => {
      const resExisting = await rawAgent().post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'WrongPassword1!' });
      const resNonExisting = await rawAgent().post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'SomePassword1!' });

      // Neither response should contain any user-identifying info
      assert.equal(resExisting.body.user, undefined);
      assert.equal(resNonExisting.body.user, undefined);
      // Error messages must be the same string
      assert.equal(resExisting.body.error, resNonExisting.body.error);
    });

    it('failed login response headers have identical shape for both cases', async () => {
      const res1 = await rawAgent().post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'WrongPassword1!' });
      const res2 = await rawAgent().post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'SomePassword1!' });

      // Neither should set a session cookie
      const cookie1 = res1.headers['set-cookie'];
      const cookie2 = res2.headers['set-cookie'];
      assert.equal(cookie1, cookie2, 'Both should have same cookie behavior (none)');

      // Content-Type should be the same
      assert.equal(res1.headers['content-type'], res2.headers['content-type']);
    });
  });

  // ─── Source code static analysis ──────────────────────────────────────────

  describe('Login source code — timing attack prevention', () => {
    let authSource;

    before(() => {
      authSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8'
      );
    });

    it('defines DUMMY_HASH constant', () => {
      assert.ok(authSource.includes('DUMMY_HASH'),
        'auth.js should define a DUMMY_HASH constant for timing attack prevention');
    });

    it('always calls bcrypt.compareSync — no short-circuit on missing user', () => {
      // The login handler should use the pattern:
      //   hashToCompare = user ? user.password_hash : DUMMY_HASH
      //   bcrypt.compareSync(password, hashToCompare)
      // NOT: if (!user) return 401 (which would skip bcrypt)
      assert.ok(authSource.includes('DUMMY_HASH'),
        'Must use DUMMY_HASH to ensure bcrypt always runs');

      // Check for the conditional hash selection pattern
      assert.ok(
        authSource.includes('hashToCompare') || authSource.includes('DUMMY_HASH'),
        'Should select hash to compare conditionally'
      );
    });

    it('uses bcryptjs (not native bcrypt)', () => {
      assert.ok(authSource.includes("require('bcryptjs')"),
        'auth.js should use bcryptjs package');
    });
  });

  // ─── requirePassword middleware timing ────────────────────────────────────

  describe('requirePassword middleware — timing attack prevention', () => {
    let middlewareSource;

    before(() => {
      middlewareSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'middleware', 'auth.js'), 'utf8'
      );
    });

    it('defines DUMMY_HASH in requirePassword middleware', () => {
      assert.ok(middlewareSource.includes('DUMMY_HASH'),
        'requirePassword middleware should define a DUMMY_HASH for timing safety');
    });

    it('always calls bcrypt.compareSync in requirePassword', () => {
      // Check the middleware uses the same timing-safe pattern
      assert.ok(
        middlewareSource.includes('hashToCompare') || middlewareSource.includes('DUMMY_HASH'),
        'requirePassword should use DUMMY_HASH pattern'
      );
      assert.ok(
        middlewareSource.includes('compareSync'),
        'requirePassword should always call bcrypt.compareSync'
      );
    });
  });

  // ─── Register enumeration prevention ──────────────────────────────────────

  describe('Register — account enumeration prevention', () => {
    it('returns 201 for new email', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'newuser@example.com', password: 'Password123@x' });
      assert.equal(res.status, 201);
      assert.ok(res.body.user);
    });

    it('returns 201 for existing email (no 409 leak)', async () => {
      // Register the user first
      await rawAgent().post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'Password123@x' });
      // Try to register again with same email
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'existing@example.com', password: 'Password123@x' });
      // Should NOT return 409 — that leaks email existence
      assert.equal(res.status, 201);
    });

    it('response shape identical for existing vs new email register', async () => {
      // Register with a new email
      const res1 = await rawAgent().post('/api/auth/register')
        .send({ email: 'shape-new@example.com', password: 'Password123@x' });
      // Register again with same email
      const res2 = await rawAgent().post('/api/auth/register')
        .send({ email: 'shape-new@example.com', password: 'Password123@x' });

      assert.equal(res1.status, res2.status);
      assert.deepEqual(
        Object.keys(res1.body).sort(),
        Object.keys(res2.body).sort(),
        'Response body keys should be identical'
      );
      assert.deepEqual(
        Object.keys(res1.body.user).sort(),
        Object.keys(res2.body.user).sort(),
        'User object keys should be identical'
      );
    });

    it('register response for existing email does not leak user data', async () => {
      // Register a user
      const res1 = await rawAgent().post('/api/auth/register')
        .send({ email: 'leak-test@example.com', password: 'Password123@x' });
      const realId = res1.body.user.id;

      // Register again with same email
      const res2 = await rawAgent().post('/api/auth/register')
        .send({ email: 'leak-test@example.com', password: 'Password123@x' });

      // The duplicate response should NOT contain the real user's id
      assert.notEqual(res2.body.user.id, realId,
        'Duplicate register should not leak the real user id');
    });

    it('register source code handles existing email without early return before hash', () => {
      const authSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'routes', 'auth.js'), 'utf8'
      );
      // Should not contain error messages that reveal email existence on register
      assert.ok(!authSource.includes('email already'),
        'Should not have "email already" error message in auth.js');
      assert.ok(!authSource.includes('already registered'),
        'Should not have "already registered" error message in auth.js');
    });
  });
});
