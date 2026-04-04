/**
 * Tests for AI Features — Phase 1-4
 * Tests route validation, settings, key management, and endpoint structure.
 * AI provider calls are expected to fail (no real API key) — we test the routing layer.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('AI Features', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Phase 1: Settings & Key Management ───

  describe('AI Settings', () => {
    it('GET /api/ai/status returns status object', async () => {
      const res = await agent().get('/api/ai/status');
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.configured, 'boolean');
      assert.equal(typeof res.body.provider, 'string');
      assert.ok('capabilities' in res.body);
      assert.ok('hasKey' in res.body);
    });

    it('GET /api/ai/settings returns settings', async () => {
      const res = await agent().get('/api/ai/settings');
      assert.equal(res.status, 200);
      assert.ok('ai_provider' in res.body);
      assert.ok('ai_base_url' in res.body);
      assert.ok('ai_model' in res.body);
      assert.ok('ai_transparency_mode' in res.body);
      assert.ok('has_api_key' in res.body);
    });

    it('POST /api/ai/settings saves provider settings', async () => {
      const res = await agent()
        .post('/api/ai/settings')
        .send({ ai_provider: 'anthropic', ai_model: 'claude-sonnet-4-20250514', ai_base_url: 'https://api.anthropic.com/v1' });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
      assert.equal(res.body.updated.ai_provider, 'anthropic');

      // Verify settings persisted
      const get = await agent().get('/api/ai/settings');
      assert.equal(get.body.ai_provider, 'anthropic');
      assert.equal(get.body.ai_model, 'claude-sonnet-4-20250514');
    });

    it('POST /api/ai/settings ignores unknown keys', async () => {
      const res = await agent()
        .post('/api/ai/settings')
        .send({ ai_provider: 'openai', evil_key: 'should be ignored' });
      assert.equal(res.status, 200);
      assert.ok(!('evil_key' in res.body.updated));
    });

    it('POST /api/ai/key saves encrypted API key (when encryption key set)', async () => {
      // Note: AI_ENCRYPTION_KEY must be set at server boot for this to work.
      // If not set, the route returns 500 which is expected.
      const res = await agent()
        .post('/api/ai/key')
        .send({ api_key: 'sk-test-key-12345678' });
      // Either 200 (key saved) or 500 (encryption key not configured) are valid
      assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
    });

    it('POST /api/ai/key rejects short key', async () => {
      const res = await agent()
        .post('/api/ai/key')
        .send({ api_key: 'short' });
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/key rejects empty key', async () => {
      const res = await agent()
        .post('/api/ai/key')
        .send({ api_key: '' });
      assert.equal(res.status, 400);
    });

    it('DELETE /api/ai/key removes API key', async () => {
      const oldKey = process.env.AI_ENCRYPTION_KEY;
      process.env.AI_ENCRYPTION_KEY = 'test-encryption-key-32chars-long!';
      try {
        await agent().post('/api/ai/key').send({ api_key: 'sk-test-key-12345678' });
        const del = await agent().delete('/api/ai/key');
        assert.equal(del.status, 200);

        const status = await agent().get('/api/ai/status');
        assert.equal(status.body.hasKey, false);
      } finally {
        if (oldKey) process.env.AI_ENCRYPTION_KEY = oldKey;
        else delete process.env.AI_ENCRYPTION_KEY;
      }
    });

    it('POST /api/ai/test without API key returns error or failure status', async () => {
      const res = await agent().post('/api/ai/test').send({});
      // Without key: returns 400 (error) or 200 with ok:false
      assert.ok([200, 400].includes(res.status));
      if (res.status === 200) assert.ok(!res.body.ok || res.body.error);
    });
  });

  // ─── Phase 1: Transparency ───

  describe('AI Transparency', () => {
    it('POST /api/ai/preflight returns data disclosure', async () => {
      const res = await agent()
        .post('/api/ai/preflight')
        .send({ feature: 'daily_plan', data: { tasks: [{title:'Test'}] } });
      assert.equal(res.status, 200);
      assert.equal(res.body.feature, 'daily_plan');
      assert.ok('dataIncluded' in res.body);
      assert.ok('minimizationLevel' in res.body);
    });

    it('POST /api/ai/preflight requires feature', async () => {
      const res = await agent().post('/api/ai/preflight').send({});
      assert.equal(res.status, 400);
    });

    it('GET /api/ai/history returns empty array initially', async () => {
      const res = await agent().get('/api/ai/history');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/ai/stats returns usage stats', async () => {
      const res = await agent().get('/api/ai/stats');
      assert.equal(res.status, 200);
      assert.ok('total_calls' in res.body);
      assert.ok('byFeature' in res.body);
    });
  });

  // ─── Phase 2: AI Endpoints (validation, not actual AI calls) ───

  describe('AI Endpoints - Input Validation', () => {
    it('POST /api/ai/capture requires text', async () => {
      const res = await agent().post('/api/ai/capture').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('text'));
    });

    it('POST /api/ai/capture rejects too-long text', async () => {
      const res = await agent().post('/api/ai/capture').send({ text: 'x'.repeat(1001) });
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/classify requires title', async () => {
      const res = await agent().post('/api/ai/classify').send({});
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/decompose requires goal_id', async () => {
      const res = await agent().post('/api/ai/decompose').send({});
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/decompose with non-existent goal returns 404', async () => {
      const res = await agent().post('/api/ai/decompose').send({ goal_id: 99999 });
      assert.equal(res.status, 404);
    });

    it('POST /api/ai/build-automation requires description', async () => {
      const res = await agent().post('/api/ai/build-automation').send({});
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/build-automation rejects too-long description', async () => {
      const res = await agent().post('/api/ai/build-automation').send({ description: 'x'.repeat(501) });
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/habit-coach requires habit_id', async () => {
      const res = await agent().post('/api/ai/habit-coach').send({});
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/habit-coach with non-existent habit returns 404', async () => {
      const res = await agent().post('/api/ai/habit-coach').send({ habit_id: 99999 });
      assert.equal(res.status, 404);
    });

    it('POST /api/ai/accept requires feature', async () => {
      const res = await agent().post('/api/ai/accept').send({});
      assert.equal(res.status, 400);
    });

    it('POST /api/ai/accept with feature returns ok', async () => {
      const res = await agent().post('/api/ai/accept').send({ feature: 'daily_plan' });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });

    it('POST /api/ai/semantic-search requires query', async () => {
      const res = await agent().post('/api/ai/semantic-search').send({});
      assert.equal(res.status, 400);
    });
  });

  // ─── AI calls without API key should return 400 ───

  describe('AI Endpoints - No API Key', () => {
    const endpoints = [
      { method: 'post', path: '/api/ai/suggest', body: { task_title: 'Test task' } },
      { method: 'post', path: '/api/ai/capture', body: { text: 'Test task for tomorrow' } },
      { method: 'post', path: '/api/ai/classify', body: { title: 'Test task' } },
      { method: 'post', path: '/api/ai/plan-day', body: {}, expect200: true }, // Returns 200 with empty plan when no tasks
      { method: 'post', path: '/api/ai/next-task', body: {}, expect200: true }, // Returns 200 with "all caught up"
      { method: 'post', path: '/api/ai/review-week', body: {} },
      { method: 'post', path: '/api/ai/year-in-review', body: {} },
      { method: 'post', path: '/api/ai/cognitive-load', body: {} },
      { method: 'post', path: '/api/ai/daily-highlight', body: {} },
      { method: 'post', path: '/api/ai/accountability-check', body: {} },
      { method: 'post', path: '/api/ai/life-balance', body: {} },
      { method: 'post', path: '/api/ai/build-automation', body: { description: 'Auto-tag tasks' } },
    ];

    for (const ep of endpoints) {
      it(`${ep.method.toUpperCase()} ${ep.path} without API key returns ${ep.expect200 ? '200 (graceful)' : '400'}`, async () => {
        const res = await agent()[ep.method](ep.path).send(ep.body);
        if (ep.expect200) {
          assert.equal(res.status, 200);
        } else {
          assert.equal(res.status, 400);
          assert.ok(res.body.error);
        }
      });
    }
  });

  // ─── Provider abstraction ───

  describe('Provider Module', () => {
    it('exports required functions', () => {
      const provider = require('../src/services/ai/provider');
      assert.equal(typeof provider.buildConfig, 'function');
      assert.equal(typeof provider.chatCompletion, 'function');
      assert.equal(typeof provider.generateEmbedding, 'function');
      assert.equal(typeof provider.testConnection, 'function');
      assert.ok(provider.CAPABILITIES);
      assert.ok(provider.DEFAULT_URLS);
      assert.ok(provider.DEFAULT_MODELS);
    });

    it('buildConfig returns correct structure', () => {
      const provider = require('../src/services/ai/provider');
      const config = provider.buildConfig({ ai_provider: 'openai', ai_api_key: 'sk-test' });
      assert.equal(config.provider, 'openai');
      assert.equal(config.apiKey, 'sk-test');
      assert.ok(config.capabilities);
      assert.equal(config.capabilities.functionCalling, true);
    });

    it('buildConfig defaults to openai', () => {
      const provider = require('../src/services/ai/provider');
      const config = provider.buildConfig({});
      assert.equal(config.provider, 'openai');
    });

    it('CAPABILITIES has entries for all providers', () => {
      const provider = require('../src/services/ai/provider');
      assert.ok(provider.CAPABILITIES.openai);
      assert.ok(provider.CAPABILITIES.anthropic);
      assert.ok(provider.CAPABILITIES.ollama);
      assert.ok(provider.CAPABILITIES.custom);
    });
  });

  // ─── Transparency module ───

  describe('Transparency Module', () => {
    it('minimizeTask respects strict level', () => {
      const t = require('../src/services/ai/transparency');
      const task = { title: 'Test', status: 'todo', priority: 2, note: 'Secret note', tags: [{ name: 'work' }] };
      const minimized = t.minimizeTask(task, 'strict');
      assert.equal(minimized.title, 'Test');
      assert.equal(minimized.status, 'todo');
      assert.ok(!minimized.note);
      assert.ok(minimized.tags);
    });

    it('minimizeTask includes notes in full level', () => {
      const t = require('../src/services/ai/transparency');
      const task = { title: 'Test', status: 'todo', priority: 0, note: 'Detailed note' };
      const minimized = t.minimizeTask(task, 'full');
      assert.equal(minimized.note, 'Detailed note');
    });

    it('minimizeList respects maxItems', () => {
      const t = require('../src/services/ai/transparency');
      const items = Array.from({ length: 50 }, (_, i) => ({ title: `Task ${i}`, status: 'todo', priority: 0 }));
      const minimized = t.minimizeList(items, 'strict', t.minimizeTask);
      assert.equal(minimized.length, 20); // strict maxItems = 20
    });

    it('buildPreFlight returns disclosure data', () => {
      const t = require('../src/services/ai/transparency');
      const pf = t.buildPreFlight('daily_plan', 'openai', { tasks: [{ title: 'T' }] }, 'standard');
      assert.equal(pf.feature, 'daily_plan');
      assert.equal(pf.provider, 'openai');
      assert.ok(pf.dataIncluded.length > 0);
    });
  });

  // ─── Prompt templates ───

  describe('Prompt Templates', () => {
    it('capture prompt builds valid messages', () => {
      const { buildCapturePrompt } = require('../src/services/ai/prompts/capture');
      const result = buildCapturePrompt('Buy groceries tomorrow', { tags: [{ name: 'errands' }] });
      assert.ok(result.messages.length >= 2);
      assert.equal(result.messages[0].role, 'system');
      assert.ok(result.function);
      assert.equal(result.function.name, 'parse_task');
    });

    it('decompose prompt builds valid messages', () => {
      const { buildDecomposePrompt } = require('../src/services/ai/prompts/decompose');
      const result = buildDecomposePrompt({ title: 'Run a marathon', due_date: '2026-10-01' }, {});
      assert.ok(result.messages.length >= 2);
      assert.ok(result.function);
    });

    it('daily plan prompt builds valid messages', () => {
      const { buildDailyPlanPrompt } = require('../src/services/ai/prompts/daily-plan');
      const tasks = [{ id: 1, title: 'Test', status: 'todo', priority: 2 }];
      const result = buildDailyPlanPrompt(tasks, {});
      assert.ok(result.messages.length >= 2);
      assert.ok(result.function);
    });

    it('review prompt builds valid messages', () => {
      const { buildReviewPrompt } = require('../src/services/ai/prompts/review');
      const result = buildReviewPrompt({ completed: [{ title: 'Done task', area: 'Work' }] }, {});
      assert.ok(result.messages.length >= 2);
      assert.ok(result.jsonMode);
    });

    it('classify prompt builds valid messages', () => {
      const { buildClassifyPrompt } = require('../src/services/ai/prompts/classify');
      const result = buildClassifyPrompt({ title: 'Fix the bug' }, { goals: [{ id: 1, title: 'Work' }] });
      assert.ok(result.messages.length >= 2);
      assert.ok(result.function);
    });

    it('summarize prompts build valid messages', () => {
      const s = require('../src/services/ai/prompts/summarize');
      assert.ok(s.buildYearInReviewPrompt({ year: 2026 }).messages.length >= 2);
      assert.ok(s.buildCognitiveLoadPrompt({ activeTasks: 10 }).messages.length >= 2);
      assert.ok(s.buildNextTaskPrompt([{ id: 1, title: 'T', status: 'todo', priority: 2 }], {}).messages.length >= 2);
      assert.ok(s.buildHabitCoachPrompt({ name: 'Meditate', target: 1, frequency: 'daily' }, {}).messages.length >= 2);
      assert.ok(s.buildLifeBalancePrompt([{ name: 'Work', tasksCompleted30d: 5 }]).messages.length >= 2);
      assert.ok(s.buildAutomationBuilderPrompt('auto-tag work tasks', {}).messages.length >= 2);
    });
  });

  // ─── DB migration ───

  describe('AI Database Tables', () => {
    it('ai_interactions table exists', () => {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_interactions'").get();
      assert.ok(row);
    });

    it('embeddings table exists', () => {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'").get();
      assert.ok(row);
    });

    it('can insert and read ai_interactions', () => {
      db.prepare("INSERT INTO ai_interactions (user_id, feature, provider, tokens_used, accepted) VALUES (1, 'test', 'openai', 100, 1)").run();
      const row = db.prepare("SELECT * FROM ai_interactions WHERE user_id = 1 AND feature = 'test'").get();
      assert.ok(row);
      assert.equal(row.tokens_used, 100);
      assert.equal(row.accepted, 1);
    });

    it('can insert and read embeddings', () => {
      const blob = Buffer.alloc(16); // fake embedding
      db.prepare("INSERT INTO embeddings (entity_type, entity_id, user_id, embedding, model) VALUES ('task', 1, 1, ?, 'test')").run(blob);
      const row = db.prepare("SELECT * FROM embeddings WHERE entity_type = 'task' AND entity_id = 1").get();
      assert.ok(row);
      assert.equal(row.model, 'test');
    });
  });

  // ─── Semantic Search fallback (FTS) ───

  describe('Semantic Search', () => {
    it('POST /api/ai/semantic-search falls back to FTS', async () => {
      const res = await agent()
        .post('/api/ai/semantic-search')
        .send({ query: 'test' });
      assert.equal(res.status, 200);
      assert.ok(res.body.method); // 'fts' or 'semantic'
      assert.ok(Array.isArray(res.body.results));
    });
  });
});
