-- Migration 004: Advanced Automation System
-- Adds execution logging, multi-action support, templates, suggestions, and scheduling columns
-- NOTE: ALTER TABLE statements use SELECT to check if column exists first (SQLite compat)

-- ─── Automation execution log ───
CREATE TABLE IF NOT EXISTS automation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER REFERENCES automation_rules(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_context TEXT DEFAULT '{}',
  actions_executed TEXT DEFAULT '[]',
  status TEXT DEFAULT 'success',
  error TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_automation_log_user_date ON automation_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_log_rule ON automation_log(rule_id);

-- ─── Automation templates ───
CREATE TABLE IF NOT EXISTS automation_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  icon TEXT DEFAULT '⚡',
  trigger_type TEXT NOT NULL,
  trigger_config TEXT DEFAULT '{}',
  conditions TEXT DEFAULT NULL,
  actions TEXT NOT NULL,
  customizable_fields TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Automation suggestions ───
CREATE TABLE IF NOT EXISTS automation_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,
  template_id TEXT DEFAULT NULL,
  reason TEXT DEFAULT '',
  context TEXT DEFAULT '{}',
  dismissed INTEGER DEFAULT 0,
  dismissed_permanently INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_automation_suggestions_user ON automation_suggestions(user_id, dismissed);
