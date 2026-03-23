const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3456;

const fs = require('fs');
const dbDir = process.env.DB_DIR || path.join(__dirname, '..');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'lifeflow.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

// Seed
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

// Seed: built-in templates
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

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper: get tags for a task
function getTaskTags(taskId) {
  return db.prepare('SELECT t.* FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id=?').all(taskId);
}
function getSubtasks(taskId) {
  return db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(taskId);
}
function getBlockedBy(taskId) {
  return db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id=?').all(taskId);
}
function getNextPosition(table, scopeCol, scopeVal) {
  const sql = scopeCol
    ? `SELECT COALESCE(MAX(position),-1)+1 as p FROM ${table} WHERE ${scopeCol}=?`
    : `SELECT COALESCE(MAX(position),-1)+1 as p FROM ${table}`;
  return scopeCol ? db.prepare(sql).get(scopeVal).p : db.prepare(sql).get().p;
}
function enrichTask(t) {
  return enrichTasks([t])[0];
}
function enrichTasks(tasks) {
  if (!tasks.length) return tasks;
  const ids = tasks.map(t => t.id);
  const ph = ids.map(() => '?').join(',');
  // Batch-load tags
  const allTags = db.prepare(`SELECT tt.task_id, t.* FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id IN (${ph})`).all(...ids);
  const tagMap = {};
  allTags.forEach(r => { (tagMap[r.task_id] = tagMap[r.task_id] || []).push({ id: r.id, name: r.name, color: r.color }); });
  // Batch-load subtasks
  const allSubs = db.prepare(`SELECT * FROM subtasks WHERE task_id IN (${ph}) ORDER BY position`).all(...ids);
  const subMap = {};
  allSubs.forEach(r => { (subMap[r.task_id] = subMap[r.task_id] || []).push(r); });
  // Batch-load deps
  const allDeps = db.prepare(`SELECT d.task_id, t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id IN (${ph})`).all(...ids);
  const depMap = {};
  allDeps.forEach(r => { (depMap[r.task_id] = depMap[r.task_id] || []).push({ id: r.id, title: r.title, status: r.status }); });
  // Batch-load lists
  const listIds = [...new Set(tasks.filter(t => t.list_id).map(t => t.list_id))];
  const listMap = {};
  if (listIds.length) {
    const lph = listIds.map(() => '?').join(',');
    db.prepare(`SELECT id, name, icon, color FROM lists WHERE id IN (${lph})`).all(...listIds).forEach(l => { listMap[l.id] = l; });
  }
  return tasks.map(t => {
    t.tags = tagMap[t.id] || [];
    t.subtasks = subMap[t.id] || [];
    t.subtask_done = t.subtasks.filter(s => s.done).length;
    t.subtask_total = t.subtasks.length;
    t.blocked_by = depMap[t.id] || [];
    if (t.list_id && listMap[t.list_id]) {
      t.list_name = listMap[t.list_id].name;
      t.list_icon = listMap[t.list_id].icon;
      t.list_color = listMap[t.list_id].color;
    }
    return t;
  });
}

// ─── Tags ───
app.get('/api/tags', (req, res) => {
  res.json(db.prepare('SELECT * FROM tags ORDER BY name').all());
});
app.post('/api/tags', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '');
  const existing = db.prepare('SELECT * FROM tags WHERE name=?').get(clean);
  if (existing) return res.json(existing);
  const r = db.prepare('INSERT INTO tags (name,color) VALUES (?,?)').run(clean, color || '#64748B');
  res.status(201).json(db.prepare('SELECT * FROM tags WHERE id=?').get(r.lastInsertRowid));
});
app.delete('/api/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM tags WHERE id=?').run(id);
  res.json({ ok: true });
});

// Set tags for a task (replace all)
app.put('/api/tasks/:id/tags', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds array required' });
  db.prepare('DELETE FROM task_tags WHERE task_id=?').run(id);
  const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
  tagIds.forEach(tid => { if (Number.isInteger(tid)) ins.run(id, tid); });
  res.json({ ok: true, tags: getTaskTags(id) });
});

// ─── Subtasks ───
app.get('/api/tasks/:taskId/subtasks', (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(taskId));
});
app.post('/api/tasks/:taskId/subtasks', (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'Invalid ID' });
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const pos = getNextPosition('subtasks', 'task_id', taskId);
  const r = db.prepare('INSERT INTO subtasks (task_id,title,position) VALUES (?,?,?)').run(taskId, title.trim(), pos);
  res.status(201).json(db.prepare('SELECT * FROM subtasks WHERE id=?').get(r.lastInsertRowid));
});
// Subtask reorder (must be before :id route)
app.put('/api/subtasks/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const upd = db.prepare('UPDATE subtasks SET position=? WHERE id=?');
  const tx = db.transaction(() => {
    items.forEach(({ id, position }) => {
      if (Number.isInteger(id) && Number.isInteger(position)) upd.run(position, id);
    });
  });
  tx();
  res.json({ ok: true });
});
app.put('/api/subtasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, done, note } = req.body;
  db.prepare('UPDATE subtasks SET title=COALESCE(?,title),done=COALESCE(?,done),note=COALESCE(?,note) WHERE id=?').run(title||null, done!==undefined?(done?1:0):null, note!==undefined?note:null, id);
  const s = db.prepare('SELECT * FROM subtasks WHERE id=?').get(id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});
app.delete('/api/subtasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM subtasks WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Life Areas ───
app.get('/api/areas', (req, res) => {
  res.json(db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM goals g WHERE g.area_id=a.id) as goal_count,
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status!='done') as pending_tasks,
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status='done') as done_tasks
    FROM life_areas a ORDER BY a.position
  `).all());
});
app.post('/api/areas', (req, res) => {
  const { name, icon, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const pos = getNextPosition('life_areas');
  const r = db.prepare('INSERT INTO life_areas (name,icon,color,position) VALUES (?,?,?,?)').run(name.trim(), icon||'📋', color||'#2563EB', pos);
  res.status(201).json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/areas/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { name, icon, color } = req.body;
  db.prepare('UPDATE life_areas SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color) WHERE id=?').run(name||null,icon||null,color||null,id);
  const a = db.prepare('SELECT * FROM life_areas WHERE id=?').get(id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json(a);
});
app.delete('/api/areas/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM life_areas WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Goals ───
app.get('/api/areas/:areaId/goals', (req, res) => {
  const areaId = Number(req.params.areaId);
  if (!Number.isInteger(areaId)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id AND t.status='done') as done_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id AND t.status!='done') as pending_tasks
    FROM goals g WHERE g.area_id=? ORDER BY g.position
  `).all(areaId));
});
app.post('/api/areas/:areaId/goals', (req, res) => {
  const areaId = Number(req.params.areaId);
  if (!Number.isInteger(areaId)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, description, color, due_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const pos = getNextPosition('goals', 'area_id', areaId);
  const r = db.prepare('INSERT INTO goals (area_id,title,description,color,due_date,position) VALUES (?,?,?,?,?,?)').run(areaId,title.trim(),description||'',color||'#6C63FF',due_date||null,pos);
  res.status(201).json(db.prepare('SELECT * FROM goals WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/goals/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, description, color, status, due_date } = req.body;
  db.prepare('UPDATE goals SET title=COALESCE(?,title),description=COALESCE(?,description),color=COALESCE(?,color),status=COALESCE(?,status),due_date=? WHERE id=?').run(
    title||null, description!==undefined?description:null, color||null, status||null, due_date!==undefined?due_date:null, id
  );
  const g = db.prepare('SELECT * FROM goals WHERE id=?').get(id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json(g);
});
app.delete('/api/goals/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM goals WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Tasks ───
app.get('/api/goals/:goalId/tasks', (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(enrichTasks(db.prepare("SELECT * FROM tasks WHERE goal_id=? ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, position").all(goalId)));
});
app.get('/api/tasks/my-day', (req, res) => {
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.my_day=1 OR t.due_date=date('now')
    ORDER BY t.priority DESC, t.position
  `).all()));
});
app.get('/api/tasks/all', (req, res) => {
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    ORDER BY t.status, t.priority DESC, t.due_date
  `).all()));
});
app.get('/api/tasks/board', (req, res) => {
  const goalId = req.query.goal_id ? Number(req.query.goal_id) : null;
  const areaId = req.query.area_id ? Number(req.query.area_id) : null;
  const priority = req.query.priority !== undefined ? Number(req.query.priority) : null;
  const tagId = req.query.tag_id ? Number(req.query.tag_id) : null;
  let clauses = [], params = [];
  if (goalId && Number.isInteger(goalId)) { clauses.push('t.goal_id=?'); params.push(goalId); }
  if (areaId && Number.isInteger(areaId)) { clauses.push('a.id=?'); params.push(areaId); }
  if (priority !== null && Number.isInteger(priority)) { clauses.push('t.priority=?'); params.push(priority); }
  if (tagId && Number.isInteger(tagId)) { clauses.push('t.id IN (SELECT task_id FROM task_tags WHERE tag_id=?)'); params.push(tagId); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.id as area_id
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    ${where} ORDER BY t.priority DESC, t.position
  `).all(...params)));
});
app.get('/api/tasks/calendar', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date BETWEEN ? AND ? ORDER BY t.due_date, t.priority DESC
  `).all(start, end)));
});
app.post('/api/goals/:goalId/tasks', (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, note, priority, due_date, due_time, recurring, assigned_to, my_day, tagIds, time_block_start, time_block_end, estimated_minutes, list_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  if (due_date !== undefined && due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return res.status(400).json({ error: 'Invalid due_date format (YYYY-MM-DD)' });
  if (priority !== undefined && priority !== null && ![0,1,2,3].includes(Number(priority))) return res.status(400).json({ error: 'Priority must be 0-3' });
  if (estimated_minutes !== undefined && estimated_minutes !== null && (typeof estimated_minutes !== 'number' || estimated_minutes < 0)) return res.status(400).json({ error: 'estimated_minutes must be a non-negative number' });
  if (list_id) { const lid = Number(list_id); if (!Number.isInteger(lid) || !db.prepare('SELECT id FROM lists WHERE id=?').get(lid)) return res.status(400).json({ error: 'Invalid list_id' }); }
  const createTaskTx = db.transaction(() => {
    const pos = getNextPosition('tasks', 'goal_id', goalId);
    const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,due_time,recurring,assigned_to,my_day,position,time_block_start,time_block_end,estimated_minutes,list_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      goalId,title.trim(),note||'',priority||0,due_date||null,due_time||null,recurring||null,assigned_to||'',my_day?1:0,pos,time_block_start||null,time_block_end||null,estimated_minutes||null,list_id?Number(list_id):null
    );
    const taskId = r.lastInsertRowid;
    if (Array.isArray(tagIds)) {
      const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
      tagIds.forEach(tid => { if (Number.isInteger(tid)) ins.run(taskId, tid); });
    }
    return taskId;
  });
  const taskId = createTaskTx();
  res.status(201).json(enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId)));
});
// ─── Task Reorder (must be before :id routes) ───
app.put('/api/tasks/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const upd = db.prepare('UPDATE tasks SET position=?, due_date=COALESCE(?,due_date) WHERE id=?');
  const tx = db.transaction(() => {
    items.forEach(({ id, position, due_date }) => {
      if (Number.isInteger(id) && Number.isInteger(position)) upd.run(position, due_date !== undefined ? due_date : null, id);
    });
  });
  tx();
  res.json({ ok: true });
});

