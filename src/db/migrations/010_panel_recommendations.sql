-- Migration 010: Expert Panel Recommendations
-- Implements: problem_type classification, shelve_reason, emotional validation,
-- stakeholder entities, phase transition tracking, expanded journal types,
-- and crisis detection support.

-- 1. Problem type classification (Behavioral Economist: auto-diagnostic)
--    "Is this a problem to solve, a decision to make, or a feeling to process?"
ALTER TABLE problems ADD COLUMN problem_type TEXT DEFAULT 'unclassified'
  CHECK(problem_type IN ('solve','decide','process','unclassified'));

-- 2. Shelve reason (Clinical Psychologist: shelving without closure creates anxiety loops)
ALTER TABLE problems ADD COLUMN shelve_reason TEXT;

-- 3. Emotional validation flag (Clinical Psychologist: validate before reframing)
ALTER TABLE problems ADD COLUMN validated INTEGER DEFAULT 0;

-- 4. Stakeholder entities (Life Coach: structured, not freetext)
CREATE TABLE IF NOT EXISTS problem_stakeholders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  influence TEXT CHECK(influence IN ('high','medium','low')),
  impact TEXT CHECK(impact IN ('high','medium','low')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_stakeholders_problem ON problem_stakeholders(problem_id);

-- 5. Phase transition tracking (Life Coach: "the breakthrough happens between phases")
--    Records emotional state + reflection at every phase change
CREATE TABLE IF NOT EXISTS problem_phase_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  emotional_state TEXT,
  reflection TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_phase_transitions_problem ON problem_phase_transitions(problem_id);

-- 6. Expand journal entry types (add phase_transition, values_clarification)
--    Must recreate table since SQLite can't alter CHECK constraints
CREATE TABLE IF NOT EXISTS problem_journal_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  content TEXT NOT NULL,
  entry_type TEXT DEFAULT 'reflection'
    CHECK(entry_type IN ('reflection','insight','question','breakthrough','setback',
      'observation','lesson','phase_transition','values_clarification')),
  emotional_state TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO problem_journal_v3 (id, problem_id, user_id, phase, content, entry_type, emotional_state, created_at)
  SELECT id, problem_id, user_id, phase, content, entry_type, emotional_state, created_at
  FROM problem_journal;

DROP TABLE IF EXISTS problem_journal;
ALTER TABLE problem_journal_v3 RENAME TO problem_journal;

CREATE INDEX IF NOT EXISTS idx_problem_journal_problem ON problem_journal(problem_id);
