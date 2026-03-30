const { Router } = require('express');
const { isValidColor } = require('../middleware/validate');
module.exports = function(deps) {
  const { db, enrichTask, enrichTasks, getNextPosition } = deps;
  const router = Router();

// ─── Settings Constants (local to this module) ───
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
  statusLabels: '{"todo":"To Do","doing":"In Progress","done":"Done"}',
  priorityLabels: '{"0":"None","1":"Normal","2":"High","3":"Critical"}',
  priorityColors: '{"0":"#64748B","1":"#3B82F6","2":"#F59E0B","3":"#EF4444"}',
  smartFilterStale: '7',    // days
  smartFilterQuickWin: '15', // minutes
  groceryCategories: '',    // empty = use defaults
  onboardingComplete: 'false',
  userPersona: '',
  keyboardShortcuts: '',    // JSON map of custom key bindings
};

const SETTINGS_KEYS = new Set(Object.keys(SETTINGS_DEFAULTS));

// ─── Reminders (upcoming + overdue summary) ───
router.get('/api/reminders', (req, res) => {
  const overdue = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date < date('now') AND t.status != 'done' AND t.user_id=?
    ORDER BY t.due_date, t.priority DESC
  `).all(req.userId));
  const today = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date = date('now') AND t.status != 'done' AND t.user_id=?
    ORDER BY t.priority DESC
  `).all(req.userId));
  const upcoming = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date > date('now') AND t.due_date <= date('now', '+3 days') AND t.status != 'done' AND t.user_id=?
    ORDER BY t.due_date, t.priority DESC
  `).all(req.userId));
  res.json({ overdue, today, upcoming, total: overdue.length + today.length + upcoming.length });
});

// ─── Task Templates ───
router.get('/api/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM task_templates WHERE user_id=? ORDER BY created_at DESC').all(req.userId);
  res.json(rows.map(r => { try { return { ...r, tasks: JSON.parse(r.tasks) }; } catch { return { ...r, tasks: [] }; } }));
});

router.post('/api/templates', (req, res) => {
  const { name, description, icon, tasks } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'Tasks array required' });
  const safeTasks = tasks.map(t => ({ title: String(t.title || '').slice(0, 500), priority: [0,1,2,3].includes(t.priority) ? t.priority : 0, subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).slice(0, 500)) : [] }));
  const r = db.prepare('INSERT INTO task_templates (name, description, icon, tasks, user_id) VALUES (?, ?, ?, ?, ?)').run(name.trim().slice(0, 200), (description || '').slice(0, 500), (icon || '📋').slice(0, 10), JSON.stringify(safeTasks), req.userId);
  res.json({ id: r.lastInsertRowid, name: name.trim(), description, icon: icon || '📋', tasks: safeTasks });
});

router.put('/api/templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM task_templates WHERE id=? AND user_id=?').get(id, req.userId);
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

router.delete('/api/templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const result = db.prepare('DELETE FROM task_templates WHERE id=? AND user_id=?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.post('/api/templates/:id/apply', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { goalId } = req.body;
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'goalId required' });
  const goalOwned = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(goalId, req.userId);
  if (!goalOwned) return res.status(403).json({ error: 'Goal not found or not owned by you' });
  const tmpl = db.prepare('SELECT * FROM task_templates WHERE id=? AND user_id=?').get(id, req.userId);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  let tasks;
  try { tasks = JSON.parse(tmpl.tasks); } catch { return res.status(500).json({ error: 'Corrupted template data' }); }
  const created = [];
  const insTask = db.prepare('INSERT INTO tasks (goal_id, title, priority, status, user_id) VALUES (?, ?, ?, ?, ?)');
  const insSub = db.prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?)');
  const txn = db.transaction(() => {
    for (const t of tasks) {
      const r = insTask.run(goalId, t.title, t.priority || 0, 'todo', req.userId);
      if (t.subtasks) t.subtasks.forEach((s, i) => insSub.run(r.lastInsertRowid, s, i));
      created.push({ id: r.lastInsertRowid, title: t.title });
    }
  });
  txn();
  res.json({ ok: true, created });
});

// ─── Save Goal as Template ───
router.post('/api/goals/:id/save-as-template', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const goal = db.prepare('SELECT * FROM goals WHERE id=? AND user_id=?').get(id, req.userId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? ORDER BY position').all(id);
  const safeTasks = tasks.map(t => {
    const subs = db.prepare('SELECT title FROM subtasks WHERE task_id=? ORDER BY position').all(t.id);
    return { title: t.title, priority: t.priority || 0, subtasks: subs.map(s => s.title) };
  });
  const name = (req.body.name || goal.title).trim().slice(0, 200);
  const r = db.prepare("INSERT INTO task_templates (name, description, icon, tasks, user_created, source_type, user_id) VALUES (?,?,?,?,1,'goal',?)").run(
    name, goal.description || '', goal.color ? '🎯' : '📋', JSON.stringify(safeTasks), req.userId
  );
  res.json({ id: r.lastInsertRowid, name, tasks: safeTasks });
});

// ─── Save List as Template ───
router.post('/api/lists/:id/save-as-template', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const list = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const items = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(id);
  const safeTasks = items.map(it => ({ title: it.title, priority: 0, subtasks: [] }));
  const name = (req.body.name || list.name).trim().slice(0, 200);
  const r = db.prepare("INSERT INTO task_templates (name, description, icon, tasks, user_created, source_type, user_id) VALUES (?,?,?,?,1,'list',?)").run(
    name, '', list.icon || '📋', JSON.stringify(safeTasks), req.userId
  );
  res.json({ id: r.lastInsertRowid, name, tasks: safeTasks });
});

// ─── Badges ───
router.get('/api/badges', (req, res) => {
  res.json(db.prepare('SELECT * FROM badges WHERE user_id=? ORDER BY earned_at DESC').all(req.userId));
});

router.post('/api/badges/check', (req, res) => {
  const earned = [];
  const has = (type) => db.prepare('SELECT 1 FROM badges WHERE type=? AND user_id=?').get(type, req.userId);
  const ins = db.prepare('INSERT OR IGNORE INTO badges (type, user_id) VALUES (?,?)');
  // First 10 tasks
  if (!has('first-10-tasks')) {
    const cnt = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND user_id=?").get(req.userId).c;
    if (cnt >= 10) { ins.run('first-10-tasks', req.userId); earned.push('first-10-tasks'); }
  }
  // First focus session
  if (!has('first-focus')) {
    const cnt = db.prepare('SELECT COUNT(*) as c FROM focus_sessions WHERE user_id=?').get(req.userId).c;
    if (cnt >= 1) { ins.run('first-focus', req.userId); earned.push('first-focus'); }
  }
  // 7-day streak
  if (!has('streak-7')) {
    const days = db.prepare("SELECT COUNT(DISTINCT date(completed_at)) as c FROM tasks WHERE status='done' AND completed_at >= date('now','-7 days') AND user_id=?").get(req.userId).c;
    if (days >= 7) { ins.run('streak-7', req.userId); earned.push('streak-7'); }
  }
  // 30-day streak
  if (!has('streak-30')) {
    const days = db.prepare("SELECT COUNT(DISTINCT date(completed_at)) as c FROM tasks WHERE status='done' AND completed_at >= date('now','-30 days') AND user_id=?").get(req.userId).c;
    if (days >= 30) { ins.run('streak-30', req.userId); earned.push('streak-30'); }
  }
  // 100 tasks completed
  if (!has('century')) {
    const cnt = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND user_id=?").get(req.userId).c;
    if (cnt >= 100) { ins.run('century', req.userId); earned.push('century'); }
  }
  // All areas active (at least 1 task per area in last 7 days)
  if (!has('all-areas-active')) {
    const areaCount = db.prepare('SELECT COUNT(*) as c FROM life_areas WHERE archived=0 AND user_id=?').get(req.userId).c;
    if (areaCount > 0) {
      const activeAreas = db.prepare("SELECT COUNT(DISTINCT a.id) as c FROM life_areas a JOIN goals g ON g.area_id=a.id JOIN tasks t ON t.goal_id=g.id WHERE a.archived=0 AND t.completed_at >= date('now','-7 days') AND a.user_id=?").get(req.userId).c;
      if (activeAreas >= areaCount) { ins.run('all-areas-active', req.userId); earned.push('all-areas-active'); }
    }
  }
  res.json({ earned });
});

// ─── Demo Mode ───
router.post('/api/demo/start', (req, res) => {
  const txn = db.transaction(() => {
    // Create sample areas
    const aIns = db.prepare('INSERT INTO life_areas (name,icon,color,position,user_id) VALUES (?,?,?,?,?)');
    const a1 = aIns.run('Work','💼','#3B82F6',0,req.userId).lastInsertRowid;
    const a2 = aIns.run('Health','💪','#22C55E',1,req.userId).lastInsertRowid;
    const a3 = aIns.run('Personal','🏠','#F59E0B',2,req.userId).lastInsertRowid;
    // Create goals
    const gIns = db.prepare('INSERT INTO goals (area_id,title,description,status,user_id) VALUES (?,?,?,?,?)');
    const g1 = gIns.run(a1,'Q2 Launch','Ship the product by June','active',req.userId).lastInsertRowid;
    const g2 = gIns.run(a1,'Team Management','Keep the team productive','active',req.userId).lastInsertRowid;
    const g3 = gIns.run(a2,'Run a Marathon','Train for a 42K marathon','active',req.userId).lastInsertRowid;
    const g4 = gIns.run(a2,'Eat Healthy','Meal prep and nutrition','active',req.userId).lastInsertRowid;
    const g5 = gIns.run(a3,'Learn Guitar','Practice 30 min daily','active',req.userId).lastInsertRowid;
    // Create 20 tasks
    const tIns = db.prepare('INSERT INTO tasks (goal_id,title,status,priority,due_date,my_day,user_id) VALUES (?,?,?,?,?,?,?)');
    const today = new Date().toISOString().slice(0,10);
    const tomorrow = new Date(Date.now()+864e5).toISOString().slice(0,10);
    tIns.run(g1,'Design API endpoints','todo',2,today,1,req.userId);
    tIns.run(g1,'Write unit tests','todo',1,today,1,req.userId);
    tIns.run(g1,'Deploy to staging','todo',2,tomorrow,0,req.userId);
    tIns.run(g1,'Code review PR #42','doing',1,today,1,req.userId);
    tIns.run(g1,'Update documentation','todo',0,null,0,req.userId);
    tIns.run(g2,'1:1 with Alice','todo',1,today,1,req.userId);
    tIns.run(g2,'Sprint retrospective','todo',1,tomorrow,0,req.userId);
    tIns.run(g2,'Write performance reviews','todo',2,null,0,req.userId);
    tIns.run(g3,'Run 5K','done',1,today,0,req.userId);
    tIns.run(g3,'Interval training','todo',1,tomorrow,0,req.userId);
    tIns.run(g3,'Long run 15K','todo',2,null,0,req.userId);
    tIns.run(g3,'Stretch and recovery','todo',0,today,1,req.userId);
    tIns.run(g4,'Meal prep Sunday','todo',1,null,0,req.userId);
    tIns.run(g4,'Buy groceries','todo',0,tomorrow,0,req.userId);
    tIns.run(g4,'Try new recipe','todo',0,null,0,req.userId);
    tIns.run(g5,'Practice chords','todo',1,today,1,req.userId);
    tIns.run(g5,'Learn Wonderwall','todo',0,null,0,req.userId);
    tIns.run(g5,'Watch tutorial','done',0,null,0,req.userId);
    tIns.run(g5,'Buy new strings','todo',0,tomorrow,0,req.userId);
    tIns.run(g5,'Record a practice session','todo',0,null,0,req.userId);
    // 3 habits
    const hIns = db.prepare('INSERT INTO habits (name,icon,color,frequency,area_id,user_id) VALUES (?,?,?,?,?,?)');
    hIns.run('Exercise','🏃','#22C55E','daily',a2,req.userId);
    hIns.run('Read 30 min','📚','#3B82F6','daily',a3,req.userId);
    hIns.run('Meditate','🧘','#8B5CF6','daily',a2,req.userId);
  });
  txn();
  res.json({ ok: true });
});

router.post('/api/demo/reset', (req, res) => {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM focus_steps WHERE session_id IN (SELECT id FROM focus_sessions WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM focus_session_meta WHERE session_id IN (SELECT id FROM focus_sessions WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM focus_sessions WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM goal_milestones WHERE goal_id IN (SELECT id FROM goals WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM inbox WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM notes WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM weekly_reviews WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM automation_rules WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM task_deps WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM tasks WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM goals WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM life_areas WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM tags WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM settings WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM habits WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM saved_filters WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id=?)').run(req.userId);
    db.prepare('DELETE FROM lists WHERE user_id=?').run(req.userId);
    db.prepare('DELETE FROM badges WHERE user_id=?').run(req.userId);
  });
  txn();
  res.json({ ok: true });
});

// ─── Settings ───
router.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id=?').all(req.userId);
  const settings = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (SETTINGS_KEYS.has(r.key)) settings[r.key] = r.value;
  }
  res.json(settings);
});

router.put('/api/settings', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Object required' });
  const upsert = db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value');
  const txn = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      if (!SETTINGS_KEYS.has(k)) continue;
      upsert.run(req.userId, k, String(v));
    }
  });
  txn();
  // Return full settings
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id=?').all(req.userId);
  const settings = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (SETTINGS_KEYS.has(r.key)) settings[r.key] = r.value;
  }
  res.json(settings);
});

router.post('/api/settings/reset', (req, res) => {
  db.prepare('DELETE FROM settings WHERE user_id=?').run(req.userId);
  res.json(SETTINGS_DEFAULTS);
});

// ─── Habits API ───
router.get('/api/habits', (req, res) => {
  const habits = db.prepare('SELECT h.*, la.name as area_name, la.icon as area_icon FROM habits h LEFT JOIN life_areas la ON h.area_id=la.id WHERE h.archived=0 AND h.user_id=? ORDER BY h.position').all(req.userId);
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
    for (;;) {
      const ds = d.toISOString().slice(0, 10);
      const count = logs[ds];
      if (count !== undefined && count >= h.target) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    h.streak = streak;
    h.total_completions = Object.values(logs).reduce((s, c) => s + c, 0);
    h.logged_today = h.todayCount > 0;
    if (h.schedule_days) try { h.schedule_days = JSON.parse(h.schedule_days); } catch(e) {}
  });
  res.json(habits);
});
router.post('/api/habits', (req, res) => {
  const { name, icon, color, frequency, target, area_id, schedule_days, preferred_time } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  if (color && !isValidColor(color)) return res.status(400).json({ error: 'Invalid hex color' });
  if (preferred_time !== undefined && preferred_time !== null && preferred_time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferred_time)) return res.status(400).json({ error: 'preferred_time must be HH:MM format' });
  const validFreqs = ['daily','weekly','monthly','yearly'];
  if (frequency && !validFreqs.includes(frequency)) return res.status(400).json({ error: 'Invalid frequency (must be daily, weekly, monthly, or yearly)' });
  if (target !== undefined && target !== null && (typeof target !== 'number' || target < 1 || !Number.isInteger(target))) return res.status(400).json({ error: 'Target must be a positive integer' });
  if (area_id !== undefined && area_id !== null) {
    const area = db.prepare('SELECT id FROM life_areas WHERE id=? AND user_id=?').get(area_id, req.userId);
    if (!area) return res.status(400).json({ error: 'Invalid area_id' });
  }
  // Validate schedule_days if provided
  let sdJson = null;
  if (schedule_days && Array.isArray(schedule_days) && schedule_days.length > 0) {
    const validWeekDays = ['mon','tue','wed','thu','fri','sat','sun'];
    const freq = frequency || 'daily';
    if (freq === 'weekly') {
      if (!schedule_days.every(d => validWeekDays.includes(d))) return res.status(400).json({ error: 'schedule_days must contain valid weekday abbreviations' });
    } else if (freq === 'monthly') {
      if (!schedule_days.every(d => Number.isInteger(d) && d >= 1 && d <= 31)) return res.status(400).json({ error: 'schedule_days must contain day numbers 1-31' });
    }
    sdJson = JSON.stringify(schedule_days);
  }
  const pos = getNextPosition('habits');
  const ptVal = (preferred_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(preferred_time)) ? preferred_time : null;
  const r = db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position,area_id,schedule_days,preferred_time,user_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    name.trim(), icon || '✅', color || '#22C55E', frequency || 'daily', target || 1, pos, area_id || null, sdJson, ptVal, req.userId
  );
  const created = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(r.lastInsertRowid, req.userId);
  if (created && created.schedule_days) try { created.schedule_days = JSON.parse(created.schedule_days); } catch(e) {}
  res.status(201).json(created);
});
router.put('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, icon, color, frequency, target, archived, area_id, schedule_days, preferred_time } = req.body;
  if (color && !isValidColor(color)) return res.status(400).json({ error: 'Invalid hex color' });
  let sdVal = undefined;
  if (schedule_days !== undefined) {
    sdVal = (schedule_days && Array.isArray(schedule_days) && schedule_days.length > 0) ? JSON.stringify(schedule_days) : null;
  }
  let ptVal = undefined;
  if (preferred_time !== undefined) {
    ptVal = (preferred_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(preferred_time)) ? preferred_time : null;
  }
  db.prepare('UPDATE habits SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),frequency=COALESCE(?,frequency),target=COALESCE(?,target),archived=COALESCE(?,archived),area_id=?,schedule_days=COALESCE(?,schedule_days),preferred_time=COALESCE(?,preferred_time) WHERE id=? AND user_id=?').run(
    name||null, icon||null, color||null, frequency||null, target!==undefined?target:null, archived!==undefined?archived:null, area_id!==undefined?area_id:ex.area_id, sdVal!==undefined?sdVal:null, ptVal!==undefined?ptVal:null, id, req.userId
  );
  const updated = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(id, req.userId);
  if (updated && updated.schedule_days) try { updated.schedule_days = JSON.parse(updated.schedule_days); } catch(e) {}
  res.json(updated);
});
router.delete('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const result = db.prepare('DELETE FROM habits WHERE id=? AND user_id=?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
// Log a habit completion for a date
router.post('/api/habits/:id/log', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(id, req.userId);
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
router.delete('/api/habits/:id/log', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(id, req.userId);
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
router.get('/api/habits/:id/heatmap', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(id, req.userId);
  if (!habit) return res.status(404).json({ error: 'Not found' });
  const logs = db.prepare("SELECT date, count FROM habit_logs WHERE habit_id=? AND date >= date('now','-90 days') ORDER BY date").all(id);
  res.json(logs);
});

// ─── DAY PLANNER API ───
// Suggest endpoint must come before :date to avoid param capture
router.get('/api/planner/suggest', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in3days = new Date(Date.now() + 3*86400000).toISOString().split('T')[0];

  const overdue = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date < ? AND t.user_id=? ORDER BY t.due_date LIMIT 20`).all(today, req.userId));

  const dueToday = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date=? AND t.my_day=0 AND t.user_id=? ORDER BY t.priority DESC LIMIT 20`).all(today, req.userId));

  const highPriority = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.priority>=2 AND t.my_day=0 AND (t.due_date IS NULL OR t.due_date>=?) AND t.user_id=? ORDER BY t.priority DESC LIMIT 10`).all(today, req.userId));

  const upcoming = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date>? AND t.due_date<=? AND t.my_day=0 AND t.user_id=? ORDER BY t.due_date LIMIT 10`).all(today, in3days, req.userId));

  res.json({ overdue, dueToday, highPriority, upcoming });
});

// ─── Smart Day Planning (scoring algorithm) ───
router.get('/api/planner/smart', (req, res) => {
  const maxMin = Number(req.query.max_minutes) || 240;
  const tasks = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status != 'done' AND t.my_day = 0 AND t.user_id=?
    ORDER BY t.priority DESC, t.due_date
  `).all(req.userId);
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

