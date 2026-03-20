const express = require('express');
const path = require('path');
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

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper: get tags for a task
function getTaskTags(taskId) {
  return db.prepare('SELECT t.* FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id=?').all(taskId);
}
function getSubtasks(taskId) {
  return db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(taskId);
}
function enrichTask(t) {
  t.tags = getTaskTags(t.id);
  t.subtasks = getSubtasks(t.id);
  t.subtask_done = t.subtasks.filter(s => s.done).length;
  t.subtask_total = t.subtasks.length;
  return t;
}
function enrichTasks(tasks) { return tasks.map(enrichTask); }

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
  const mp = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM subtasks WHERE task_id=?').get(taskId);
  const r = db.prepare('INSERT INTO subtasks (task_id,title,position) VALUES (?,?,?)').run(taskId, title.trim(), mp.p);
  res.status(201).json(db.prepare('SELECT * FROM subtasks WHERE id=?').get(r.lastInsertRowid));
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
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status!='done') as pending_tasks
    FROM life_areas a ORDER BY a.position
  `).all());
});
app.post('/api/areas', (req, res) => {
  const { name, icon, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const mp = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM life_areas').get();
  const r = db.prepare('INSERT INTO life_areas (name,icon,color,position) VALUES (?,?,?,?)').run(name.trim(), icon||'📋', color||'#2563EB', mp.p);
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
  const mp = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM goals WHERE area_id=?').get(areaId);
  const r = db.prepare('INSERT INTO goals (area_id,title,description,color,due_date,position) VALUES (?,?,?,?,?,?)').run(areaId,title.trim(),description||'',color||'#6C63FF',due_date||null,mp.p);
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
  const { title, note, priority, due_date, recurring, assigned_to, my_day, tagIds } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const mp = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM tasks WHERE goal_id=?').get(goalId);
  const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,recurring,assigned_to,my_day,position) VALUES (?,?,?,?,?,?,?,?,?)').run(
    goalId,title.trim(),note||'',priority||0,due_date||null,recurring||null,assigned_to||'',my_day?1:0,mp.p
  );
  const taskId = r.lastInsertRowid;
  if (Array.isArray(tagIds)) {
    const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
    tagIds.forEach(tid => { if (Number.isInteger(tid)) ins.run(taskId, tid); });
  }
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
  if (!q || !q.trim()) return res.json([]);
  const term = '%' + q.trim() + '%';
  res.json(enrichTasks(db.prepare(`
    SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    LEFT JOIN subtasks s ON s.task_id=t.id
    WHERE t.title LIKE ? OR t.note LIKE ? OR s.title LIKE ?
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, t.priority DESC
    LIMIT 50
  `).all(term, term, term)));
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
  else return null;
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

app.put('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, note, status, priority, due_date, recurring, assigned_to, my_day, position, goal_id } = req.body;
  const completedAt = status==='done' && ex.status!=='done' ? new Date().toISOString() : (status && status!=='done' ? null : ex.completed_at);
  db.prepare(`UPDATE tasks SET title=COALESCE(?,title),note=COALESCE(?,note),status=COALESCE(?,status),
    priority=COALESCE(?,priority),due_date=?,recurring=?,assigned_to=COALESCE(?,assigned_to),
    my_day=COALESCE(?,my_day),position=COALESCE(?,position),goal_id=COALESCE(?,goal_id),completed_at=? WHERE id=?`).run(
    title||null, note!==undefined?note:null, status||null, priority!==undefined?priority:null,
    due_date!==undefined?due_date:ex.due_date, recurring!==undefined?recurring:ex.recurring,
    assigned_to!==undefined?assigned_to:null, my_day!==undefined?(my_day?1:0):null,
    position!==undefined?position:null, goal_id||null, completedAt, id
  );
  // Recurring: spawn next task when completed
  if (status === 'done' && ex.status !== 'done' && ex.recurring) {
    const nd = nextDueDate(ex.due_date, ex.recurring);
    const mp = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM tasks WHERE goal_id=?').get(ex.goal_id);
    const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,recurring,assigned_to,my_day,position) VALUES (?,?,?,?,?,?,?,?,?)').run(
      ex.goal_id, ex.title, ex.note, ex.priority, nd, ex.recurring, ex.assigned_to, 0, mp.p
    );
    // Copy tags to new task
    const oldTags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(id);
    const insTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
    oldTags.forEach(tt => insTag.run(r.lastInsertRowid, tt.tag_id));
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
  const { areas, goals, tasks, tags } = req.body;
  if (!areas || !goals || !tasks) return res.status(400).json({ error: 'Invalid import data: areas, goals, and tasks required' });
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
    res.status(500).json({ error: 'Import failed: ' + e.message });
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

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Export for testing; start server only when run directly
if (require.main === module) {
  app.listen(PORT, () => console.log(`\n  LifeFlow running at http://localhost:${PORT}\n`));
}

module.exports = { app, db };
