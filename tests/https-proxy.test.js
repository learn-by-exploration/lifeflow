const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeList } = require('./helpers');

describe('HTTPS / Reverse Proxy', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('trust proxy config reads TRUST_PROXY env var', () => {
    const config = require('../src/config');
    // In test env TRUST_PROXY is not set, so it should be false
    assert.equal(config.trustProxy, false);
  });

  it('BASE_URL used in share link generation', async () => {
    const list = makeList({ name: 'Share Test' });
    const res = await agent().post(`/api/lists/${list.id}/share`).expect(200);
    // Without BASE_URL set, URL should start with /share/
    assert.ok(res.body.url.startsWith('/share/'), `Expected relative URL, got: ${res.body.url}`);
    assert.ok(res.body.token);
  });
});
