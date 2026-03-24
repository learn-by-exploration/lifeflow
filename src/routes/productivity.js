const { Router } = require('express');
module.exports = function(deps) {
  const { db, getNextPosition } = deps;
  const router = Router();

// ─── AUTOMATION RULES ENGINE ───
router.get('/api/rules', (req, res) => {
  res.json(db.prepare('SELECT * FROM automation_rules ORDER BY created_at DESC').all());
});
router.post('/api/rules', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!name || !trigger_type || !action_type) return res.status(400).json({ error: 'name, trigger_type, action_type required' });
  const r = db.prepare('INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config) VALUES (?,?,?,?,?)').run(
    name.trim(), trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {})
  );
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/rules/:id', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM automation_rules WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, trigger_type, trigger_config, action_type, action_config, enabled } = req.body;
  db.prepare('UPDATE automation_rules SET name=COALESCE(?,name), trigger_type=COALESCE(?,trigger_type), trigger_config=COALESCE(?,trigger_config), action_type=COALESCE(?,action_type), action_config=COALESCE(?,action_config), enabled=COALESCE(?,enabled) WHERE id=?').run(
    name || null, trigger_type || null, trigger_config ? JSON.stringify(trigger_config) : null, action_type || null, action_config ? JSON.stringify(action_config) : null, enabled !== undefined ? (enabled ? 1 : 0) : null, id
  );
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(id));
});
router.delete('/api/rules/:id', (req, res) => {
  db.prepare('DELETE FROM automation_rules WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─── INBOX API ───
router.get('/api/inbox', (req, res) => {
  res.json(db.prepare('SELECT * FROM inbox ORDER BY created_at DESC').all());
});
router.post('/api/inbox', (req, res) => {
  const { title, note, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO inbox (title, note, priority) VALUES (?,?,?)').run(title.trim(), note || '', priority || 0);
  res.status(201).json(db.prepare('SELECT * FROM inbox WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/inbox/:id', (req, res) => {
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
router.delete('/api/inbox/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM inbox WHERE id=?').run(id);
  res.json({ ok: true });
});
// Triage: move inbox item to a goal as a task
router.post('/api/inbox/:id/triage', (req, res) => {
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

// ─── NOTES API ───
router.get('/api/notes', (req, res) => {
  const { goal_id } = req.query;
  if (goal_id) {
    res.json(db.prepare('SELECT * FROM notes WHERE goal_id=? ORDER BY updated_at DESC').all(Number(goal_id)));
  } else {
    res.json(db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all());
  }
});
router.get('/api/notes/:id', (req, res) => {
  const n = db.prepare('SELECT * FROM notes WHERE id=?').get(Number(req.params.id));
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json(n);
});
router.post('/api/notes', (req, res) => {
  const { title, content, goal_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO notes (title, content, goal_id) VALUES (?,?,?)').run(title.trim(), content || '', goal_id || null);
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM notes WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, content, goal_id } = req.body;
  db.prepare('UPDATE notes SET title=COALESCE(?,title), content=COALESCE(?,content), goal_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
    title || null, content !== undefined ? content : null, goal_id !== undefined ? goal_id : ex.goal_id, id
  );
  res.json(db.prepare('SELECT * FROM notes WHERE id=?').get(id));
});
router.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ─── WEEKLY REVIEW API ───
router.get('/api/reviews', (req, res) => {
  res.json(db.prepare('SELECT * FROM weekly_reviews ORDER BY week_start DESC').all());
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
    WHERE t.status='done' AND t.completed_at >= ? AND t.completed_at < ? ORDER BY t.completed_at DESC`).all(weekStart, weekEndStr);
  const created = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE created_at >= ? AND created_at < ?`).get(weekStart, weekEndStr);
  const overdue = db.prepare(`SELECT t.*, g.title as goal_title FROM tasks t LEFT JOIN goals g ON t.goal_id=g.id 
    WHERE t.status!='done' AND t.due_date < ? ORDER BY t.due_date`).all(weekStart);
  const streakRow = db.prepare(`SELECT COUNT(DISTINCT date(completed_at)) as days FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ?`).get(weekStart, weekEndStr);
  // Area check-in: tasks per area this week
  const areaStats = db.prepare(`SELECT a.id, a.name, a.icon, a.color,
    COUNT(CASE WHEN t.status='done' AND t.completed_at >= ? AND t.completed_at < ? THEN 1 END) as completed,
    COUNT(CASE WHEN t.status!='done' THEN 1 END) as pending
    FROM life_areas a LEFT JOIN goals g ON g.area_id=a.id LEFT JOIN tasks t ON t.goal_id=g.id
    WHERE a.archived=0 GROUP BY a.id ORDER BY a.position`).all(weekStart, weekEndStr);
  // Inbox count
  const inboxCount = db.prepare(`SELECT COUNT(*) as c FROM inbox`).get().c;
  // Check for existing review
  const existing = db.prepare('SELECT * FROM weekly_reviews WHERE week_start=?').get(weekStart);
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
  const completed = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ?`).get(week_start, weekEndStr);
  const created = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE created_at >= ? AND created_at < ?`).get(week_start, weekEndStr);
  // Upsert
  const existing = db.prepare('SELECT id FROM weekly_reviews WHERE week_start=?').get(week_start);
  if (existing) {
    db.prepare('UPDATE weekly_reviews SET tasks_completed=?, tasks_created=?, top_accomplishments=?, reflection=?, next_week_priorities=?, rating=? WHERE id=?').run(
      completed.c, created.c, JSON.stringify(top_accomplishments || []), reflection || '', JSON.stringify(next_week_priorities || []), ratingVal, existing.id
    );
    res.json(db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(existing.id));
  } else {
    const r = db.prepare('INSERT INTO weekly_reviews (week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities, rating) VALUES (?,?,?,?,?,?,?)').run(
      week_start, completed.c, created.c, JSON.stringify(top_accomplishments || []), reflection || '', JSON.stringify(next_week_priorities || []), ratingVal
    );
    res.status(201).json(db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(r.lastInsertRowid));
  }
});
router.delete('/api/reviews/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM weekly_reviews WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Review not found' });
  db.prepare('DELETE FROM weekly_reviews WHERE id=?').run(id);
  res.json({ ok: true });
});

  return router;
};
