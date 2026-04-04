/**
 * AI Transparency Service — prompt logging, data minimization, pre-flight data.
 * Wraps all AI calls with logging and data control.
 */
'use strict';

const crypto = require('crypto');

/**
 * Data minimization levels:
 * - strict: Only titles and counts. No notes, descriptions, or custom field values.
 * - standard: Titles + short descriptions (truncated). No full notes.
 * - full: Everything included in prompts.
 */
const MINIMIZATION_LEVELS = {
  strict: {
    includeNotes: false,
    includeTags: true,
    includeDescriptions: false,
    includeCustomFields: false,
    maxTitleLength: 100,
    maxItems: 20,
  },
  standard: {
    includeNotes: false,
    includeTags: true,
    includeDescriptions: true,
    includeCustomFields: false,
    maxTitleLength: 200,
    maxDescLength: 200,
    maxItems: 50,
  },
  full: {
    includeNotes: true,
    includeTags: true,
    includeDescriptions: true,
    includeCustomFields: true,
    maxTitleLength: 500,
    maxDescLength: 1000,
    maxItems: 100,
  },
};

/**
 * Minimize a task object based on data minimization level.
 */
function minimizeTask(task, level) {
  const rules = MINIMIZATION_LEVELS[level] || MINIMIZATION_LEVELS.standard;
  const t = {
    title: (task.title || '').slice(0, rules.maxTitleLength),
    status: task.status,
    priority: task.priority,
  };
  if (task.due_date) t.due_date = task.due_date;
  if (task.due_time) t.due_time = task.due_time;
  if (task.estimated_minutes) t.estimated_minutes = task.estimated_minutes;
  if (task.actual_minutes) t.actual_minutes = task.actual_minutes;
  if (task.recurring) t.recurring = task.recurring;
  if (rules.includeTags && task.tags?.length) {
    t.tags = task.tags.map(tag => tag.name || tag);
  }
  if (rules.includeDescriptions && task.note) {
    t.note = task.note.slice(0, rules.maxDescLength || 200);
  }
  if (rules.includeNotes && task.note) {
    t.note = task.note;
  }
  return t;
}

/**
 * Minimize a goal object.
 */
function minimizeGoal(goal, level) {
  const rules = MINIMIZATION_LEVELS[level] || MINIMIZATION_LEVELS.standard;
  const g = {
    title: (goal.title || '').slice(0, rules.maxTitleLength),
    status: goal.status,
  };
  if (goal.due_date) g.due_date = goal.due_date;
  if (rules.includeDescriptions && goal.description) {
    g.description = goal.description.slice(0, rules.maxDescLength || 200);
  }
  return g;
}

/**
 * Minimize a list of items, respecting maxItems.
 */
function minimizeList(items, level, minimizeFn) {
  const rules = MINIMIZATION_LEVELS[level] || MINIMIZATION_LEVELS.standard;
  return items.slice(0, rules.maxItems).map(item => minimizeFn(item, level));
}

/**
 * Build pre-flight disclosure data — what the user will see before sending.
 */
function buildPreFlight(feature, provider, data, level) {
  const rules = MINIMIZATION_LEVELS[level] || MINIMIZATION_LEVELS.standard;
  const fields = [];
  if (data.tasks) fields.push(`${Math.min(data.tasks.length, rules.maxItems)} tasks (titles${rules.includeNotes ? ', notes' : ''}${rules.includeTags ? ', tags' : ''})`);
  if (data.goals) fields.push(`${Math.min(data.goals.length, rules.maxItems)} goals`);
  if (data.habits) fields.push(`${Math.min(data.habits.length, rules.maxItems)} habits`);
  if (data.areas) fields.push(`${data.areas.length} life areas`);
  if (data.focusSessions) fields.push(`${data.focusSessions.length} focus sessions`);
  if (data.text) fields.push('input text');

  return {
    feature,
    provider,
    dataIncluded: fields,
    minimizationLevel: level,
    estimatedTokens: _estimateTokens(data),
  };
}

/**
 * Rough token estimation (~4 chars per token).
 */
function _estimateTokens(data) {
  const json = JSON.stringify(data);
  return Math.ceil(json.length / 4);
}

/**
 * Log an AI interaction to the database.
 */
function logInteraction(db, userId, feature, provider, tokensUsed, accepted) {
  try {
    const promptHash = crypto.randomBytes(16).toString('hex'); // placeholder
    db.prepare(`INSERT INTO ai_interactions (user_id, feature, provider, prompt_hash, tokens_used, accepted) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(userId, feature, provider, promptHash, tokensUsed || 0, accepted ? 1 : 0);
  } catch {
    // Don't fail the AI call if logging fails
  }
}

/**
 * Get AI interaction history for a user.
 */
function getInteractionHistory(db, userId, limit = 50, offset = 0) {
  return db.prepare(`SELECT id, feature, provider, tokens_used, accepted, created_at FROM ai_interactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(userId, limit, offset);
}

/**
 * Get AI usage stats for a user.
 */
function getUsageStats(db, userId) {
  const row = db.prepare(`SELECT COUNT(*) as total_calls, SUM(tokens_used) as total_tokens, SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) as accepted_count FROM ai_interactions WHERE user_id = ?`).get(userId);
  const byFeature = db.prepare(`SELECT feature, COUNT(*) as count, SUM(tokens_used) as tokens FROM ai_interactions WHERE user_id = ? GROUP BY feature ORDER BY count DESC`).all(userId);
  return { ...row, byFeature };
}

module.exports = {
  MINIMIZATION_LEVELS,
  minimizeTask,
  minimizeGoal,
  minimizeList,
  buildPreFlight,
  logInteraction,
  getInteractionHistory,
  getUsageStats,
};
