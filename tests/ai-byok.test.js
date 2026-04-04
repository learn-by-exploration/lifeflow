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

  it('AI service module exists', () => {
    const aiService = require('../src/services/ai');
    assert.equal(typeof aiService, 'function');
  });

  // ─── Encryption Tests ───

  it('encrypt → decrypt roundtrip returns original text', () => {
    const oldKey = process.env.AI_ENCRYPTION_KEY;
    process.env.AI_ENCRYPTION_KEY = 'test-encryption-key-32chars-long!';
    try {
      const createAiService = require('../src/services/ai');
      // Clear module cache to pick up new env var
      delete require.cache[require.resolve('../src/services/ai')];
      const svc = require('../src/services/ai')(db);
      const original = 'sk-secret-api-key-12345';
      const encrypted = svc.encrypt(original);
      assert.notEqual(encrypted, original, 'Should not store plaintext');
      const decrypted = svc.decrypt(encrypted);
      assert.equal(decrypted, original);
    } finally {
      if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
      else delete process.env.AI_ENCRYPTION_KEY;
      delete require.cache[require.resolve('../src/services/ai')];
    }
  });

  it('two encryptions of same text produce different ciphertexts (random salt)', () => {
    const oldKey = process.env.AI_ENCRYPTION_KEY;
    process.env.AI_ENCRYPTION_KEY = 'test-encryption-key-32chars-long!';
    try {
      delete require.cache[require.resolve('../src/services/ai')];
      const svc = require('../src/services/ai')(db);
      const text = 'sk-same-key';
      const enc1 = svc.encrypt(text);
      const enc2 = svc.encrypt(text);
      assert.notEqual(enc1, enc2, 'Different encryptions should produce different ciphertext');
    } finally {
      if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
      else delete process.env.AI_ENCRYPTION_KEY;
      delete require.cache[require.resolve('../src/services/ai')];
    }
  });

  it('encrypt without AI_ENCRYPTION_KEY throws error', () => {
    const oldKey = process.env.AI_ENCRYPTION_KEY;
    delete process.env.AI_ENCRYPTION_KEY;
    try {
      delete require.cache[require.resolve('../src/services/ai')];
      const svc = require('../src/services/ai')(db);
      assert.throws(() => svc.encrypt('sk-test'), /AI_ENCRYPTION_KEY/);
    } finally {
      if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
      delete require.cache[require.resolve('../src/services/ai')];
    }
  });

  it('decrypt without AI_ENCRYPTION_KEY throws error', () => {
    const oldKey = process.env.AI_ENCRYPTION_KEY;
    delete process.env.AI_ENCRYPTION_KEY;
    try {
      delete require.cache[require.resolve('../src/services/ai')];
      const svc = require('../src/services/ai')(db);
      assert.throws(() => svc.decrypt('abc:def:ghi:jkl'), /AI_ENCRYPTION_KEY/);
    } finally {
      if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
      delete require.cache[require.resolve('../src/services/ai')];
    }
  });

  it('suggest with API key attempts AI call (fails gracefully with invalid key)', async () => {
    const oldKey = process.env.AI_ENCRYPTION_KEY;
    process.env.AI_ENCRYPTION_KEY = 'test-encryption-key-32chars-long!';
    try {
      delete require.cache[require.resolve('../src/services/ai')];
      const svc = require('../src/services/ai')(db);
      const encrypted = svc.encrypt('sk-test-key');
      db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'ai_api_key', ?)")
        .run(1, encrypted);
      // With the new AI service, suggest calls the provider which will fail with an invalid key
      // We just verify it doesn't crash and attempts the call
      await assert.rejects(() => svc.suggest(1, 'Test task'), /AI|fetch|provider|ECONNREFUSED|error/i);
    } finally {
      if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
      else delete process.env.AI_ENCRYPTION_KEY;
      delete require.cache[require.resolve('../src/services/ai')];
    }
  });

  it('schedule with API key checks API key exists', async () => {
    const oldKey = process.env.AI_ENCRYPTION_KEY;
    process.env.AI_ENCRYPTION_KEY = 'test-encryption-key-32chars-long!';
    try {
      delete require.cache[require.resolve('../src/services/ai')];
      const svc = require('../src/services/ai')(db);
      const encrypted = svc.encrypt('sk-test-key');
      db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'ai_api_key', ?)")
        .run(1, encrypted);
      // Schedule with non-existent tasks returns empty plan
      const result = await svc.schedule(1, [99999]);
      assert.ok(result.data);
    } finally {
      if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
      else delete process.env.AI_ENCRYPTION_KEY;
      delete require.cache[require.resolve('../src/services/ai')];
    }
  });
});