router.get('/api/planner/:date', (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' });
  // Get all tasks for this date: either due on this date OR time-blocked on this date
  const tasks = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE (t.due_date=? OR (t.time_block_start IS NOT NULL AND t.due_date=?)) AND t.status!='done' AND t.user_id=?
    ORDER BY t.time_block_start, t.priority DESC
  `).all(date, date, req.userId);
  // Unscheduled = tasks due today but without time blocks
  const scheduled = tasks.filter(t => t.time_block_start);
  const unscheduled = tasks.filter(t => !t.time_block_start);
  res.json({ scheduled, unscheduled });
});

  // ─── AI BYOK ───
  const createAiService = require('../services/ai');
  const aiService = createAiService(db);

  router.post('/api/ai/suggest', async (req, res) => {
    try {
      const { task_title } = req.body;
      if (!task_title) return res.status(400).json({ error: 'task_title is required' });
      const result = await aiService.suggest(req.userId, task_title);
      res.json(result);
    } catch (err) {
      if (err.message.includes('API key')) return res.status(400).json({ error: 'AI API key not configured. Set your key in Settings.' });
      res.status(500).json({ error: 'AI request failed' });
    }
  });

  router.post('/api/ai/schedule', async (req, res) => {
    try {
      const { task_ids } = req.body;
      const result = await aiService.schedule(req.userId, task_ids || []);
      res.json(result);
    } catch (err) {
      if (err.message.includes('API key')) return res.status(400).json({ error: 'AI API key not configured. Set your key in Settings.' });
      res.status(500).json({ error: 'AI request failed' });
    }
  });

  // ─── Webhooks ───

  const WEBHOOK_EVENTS = ['*', 'task.created', 'task.updated', 'task.completed', 'task.deleted',
    'goal.created', 'goal.completed', 'habit.logged', 'focus.completed'];

  // SSRF protection — block private/reserved IPs
  function isPrivateUrl(urlString) {
    try {
      const parsed = new URL(urlString);
      const hostname = parsed.hostname.replace(/^\[|\]$/g, ''); // strip brackets from IPv6
      if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
      if (hostname === '0.0.0.0' || hostname === '::1' || hostname === '::') return true;
      // IPv4 private ranges
      const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        if (a === 127) return true;                        // 127.0.0.0/8
        if (a === 10) return true;                         // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
        if (a === 192 && b === 168) return true;           // 192.168.0.0/16
        if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local/cloud metadata)
        if (a === 0) return true;                          // 0.0.0.0/8
      }
      // IPv6 mapped IPv4 (::ffff:127.x.x.x)
      if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(hostname)) {
        const mapped = hostname.replace(/^::ffff:/i, '');
        return isPrivateUrl(`http://${mapped}`);
      }
      return false;
    } catch { return true; }
  }

  const MAX_WEBHOOKS_PER_USER = 10;

  // Create webhook
  router.post('/api/webhooks', (req, res) => {
    const { name, url, events } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Webhook name is required' });
    }
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (!url.startsWith('https://')) {
      return res.status(400).json({ error: 'Webhook URL must use HTTPS' });
    }
    if (isPrivateUrl(url)) {
      return res.status(400).json({ error: 'Webhook URL must not point to private/internal networks' });
    }

    const count = db.prepare('SELECT COUNT(*) as cnt FROM webhooks WHERE user_id = ?').get(req.userId).cnt;
    if (count >= MAX_WEBHOOKS_PER_USER) {
      return res.status(400).json({ error: `Maximum of ${MAX_WEBHOOKS_PER_USER} webhooks allowed per user` });
    }

    const eventList = Array.isArray(events) ? events : [];
    if (eventList.length === 0) {
      return res.status(400).json({ error: 'At least one event type is required' });
    }
    const uniqueEvents = [...new Set(eventList)];
    if (eventList.some(e => !WEBHOOK_EVENTS.includes(e))) {
      return res.status(400).json({ error: 'Invalid event type', allowed: WEBHOOK_EVENTS });
    }

    const crypto = require('crypto');
    const secret = crypto.randomBytes(32).toString('hex');
    const eventsJson = JSON.stringify(uniqueEvents);

    const result = db.prepare(
      'INSERT INTO webhooks (user_id, name, url, events, secret) VALUES (?,?,?,?,?)'
    ).run(req.userId, name.trim().slice(0, 100), url, eventsJson, secret);

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      name: name.trim().slice(0, 100),
      url,
      events: uniqueEvents,
      secret,
      active: true,
      created_at: new Date().toISOString()
    });
  });

  // List valid webhook event types
  router.get('/api/webhooks/events', (req, res) => {
    res.json(WEBHOOK_EVENTS);
  });

  // List webhooks
  router.get('/api/webhooks', (req, res) => {
    const hooks = db.prepare(
      'SELECT id, name, url, events, active, created_at FROM webhooks WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.userId);
    hooks.forEach(h => { try { h.events = JSON.parse(h.events); } catch { h.events = []; } });
    res.json(hooks);
  });

  // Update webhook
  router.put('/api/webhooks/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const existing = db.prepare('SELECT * FROM webhooks WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Webhook not found' });

    const { name, url, events, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim().slice(0, 100);
    if (url !== undefined) {
      try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
      if (!url.startsWith('https://')) {
        return res.status(400).json({ error: 'Webhook URL must use HTTPS' });
      }
      if (isPrivateUrl(url)) {
        return res.status(400).json({ error: 'Webhook URL must not point to private/internal networks' });
      }
      updates.url = url;
    }
    if (events !== undefined) {
      const eventList = Array.isArray(events) ? events : [];
      if (eventList.some(e => !WEBHOOK_EVENTS.includes(e))) {
        return res.status(400).json({ error: 'Invalid event type', allowed: WEBHOOK_EVENTS });
      }
      updates.events = JSON.stringify(eventList);
    }
    if (active !== undefined) updates.active = active ? 1 : 0;

    const sets = Object.keys(updates).map(k => `${k}=?`).join(',');
    if (sets) {
      db.prepare(`UPDATE webhooks SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
    }

    const updated = db.prepare('SELECT id, name, url, events, active, created_at FROM webhooks WHERE id = ?').get(id);
    try { updated.events = JSON.parse(updated.events); } catch { updated.events = []; }
    res.json(updated);
  });

  // Delete webhook
  router.delete('/api/webhooks/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const existing = db.prepare('SELECT id FROM webhooks WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Webhook not found' });

    db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ─── Push Notifications ───

  const pushService = require('../services/push.service');

  // Get VAPID public key for client subscription
  router.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: pushService.getPublicKey() });
  });

  // Subscribe to push notifications
  router.post('/api/push/subscribe', (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'endpoint is required' });
    }
    if (!keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'keys.p256dh and keys.auth are required' });
    }

    const result = db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`
    ).run(req.userId, endpoint, keys.p256dh, keys.auth);

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  // Unsubscribe from push notifications
  router.delete('/api/push/subscribe', (req, res) => {
    const { endpoint } = req.body;
    if (endpoint) {
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
        .run(req.userId, endpoint);
    }
    res.json({ ok: true });
  });

  // Send test push notification
  router.post('/api/push/test', async (req, res) => {
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(req.userId);
    if (subs.length === 0) {
      return res.json({ sent: 0, message: 'No subscriptions found' });
    }

    if (!pushService.isEnabled()) {
      return res.json({ sent: 0, pending: subs.length, message: 'VAPID keys not configured — subscriptions stored for future use' });
    }

    const result = await pushService.sendPush(db, req.userId, {
      title: 'LifeFlow Test',
      body: 'Push notifications are working!',
      url: '/'
    });
    res.json({ sent: result.sent, failed: result.failed });
  });

  return router;
};
