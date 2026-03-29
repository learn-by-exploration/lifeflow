const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, rawAgent } = require('./helpers');

const TEST_PASSWORD = 'TestPassword1!';
const NEW_PASSWORD  = 'NewPassword42!x';
let _emailCounter = 0;

describe('Session Security', () => {
  let db; // eslint-disable-line no-unused-vars

  beforeEach(() => {
    ({ db } = setup());
    cleanDb();
    // Clean up sessions and users created by our tests (keep test user id=1)
    db.exec('DELETE FROM sessions WHERE user_id > 1');
    db.exec('DELETE FROM users WHERE id > 1');
  });
  after(() => teardown());

  /**
   * Extract the Set-Cookie header string from a supertest response.
   * supertest may return an array or a semicolon-joined string.
   */
  function extractSetCookie(res) {
    const raw = res.headers['set-cookie'];
    if (!raw) return '';
    if (Array.isArray(raw)) {
      // Find the lf_sid cookie among potentially multiple Set-Cookie headers
      return raw.find(c => c.includes('lf_sid')) || raw[0] || '';
    }
    return String(raw);
  }

  /**
   * Register a fresh user and return { userId, cookie, rawCookie, sid }.
   * `cookie` is just the "lf_sid=<value>" part for use with .set('Cookie', ...).
   * `rawCookie` is the full Set-Cookie header for flag inspection.
   */
  async function registerUser(email) {
    if (!email) {
      _emailCounter++;
      email = `session${_emailCounter}@test.com`;
    }
    const res = await rawAgent()
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, display_name: 'Session Tester' });
    const rawCookie = extractSetCookie(res);
    const sidMatch = rawCookie.match(/lf_sid=([^;]+)/);
    const sid = sidMatch ? sidMatch[1] : null;
    const cookie = sid ? `lf_sid=${sid}` : '';
    const userId = res.body.user?.id;
    return { userId, email, cookie, rawCookie, sid };
  }

  /**
   * Login a user and return { cookie, rawCookie, sid, body }.
   */
  async function loginUser(email = 'session@test.com', password = TEST_PASSWORD) {
    const res = await rawAgent()
      .post('/api/auth/login')
      .send({ email, password });
    const rawCookie = extractSetCookie(res);
    const sidMatch = rawCookie.match(/lf_sid=([^;]+)/);
    const sid = sidMatch ? sidMatch[1] : null;
    const cookie = sid ? `lf_sid=${sid}` : '';
    return { cookie, rawCookie, sid, body: res.body };
  }

  // ─── Cookie Security Flags ───────────────────────────────────────────────

  describe('Cookie security flags', () => {
    it('session cookie has HttpOnly flag', async () => {
      const { rawCookie } = await registerUser();
      assert.ok(rawCookie, 'Set-Cookie header should be present');
      assert.ok(/HttpOnly/i.test(rawCookie), 'Cookie should have HttpOnly flag');
    });

    it('session cookie has SameSite=Strict', async () => {
      const { rawCookie } = await registerUser();
      assert.ok(rawCookie, 'Set-Cookie header should be present');
      assert.ok(/SameSite=Strict/i.test(rawCookie), 'Cookie should have SameSite=Strict');
    });

    it('session cookie has Path=/', async () => {
      const { rawCookie } = await registerUser();
      assert.ok(rawCookie, 'Set-Cookie header should be present');
      assert.ok(/Path=\//i.test(rawCookie), 'Cookie should have Path=/');
    });

    it('login cookie has HttpOnly flag', async () => {
      const { email } = await registerUser();
      const { rawCookie } = await loginUser(email);
      assert.ok(rawCookie, 'Set-Cookie header should be present');
      assert.ok(/HttpOnly/i.test(rawCookie), 'Cookie should have HttpOnly flag');
    });

    it('login cookie has SameSite=Strict', async () => {
      const { email } = await registerUser();
      const { rawCookie } = await loginUser(email);
      assert.ok(rawCookie, 'Set-Cookie header should be present');
      assert.ok(/SameSite=Strict/i.test(rawCookie), 'Cookie should have SameSite=Strict');
    });

    it('login cookie has Path=/', async () => {
      const { email } = await registerUser();
      const { rawCookie } = await loginUser(email);
      assert.ok(rawCookie, 'Set-Cookie header should be present');
      assert.ok(/Path=\//i.test(rawCookie), 'Cookie should have Path=/');
    });
  });

  // ─── Cookie-based Sessions ───────────────────────────────────────────────

  describe('Cookie-based sessions', () => {
    it('cookie-based sessions work correctly', async () => {
      const { cookie, email } = await registerUser();
      // Use the cookie to access a protected endpoint
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.user);
      assert.equal(res.body.user.email, email);
    });

    it('request without session cookie returns 401', async () => {
      const res = await rawAgent().get('/api/auth/me');
      assert.equal(res.status, 401);
    });

    it('request with invalid session cookie returns 401', async () => {
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', 'lf_sid=nonexistent-session-id');
      assert.equal(res.status, 401);
    });
  });

  // ─── Multiple Concurrent Sessions ────────────────────────────────────────

  describe('Multiple concurrent sessions', () => {
    it('multiple concurrent sessions per user allowed', async () => {
      const { cookie: cookie1, email } = await registerUser();
      // Login again to get a second session
      const { cookie: cookie2 } = await loginUser(email);

      // Both sessions should work
      const res1 = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie1);
      assert.equal(res1.status, 200);

      const res2 = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie2);
      assert.equal(res2.status, 200);

      // Verify two distinct sessions exist in DB
      const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?')
        .all(res1.body.user.id);
      assert.ok(sessions.length >= 2, `Expected >=2 sessions, got ${sessions.length}`);
    });
  });

  // ─── Logout ──────────────────────────────────────────────────────────────

  describe('Logout', () => {
    it('logout invalidates only current session (not all)', async () => {
      const { cookie: cookie1, email } = await registerUser();
      const { cookie: cookie2 } = await loginUser(email);

      // Logout session 1
      const logoutRes = await rawAgent()
        .post('/api/auth/logout')
        .set('Cookie', cookie1);
      assert.equal(logoutRes.status, 200);

      // Session 1 should be invalid
      const res1 = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie1);
      assert.equal(res1.status, 401);

      // Session 2 should still work
      const res2 = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie2);
      assert.equal(res2.status, 200);
    });

    it('logout clears the session cookie', async () => {
      const { cookie } = await registerUser();
      const logoutRes = await rawAgent()
        .post('/api/auth/logout')
        .set('Cookie', cookie);
      const setCookie = logoutRes.headers['set-cookie']?.[0] || logoutRes.headers['set-cookie'] || '';
      assert.ok(/lf_sid=/.test(setCookie), 'Should clear lf_sid cookie');
      assert.ok(/Max-Age=0/i.test(setCookie), 'Should set Max-Age=0 to clear');
    });
  });

  // ─── Password Change Session Invalidation ────────────────────────────────

  describe('Password change session invalidation', () => {
    it('password change invalidates ALL sessions', async () => {
      // Register and create multiple sessions
      const { userId, email, cookie: cookie1 } = await registerUser();
      await loginUser(email); // second session

      // Verify we have >=2 sessions
      const beforeSessions = db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?')
        .get(userId);
      assert.ok(beforeSessions.cnt >= 2);

      // Change password using session 1
      const changeRes = await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', cookie1)
        .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });
      assert.equal(changeRes.status, 200);

      // ALL sessions for this user should be invalidated
      const afterSessions = db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?')
        .get(userId);
      assert.equal(afterSessions.cnt, 0, 'All sessions should be deleted after password change');
    });

    it('after password change: old session cookie returns 401', async () => {
      const { cookie } = await registerUser();

      // Change password
      await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

      // Old session cookie should no longer work
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie);
      assert.equal(res.status, 401, 'Old session should be invalid after password change');
    });

    it('after password change: other device sessions return 401', async () => {
      const { cookie: cookie1, email } = await registerUser();
      const { cookie: cookie2 } = await loginUser(email);

      // Change password from session 1
      await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', cookie1)
        .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

      // Session 2 (other device) should be invalid
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie2);
      assert.equal(res.status, 401, 'Other device session should be invalid');
    });

    it('new login after password change creates fresh session', async () => {
      const { email } = await registerUser();

      // Change password
      const { cookie: oldCookie } = await loginUser(email);
      await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', oldCookie)
        .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

      // Login with new password should work
      const { cookie: newCookie, body } = await loginUser(email, NEW_PASSWORD);
      assert.ok(newCookie, 'New login should set a cookie');
      assert.ok(body.user, 'New login should return user data');
      assert.equal(body.user.email, email);

      // New session should work for authenticated requests
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', newCookie);
      assert.equal(res.status, 200);
    });

    it('password change clears the cookie in response', async () => {
      const { cookie } = await registerUser();

      const res = await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

      // Should clear the session cookie
      const setCookie = res.headers['set-cookie']?.[0] || res.headers['set-cookie'] || '';
      assert.ok(/lf_sid=/.test(setCookie), 'Should set lf_sid cookie');
      assert.ok(/Max-Age=0/i.test(setCookie), 'Should clear cookie with Max-Age=0');
    });

    it('password change does not affect other users sessions', async () => {
      // Register user 1
      const { cookie: cookie1 } = await registerUser('user1@test.com');
      // Register user 2
      const { cookie: cookie2 } = await registerUser('user2@test.com');

      // Change user1's password
      await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', cookie1)
        .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

      // User 2's session should still work
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', cookie2);
      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, 'user2@test.com');
    });
  });

  // ─── Session Expiry ──────────────────────────────────────────────────────

  describe('Session expiry', () => {
    it('expired session returns 401', async () => {
      // Register via API to ensure user exists
      const { userId } = await registerUser();
      assert.ok(userId, 'User must be created');

      // Insert an expired session directly in DB
      const expiredSid = 'expired-session-' + Date.now();
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '-1 hour'))"
      ).run(expiredSid, userId);

      // Request with expired session
      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', `lf_sid=${expiredSid}`);
      assert.equal(res.status, 401);
    });

    it('non-expired session returns 200', async () => {
      // Register via API to ensure user exists
      const { userId } = await registerUser();
      assert.ok(userId, 'User must be created');

      // Insert a valid session
      const validSid = 'valid-session-' + Date.now();
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '+1 hour'))"
      ).run(validSid, userId);

      const res = await rawAgent()
        .get('/api/auth/me')
        .set('Cookie', `lf_sid=${validSid}`);
      assert.equal(res.status, 200);
    });
  });
});
