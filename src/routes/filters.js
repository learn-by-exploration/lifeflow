const { Router } = require('express');
module.exports = function(deps) {
  const { db, enrichTasks, getNextPosition } = deps;
  const router = Router();

// ─── SMART FILTERS: Extended execute + counts + smart lists ───
router.get('/api/filters/counts', (req, res) => {
  const filters = db.prepare('SELECT * FROM saved_filters WHERE user_id=? ORDER BY position').all(req.userId);
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
    const c = db.prepare(`SELECT COUNT(DISTINCT t.id) as c FROM tasks t LEFT JOIN goals g ON t.goal_id=g.id LEFT JOIN life_areas a ON g.area_id=a.id ${where} AND t.user_id=?`).get(...pa, req.userId);
    return { id: f.id, count: c.c };
  });
  res.json(counts);
});

// Execute a saved filter (or ad-hoc filter params)
router.get('/api/filters/execute', (req, res) => {
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
  whereParts.push('t.user_id=?'); params.push(req.userId);
  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  res.json(enrichTasks(db.prepare(`
    SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    ${where}
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, t.priority DESC, t.due_date
    LIMIT 200
  `).all(...params)));
});

// Smart lists (built-in) — thresholds from settings
router.get('/api/filters/smart/:type', (req, res) => {
  const type = req.params.type;
  const staleDays = Number(db.prepare("SELECT value FROM settings WHERE key='smartFilterStale' AND user_id=?").get(req.userId)?.value) || 7;
  const qwMin = Number(db.prepare("SELECT value FROM settings WHERE key='smartFilterQuickWin' AND user_id=?").get(req.userId)?.value) || 15;
  let sql, params = [];
  if (type === 'stale') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - staleDays);
    const cutoffStr = cutoff.toISOString();
    sql = `SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.status!='done' AND t.created_at <= ? AND t.completed_at IS NULL AND t.user_id=?
      ORDER BY t.created_at ASC LIMIT 100`;
    params = [cutoffStr, req.userId];
  } else if (type === 'quickwins') {
    sql = `SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.status!='done' AND t.estimated_minutes IS NOT NULL AND t.estimated_minutes<=?
      AND NOT EXISTS (SELECT 1 FROM task_deps td JOIN tasks bt ON td.blocked_by_id=bt.id WHERE td.task_id=t.id AND bt.status!='done')
      AND t.user_id=?
      ORDER BY t.estimated_minutes ASC, t.priority DESC LIMIT 100`;
    params = [qwMin, req.userId];
  } else if (type === 'blocked') {
    sql = `SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.status!='done'
      AND EXISTS (SELECT 1 FROM task_deps td JOIN tasks bt ON td.blocked_by_id=bt.id WHERE td.task_id=t.id AND bt.status!='done')
      AND t.user_id=?
      ORDER BY t.priority DESC LIMIT 100`;
    params = [req.userId];
  } else {
    return res.status(400).json({ error: 'Unknown smart filter type' });
  }
  res.json(enrichTasks(db.prepare(sql).all(...params)));
});

// ─── Saved Filters CRUD ───
router.get('/api/filters', (req, res) => {
  res.json(db.prepare('SELECT * FROM saved_filters WHERE user_id=? ORDER BY position').all(req.userId));
});
router.post('/api/filters', (req, res) => {
  const { name, icon, color, filters } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!filters || typeof filters !== 'object') return res.status(400).json({ error: 'Filters object required' });
  const pos = getNextPosition('saved_filters');
  const r = db.prepare('INSERT INTO saved_filters (name,icon,color,filters,position,user_id) VALUES (?,?,?,?,?,?)').run(
    name.trim(), icon || '🔍', color || '#2563EB', JSON.stringify(filters), pos, req.userId
  );
  res.status(201).json(db.prepare('SELECT * FROM saved_filters WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/filters/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM saved_filters WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, icon, color, filters } = req.body;
  db.prepare('UPDATE saved_filters SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),filters=COALESCE(?,filters) WHERE id=? AND user_id=?').run(
    name||null, icon||null, color||null, filters ? JSON.stringify(filters) : null, id, req.userId
  );
  res.json(db.prepare('SELECT * FROM saved_filters WHERE id=? AND user_id=?').get(id, req.userId));
});
router.delete('/api/filters/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM saved_filters WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ ok: true });
});

  return router;
};