// ─── Search (before :id to avoid param capture) ───
app.get('/api/tasks/search', (req, res) => {
  const q = req.query.q;
  const hasQ = q && q.trim();
  const hasFilters = req.query.area_id || req.query.goal_id || req.query.status;
  if (!hasQ && !hasFilters) return res.json([]);
  let whereParts = [], params = [];
  if (hasQ) {
    const term = '%' + q.trim() + '%';
    whereParts.push('(t.title LIKE ? OR t.note LIKE ? OR s.title LIKE ?)');
    params.push(term, term, term);
  }
  if (req.query.area_id) { whereParts.push('a.id=?'); params.push(Number(req.query.area_id)); }
  if (req.query.goal_id) { whereParts.push('g.id=?'); params.push(Number(req.query.goal_id)); }
  if (req.query.status) { whereParts.push('t.status=?'); params.push(req.query.status); }
  const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  res.json(enrichTasks(db.prepare(`
    SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    LEFT JOIN subtasks s ON s.task_id=t.id
    ${whereClause}
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, t.priority DESC
    LIMIT 50
  `).all(...params)));
});

// ─── Overdue (before :id to avoid param capture) ───
app.get('/api/tasks/overdue', (req, res) => {
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date < date('now') AND t.status != 'done'
    ORDER BY t.due_date, t.priority DESC
  `).all()));
});

// Recurring tasks list (before :id to avoid param capture)
app.get('/api/tasks/recurring', (req, res) => {
  const tasks = enrichTasks(db.prepare(`SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.recurring IS NOT NULL AND t.status!='done'
    ORDER BY t.due_date`).all());
  res.json(tasks);
});

// Single task GET
app.get('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const t = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id WHERE t.id=?
  `).get(id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(enrichTask(t));
});

// Recurring task helper: compute next due date
function nextDueDate(dueDate, recurrence) {
  if (!dueDate || !recurrence) return null;
  const d = new Date(dueDate + 'T00:00:00');
  if (recurrence === 'daily') d.setDate(d.getDate() + 1);
  else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else {
    // Custom: "every-N-days", "every-N-weeks", "weekdays"
    const evDays = recurrence.match(/^every-(\d+)-days$/);
    const evWeeks = recurrence.match(/^every-(\d+)-weeks$/);
    if (evDays) d.setDate(d.getDate() + Number(evDays[1]));
    else if (evWeeks) d.setDate(d.getDate() + Number(evWeeks[1]) * 7);
    else if (recurrence === 'weekdays') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    }
    else return null;
  }
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ─── BULK OPERATIONS (before :id to avoid param capture) ───
app.put('/api/tasks/bulk', (req, res) => {
  const { ids, changes } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'changes object required' });
  if (changes.status !== undefined && !['todo','doing','done'].includes(changes.status)) return res.status(400).json({ error: 'Invalid status' });
  if (changes.priority !== undefined && ![0,1,2,3].includes(Number(changes.priority))) return res.status(400).json({ error: 'Priority must be 0-3' });
  const bulkTx = db.transaction(() => {
    const results = [];
    const selectTask = db.prepare('SELECT * FROM tasks WHERE id=?');
    for (const rawId of ids) {
      const id = Number(rawId);
      if (!Number.isInteger(id)) continue;
      const ex = selectTask.get(id);
      if (!ex) continue;
      const sets = [], vals = [];
      if (changes.priority !== undefined) { sets.push('priority=?'); vals.push(changes.priority); }
      if (changes.due_date !== undefined) { sets.push('due_date=?'); vals.push(changes.due_date); }
      if (changes.my_day !== undefined) { sets.push('my_day=?'); vals.push(changes.my_day ? 1 : 0); }
      if (changes.goal_id !== undefined) { sets.push('goal_id=?'); vals.push(changes.goal_id); }
      if (changes.status !== undefined) {
        sets.push('status=?'); vals.push(changes.status);
        if (changes.status === 'done' && ex.status !== 'done') {
          sets.push('completed_at=?'); vals.push(new Date().toISOString());
        }
      }
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id=?`).run(...vals);
      }
      if (changes.add_tag_id) {
        db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(id, Number(changes.add_tag_id));
      }
      if (changes.remove_tag_id) {
        db.prepare('DELETE FROM task_tags WHERE task_id=? AND tag_id=?').run(id, Number(changes.remove_tag_id));
      }
      results.push(id);
    }
    return results;
  });
  const results = bulkTx();
  res.json({ updated: results.length, ids: results });
});

app.put('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, note, status, priority, due_date, due_time, recurring, assigned_to, my_day, position, goal_id, time_block_start, time_block_end, estimated_minutes, actual_minutes, list_id } = req.body;
  if (status !== undefined && status !== null && !['todo','doing','done'].includes(status)) return res.status(400).json({ error: 'Invalid status (must be todo, doing, or done)' });
  if (priority !== undefined && priority !== null && ![0,1,2,3].includes(Number(priority))) return res.status(400).json({ error: 'Priority must be 0-3' });
  if (due_date !== undefined && due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return res.status(400).json({ error: 'Invalid due_date format (YYYY-MM-DD)' });
  if (estimated_minutes !== undefined && estimated_minutes !== null && (typeof estimated_minutes !== 'number' || estimated_minutes < 0)) return res.status(400).json({ error: 'estimated_minutes must be a non-negative number' });
  if (list_id !== undefined && list_id !== null) { const lid = Number(list_id); if (!Number.isInteger(lid) || !db.prepare('SELECT id FROM lists WHERE id=?').get(lid)) return res.status(400).json({ error: 'Invalid list_id' }); }
  const completedAt = status==='done' && ex.status!=='done' ? new Date().toISOString() : (status && status!=='done' ? null : ex.completed_at);
  db.prepare(`UPDATE tasks SET title=COALESCE(?,title),note=COALESCE(?,note),status=COALESCE(?,status),
    priority=COALESCE(?,priority),due_date=?,due_time=?,recurring=?,assigned_to=COALESCE(?,assigned_to),
    my_day=COALESCE(?,my_day),position=COALESCE(?,position),goal_id=COALESCE(?,goal_id),completed_at=?,
    time_block_start=?,time_block_end=?,estimated_minutes=?,actual_minutes=?,list_id=? WHERE id=?`).run(
    title||null, note!==undefined?note:null, status||null, priority!==undefined?priority:null,
    due_date!==undefined?due_date:ex.due_date, due_time!==undefined?due_time:ex.due_time,
    recurring!==undefined?recurring:ex.recurring,
    assigned_to!==undefined?assigned_to:null, my_day!==undefined?(my_day?1:0):null,
    position!==undefined?position:null, goal_id||null, completedAt,
    time_block_start!==undefined?time_block_start:ex.time_block_start, time_block_end!==undefined?time_block_end:ex.time_block_end,
    estimated_minutes!==undefined?estimated_minutes:ex.estimated_minutes, actual_minutes!==undefined?actual_minutes:ex.actual_minutes,
    list_id!==undefined?(list_id?Number(list_id):null):ex.list_id, id
  );
  // Recurring: spawn next task when completed
  if (status === 'done' && ex.status !== 'done' && ex.recurring) {
    const recurTx = db.transaction(() => {
      const nd = nextDueDate(ex.due_date, ex.recurring);
      const rpos = getNextPosition('tasks', 'goal_id', ex.goal_id);
      const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,due_time,recurring,assigned_to,my_day,position) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
        ex.goal_id, ex.title, ex.note, ex.priority, nd, ex.due_time, ex.recurring, ex.assigned_to, 0, rpos
      );
      // Copy tags to new task
      const oldTags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(id);
      const insTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
      oldTags.forEach(tt => insTag.run(r.lastInsertRowid, tt.tag_id));
    });
    recurTx();
  }
  // Execute automation rules on completion
  if (status === 'done' && ex.status !== 'done') {
    const updated = db.prepare('SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE t.id=?').get(id);
    if (updated) executeRules('task_completed', updated);
  }
  // Execute rules on task creation (for overdue auto-add etc.)
  if (status && status !== ex.status && status !== 'done') {
    const updated = db.prepare('SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE t.id=?').get(id);
    if (updated) executeRules('task_updated', updated);
  }
  res.json(enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id)));
});
app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM tasks WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Stats / Dashboard ───
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  const done = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done'").get().c;
  const overdue = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date < date('now') AND status != 'done'").get().c;
  const dueToday = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date = date('now') AND status != 'done'").get().c;
  const thisWeek = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE completed_at >= date('now','-7 days') AND status='done'").get().c;
  const byArea = db.prepare(`
    SELECT a.name, a.icon, a.color,
      COUNT(t.id) as total,
      SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done
    FROM life_areas a
    LEFT JOIN goals g ON g.area_id=a.id
    LEFT JOIN tasks t ON t.goal_id=g.id
    GROUP BY a.id ORDER BY a.position
  `).all();
  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) as total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done
    FROM tasks GROUP BY priority
  `).all();
  const recentDone = db.prepare(`
    SELECT t.title, t.completed_at, g.title as goal_title
    FROM tasks t JOIN goals g ON t.goal_id=g.id
    WHERE t.status='done' AND t.completed_at IS NOT NULL
    ORDER BY t.completed_at DESC LIMIT 10
  `).all();
  res.json({ total, done, overdue, dueToday, thisWeek, byArea, byPriority, recentDone });
});

// ─── Focus Session Tracking ───
db.exec(`CREATE TABLE IF NOT EXISTS focus_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_sec INTEGER DEFAULT 0,
  type TEXT DEFAULT 'pomodoro',
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
)`);

app.post('/api/focus', (req, res) => {
  const { task_id, duration_sec, type } = req.body;
  if (!task_id || !Number.isInteger(Number(task_id))) return res.status(400).json({ error: 'task_id required' });
  const r = db.prepare('INSERT INTO focus_sessions (task_id, duration_sec, type) VALUES (?,?,?)').run(
    Number(task_id), duration_sec || 0, type || 'pomodoro'
  );
  res.status(201).json(db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/focus/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const { duration_sec, type } = req.body;
  db.prepare('UPDATE focus_sessions SET duration_sec=COALESCE(?,duration_sec), type=COALESCE(?,type) WHERE id=?').run(
    duration_sec !== undefined ? duration_sec : null, type || null, id
  );
  res.json(db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(id));
});
app.delete('/api/focus/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  db.prepare('DELETE FROM focus_sessions WHERE id=?').run(id);
  res.json({ ok: true });
});

