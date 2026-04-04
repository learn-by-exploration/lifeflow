/**
 * AI Service — Public API for all AI features.
 * Provider-agnostic, privacy-respecting, with graceful degradation.
 */
'use strict';

const crypto = require('crypto');
const provider = require('./provider');
const transparency = require('./transparency');
const { buildCapturePrompt } = require('./prompts/capture');
const { buildDecomposePrompt } = require('./prompts/decompose');
const { buildDailyPlanPrompt } = require('./prompts/daily-plan');
const { buildReviewPrompt } = require('./prompts/review');
const { buildClassifyPrompt } = require('./prompts/classify');
const {
  buildYearInReviewPrompt, buildDailyHighlightPrompt, buildCognitiveLoadPrompt,
  buildNextTaskPrompt, buildAccountabilityPrompt, buildHabitCoachPrompt,
  buildLifeBalancePrompt, buildAutomationBuilderPrompt,
} = require('./prompts/summarize');

const ALGORITHM = 'aes-256-gcm';

module.exports = function createAiService(db) {
  const ENCRYPTION_KEY = process.env.AI_ENCRYPTION_KEY;

  /* ─── Encryption (preserved from original ai.js) ─── */

  function encrypt(text) {
    if (!ENCRYPTION_KEY) throw new Error('AI_ENCRYPTION_KEY environment variable is required for storing API keys');
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + tag + ':' + encrypted;
  }

  function decrypt(encrypted) {
    if (!ENCRYPTION_KEY) throw new Error('AI_ENCRYPTION_KEY environment variable is required for storing API keys');
    const parts = encrypted.split(':');
    if (parts.length === 3) {
      const [ivHex, tagHex, data] = parts;
      if (!ivHex || !tagHex || !data) return null;
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    const [saltHex, ivHex, tagHex, data] = parts;
    if (!saltHex || !ivHex || !tagHex || !data) return null;
    const key = crypto.scryptSync(ENCRYPTION_KEY, Buffer.from(saltHex, 'hex'), 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /* ─── Settings helpers ─── */

  function getSetting(userId, key) {
    const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
    return row?.value || null;
  }

  function setSetting(userId, key, value) {
    db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value')
      .run(userId, key, value);
  }

  function getUserApiKey(userId) {
    const row = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'ai_api_key'").get(userId);
    if (!row || !row.value) return null;
    try { return decrypt(row.value); } catch { return null; }
  }

  function getAiConfig(userId) {
    const apiKey = getUserApiKey(userId);
    return provider.buildConfig({
      ai_provider: getSetting(userId, 'ai_provider') || 'openai',
      ai_base_url: getSetting(userId, 'ai_base_url') || '',
      ai_model: getSetting(userId, 'ai_model') || '',
      ai_api_key: apiKey || '',
    });
  }

  function getMinimizationLevel(userId) {
    return getSetting(userId, 'ai_data_minimization') || 'standard';
  }

  function getTransparencyMode(userId) {
    return getSetting(userId, 'ai_transparency_mode') || 'always';
  }

  /* ─── Rate limiting (per-user, in-memory) ─── */
  const rateLimits = new Map();
  const RATE_LIMIT_MAX = 50; // max calls per hour
  const RATE_LIMIT_WINDOW = 3600000;

  function checkRateLimit(userId) {
    const now = Date.now();
    let entry = rateLimits.get(userId);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
      entry = { start: now, count: 0 };
      rateLimits.set(userId, entry);
    }
    if (entry.count >= RATE_LIMIT_MAX) {
      throw new Error('AI rate limit exceeded. Max 50 calls per hour.');
    }
    entry.count++;
  }

  /* ─── Core AI call wrapper ─── */

  async function _aiCall(userId, feature, promptData, opts = {}) {
    const config = getAiConfig(userId);
    if (!config.apiKey && config.provider !== 'ollama') {
      throw new Error('No AI API key configured. Set your key in Settings → AI.');
    }
    checkRateLimit(userId);

    const callOpts = { temperature: opts.temperature ?? 0.7 };
    if (opts.maxTokens) callOpts.maxTokens = opts.maxTokens;
    if (promptData.jsonMode) callOpts.jsonMode = true;
    if (promptData.function && config.capabilities.functionCalling) {
      callOpts.functions = [promptData.function];
    }
    if (opts.timeout) callOpts.timeout = opts.timeout;

    const result = await provider.chatCompletion(config, promptData.messages, callOpts);

    // Log interaction
    const tokens = (result.usage?.prompt || 0) + (result.usage?.completion || 0);
    transparency.logInteraction(db, userId, feature, config.provider, tokens, false);

    // Parse JSON responses
    let parsed = result.content;
    if (promptData.jsonMode || result.functionCall) {
      try {
        parsed = JSON.parse(result.functionCall?.arguments || result.content);
      } catch {
        parsed = result.content; // return raw if parse fails
      }
    }

    return { data: parsed, usage: result.usage, provider: config.provider, model: config.model };
  }

  /* ─── Mark an AI suggestion as accepted ─── */
  function markAccepted(userId, feature) {
    try {
      const row = db.prepare('SELECT id FROM ai_interactions WHERE user_id = ? AND feature = ? ORDER BY created_at DESC LIMIT 1').get(userId, feature);
      if (row) db.prepare('UPDATE ai_interactions SET accepted = 1 WHERE id = ?').run(row.id);
    } catch { /* ignore */ }
  }

  /* ─── Public API: Phase 1 ─── */

  async function testConnection(userId) {
    const config = getAiConfig(userId);
    return provider.testConnection(config);
  }

  function getStatus(userId) {
    const config = getAiConfig(userId);
    const hasKey = !!(config.apiKey || config.provider === 'ollama');
    return {
      configured: hasKey && !!config.baseUrl && !!config.model,
      provider: config.provider,
      model: config.model,
      hasKey,
      capabilities: config.capabilities,
    };
  }

  function getPreFlight(userId, feature, data) {
    const config = getAiConfig(userId);
    const level = getMinimizationLevel(userId);
    return transparency.buildPreFlight(feature, config.provider, data, level);
  }

  /* ─── Public API: Phase 2 — Core Intelligence ─── */

  async function capture(userId, text, context = {}) {
    const level = getMinimizationLevel(userId);
    const promptData = buildCapturePrompt(text, context);
    return _aiCall(userId, 'capture', promptData, { temperature: 0.3, maxTokens: 500 });
  }

  async function classify(userId, task, context = {}) {
    const promptData = buildClassifyPrompt(task, context);
    return _aiCall(userId, 'classify', promptData, { temperature: 0.3, maxTokens: 300 });
  }

  async function decompose(userId, goal, context = {}) {
    const promptData = buildDecomposePrompt(goal, context);
    return _aiCall(userId, 'decompose', promptData, { maxTokens: 2000, timeout: 90000 });
  }

  async function planDay(userId, tasks, context = {}) {
    const level = getMinimizationLevel(userId);
    const minimized = transparency.minimizeList(tasks, level, transparency.minimizeTask);
    const promptData = buildDailyPlanPrompt(minimized, context);
    return _aiCall(userId, 'daily_plan', promptData, { maxTokens: 1500 });
  }

  async function nextTask(userId, tasks, context = {}) {
    const level = getMinimizationLevel(userId);
    const minimized = transparency.minimizeList(tasks, level, transparency.minimizeTask);
    const promptData = buildNextTaskPrompt(minimized, context);
    return _aiCall(userId, 'next_task', promptData, { temperature: 0.5, maxTokens: 300 });
  }

  async function reviewWeek(userId, weekData, context = {}) {
    const level = getMinimizationLevel(userId);
    if (weekData.completed) {
      weekData.completed = transparency.minimizeList(weekData.completed, level, transparency.minimizeTask);
    }
    if (weekData.overdue) {
      weekData.overdue = transparency.minimizeList(weekData.overdue, level, transparency.minimizeTask);
    }
    const promptData = buildReviewPrompt(weekData, context);
    return _aiCall(userId, 'review', promptData, { maxTokens: 1500 });
  }

  /* ─── Public API: Phase 3 — Engagement ─── */

  async function yearInReview(userId, yearData) {
    const promptData = buildYearInReviewPrompt(yearData);
    return _aiCall(userId, 'year_in_review', promptData, { maxTokens: 3000, timeout: 120000 });
  }

  async function cognitiveLoad(userId, userData) {
    const promptData = buildCognitiveLoadPrompt(userData);
    return _aiCall(userId, 'cognitive_load', promptData, { temperature: 0.3, maxTokens: 500 });
  }

  async function dailyHighlight(userId, dayData) {
    const promptData = buildDailyHighlightPrompt(dayData);
    return _aiCall(userId, 'daily_highlight', promptData, { maxTokens: 300 });
  }

  async function accountabilityCheck(userId, planned, completed, context = {}) {
    const level = getMinimizationLevel(userId);
    const pMin = transparency.minimizeList(planned, level, transparency.minimizeTask);
    const cMin = transparency.minimizeList(completed, level, transparency.minimizeTask);
    const promptData = buildAccountabilityPrompt(pMin, cMin, context);
    return _aiCall(userId, 'accountability', promptData, { maxTokens: 200 });
  }

  /* ─── Public API: Phase 4 — Advanced ─── */

  async function habitCoach(userId, habit, context = {}) {
    const promptData = buildHabitCoachPrompt(habit, context);
    return _aiCall(userId, 'habit_coach', promptData, { maxTokens: 500 });
  }

  async function lifeBalance(userId, areaData) {
    const promptData = buildLifeBalancePrompt(areaData);
    return _aiCall(userId, 'life_balance', promptData, { maxTokens: 800 });
  }

  async function buildAutomation(userId, description, context = {}) {
    const promptData = buildAutomationBuilderPrompt(description, context);
    return _aiCall(userId, 'automation_builder', promptData, { temperature: 0.3, maxTokens: 800 });
  }

  async function generateEmbedding(userId, text) {
    const config = getAiConfig(userId);
    return provider.generateEmbedding(config, text);
  }

  /* ─── Backward compat (old stub API) ─── */

  async function suggest(userId, taskTitle) {
    return capture(userId, taskTitle, {});
  }

  async function schedule(userId, taskIds) {
    // Check API key first (backward compat behavior)
    const config = getAiConfig(userId);
    if (!config.apiKey && config.provider !== 'ollama') {
      throw new Error('No AI API key configured. Set your key in Settings → AI.');
    }
    // Fetch tasks for planning
    const tasks = taskIds.length
      ? db.prepare(`SELECT * FROM tasks WHERE id IN (${taskIds.map(() => '?').join(',')}) AND user_id = ?`).all(...taskIds, userId)
      : [];
    if (!tasks.length) return { data: { plan: [], summary: 'No tasks to schedule' } };
    return planDay(userId, tasks, {});
  }

  /* ─── History & Stats ─── */

  function getHistory(userId, limit, offset) {
    return transparency.getInteractionHistory(db, userId, limit, offset);
  }

  function getUsageStats(userId) {
    return transparency.getUsageStats(db, userId);
  }

  return {
    // Encryption
    encrypt, decrypt, getUserApiKey,
    // Settings
    getSetting, setSetting, getAiConfig, getMinimizationLevel, getTransparencyMode,
    // Status
    testConnection, getStatus, getPreFlight,
    // Phase 2: Core Intelligence
    capture, classify, decompose, planDay, nextTask, reviewWeek,
    // Phase 3: Engagement
    yearInReview, cognitiveLoad, dailyHighlight, accountabilityCheck,
    // Phase 4: Advanced
    habitCoach, lifeBalance, buildAutomation, generateEmbedding,
    // History
    getHistory, getUsageStats, markAccepted,
    // Backward compat
    suggest, schedule,
  };
};
