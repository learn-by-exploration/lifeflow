const { Router } = require('express');
const { isValidColor, validate } = require('../middleware/validate');
const { createTemplate, updateTemplate } = require('../schemas/features.schema');
const { toDateStr, addDays } = require('../utils/date');
module.exports = function(deps) {
  const { db, enrichTask, enrichTasks, getNextPosition, automationEngine } = deps;
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
  dailyQuote: 'false',      // show daily motivation quote on app open
  pinnedAreas: '[]',        // JSON array of pinned life area IDs
};

const SETTINGS_KEYS = new Set(Object.keys(SETTINGS_DEFAULTS));

// ─── Reminders (upcoming + overdue summary) ───
router.get('/api/reminders', (req, res) => {
  const overdue = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date < date('now') AND t.status != 'done' AND t.user_id=?
    ORDER BY t.due_date, t.priority DESC
  `).all(req.userId));
  const today = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date = date('now') AND t.status != 'done' AND t.user_id=?
    ORDER BY t.priority DESC
  `).all(req.userId));
  const upcoming = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
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

router.post('/api/templates', validate(createTemplate), (req, res) => {
  const { name, description, icon, tasks } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'Tasks array required' });
  const safeTasks = tasks.map(t => ({ title: String(t.title || '').slice(0, 500), priority: [0,1,2,3].includes(t.priority) ? t.priority : 0, subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).slice(0, 500)) : [] }));
  const r = db.prepare('INSERT INTO task_templates (name, description, icon, tasks, user_id) VALUES (?, ?, ?, ?, ?)').run(name.trim().slice(0, 200), (description || '').slice(0, 500), (icon || '📋').slice(0, 10), JSON.stringify(safeTasks), req.userId);
  res.json({ id: r.lastInsertRowid, name: name.trim(), description, icon: icon || '📋', tasks: safeTasks });
});

router.put('/api/templates/:id', validate(updateTemplate), (req, res) => {
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

// ─── Gamification: XP System ───
const XP_AMOUNTS = { task_complete: 10, subtask_complete: 3, focus_session: 5, habit_log: 5, streak_bonus: 2, review_complete: 15 };

router.get('/api/gamification/stats', (req, res) => {
  const user = db.prepare('SELECT xp_total, xp_level, daily_goal, weekly_goal FROM users WHERE id=?').get(req.userId) || {};
  const today = toDateStr();
  const weekAgo = toDateStr(addDays(new Date(), -7));
  const todayDone = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)=? AND user_id=?").get(today, req.userId)?.c || 0;
  const weekDone = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)>=? AND user_id=?").get(weekAgo, req.userId)?.c || 0;
  const recentXp = db.prepare("SELECT amount, reason, created_at FROM user_xp WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(req.userId);
  const level = user.xp_level || 1;
  const xpForNext = level * 100; // 100 XP per level
  res.json({
    xp_total: user.xp_total || 0, level, xp_for_next_level: xpForNext,
    daily_goal: user.daily_goal || 5, daily_done: todayDone,
    weekly_goal: user.weekly_goal || 25, weekly_done: weekDone,
    recent_xp: recentXp
  });
});

router.post('/api/gamification/award', (req, res) => {
  const { reason } = req.body;
  if (!reason || !XP_AMOUNTS[reason]) return res.status(400).json({ error: 'Invalid reason' });
  const amount = XP_AMOUNTS[reason];
  db.prepare('INSERT INTO user_xp (user_id, amount, reason) VALUES (?,?,?)').run(req.userId, amount, reason);
  const newTotal = (db.prepare('SELECT xp_total FROM users WHERE id=?').get(req.userId)?.xp_total || 0) + amount;
  const newLevel = Math.floor(newTotal / 100) + 1;
  db.prepare('UPDATE users SET xp_total=?, xp_level=? WHERE id=?').run(newTotal, newLevel, req.userId);
  const leveledUp = newLevel > Math.floor((newTotal - amount) / 100) + 1;
  res.json({ xp_gained: amount, xp_total: newTotal, level: newLevel, leveled_up: leveledUp });
});

router.put('/api/gamification/goals', (req, res) => {
  const { daily_goal, weekly_goal } = req.body;
  if (daily_goal !== undefined) {
    const v = Number(daily_goal);
    if (!Number.isInteger(v) || v < 1 || v > 100) return res.status(400).json({ error: 'daily_goal must be 1-100' });
    db.prepare('UPDATE users SET daily_goal=? WHERE id=?').run(v, req.userId);
  }
  if (weekly_goal !== undefined) {
    const v = Number(weekly_goal);
    if (!Number.isInteger(v) || v < 1 || v > 500) return res.status(400).json({ error: 'weekly_goal must be 1-500' });
    db.prepare('UPDATE users SET weekly_goal=? WHERE id=?').run(v, req.userId);
  }
  res.json({ ok: true });
});

// ─── File Attachments ───
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const UPLOAD_DIR = path.join(process.env.DB_DIR || process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','application/json','text/csv','text/markdown'];

router.get('/api/tasks/:id/attachments', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const task = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT id, original_name, mime_type, size_bytes, created_at FROM task_attachments WHERE task_id=? ORDER BY created_at DESC').all(id));
});

router.post('/api/tasks/:id/attachments', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const task = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!task) return res.status(404).json({ error: 'Not found' });
  // Check attachment count limit per task
  const count = db.prepare('SELECT COUNT(*) as c FROM task_attachments WHERE task_id=?').get(id).c;
  if (count >= 20) return res.status(400).json({ error: 'Max 20 attachments per task' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/octet-stream')) {
    return res.status(400).json({ error: 'File upload required (multipart/form-data)' });
  }

  // Simple raw body upload handler (no multer dependency)
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_FILE_SIZE) { req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_FILE_SIZE) return res.status(400).json({ error: 'File too large (max 10 MB)' });
    if (size === 0) return res.status(400).json({ error: 'Empty file' });

    const originalName = req.headers['x-filename'] || 'upload';
    const mimeType = req.headers['x-mime-type'] || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(mimeType)) return res.status(400).json({ error: 'File type not allowed' });

    // Sanitize filename
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const ext = path.extname(safeName) || '';
    const filename = crypto.randomUUID() + ext;

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.concat(chunks));

    const r = db.prepare('INSERT INTO task_attachments (task_id, user_id, filename, original_name, mime_type, size_bytes) VALUES (?,?,?,?,?,?)')
      .run(id, req.userId, filename, safeName, mimeType, size);
    res.status(201).json({ id: r.lastInsertRowid, filename, original_name: safeName, mime_type: mimeType, size_bytes: size });
  });
});

