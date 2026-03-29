const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

  // ─── Auth tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      remember INTEGER DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

  // ─── Habits area link ───
  try { db.exec('ALTER TABLE habits ADD COLUMN area_id INTEGER DEFAULT NULL'); } catch(e) { /* already exists */ }
  // ─── Habits schedule days (JSON array, e.g. ["mon","wed","fri"] or [1,15]) ───
  try { db.exec('ALTER TABLE habits ADD COLUMN schedule_days TEXT DEFAULT NULL'); } catch(e) { /* already exists */ }
  // ─── Habits preferred time (HH:MM format) ───
  try { db.exec('ALTER TABLE habits ADD COLUMN preferred_time TEXT DEFAULT NULL'); } catch(e) { /* already exists */ }

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

  // ─── Weekly Review rating column ───
  try { db.exec('ALTER TABLE weekly_reviews ADD COLUMN rating INTEGER DEFAULT NULL'); } catch(e) {}

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

  // ─── Security: Additional performance indexes (S4) ───
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(user_id, status)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_lists_area ON lists(area_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_notes_goal ON notes(goal_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_weekly_reviews_week ON weekly_reviews(week_start)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_habit_logs_composite ON habit_logs(habit_id, log_date)'); } catch(e) {}
  // ─── Sprint 4: Compound user+filter indexes for common query patterns ───
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date) WHERE due_date IS NOT NULL'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON focus_sessions(user_id, started_at)'); } catch(e) {}

  // ─── FTS5 Virtual Table for Global Search ───
  // Migrate: if search_index lacks user_id column, drop and recreate
  try {
    db.prepare('SELECT user_id FROM search_index LIMIT 0').all();
  } catch {
    db.exec('DROP TABLE IF EXISTS search_index');
  }
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    type, source_id UNINDEXED, user_id UNINDEXED, title, body, context,
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

  // ─── Life Areas default_view ───
  try { db.exec('ALTER TABLE life_areas ADD COLUMN default_view TEXT DEFAULT NULL'); } catch(e) {}

  // ─── Task Templates source_type ───
  try { db.exec("ALTER TABLE task_templates ADD COLUMN source_type TEXT DEFAULT 'task'"); } catch(e) {}

  // ─── Badges table (Phase 5) ───
  db.exec(`CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL UNIQUE,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  // ─── User-scoping: add user_id to all data tables ───
  const userIdTables = [
    'life_areas', 'goals', 'tasks', 'tags', 'habits', 'saved_filters',
    'inbox', 'notes', 'weekly_reviews', 'lists', 'task_templates',
    'badges', 'automation_rules', 'focus_sessions', 'settings'
  ];
  for (const tbl of userIdTables) {
    try { db.exec(`ALTER TABLE ${tbl} ADD COLUMN user_id INTEGER DEFAULT 1`); } catch(e) { /* already exists */ }
  }
  // Index for fast per-user queries
  for (const tbl of userIdTables) {
    try { db.exec(`CREATE INDEX idx_${tbl}_user ON ${tbl}(user_id)`); } catch(e) { /* already exists */ }
  }

  // ─── Daily Reviews table ───
  db.exec(`CREATE TABLE IF NOT EXISTS daily_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    completed_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  )`);

  // ─── Multi-user assignment column ───
  try { db.exec('ALTER TABLE tasks ADD COLUMN assigned_to_user_id INTEGER REFERENCES users(id)'); } catch(e) { /* already exists */ }

  // ─── Migrate settings to composite PK (user_id, key) for multi-user ───
  const settingsInfo = db.prepare("PRAGMA table_info(settings)").all();
  const keyCol = settingsInfo.find(c => c.name === 'key' && c.pk === 1);
  if (keyCol) {
    const migrateTx = db.transaction(() => {
      db.exec(`
        CREATE TABLE settings_v2 (user_id INTEGER NOT NULL DEFAULT 1, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user_id, key));
        INSERT OR IGNORE INTO settings_v2 (user_id, key, value) SELECT COALESCE(user_id, 1), key, value FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_v2 RENAME TO settings;
      `);
    });
    try { migrateTx(); } catch(e) { /* migration may have already run */ }
  }

  // ─── Auto-create default user on first boot ───
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (userCount.c === 0) {
    // Use bcryptjs if available, otherwise store a placeholder hash
    // (server.js will ensure bcryptjs is loaded before DB init)
    try {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('changeme', 12);
      db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
        'admin@localhost', hash, 'Admin'
      );
    } catch(e) {
      // bcryptjs not available at init time — will be created on first register
    }
  }

  // ─── Session cleanup: remove expired sessions ───
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  // ─── Rebuild FTS Search Index ───
  function rebuildSearchIndex() {
    db.exec('DELETE FROM search_index');
    const ins = db.prepare('INSERT INTO search_index (type, source_id, user_id, title, body, context) VALUES (?,?,?,?,?,?)');
    const insertAll = db.transaction(() => {
      for (const t of db.prepare(`SELECT t.id, t.title, t.note, t.user_id, g.title as goal_title, a.name as area_name
        FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id`).all()) {
        ins.run('task', t.id, t.user_id, t.title, t.note || '', `${t.area_name} \u2192 ${t.goal_title}`);
      }
      for (const n of db.prepare(`SELECT n.id, n.title, n.content, g.user_id
        FROM notes n LEFT JOIN goals g ON n.goal_id=g.id`).all()) {
        ins.run('note', n.id, n.user_id || null, n.title, n.content || '', '');
      }
      for (const g of db.prepare(`SELECT g.id, g.title, g.description, g.user_id, a.name as area_name
        FROM goals g JOIN life_areas a ON g.area_id=a.id`).all()) {
        ins.run('goal', g.id, g.user_id, g.title, g.description || '', g.area_name);
      }
      for (const c of db.prepare(`SELECT tc.id, tc.text, t.user_id, t.title as task_title
        FROM task_comments tc JOIN tasks t ON tc.task_id=t.id`).all()) {
        ins.run('comment', c.id, c.user_id, '', c.text || '', c.task_title);
      }
      for (const i of db.prepare('SELECT id, title, note, user_id FROM inbox').all()) {
        ins.run('inbox', i.id, i.user_id, i.title, i.note || '', '');
      }
      for (const li of db.prepare('SELECT li.id, li.title, li.note, l.user_id, l.name as list_name FROM list_items li JOIN lists l ON li.list_id=l.id').all()) {
        ins.run('list', li.id, li.user_id, li.title, li.note || '', li.list_name);
      }
    });
    insertAll();
  }
  rebuildSearchIndex();

  // ─── Seed default data for user 1 (if first boot and user exists) ───
  const cnt = db.prepare('SELECT COUNT(*) as c FROM life_areas').get();
  const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  if (cnt.c === 0 && firstUser) {
    const uid = firstUser.id;
    const ins = db.prepare('INSERT INTO life_areas (name,icon,color,position,user_id) VALUES (?,?,?,?,?)');
    ins.run('Health','💪','#22C55E',0,uid);
    ins.run('Career','💼','#2563EB',1,uid);
    ins.run('Home','🏠','#F59E0B',2,uid);
    ins.run('Family','👨‍👩‍👧‍👦','#EF4444',3,uid);
    ins.run('Finance','💰','#7C3AED',4,uid);
    ins.run('Learning','📚','#0F766E',5,uid);
  }
  const tc = db.prepare('SELECT COUNT(*) as c FROM tags').get();
  if (tc.c === 0 && firstUser) {
    const uid = firstUser.id;
    const it = db.prepare('INSERT INTO tags (name,color,user_id) VALUES (?,?,?)');
    it.run('urgent','#EF4444',uid); it.run('blocked','#F59E0B',uid); it.run('quick-win','#22C55E',uid);
    it.run('research','#7C3AED',uid); it.run('waiting','#64748B',uid);
  }
  const tmplC = db.prepare('SELECT COUNT(*) as c FROM task_templates').get();
  if (tmplC.c === 0 && firstUser) {
    const uid = firstUser.id;
    const it = db.prepare('INSERT INTO task_templates (name, description, icon, tasks, user_id) VALUES (?, ?, ?, ?, ?)');
    it.run('Sprint Planning', 'Agile sprint setup checklist', '🏃', JSON.stringify([
      { title: 'Review previous sprint retro', priority: 1, subtasks: [] },
      { title: 'Groom & estimate backlog', priority: 2, subtasks: ['Clarify acceptance criteria', 'Break down large tickets', 'Add story point estimates'] },
      { title: 'Set sprint goal', priority: 2, subtasks: [] },
      { title: 'Assign stories to team', priority: 1, subtasks: [] },
      { title: 'Schedule sprint ceremonies', priority: 1, subtasks: ['Daily standup', 'Mid-sprint check-in', 'Sprint review', 'Retro'] }
    ]), uid);
    it.run('Weekly Review', 'GTD-style weekly review', '📅', JSON.stringify([
      { title: 'Clear inbox to zero', priority: 2, subtasks: [] },
      { title: 'Review calendar (next 2 weeks)', priority: 1, subtasks: [] },
      { title: 'Review waiting-for list', priority: 1, subtasks: [] },
      { title: 'Review someday/maybe', priority: 0, subtasks: [] },
      { title: 'Define next week\'s top 3 priorities', priority: 3, subtasks: [] }
    ]), uid);
    it.run('Bug Fix', 'Systematic debugging workflow', '🐛', JSON.stringify([
      { title: 'Reproduce the bug', priority: 2, subtasks: ['Document steps to reproduce', 'Identify environment/browser'] },
      { title: 'Identify root cause', priority: 2, subtasks: [] },
      { title: 'Write failing test', priority: 2, subtasks: [] },
      { title: 'Implement fix', priority: 2, subtasks: [] },
      { title: 'Verify fix + run test suite', priority: 1, subtasks: [] },
      { title: 'Update docs if needed', priority: 0, subtasks: [] }
    ]), uid);
    it.run('Content Creation', 'Blog post or article pipeline', '✍️', JSON.stringify([
      { title: 'Research & outline', priority: 1, subtasks: ['Gather references', 'Create outline structure'] },
      { title: 'Write first draft', priority: 2, subtasks: [] },
      { title: 'Edit & proofread', priority: 1, subtasks: [] },
      { title: 'Add images / formatting', priority: 0, subtasks: [] },
      { title: 'Publish & share', priority: 1, subtasks: ['Publish on platform', 'Share on social media'] }
    ]), uid);
    it.run('Project Launch', 'Ship a feature or product', '🚀', JSON.stringify([
      { title: 'Finalize scope & requirements', priority: 3, subtasks: [] },
      { title: 'Complete implementation', priority: 3, subtasks: [] },
      { title: 'Write tests', priority: 2, subtasks: ['Unit tests', 'Integration tests'] },
      { title: 'Code review', priority: 2, subtasks: [] },
      { title: 'QA / manual testing', priority: 2, subtasks: [] },
      { title: 'Deploy to staging', priority: 1, subtasks: [] },
      { title: 'Deploy to production', priority: 1, subtasks: [] },
      { title: 'Monitor post-launch', priority: 1, subtasks: [] }
    ]), uid);
  }

  // ─── API Tokens table ───
  db.exec(`CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // ─── Push Subscriptions table ───
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, endpoint)
  )`);

  // ─── Push Notification Log (deduplication) ───
  db.exec(`CREATE TABLE IF NOT EXISTS push_notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id INTEGER,
    type TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  // ─── Webhooks table ───
  db.exec(`CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',
    secret TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // ─── Custom Fields tables ───
  db.exec(`CREATE TABLE IF NOT EXISTS custom_field_defs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','select')),
    options TEXT DEFAULT NULL,
    position INTEGER DEFAULT 0,
    required INTEGER DEFAULT 0,
    show_in_card INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS task_custom_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    field_id INTEGER NOT NULL,
    value TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE,
    UNIQUE(task_id, field_id)
  )`);

  // ─── Run SQL migrations ───
  const runMigrations = require('./migrate');
  runMigrations(db);

  return { db, rebuildSearchIndex };
}

module.exports = initDatabase;
