-- Migration 007: Phase 2-3 features
-- Gamification: XP points and productivity goals
CREATE TABLE IF NOT EXISTS user_xp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_xp_user ON user_xp(user_id, created_at);

ALTER TABLE users ADD COLUMN xp_total INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN xp_level INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN daily_goal INTEGER DEFAULT 5;
ALTER TABLE users ADD COLUMN weekly_goal INTEGER DEFAULT 25;

-- File attachments
CREATE TABLE IF NOT EXISTS task_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

-- Custom statuses per goal
CREATE TABLE IF NOT EXISTS custom_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  position INTEGER DEFAULT 0,
  is_done INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_custom_statuses_goal ON custom_statuses(goal_id);

-- Nested subtasks: add parent_id column
ALTER TABLE subtasks ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES subtasks(id) ON DELETE CASCADE;
