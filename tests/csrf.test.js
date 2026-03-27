const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const createCsrfMiddleware = require('../src/middleware/csrf');

/**
 * CSRF middleware unit tests.
 * Since CSRF is disabled in NODE_ENV=test (server.js skips app.use),
 * we test the middleware function directly.
 */
describe('CSRF Middleware', () => {
  let csrf;

  beforeEach(() => {
    csrf = createCsrfMiddleware();
  });

  function mockReq(method, path, headers = {}) {
    return { method, path, headers };
  }
  function mockRes() {
    const _headers = {};
    return {
      statusCode: 200,
      _body: null,
      getHeader(name) { return _headers[name]; },
      setHeader(name, val) { _headers[name] = val; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this._body = body; return this; },
    };
  }

  // ── GET requests should be exempt ──
  it('allows GET requests without CSRF token', (_, done) => {
    const req = mockReq('GET', '/api/tasks', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('allows HEAD requests without CSRF token', (_, done) => {
    const req = mockReq('HEAD', '/api/tasks', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('allows OPTIONS requests without CSRF token', (_, done) => {
    const req = mockReq('OPTIONS', '/api/tasks', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  // ── POST without token should be blocked ──
  it('blocks POST without X-CSRF-Token header', () => {
    const req = mockReq('POST', '/api/tasks', { cookie: 'csrf_token=' + 'a'.repeat(64) });
    const res = mockRes();
    let nextCalled = false;
    csrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res._body.error, 'Invalid or missing CSRF token');
  });

  it('blocks PUT without X-CSRF-Token header', () => {
    const req = mockReq('PUT', '/api/tasks/1', { cookie: 'csrf_token=' + 'b'.repeat(64) });
    const res = mockRes();
    let nextCalled = false;
    csrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it('blocks DELETE without X-CSRF-Token header', () => {
    const req = mockReq('DELETE', '/api/tasks/1', { cookie: 'csrf_token=' + 'c'.repeat(64) });
    const res = mockRes();
    let nextCalled = false;
    csrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  // ── POST with mismatched token ──
  it('blocks POST with mismatched CSRF token', () => {
    const token1 = 'a'.repeat(64);
    const token2 = 'b'.repeat(64);
    const req = mockReq('POST', '/api/tasks', {
      cookie: `csrf_token=${token1}`,
      'x-csrf-token': token2,
    });
    const res = mockRes();
    let nextCalled = false;
    csrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  // ── POST with valid matching token ──
  it('allows POST with valid matching CSRF token', (_, done) => {
    const token = 'a1b2c3d4'.repeat(8); // 64 hex chars
    const req = mockReq('POST', '/api/tasks', {
      cookie: `csrf_token=${token}`,
      'x-csrf-token': token,
    });
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('allows PUT with valid matching CSRF token', (_, done) => {
    const token = 'deadbeef'.repeat(8);
    const req = mockReq('PUT', '/api/tasks/1', {
      cookie: `csrf_token=${token}`,
      'x-csrf-token': token,
    });
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  // ── Auth endpoints exempt ──
  it('exempts /auth/login from CSRF', (_, done) => {
    const req = mockReq('POST', '/auth/login', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('exempts /auth/register from CSRF', (_, done) => {
    const req = mockReq('POST', '/auth/register', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  it('exempts /auth/logout from CSRF', (_, done) => {
    const req = mockReq('POST', '/auth/logout', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  // ── Shared endpoints exempt ──
  it('exempts /shared/* from CSRF', (_, done) => {
    const req = mockReq('POST', '/shared/list/123', {});
    const res = mockRes();
    csrf(req, res, () => { done(); });
  });

  // ── CSRF cookie set on GET ──
  it('sets csrf_token cookie on GET when not present', (_, done) => {
    const req = mockReq('GET', '/api/tasks', {});
    const res = mockRes();
    csrf(req, res, () => {
      const cookies = res.getHeader('Set-Cookie');
      assert.ok(cookies, 'Set-Cookie header should be set');
      const csrfCookie = Array.isArray(cookies)
        ? cookies.find(c => c.startsWith('csrf_token='))
        : cookies;
      assert.ok(csrfCookie, 'csrf_token cookie should be present');
      assert.match(csrfCookie, /csrf_token=[a-f0-9]{64}/);
      assert.ok(csrfCookie.includes('SameSite=Strict'));
      assert.ok(csrfCookie.includes('Path=/'));
      done();
    });
  });

  it('does not overwrite existing csrf_token cookie', (_, done) => {
    const existingToken = 'f'.repeat(64);
    const req = mockReq('GET', '/api/tasks', { cookie: `csrf_token=${existingToken}` });
    const res = mockRes();
    csrf(req, res, () => {
      const cookies = res.getHeader('Set-Cookie');
      // Should NOT set a new cookie since one already exists
      if (cookies) {
        const arr = Array.isArray(cookies) ? cookies : [cookies];
        const csrfCookie = arr.find(c => c.startsWith('csrf_token='));
        assert.equal(csrfCookie, undefined, 'Should not overwrite existing CSRF cookie');
      }
      done();
    });
  });

  // ── Edge cases ──
  it('blocks POST with no cookie header at all', () => {
    const req = mockReq('POST', '/api/tasks', { 'x-csrf-token': 'a'.repeat(64) });
    const res = mockRes();
    let nextCalled = false;
    csrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it('blocks PATCH without CSRF token', () => {
    const req = mockReq('PATCH', '/api/tasks/1', {});
    const res = mockRes();
    let nextCalled = false;
    csrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});
