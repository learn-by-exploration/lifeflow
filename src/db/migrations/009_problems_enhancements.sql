-- 009: Problems feature enhancements
-- Adds revisit_date to decisions, due_date to actions, emotional_state to journal
-- Recreates problem_journal to update CHECK constraint with new entry types

ALTER TABLE problem_decisions ADD COLUMN revisit_date TEXT;
ALTER TABLE problem_actions ADD COLUMN due_date TEXT;

-- Recreate journal table with updated CHECK constraint and emotional_state
CREATE TABLE IF NOT EXISTS problem_journal_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  content TEXT NOT NULL,
  entry_type TEXT DEFAULT 'reflection'
    CHECK(entry_type IN ('reflection','insight','question','breakthrough','setback','observation','lesson')),
  emotional_state TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO problem_journal_new (id, problem_id, user_id, phase, content, entry_type, created_at)
  SELECT id, problem_id, user_id, phase, content, entry_type, created_at FROM problem_journal;

DROP TABLE IF EXISTS problem_journal;
ALTER TABLE problem_journal_new RENAME TO problem_journal;

CREATE INDEX IF NOT EXISTS idx_problem_journal_problem ON problem_journal(problem_id);
