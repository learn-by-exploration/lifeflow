const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Initialise the database: open, schema, migrations, seeds, FTS.
 * Returns { db, rebuildSearchIndex } so callers keep using the same
 * variable names the rest of the code already depends on.
 */
function initDatabase(dbDir) {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, 'lifeflow.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ─── Core tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS life_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📋',
      color TEXT DEFAULT '#2563EB',
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#6C63FF',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
      due_date TEXT,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (area_id) REFERENCES life_areas(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tasks (
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
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      note TEXT DEFAULT '',
      done INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#64748B'
    );
    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  // Migrate: add note column to subtasks if missing
  try { db.prepare("SELECT note FROM subtasks LIMIT 0").run(); } catch { db.exec("ALTER TABLE subtasks ADD COLUMN note TEXT DEFAULT ''"); }

  // ─── Task Dependencies table ───
  db.exec(`CREATE TABLE IF NOT EXISTS task_deps (
    task_id INTEGER NOT NULL,
    blocked_by_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, blocked_by_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_by_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  // ─── Task Templates table ───
  db.exec(`CREATE TABLE IF NOT EXISTS task_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '📋',
    tasks TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ─── Settings table (key-value) ───
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`);

  // ─── Saved Filters table ───
  db.exec(`CREATE TABLE IF NOT EXISTS saved_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🔍',
    color TEXT DEFAULT '#2563EB',
    filters TEXT NOT NULL DEFAULT '{}',
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ─── Due time column (nullable HH:MM) ───
  try { db.exec('ALTER TABLE tasks ADD COLUMN due_time TEXT DEFAULT NULL'); } catch(e) { /* already exists */ }

  // ─── Habits tables ───
  db.exec(`CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '✅',
    color TEXT DEFAULT '#22C55E',
    frequency TEXT DEFAULT 'daily',
    target INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    UNIQUE(habit_id, date),
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
  )`);

  // ─── Time block columns (nullable HH:MM) ───
  try { db.exec('ALTER TABLE tasks ADD COLUMN time_block_start TEXT DEFAULT NULL'); } catch(e) {}
  try { db.exec('ALTER TABLE tasks ADD COLUMN time_block_end TEXT DEFAULT NULL'); } catch(e) {}

  // ─── Task Comments table ───
  db.exec(`CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  // ─── Goal Milestones table ───
  db.exec(`CREATE TABLE IF NOT EXISTS goal_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    completed_at DATETIME,
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
  )`);

  // ─── Inbox table ───
  db.exec(`CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT DEFAULT '',
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ─── Time tracking columns on tasks ───
  try { db.exec('ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER DEFAULT NULL'); } catch(e) {}
  try { db.exec('ALTER TABLE tasks ADD COLUMN actual_minutes INTEGER DEFAULT 0'); } catch(e) {}

  // ─── Project Notes table ───
  db.exec(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
  )`);

  // ─── Weekly Reviews table ───
  db.exec(`CREATE TABLE IF NOT EXISTS weekly_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0,
    top_accomplishments TEXT DEFAULT '[]',
    reflection TEXT DEFAULT '',
    next_week_priorities TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ─── Life Areas migration: archived column ───
  try { db.exec('ALTER TABLE life_areas ADD COLUMN archived INTEGER DEFAULT 0'); } catch(e) {}

  // ─── Task Templates migration: user_created flag ───
  try { db.exec('ALTER TABLE task_templates ADD COLUMN user_created INTEGER DEFAULT 0'); } catch(e) {}

  // ─── Custom Lists tables ───
  db.exec(`CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'checklist',
    icon TEXT DEFAULT '📋',
    color TEXT DEFAULT '#2563EB',
    area_id INTEGER REFERENCES life_areas(id) ON DELETE SET NULL,
    parent_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
    share_token TEXT UNIQUE,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec('ALTER TABLE lists ADD COLUMN parent_id INTEGER REFERENCES lists(id) ON DELETE CASCADE'); } catch(e) {}
  db.exec(`CREATE TABLE IF NOT EXISTS list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    checked INTEGER DEFAULT 0,
    category TEXT,
    quantity TEXT,
    note TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec('CREATE INDEX idx_list_items_list ON list_items(list_id, position)'); } catch(e) {}
  try { db.exec('CREATE UNIQUE INDEX idx_lists_share ON lists(share_token) WHERE share_token IS NOT NULL'); } catch(e) {}
  try { db.exec('CREATE INDEX idx_lists_parent ON lists(parent_id)'); } catch(e) {}

  // ─── Add list_id to tasks ───
  try { db.exec('ALTER TABLE tasks ADD COLUMN list_id INTEGER REFERENCES lists(id) ON DELETE SET NULL'); } catch(e) {}

  // ─── Performance indexes on tasks ───
  try { db.exec('CREATE INDEX idx_tasks_goal ON tasks(goal_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX idx_tasks_status ON tasks(status)'); } catch(e) {}
  try { db.exec('CREATE INDEX idx_tasks_my_day ON tasks(my_day) WHERE my_day=1'); } catch(e) {}
  try { db.exec('CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL'); } catch(e) {}

  // ─── FTS5 Virtual Table for Global Search ───
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    type, source_id UNINDEXED, title, body, context,
    tokenize='porter unicode61'
  )`);

  // ─── Focus Sessions table ───
  db.exec(`CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration_sec INTEGER DEFAULT 0,
    type TEXT DEFAULT 'pomodoro',
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  // ─── Focus Session migrations ───
  try { db.exec('ALTER TABLE focus_sessions ADD COLUMN ended_at DATETIME'); } catch(e) {}
  try { db.exec('ALTER TABLE focus_sessions ADD COLUMN scheduled_at DATETIME'); } catch(e) {}

  // ─── Focus Session Meta table ───
  db.exec(`CREATE TABLE IF NOT EXISTS focus_session_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL UNIQUE,
    intention TEXT,
    reflection TEXT,
    focus_rating INTEGER DEFAULT 0 CHECK(focus_rating BETWEEN 0 AND 5),
    steps_planned INTEGER DEFAULT 0,
    steps_completed INTEGER DEFAULT 0,
    strategy TEXT DEFAULT 'pomodoro',
    FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
  )`);

  // ─── Focus Steps table ───
  db.exec(`CREATE TABLE IF NOT EXISTS focus_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    completed_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
  )`);

  // ─── Automation Rules table ───
  db.exec(`CREATE TABLE IF NOT EXISTS automation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT DEFAULT '{}',
    action_type TEXT NOT NULL,
    action_config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ─── Rebuild FTS Search Index ───
  function rebuildSearchIndex() {
    db.exec('DELETE FROM search_index');
    const ins = db.prepare('INSERT INTO search_index (type, source_id, title, body, context) VALUES (?,?,?,?,?)');
    const insertAll = db.transaction(() => {
      for (const t of db.prepare(`SELECT t.id, t.title, t.note, g.title as goal_title, a.name as area_name
        FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id`).all()) {
        ins.run('task', t.id, t.title, t.note || '', `${t.area_name} \u2192 ${t.goal_title}`);
      }
      for (const n of db.prepare('SELECT id, title, content FROM notes').all()) {
        ins.run('note', n.id, n.title, n.content || '', '');
      }
      for (const g of db.prepare(`SELECT g.id, g.title, g.description, a.name as area_name
        FROM goals g JOIN life_areas a ON g.area_id=a.id`).all()) {
        ins.run('goal', g.id, g.title, g.description || '', g.area_name);
      }
      for (const c of db.prepare(`SELECT tc.id, tc.text, t.title as task_title
        FROM task_comments tc JOIN tasks t ON tc.task_id=t.id`).all()) {
        ins.run('comment', c.id, '', c.text || '', c.task_title);
      }
      for (const i of db.prepare('SELECT id, title, note FROM inbox').all()) {
        ins.run('inbox', i.id, i.title, i.note || '', '');
      }
      for (const li of db.prepare('SELECT li.id, li.title, li.note, l.name as list_name FROM list_items li JOIN lists l ON li.list_id=l.id').all()) {
        ins.run('list', li.id, li.title, li.note || '', li.list_name);
      }
    });
    insertAll();
  }
  rebuildSearchIndex();

  // ─── Seed default data ───
  const cnt = db.prepare('SELECT COUNT(*) as c FROM life_areas').get();
  if (cnt.c === 0) {
    const ins = db.prepare('INSERT INTO life_areas (name,icon,color,position) VALUES (?,?,?,?)');
    ins.run('Health','💪','#22C55E',0);
    ins.run('Career','💼','#2563EB',1);
    ins.run('Home','🏠','#F59E0B',2);
    ins.run('Family','👨‍👩‍👧‍👦','#EF4444',3);
    ins.run('Finance','💰','#7C3AED',4);
    ins.run('Learning','📚','#0F766E',5);
  }
  const tc = db.prepare('SELECT COUNT(*) as c FROM tags').get();
  if (tc.c === 0) {
    const it = db.prepare('INSERT INTO tags (name,color) VALUES (?,?)');
    it.run('urgent','#EF4444'); it.run('blocked','#F59E0B'); it.run('quick-win','#22C55E');
    it.run('research','#7C3AED'); it.run('waiting','#64748B');
  }
  const tmplC = db.prepare('SELECT COUNT(*) as c FROM task_templates').get();
  if (tmplC.c === 0) {
    const it = db.prepare('INSERT INTO task_templates (name, description, icon, tasks) VALUES (?, ?, ?, ?)');
    it.run('Sprint Planning', 'Agile sprint setup checklist', '🏃', JSON.stringify([
      { title: 'Review previous sprint retro', priority: 1, subtasks: [] },
      { title: 'Groom & estimate backlog', priority: 2, subtasks: ['Clarify acceptance criteria', 'Break down large tickets', 'Add story point estimates'] },
      { title: 'Set sprint goal', priority: 2, subtasks: [] },
      { title: 'Assign stories to team', priority: 1, subtasks: [] },
      { title: 'Schedule sprint ceremonies', priority: 1, subtasks: ['Daily standup', 'Mid-sprint check-in', 'Sprint review', 'Retro'] }
    ]));
    it.run('Weekly Review', 'GTD-style weekly review', '📅', JSON.stringify([
      { title: 'Clear inbox to zero', priority: 2, subtasks: [] },
      { title: 'Review calendar (next 2 weeks)', priority: 1, subtasks: [] },
      { title: 'Review waiting-for list', priority: 1, subtasks: [] },
      { title: 'Review someday/maybe', priority: 0, subtasks: [] },
      { title: 'Define next week\'s top 3 priorities', priority: 3, subtasks: [] }
    ]));
    it.run('Bug Fix', 'Systematic debugging workflow', '🐛', JSON.stringify([
      { title: 'Reproduce the bug', priority: 2, subtasks: ['Document steps to reproduce', 'Identify environment/browser'] },
      { title: 'Identify root cause', priority: 2, subtasks: [] },
      { title: 'Write failing test', priority: 2, subtasks: [] },
      { title: 'Implement fix', priority: 2, subtasks: [] },
      { title: 'Verify fix + run test suite', priority: 1, subtasks: [] },
      { title: 'Update docs if needed', priority: 0, subtasks: [] }
    ]));
    it.run('Content Creation', 'Blog post or article pipeline', '✍️', JSON.stringify([
      { title: 'Research & outline', priority: 1, subtasks: ['Gather references', 'Create outline structure'] },
      { title: 'Write first draft', priority: 2, subtasks: [] },
      { title: 'Edit & proofread', priority: 1, subtasks: [] },
      { title: 'Add images / formatting', priority: 0, subtasks: [] },
      { title: 'Publish & share', priority: 1, subtasks: ['Publish on platform', 'Share on social media'] }
    ]));
    it.run('Project Launch', 'Ship a feature or product', '🚀', JSON.stringify([
      { title: 'Finalize scope & requirements', priority: 3, subtasks: [] },
      { title: 'Complete implementation', priority: 3, subtasks: [] },
      { title: 'Write tests', priority: 2, subtasks: ['Unit tests', 'Integration tests'] },
      { title: 'Code review', priority: 2, subtasks: [] },
      { title: 'QA / manual testing', priority: 2, subtasks: [] },
      { title: 'Deploy to staging', priority: 1, subtasks: [] },
      { title: 'Deploy to production', priority: 1, subtasks: [] },
      { title: 'Monitor post-launch', priority: 1, subtasks: [] }
    ]));
  }

  return { db, rebuildSearchIndex };
}

module.exports = initDatabase;
