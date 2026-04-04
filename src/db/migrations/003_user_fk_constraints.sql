-- Migration 003: Add user_id foreign key constraints to all data tables
--
-- Problem: 16 tables have user_id columns added via ALTER TABLE ADD COLUMN,
-- which cannot include REFERENCES in SQLite. This means there are no FK
-- constraints enforcing that user_id references a valid user.
--
-- Solution: Recreate each table with proper FK definitions using the standard
-- SQLite table-recreation approach (create new, copy, drop old, rename).
--
-- Tables affected (16):
--   life_areas, goals, tasks, tags, habits, saved_filters, inbox, notes,
--   weekly_reviews, lists, task_templates, badges, automation_rules,
--   focus_sessions, daily_reviews, audit_log
--
-- Table excluded:
--   settings — uses user_id=0 for system keys (_seed_completed, _data_watermark,
--   _last_restore), which would violate a FK constraint since user 0 doesn't exist.
--
-- Additional improvements:
--   - tags: UNIQUE(name) → UNIQUE(user_id, name) for multi-user support
--   - badges: UNIQUE(type) → UNIQUE(user_id, type) for multi-user support
--   - audit_log: ON DELETE SET NULL (preserve audit records when user is deleted)
--   - All others: ON DELETE CASCADE (delete user data when user is deleted)

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- ════════════════════════════════════════════════════════════════════
-- 1. life_areas
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_life_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  color TEXT DEFAULT '#2563EB',
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived INTEGER DEFAULT 0,
  default_view TEXT DEFAULT NULL,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_life_areas (id, name, icon, color, position, created_at, archived, default_view, user_id)
  SELECT id, name, icon, color, position, created_at, archived, default_view, COALESCE(user_id, 1) FROM life_areas;
DROP TABLE IF EXISTS life_areas;
ALTER TABLE new_life_areas RENAME TO life_areas;
CREATE INDEX idx_life_areas_user ON life_areas(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 2. goals
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#6C63FF',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
  due_date TEXT,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (area_id) REFERENCES life_areas(id) ON DELETE CASCADE
);
INSERT INTO new_goals (id, area_id, title, description, color, status, due_date, position, created_at, user_id)
  SELECT id, area_id, title, description, color, status, due_date, position, created_at, COALESCE(user_id, 1) FROM goals;
