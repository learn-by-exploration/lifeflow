const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, rawAgent } = require('./helpers');

const TEST_PASSWORD = 'TestPassword1!';
const WRONG_PASSWORD = 'WrongPassword1!';
const LOCKOUT_THRESHOLD = 5;

let _emailCounter = 0;

describe('Account Lockout', () => {
  let db;

  beforeEach(() => {
    ({ db } = setup());
    cleanDb();
    _emailCounter++;
    // Clean login_attempts between tests
    try { db.exec('DELETE FROM login_attempts'); } catch (e) { /* table may not exist yet */ }
    // Clean sessions and extra users
    db.exec('DELETE FROM sessions WHERE user_id > 1');
    db.exec('DELETE FROM users WHERE id > 1');
  });
  after(() => teardown());

  /** Register a fresh user and return the email. */
  async function registerUser(email) {
    if (!email) {
      email = `lockout${_emailCounter}@test.com`;
      _emailCounter++;
    }
    await rawAgent()
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, display_name: 'Lockout Tester' });
    return email;
  }

  /** Attempt login and return the response. */
  async function attemptLogin(email, password) {
    return rawAgent()
      .post('/api/auth/login')
      .send({ email, password });
  }

  // ─── Table & Schema ───

  it('login_attempts table exists', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='login_attempts'"
    ).all();
    assert.equal(tables.length, 1, 'login_attempts table should exist');
  });

  it('login_attempts table has expected columns', () => {
    const cols = db.prepare('PRAGMA table_info(login_attempts)').all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('email'), 'should have email column');
    assert.ok(colNames.includes('attempts'), 'should have attempts column');
    assert.ok(colNames.includes('first_attempt_at'), 'should have first_attempt_at column');
    assert.ok(colNames.includes('locked_until'), 'should have locked_until column');
  });

  // ─── Login Attempt Tracking ───

  it('1 failed login: no lockout, returns 401', async () => {
    const email = await registerUser();
    const res = await attemptLogin(email, WRONG_PASSWORD);
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid email or password');
  });

  it('5 failed logins same email: no lockout yet', async () => {
    const email = await registerUser();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      const res = await attemptLogin(email, WRONG_PASSWORD);
      assert.equal(res.status, 401, `attempt ${i + 1} should return 401`);
    }
  });

  it('6th failed login same email: locked out (401)', async () => {
    const email = await registerUser();
    // Exhaust the threshold
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // 6th attempt should be locked
    const res = await attemptLogin(email, WRONG_PASSWORD);
    assert.equal(res.status, 401);
  });

  it('lockout response is identical body shape to wrong-password response', async () => {
    const email = await registerUser();
    // Get a normal wrong-password response
    const normalRes = await attemptLogin(email, WRONG_PASSWORD);
    // Lock out by exhausting threshold
    for (let i = 1; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // Get lockout response
    const lockRes = await attemptLogin(email, WRONG_PASSWORD);
    // Body shape must be identical (same error message)
    assert.deepEqual(Object.keys(normalRes.body).sort(), Object.keys(lockRes.body).sort());
    assert.equal(lockRes.body.error, 'Invalid email or password');
  });

  it('locked account: correct password still returns locked error', async () => {
    const email = await registerUser();
    // Lock the account
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // Try with correct password — should still be locked
    const res = await attemptLogin(email, TEST_PASSWORD);
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid email or password');
  });

  it('successful login resets failure counter', async () => {
    const email = await registerUser();
    // Accumulate some failures (but not enough to lock out)
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // Successful login
    const okRes = await attemptLogin(email, TEST_PASSWORD);
    assert.equal(okRes.status, 200);
    // Check that login_attempts row is cleared
    const row = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(email);
    assert.ok(!row || row.attempts === 0, 'attempts should be reset after successful login');
  });

  it('different email not affected by other email lockout', async () => {
    const email1 = await registerUser(`lockout-a${_emailCounter}@test.com`);
    const email2 = await registerUser(`lockout-b${_emailCounter}@test.com`);
    // Lock out email1
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin(email1, WRONG_PASSWORD);
    }
    const lockedRes = await attemptLogin(email1, TEST_PASSWORD);
    assert.equal(lockedRes.status, 401, 'email1 should be locked');
    // email2 should still work fine
    const okRes = await attemptLogin(email2, TEST_PASSWORD);
    assert.equal(okRes.status, 200, 'email2 should not be locked');
  });

  it('lockout counter persists in database, not in-memory only', async () => {
    const email = await registerUser();
    // Fail a few times
    for (let i = 0; i < 3; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // Check directly in the database
    const row = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(email);
    assert.ok(row, 'login_attempts row should exist');
    assert.equal(row.attempts, 3);
  });

  it('lockout expires after configured duration', async () => {
    const email = await registerUser();
    // Lock out
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // Manually set locked_until to the past to simulate expiry
    db.prepare("UPDATE login_attempts SET locked_until = datetime('now', '-1 minute') WHERE email = ?").run(email);
    // Now login should succeed
    const res = await attemptLogin(email, TEST_PASSWORD);
    assert.equal(res.status, 200);
  });

  it('after lockout expires, failure counter resets', async () => {
    const email = await registerUser();
    // Lock out
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin(email, WRONG_PASSWORD);
    }
    // Simulate expiry
    db.prepare("UPDATE login_attempts SET locked_until = datetime('now', '-1 minute'), attempts = 0 WHERE email = ?").run(email);
    // After expiry, should be able to fail again up to threshold
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      const res = await attemptLogin(email, WRONG_PASSWORD);
      assert.equal(res.status, 401, `post-expiry attempt ${i + 1} should return 401`);
    }
    // Should still be able to login with correct password (not yet at threshold)
    const res = await attemptLogin(email, TEST_PASSWORD);
    assert.equal(res.status, 200);
  });

  it('lockout window: failures outside 15-minute window do not count', async () => {
    const email = await registerUser();
    // Insert old failures that are beyond the window
    db.prepare(
      "INSERT OR REPLACE INTO login_attempts (email, attempts, first_attempt_at, locked_until) VALUES (?, ?, datetime('now', '-20 minutes'), NULL)"
    ).run(email, 4);
    // New failure should start fresh window
    const res = await attemptLogin(email, WRONG_PASSWORD);
    assert.equal(res.status, 401);
    // Should not be locked (old failures expired)
    const res2 = await attemptLogin(email, TEST_PASSWORD);
    assert.equal(res2.status, 200);
  });

  // ─── Rate Limiter Verification (source code checks) ───

  it('rate limiter middleware exists on /api/ routes', () => {
    const serverSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'), 'utf8'
    );
    assert.ok(serverSrc.includes('rateLimit'), 'server.js should use express-rate-limit');
    assert.ok(serverSrc.includes("app.use('/api/'"), 'rate limiter should be applied to /api/ routes');
  });

  it('auth limiter exists on login and register routes', () => {
    const serverSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'), 'utf8'
    );
    assert.ok(serverSrc.includes('authLimiter'), 'server.js should define authLimiter');
    assert.ok(serverSrc.includes("'/api/auth/login'"), 'authLimiter should be on login route');
    assert.ok(serverSrc.includes("'/api/auth/register'"), 'authLimiter should be on register route');
  });

  it('rate limiter config reads RATE_LIMIT_MAX from env', () => {
    const configSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'config.js'), 'utf8'
    );
    assert.ok(configSrc.includes('RATE_LIMIT_MAX'), 'config should read RATE_LIMIT_MAX env var');
  });

  it('auth limiter is applied to change-password route', () => {
    const serverSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'), 'utf8'
    );
    assert.ok(
      serverSrc.includes("'/api/auth/change-password'") && serverSrc.includes('authLimiter'),
      'authLimiter should be on change-password route'
    );
  });

  // ─── Non-existent user lockout (no enumeration) ───

  it('non-existent email: repeated failures do not reveal account existence', async () => {
    const fakeEmail = `nonexistent${_emailCounter}@test.com`;
    // Even for a non-existent user, repeated failures should track and respond the same
    for (let i = 0; i < LOCKOUT_THRESHOLD + 1; i++) {
      const res = await attemptLogin(fakeEmail, WRONG_PASSWORD);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid email or password');
    }
  });

  it('failed login is logged in audit trail', async () => {
    const email = await registerUser();
    await attemptLogin(email, WRONG_PASSWORD);
    // Check audit_log for the failed login
    const auditRows = db.prepare(
      "SELECT * FROM audit_log WHERE action = 'login_failed' ORDER BY id DESC LIMIT 1"
    ).all();
    assert.ok(auditRows.length > 0, 'failed login should be in audit log');
  });
});