router.delete('/api/tasks/:id/attachments/:attachId', (req, res) => {
  const id = Number(req.params.id);
  const attachId = Number(req.params.attachId);
  if (!Number.isInteger(id) || !Number.isInteger(attachId)) return res.status(400).json({ error: 'Invalid ID' });
  const att = db.prepare('SELECT filename FROM task_attachments WHERE id=? AND task_id=? AND user_id=?').get(attachId, id, req.userId);
  if (!att) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM task_attachments WHERE id=?').run(attachId);
  // Clean up file
  try { fs.unlinkSync(path.join(UPLOAD_DIR, att.filename)); } catch(e) {}
  res.json({ ok: true });
});

router.get('/api/attachments/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-f0-9-]+\.\w+$/i.test(filename)) return res.status(400).json({ error: 'Invalid filename' });
  const att = db.prepare('SELECT * FROM task_attachments WHERE filename=? AND user_id=?').get(filename, req.userId);
  if (!att) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Type', att.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${att.original_name}"`);
  res.sendFile(filePath);
});

// ─── Custom Statuses ───
router.get('/api/goals/:goalId/statuses', (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'Invalid ID' });
  const goal = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(goalId, req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM custom_statuses WHERE goal_id=? ORDER BY position').all(goalId));
});

router.post('/api/goals/:goalId/statuses', (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'Invalid ID' });
  const goal = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(goalId, req.userId);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  const { name, color, is_done } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (name.trim().length > 50) return res.status(400).json({ error: 'Name too long (max 50)' });
  const count = db.prepare('SELECT COUNT(*) as c FROM custom_statuses WHERE goal_id=?').get(goalId).c;
  if (count >= 10) return res.status(400).json({ error: 'Max 10 custom statuses per goal' });
  const pos = count;
  const r = db.prepare('INSERT INTO custom_statuses (goal_id, name, color, position, is_done) VALUES (?,?,?,?,?)')
    .run(goalId, name.trim(), color || '#6B7280', pos, is_done ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM custom_statuses WHERE id=?').get(r.lastInsertRowid));
});

router.put('/api/goals/:goalId/statuses/:statusId', (req, res) => {
  const goalId = Number(req.params.goalId);
  const statusId = Number(req.params.statusId);
  if (!Number.isInteger(goalId) || !Number.isInteger(statusId)) return res.status(400).json({ error: 'Invalid ID' });
  const st = db.prepare('SELECT cs.* FROM custom_statuses cs JOIN goals g ON cs.goal_id=g.id WHERE cs.id=? AND cs.goal_id=? AND g.user_id=?').get(statusId, goalId, req.userId);
  if (!st) return res.status(404).json({ error: 'Not found' });
  const { name, color, position, is_done } = req.body;
  if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'Name must be non-empty' });
  db.prepare('UPDATE custom_statuses SET name=COALESCE(?,name), color=COALESCE(?,color), position=COALESCE(?,position), is_done=COALESCE(?,is_done) WHERE id=?')
    .run(name?.trim() || null, color || null, position !== undefined ? position : null, is_done !== undefined ? (is_done ? 1 : 0) : null, statusId);
  res.json(db.prepare('SELECT * FROM custom_statuses WHERE id=?').get(statusId));
});

