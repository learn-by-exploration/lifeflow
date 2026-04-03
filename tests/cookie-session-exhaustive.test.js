const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeUser2 } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

describe('Cookie & Session Security Exhaustive', () => {

  // Helper: register and login
  async function loginUser(opts = {}) {
    const email = opts.email || `session-test-${Date.now()}@test.com`;
    const password = opts.password || 'TestPass123!';
    // Register
    await rawAgent().post('/api/auth/register').send({ email, password, display_name: 'Sess Test' });
    // Login
    const res = await rawAgent().post('/api/auth/login').send({
      email, password, remember: opts.remember || false,
    });
    return { res, email, password };
  }

  describe('Cookie flags', () => {
    it('login cookie has HttpOnly flag', async () => {
      const { res } = await loginUser();
      const cookie = res.headers['set-cookie'];
      assert.ok(cookie, 'should set cookie');
      const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie;
      assert.ok(cookieStr.toLowerCase().includes('httponly'), 'should have HttpOnly');
    });

    it('login cookie has SameSite=Strict', async () => {
      const { res } = await loginUser();
      const cookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie;
      assert.ok(cookieStr.toLowerCase().includes('samesite=strict'), 'should have SameSite=Strict');
    });

    it('login cookie has Path=/', async () => {
      const { res } = await loginUser();
      const cookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie;
      assert.ok(cookieStr.includes('Path=/'), 'should have Path=/');
    });

    it('login cookie has Max-Age set', async () => {
      const { res } = await loginUser();
      const cookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie;
      assert.ok(cookieStr.includes('Max-Age='), 'should have Max-Age set');
    });

    it('remember-me extends cookie Max-Age', async () => {
      const { res: noRemember } = await loginUser({ email: `nr-${Date.now()}@test.com` });
      const { res: withRemember } = await loginUser({ email: `wr-${Date.now()}@test.com`, remember: true });
      const getCookieMaxAge = (r) => {
        const c = Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'].join('; ') : r.headers['set-cookie'] || '';
        const match = c.match(/Max-Age=(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      const shortTtl = getCookieMaxAge(noRemember);
      const longTtl = getCookieMaxAge(withRemember);
      assert.ok(longTtl > shortTtl, `remember TTL (${longTtl}) should be > default (${shortTtl})`);
    });
  });

  describe('Session lifecycle', () => {
    it('login creates session in sessions table', async () => {
      const { db } = setup();
      const email = `sl-${Date.now()}@test.com`;
      await rawAgent().post('/api/auth/register').send({ email, password: 'TestPass123!', display_name: 'SL' });
      const before = db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
      await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      const after_ = db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
      assert.ok(after_ > before, 'session count should increase after login');
    });

    it('logout deletes session from table', async () => {
      const { db } = setup();
      const { res } = await loginUser({ email: `lo-${Date.now()}@test.com` });
      const cookie = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookie) ? cookie[0] : cookie;
      const sidMatch = cookieStr.match(/lf_sid=([^;]+)/);
      assert.ok(sidMatch, 'should have session ID');
      
      // Logout
      await rawAgent().post('/api/auth/logout').set('Cookie', `lf_sid=${sidMatch[1]}`);
      const row = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sidMatch[1]);
      assert.equal(row, undefined, 'session should be deleted after logout');
    });

    it('each login generates unique session ID', async () => {
      const email = `uniq-${Date.now()}@test.com`;
      await rawAgent().post('/api/auth/register').send({ email, password: 'TestPass123!' });
      const r1 = await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      const r2 = await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      const getSid = (r) => {
        const c = Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'][0] : r.headers['set-cookie'];
        const m = (c || '').match(/lf_sid=([^;]+)/);
        return m ? m[1] : null;
      };
      const sid1 = getSid(r1);
      const sid2 = getSid(r2);
      assert.ok(sid1);
      assert.ok(sid2);
      assert.notEqual(sid1, sid2, 'each login should get unique session');
    });

    it('multiple concurrent sessions per user', async () => {
      const { db } = setup();
      const email = `multi-${Date.now()}@test.com`;
      await rawAgent().post('/api/auth/register').send({ email, password: 'TestPass123!' });
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?').get(user.id);
      assert.ok(sessions.c >= 2, `should have ≥2 sessions, got ${sessions.c}`);
    });
  });

  describe('Session hijacking prevention', () => {
    it('expired session cookie → 401', async () => {
      const { db } = setup();
      // Create an expired session for the test user
      db.prepare("INSERT OR REPLACE INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 0, datetime('now', '-1 hour'))").run('expired-sid-test');
      const res = await rawAgent().get('/api/tasks/all').set('Cookie', 'lf_sid=expired-sid-test');
      // Should not succeed — either 401 (session expired) or other auth failure
      assert.ok(res.status !== 200, `should not return 200 for expired session, got ${res.status}`);
      assert.ok([401, 403].includes(res.status), `expected 401 or 403, got ${res.status}`);
    });

    it('malformed session cookie → not 200', async () => {
      const res = await rawAgent().get('/api/tasks/all').set('Cookie', 'lf_sid=not-a-valid-uuid-at-all');
      assert.ok(res.status !== 200, `should not return 200 for invalid session`);
      assert.equal(res.status, 401);
    });

    it('nonexistent session ID → 401', async () => {
      const res = await rawAgent().get('/api/tasks/all').set('Cookie', 'lf_sid=00000000-0000-0000-0000-000000000000');
      assert.equal(res.status, 401);
    });

    it('empty session cookie → 401', async () => {
      const res = await rawAgent().get('/api/tasks/all').set('Cookie', 'lf_sid=');
      assert.equal(res.status, 401);
    });
  });

  describe('Password change → sessions', () => {
    it('password change invalidates all sessions', async () => {
      const { db } = setup();
      const email = `pwc-${Date.now()}@test.com`;
      const password = 'TestPass123!';
      await rawAgent().post('/api/auth/register').send({ email, password });
      const loginRes = await rawAgent().post('/api/auth/login').send({ email, password });
      const cookie = Array.isArray(loginRes.headers['set-cookie']) ? loginRes.headers['set-cookie'][0] : loginRes.headers['set-cookie'];
      const sidMatch = cookie.match(/lf_sid=([^;]+)/);

      // Change password using the session
      const changeRes = await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', `lf_sid=${sidMatch[1]}`)
        .send({ current_password: password, new_password: 'NewTestPass456!' });
      assert.equal(changeRes.status, 200);

      // Old session should be invalid
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?').get(user.id);
      assert.equal(sessions.c, 0, 'all sessions should be deleted after password change');
    });

    it('must re-login after password change', async () => {
      const email = `pwrl-${Date.now()}@test.com`;
      const password = 'TestPass123!';
      await rawAgent().post('/api/auth/register').send({ email, password });
      const loginRes = await rawAgent().post('/api/auth/login').send({ email, password });
      const cookie = Array.isArray(loginRes.headers['set-cookie']) ? loginRes.headers['set-cookie'][0] : loginRes.headers['set-cookie'];
      const sidMatch = cookie.match(/lf_sid=([^;]+)/);

      await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', `lf_sid=${sidMatch[1]}`)
        .send({ current_password: password, new_password: 'NewTestPass456!' });

      // Try to use old session
      const res = await rawAgent().get('/api/auth/me').set('Cookie', `lf_sid=${sidMatch[1]}`);
      assert.equal(res.status, 401);
    });
  });

  describe('API token vs session', () => {
    it('session cookie works for authenticated endpoints', async () => {
      const res = await agent().get('/api/tasks/all');
      assert.equal(res.status, 200);
    });

    it('no auth at all → 401', async () => {
      const res = await rawAgent().get('/api/tasks/all');
      assert.equal(res.status, 401);
    });
  });

  describe('Logout cleanup', () => {
    it('logout clears the cookie (Max-Age=0)', async () => {
      const loginRes = await loginUser({ email: `lcc-${Date.now()}@test.com` });
      const loginCookie = Array.isArray(loginRes.res.headers['set-cookie']) ? loginRes.res.headers['set-cookie'][0] : loginRes.res.headers['set-cookie'];
      const sidMatch = loginCookie.match(/lf_sid=([^;]+)/);

      const logoutRes = await rawAgent().post('/api/auth/logout').set('Cookie', `lf_sid=${sidMatch[1]}`);
      const logoutCookie = logoutRes.headers['set-cookie'];
      const str = Array.isArray(logoutCookie) ? logoutCookie.join('; ') : logoutCookie;
      assert.ok(str.includes('Max-Age=0'), 'logout should clear cookie with Max-Age=0');
    });

    it('double logout does not error', async () => {
      const { res } = await loginUser({ email: `dl-${Date.now()}@test.com` });
      const cookie = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'][0] : res.headers['set-cookie'];
      const sidMatch = cookie.match(/lf_sid=([^;]+)/);

      await rawAgent().post('/api/auth/logout').set('Cookie', `lf_sid=${sidMatch[1]}`);
      const res2 = await rawAgent().post('/api/auth/logout').set('Cookie', `lf_sid=${sidMatch[1]}`);
      assert.equal(res2.status, 200);
    });
  });

  describe('Account lockout', () => {
    it('5 failed login attempts triggers lockout', async () => {
      const email = `lock-${Date.now()}@test.com`;
      await rawAgent().post('/api/auth/register').send({ email, password: 'TestPass123!' });

      for (let i = 0; i < 5; i++) {
        await rawAgent().post('/api/auth/login').send({ email, password: 'WrongPass!' });
      }

      // 6th attempt should be locked
      const res = await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      assert.equal(res.status, 429);
      assert.ok(res.body.error.includes('locked'), 'should tell user account is locked');
    });

    it('lockout response shows descriptive message', async () => {
      const email = `lockr-${Date.now()}@test.com`;
      await rawAgent().post('/api/auth/register').send({ email, password: 'TestPass123!' });

      for (let i = 0; i < 6; i++) {
        await rawAgent().post('/api/auth/login').send({ email, password: 'WrongPass!' });
      }

      const res = await rawAgent().post('/api/auth/login').send({ email, password: 'TestPass123!' });
      assert.ok(res.body.error);
      assert.ok(res.body.error.toLowerCase().includes('locked'), 'should mention lockout');
      assert.ok(res.body.error.includes('minute'), 'should mention retry time');
    });
  });
});