app.get('/api/focus/stats', (req, res) => {
  const today = db.prepare("SELECT COALESCE(SUM(duration_sec),0) as total FROM focus_sessions WHERE date(started_at)=date('now')").get().total;
  const week = db.prepare("SELECT COALESCE(SUM(duration_sec),0) as total FROM focus_sessions WHERE started_at>=date('now','-7 days')").get().total;
  const sessions = db.prepare("SELECT COALESCE(COUNT(*),0) as c FROM focus_sessions WHERE date(started_at)=date('now')").get().c;
  const byTask = db.prepare(`
    SELECT t.title, SUM(f.duration_sec) as total_sec, COUNT(f.id) as sessions
    FROM focus_sessions f JOIN tasks t ON f.task_id=t.id
    WHERE f.started_at>=date('now','-7 days')
    GROUP BY f.task_id ORDER BY total_sec DESC LIMIT 10
  `).all();
  res.json({ today, week, sessions, byTask });
});

// ─── Streak & Heatmap ───
app.get('/api/stats/streaks', (req, res) => {
  // Heatmap: completions per day for last 365 days
  const heatmap = db.prepare(`
    SELECT date(completed_at) as day, COUNT(*) as count
    FROM tasks WHERE status='done' AND completed_at IS NOT NULL
      AND completed_at >= date('now','-365 days')
    GROUP BY date(completed_at) ORDER BY day
  `).all();
  // Streak: consecutive days with at least 1 completion ending today
  let streak = 0;
  const today = new Date(); today.setHours(0,0,0,0);
  const dayMs = 86400000;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today - i * dayMs);
    const ds = d.toISOString().slice(0,10);
    const cnt = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)=?").get(ds).c;
    if (cnt > 0) streak++;
    else break;
  }
  const bestStreak = (() => {
    let best = 0, cur = 0;
    for (let i = 365; i >= 0; i--) {
      const d = new Date(today - i * dayMs);
      const ds = d.toISOString().slice(0,10);
      const found = heatmap.find(h => h.day === ds);
      if (found && found.count > 0) { cur++; if (cur > best) best = cur; }
      else cur = 0;
    }
    return best;
  })();
  res.json({ streak, bestStreak, heatmap });
});

// ─── NLP Quick Capture Parser ───
app.post('/api/tasks/parse', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  let input = text.trim();
  let priority = 0, due_date = null, tags = [], my_day = false;
  // Extract priority: p1 p2 p3 or !1 !2 !3
  input = input.replace(/\b[pP!]([1-3])\b/g, (_, n) => { priority = Number(n); return ''; });
  // Extract tags: #tagname
  input = input.replace(/#([a-zA-Z0-9_-]+)/g, (_, tag) => { tags.push(tag.toLowerCase()); return ''; });
  // Extract my_day: *today* or *myday*
  if (/\bmy\s*day\b/i.test(input)) { my_day = true; input = input.replace(/\bmy\s*day\b/gi, ''); }
  // Extract dates: today, tomorrow, day-after-tomorrow, next monday-sunday, in N days
  const today = new Date(); today.setHours(0,0,0,0);
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  input = input.replace(/\b(today)\b/gi, () => { due_date = fmt(today); return ''; });
  input = input.replace(/\bday\s*after\s*tomorrow\b/gi, () => { const d = new Date(today); d.setDate(d.getDate()+2); due_date = fmt(d); return ''; });
  input = input.replace(/\b(tomorrow)\b/gi, () => { const d = new Date(today); d.setDate(d.getDate()+1); due_date = fmt(d); return ''; });
  input = input.replace(/\bin\s+(\d+)\s*days?\b/gi, (_, n) => { const d = new Date(today); d.setDate(d.getDate()+Number(n)); due_date = fmt(d); return ''; });
  input = input.replace(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, (_, day) => {
    const targetDay = dayNames.indexOf(day.toLowerCase());
    const d = new Date(today); let diff = targetDay - d.getDay(); if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff); due_date = fmt(d); return '';
  });
  // Extract YYYY-MM-DD or MM/DD
  input = input.replace(/(\d{4})-(\d{2})-(\d{2})/g, (m) => { due_date = m; return ''; });
  input = input.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (_, mo, da) => {
    const y = today.getFullYear(); due_date = `${y}-${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`; return '';
  });
  const title = input.replace(/\s+/g, ' ').trim();
  function fmt(d) { return d.toISOString().slice(0, 10); }
  res.json({ title: title || text.trim(), priority, due_date, tags, my_day });
});

// ─── All Goals (for quick capture) ───
app.get('/api/goals', (req, res) => {
  res.json(db.prepare(`
    SELECT g.*, a.name as area_name, a.icon as area_icon
    FROM goals g JOIN life_areas a ON g.area_id=a.id
    WHERE g.status='active'
    ORDER BY a.position, g.position
  `).all());
});

// ─── Activity Log ───
app.get('/api/activity', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const total = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND completed_at IS NOT NULL").get().c;
  const items = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status='done' AND t.completed_at IS NOT NULL
    ORDER BY t.completed_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  res.json({ total, page, pages: Math.ceil(total / limit), items: enrichTasks(items) });
});

// ─── Auto Backup ───
const backupDir = path.join(dbDir, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

function runBackup() {
  const areas = db.prepare('SELECT * FROM life_areas ORDER BY position').all();
  const goals = db.prepare('SELECT * FROM goals ORDER BY area_id, position').all();
  const tasks = enrichTasks(db.prepare('SELECT * FROM tasks ORDER BY goal_id, position').all());
  const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  const data = JSON.stringify({ backupDate: new Date().toISOString(), areas, goals, tasks, tags });
  const fname = `lifeflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(path.join(backupDir, fname), data);
  // Rotate: keep last 7
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('lifeflow-backup-')).sort();
  while (files.length > 7) { fs.unlinkSync(path.join(backupDir, files.shift())); }
  return fname;
}

// Backup on startup
try { runBackup(); } catch(e) { console.error('Backup failed:', e.message); }
// Backup every 24h
setInterval(() => { try { runBackup(); } catch(e) { console.error('Backup failed:', e.message); } }, 24 * 60 * 60 * 1000);

app.post('/api/backup', (req, res) => {
  const fname = runBackup();
  res.json({ ok: true, file: fname });
});

app.get('/api/backups', (req, res) => {
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('lifeflow-backup-')).sort().reverse();
  res.json(files.map(f => ({ name: f, size: fs.statSync(path.join(backupDir, f)).size, date: f.replace('lifeflow-backup-', '').replace('.json', '') })));
});

// ─── Export ───
app.get('/api/export', (req, res) => {
  const areas = db.prepare('SELECT * FROM life_areas ORDER BY position').all();
  const goals = db.prepare('SELECT * FROM goals ORDER BY area_id, position').all();
  const tasks = enrichTasks(db.prepare('SELECT * FROM tasks ORDER BY goal_id, position').all());
  const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  res.setHeader('Content-Disposition', 'attachment; filename=lifeflow-export.json');
  res.json({ exportDate: new Date().toISOString(), areas, goals, tasks, tags });
});

// ─── Import ───
app.post('/api/import', (req, res) => {
  const { areas, goals, tasks, tags, confirm } = req.body;
  if (confirm !== 'DESTROY_ALL_DATA') return res.status(403).json({ error: 'Import requires confirm: "DESTROY_ALL_DATA" — this will erase all existing data' });
  if (!Array.isArray(areas) || !areas.length) return res.status(400).json({ error: 'areas must be a non-empty array' });
  if (!Array.isArray(goals) || !goals.length) return res.status(400).json({ error: 'goals must be a non-empty array' });
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'tasks must be a non-empty array' });
  // Validate required fields in import data
  for (const a of areas) { if (!a.name || !a.id) return res.status(400).json({ error: 'Each area must have id and name' }); }
  for (const g of goals) { if (!g.title || !g.id || !g.area_id) return res.status(400).json({ error: 'Each goal must have id, title, and area_id' }); }
  for (const t of tasks) { if (!t.title || !t.goal_id) return res.status(400).json({ error: 'Each task must have title and goal_id' }); }
  const importTx = db.transaction(() => {
    // Clear existing data in dependency order
    db.prepare('DELETE FROM focus_sessions').run();
    db.prepare('DELETE FROM task_tags').run();
    db.prepare('DELETE FROM subtasks').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM goals').run();
    db.prepare('DELETE FROM life_areas').run();
    db.prepare('DELETE FROM tags').run();

    // Map old IDs to new IDs
    const areaMap = {}, goalMap = {}, tagMap = {};

    // Import tags
    if (Array.isArray(tags)) {
      const insTag = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
      tags.forEach(t => {
        const r = insTag.run(t.name, t.color || '#64748B');
        tagMap[t.id] = r.lastInsertRowid;
      });
    }

    // Import areas
    const insArea = db.prepare('INSERT INTO life_areas (name, icon, color, position) VALUES (?, ?, ?, ?)');
    areas.forEach(a => {
      const r = insArea.run(a.name, a.icon || '📂', a.color || '#2563EB', a.position || 0);
      areaMap[a.id] = r.lastInsertRowid;
    });

    // Import goals
    const insGoal = db.prepare('INSERT INTO goals (area_id, title, description, due_date, color, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    goals.forEach(g => {
      const newAreaId = areaMap[g.area_id];
      if (!newAreaId) return; // skip orphan goals
      const r = insGoal.run(newAreaId, g.title, g.description || '', g.due_date || null, g.color || '#6C63FF', g.status || 'active', g.position || 0);
      goalMap[g.id] = r.lastInsertRowid;
    });

    // Import tasks
    const insTask = db.prepare('INSERT INTO tasks (goal_id, title, note, status, priority, due_date, my_day, position, recurring, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insSubtask = db.prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, ?, ?)');
    const insTaskTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    tasks.forEach(t => {
      const newGoalId = goalMap[t.goal_id];
      if (!newGoalId) return; // skip orphan tasks
      const r = insTask.run(newGoalId, t.title, t.notes || t.note || '', t.status || 'todo', t.priority || 0, t.due_date || null, t.my_day ? 1 : 0, t.position || 0, t.recurring || null, t.completed_at || null);
      const newTaskId = r.lastInsertRowid;
      // Subtasks
      if (Array.isArray(t.subtasks)) {
        t.subtasks.forEach(s => insSubtask.run(newTaskId, s.title, s.done ? 1 : 0, s.position || 0));
      }
      // Tags
      if (Array.isArray(t.tags)) {
        t.tags.forEach(tag => {
          const newTagId = tagMap[tag.id];
          if (newTagId) insTaskTag.run(newTaskId, newTagId);
        });
      }
    });
  });
  try {
    importTx();
    res.json({ ok: true, message: 'Import successful' });
  } catch (e) {
    console.error('Import failed:', e.message);
    res.status(500).json({ error: 'Import failed' });
  }
});

// ─── Tag Management ───
app.put('/api/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { name, color } = req.body;
  const tag = db.prepare('SELECT * FROM tags WHERE id=?').get(id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  if (name !== undefined) {
    const clean = String(name).trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '');
    if (!clean) return res.status(400).json({ error: 'Name required' });
    const dup = db.prepare('SELECT * FROM tags WHERE name=? AND id!=?').get(clean, id);
    if (dup) return res.status(409).json({ error: 'Tag name already exists' });
    db.prepare('UPDATE tags SET name=? WHERE id=?').run(clean, id);
  }
  if (color !== undefined) {
    db.prepare('UPDATE tags SET color=? WHERE id=?').run(color, id);
  }
  res.json(db.prepare('SELECT * FROM tags WHERE id=?').get(id));
});

app.get('/api/tags/stats', (req, res) => {
  const tags = db.prepare(`
    SELECT t.*, COUNT(tt.task_id) as usage_count
    FROM tags t LEFT JOIN task_tags tt ON t.id=tt.tag_id
    GROUP BY t.id ORDER BY t.name
  `).all();
  res.json(tags);
});

// ─── Focus Session History ───
app.get('/api/focus/history', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as c FROM focus_sessions').get().c;
  const items = db.prepare(`
    SELECT f.*, t.title as task_title, g.title as goal_title, a.name as area_name
    FROM focus_sessions f
    JOIN tasks t ON f.task_id=t.id
    JOIN goals g ON t.goal_id=g.id
    JOIN life_areas a ON g.area_id=a.id
    ORDER BY f.started_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  // Also return daily totals for the last 14 days
  const daily = db.prepare(`
    SELECT date(started_at) as day, SUM(duration_sec) as total_sec, COUNT(*) as sessions
    FROM focus_sessions
    WHERE started_at >= date('now', '-14 days')
    GROUP BY date(started_at) ORDER BY day
  `).all();
  res.json({ total, page, pages: Math.ceil(total / limit), items, daily });
});

