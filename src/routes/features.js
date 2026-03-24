const { Router } = require('express');
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
};

const SETTINGS_KEYS = new Set(Object.keys(SETTINGS_DEFAULTS));

// ─── Reminders (upcoming + overdue summary) ───
router.get('/api/reminders', (req, res) => {
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

// ─── Task Templates ───
router.get('/api/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM task_templates ORDER BY created_at DESC').all();
  res.json(rows.map(r => { try { return { ...r, tasks: JSON.parse(r.tasks) }; } catch { return { ...r, tasks: [] }; } }));
});

router.post('/api/templates', (req, res) => {
  const { name, description, icon, tasks } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'Tasks array required' });
  const safeTasks = tasks.map(t => ({ title: String(t.title || '').slice(0, 500), priority: [0,1,2,3].includes(t.priority) ? t.priority : 0, subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).slice(0, 500)) : [] }));
  const r = db.prepare('INSERT INTO task_templates (name, description, icon, tasks) VALUES (?, ?, ?, ?)').run(name.trim().slice(0, 200), (description || '').slice(0, 500), (icon || '📋').slice(0, 10), JSON.stringify(safeTasks));
  res.json({ id: r.lastInsertRowid, name: name.trim(), description, icon: icon || '📋', tasks: safeTasks });
});

router.put('/api/templates/:id', (req, res) => {
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

router.delete('/api/templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM task_templates WHERE id=?').run(id);
  res.json({ ok: true });
});

router.post('/api/templates/:id/apply', (req, res) => {
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
router.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    if (SETTINGS_KEYS.has(r.key)) settings[r.key] = r.value;
  }
  res.json(settings);
});

router.put('/api/settings', (req, res) => {
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

router.post('/api/settings/reset', (req, res) => {
  db.prepare('DELETE FROM settings').run();
  res.json(SETTINGS_DEFAULTS);
});

// ─── Habits API ───
router.get('/api/habits', (req, res) => {
  const habits = db.prepare('SELECT h.*, la.name as area_name, la.icon as area_icon FROM habits h LEFT JOIN life_areas la ON h.area_id=la.id WHERE h.archived=0 ORDER BY h.position').all();
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
    h.total_completions = Object.values(logs).reduce((s, c) => s + c, 0);
    h.logged_today = h.todayCount > 0;
  });
  res.json(habits);
});
router.post('/api/habits', (req, res) => {
  const { name, icon, color, frequency, target, area_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const validFreqs = ['daily','weekly','monthly','yearly'];
  if (frequency && !validFreqs.includes(frequency)) return res.status(400).json({ error: 'Invalid frequency (must be daily, weekly, monthly, or yearly)' });
  if (target !== undefined && target !== null && (typeof target !== 'number' || target < 1 || !Number.isInteger(target))) return res.status(400).json({ error: 'Target must be a positive integer' });
  if (area_id !== undefined && area_id !== null) {
    const area = db.prepare('SELECT id FROM life_areas WHERE id=?').get(area_id);
    if (!area) return res.status(400).json({ error: 'Invalid area_id' });
  }
  const pos = getNextPosition('habits');
  const r = db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position,area_id) VALUES (?,?,?,?,?,?,?)').run(
    name.trim(), icon || '✅', color || '#22C55E', frequency || 'daily', target || 1, pos, area_id || null
  );
  res.status(201).json(db.prepare('SELECT * FROM habits WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, icon, color, frequency, target, archived, area_id } = req.body;
  db.prepare('UPDATE habits SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),frequency=COALESCE(?,frequency),target=COALESCE(?,target),archived=COALESCE(?,archived),area_id=? WHERE id=?').run(
    name||null, icon||null, color||null, frequency||null, target!==undefined?target:null, archived!==undefined?archived:null, area_id!==undefined?area_id:ex.area_id, id
  );
  res.json(db.prepare('SELECT * FROM habits WHERE id=?').get(id));
});
router.delete('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM habits WHERE id=?').run(id);
  res.json({ ok: true });
});
// Log a habit completion for a date
router.post('/api/habits/:id/log', (req, res) => {
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
router.delete('/api/habits/:id/log', (req, res) => {
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
router.get('/api/habits/:id/heatmap', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=?').get(id);
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
router.get('/api/planner/smart', (req, res) => {
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

router.get('/api/planner/:date', (req, res) => {
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

  return router;
};
