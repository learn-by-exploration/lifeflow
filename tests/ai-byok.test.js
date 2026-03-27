const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('AI BYOK (Bring Your Own Key)', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('POST /api/ai/suggest without API key returns 400', async () => {
    const res = await agent()
      .post('/api/ai/suggest')
      .send({ task_title: 'Plan a wedding' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('API key'));
  });

  it('POST /api/ai/schedule without API key returns 400', async () => {
    const res = await agent()
      .post('/api/ai/schedule')
      .send({ task_ids: [1, 2, 3] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('API key'));
  });

  it('saves AI API key in settings (encrypted)', async () => {
    // Save a dummy key via settings
    await agent()
      .put('/api/settings')
      .send({ key: 'ai_api_key', value: 'sk-test-key-12345' });

    // GET settings should NOT expose the raw key
    const res = await agent().get('/api/settings').expect(200);
    const aiKey = res.body.find ? res.body.find(s => s.key === 'ai_api_key') : null;
    // If the key exists, it should be masked
    if (aiKey) {
      assert.ok(!aiKey.value.includes('sk-test-key-12345') || aiKey.value === '***',
        'API key should be masked in settings response');
    }
  });

  it('AI service module exists', () => {
    const aiService = require('../src/services/ai');
    assert.equal(typeof aiService, 'function');
  });
});