// ─── Reminders (upcoming + overdue summary) ───
app.get('/api/reminders', (req, res) => {
  const overdue = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date < date('now') AND t.status != 'done'
    ORDER BY t.due_date, t.priority DESC
  `).all());
  const today = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date = date('now') AND t.status != 'done'
    ORDER BY t.priority DESC
  `).all());
  const upcoming = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date > date('now') AND t.due_date <= date('now', '+3 days') AND t.status != 'done'
    ORDER BY t.due_date, t.priority DESC
  `).all());
  res.json({ overdue, today, upcoming, total: overdue.length + today.length + upcoming.length });
});

// ─── Task Dependencies ───
app.get('/api/tasks/:id/deps', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const blockedBy = db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id=?').all(id);
  const blocking = db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.task_id WHERE d.blocked_by_id=?').all(id);
  res.json({ blockedBy, blocking });
});

app.put('/api/tasks/:id/deps', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { blockedByIds } = req.body;
  if (!Array.isArray(blockedByIds)) return res.status(400).json({ error: 'blockedByIds array required' });
  // Prevent self-dependency
  const valid = blockedByIds.filter(bid => Number.isInteger(bid) && bid !== id);
  // Check for circular dependencies via DFS
  for (const bid of valid) {
    const visited = new Set();
    const stack = [bid];
    while (stack.length) {
      const curr = stack.pop();
      if (curr === id) return res.status(400).json({ error: 'Circular dependency detected' });
      if (visited.has(curr)) continue;
      visited.add(curr);
      const deps = db.prepare('SELECT blocked_by_id FROM task_deps WHERE task_id=?').all(curr);
      deps.forEach(d => stack.push(d.blocked_by_id));
    }
  }
  db.prepare('DELETE FROM task_deps WHERE task_id=?').run(id);
  const ins = db.prepare('INSERT OR IGNORE INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)');
  valid.forEach(bid => ins.run(id, bid));
  res.json({ ok: true, blockedBy: db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id=?').all(id) });
});

// ─── Task Templates ───
app.get('/api/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM task_templates ORDER BY created_at DESC').all();
  res.json(rows.map(r => { try { return { ...r, tasks: JSON.parse(r.tasks) }; } catch { return { ...r, tasks: [] }; } }));
});

app.post('/api/templates', (req, res) => {
  const { name, description, icon, tasks } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'Tasks array required' });
  const safeTasks = tasks.map(t => ({ title: String(t.title || '').slice(0, 500), priority: [0,1,2,3].includes(t.priority) ? t.priority : 0, subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).slice(0, 500)) : [] }));
  const r = db.prepare('INSERT INTO task_templates (name, description, icon, tasks) VALUES (?, ?, ?, ?)').run(name.trim().slice(0, 200), (description || '').slice(0, 500), (icon || '📋').slice(0, 10), JSON.stringify(safeTasks));
  res.json({ id: r.lastInsertRowid, name: name.trim(), description, icon: icon || '📋', tasks: safeTasks });
});

app.put('/api/templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM task_templates WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Template not found' });
  const { name, description, icon, tasks } = req.body;
  const safeTasks = tasks ? (Array.isArray(tasks) ? tasks.map(t => ({ title: String(t.title || '').slice(0, 500), priority: [0,1,2,3].includes(t.priority) ? t.priority : 0, subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).slice(0, 500)) : [] })) : null) : null;
  db.prepare('UPDATE task_templates SET name=COALESCE(?,name), description=COALESCE(?,description), icon=COALESCE(?,icon), tasks=COALESCE(?,tasks) WHERE id=?').run(
    name ? name.trim().slice(0, 200) : null, description !== undefined ? (description || '').slice(0, 500) : null, icon || null, safeTasks ? JSON.stringify(safeTasks) : null, id
  );
  const updated = db.prepare('SELECT * FROM task_templates WHERE id=?').get(id);
  try { updated.tasks = JSON.parse(updated.tasks); } catch { updated.tasks = []; }
  res.json(updated);
});

app.delete('/api/templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM task_templates WHERE id=?').run(id);
  res.json({ ok: true });
});

app.post('/api/templates/:id/apply', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { goalId } = req.body;
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'goalId required' });
  const tmpl = db.prepare('SELECT * FROM task_templates WHERE id=?').get(id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  let tasks;
  try { tasks = JSON.parse(tmpl.tasks); } catch { return res.status(500).json({ error: 'Corrupted template data' }); }
  const created = [];
  const insTask = db.prepare('INSERT INTO tasks (goal_id, title, priority, status) VALUES (?, ?, ?, ?)');
  const insSub = db.prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?)');
  const txn = db.transaction(() => {
    for (const t of tasks) {
      const r = insTask.run(goalId, t.title, t.priority || 0, 'todo');
      if (t.subtasks) t.subtasks.forEach((s, i) => insSub.run(r.lastInsertRowid, s, i));
      created.push({ id: r.lastInsertRowid, title: t.title });
    }
  });
  txn();
  res.json({ ok: true, created });
});

// ─── Settings ───
const SETTINGS_DEFAULTS = {
  defaultView: 'myday',
  theme: 'midnight',
  focusDuration: '25',
  shortBreak: '5',
  longBreak: '15',
  weekStart: '0',           // 0=Sunday, 1=Monday
  defaultPriority: '0',     // 0=None, 1=Normal, 2=High, 3=Critical
  showCompleted: 'true',
  confirmDelete: 'true',
  dateFormat: 'relative',   // relative, iso, us, eu
  autoMyDay: 'false',       // auto-add new tasks to My Day
};

const SETTINGS_KEYS = new Set(Object.keys(SETTINGS_DEFAULTS));

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (SETTINGS_KEYS.has(r.key)) settings[r.key] = r.value;
  }
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Object required' });
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const txn = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      if (!SETTINGS_KEYS.has(k)) continue;
      upsert.run(k, String(v));
    }
  });
  txn();
  // Return full settings
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (SETTINGS_KEYS.has(r.key)) settings[r.key] = r.value;
  }
  res.json(settings);
});

app.post('/api/settings/reset', (req, res) => {
  db.prepare('DELETE FROM settings').run();
  res.json(SETTINGS_DEFAULTS);
});

// ─── Saved Filters CRUD ───
app.get('/api/filters', (req, res) => {
  res.json(db.prepare('SELECT * FROM saved_filters ORDER BY position').all());
});
app.post('/api/filters', (req, res) => {
  const { name, icon, color, filters } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!filters || typeof filters !== 'object') return res.status(400).json({ error: 'Filters object required' });
  const pos = getNextPosition('saved_filters');
  const r = db.prepare('INSERT INTO saved_filters (name,icon,color,filters,position) VALUES (?,?,?,?,?)').run(
    name.trim(), icon || '🔍', color || '#2563EB', JSON.stringify(filters), pos
  );
  res.status(201).json(db.prepare('SELECT * FROM saved_filters WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/filters/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM saved_filters WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, icon, color, filters } = req.body;
  db.prepare('UPDATE saved_filters SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),filters=COALESCE(?,filters) WHERE id=?').run(
    name||null, icon||null, color||null, filters ? JSON.stringify(filters) : null, id
  );
  res.json(db.prepare('SELECT * FROM saved_filters WHERE id=?').get(id));
});
app.delete('/api/filters/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM saved_filters WHERE id=?').run(id);
  res.json({ ok: true });
});
// Execute a saved filter (or ad-hoc filter params)
app.get('/api/filters/execute', (req, res) => {
  let whereParts = [], params = [];
  if (req.query.area_id) { whereParts.push('a.id=?'); params.push(Number(req.query.area_id)); }
  if (req.query.goal_id) { whereParts.push('g.id=?'); params.push(Number(req.query.goal_id)); }
  if (req.query.priority) { whereParts.push('t.priority=?'); params.push(Number(req.query.priority)); }
  if (req.query.status) { whereParts.push('t.status=?'); params.push(req.query.status); }
  if (req.query.tag_id) { whereParts.push('EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=t.id AND tt.tag_id=?)'); params.push(Number(req.query.tag_id)); }
  if (req.query.due) {
    const due = req.query.due;
    if (due === 'today') { whereParts.push("t.due_date=date('now')"); }
    else if (due === 'week') { whereParts.push("t.due_date BETWEEN date('now') AND date('now','+7 days')"); }
    else if (due === 'overdue') { whereParts.push("t.due_date < date('now') AND t.status!='done'"); }
    else if (due === 'none') { whereParts.push('t.due_date IS NULL'); }
  }
  if (req.query.my_day) { whereParts.push('t.my_day=1'); }
  if (req.query.has_time) { whereParts.push('t.due_time IS NOT NULL'); }
  if (req.query.stale_days) { whereParts.push("t.status!='done'"); whereParts.push("t.created_at <= datetime('now','-' || ? || ' days')"); params.push(Number(req.query.stale_days)); whereParts.push("t.completed_at IS NULL"); }
  if (req.query.max_estimated) { whereParts.push('t.estimated_minutes IS NOT NULL'); whereParts.push('t.estimated_minutes<=?'); params.push(Number(req.query.max_estimated)); whereParts.push("t.status!='done'"); }
  if (req.query.is_blocked) { whereParts.push("EXISTS (SELECT 1 FROM task_deps td JOIN tasks bt ON td.blocked_by_id=bt.id WHERE td.task_id=t.id AND bt.status!='done')"); }
  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  res.json(enrichTasks(db.prepare(`
    SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    ${where}
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, t.priority DESC, t.due_date
    LIMIT 200
  `).all(...params)));
});

// ─── Habits API ───
app.get('/api/habits', (req, res) => {
  const habits = db.prepare('SELECT * FROM habits WHERE archived=0 ORDER BY position').all();
  if (!habits.length) return res.json(habits);
  const today = new Date().toISOString().slice(0, 10);
  // Batch-load all logs for these habits (last 400 days for streak calc)
  const hIds = habits.map(h => h.id);
  const hph = hIds.map(() => '?').join(',');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 400);
  const allLogs = db.prepare(`SELECT habit_id, date, count FROM habit_logs WHERE habit_id IN (${hph}) AND date >= ? ORDER BY date DESC`).all(...hIds, cutoff.toISOString().slice(0, 10));
  // Build per-habit log map: habit_id -> { date -> count }
  const logMap = {};
  allLogs.forEach(l => {
    if (!logMap[l.habit_id]) logMap[l.habit_id] = {};
    logMap[l.habit_id][l.date] = l.count;
  });
  habits.forEach(h => {
    const logs = logMap[h.id] || {};
    h.todayCount = logs[today] || 0;
    h.completed = h.todayCount >= h.target;
    // Calculate streak
    let streak = 0;
    const d = new Date();
    const todayCount = logs[today] || 0;
    if (todayCount < h.target) d.setDate(d.getDate() - 1);
    else { streak = 1; d.setDate(d.getDate() - 1); }
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      const count = logs[ds];
      if (count !== undefined && count >= h.target) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    h.streak = streak;
  });
  res.json(habits);
});
app.post('/api/habits', (req, res) => {
  const { name, icon, color, frequency, target } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const validFreqs = ['daily','weekly','monthly','yearly'];
  if (frequency && !validFreqs.includes(frequency)) return res.status(400).json({ error: 'Invalid frequency (must be daily, weekly, monthly, or yearly)' });
  if (target !== undefined && target !== null && (typeof target !== 'number' || target < 1 || !Number.isInteger(target))) return res.status(400).json({ error: 'Target must be a positive integer' });
  const pos = getNextPosition('habits');
  const r = db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position) VALUES (?,?,?,?,?,?)').run(
    name.trim(), icon || '✅', color || '#22C55E', frequency || 'daily', target || 1, pos
  );
  res.status(201).json(db.prepare('SELECT * FROM habits WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, icon, color, frequency, target, archived } = req.body;
  db.prepare('UPDATE habits SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),frequency=COALESCE(?,frequency),target=COALESCE(?,target),archived=COALESCE(?,archived) WHERE id=?').run(
    name||null, icon||null, color||null, frequency||null, target!==undefined?target:null, archived!==undefined?archived:null, id
  );
  res.json(db.prepare('SELECT * FROM habits WHERE id=?').get(id));
});
app.delete('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM habits WHERE id=?').run(id);
  res.json({ ok: true });
});
// Log a habit completion for a date
app.post('/api/habits/:id/log', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
  if (!habit) return res.status(404).json({ error: 'Not found' });
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(id, date);
  if (existing) {
    db.prepare('UPDATE habit_logs SET count=count+1 WHERE habit_id=? AND date=?').run(id, date);
  } else {
    db.prepare('INSERT INTO habit_logs (habit_id,date,count) VALUES (?,?,1)').run(id, date);
  }
  const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(id, date);
  res.json(log);
});
// Undo a habit log
app.delete('/api/habits/:id/log', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
  if (!habit) return res.status(404).json({ error: 'Not found' });
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(id, date);
  if (existing && existing.count > 1) {
    db.prepare('UPDATE habit_logs SET count=count-1 WHERE habit_id=? AND date=?').run(id, date);
  } else {
    db.prepare('DELETE FROM habit_logs WHERE habit_id=? AND date=?').run(id, date);
  }
  res.json({ ok: true });
});
// Habit heatmap (last 90 days)
app.get('/api/habits/:id/heatmap', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
  if (!habit) return res.status(404).json({ error: 'Not found' });
  const logs = db.prepare("SELECT date, count FROM habit_logs WHERE habit_id=? AND date >= date('now','-90 days') ORDER BY date").all(id);
  res.json(logs);
});

// ─── DAY PLANNER API ───
// Suggest endpoint must come before :date to avoid param capture
app.get('/api/planner/suggest', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in3days = new Date(Date.now() + 3*86400000).toISOString().split('T')[0];

  const overdue = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date < ? ORDER BY t.due_date LIMIT 20`).all(today));

  const dueToday = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date=? AND t.my_day=0 ORDER BY t.priority DESC LIMIT 20`).all(today));

  const highPriority = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.priority>=2 AND t.my_day=0 AND (t.due_date IS NULL OR t.due_date>=?) ORDER BY t.priority DESC LIMIT 10`).all(today));

  const upcoming = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date>? AND t.due_date<=? AND t.my_day=0 ORDER BY t.due_date LIMIT 10`).all(today, in3days));

  res.json({ overdue, dueToday, highPriority, upcoming });
});

// ─── Smart Day Planning (scoring algorithm) ───
app.get('/api/planner/smart', (req, res) => {
  const maxMin = Number(req.query.max_minutes) || 240;
  const tasks = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status != 'done' AND t.my_day = 0
    ORDER BY t.priority DESC, t.due_date
  `).all();
  const today = new Date().toISOString().slice(0, 10);
  const scored = tasks.map(t => {
    let score = 0;
    const reasons = [];
    if (t.due_date && t.due_date <= today) { score += 50; reasons.push('overdue'); }
    else if (t.due_date) {
      const daysLeft = Math.ceil((new Date(t.due_date) - new Date(today)) / 86400000);
      if (daysLeft <= 1) { score += 40; reasons.push('due tomorrow'); }
      else if (daysLeft <= 3) { score += 25; reasons.push('due soon'); }
      else if (daysLeft <= 7) { score += 10; reasons.push('due this week'); }
    }
    if (t.priority === 3) { score += 30; reasons.push('urgent'); }
    else if (t.priority === 2) { score += 20; reasons.push('high priority'); }
    else if (t.priority === 1) { score += 10; reasons.push('medium priority'); }
    const age = Math.ceil((Date.now() - new Date(t.created_at).getTime()) / 86400000);
    if (age > 14) { score += 15; reasons.push('stale'); }
    else if (age > 7) { score += 5; reasons.push('aging'); }
    if ((t.estimated_minutes || 30) <= 15) { score += 10; reasons.push('quick win'); }
    return { ...t, score, reasons };
  }).sort((a, b) => b.score - a.score);
  let totalMin = 0;
  const suggested = [];
  for (const t of scored) {
    const est = t.estimated_minutes || 30;
    if (totalMin + est <= maxMin) { suggested.push(t); totalMin += est; }
    if (suggested.length >= 8) break;
  }
  res.json({ suggested: enrichTasks(suggested), total_minutes: totalMin, max_minutes: maxMin });
});

