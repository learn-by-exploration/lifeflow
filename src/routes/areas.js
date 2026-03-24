const { Router } = require('express');
module.exports = function(deps) {
  const { db, getNextPosition } = deps;
  const router = Router();

// ─── Life Areas ───
router.get('/api/areas', (req, res) => {
  const includeArchived = req.query.include_archived === '1';
  const where = includeArchived ? '' : 'WHERE a.archived=0';
  res.json(db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM goals g WHERE g.area_id=a.id) as goal_count,
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status!='done') as pending_tasks,
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status='done') as done_tasks
    FROM life_areas a ${where} ORDER BY a.position
  `).all());
});
router.post('/api/areas', (req, res) => {
  const { name, icon, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  const pos = getNextPosition('life_areas');
  const r = db.prepare('INSERT INTO life_areas (name,icon,color,position) VALUES (?,?,?,?)').run(name.trim(), icon||'📋', color||'#2563EB', pos);
  res.status(201).json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(r.lastInsertRowid));
});

// ─── Reorder areas (bulk) — MUST be before :id routes ───
router.put('/api/areas/reorder', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Array of {id, position} required' });
  for (const i of items) {
    if (!Number.isInteger(i.id) || !Number.isInteger(i.position) || i.position < 0) {
      return res.status(400).json({ error: 'Each item must have integer id and non-negative integer position' });
    }
  }
  const stmt = db.prepare('UPDATE life_areas SET position=? WHERE id=?');
  const tx = db.transaction(() => { items.forEach(i => stmt.run(i.position, i.id)); });
  tx();
  res.json({ reordered: items.length });
});

router.put('/api/areas/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM life_areas WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, icon, color, position } = req.body;
  if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: 'Name cannot be empty' });
  if (name && name.trim().length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  db.prepare('UPDATE life_areas SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),position=COALESCE(?,position) WHERE id=?').run(
    name ? name.trim() : null, icon||null, color||null, position!==undefined?position:null, id
  );
  res.json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(id));
});

// ─── Archive / Unarchive area ───
router.put('/api/areas/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM life_areas WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE life_areas SET archived=1 WHERE id=?').run(id);
  res.json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(id));
});
router.put('/api/areas/:id/unarchive', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM life_areas WHERE id=?').get(id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE life_areas SET archived=0 WHERE id=?').run(id);
  res.json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(id));
});
router.delete('/api/areas/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM life_areas WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── Goals ───
router.get('/api/areas/:areaId/goals', (req, res) => {
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
router.post('/api/areas/:areaId/goals', (req, res) => {
  const areaId = Number(req.params.areaId);
  if (!Number.isInteger(areaId)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, description, color, due_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const pos = getNextPosition('goals', 'area_id', areaId);
  const r = db.prepare('INSERT INTO goals (area_id,title,description,color,due_date,position) VALUES (?,?,?,?,?,?)').run(areaId,title.trim(),description||'',color||'#6C63FF',due_date||null,pos);
  res.status(201).json(db.prepare('SELECT * FROM goals WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/goals/:id', (req, res) => {
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
router.delete('/api/goals/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM goals WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── All Goals (for quick capture) ───
router.get('/api/goals', (req, res) => {
  res.json(db.prepare(`
    SELECT g.*, a.name as area_name, a.icon as area_icon
    FROM goals g JOIN life_areas a ON g.area_id=a.id
    WHERE g.status='active'
    ORDER BY a.position, g.position
  `).all());
});

// ─── GOAL MILESTONES API ───
router.get('/api/goals/:id/milestones', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(db.prepare('SELECT * FROM goal_milestones WHERE goal_id=? ORDER BY position').all(id));
});
router.post('/api/goals/:id/milestones', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const pos = getNextPosition('goal_milestones', 'goal_id', id);
  const r = db.prepare('INSERT INTO goal_milestones (goal_id, title, position) VALUES (?,?,?)').run(id, title.trim(), pos);
  res.status(201).json(db.prepare('SELECT * FROM goal_milestones WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/milestones/:id', (req, res) => {
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
router.delete('/api/milestones/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM goal_milestones WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── GOAL PROGRESS (enhanced) ───
router.get('/api/goals/:id/progress', (req, res) => {
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

  return router;
};
