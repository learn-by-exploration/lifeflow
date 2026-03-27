-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_goal_status ON tasks(goal_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_goals_area_status ON goals(area_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_area ON goals(user_id, area_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_goal ON tasks(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_myday ON tasks(user_id, my_day) WHERE my_day = 1;