app.get('/api/planner/:date', (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' });
  // Get all tasks for this date: either due on this date OR time-blocked on this date
  const tasks = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE (t.due_date=? OR (t.time_block_start IS NOT NULL AND t.due_date=?)) AND t.status!='done'
    ORDER BY t.time_block_start, t.priority DESC
  `).all(date, date);
  // Unscheduled = tasks due today but without time blocks
  const scheduled = tasks.filter(t => t.time_block_start);
  const unscheduled = tasks.filter(t => !t.time_block_start);
  res.json({ scheduled, unscheduled });
});

// ─── TASK COMMENTS API ───
app.get('/api/tasks/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(db.prepare('SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at ASC').all(id));
});
app.post('/api/tasks/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  const r = db.prepare('INSERT INTO task_comments (task_id, text) VALUES (?,?)').run(id, text.trim());
  res.status(201).json(db.prepare('SELECT * FROM task_comments WHERE id=?').get(r.lastInsertRowid));
});
app.delete('/api/tasks/:id/comments/:commentId', (req, res) => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(id) || !Number.isInteger(commentId)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM task_comments WHERE id=? AND task_id=?').run(commentId, id);
  res.json({ ok: true });
});
app.put('/api/tasks/:id/comments/:commentId', (req, res) => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(id) || !Number.isInteger(commentId)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM task_comments WHERE id=? AND task_id=?').get(commentId, id);
  if (!ex) return res.status(404).json({ error: 'Comment not found' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  db.prepare('UPDATE task_comments SET text=? WHERE id=?').run(text.trim(), commentId);
  res.json(db.prepare('SELECT * FROM task_comments WHERE id=?').get(commentId));
});

// ─── GOAL MILESTONES API ───
app.get('/api/goals/:id/milestones', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(db.prepare('SELECT * FROM goal_milestones WHERE goal_id=? ORDER BY position').all(id));
});
app.post('/api/goals/:id/milestones', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const pos = getNextPosition('goal_milestones', 'goal_id', id);
  const r = db.prepare('INSERT INTO goal_milestones (goal_id, title, position) VALUES (?,?,?)').run(id, title.trim(), pos);
  res.status(201).json(db.prepare('SELECT * FROM goal_milestones WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/milestones/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, done } = req.body;
  const ex = db.prepare('SELECT * FROM goal_milestones WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const completedAt = done && !ex.done ? new Date().toISOString() : (done ? ex.completed_at : null);
  db.prepare('UPDATE goal_milestones SET title=COALESCE(?,title), done=COALESCE(?,done), completed_at=? WHERE id=?').run(
    title || null, done !== undefined ? (done ? 1 : 0) : null, completedAt, id
  );
  res.json(db.prepare('SELECT * FROM goal_milestones WHERE id=?').get(id));
});
app.delete('/api/milestones/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM goal_milestones WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── GOAL PROGRESS (enhanced) ───
app.get('/api/goals/:id/progress', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const goal = db.prepare('SELECT * FROM goals WHERE id=?').get(id);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  const tasks = db.prepare('SELECT status, completed_at FROM tasks WHERE goal_id=?').all(id);
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const milestones = db.prepare('SELECT * FROM goal_milestones WHERE goal_id=? ORDER BY position').all(id);
  // Velocity: completions per week over last 4 weeks
  const velocity = db.prepare(`
    SELECT strftime('%Y-W%W', completed_at) as week, COUNT(*) as count
    FROM tasks WHERE goal_id=? AND status='done' AND completed_at >= date('now','-28 days')
    GROUP BY week ORDER BY week
  `).all(id);
  res.json({ goal, total, done, pct: total ? Math.round(done / total * 100) : 0, milestones, velocity });
});

// Productivity Trends (weekly completion counts for last 8 weeks)
app.get('/api/stats/trends', (req, res) => {
  const weeks = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const row = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ?`).get(startStr, endStr);
    weeks.push({ week_start: startStr, week_end: endStr, completed: row.count });
  }
  res.json(weeks);
});

