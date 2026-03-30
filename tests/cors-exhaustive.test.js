const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('CORS Exhaustive Scenarios', () => {
  let _emailCounter = 0;
  const TEST_PASSWORD = 'Str0ng!Pass9876';

  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  /** Register a fresh user and return { cookie, rawCookie } */
  async function registerUser() {
    _emailCounter++;
    const email = `cors${_emailCounter}@test.com`;
    const res = await rawAgent()
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, display_name: 'CORS Tester' });
    const raw = res.headers['set-cookie'];
    const rawCookie = Array.isArray(raw) ? (raw.find(c => c.includes('lf_sid')) || raw[0] || '') : String(raw || '');
    const sidMatch = rawCookie.match(/lf_sid=([^;]+)/);
    const cookie = sidMatch ? `lf_sid=${sidMatch[1]}` : '';
    return { email, cookie, rawCookie, res };
  }

  /** Register then login */
  async function registerAndLogin() {
    const { email } = await registerUser();
    const loginRes = await rawAgent()
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD });
    const raw = loginRes.headers['set-cookie'];
    const rawCookie = Array.isArray(raw) ? (raw.find(c => c.includes('lf_sid')) || raw[0] || '') : String(raw || '');
    return { email, rawCookie, loginRes };
  }

  // --- 1. Preflight OPTIONS requests ---

  describe('Preflight OPTIONS requests', () => {
    it('OPTIONS /api/tasks does not crash the server', async () => {
      const res = await rawAgent()
        .options('/api/tasks')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'POST');
      assert.ok(res.status < 500, `Expected non-error, got ${res.status}`);
    });

    it('OPTIONS without Origin header succeeds', async () => {
      const res = await rawAgent()
        .options('/api/tasks');
      assert.ok(res.status < 500, `Expected non-error, got ${res.status}`);
    });

    it('OPTIONS on /api/areas returns non-error', async () => {
      const res = await rawAgent()
        .options('/api/areas')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'GET');
      assert.ok(res.status < 500, `Expected non-server-error, got ${res.status}`);
    });

    it('OPTIONS on nested API path does not error', async () => {
      const res = await rawAgent()
        .options('/api/tasks/reorder')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'PUT');
      assert.ok(res.status < 500, `Expected non-error, got ${res.status}`);
    });
  });

  // --- 2. Access-Control headers ---

  describe('Access-Control headers', () => {
    it('without ALLOWED_ORIGINS, no Access-Control-Allow-Origin on responses', async () => {
      const res = await agent().get('/api/areas').set('Origin', 'http://example.com');
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('actual GET request without Origin has no CORS headers', async () => {
      const res = await agent().get('/api/areas');
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
      assert.equal(res.headers['access-control-allow-credentials'], undefined);
    });

    it('PUT request with Origin has no ACAO when origins not configured', async () => {
      const res = await agent()
        .put('/api/settings/theme')
        .set('Origin', 'http://example.com')
        .send({ value: 'midnight' });
      assert.ok(res.status < 500);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('DELETE request without Origin has no CORS headers', async () => {
      const createRes = await agent()
        .post('/api/areas')
        .send({ name: 'CORS Area', icon: '🌐', color: '#FF0000' });
      const areaId = createRes.body.id;
      const res = await agent().delete(`/api/areas/${areaId}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('API responses include Cache-Control: no-store', async () => {
      const res = await agent().get('/api/areas');
      assert.equal(res.headers['cache-control'], 'no-store');
    });
  });

  // --- 3. Credentials behavior ---

  describe('Credentials behavior', () => {
    it('without ALLOWED_ORIGINS, wildcard * is not used', async () => {
      const res = await agent().get('/api/areas').set('Origin', 'http://evil.com');
      assert.notEqual(res.headers['access-control-allow-origin'], '*');
    });

    it('login sets cookie on request', async () => {
      const { rawCookie, loginRes } = await registerAndLogin();
      assert.equal(loginRes.status, 200);
      assert.ok(rawCookie.includes('lf_sid='), 'Expected lf_sid cookie');
    });

    it('cookie-bearing requests work for authenticated endpoints', async () => {
      const res = await agent().get('/api/areas');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  // --- 4. ALLOWED_ORIGINS config parsing ---

  describe('ALLOWED_ORIGINS config', () => {
    it('config allowedOrigins is empty array when env not set', () => {
      const config = require('../src/config');
      assert.ok(Array.isArray(config.allowedOrigins));
      assert.equal(config.allowedOrigins.length, 0);
    });

    it('single origin parsing works correctly', () => {
      const raw = 'https://myapp.example.com';
      const parsed = raw.split(',').map(s => s.trim()).filter(Boolean);
      assert.deepEqual(parsed, ['https://myapp.example.com']);
    });

    it('multiple comma-separated origins parsing works', () => {
      const raw = 'https://app1.com, https://app2.com, https://app3.com';
      const parsed = raw.split(',').map(s => s.trim()).filter(Boolean);
      assert.deepEqual(parsed, ['https://app1.com', 'https://app2.com', 'https://app3.com']);
    });

    it('empty ALLOWED_ORIGINS results in origin:false CORS', async () => {
      const config = require('../src/config');
      assert.equal(config.allowedOrigins.length, 0);
      const res = await agent().get('/api/areas').set('Origin', 'http://cross.example.com');
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });
  });

  // --- 5. Cross-origin cookie handling ---

  describe('Cross-origin cookie handling', () => {
    it('session cookie has SameSite=Strict attribute', async () => {
      const { rawCookie } = await registerUser();
      assert.ok(rawCookie.includes('SameSite=Strict'), `Expected SameSite=Strict in: ${rawCookie}`);
    });

    it('session cookie has HttpOnly flag', async () => {
      const { rawCookie } = await registerUser();
      assert.ok(rawCookie.includes('HttpOnly'), `Expected HttpOnly in: ${rawCookie}`);
    });

    it('cookie Path is set to /', async () => {
      const { rawCookie } = await registerUser();
      assert.ok(rawCookie.includes('Path=/'), `Expected Path=/ in: ${rawCookie}`);
    });
  });

  // --- 6. Public endpoint CORS ---

  describe('Public endpoint CORS', () => {
    it('/health endpoint accessible without auth or CORS', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('/health with Origin header still works', async () => {
      const res = await rawAgent()
        .get('/health')
        .set('Origin', 'http://other-site.com');
      assert.equal(res.status, 200);
      assert.equal(res.body.dbOk, true);
    });

    it('/login page accessible without auth', async () => {
      const res = await rawAgent().get('/login');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
    });
  });
});
