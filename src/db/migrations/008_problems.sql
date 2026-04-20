-- Migration 008: Problems feature (Phase 1 — Core MVP)
-- Structured problem-solving with lifecycle phases, journals, reframes, and options.

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'uncategorized',
  phase TEXT NOT NULL DEFAULT 'capture'
    CHECK(phase IN ('capture','diagnose','explore','decide','act','review','resolved','shelved')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','paused','resolved','abandoned','shelved')),
  urgency INTEGER DEFAULT 0 CHECK(urgency BETWEEN 0 AND 3),
  importance INTEGER DEFAULT 0 CHECK(importance BETWEEN 0 AND 3),
  emotional_state TEXT,
  privacy_level TEXT DEFAULT 'normal'
    CHECK(privacy_level IN ('normal','private','encrypted')),
  deadline TEXT,
  stakeholders TEXT,
  goal_id INTEGER REFERENCES goals(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_problems_user ON problems(user_id);
CREATE INDEX IF NOT EXISTS idx_problems_user_phase ON problems(user_id, phase);
CREATE INDEX IF NOT EXISTS idx_problems_user_status ON problems(user_id, status);
CREATE INDEX IF NOT EXISTS idx_problems_user_category ON problems(user_id, category);

CREATE TABLE IF NOT EXISTS problem_reframes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reframe_text TEXT NOT NULL,
  source TEXT DEFAULT 'user' CHECK(source IN ('user','ai')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_reframes_problem ON problem_reframes(problem_id);

CREATE TABLE IF NOT EXISTS problem_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  pros TEXT,
  cons TEXT,
  effort INTEGER CHECK(effort BETWEEN 1 AND 5),
  impact INTEGER CHECK(impact BETWEEN 1 AND 5),
  risk INTEGER CHECK(risk BETWEEN 1 AND 5),
  emotional_fit INTEGER CHECK(emotional_fit BETWEEN 1 AND 5),
  source TEXT DEFAULT 'user' CHECK(source IN ('user','ai')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_options_problem ON problem_options(problem_id);

CREATE TABLE IF NOT EXISTS problem_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chosen_option_id INTEGER REFERENCES problem_options(id),
  rationale TEXT,
  confidence_level INTEGER CHECK(confidence_level BETWEEN 1 AND 5),
  decision_date TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_decisions_problem ON problem_decisions(problem_id);

CREATE TABLE IF NOT EXISTS problem_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision_id INTEGER REFERENCES problem_decisions(id),
  task_id INTEGER REFERENCES tasks(id),
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done','skipped')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_actions_problem ON problem_actions(problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_actions_task ON problem_actions(task_id);

CREATE TABLE IF NOT EXISTS problem_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  content TEXT NOT NULL,
  entry_type TEXT DEFAULT 'reflection'
    CHECK(entry_type IN ('reflection','insight','question','breakthrough','setback')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_problem_journal_problem ON problem_journal(problem_id);

CREATE TABLE IF NOT EXISTS problem_tags (
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, tag_id)
);

CREATE TABLE IF NOT EXISTS problem_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  linked_problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  link_type TEXT DEFAULT 'related'
    CHECK(link_type IN ('related','causes','blocks','child_of','duplicate')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(problem_id, linked_problem_id)
);

CREATE INDEX IF NOT EXISTS idx_problem_links_problem ON problem_links(problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_links_linked ON problem_links(linked_problem_id);