// ─── TIME ANALYTICS ───
app.get('/api/stats/time-analytics', (req, res) => {
  // Estimate vs actual per area
  const byArea = db.prepare(`
    SELECT la.name, la.icon, la.color,
      SUM(t.estimated_minutes) as total_estimated,
      SUM(t.actual_minutes) as total_actual,
      COUNT(CASE WHEN t.estimated_minutes > 0 THEN 1 END) as estimated_count,
      COUNT(*) as task_count
    FROM tasks t
    JOIN goals g ON t.goal_id = g.id
    JOIN life_areas la ON g.area_id = la.id
    WHERE t.status = 'done'
    GROUP BY la.id ORDER BY total_actual DESC
  `).all();
  // Completion by hour of day
  const byHour = db.prepare(`
    SELECT CAST(strftime('%H', completed_at) AS INTEGER) as hour, COUNT(*) as count
    FROM tasks WHERE status='done' AND completed_at IS NOT NULL
    GROUP BY hour ORDER BY hour
  `).all();
  // Weekly velocity (last 8 weeks)
  const weeklyVelocity = db.prepare(`
    SELECT strftime('%Y-W%W', completed_at) as week, COUNT(*) as count,
      SUM(actual_minutes) as minutes
    FROM tasks WHERE status='done' AND completed_at >= date('now', '-56 days')
    GROUP BY week ORDER BY week
  `).all();
  // Estimation accuracy
  const accuracy = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN actual_minutes <= estimated_minutes THEN 1 ELSE 0 END) as on_time,
      SUM(CASE WHEN actual_minutes > estimated_minutes THEN 1 ELSE 0 END) as over,
      AVG(CASE WHEN estimated_minutes > 0 THEN CAST(actual_minutes AS FLOAT) / estimated_minutes END) as avg_ratio
    FROM tasks WHERE status='done' AND estimated_minutes > 0 AND actual_minutes > 0
  `).get();
  res.json({ byArea, byHour, weeklyVelocity, accuracy });
});

// ─── AUTOMATION RULES ENGINE ───
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

app.get('/api/rules', (req, res) => {
  res.json(db.prepare('SELECT * FROM automation_rules ORDER BY created_at DESC').all());
});
app.post('/api/rules', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!name || !trigger_type || !action_type) return res.status(400).json({ error: 'name, trigger_type, action_type required' });
  const r = db.prepare('INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config) VALUES (?,?,?,?,?)').run(
    name.trim(), trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {})
  );
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/rules/:id', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM automation_rules WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, trigger_type, trigger_config, action_type, action_config, enabled } = req.body;
  db.prepare('UPDATE automation_rules SET name=COALESCE(?,name), trigger_type=COALESCE(?,trigger_type), trigger_config=COALESCE(?,trigger_config), action_type=COALESCE(?,action_type), action_config=COALESCE(?,action_config), enabled=COALESCE(?,enabled) WHERE id=?').run(
    name || null, trigger_type || null, trigger_config ? JSON.stringify(trigger_config) : null, action_type || null, action_config ? JSON.stringify(action_config) : null, enabled !== undefined ? (enabled ? 1 : 0) : null, id
  );
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(id));
});
app.delete('/api/rules/:id', (req, res) => {
  db.prepare('DELETE FROM automation_rules WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Execute rules on task status change (called internally)
function executeRules(event, task) {
  const rules = db.prepare('SELECT * FROM automation_rules WHERE enabled=1 AND trigger_type=?').all(event);
  rules.forEach(rule => {
    let tc, ac;
    try { tc = JSON.parse(rule.trigger_config || '{}'); } catch { tc = {}; }
    try { ac = JSON.parse(rule.action_config || '{}'); } catch { ac = {}; }
    // Check trigger conditions
    if (tc.area_id && task.area_id !== tc.area_id) return;
    if (tc.goal_id && task.goal_id !== tc.goal_id) return;
    if (tc.priority !== undefined && task.priority !== tc.priority) return;
    // Execute action
    if (rule.action_type === 'add_to_myday') {
      db.prepare('UPDATE tasks SET my_day=1 WHERE id=?').run(task.id);
    } else if (rule.action_type === 'set_priority' && ac.priority !== undefined) {
      db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(ac.priority, task.id);
    } else if (rule.action_type === 'add_tag' && ac.tag_id) {
      db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(task.id, ac.tag_id);
    } else if (rule.action_type === 'create_followup' && ac.title) {
      const fpos = getNextPosition('tasks', 'goal_id', task.goal_id);
      db.prepare('INSERT INTO tasks (goal_id, title, priority, position) VALUES (?,?,?,?)').run(
        task.goal_id, ac.title, ac.priority || 0, fpos
      );
    }
  });
}

// ─── INBOX API ───
app.get('/api/inbox', (req, res) => {
  res.json(db.prepare('SELECT * FROM inbox ORDER BY created_at DESC').all());
});
app.post('/api/inbox', (req, res) => {
  const { title, note, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO inbox (title, note, priority) VALUES (?,?,?)').run(title.trim(), note || '', priority || 0);
  res.status(201).json(db.prepare('SELECT * FROM inbox WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/inbox/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM inbox WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, note, priority } = req.body;
  db.prepare('UPDATE inbox SET title=COALESCE(?,title), note=COALESCE(?,note), priority=COALESCE(?,priority) WHERE id=?').run(
    title || null, note !== undefined ? note : null, priority !== undefined ? priority : null, id
  );
  res.json(db.prepare('SELECT * FROM inbox WHERE id=?').get(id));
});
app.delete('/api/inbox/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM inbox WHERE id=?').run(id);
  res.json({ ok: true });
});
// Triage: move inbox item to a goal as a task
app.post('/api/inbox/:id/triage', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM inbox WHERE id=?').get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { goal_id, due_date, priority } = req.body;
  if (!goal_id || !Number.isInteger(Number(goal_id))) return res.status(400).json({ error: 'goal_id required' });
  const gid = Number(goal_id);
  const pos = getNextPosition('tasks', 'goal_id', gid);
  const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,position) VALUES (?,?,?,?,?,?)').run(
    gid, item.title, item.note, priority !== undefined ? priority : item.priority, due_date || null, pos
  );
  db.prepare('DELETE FROM inbox WHERE id=?').run(id);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid));
});

// ─── TIME TRACKING API ───
app.post('/api/tasks/:id/time', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { minutes } = req.body;
  if (!minutes || minutes <= 0) return res.status(400).json({ error: 'minutes required (positive number)' });
  const newActual = (ex.actual_minutes || 0) + minutes;
  db.prepare('UPDATE tasks SET actual_minutes=? WHERE id=?').run(newActual, id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
});

// ─── NOTES API ───
app.get('/api/notes', (req, res) => {
  const { goal_id } = req.query;
  if (goal_id) {
    res.json(db.prepare('SELECT * FROM notes WHERE goal_id=? ORDER BY updated_at DESC').all(Number(goal_id)));
  } else {
    res.json(db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all());
  }
});
app.get('/api/notes/:id', (req, res) => {
  const n = db.prepare('SELECT * FROM notes WHERE id=?').get(Number(req.params.id));
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json(n);
});
app.post('/api/notes', (req, res) => {
  const { title, content, goal_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO notes (title, content, goal_id) VALUES (?,?,?)').run(title.trim(), content || '', goal_id || null);
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM notes WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, content, goal_id } = req.body;
  db.prepare('UPDATE notes SET title=COALESCE(?,title), content=COALESCE(?,content), goal_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
    title || null, content !== undefined ? content : null, goal_id !== undefined ? goal_id : ex.goal_id, id
  );
  res.json(db.prepare('SELECT * FROM notes WHERE id=?').get(id));
});
app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─── WEEKLY REVIEW API ───
app.get('/api/reviews', (req, res) => {
  res.json(db.prepare('SELECT * FROM weekly_reviews ORDER BY week_start DESC').all());
});
app.get('/api/reviews/current', (req, res) => {
  // Get data for current week review
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const completed = db.prepare(`SELECT t.*, g.title as goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id=g.id 
    WHERE t.status='done' AND t.completed_at >= ? AND t.completed_at < ? ORDER BY t.completed_at DESC`).all(weekStart, weekEndStr);
  const created = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE created_at >= ? AND created_at < ?`).get(weekStart, weekEndStr);
  const overdue = db.prepare(`SELECT t.*, g.title as goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id=g.id 
    WHERE t.status!='done' AND t.due_date < ? ORDER BY t.due_date`).all(weekStart);
  const streakRow = db.prepare(`SELECT COUNT(DISTINCT date(completed_at)) as days FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ?`).get(weekStart, weekEndStr);
  // Check for existing review
  const existing = db.prepare('SELECT * FROM weekly_reviews WHERE week_start=?').get(weekStart);
  res.json({
    weekStart, weekEnd: weekEndStr,
    completedTasks: completed,
    tasksCompletedCount: completed.length,
    tasksCreatedCount: created.count,
    overdueTasks: overdue,
    activeDays: streakRow.days,
    existingReview: existing || null
  });
});
app.post('/api/reviews', (req, res) => {
  const { week_start, top_accomplishments, reflection, next_week_priorities } = req.body;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  // Compute stats
  const weekEnd = new Date(week_start);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const completed = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ?`).get(week_start, weekEndStr);
  const created = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE created_at >= ? AND created_at < ?`).get(week_start, weekEndStr);
  // Upsert
  const existing = db.prepare('SELECT id FROM weekly_reviews WHERE week_start=?').get(week_start);
  if (existing) {
    db.prepare('UPDATE weekly_reviews SET tasks_completed=?, tasks_created=?, top_accomplishments=?, reflection=?, next_week_priorities=? WHERE id=?').run(
      completed.c, created.c, JSON.stringify(top_accomplishments || []), reflection || '', JSON.stringify(next_week_priorities || []), existing.id
    );
    res.json(db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(existing.id));
  } else {
    const r = db.prepare('INSERT INTO weekly_reviews (week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities) VALUES (?,?,?,?,?,?)').run(
      week_start, completed.c, created.c, JSON.stringify(top_accomplishments || []), reflection || '', JSON.stringify(next_week_priorities || [])
    );
    res.status(201).json(db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(r.lastInsertRowid));
  }
});
app.delete('/api/reviews/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Review not found' });
  db.prepare('DELETE FROM weekly_reviews WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── SMART FILTERS: Extended execute + counts + smart lists ───
app.get('/api/filters/counts', (req, res) => {
  const filters = db.prepare('SELECT * FROM saved_filters ORDER BY position').all();
  const counts = filters.map(f => {
    let p;
    try { p = JSON.parse(f.filters || '{}'); } catch { p = {}; }
    let w = [], pa = [];
    if (p.area_id) { w.push('a.id=?'); pa.push(Number(p.area_id)); }
    if (p.goal_id) { w.push('g.id=?'); pa.push(Number(p.goal_id)); }
    if (p.priority) { w.push('t.priority=?'); pa.push(Number(p.priority)); }
    if (p.status) { w.push('t.status=?'); pa.push(p.status); }
    if (p.tag_id) { w.push('EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=t.id AND tt.tag_id=?)'); pa.push(Number(p.tag_id)); }
    if (p.due === 'today') w.push("t.due_date=date('now')");
    else if (p.due === 'week') w.push("t.due_date BETWEEN date('now') AND date('now','+7 days')");
    else if (p.due === 'overdue') w.push("t.due_date < date('now') AND t.status!='done'");
    else if (p.due === 'none') w.push('t.due_date IS NULL');
    if (p.my_day) w.push('t.my_day=1');
    if (p.stale_days) { w.push("t.status!='done'"); w.push("t.created_at <= datetime('now','-' || ? || ' days')"); pa.push(Number(p.stale_days)); w.push("(t.completed_at IS NULL)"); }
    if (p.max_estimated) { w.push('t.estimated_minutes IS NOT NULL'); w.push('t.estimated_minutes<=?'); pa.push(Number(p.max_estimated)); w.push("t.status!='done'"); }
    if (p.is_blocked) { w.push("EXISTS (SELECT 1 FROM task_deps td JOIN tasks bt ON td.blocked_by_id=bt.id WHERE td.task_id=t.id AND bt.status!='done')"); }
    const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
    const c = db.prepare(`SELECT COUNT(DISTINCT t.id) as c FROM tasks t LEFT JOIN goals g ON t.goal_id=g.id LEFT JOIN life_areas a ON g.area_id=a.id ${where}`).get(...pa);
    return { id: f.id, count: c.c };
  });
  res.json(counts);
});

// Smart lists (built-in)
app.get('/api/filters/smart/:type', (req, res) => {
  const type = req.params.type;
  let sql;
  if (type === 'stale') {
    sql = `SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.status!='done' AND t.created_at <= datetime('now','-7 days') AND t.completed_at IS NULL
      ORDER BY t.created_at ASC LIMIT 100`;
  } else if (type === 'quickwins') {
    sql = `SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.status!='done' AND t.estimated_minutes IS NOT NULL AND t.estimated_minutes<=15
      AND NOT EXISTS (SELECT 1 FROM task_deps td JOIN tasks bt ON td.blocked_by_id=bt.id WHERE td.task_id=t.id AND bt.status!='done')
      ORDER BY t.estimated_minutes ASC, t.priority DESC LIMIT 100`;
  } else if (type === 'blocked') {
    sql = `SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.status!='done'
      AND EXISTS (SELECT 1 FROM task_deps td JOIN tasks bt ON td.blocked_by_id=bt.id WHERE td.task_id=t.id AND bt.status!='done')
      ORDER BY t.priority DESC LIMIT 100`;
  } else {
    return res.status(400).json({ error: 'Unknown smart filter type' });
  }
  res.json(enrichTasks(db.prepare(sql).all()));
});

// Batch set my_day
app.post('/api/tasks/bulk-myday', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const stmt = db.prepare('UPDATE tasks SET my_day=1 WHERE id=?');
  ids.forEach(id => stmt.run(Number(id)));
  res.json({ updated: ids.length });
});

