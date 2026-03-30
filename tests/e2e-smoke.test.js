const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, rawAgent } = require('./helpers');

// ─── E2E Smoke Tests ────────────────────────────────────────────────────────
// End-to-end tests that exercise the full user workflow through the API:
// register → login → create area → create goal → create task → verify.
// No browser required — uses supertest to simulate the same HTTP flows.

describe('E2E Smoke Tests', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('Registration → Login → Task Creation Flow', () => {
    it('full lifecycle: register, login, create hierarchy, verify', async () => {
      const agent = rawAgent();
      const email = `smoke-${Date.now()}@test.com`;
      const password = 'SmokeTest1234!@';

      // 1. Register
      const regRes = await agent.post('/api/auth/register').send({
        email,
        password,
        display_name: 'Smoke Tester'
      });
      assert.equal(regRes.status, 201, `registration should succeed, got: ${regRes.status} ${JSON.stringify(regRes.body)}`);
      assert.ok(regRes.body.user, 'should return user object');
      assert.equal(regRes.body.user.display_name, 'Smoke Tester');

      // Extract session cookie
      const cookies = regRes.headers['set-cookie'];
      assert.ok(cookies, 'should set session cookie on register');
      const sidCookie = cookies.find(c => c.startsWith('lf_sid='));
      assert.ok(sidCookie, 'should set lf_sid cookie');

      // Parse the cookie value for reuse
      const sid = sidCookie.split('=')[1].split(';')[0];
      const authCookie = `lf_sid=${sid}`;

      // 2. Verify session
      const meRes = await agent.get('/api/auth/me').set('Cookie', authCookie);
      assert.equal(meRes.status, 200, 'session should be valid');
      assert.equal(meRes.body.user.email, email);

      // 3. Create life area
      const areaRes = await agent.post('/api/areas').set('Cookie', authCookie).send({
        name: 'Work',
        icon: '💼',
        color: '#2563EB'
      });
      assert.equal(areaRes.status, 201, 'area creation should succeed');
      const areaId = areaRes.body.id;

      // 4. Create goal
      const goalRes = await agent.post(`/api/areas/${areaId}/goals`).set('Cookie', authCookie).send({
        title: 'Ship MVP',
        description: 'Launch minimum viable product'
      });
      assert.equal(goalRes.status, 201, 'goal creation should succeed');
      const goalId = goalRes.body.id;

      // 5. Create task
      const taskRes = await agent.post(`/api/goals/${goalId}/tasks`).set('Cookie', authCookie).send({
        title: 'Write tests',
        priority: 2,
        status: 'todo'
      });
      assert.equal(taskRes.status, 201, 'task creation should succeed');
      const taskId = taskRes.body.id;

      // 6. Verify task appears in task list
      const listRes = await agent.get('/api/tasks/all').set('Cookie', authCookie);
      assert.equal(listRes.status, 200);
      const found = listRes.body.find(t => t.id === taskId);
      assert.ok(found, 'task should appear in list');
      assert.equal(found.title, 'Write tests');
      assert.equal(found.priority, 2);

      // 7. Complete the task
      const doneRes = await agent.put(`/api/tasks/${taskId}`).set('Cookie', authCookie).send({
        status: 'done'
      });
      assert.equal(doneRes.status, 200);
      assert.equal(doneRes.body.status, 'done');
      assert.ok(doneRes.body.completed_at, 'should set completed_at');

      // 8. Verify dashboard reflects the completion
      const dashRes = await agent.get('/api/stats').set('Cookie', authCookie);
      assert.equal(dashRes.status, 200);
      assert.ok(dashRes.body.completed >= 1 || dashRes.body.done >= 1, 'dashboard should show ≥1 completed');

      // 9. Logout
      const logoutRes = await agent.post('/api/auth/logout').set('Cookie', authCookie);
      assert.equal(logoutRes.status, 200);

      // 10. Session should be invalid after logout
      const afterLogout = await agent.get('/api/auth/me').set('Cookie', authCookie);
      assert.equal(afterLogout.status, 401, 'session should be invalid after logout');
    });

    it('login with wrong password returns generic error', async () => {
      const agent = rawAgent();
      const email = `smoke2-${Date.now()}@test.com`;
      const password = 'SmokeTest1234!@';

      // Register first
      await agent.post('/api/auth/register').send({ email, password, display_name: 'U2' });

      // Login with wrong password
      const res = await agent.post('/api/auth/login').send({ email, password: 'WrongPass123!@' });
      assert.equal(res.status, 401);
      // Should not reveal whether email exists
      assert.ok(res.body.error, 'should return error message');
    });

    it('unauthenticated requests are rejected', async () => {
      const agent = rawAgent();
      const endpoints = [
        ['GET', '/api/tasks/all'],
        ['GET', '/api/areas'],
        ['GET', '/api/stats'],
      ];

      for (const [method, url] of endpoints) {
        const res = await agent[method.toLowerCase()](url);
        assert.equal(res.status, 401, `${method} ${url} should require auth`);
      }
    });
  });

  describe('HTML Page Serving', () => {
    it('serves login page', async () => {
      const agent = rawAgent();
      const res = await agent.get('/login.html');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('LifeFlow'), 'login page should contain app name');
      assert.ok(res.text.includes('js/login.js'), 'should reference external login.js');
    });

    it('serves main SPA shell', async () => {
      const agent = rawAgent();
      const res = await agent.get('/index.html');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('app.js'), 'should reference app.js');
      assert.ok(res.text.includes('lang="en"'), 'should have lang attribute');
    });

    it('serves static assets with correct content types', async () => {
      const agent = rawAgent();

      const jsRes = await agent.get('/app.js');
      assert.equal(jsRes.status, 200);
      assert.ok(jsRes.headers['content-type'].includes('javascript'), 'JS should have correct content type');

      const cssRes = await agent.get('/styles.css');
      assert.equal(cssRes.status, 200);
      assert.ok(cssRes.headers['content-type'].includes('css'), 'CSS should have correct content type');
    });

    it('CSP header does not contain unsafe-inline for scripts', async () => {
      const agent = rawAgent();
      const res = await agent.get('/index.html');
      const csp = res.headers['content-security-policy'] || '';
      // Extract script-src directive
      const scriptSrc = csp.match(/script-src\s+([^;]+)/);
      if (scriptSrc) {
        assert.ok(!scriptSrc[1].includes("'unsafe-inline'"),
          'script-src should not contain unsafe-inline');
      }
    });

    it('security headers are present', async () => {
      const agent = rawAgent();
      const res = await agent.get('/index.html');
      assert.ok(res.headers['content-security-policy'], 'should have CSP header');
      assert.ok(res.headers['x-content-type-options'], 'should have X-Content-Type-Options');
      assert.ok(res.headers['x-frame-options'] || res.headers['content-security-policy'].includes('frame-ancestors'),
        'should prevent framing');
    });
  });

  describe('API Health', () => {
    it('health endpoint responds', async () => {
      const agent = rawAgent();
      const res = await agent.get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    });
  });
});
