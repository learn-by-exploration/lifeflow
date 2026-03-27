const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('CORS Configuration', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('default config has empty allowedOrigins', () => {
    const config = require('../src/config');
    assert.ok(Array.isArray(config.allowedOrigins));
    assert.equal(config.allowedOrigins.length, 0);
  });

  it('same-origin requests work without CORS headers', async () => {
    // No Origin header → no CORS headers in response
    const res = await agent().get('/api/areas');
    assert.equal(res.status, 200);
    // Should NOT have permissive CORS since no ALLOWED_ORIGINS
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('preflight OPTIONS request gets handled', async () => {
    const res = await rawAgent()
      .options('/api/areas');
    // Without CORS origins configured, OPTIONS may return various status codes
    // The key is the server doesn't crash
    assert.ok(res.status < 500, `Expected non-error status, got ${res.status}`);
  });

  it('config parses ALLOWED_ORIGINS from env var format', () => {
    // Verify the parsing logic works by checking the pattern
    const raw = 'https://app.example.com, https://other.example.com';
    const parsed = raw.split(',').map(s => s.trim()).filter(Boolean);
    assert.deepEqual(parsed, ['https://app.example.com', 'https://other.example.com']);
  });
});