router.delete('/api/goals/:goalId/statuses/:statusId', (req, res) => {
  const goalId = Number(req.params.goalId);
  const statusId = Number(req.params.statusId);
  if (!Number.isInteger(goalId) || !Number.isInteger(statusId)) return res.status(400).json({ error: 'Invalid ID' });
  const result = db.prepare('DELETE FROM custom_statuses WHERE id=? AND goal_id=? AND goal_id IN (SELECT id FROM goals WHERE user_id=?)').run(statusId, goalId, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
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
    const today = toDateStr();
    const tomorrow = toDateStr(addDays(new Date(), 1));
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

// ─── Daily Quote API ───
const MINDFUL_QUOTES = [
  { text: 'The present moment is filled with joy and happiness. If you are attentive, you will see it.', author: 'Thich Nhat Hanh' },
  { text: 'Drink your tea slowly and reverently, as if it is the axis on which the world earth revolves.', author: 'Thich Nhat Hanh' },
  { text: 'The miracle is not to walk on water. The miracle is to walk on the green earth, dwelling deeply in the present moment and feeling truly alive.', author: 'Thich Nhat Hanh' },
  { text: 'Smile, breathe, and go slowly.', author: 'Thich Nhat Hanh' },
  { text: 'Life is available only in the present moment.', author: 'Thich Nhat Hanh' },
  { text: 'Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.', author: 'Thich Nhat Hanh' },
  { text: 'Almost everything will work again if you unplug it for a few minutes, including you.', author: 'Anne Lamott' },
  { text: 'You are the sky. Everything else is just the weather.', author: 'Pema Chödrön' },
  { text: 'The things that matter most in our lives are not fantastic or grand. They are moments when we touch one another.', author: 'Jack Kornfield' },
  { text: 'In today\'s rush, we all think too much, seek too much, want too much, and forget about the joy of just being.', author: 'Eckhart Tolle' },
  { text: 'Realize deeply that the present moment is all you ever have.', author: 'Eckhart Tolle' },
  { text: 'Life isn\'t as serious as the mind makes it out to be.', author: 'Eckhart Tolle' },
  { text: 'What a liberation to realize that the voice in my head is not who I am.', author: 'Eckhart Tolle' },
  { text: 'The primary cause of unhappiness is never the situation but your thoughts about it.', author: 'Eckhart Tolle' },
  { text: 'Acknowledging the good that you already have in your life is the foundation for all abundance.', author: 'Eckhart Tolle' },
  { text: 'Be where you are, not where you think you should be.', author: 'Unknown' },
  { text: 'You don\'t have to be perfect to be worthy of love — especially your own.', author: 'Unknown' },
  { text: 'Rest is not idleness, and to lie sometimes on the grass under trees on a summer\'s day is by no means a waste of time.', author: 'John Lubbock' },
  { text: 'Nothing ever goes away until it has taught us what we need to know.', author: 'Pema Chödrön' },
  { text: 'You are enough just as you are.', author: 'Meghan Markle' },
  { text: 'The little things? The little moments? They aren\'t little.', author: 'Jon Kabat-Zinn' },
  { text: 'Wherever you are, be there totally.', author: 'Eckhart Tolle' },
  { text: 'Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.', author: 'Buddha' },
  { text: 'Happiness is not something ready-made. It comes from your own actions.', author: 'Dalai Lama' },
  { text: 'If you want others to be happy, practice compassion. If you want to be happy, practice compassion.', author: 'Dalai Lama' },
  { text: 'Every morning we are born again. What we do today is what matters most.', author: 'Buddha' },
  { text: 'The mind is everything. What you think you become.', author: 'Buddha' },
  { text: 'Let go of the thoughts that don\'t make you strong.', author: 'Karen Salmansohn' },
  { text: 'Your calm mind is the ultimate weapon against your challenges.', author: 'Bryant McGill' },
  { text: 'Gratitude turns what we have into enough.', author: 'Melody Beattie' },
  { text: 'Not what we have, but what we enjoy, constitutes our abundance.', author: 'Epicurus' },
  { text: 'He who is not contented with what he has would not be contented with what he would like to have.', author: 'Socrates' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'The greatest wealth is to live content with little.', author: 'Plato' },
  { text: 'When you realize nothing is lacking, the whole world belongs to you.', author: 'Lao Tzu' },
  { text: 'Nature does not hurry, yet everything is accomplished.', author: 'Lao Tzu' },
  { text: 'Be content with what you have; rejoice in the way things are. When you realize there is nothing lacking, the whole world belongs to you.', author: 'Lao Tzu' },
  { text: 'Knowing others is intelligence; knowing yourself is true wisdom.', author: 'Lao Tzu' },
  { text: 'The journey of a thousand miles begins with one step.', author: 'Lao Tzu' },
  { text: 'Stop leaving and you will arrive. Stop searching and you will see.', author: 'Lao Tzu' },
  { text: 'To a mind that is still, the whole universe surrenders.', author: 'Lao Tzu' },
  { text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { text: 'It is not that we have a short time to live, but that we waste a good deal of it.', author: 'Seneca' },
  { text: 'Begin at once to live, and count each separate day as a separate life.', author: 'Seneca' },
  { text: 'True happiness is to enjoy the present, without anxious dependence upon the future.', author: 'Seneca' },
  { text: 'It\'s not what happens to you, but how you react to it that matters.', author: 'Epictetus' },
  { text: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', author: 'Marcus Aurelius' },
  { text: 'The happiness of your life depends upon the quality of your thoughts.', author: 'Marcus Aurelius' },
  { text: 'When you arise in the morning, think of what a precious privilege it is to be alive.', author: 'Marcus Aurelius' },
  { text: 'Dwell on the beauty of life. Watch the stars, and see yourself running with them.', author: 'Marcus Aurelius' },
  { text: 'The soul becomes dyed with the colour of its thoughts.', author: 'Marcus Aurelius' },
  { text: 'How we spend our days is, of course, how we spend our lives.', author: 'Annie Dillard' },
  { text: 'The real voyage of discovery consists not in seeking new landscapes, but in having new eyes.', author: 'Marcel Proust' },
  { text: 'To pay attention, this is our endless and proper work.', author: 'Mary Oliver' },
  { text: 'Tell me, what is it you plan to do with your one wild and precious life?', author: 'Mary Oliver' },
  { text: 'Instructions for living a life: Pay attention. Be astonished. Tell about it.', author: 'Mary Oliver' },
  { text: 'If you suddenly and unexpectedly feel joy, don\'t hesitate. Give in to it.', author: 'Mary Oliver' },
  { text: 'You do not have to be good. You do not have to walk on your knees for a hundred miles through the desert, repenting.', author: 'Mary Oliver' },
  { text: 'The question is not what you look at, but what you see.', author: 'Henry David Thoreau' },
  { text: 'Our life is frittered away by detail. Simplify, simplify.', author: 'Henry David Thoreau' },
  { text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life.', author: 'Henry David Thoreau' },
  { text: 'You must live in the present, launch yourself on every wave, find your eternity in each moment.', author: 'Henry David Thoreau' },
  { text: 'Adopt the pace of nature: her secret is patience.', author: 'Ralph Waldo Emerson' },
  { text: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', author: 'Ralph Waldo Emerson' },
  { text: 'To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.', author: 'Ralph Waldo Emerson' },
  { text: 'The earth has music for those who listen.', author: 'William Shakespeare' },
  { text: 'Breathe. Let go. And remind yourself that this very moment is the only one you know you have for sure.', author: 'Oprah Winfrey' },
  { text: 'Be thankful for what you have; you\'ll end up having more.', author: 'Oprah Winfrey' },
  { text: 'I have decided to stick with love. Hate is too great a burden to bear.', author: 'Martin Luther King Jr.' },
  { text: 'The most wasted of all days is one without laughter.', author: 'E.E. Cummings' },
  { text: 'In the end, just three things matter: How well we have lived. How well we have loved. How well we have learned to let go.', author: 'Jack Kornfield' },
  { text: 'Let everything happen to you. Beauty and terror. Just keep going. No feeling is final.', author: 'Rainer Maria Rilke' },
  { text: 'Perhaps all the dragons in our lives are princesses who are only waiting to see us act, just once, with beauty and courage.', author: 'Rainer Maria Rilke' },
  { text: 'The only way to make sense out of change is to plunge into it, move with it, and join the dance.', author: 'Alan Watts' },
  { text: 'This is the real secret of life — to be completely engaged with what you are doing in the here and now.', author: 'Alan Watts' },
  { text: 'Muddy water is best cleared by leaving it alone.', author: 'Alan Watts' },
  { text: 'You are an aperture through which the universe is looking at and exploring itself.', author: 'Alan Watts' },
  { text: 'The meaning of life is just to be alive. It is so plain and so obvious and so simple. And yet, everybody rushes around in a great panic as if it were necessary to achieve something beyond themselves.', author: 'Alan Watts' },
];

router.get('/api/features/daily-quote', async (req, res) => {
  // Check if user has daily quotes enabled
  const row = db.prepare("SELECT value FROM settings WHERE user_id=? AND key='dailyQuote'").get(req.userId);
  if (!row || row.value !== 'true') {
    return res.json({ enabled: false });
  }

  // Determine today's quote index (day of year for consistent daily rotation)
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24));

  // Try external API first for variety (ZenQuotes — free, no key)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch('https://zenquotes.io/api/today', { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data[0] && data[0].q && data[0].a && !data[0].q.includes('Too many requests')) {
        return res.json({ enabled: true, text: data[0].q, author: data[0].a, source: 'zenquotes' });
      }
    }
  } catch (_) { /* external API failed — use local quotes */ }

  // Fallback: curated local quote
  const quote = MINDFUL_QUOTES[dayOfYear % MINDFUL_QUOTES.length];
  res.json({ enabled: true, text: quote.text, author: quote.author, source: 'local' });
});

// ─── Habits API ───
router.get('/api/habits', (req, res) => {
  const habits = db.prepare('SELECT h.*, la.name as area_name, la.icon as area_icon FROM habits h LEFT JOIN life_areas la ON h.area_id=la.id WHERE h.archived=0 AND h.user_id=? ORDER BY h.position').all(req.userId);
  if (!habits.length) return res.json(habits);
  const today = toDateStr();
  // Batch-load all logs for these habits (last 400 days for streak calc)
  const hIds = habits.map(h => h.id);
  const hph = hIds.map(() => '?').join(',');
  const cutoff = addDays(new Date(), -400);
  const allLogs = db.prepare(`SELECT habit_id, date, count FROM habit_logs WHERE habit_id IN (${hph}) AND date >= ? ORDER BY date DESC`).all(...hIds, toDateStr(cutoff));
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
      const ds = toDateStr(d);
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
  const date = req.body.date || toDateStr();
  const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(id, date);
  if (existing) {
    db.prepare('UPDATE habit_logs SET count=count+1 WHERE habit_id=? AND date=?').run(id, date);
  } else {
    db.prepare('INSERT INTO habit_logs (habit_id,date,count) VALUES (?,?,1)').run(id, date);
  }
  const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(id, date);
  // Emit habit_logged automation event
  if (automationEngine) {
    // Calculate current streak
    const logs = db.prepare("SELECT date FROM habit_logs WHERE habit_id=? AND date <= ? ORDER BY date DESC LIMIT 366").all(id, date);
    let streak = 0;
    const d = new Date(date);
    for (const l of logs) {
      const expected = new Date(d);
      expected.setDate(expected.getDate() - streak);
      if (l.date === toDateStr(expected)) streak++;
      else break;
    }
    automationEngine.emit('habit_logged', { userId: req.userId, habit, date, count: log.count, streak });
    if (streak > 0 && (streak === 7 || streak === 14 || streak === 21 || streak === 30 || streak === 60 || streak === 90 || streak === 365 || streak % 100 === 0)) {
      automationEngine.emit('habit_streak', { userId: req.userId, habit, streak, date });
    }
  }
  res.json(log);
});
// Undo a habit log
router.delete('/api/habits/:id/log', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const habit = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(id, req.userId);
  if (!habit) return res.status(404).json({ error: 'Not found' });
  const date = (req.body && req.body.date) || toDateStr();
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
  const today = toDateStr();
  const in3days = toDateStr(addDays(new Date(), 3));

  const overdue = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date < ? AND t.user_id=? ORDER BY t.due_date LIMIT 20`).all(today, req.userId));

  const dueToday = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date=? AND t.my_day=0 AND t.user_id=? ORDER BY t.priority DESC LIMIT 20`).all(today, req.userId));

  const highPriority = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.priority>=2 AND t.my_day=0 AND (t.due_date IS NULL OR t.due_date>=?) AND t.user_id=? ORDER BY t.priority DESC LIMIT 10`).all(today, req.userId));

  const upcoming = enrichTasks(db.prepare(`SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status!='done' AND t.due_date>? AND t.due_date<=? AND t.my_day=0 AND t.user_id=? ORDER BY t.due_date LIMIT 10`).all(today, in3days, req.userId));

  res.json({ overdue, dueToday, highPriority, upcoming });
});

// ─── Smart Day Planning (scoring algorithm) ───
router.get('/api/planner/smart', (req, res) => {
  const maxMin = Number(req.query.max_minutes) || 240;
  const tasks = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status != 'done' AND t.my_day = 0 AND t.user_id=?
    ORDER BY t.priority DESC, t.due_date
  `).all(req.userId);
  const today = toDateStr();
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
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE (t.due_date=? OR (t.time_block_start IS NOT NULL AND t.due_date=?)) AND t.status!='done' AND t.user_id=?
    ORDER BY t.time_block_start, t.priority DESC
  `).all(date, date, req.userId);
  // Unscheduled = tasks due today but without time blocks
  const scheduled = tasks.filter(t => t.time_block_start);
  const unscheduled = tasks.filter(t => !t.time_block_start);
  res.json({ scheduled, unscheduled });
});

  // ─── AI Service ───
  const createAiService = require('../services/ai/index');
  const aiService = createAiService(db);

  // AI error handler helper
  function aiError(res, err) {
    if (err.message.includes('API key') || err.message.includes('not configured')) return res.status(400).json({ error: err.message });
    if (err.message.includes('rate limit')) return res.status(429).json({ error: err.message });
    res.status(500).json({ error: 'AI request failed' });
  }

  // ─── AI Settings & Key Management ───

  router.get('/api/ai/status', (req, res) => {
    res.json(aiService.getStatus(req.userId));
  });

  router.post('/api/ai/key', (req, res) => {
    try {
      const { api_key } = req.body;
      if (!api_key || typeof api_key !== 'string' || api_key.length < 8 || api_key.length > 500) {
        return res.status(400).json({ error: 'Invalid API key' });
      }
      const encrypted = aiService.encrypt(api_key);
      aiService.setSetting(req.userId, 'ai_api_key', encrypted);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save API key: ' + err.message });
    }
  });

  router.delete('/api/ai/key', (req, res) => {
    aiService.setSetting(req.userId, 'ai_api_key', '');
    res.json({ ok: true });
  });

  router.post('/api/ai/settings', (req, res) => {
    const allowed = ['ai_provider', 'ai_base_url', 'ai_model', 'ai_transparency_mode', 'ai_data_minimization'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = String(req.body[key]).slice(0, 500);
        aiService.setSetting(req.userId, key, val);
        updates[key] = val;
      }
    }
    res.json({ ok: true, updated: updates });
  });

  router.get('/api/ai/settings', (req, res) => {
    const keys = ['ai_provider', 'ai_base_url', 'ai_model', 'ai_transparency_mode', 'ai_data_minimization'];
    const settings = {};
    for (const key of keys) {
      settings[key] = aiService.getSetting(req.userId, key) || '';
    }
    settings.has_api_key = !!aiService.getUserApiKey(req.userId);
    res.json(settings);
  });

  router.post('/api/ai/test', async (req, res) => {
    try {
      const result = await aiService.testConnection(req.userId);
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  // ─── AI History & Stats ───

  router.get('/api/ai/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    res.json(aiService.getHistory(req.userId, limit, offset));
  });

  router.get('/api/ai/stats', (req, res) => {
    res.json(aiService.getUsageStats(req.userId));
  });

  // ─── AI Pre-flight (transparency) ───

  router.post('/api/ai/preflight', (req, res) => {
    const { feature, data } = req.body;
    if (!feature) return res.status(400).json({ error: 'feature is required' });
    res.json(aiService.getPreFlight(req.userId, feature, data || {}));
  });

  // ─── Phase 2: Backward-compat stubs + new AI endpoints ───

  router.post('/api/ai/suggest', async (req, res) => {
    try {
      const { task_title } = req.body;
      if (!task_title) return res.status(400).json({ error: 'task_title is required' });
      const result = await aiService.suggest(req.userId, task_title);
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/schedule', async (req, res) => {
    try {
      const { task_ids } = req.body;
      const result = await aiService.schedule(req.userId, task_ids || []);
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/capture', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
      if (text.length > 1000) return res.status(400).json({ error: 'Text too long (max 1000 chars)' });
      // Build context from user's data
      const areas = db.prepare('SELECT id, name FROM life_areas WHERE user_id = ? AND archived = 0').all(req.userId);
      const goals = db.prepare('SELECT id, title FROM goals WHERE user_id = ? AND status != ?').all(req.userId, 'completed');
      const tags = db.prepare('SELECT id, name FROM tags WHERE user_id = ?').all(req.userId);
      const result = await aiService.capture(req.userId, text, { areas, goals, tags });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/classify', async (req, res) => {
    try {
      const { title, note } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const areas = db.prepare('SELECT id, name FROM life_areas WHERE user_id = ? AND archived = 0').all(req.userId);
      const goals = db.prepare('SELECT g.id, g.title, a.name as area FROM goals g LEFT JOIN life_areas a ON g.area_id = a.id WHERE g.user_id = ? AND g.status != ?').all(req.userId, 'completed');
      const tags = db.prepare('SELECT id, name FROM tags WHERE user_id = ?').all(req.userId);
      const result = await aiService.classify(req.userId, { title, note }, { areas, goals, tags });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/decompose', async (req, res) => {
    try {
      const { goal_id } = req.body;
      if (!goal_id) return res.status(400).json({ error: 'goal_id is required' });
      const goal = db.prepare('SELECT g.*, a.name as area_name FROM goals g LEFT JOIN life_areas a ON g.area_id = a.id WHERE g.id = ? AND g.user_id = ?').get(goal_id, req.userId);
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      const existingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'done'").get(req.userId).c;
      const weeklyRate = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed_at >= datetime('now', '-7 days')").get(req.userId).c;
      const result = await aiService.decompose(req.userId, goal, { area: { name: goal.area_name }, existingTasks, completionRate: weeklyRate });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/plan-day', async (req, res) => {
    try {
      const today = toDateStr();
      let tasks = db.prepare("SELECT t.*, g.title as goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id = g.id WHERE t.user_id = ? AND t.status != 'done' AND (t.due_date = ? OR t.my_day = 1 OR t.status = 'doing')").all(req.userId, today);
      tasks = enrichTasks(tasks);
      if (!tasks.length) return res.json({ data: { plan: [], summary: 'No tasks for today!' } });
      const completedToday = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed_at >= ?").get(req.userId, today).c;
      const habits = db.prepare("SELECT name FROM habits WHERE user_id = ? AND archived = 0").all(req.userId);
      const result = await aiService.planDay(req.userId, tasks, {
        completedToday,
        habitsDue: habits.map(h => h.name),
        timeOfDay: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/next-task', async (req, res) => {
    try {
      const today = toDateStr();
      let tasks = db.prepare("SELECT t.*, g.title as goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id = g.id WHERE t.user_id = ? AND t.status != 'done' AND (t.due_date <= ? OR t.my_day = 1 OR t.status = 'doing' OR t.priority >= 2) LIMIT 20").all(req.userId, today);
      tasks = enrichTasks(tasks);
      if (!tasks.length) return res.json({ data: { task_id: null, reason: 'No active tasks — you\'re all caught up!' } });
      const completedToday = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed_at >= ?").get(req.userId, today).c;
      const result = await aiService.nextTask(req.userId, tasks, {
        completedToday,
        timeOfDay: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/review-week', async (req, res) => {
    try {
      const weekAgo = toDateStr(addDays(new Date(), -7));
      const completed = db.prepare("SELECT t.title, t.priority, a.name as area FROM tasks t LEFT JOIN goals g ON t.goal_id = g.id LEFT JOIN life_areas a ON g.area_id = a.id WHERE t.user_id = ? AND t.completed_at >= ?").all(req.userId, weekAgo);
      const created = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND created_at >= ?").get(req.userId, weekAgo).c;
      const overdue = db.prepare("SELECT title FROM tasks WHERE user_id = ? AND status != 'done' AND due_date < ?").all(req.userId, toDateStr());
      const focusMinutes = db.prepare("SELECT COALESCE(SUM(duration_sec), 0) / 60 as m FROM focus_sessions WHERE user_id = ? AND started_at >= ?").get(req.userId, weekAgo).m;
      const habitStats = db.prepare("SELECT h.name, h.target, COUNT(hl.id) as logged FROM habits h LEFT JOIN habit_logs hl ON hl.habit_id = h.id AND hl.date >= ? WHERE h.user_id = ? AND h.archived = 0 GROUP BY h.id").all(weekAgo, req.userId);
      // Area breakdown
      const areaRows = db.prepare("SELECT COALESCE(a.name, 'Uncategorized') as name, COUNT(*) as c FROM tasks t LEFT JOIN goals g ON t.goal_id = g.id LEFT JOIN life_areas a ON g.area_id = a.id WHERE t.user_id = ? AND t.completed_at >= ? GROUP BY a.name").all(req.userId, weekAgo);
      const areaBreakdown = {};
      areaRows.forEach(r => { areaBreakdown[r.name] = r.c; });
      // Prior review
      const prior = db.prepare("SELECT reflection, next_week_priorities FROM weekly_reviews WHERE user_id = ? ORDER BY week_start DESC LIMIT 1").get(req.userId);
      const result = await aiService.reviewWeek(req.userId, { completed, created, overdue, focusMinutes, habitStats, areaBreakdown }, {
        priorReflection: prior?.reflection,
        priorPriorities: prior?.next_week_priorities,
      });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  // ─── Phase 3: Engagement ───

  router.post('/api/ai/year-in-review', async (req, res) => {
    try {
      const year = req.body.year || new Date().getFullYear();
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const tasksCompleted = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed_at BETWEEN ? AND ?").get(req.userId, yearStart, yearEnd).c;
      const goalsAchieved = db.prepare("SELECT COUNT(*) as c FROM goals WHERE user_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?").get(req.userId, yearStart, yearEnd).c;
      const focusHours = db.prepare("SELECT COALESCE(SUM(duration_sec), 0) / 3600.0 as h FROM focus_sessions WHERE user_id = ? AND started_at BETWEEN ? AND ?").get(req.userId, yearStart, yearEnd).h;
      const habitLogs = db.prepare("SELECT COUNT(*) as c FROM habit_logs hl JOIN habits h ON hl.habit_id = h.id WHERE h.user_id = ? AND hl.date BETWEEN ? AND ?").get(req.userId, yearStart, yearEnd).c;
      // Monthly breakdown
      const monthly = db.prepare("SELECT strftime('%m', completed_at) as month, COUNT(*) as c FROM tasks WHERE user_id = ? AND completed_at BETWEEN ? AND ? GROUP BY month ORDER BY month").all(req.userId, yearStart, yearEnd);
      // Area distribution
      const areas = db.prepare("SELECT COALESCE(a.name, 'Other') as name, COUNT(*) as c FROM tasks t LEFT JOIN goals g ON t.goal_id = g.id LEFT JOIN life_areas a ON g.area_id = a.id WHERE t.user_id = ? AND t.completed_at BETWEEN ? AND ? GROUP BY a.name ORDER BY c DESC").all(req.userId, yearStart, yearEnd);
      const result = await aiService.yearInReview(req.userId, { year, tasksCompleted, goalsAchieved, focusHours: Math.round(focusHours * 10) / 10, habitLogs, monthly, areas });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/cognitive-load', async (req, res) => {
    try {
      const today = toDateStr();
      const activeTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'done'").get(req.userId).c;
      const overdueTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'done' AND due_date < ?").get(req.userId, today).c;
      const dueSoon = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'done' AND due_date BETWEEN ? AND date(?, ?)")
        .get(req.userId, today, today, '+3 days').c;
      const highPriority = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'done' AND priority >= 2").get(req.userId).c;
      const areaCount = db.prepare("SELECT COUNT(DISTINCT a.id) as c FROM tasks t JOIN goals g ON t.goal_id = g.id JOIN life_areas a ON g.area_id = a.id WHERE t.user_id = ? AND t.status != 'done'").get(req.userId).c;
      const weeklyCompletion = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND completed_at >= datetime('now', '-7 days')").get(req.userId).c;
      const result = await aiService.cognitiveLoad(req.userId, { activeTasks, overdueTasks, dueSoon, highPriority, activeAreas: areaCount, weeklyCompletionRate: weeklyCompletion });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/daily-highlight', async (req, res) => {
    try {
      const today = toDateStr();
      const completed = db.prepare("SELECT title FROM tasks WHERE user_id = ? AND completed_at >= ? LIMIT 10").all(req.userId, today);
      const focusMin = db.prepare("SELECT COALESCE(SUM(duration_sec), 0) / 60 as m FROM focus_sessions WHERE user_id = ? AND started_at >= ?").get(req.userId, today).m;
      const habitsLogged = db.prepare("SELECT h.name FROM habits h JOIN habit_logs hl ON hl.habit_id = h.id WHERE h.user_id = ? AND hl.date = ?").all(req.userId, today);
      const result = await aiService.dailyHighlight(req.userId, { completed: completed.map(t => t.title), focusMinutes: focusMin, habitsLogged: habitsLogged.map(h => h.name), date: today });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/accountability-check', async (req, res) => {
    try {
      const today = toDateStr();
      const planned = db.prepare("SELECT id, title, status, priority FROM tasks WHERE user_id = ? AND (due_date = ? OR my_day = 1) AND status != 'done'").all(req.userId, today);
      const completed = db.prepare("SELECT id, title FROM tasks WHERE user_id = ? AND completed_at >= ?").all(req.userId, today);
      const result = await aiService.accountabilityCheck(req.userId, planned, completed, { timeOfDay: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/accept', (req, res) => {
    const { feature } = req.body;
    if (!feature) return res.status(400).json({ error: 'feature is required' });
    aiService.markAccepted(req.userId, feature);
    res.json({ ok: true });
  });

  // ─── Phase 4: Advanced ───

  router.post('/api/ai/habit-coach', async (req, res) => {
    try {
      const { habit_id } = req.body;
      if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });
      const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(habit_id, req.userId);
      if (!habit) return res.status(404).json({ error: 'Habit not found' });
      const existingHabits = db.prepare('SELECT name, preferred_time, frequency FROM habits WHERE user_id = ? AND archived = 0 AND id != ?').all(req.userId, habit_id);
      const result = await aiService.habitCoach(req.userId, habit, { existingHabits });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/life-balance', async (req, res) => {
    try {
      const areas = db.prepare('SELECT a.id, a.name FROM life_areas a WHERE a.user_id = ? AND a.archived = 0').all(req.userId);
      const areaData = areas.map(a => {
        const taskCount = db.prepare("SELECT COUNT(*) as c FROM tasks t JOIN goals g ON t.goal_id = g.id WHERE g.area_id = ? AND t.user_id = ? AND t.completed_at >= datetime('now', '-30 days')").get(a.id, req.userId).c;
        const focusMin = db.prepare("SELECT COALESCE(SUM(f.duration_sec), 0) / 60 as m FROM focus_sessions f JOIN tasks t ON f.task_id = t.id JOIN goals g ON t.goal_id = g.id WHERE g.area_id = ? AND f.user_id = ?").get(a.id, req.userId).m;
        const lastActivity = db.prepare("SELECT MAX(t.completed_at) as d FROM tasks t JOIN goals g ON t.goal_id = g.id WHERE g.area_id = ? AND t.user_id = ?").get(a.id, req.userId).d;
        return { name: a.name, tasksCompleted30d: taskCount, focusMinutes: focusMin, lastActivity };
      });
      const result = await aiService.lifeBalance(req.userId, areaData);
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/build-automation', async (req, res) => {
    try {
      const { description } = req.body;
      if (!description || typeof description !== 'string') return res.status(400).json({ error: 'description is required' });
      if (description.length > 500) return res.status(400).json({ error: 'Description too long' });
      const result = await aiService.buildAutomation(req.userId, description, {
        triggerTypes: ['task.created', 'task.completed', 'task.updated', 'goal.completed', 'habit.logged', 'focus.completed', 'schedule.daily', 'schedule.weekly', 'schedule.monthly'],
        actionTypes: ['update_task', 'create_task', 'create_subtasks', 'send_notification', 'move_to_goal', 'add_tag', 'remove_tag', 'set_priority', 'set_status', 'add_to_my_day', 'log_habit'],
      });
      res.json(result);
    } catch (err) { aiError(res, err); }
  });

  router.post('/api/ai/semantic-search', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query is required' });
      // Try embedding-based search first
      let embedding;
      try { embedding = await aiService.generateEmbedding(req.userId, query); } catch { embedding = null; }
      if (embedding && embedding.length > 0) {
        const rows = db.prepare('SELECT entity_type, entity_id, embedding FROM embeddings WHERE user_id = ?').all(req.userId);
        if (rows.length) {
          // Cosine similarity
          const results = rows.map(r => {
            const stored = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.length / 4);
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < Math.min(embedding.length, stored.length); i++) {
              dot += embedding[i] * stored[i];
              normA += embedding[i] ** 2;
              normB += stored[i] ** 2;
            }
            const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
            return { type: r.entity_type, id: r.entity_id, similarity };
          }).filter(r => r.similarity > 0.3).sort((a, b) => b.similarity - a.similarity).slice(0, 20);
          if (results.length) return res.json({ method: 'semantic', results });
        }
      }
      // Fallback to FTS5
      const cleaned = query.replace(/[^\w\s]/g, '').trim();
      let fts = [];
      if (cleaned) {
        try { fts = db.prepare("SELECT type, id, title, snippet(search_index, 3, '<mark>', '</mark>', '...', 30) as snippet, rank FROM search_index WHERE search_index MATCH ? AND user_id = ? ORDER BY rank LIMIT 20").all(cleaned, req.userId); } catch { fts = []; }
      }
      res.json({ method: 'fts', results: fts });
    } catch (err) { aiError(res, err); }
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
