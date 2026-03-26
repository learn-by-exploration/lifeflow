const { Router } = require('express');
module.exports = function(deps) {
  const { db, getNextPosition } = deps;
  const router = Router();

const VALID_TRIGGER_TYPES = ['task_completed','task_created','task_overdue','task_updated'];
const VALID_ACTION_TYPES  = ['add_tag','set_priority','move_to_goal','send_notification','add_to_myday','create_followup'];

// ─── AUTOMATION RULES ENGINE ───
router.get('/api/rules', (req, res) => {
  res.json(db.prepare('SELECT * FROM automation_rules WHERE user_id=? ORDER BY created_at DESC').all(req.userId));
});
router.post('/api/rules', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'name max 100 characters' });
  if (!trigger_type || !VALID_TRIGGER_TYPES.includes(trigger_type)) return res.status(400).json({ error: 'invalid trigger_type' });
  if (!action_type || !VALID_ACTION_TYPES.includes(action_type)) return res.status(400).json({ error: 'invalid action_type' });
  const r = db.prepare('INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, user_id) VALUES (?,?,?,?,?,?)').run(
    name.trim(), trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {}), req.userId
  );
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/rules/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM automation_rules WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, trigger_type, trigger_config, action_type, action_config, enabled } = req.body;
  if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: 'name cannot be empty' });
  if (name !== undefined && name.trim().length > 100) return res.status(400).json({ error: 'name max 100 characters' });
  if (trigger_type !== undefined && !VALID_TRIGGER_TYPES.includes(trigger_type)) return res.status(400).json({ error: 'invalid trigger_type' });
  if (action_type !== undefined && !VALID_ACTION_TYPES.includes(action_type)) return res.status(400).json({ error: 'invalid action_type' });
  db.prepare('UPDATE automation_rules SET name=COALESCE(?,name), trigger_type=COALESCE(?,trigger_type), trigger_config=COALESCE(?,trigger_config), action_type=COALESCE(?,action_type), action_config=COALESCE(?,action_config), enabled=COALESCE(?,enabled) WHERE id=? AND user_id=?').run(
    name ? name.trim() : null, trigger_type || null, trigger_config ? JSON.stringify(trigger_config) : null, action_type || null, action_config ? JSON.stringify(action_config) : null, enabled !== undefined ? (enabled ? 1 : 0) : null, id, req.userId
  );
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id=? AND user_id=?').get(id, req.userId));
});
router.delete('/api/rules/:id', (req, res) => {
  db.prepare('DELETE FROM automation_rules WHERE id=? AND user_id=?').run(Number(req.params.id), req.userId);
  res.json({ ok: true });
});

// ─── INBOX API ───
router.get('/api/inbox', (req, res) => {
  res.json(db.prepare('SELECT * FROM inbox WHERE user_id=? ORDER BY created_at DESC').all(req.userId));
});
router.post('/api/inbox', (req, res) => {
  const { title, note, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO inbox (title, note, priority, user_id) VALUES (?,?,?,?)').run(title.trim(), note || '', priority || 0, req.userId);
  res.status(201).json(db.prepare('SELECT * FROM inbox WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/inbox/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM inbox WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, note, priority } = req.body;
  if (priority !== undefined && (priority < 0 || priority > 3 || !Number.isInteger(Number(priority)))) return res.status(400).json({ error: 'priority must be 0-3' });
  db.prepare('UPDATE inbox SET title=COALESCE(?,title), note=COALESCE(?,note), priority=COALESCE(?,priority) WHERE id=? AND user_id=?').run(
    title || null, note !== undefined ? note : null, priority !== undefined ? Number(priority) : null, id, req.userId
  );
  res.json(db.prepare('SELECT * FROM inbox WHERE id=? AND user_id=?').get(id, req.userId));
});
router.delete('/api/inbox/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM inbox WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ ok: true });
});
// Triage: move inbox item to a goal as a task
router.post('/api/inbox/:id/triage', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM inbox WHERE id=? AND user_id=?').get(id, req.userId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { goal_id, due_date, priority } = req.body;
  if (!goal_id || !Number.isInteger(Number(goal_id))) return res.status(400).json({ error: 'goal_id required' });
  const gid = Number(goal_id);
  const goalOwned = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(gid, req.userId);
  if (!goalOwned) return res.status(403).json({ error: 'Goal not found or not owned by you' });
  const pos = getNextPosition('tasks', 'goal_id', gid);
  const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,position,user_id) VALUES (?,?,?,?,?,?,?)').run(
    gid, item.title, item.note, priority !== undefined ? priority : item.priority, due_date || null, pos, req.userId
  );
  db.prepare('DELETE FROM inbox WHERE id=? AND user_id=?').run(id, req.userId);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid));
});