DROP TABLE IF EXISTS goals;
ALTER TABLE new_goals RENAME TO goals;
CREATE INDEX idx_goals_user ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(user_id, status);
CREATE INDEX idx_goals_area_status ON goals(area_id, status);
CREATE INDEX idx_goals_user_area ON goals(user_id, area_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. lists (before tasks, since tasks references lists)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checklist',
  icon TEXT DEFAULT '📋',
  color TEXT DEFAULT '#2563EB',
  area_id INTEGER REFERENCES life_areas(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  view_mode TEXT DEFAULT 'list',
  board_columns TEXT DEFAULT NULL,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_lists (id, name, type, icon, color, area_id, parent_id, share_token, position, created_at, view_mode, board_columns, user_id)
  SELECT id, name, type, icon, color, area_id, parent_id, share_token, position, created_at, view_mode, board_columns, COALESCE(user_id, 1) FROM lists;
DROP TABLE IF EXISTS lists;
ALTER TABLE new_lists RENAME TO lists;
CREATE UNIQUE INDEX idx_lists_share ON lists(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_lists_parent ON lists(parent_id);
CREATE INDEX idx_lists_area ON lists(area_id);
CREATE INDEX idx_lists_user ON lists(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 4. tasks
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
  priority INTEGER DEFAULT 0 CHECK(priority IN (0,1,2,3)),
  due_date TEXT,
  recurring TEXT,
  assigned_to TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  my_day INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  due_time TEXT DEFAULT NULL,
  time_block_start TEXT DEFAULT NULL,
  time_block_end TEXT DEFAULT NULL,
  estimated_minutes INTEGER DEFAULT NULL,
  actual_minutes INTEGER DEFAULT 0,
  list_id INTEGER REFERENCES lists(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  assigned_to_user_id INTEGER REFERENCES users(id),
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);
INSERT INTO new_tasks (id, goal_id, title, note, status, priority, due_date, recurring, assigned_to, position, my_day, created_at, completed_at, due_time, time_block_start, time_block_end, estimated_minutes, actual_minutes, list_id, user_id, assigned_to_user_id)
  SELECT id, goal_id, title, note, status, priority, due_date, recurring, assigned_to, position, my_day, created_at, completed_at, due_time, time_block_start, time_block_end, estimated_minutes, actual_minutes, list_id, COALESCE(user_id, 1), assigned_to_user_id FROM tasks;
DROP TABLE IF EXISTS tasks;
ALTER TABLE new_tasks RENAME TO tasks;
CREATE INDEX idx_tasks_goal ON tasks(goal_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_my_day ON tasks(my_day) WHERE my_day=1;
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_goal_status ON tasks(goal_id, status);
CREATE INDEX idx_tasks_completed_at ON tasks(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_tasks_user_goal ON tasks(user_id, goal_id);
CREATE INDEX idx_tasks_user_myday ON tasks(user_id, my_day) WHERE my_day = 1;
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_due ON tasks(user_id, due_date) WHERE due_date IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 5. tags (UNIQUE(name) → UNIQUE(user_id, name) for multi-user)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#64748B',
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)
);
INSERT INTO new_tags (id, name, color, user_id)
  SELECT id, name, color, COALESCE(user_id, 1) FROM tags;
DROP TABLE IF EXISTS tags;
ALTER TABLE new_tags RENAME TO tags;
CREATE INDEX idx_tags_user ON tags(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 6. habits
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '✅',
  color TEXT DEFAULT '#22C55E',
  frequency TEXT DEFAULT 'daily',
  target INTEGER DEFAULT 1,
  position INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  area_id INTEGER DEFAULT NULL,
  schedule_days TEXT DEFAULT NULL,
  preferred_time TEXT DEFAULT NULL,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_habits (id, name, icon, color, frequency, target, position, archived, created_at, area_id, schedule_days, preferred_time, user_id)
  SELECT id, name, icon, color, frequency, target, position, archived, created_at, area_id, schedule_days, preferred_time, COALESCE(user_id, 1) FROM habits;
DROP TABLE IF EXISTS habits;
ALTER TABLE new_habits RENAME TO habits;
CREATE INDEX idx_habits_user ON habits(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 7. saved_filters
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_saved_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🔍',
  color TEXT DEFAULT '#2563EB',
  filters TEXT NOT NULL DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_saved_filters (id, name, icon, color, filters, position, created_at, user_id)
  SELECT id, name, icon, color, filters, position, created_at, COALESCE(user_id, 1) FROM saved_filters;
DROP TABLE IF EXISTS saved_filters;
ALTER TABLE new_saved_filters RENAME TO saved_filters;
CREATE INDEX idx_saved_filters_user ON saved_filters(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 8. inbox
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  note TEXT DEFAULT '',
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_inbox (id, title, note, priority, created_at, user_id)
  SELECT id, title, note, priority, created_at, COALESCE(user_id, 1) FROM inbox;
DROP TABLE IF EXISTS inbox;
ALTER TABLE new_inbox RENAME TO inbox;
CREATE INDEX idx_inbox_user ON inbox(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 9. notes
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);
INSERT INTO new_notes (id, goal_id, title, content, created_at, updated_at, user_id)
  SELECT id, goal_id, title, content, created_at, updated_at, COALESCE(user_id, 1) FROM notes;
DROP TABLE IF EXISTS notes;
ALTER TABLE new_notes RENAME TO notes;
CREATE INDEX idx_notes_goal ON notes(goal_id);
CREATE INDEX idx_notes_user ON notes(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 10. weekly_reviews
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_weekly_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  tasks_created INTEGER DEFAULT 0,
  top_accomplishments TEXT DEFAULT '[]',
  reflection TEXT DEFAULT '',
  next_week_priorities TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rating INTEGER DEFAULT NULL,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_weekly_reviews (id, week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities, created_at, rating, user_id)
  SELECT id, week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities, created_at, rating, COALESCE(user_id, 1) FROM weekly_reviews;
DROP TABLE IF EXISTS weekly_reviews;
ALTER TABLE new_weekly_reviews RENAME TO weekly_reviews;
CREATE INDEX idx_weekly_reviews_week ON weekly_reviews(week_start);
CREATE INDEX idx_weekly_reviews_user ON weekly_reviews(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 11. task_templates
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_task_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '📋',
  tasks TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_created INTEGER DEFAULT 0,
  source_type TEXT DEFAULT 'task',
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_task_templates (id, name, description, icon, tasks, created_at, user_created, source_type, user_id)
  SELECT id, name, description, icon, tasks, created_at, user_created, source_type, COALESCE(user_id, 1) FROM task_templates;
DROP TABLE IF EXISTS task_templates;
ALTER TABLE new_task_templates RENAME TO task_templates;
CREATE INDEX idx_task_templates_user ON task_templates(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 12. badges (UNIQUE(type) → UNIQUE(user_id, type) for multi-user)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, type)
);
INSERT INTO new_badges (id, type, earned_at, user_id)
  SELECT id, type, earned_at, COALESCE(user_id, 1) FROM badges;
DROP TABLE IF EXISTS badges;
ALTER TABLE new_badges RENAME TO badges;
CREATE INDEX idx_badges_user ON badges(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 13. automation_rules
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_automation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config TEXT DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config TEXT DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO new_automation_rules (id, name, trigger_type, trigger_config, action_type, action_config, enabled, created_at, user_id)
  SELECT id, name, trigger_type, trigger_config, action_type, action_config, enabled, created_at, COALESCE(user_id, 1) FROM automation_rules;
DROP TABLE IF EXISTS automation_rules;
ALTER TABLE new_automation_rules RENAME TO automation_rules;
CREATE INDEX idx_automation_rules_user ON automation_rules(user_id);

-- ════════════════════════════════════════════════════════════════════
-- 14. focus_sessions
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_focus_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_sec INTEGER DEFAULT 0,
  type TEXT DEFAULT 'pomodoro',
  ended_at DATETIME,
  scheduled_at DATETIME,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
INSERT INTO new_focus_sessions (id, task_id, started_at, duration_sec, type, ended_at, scheduled_at, user_id)
  SELECT id, task_id, started_at, duration_sec, type, ended_at, scheduled_at, COALESCE(user_id, 1) FROM focus_sessions;
DROP TABLE IF EXISTS focus_sessions;
ALTER TABLE new_focus_sessions RENAME TO focus_sessions;
CREATE INDEX idx_focus_sessions_task ON focus_sessions(task_id);
CREATE INDEX idx_focus_sessions_user ON focus_sessions(user_id, started_at);

-- ════════════════════════════════════════════════════════════════════
-- 15. daily_reviews
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_daily_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  completed_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date)
);
INSERT INTO new_daily_reviews (id, user_id, date, note, completed_count, created_at)
  SELECT id, COALESCE(user_id, 1), date, note, completed_count, created_at FROM daily_reviews;
DROP TABLE IF EXISTS daily_reviews;
ALTER TABLE new_daily_reviews RENAME TO daily_reviews;

-- ════════════════════════════════════════════════════════════════════
-- 16. audit_log (ON DELETE SET NULL — preserve audit records)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE new_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  ip TEXT,
  ua TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO new_audit_log (id, user_id, action, resource, resource_id, ip, ua, detail, created_at)
  SELECT id, user_id, action, resource, resource_id, ip, ua, detail, created_at FROM audit_log;
DROP TABLE IF EXISTS audit_log;
ALTER TABLE new_audit_log RENAME TO audit_log;
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

COMMIT;

-- Re-enable FK enforcement and verify integrity
PRAGMA foreign_keys=ON;
