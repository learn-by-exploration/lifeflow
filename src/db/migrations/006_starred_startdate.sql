-- Migration 006: Add starred and start_date columns to tasks
ALTER TABLE tasks ADD COLUMN starred INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN start_date TEXT DEFAULT NULL;

-- Index for starred tasks (common filter)
CREATE INDEX IF NOT EXISTS idx_tasks_starred ON tasks(user_id, starred);
-- Index for start_date (used in Gantt/calendar range queries)
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(user_id, start_date);
-- Index for audit_log resource lookups (for per-task activity feed)
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource, resource_id);