// ─── NOTES API ───
router.get('/api/notes', (req, res) => {
  const { goal_id } = req.query;
  if (goal_id) {
    res.json(db.prepare('SELECT * FROM notes WHERE goal_id=? AND user_id=? ORDER BY updated_at DESC').all(Number(goal_id), req.userId));
  } else {
    res.json(db.prepare('SELECT * FROM notes WHERE user_id=? ORDER BY updated_at DESC').all(req.userId));
  }
});
router.get('/api/notes/:id', (req, res) => {
  const n = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(Number(req.params.id), req.userId);
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json(n);
});
router.post('/api/notes', (req, res) => {
  const { title, content, goal_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO notes (title, content, goal_id, user_id) VALUES (?,?,?,?)').run(title.trim(), content || '', goal_id || null, req.userId);
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, content, goal_id } = req.body;
  if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'title cannot be empty' });
  db.prepare('UPDATE notes SET title=COALESCE(?,title), content=COALESCE(?,content), goal_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(
    title ? title.trim() : null, content !== undefined ? content : null, goal_id !== undefined ? goal_id : ex.goal_id, id, req.userId
  );
  res.json(db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(id, req.userId));
});
router.delete('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ ok: true });
});

// ─── WEEKLY REVIEW API ───
router.get('/api/reviews', (req, res) => {
  res.json(db.prepare('SELECT * FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC').all(req.userId));
});
router.get('/api/reviews/current', (req, res) => {
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
    WHERE t.status='done' AND t.completed_at >= ? AND t.completed_at < ? AND t.user_id=? ORDER BY t.completed_at DESC`).all(weekStart, weekEndStr, req.userId);
  const created = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE created_at >= ? AND created_at < ? AND user_id=?`).get(weekStart, weekEndStr, req.userId);
  const overdue = db.prepare(`SELECT t.*, g.title as goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id=g.id 
    WHERE t.status!='done' AND t.due_date < ? AND t.user_id=? ORDER BY t.due_date`).all(weekStart, req.userId);
  const streakRow = db.prepare(`SELECT COUNT(DISTINCT date(completed_at)) as days FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ? AND user_id=?`).get(weekStart, weekEndStr, req.userId);
  // Area check-in: tasks per area this week
  const areaStats = db.prepare(`SELECT a.id, a.name, a.icon, a.color,
    COUNT(CASE WHEN t.status='done' AND t.completed_at >= ? AND t.completed_at < ? THEN 1 END) as completed,
    COUNT(CASE WHEN t.status!='done' THEN 1 END) as pending
    FROM life_areas a LEFT JOIN goals g ON g.area_id=a.id LEFT JOIN tasks t ON t.goal_id=g.id
    WHERE a.archived=0 AND a.user_id=? GROUP BY a.id ORDER BY a.position`).all(weekStart, weekEndStr, req.userId);
  // Inbox count
  const inboxCount = db.prepare(`SELECT COUNT(*) as c FROM inbox WHERE user_id=?`).get(req.userId).c;
  // Check for existing review
  const existing = db.prepare('SELECT * FROM weekly_reviews WHERE week_start=? AND user_id=?').get(weekStart, req.userId);
  res.json({
    weekStart, weekEnd: weekEndStr,
    completedTasks: completed,
    tasksCompletedCount: completed.length,
    tasksCreatedCount: created.count,
    overdueTasks: overdue,
    activeDays: streakRow.days,
    areaStats,
    inboxCount,
    existingReview: existing || null
  });
});
router.post('/api/reviews', (req, res) => {
  const { week_start, top_accomplishments, reflection, next_week_priorities, rating } = req.body;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  const ratingVal = rating != null ? Math.min(5, Math.max(1, Number(rating))) : null;
  // Compute stats
  const weekEnd = new Date(week_start);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const completed = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ? AND user_id=?`).get(week_start, weekEndStr, req.userId);
  const created = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE created_at >= ? AND created_at < ? AND user_id=?`).get(week_start, weekEndStr, req.userId);
  // Upsert
  const existing = db.prepare('SELECT id FROM weekly_reviews WHERE week_start=? AND user_id=?').get(week_start, req.userId);
  if (existing) {
    db.prepare('UPDATE weekly_reviews SET tasks_completed=?, tasks_created=?, top_accomplishments=?, reflection=?, next_week_priorities=?, rating=? WHERE id=? AND user_id=?').run(
      completed.c, created.c, JSON.stringify(top_accomplishments || []), reflection || '', JSON.stringify(next_week_priorities || []), ratingVal, existing.id, req.userId
    );
    res.json(db.prepare('SELECT * FROM weekly_reviews WHERE id=? AND user_id=?').get(existing.id, req.userId));
  } else {
    const r = db.prepare('INSERT INTO weekly_reviews (week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities, rating, user_id) VALUES (?,?,?,?,?,?,?,?)').run(
      week_start, completed.c, created.c, JSON.stringify(top_accomplishments || []), reflection || '', JSON.stringify(next_week_priorities || []), ratingVal, req.userId
    );
    res.status(201).json(db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(r.lastInsertRowid));
  }
});
router.delete('/api/reviews/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM weekly_reviews WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Review not found' });
  db.prepare('DELETE FROM weekly_reviews WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ ok: true });
});

  return router;
};