// Batch reschedule (clear my_day or set new due date)
app.post('/api/tasks/reschedule', (req, res) => {
  const { ids, due_date, clear_myday } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  if (clear_myday) {
    const stmt = db.prepare('UPDATE tasks SET my_day=0 WHERE id=?');
    ids.forEach(id => stmt.run(Number(id)));
  }
  if (due_date !== undefined) {
    const stmt = db.prepare('UPDATE tasks SET due_date=? WHERE id=?');
    ids.forEach(id => stmt.run(due_date, Number(id)));
  }
  res.json({ updated: ids.length });
});

// ─── RECURRING TASKS: Skip & Pause ───
app.post('/api/tasks/:id/skip', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  if (!ex.recurring) return res.status(400).json({ error: 'Not a recurring task' });
  // Mark as skipped (done but not actually completed)
  db.prepare("UPDATE tasks SET status='done', completed_at=? WHERE id=?").run(new Date().toISOString(), id);
  // Spawn next occurrence
  const nd = nextDueDate(ex.due_date, ex.recurring);
  const spos = getNextPosition('tasks', 'goal_id', ex.goal_id);
  const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,due_time,recurring,assigned_to,my_day,position) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    ex.goal_id, ex.title, ex.note, ex.priority, nd, ex.due_time, ex.recurring, ex.assigned_to, 0, spos
  );
  const oldTags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(id);
  oldTags.forEach(tt => db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)').run(r.lastInsertRowid, tt.tag_id));
  res.json({ skipped: id, next: enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid)) });
});

// Move task to different goal
app.post('/api/tasks/:id/move', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { goal_id } = req.body;
  if (!goal_id) return res.status(400).json({ error: 'goal_id required' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const goal = db.prepare('SELECT * FROM goals WHERE id=?').get(Number(goal_id));
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  db.prepare('UPDATE tasks SET goal_id=? WHERE id=?').run(Number(goal_id), id);
  res.json(enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id)));
});

// ─── Global Unified Search (FTS5) ───
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [], query: '' });
  const sanitized = q.replace(/[^\w\s'-]/g, '').trim();
  if (!sanitized) return res.json({ results: [], query: q });
  const ftsQuery = sanitized.split(/\s+/).map(w => w + '*').join(' ');
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  try {
    const rows = db.prepare(`
      SELECT type, source_id, title, snippet(search_index, 3, '<mark>', '</mark>', '\u2026', 24) as snippet, context, rank
      FROM search_index WHERE search_index MATCH ?
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, limit);
    res.json({ results: rows, query: q });
  } catch {
    const term = '%' + sanitized + '%';
    const rows = db.prepare(`
      SELECT type, source_id, title, body as snippet, context, 0 as rank
      FROM search_index WHERE title LIKE ? OR body LIKE ?
      ORDER BY type LIMIT ?
    `).all(term, term, limit);
    res.json({ results: rows, query: q });
  }
});

// ─── iCal Export ───
app.get('/api/export/ical', (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, g.title as goal_title, a.name as area_name
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date IS NOT NULL AND t.status != 'done'
    ORDER BY t.due_date
  `).all();
  const now = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//LifeFlow//EN\r\nX-WR-CALNAME:LifeFlow Tasks\r\n';
  for (const t of tasks) {
    const d = t.due_date.replace(/-/g, '');
    const uid = `task-${t.id}@lifeflow`;
    const summary = t.title.replace(/[\\;,]/g, c => '\\' + c);
    const desc = `${t.area_name} \u2192 ${t.goal_title}`.replace(/[\\;,]/g, c => '\\' + c);
    ical += `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${now}\r\nDTSTART;VALUE=DATE:${d}\r\n`;
    ical += `SUMMARY:${summary}\r\nDESCRIPTION:${desc}\r\n`;
    if (t.priority >= 2) ical += 'PRIORITY:1\r\n';
    else if (t.priority === 1) ical += 'PRIORITY:5\r\n';
    if (t.recurring) {
      const rmap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
      if (rmap[t.recurring]) ical += `RRULE:FREQ=${rmap[t.recurring]}\r\n`;
    }
    ical += 'END:VEVENT\r\n';
  }
  ical += 'END:VCALENDAR\r\n';
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="lifeflow.ics"');
  res.send(ical);
});

// ─── CUSTOM LISTS API ───
const GROCERY_CATEGORIES = ['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other'];
const LIST_TEMPLATES = [
  {id:'weekly-groceries',name:'Weekly Groceries',type:'grocery',icon:'🛒',items:['Milk','Eggs','Bread','Bananas','Chicken','Rice','Onions','Tomatoes','Cheese','Yogurt']},
  {id:'travel-packing',name:'Travel Packing',type:'checklist',icon:'🧳',items:['Passport','Phone charger','Toiletries','Underwear','Socks','Medications','Snacks','Water bottle','Headphones','Travel pillow']},
  {id:'moving-checklist',name:'Moving Checklist',type:'checklist',icon:'📦',items:['Change address','Forward mail','Transfer utilities','Pack room by room','Label boxes','Hire movers','Clean old place','Get new keys','Update subscriptions','Notify employer']},
  {id:'party-planning',name:'Party Planning',type:'checklist',icon:'🎉',items:['Set date & time','Create guest list','Send invitations','Plan menu','Buy decorations','Arrange music','Order cake','Set up space','Prepare games','Buy drinks']}
];

// Rate limiter for shared endpoints
const shareRateMap = new Map();
function checkShareRate(token) {
  const now = Date.now();
  const entry = shareRateMap.get(token) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  shareRateMap.set(token, entry);
  return entry.count <= 60;
}
setInterval(() => { for (const [k, v] of shareRateMap) { if (Date.now() > v.reset + 60000) shareRateMap.delete(k); } }, 120000);

app.get('/api/lists', (req, res) => {
  const lists = db.prepare(`SELECT l.*, COUNT(li.id) as item_count, SUM(CASE WHEN li.checked=1 THEN 1 ELSE 0 END) as checked_count
    FROM lists l LEFT JOIN list_items li ON li.list_id=l.id GROUP BY l.id ORDER BY l.position, l.created_at DESC`).all();
  res.json(lists);
});

app.get('/api/lists/:id/sublists', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  const sublists = db.prepare(`SELECT l.*, COUNT(li.id) as item_count, SUM(CASE WHEN li.checked=1 THEN 1 ELSE 0 END) as checked_count
    FROM lists l LEFT JOIN list_items li ON li.list_id=l.id WHERE l.parent_id=? GROUP BY l.id ORDER BY l.position, l.created_at DESC`).all(id);
  res.json(sublists);
});

