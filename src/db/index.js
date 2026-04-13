const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const logger = (() => { try { return require('../logger'); } catch { return console; } })();

/**
 * Initialise the database: open, schema, migrations, seeds, FTS.
 * Returns { db, rebuildSearchIndex } so callers keep using the same
 * variable names the rest of the code already depends on.
 */
function initDatabase(dbDir) {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'lifeflow.db');
  const shmPath = dbPath + '-shm';
  const walPath = dbPath + '-wal';

  // ─── Stale SHM recovery ───
  // When Docker restarts, the .db-shm file from the previous container process
  // can prevent proper WAL recovery, causing SQLite to see an incomplete DB.
  // Fix: remove stale SHM file before opening. SQLite will recreate it and
  // properly recover any pending WAL transactions.
  if (fs.existsSync(shmPath) && fs.existsSync(walPath)) {
    try {
      fs.unlinkSync(shmPath);
      logger.info('Removed stale .db-shm file for clean WAL recovery');
    } catch (e) {
      logger.warn({ err: e }, 'Could not remove stale .db-shm file');
    }
  }

  // ─── Open DB with auto-repair on corruption ───
  // Wraps the entire open+pragma+integrity sequence so ANY corruption error
  // (even at the very first pragma) triggers delete-and-recreate.
  let db;
  const openAndVerify = () => {
    const d = new Database(dbPath);
    d.pragma('journal_mode = WAL');
    d.pragma('foreign_keys = ON');
    d.pragma('busy_timeout = 5000');
    try { d.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
    // Run integrity check — throws or returns issues if corrupt
    const ic = d.pragma('integrity_check');
    const ok = ic.length === 1 && ic[0].integrity_check === 'ok';
    if (!ok) {
      const issues = ic.map(r => r.integrity_check).slice(0, 10);
      logger.warn({ issues }, 'Database integrity check failed — attempting REINDEX');
      try {
        d.exec('REINDEX');
        logger.info('REINDEX succeeded — indexes rebuilt');
        try {
          d.exec("INSERT INTO search_index(search_index) VALUES('rebuild')");
          logger.info('FTS search index rebuilt');
        } catch { /* FTS table may not exist yet */ }
        return d;
      } catch (reindexErr) {
        logger.error({ err: reindexErr }, 'REINDEX failed — will delete corrupt DB');
        try { d.close(); } catch {}
        throw reindexErr; // fall through to delete+recreate
      }
    }
    return d;
  };

  try {
    db = openAndVerify();
  } catch (openErr) {
    // Any error during open/pragma/integrity means the DB is unusable.
    // Delete all DB files and create a fresh one.
    logger.error({ err: openErr }, 'Corrupt database detected — deleting for auto-restore');
    try { if (db) db.close(); } catch {}
    for (const f of [dbPath, walPath, shmPath]) {
      try { fs.unlinkSync(f); } catch {}
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    logger.info('Fresh database created — will restore from backup');
  }

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      archived INTEGER DEFAULT 0,
      default_view TEXT DEFAULT NULL,
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
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
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
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
      name TEXT NOT NULL,
      color TEXT DEFAULT '#64748B',
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_created INTEGER DEFAULT 0,
    source_type TEXT DEFAULT 'task',
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
  )`);

  // ─── Settings table (key-value, composite PK for multi-user) ───
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER NOT NULL DEFAULT 1,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  )`);

  // ─── Saved Filters table ───
  db.exec(`CREATE TABLE IF NOT EXISTS saved_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🔍',
    color TEXT DEFAULT '#2563EB',
    filters TEXT NOT NULL DEFAULT '{}',
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    area_id INTEGER DEFAULT NULL,
    schedule_days TEXT DEFAULT NULL,
    preferred_time TEXT DEFAULT NULL,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
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
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    rating INTEGER DEFAULT NULL,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    view_mode TEXT DEFAULT 'list',
    board_columns TEXT DEFAULT NULL,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE
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

  // ─── Phase 3 list views: enhanced items + board view ───
  try { db.exec('ALTER TABLE list_items ADD COLUMN metadata TEXT DEFAULT NULL'); } catch(e) {}
  try { db.exec('ALTER TABLE list_items ADD COLUMN status TEXT DEFAULT NULL'); } catch(e) {}
  try { db.exec('ALTER TABLE lists ADD COLUMN view_mode TEXT DEFAULT \'list\''); } catch(e) {}
  try { db.exec('ALTER TABLE lists ADD COLUMN board_columns TEXT DEFAULT NULL'); } catch(e) {}

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
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_lists_area ON lists(area_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_notes_goal ON notes(goal_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_weekly_reviews_week ON weekly_reviews(week_start)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_habit_logs_composite ON habit_logs(habit_id, log_date)'); } catch(e) {}
  // ─── Sprint 4: Compound user+filter indexes for common query patterns ───
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date) WHERE due_date IS NOT NULL'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)'); } catch(e) {}

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
    ended_at DATETIME,
    scheduled_at DATETIME,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);

  // ─── Focus Session migrations ───
  try { db.exec('ALTER TABLE focus_sessions ADD COLUMN ended_at DATETIME'); } catch(e) {}
  try { db.exec('ALTER TABLE focus_sessions ADD COLUMN scheduled_at DATETIME'); } catch(e) {}

  // ─── Focus Sessions indexes (must be after table creation) ───
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_id)'); } catch(e) {}

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
    type TEXT NOT NULL,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, type)
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    conditions TEXT DEFAULT NULL,
    actions TEXT DEFAULT NULL,
    description TEXT DEFAULT '',
    template_id TEXT DEFAULT NULL,
    last_fired_at DATETIME DEFAULT NULL,
    fire_count INTEGER DEFAULT 0,
    last_schedule_fire TEXT DEFAULT NULL
  )`);
  // NOTE: ALTER TABLE for automation_rules columns moved to after runMigrations()
  // so migration 003 (which recreates the table) runs first.

  // ─── Automation Execution Log ───
  db.exec(`CREATE TABLE IF NOT EXISTS automation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER REFERENCES automation_rules(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    action_type TEXT DEFAULT '',
    trigger_context TEXT DEFAULT '{}',
    actions_executed TEXT DEFAULT '[]',
    status TEXT DEFAULT 'success',
    error TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec('ALTER TABLE automation_log ADD COLUMN status TEXT DEFAULT \'success\''); } catch {}
  try { db.exec('ALTER TABLE automation_log ADD COLUMN action_type TEXT DEFAULT \'\''); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_automation_log_user_date ON automation_log(user_id, created_at DESC)'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_automation_log_rule ON automation_log(rule_id)'); } catch {}

  // ─── Automation Templates ───
  db.exec(`CREATE TABLE IF NOT EXISTS automation_templates (
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
  )`);

  // ─── Automation Suggestions ───
  db.exec(`CREATE TABLE IF NOT EXISTS automation_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL,
    template_id TEXT DEFAULT NULL,
    reason TEXT DEFAULT '',
    context TEXT DEFAULT '{}',
    dismissed INTEGER DEFAULT 0,
    dismissed_permanently INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_automation_suggestions_user ON automation_suggestions(user_id, dismissed)'); } catch {}

  // ─── Seed automation templates ───
  const tmplCount = db.prepare('SELECT COUNT(*) as c FROM automation_templates').get();
  if (tmplCount.c === 0) {
    const t = db.prepare('INSERT OR IGNORE INTO automation_templates (id,name,description,category,icon,trigger_type,trigger_config,conditions,actions,customizable_fields,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    t.run('auto-triage-overdue','Auto-Triage Overdue Tasks','Escalate tasks overdue for 3+ days to Critical and add to My Day','tasks','✅','task_overdue','{}',
      JSON.stringify({match:'all',rules:[{field:'task.days_overdue',operator:'gte',value:3}]}),
      JSON.stringify([{type:'set_priority',config:{priority:3}},{type:'add_to_myday',config:{}}]),
      '[]', 1);
    t.run('followup-completed','Follow-Up on Completed Work','Create a review task when high-priority tasks are completed','tasks','✅','task_completed','{}',
      JSON.stringify({match:'all',rules:[{field:'task.priority',operator:'gte',value:2}]}),
      JSON.stringify([{type:'create_followup',config:{title:'Review outcome: {{task.title}}',due:'+2d'}}]),
      '["conditions.rules[0].value"]', 2);
    t.run('quick-win-radar','Quick Win Radar','Tag short tasks as quick-wins and add to My Day','tasks','⚡','task_created','{}',
      JSON.stringify({match:'all',rules:[{field:'task.estimated_minutes',operator:'lte',value:15},{field:'task.estimated_minutes',operator:'gt',value:0}]}),
      JSON.stringify([{type:'add_tag',config:{tag_name:'quick-win'}},{type:'add_to_myday',config:{}}]),
      '[]', 3);
    t.run('morning-focus-setup','Morning Focus Setup','Start each weekday with a planning task','routines','🌅','schedule_daily',
      JSON.stringify({time:'08:00',days:[1,2,3,4,5]}), null,
      JSON.stringify([{type:'create_followup',config:{title:'Morning planning',priority:2,due:'today'}},{type:'send_toast',config:{message:'Good morning! Time to plan your day. ☀️',type:'info'}}]),
      '["trigger_config.time","trigger_config.days"]', 4);
    t.run('evening-wind-down','Evening Wind-Down','Review your day and plan tomorrow','routines','🌙','schedule_daily',
      JSON.stringify({time:'21:00',days:[0,1,2,3,4,5,6]}), null,
      JSON.stringify([{type:'create_followup',config:{title:'Review today + plan tomorrow',priority:1,due:'today'}}]),
      '["trigger_config.time"]', 5);
    t.run('monday-weekly-review','Monday Weekly Review','Weekly review to stay on track','routines','📅','schedule_weekly',
      JSON.stringify({day:1,time:'09:00'}), null,
      JSON.stringify([{type:'create_followup',config:{title:'Weekly review',priority:2,due:'today'}},{type:'send_toast',config:{message:'Time for your weekly review! 📋',type:'info'}}]),
      '["trigger_config.day","trigger_config.time"]', 6);
    t.run('streak-celebration','Streak Celebration','Get a toast when you hit a 7-day habit streak','habits','🔥','habit_streak',
      JSON.stringify({streak:7}), null,
      JSON.stringify([{type:'send_toast',config:{message:'{{streak}}-day streak on {{habit.name}}! 🔥 Keep it up!',type:'success'}}]),
      '["trigger_config.streak"]', 7);
    t.run('missed-habit-recovery','Missed Habit Recovery','Create a recovery task when you miss a habit','habits','💪','habit_missed','{}', null,
      JSON.stringify([{type:'create_followup',config:{title:'Get back on track: {{habit.name}}',priority:2,due:'today'}},{type:'send_toast',config:{message:'Don\'t break the chain! Get back to {{habit.name}} today.',type:'warning'}}]),
      '[]', 8);
    t.run('post-focus-followup','Post-Focus Follow-Up','Remind yourself to take a break after deep work','focus','🎯','focus_completed','{}',
      JSON.stringify({match:'all',rules:[{field:'focus.duration_sec',operator:'gte',value:1500}]}),
      JSON.stringify([{type:'send_toast',config:{message:'Great focus session! Take a 5-minute break. 🧘',type:'success'}}]),
      '[]', 9);
    t.run('habit-task-bridge','Habit-Task Bridge','Auto-log a habit when you complete related tasks','habits','🔗','task_completed','{}', null,
      JSON.stringify([{type:'log_habit',config:{habit_id:null}}]),
      '["actions[0].config.habit_id","conditions"]', 10);
    t.run('celebrate-milestone','Celebrate Goal Milestones','Get notified when a goal reaches 50% or more','goals','🏆','goal_progress',
      JSON.stringify({threshold:50}), null,
      JSON.stringify([{type:'send_toast',config:{message:'{{percentage}}% done on {{goal.title}}! 🎉',type:'success'}}]),
      '["trigger_config.threshold"]', 11);
    t.run('stale-task-alert','Stale Task Alert','Escalate tasks that haven\'t been touched in 7 days','tasks','⏰','task_stale',
      JSON.stringify({days:7}), null,
      JSON.stringify([{type:'set_priority',config:{priority:2}},{type:'send_toast',config:{message:'Task hasn\'t moved in a week: {{task.title}}',type:'warning'}}]),
      '["trigger_config.days"]', 12);
    t.run('goal-sprint-finisher','Goal Sprint Finisher','Push to finish when a goal is 90% done','goals','🚀','goal_progress',
      JSON.stringify({threshold:90}), null,
      JSON.stringify([{type:'send_toast',config:{message:'Almost there! {{goal.title}} is {{percentage}}% done! 🚀',type:'success'}}]),
      '["trigger_config.threshold"]', 13);
    t.run('focus-session-streak','Focus Session Streak','Celebrate multiple focus sessions in one day','focus','🧠','focus_streak',
      JSON.stringify({count:3}), null,
      JSON.stringify([{type:'send_toast',config:{message:'3 focus sessions today! You\'re in the zone. 🧠',type:'success'}}]),
      '[]', 14);
  }
  const userIdTables = [
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
  // Compound user index for focus_sessions (must be after user_id column is added)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON focus_sessions(user_id, started_at)'); } catch(e) {}

  // ─── Daily Reviews table ───
  db.exec(`CREATE TABLE IF NOT EXISTS daily_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    completed_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  )`);

  // ─── Multi-user assignment column ───
  try { db.exec('ALTER TABLE tasks ADD COLUMN assigned_to_user_id INTEGER REFERENCES users(id)'); } catch(e) { /* already exists */ }

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

  // ─── Login Attempts / Account Lockout table ───
  db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
    email TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER DEFAULT 0,
    first_attempt_at DATETIME,
    locked_until DATETIME
  )`);

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

  // ─── Seed default data for new users (ONLY on true first boot) ───
  // Safety: Never re-seed if tasks/goals/subtasks exist — that indicates a DB with real data
  // whose areas may have been lost to WAL corruption. Re-seeding would mask data loss.
  const cnt = db.prepare('SELECT COUNT(*) as c FROM life_areas').get();
  const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  const hasExistingData = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c > 0
    || db.prepare('SELECT COUNT(*) as c FROM goals').get().c > 0;
  const seedDone = db.prepare("SELECT value FROM settings WHERE key='_seed_completed' AND user_id=0").get();
  if (cnt.c === 0 && firstUser && !hasExistingData && !seedDone) {
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
  if (tc.c === 0 && firstUser && !hasExistingData && !seedDone) {
    const uid = firstUser.id;
    const it = db.prepare('INSERT INTO tags (name,color,user_id) VALUES (?,?,?)');
    it.run('urgent','#EF4444',uid); it.run('blocked','#F59E0B',uid); it.run('quick-win','#22C55E',uid);
    it.run('research','#7C3AED',uid); it.run('waiting','#64748B',uid);
  }
  const tmplC = db.prepare('SELECT COUNT(*) as c FROM task_templates').get();
  if (tmplC.c === 0 && firstUser && !hasExistingData && !seedDone) {
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
  // Mark seeding as completed so it never re-triggers (even after data loss)
  if (firstUser && !seedDone) {
    db.prepare("INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (0, '_seed_completed', '1')").run();
  }

  // ─── Startup data integrity check ───
  // Defense-in-depth: compare current DB data against the richest backup.
  // If a backup has significantly more data, auto-restore from it.
  // This catches data loss even when WAL files are lost (watermark may be in WAL too).
  try {
    // STEP 0: Checkpoint WAL BEFORE reading counts — ensures we see all committed data
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (cpErr) {
      logger.warn({ err: cpErr }, 'Pre-integrity-check WAL checkpoint failed');
    }

    const taskCount = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const areaCount = db.prepare('SELECT COUNT(*) as c FROM life_areas').get().c;
    const listCount = db.prepare('SELECT COUNT(*) as c FROM lists').get().c;
    const noteCount = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;

    logger.info({ areas: areaCount, tasks: taskCount, lists: listCount, notes: noteCount }, 'Startup data inventory');

    // STEP 1: Restore cooldown — don't restore if we restored recently
    let skipIntegrity = false;
    const lastRestoreRow = db.prepare("SELECT value FROM settings WHERE key='_last_restore' AND user_id=0").get();
    if (lastRestoreRow) {
      const lastRestore = JSON.parse(lastRestoreRow.value);
      const hoursSince = (Date.now() - new Date(lastRestore.at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 1) {
        logger.info({ hoursSince: hoursSince.toFixed(2), lastBackup: lastRestore.backup }, 'Skipping integrity check — restored recently');
        // Update watermark with current counts
        const wm = JSON.stringify({ areas: areaCount, tasks: taskCount, lists: listCount, notes: noteCount, at: new Date().toISOString() });
        db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_data_watermark', ?)").run(wm);
        skipIntegrity = true;
      }
    }

    let shouldRestore = false;
    let reason = '';
    let bestFile = null, bestScore = 0, bestData = null;

    if (!skipIntegrity) {
    // STEP 2: Find the richest backup
    const backupDir = path.join(dbDir, 'backups');
    if (fs.existsSync(backupDir)) {
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('lifeflow-backup-') && f.endsWith('.json'));
      for (const bfile of backupFiles) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(backupDir, bfile), 'utf8'));
          if (!data.areas || !data.areas.length) continue;
          const score = (data.areas?.length || 0) + (data.tasks?.length || 0) + (data.habits?.length || 0) + (data.tags?.length || 0) + (data.lists?.length || 0) + (data.list_items?.length || 0);
          if (score > bestScore) { bestScore = score; bestFile = bfile; bestData = data; }
        } catch (e) { logger.warn({ file: bfile, err: e.message }, 'Skipped corrupt/unreadable backup'); }
      }
    }

    // Score uses areas + tasks only for the restore TRIGGER (not for backup selection)
    const bestAreas = bestData ? (bestData.areas?.length || 0) : 0;
    const bestTasks = bestData ? (bestData.tasks?.length || 0) : 0;
    const bestPrimary = bestAreas + bestTasks;
    const currentPrimary = areaCount + taskCount;

    // Primary check: backup has significantly more core data (areas+tasks) than current DB
    if (bestFile && bestPrimary > 3 && currentPrimary < bestPrimary * 0.5) {
      shouldRestore = true;
      reason = `Backup "${bestFile}" has ${bestAreas} areas + ${bestTasks} tasks vs current ${areaCount} + ${taskCount} (>50% data loss)`;
    }

    // Secondary check: watermark-based (catches cases where backup was recently created with less data)
    const watermarkRow = db.prepare("SELECT value FROM settings WHERE key='_data_watermark' AND user_id=0").get();
    if (!shouldRestore && watermarkRow) {
      const wm = JSON.parse(watermarkRow.value);
      if (wm.tasks > 3 && taskCount < wm.tasks * 0.5) {
        shouldRestore = true;
        reason = `Tasks dropped from ${wm.tasks} to ${taskCount} (watermark: ${wm.at})`;
      } else if (wm.areas > 3 && areaCount < wm.areas * 0.5) {
        shouldRestore = true;
        reason = `Areas dropped from ${wm.areas} to ${areaCount} (watermark: ${wm.at})`;
      }
    }

    // STEP 3: If current DB looks healthy, update watermark and skip restore
    if (!shouldRestore) {
      const wm = JSON.stringify({ areas: areaCount, tasks: taskCount, lists: listCount, notes: noteCount, at: new Date().toISOString() });
      db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_data_watermark', ?)").run(wm);
    }
    } // end if (!skipIntegrity)

    if (shouldRestore && bestFile && bestData) {
          try {
          const data = bestData;
          const bfile = bestFile;
            const userId = firstUser ? firstUser.id : 1;

            // ─── Safety: snapshot current DB state before destructive restore ───
            // This preserves any data (e.g. lists, notes) that exists in the current DB
            // but not in the backup, so it can be recovered if needed.
            const preRestoreBackupDir = path.join(dbDir, 'backups');
            if (!fs.existsSync(preRestoreBackupDir)) fs.mkdirSync(preRestoreBackupDir, { recursive: true });
            try {
              const preFile = `lifeflow-pre-restore-${new Date().toISOString().replace(/[:.]/g,'').slice(0,15)}.db`;
              const srcDbPath = path.join(dbDir, 'lifeflow.db');
              if (fs.existsSync(srcDbPath)) {
                fs.copyFileSync(srcDbPath, path.join(preRestoreBackupDir, preFile));
                logger.info({ file: preFile }, 'Pre-restore DB snapshot saved');
              }
            } catch (snapErr) {
              logger.warn({ err: snapErr }, 'Failed to save pre-restore snapshot (continuing with restore)');
            }

            logger.warn({ backup: bfile, reason, backupAreas: data.areas.length, backupTasks: data.tasks.length },
              'Data integrity violation — auto-restoring from backup');

            // ─── Safety: JSON backup of current DB state before destructive restore ───
            try {
              const preRestoreBackupDir = path.join(dbDir, 'backups');
              if (!fs.existsSync(preRestoreBackupDir)) fs.mkdirSync(preRestoreBackupDir, { recursive: true });
              const currentData = {};
              try {
                currentData.areas = db.prepare('SELECT * FROM life_areas WHERE user_id=?').all(userId);
                currentData.tasks = db.prepare('SELECT * FROM tasks WHERE user_id=?').all(userId);
                currentData.lists = db.prepare('SELECT * FROM lists WHERE user_id=?').all(userId);
                currentData.list_items = [];
                for (const l of currentData.lists) {
                  currentData.list_items.push(...db.prepare('SELECT * FROM list_items WHERE list_id=?').all(l.id));
                }
                currentData.notes = db.prepare('SELECT * FROM notes WHERE user_id=?').all(userId);
                currentData.inbox = db.prepare('SELECT * FROM inbox WHERE user_id=?').all(userId);
                currentData.habits = db.prepare('SELECT * FROM habits WHERE user_id=?').all(userId);
                currentData.tags = db.prepare('SELECT * FROM tags WHERE user_id=?').all(userId);
                const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
                const preJsonFile = `lifeflow-pre-restore-${ts}.json`;
                fs.writeFileSync(path.join(preRestoreBackupDir, preJsonFile), JSON.stringify(currentData, null, 2));
                logger.info({ file: preJsonFile, areas: currentData.areas.length, tasks: currentData.tasks.length, lists: currentData.lists.length },
                  'Pre-restore JSON backup saved');
              } catch (jsonErr) {
                logger.warn({ err: jsonErr }, 'Failed to save pre-restore JSON backup');
              }
            } catch (e2) { /* non-fatal */ }

            // Restore user accounts (password hashes) so users can still log in after restore
            if (data.users && data.users.length) {
              for (const u of data.users) {
                db.prepare('UPDATE users SET password_hash=?, display_name=? WHERE id=?')
                  .run(u.password_hash, u.display_name || '', u.id);
              }
            }

            // Clear stale/seed data before restoring (cascading deletes handle children)
            db.prepare('DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM habits WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM focus_session_meta WHERE session_id IN (SELECT id FROM focus_sessions WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM focus_steps WHERE session_id IN (SELECT id FROM focus_sessions WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM focus_sessions WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM task_custom_values WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM task_deps WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM tasks WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM goal_milestones WHERE goal_id IN (SELECT id FROM goals WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM goals WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM life_areas WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM tags WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM notes WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id=?)').run(userId);
            db.prepare('DELETE FROM lists WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM custom_field_defs WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM automation_rules WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM saved_filters WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM task_templates WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM weekly_reviews WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM daily_reviews WHERE user_id=?').run(userId);
            db.prepare('DELETE FROM inbox WHERE user_id=?').run(userId);
            try { db.prepare('DELETE FROM badges WHERE user_id=?').run(userId); } catch(e) { /* ok */ }
            db.prepare("DELETE FROM settings WHERE user_id=? AND key NOT LIKE '\\_%' ESCAPE '\\'").run(userId);

            const areaMap = {};
            for (const a of data.areas) {
              const r = db.prepare('INSERT INTO life_areas (name,icon,color,position,user_id,archived,default_view,created_at) VALUES (?,?,?,?,?,?,?,?)')
                .run(a.name, a.icon || '📁', a.color || '#6C63FF', a.position || 0, userId, a.archived || 0, a.default_view || null, a.created_at || new Date().toISOString());
              areaMap[a.id] = r.lastInsertRowid;
            }
            const goalMap = {};
            for (const g of (data.goals || [])) {
              const newAreaId = areaMap[g.area_id];
              if (!newAreaId) continue;
              const r = db.prepare('INSERT INTO goals (area_id,title,description,color,status,due_date,position,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
                .run(newAreaId, g.title, g.description || '', g.color || '#6C63FF', g.status || 'active', g.due_date || null, g.position || 0, userId, g.created_at || new Date().toISOString());
              goalMap[g.id] = r.lastInsertRowid;
            }
            const tagMap = {};
            for (const t of (data.tags || [])) {
              const r = db.prepare('INSERT OR IGNORE INTO tags (name,color,user_id) VALUES (?,?,?)')
                .run(t.name, t.color || '#64748B', userId);
              tagMap[t.id] = r.lastInsertRowid;
            }
            // Restore lists + list items (before tasks, so list_id can be remapped)
            // Parents first, then children for parent_id remap
            const listMap = {};
            const allLists = data.lists || [];
            const parentLists = allLists.filter(l => !l.parent_id);
            const childLists = allLists.filter(l => l.parent_id);
            for (const l of [...parentLists, ...childLists]) {
              const newAreaId = l.area_id ? (areaMap[l.area_id] || null) : null;
              const newParentId = l.parent_id ? (listMap[l.parent_id] || null) : null;
              const r = db.prepare('INSERT INTO lists (name,type,icon,color,position,user_id,area_id,parent_id,share_token,view_mode,board_columns,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
                .run(l.name, l.type || 'checklist', l.icon || '📋', l.color || '#2563EB', l.position || 0, userId, newAreaId, newParentId, l.share_token || null, l.view_mode || 'list', l.board_columns || null, l.created_at || new Date().toISOString());
              listMap[l.id] = r.lastInsertRowid;
            }
            for (const i of (data.list_items || [])) {
              const newListId = listMap[i.list_id];
              if (newListId) {
                db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,position,metadata,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
                  .run(newListId, i.title, i.checked || 0, i.category || null, i.quantity || null, i.note || '', i.position || 0, i.metadata || null, i.status || null, i.created_at || new Date().toISOString());
              }
            }
            const taskMap = {};
            for (const t of data.tasks) {
              const newGoalId = goalMap[t.goal_id];
              if (!newGoalId) continue;
              const newListId = t.list_id ? (listMap[t.list_id] || null) : null;
              const r = db.prepare('INSERT INTO tasks (goal_id,title,note,status,priority,due_date,due_time,recurring,assigned_to,assigned_to_user_id,my_day,position,user_id,completed_at,estimated_minutes,actual_minutes,list_id,time_block_start,time_block_end,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                .run(newGoalId, t.title, t.note || '', t.status || 'todo', t.priority || 0, t.due_date || null, t.due_time || null,
                  t.recurring || null, t.assigned_to || '', t.assigned_to_user_id || null, t.my_day || 0, t.position || 0, userId, t.completed_at || null,
                  t.estimated_minutes || null, t.actual_minutes || 0, newListId, t.time_block_start || null, t.time_block_end || null, t.created_at || new Date().toISOString());
              taskMap[t.id] = r.lastInsertRowid;
              if (t.tags && t.tags.length) {
                for (const tag of t.tags) {
                  const newTagId = tagMap[tag.id];
                  if (newTagId) db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)').run(r.lastInsertRowid, newTagId);
                }
              }
              if (t.subtasks && t.subtasks.length) {
                for (const s of t.subtasks) {
                  db.prepare('INSERT INTO subtasks (task_id,title,note,done,position,created_at) VALUES (?,?,?,?,?,?)').run(r.lastInsertRowid, s.title, s.note || '', s.done || 0, s.position || 0, s.created_at || new Date().toISOString());
                }
              }
            }
            // Restore habits + habit logs
            const habitMap = {};
            for (const h of (data.habits || [])) {
              const newAreaId = h.area_id ? areaMap[h.area_id] || null : null;
              const r = db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position,area_id,user_id,preferred_time,archived,schedule_days,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
                .run(h.name, h.icon || '💪', h.color || '#6c63ff', h.frequency || 'daily', h.target || 1, h.position || 0, newAreaId, userId, h.preferred_time || null, h.archived || 0, h.schedule_days || null, h.created_at || new Date().toISOString());
              habitMap[h.id] = r.lastInsertRowid;
            }
            for (const l of (data.habit_logs || [])) {
              const newHabitId = habitMap[l.habit_id];
              if (newHabitId) db.prepare('INSERT OR IGNORE INTO habit_logs (habit_id,date,count) VALUES (?,?,?)').run(newHabitId, l.date, l.count || 1);
            }

            // Restore focus sessions + meta + steps
            const fsMap = {};
            for (const f of (data.focus_sessions || [])) {
              const newTaskId = f.task_id ? (taskMap[f.task_id] || null) : null;
              const r = db.prepare('INSERT INTO focus_sessions (task_id,started_at,duration_sec,type,user_id,ended_at,scheduled_at) VALUES (?,?,?,?,?,?,?)')
                .run(newTaskId, f.started_at, f.duration_sec || 0, f.type || 'pomodoro', userId, f.ended_at || null, f.scheduled_at || null);
              fsMap[f.id] = r.lastInsertRowid;
            }
            for (const m of (data.focus_session_meta || [])) {
              const newSid = fsMap[m.session_id];
              if (newSid) {
                db.prepare('INSERT OR IGNORE INTO focus_session_meta (session_id,intention,reflection,focus_rating,steps_planned,steps_completed,strategy) VALUES (?,?,?,?,?,?,?)')
                  .run(newSid, m.intention || null, m.reflection || null, m.focus_rating || 0, m.steps_planned || 0, m.steps_completed || 0, m.strategy || 'pomodoro');
              }
            }
            for (const s of (data.focus_steps || [])) {
              const newSid = fsMap[s.session_id];
              if (newSid) {
                db.prepare('INSERT INTO focus_steps (session_id,text,done,position,completed_at) VALUES (?,?,?,?,?)')
                  .run(newSid, s.text, s.done || 0, s.position || 0, s.completed_at || null);
              }
            }

            // Restore task comments
            for (const c of (data.task_comments || [])) {
              const newTaskId = taskMap[c.task_id];
              if (newTaskId) {
                db.prepare('INSERT INTO task_comments (task_id,text,created_at) VALUES (?,?,?)')
                  .run(newTaskId, c.text || c.content || '', c.created_at || new Date().toISOString());
              }
            }

            // Restore task dependencies
            for (const d of (data.task_deps || [])) {
              const t1 = taskMap[d.task_id], t2 = taskMap[d.blocked_by_id];
              if (t1 && t2) db.prepare('INSERT OR IGNORE INTO task_deps (task_id,blocked_by_id) VALUES (?,?)').run(t1, t2);
            }

            // Restore goal milestones
            for (const m of (data.goal_milestones || [])) {
              const newGoalId = goalMap[m.goal_id];
              if (newGoalId) {
                db.prepare('INSERT INTO goal_milestones (goal_id,title,done,position,completed_at) VALUES (?,?,?,?,?)')
                  .run(newGoalId, m.title, m.done || 0, m.position || 0, m.completed_at || null);
              }
            }

            // Restore notes
            for (const n of (data.notes || [])) {
              db.prepare('INSERT INTO notes (title,content,goal_id,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)')
                .run(n.title, n.content || '', n.goal_id ? (goalMap[n.goal_id] || null) : null, userId, n.created_at || new Date().toISOString(), n.updated_at || new Date().toISOString());
            }

            // Restore custom field defs + values
            const fieldMap = {};
            for (const f of (data.custom_field_defs || [])) {
              const r = db.prepare('INSERT INTO custom_field_defs (name,field_type,options,position,required,show_in_card,user_id) VALUES (?,?,?,?,?,?,?)')
                .run(f.name, f.field_type, f.options || null, f.position || 0, f.required || 0, f.show_in_card || 0, userId);
              fieldMap[f.id] = r.lastInsertRowid;
            }
            for (const v of (data.task_custom_values || [])) {
              const newTaskId = taskMap[v.task_id], newFieldId = fieldMap[v.field_id];
              if (newTaskId && newFieldId) db.prepare('INSERT OR IGNORE INTO task_custom_values (task_id,field_id,value) VALUES (?,?,?)').run(newTaskId, newFieldId, v.value);
            }

            // Restore automation rules
            for (const r of (data.automation_rules || [])) {
              db.prepare('INSERT INTO automation_rules (name,trigger_type,trigger_config,action_type,action_config,enabled,user_id) VALUES (?,?,?,?,?,?,?)')
                .run(r.name, r.trigger_type, r.trigger_config || '{}', r.action_type, r.action_config || '{}', r.enabled !== undefined ? r.enabled : 1, userId);
            }

            // Restore saved filters
            for (const f of (data.saved_filters || [])) {
              db.prepare('INSERT INTO saved_filters (name,icon,color,filters,position,user_id) VALUES (?,?,?,?,?,?)')
                .run(f.name, f.icon || '🔍', f.color || '#2563EB', f.filters || '{}', f.position || 0, userId);
            }

            // Restore task templates
            for (const t of (data.task_templates || [])) {
              db.prepare('INSERT INTO task_templates (name,description,icon,tasks,user_created,source_type,user_id) VALUES (?,?,?,?,?,?,?)')
                .run(t.name, t.description || '', t.icon || '📋', t.tasks || '[]', t.user_created || 0, t.source_type || 'task', userId);
            }

            // Restore weekly reviews
            for (const r of (data.weekly_reviews || [])) {
              db.prepare('INSERT INTO weekly_reviews (week_start,tasks_completed,tasks_created,top_accomplishments,reflection,next_week_priorities,rating,user_id) VALUES (?,?,?,?,?,?,?,?)')
                .run(r.week_start, r.tasks_completed || 0, r.tasks_created || 0, r.top_accomplishments || '[]', r.reflection || '', r.next_week_priorities || '[]', r.rating || null, userId);
            }

            // Restore daily reviews
            for (const r of (data.daily_reviews || [])) {
              db.prepare('INSERT OR IGNORE INTO daily_reviews (user_id,date,note,completed_count) VALUES (?,?,?,?)')
                .run(userId, r.date, r.note || '', r.completed_count || 0);
            }

            // Restore inbox
            for (const i of (data.inbox || [])) {
              db.prepare('INSERT INTO inbox (title,note,priority,user_id) VALUES (?,?,?,?)')
                .run(i.title, i.note || '', i.priority || 0, userId);
            }

            // Restore badges
            for (const b of (data.badges || [])) {
              try { db.prepare('INSERT OR IGNORE INTO badges (type,earned_at,user_id) VALUES (?,?,?)').run(b.type, b.earned_at || new Date().toISOString(), userId); } catch(e) {}
            }

            // Restore settings (user prefs only, not system keys)
            for (const s of (data.settings || [])) {
              if (s.key && !s.key.startsWith('_')) {
                db.prepare('INSERT OR REPLACE INTO settings (user_id,key,value) VALUES (?,?,?)').run(userId, s.key, s.value);
              }
            }

            // Update watermark to match restored data so future losses are detected
            const restoredWm = JSON.stringify({
              areas: data.areas.length, goals: (data.goals || []).length,
              tasks: data.tasks.length, tags: (data.tags || []).length,
              habits: (data.habits || []).length, focus_sessions: (data.focus_sessions || []).length,
              notes: (data.notes || []).length, lists: (data.lists || []).length,
              at: new Date().toISOString(),
            });
            db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_data_watermark', ?)").run(restoredWm);
            // Mark seed as completed so seeding doesn't overwrite restored data
            db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_seed_completed', '1')").run();
            // CRITICAL: Checkpoint WAL to persist restored data to main DB file
            // Without this, restored data lives only in WAL and can be lost on crash/restart
            try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (cpErr) {
              logger.warn({ err: cpErr }, 'WAL checkpoint after restore failed');
            }

            // ─── Post-restore merge: recover data missing from backup ───
            // If the pre-restore DB had lists, notes, etc. that the backup didn't,
            // copy them into the restored DB so nothing is silently lost.
            try {
              const preRestoreFiles = fs.readdirSync(preRestoreBackupDir)
                .filter(f => f.startsWith('lifeflow-pre-restore-') && f.endsWith('.db'))
                .sort().reverse();
              if (preRestoreFiles.length > 0) {
                const preDbPath = path.join(preRestoreBackupDir, preRestoreFiles[0]);
                const preDb = require('better-sqlite3')(preDbPath, { readonly: true });
                // Merge lists + list_items (if pre-restore had more lists than the backup)
                const preLists = preDb.prepare('SELECT * FROM lists WHERE user_id=?').all(userId);
                const currentListCount = db.prepare('SELECT COUNT(*) as c FROM lists WHERE user_id=?').get(userId).c;
                if (preLists.length > currentListCount) {
                  // Pre-restore DB had more lists — merge the extras
                  // Sort: parents first, then children (so parent_id can be remapped)
                  const existingNames = new Set(db.prepare('SELECT name FROM lists WHERE user_id=?').all(userId).map(l => l.name));
                  const parentFirst = preLists.filter(l => !l.parent_id);
                  const childSecond = preLists.filter(l => l.parent_id);
                  const mergeListMap = {};
                  for (const l of [...parentFirst, ...childSecond]) {
                    if (existingNames.has(l.name)) {
                      // Track existing list ID for child remapping
                      const existing = db.prepare('SELECT id FROM lists WHERE name=? AND user_id=?').get(l.name, userId);
                      if (existing) mergeListMap[l.id] = existing.id;
                      continue;
                    }
                    const newAreaId = l.area_id ? (areaMap[l.area_id] || null) : null;
                    const newParentId = l.parent_id ? (mergeListMap[l.parent_id] || null) : null;
                    const r = db.prepare('INSERT INTO lists (name,type,icon,color,position,user_id,area_id,parent_id,share_token,view_mode,board_columns,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
                      .run(l.name, l.type || 'checklist', l.icon || '📋', l.color || '#2563EB', l.position || 0, userId, newAreaId, newParentId, l.share_token || null, l.view_mode || 'list', l.board_columns || null, l.created_at || new Date().toISOString());
                    mergeListMap[l.id] = r.lastInsertRowid;
                    const preItems = preDb.prepare('SELECT * FROM list_items WHERE list_id=?').all(l.id);
                    for (const i of preItems) {
                      db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,position,metadata,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
                        .run(r.lastInsertRowid, i.title, i.checked || 0, i.category || null, i.quantity || null, i.note || '', i.position || 0, i.metadata || null, i.status || null, i.created_at || new Date().toISOString());
                    }
                  }
                  logger.info({ preCount: preLists.length, restoredCount: currentListCount }, 'Merged extra lists from pre-restore DB');
                }
                // Merge notes (if pre-restore had more)
                const preNotes = preDb.prepare('SELECT * FROM notes WHERE user_id=?').all(userId);
                const currentNoteCount = db.prepare('SELECT COUNT(*) as c FROM notes WHERE user_id=?').get(userId).c;
                if (preNotes.length > currentNoteCount) {
                  const existingTitles = new Set(db.prepare('SELECT title FROM notes WHERE user_id=?').all(userId).map(n => n.title));
                  for (const n of preNotes) {
                    if (existingTitles.has(n.title)) continue;
                    const newGoalId = n.goal_id ? (goalMap[n.goal_id] || null) : null;
                    db.prepare('INSERT INTO notes (title,content,goal_id,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)')
                      .run(n.title, n.content || '', newGoalId, userId, n.created_at, n.updated_at);
                  }
                  logger.info({ preCount: preNotes.length, restoredCount: currentNoteCount }, 'Merged notes from pre-restore DB');
                }
                // Merge inbox (if pre-restore had more)
                const preInbox = preDb.prepare('SELECT * FROM inbox WHERE user_id=?').all(userId);
                const currentInboxCount = db.prepare('SELECT COUNT(*) as c FROM inbox WHERE user_id=?').get(userId).c;
                if (preInbox.length > currentInboxCount) {
                  const existingInbox = new Set(db.prepare('SELECT title FROM inbox WHERE user_id=?').all(userId).map(i => i.title));
                  for (const i of preInbox) {
                    if (existingInbox.has(i.title)) continue;
                    db.prepare('INSERT INTO inbox (title,note,priority,user_id) VALUES (?,?,?,?)')
                      .run(i.title, i.note || '', i.priority || 0, userId);
                  }
                  logger.info({ preCount: preInbox.length, restoredCount: currentInboxCount }, 'Merged inbox from pre-restore DB');
                }
                preDb.close();
              }
            } catch (mergeErr) {
              logger.warn({ err: mergeErr }, 'Post-restore merge failed (restored data is intact)');
            }

            logger.info({ backup: bfile }, 'Auto-restore complete — watermark updated, WAL checkpointed');

            // Record restore timestamp for cooldown
            const restoreMeta = JSON.stringify({ at: new Date().toISOString(), backup: bfile, reason });
            db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_last_restore', ?)").run(restoreMeta);

            // Final WAL checkpoint to persist the restore metadata
            try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (cpErr2) { /* ok */ }
          } catch (e) {
            logger.error({ err: e, backup: bestFile }, 'Auto-restore from backup failed');
          }
    }
  } catch (e) {
    logger.error({ err: e }, 'Startup integrity check failed');
  }

  // ─── Audit Log table (also created by audit service, but needed here for migration 003) ───
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource TEXT,
    resource_id TEXT,
    ip TEXT,
    ua TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)'); } catch(e) {}

  // ─── Run SQL migrations ───
  const runMigrations = require('./migrate');
  runMigrations(db);

  // ─── Post-migration column additions (idempotent) ───
  // Must run AFTER migrations since migration 003 recreates automation_rules without these columns
  try { db.exec('ALTER TABLE automation_rules ADD COLUMN conditions TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE automation_rules ADD COLUMN actions TEXT DEFAULT NULL'); } catch {}
  try { db.exec("ALTER TABLE automation_rules ADD COLUMN description TEXT DEFAULT ''"); } catch {}
  try { db.exec('ALTER TABLE automation_rules ADD COLUMN template_id TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE automation_rules ADD COLUMN last_fired_at DATETIME DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE automation_rules ADD COLUMN fire_count INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE automation_rules ADD COLUMN last_schedule_fire TEXT DEFAULT NULL'); } catch {}
  try { db.exec("ALTER TABLE automation_log ADD COLUMN status TEXT DEFAULT 'success'"); } catch {}
  try { db.exec("ALTER TABLE automation_log ADD COLUMN action_type TEXT DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE automation_suggestions ADD COLUMN reason TEXT DEFAULT ''"); } catch {}

  return { db, rebuildSearchIndex };
}

module.exports = initDatabase;