app.post('/api/lists', (req, res) => {
  const { name, type, icon, color, area_id, parent_id } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (name.length > 100) return res.status(400).json({ error: 'name must be 100 chars or less' });
  const validTypes = ['checklist', 'grocery', 'notes'];
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: 'type must be checklist, grocery, or notes' });
  const listCount = db.prepare('SELECT COUNT(*) as c FROM lists').get().c;
  if (listCount >= 100) return res.status(400).json({ error: 'Maximum 100 lists reached' });
  if (parent_id) {
    const pid = Number(parent_id);
    if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
    const parent = db.prepare('SELECT * FROM lists WHERE id=?').get(pid);
    if (!parent) return res.status(400).json({ error: 'Parent list not found' });
    // Prevent nesting deeper than 1 level
    if (parent.parent_id) return res.status(400).json({ error: 'Cannot nest more than one level deep' });
  }
  const pos = getNextPosition('lists');
  const r = db.prepare('INSERT INTO lists (name,type,icon,color,area_id,parent_id,position) VALUES (?,?,?,?,?,?,?)').run(
    name.trim(), type || 'checklist', icon || '📋', color || '#2563EB', area_id ? Number(area_id) : null, parent_id ? Number(parent_id) : null, pos
  );
  res.status(201).json(db.prepare('SELECT * FROM lists WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/lists/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  const { name, icon, color, area_id, position } = req.body;
  if (name !== undefined && (!name || name.length > 100)) return res.status(400).json({ error: 'Invalid name' });
  const { parent_id: newParentId } = req.body;
  if (newParentId !== undefined && newParentId !== null) {
    const pid = Number(newParentId);
    if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
    if (pid === id) return res.status(400).json({ error: 'Cannot be own parent' });
    const parent = db.prepare('SELECT * FROM lists WHERE id=?').get(pid);
    if (!parent) return res.status(400).json({ error: 'Parent list not found' });
    if (parent.parent_id) return res.status(400).json({ error: 'Cannot nest more than one level deep' });
  }
  db.prepare('UPDATE lists SET name=?,icon=?,color=?,area_id=?,parent_id=?,position=? WHERE id=?').run(
    name || ex.name, icon !== undefined ? icon : ex.icon, color || ex.color,
    area_id !== undefined ? (area_id ? Number(area_id) : null) : ex.area_id,
    newParentId !== undefined ? (newParentId ? Number(newParentId) : null) : ex.parent_id,
    position !== undefined ? position : ex.position, id
  );
  res.json(db.prepare('SELECT * FROM lists WHERE id=?').get(id));
});

app.delete('/api/lists/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  // Also delete child lists
  db.prepare('DELETE FROM lists WHERE parent_id=?').run(id);
  db.prepare('DELETE FROM lists WHERE id=?').run(id);
  rebuildSearchIndex();
  res.json({ deleted: true });
});

app.get('/api/lists/categories', (req, res) => {
  res.json(GROCERY_CATEGORIES);
});

app.get('/api/lists/templates', (req, res) => {
  res.json(LIST_TEMPLATES);
});

app.post('/api/lists/from-template', (req, res) => {
  const { template_id } = req.body;
  const tpl = LIST_TEMPLATES.find(t => t.id === template_id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  const listCount = db.prepare('SELECT COUNT(*) as c FROM lists').get().c;
  if (listCount >= 100) return res.status(400).json({ error: 'Maximum 100 lists reached' });
  const pos = getNextPosition('lists');
  const r = db.prepare('INSERT INTO lists (name,type,icon,position) VALUES (?,?,?,?)').run(tpl.name, tpl.type, tpl.icon, pos);
  const lid = r.lastInsertRowid;
  const insItem = db.prepare('INSERT INTO list_items (list_id,title,position) VALUES (?,?,?)');
  tpl.items.forEach((item, i) => insItem.run(lid, item, i));
  rebuildSearchIndex();
  const list = db.prepare('SELECT * FROM lists WHERE id=?').get(lid);
  const items = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(lid);
  res.status(201).json({ ...list, items });
});

app.get('/api/lists/:id/items', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  const items = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(id);
  res.json(items);
});

app.post('/api/lists/:id/items', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  const itemCount = db.prepare('SELECT COUNT(*) as c FROM list_items WHERE list_id=?').get(id).c;
  const items = Array.isArray(req.body) ? req.body : [req.body];
  if (itemCount + items.length > 500) return res.status(400).json({ error: 'Maximum 500 items per list' });
  // Validate all items first
  for (const item of items) {
    if (!item.title || typeof item.title !== 'string' || !item.title.trim()) return res.status(400).json({ error: 'Item title is required' });
    if (item.title.length > 200) return res.status(400).json({ error: 'Item title must be 200 chars or less' });
  }
  const batchTx = db.transaction(() => {
    let pos = getNextPosition('list_items', 'list_id', id);
    const ins = db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,position) VALUES (?,?,?,?,?,?,?)');
    const created = [];
    for (const item of items) {
      const r = ins.run(id, item.title.trim(), item.checked ? 1 : 0, item.category || null, item.quantity || null, item.note || '', pos++);
      created.push(db.prepare('SELECT * FROM list_items WHERE id=?').get(r.lastInsertRowid));
    }
    return created;
  });
  const created = batchTx();
  rebuildSearchIndex();
  res.status(201).json(created.length === 1 ? created[0] : created);
});

app.put('/api/lists/:id/items/:itemId', (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(id) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM list_items WHERE id=? AND list_id=?').get(itemId, id);
  if (!ex) return res.status(404).json({ error: 'Item not found' });
  const { title, checked, category, quantity, note, position } = req.body;
  if (title !== undefined && (!title || title.length > 200)) return res.status(400).json({ error: 'Invalid title' });
  db.prepare('UPDATE list_items SET title=?,checked=?,category=?,quantity=?,note=?,position=? WHERE id=?').run(
    title || ex.title, checked !== undefined ? (checked ? 1 : 0) : ex.checked,
    category !== undefined ? category : ex.category, quantity !== undefined ? quantity : ex.quantity,
    note !== undefined ? note : ex.note, position !== undefined ? position : ex.position, itemId
  );
  rebuildSearchIndex();
  res.json(db.prepare('SELECT * FROM list_items WHERE id=?').get(itemId));
});

app.delete('/api/lists/:id/items/:itemId', (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(id) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM list_items WHERE id=? AND list_id=?').get(itemId, id);
  if (!ex) return res.status(404).json({ error: 'Item not found' });
  db.prepare('DELETE FROM list_items WHERE id=?').run(itemId);
  rebuildSearchIndex();
  res.json({ deleted: true });
});

app.patch('/api/lists/:id/items/reorder', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Array of {id, position} required' });
  const stmt = db.prepare('UPDATE list_items SET position=? WHERE id=? AND list_id=?');
  items.forEach(i => stmt.run(i.position, i.id, id));
  res.json({ reordered: items.length });
});

app.post('/api/lists/:id/clear-checked', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  const result = db.prepare('DELETE FROM list_items WHERE list_id=? AND checked=1').run(id);
  rebuildSearchIndex();
  res.json({ cleared: result.changes });
});

// ─── SHARING ───
app.post('/api/lists/:id/share', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  if (ex.share_token) return res.json({ token: ex.share_token, url: '/share/' + ex.share_token });
  const token = crypto.randomBytes(12).toString('hex');
  db.prepare('UPDATE lists SET share_token=? WHERE id=?').run(token, id);
  res.json({ token, url: '/share/' + token });
});

app.delete('/api/lists/:id/share', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM lists WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'List not found' });
  db.prepare('UPDATE lists SET share_token=NULL WHERE id=?').run(id);
  res.json({ unshared: true });
});

// Public shared endpoints
app.get('/api/shared/:token', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ error: 'Invalid token format' });
  if (!checkShareRate(token)) return res.status(429).json({ error: 'Too many requests' });
  const list = db.prepare('SELECT name, type, icon, color, share_token, created_at FROM lists WHERE share_token=?').get(token);
  if (!list) return res.status(404).json({ error: 'Shared list not found' });
  const listId = db.prepare('SELECT id FROM lists WHERE share_token=?').get(token).id;
  const items = db.prepare('SELECT id, title, checked, category, quantity, note, position FROM list_items WHERE list_id=? ORDER BY position').all(listId);
  res.json({ ...list, items });
});

app.put('/api/shared/:token/items/:itemId', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ error: 'Invalid token format' });
  if (!checkShareRate(token)) return res.status(429).json({ error: 'Too many requests' });
  const list = db.prepare('SELECT id FROM lists WHERE share_token=?').get(token);
  if (!list) return res.status(404).json({ error: 'Shared list not found' });
  const itemId = Number(req.params.itemId);
  const ex = db.prepare('SELECT * FROM list_items WHERE id=? AND list_id=?').get(itemId, list.id);
  if (!ex) return res.status(404).json({ error: 'Item not found' });
  const { checked } = req.body;
  db.prepare('UPDATE list_items SET checked=? WHERE id=?').run(checked ? 1 : 0, itemId);
  res.json(db.prepare('SELECT id, title, checked, category, quantity, note, position FROM list_items WHERE id=?').get(itemId));
});

app.post('/api/shared/:token/items', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ error: 'Invalid token format' });
  if (!checkShareRate(token)) return res.status(429).json({ error: 'Too many requests' });
  const list = db.prepare('SELECT id FROM lists WHERE share_token=?').get(token);
  if (!list) return res.status(404).json({ error: 'Shared list not found' });
  const { title, category, quantity } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (title.length > 200) return res.status(400).json({ error: 'title must be 200 chars or less' });
  const itemCount = db.prepare('SELECT COUNT(*) as c FROM list_items WHERE list_id=?').get(list.id).c;
  if (itemCount >= 500) return res.status(400).json({ error: 'Maximum 500 items per list' });
  const ipos = getNextPosition('list_items', 'list_id', list.id);
  const r = db.prepare('INSERT INTO list_items (list_id,title,category,quantity,position) VALUES (?,?,?,?,?)').run(
    list.id, title.trim(), category || null, quantity || null, ipos
  );
  rebuildSearchIndex();
  res.status(201).json(db.prepare('SELECT id, title, checked, category, quantity, note, position FROM list_items WHERE id=?').get(r.lastInsertRowid));
});

// Serve share page
app.get('/share/:token', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{24}$/.test(token)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, '..', 'public', 'share.html'));
});

// ─── Health check ───
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Export for testing; start server only when run directly
if (require.main === module) {
  app.listen(PORT, () => console.log(`\n  LifeFlow running at http://localhost:${PORT}\n`));
}

module.exports = { app, db };
