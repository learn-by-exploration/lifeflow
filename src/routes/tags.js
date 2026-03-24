const { Router } = require('express');
module.exports = function(deps) {
  const { db, rebuildSearchIndex, getNextPosition } = deps;
  const router = Router();

// ─── Tags ───
router.get('/api/tags', (req, res) => {
  res.json(db.prepare('SELECT * FROM tags WHERE user_id=? ORDER BY name').all(req.userId));
});
router.post('/api/tags', (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '');
  const existing = db.prepare('SELECT * FROM tags WHERE name=? AND user_id=?').get(clean, req.userId);
  if (existing) return res.json(existing);
  const r = db.prepare('INSERT INTO tags (name,color,user_id) VALUES (?,?,?)').run(clean, color || '#64748B', req.userId);
  res.status(201).json(db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?').get(r.lastInsertRowid, req.userId));
});

// CRITICAL: /api/tags/stats MUST come before /api/tags/:id
router.get('/api/tags/stats', (req, res) => {
  const tags = db.prepare(`
    SELECT t.*, COUNT(tt.task_id) as usage_count
    FROM tags t LEFT JOIN task_tags tt ON t.id=tt.tag_id
    WHERE t.user_id=?
    GROUP BY t.id ORDER BY t.name
  `).all(req.userId);
  res.json(tags);
});

// ─── Tag Management ───
router.put('/api/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { name, color } = req.body;
  const tag = db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?').get(id, req.userId);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  if (name !== undefined) {
    const clean = String(name).trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '');
    if (!clean) return res.status(400).json({ error: 'Name required' });
    const dup = db.prepare('SELECT * FROM tags WHERE name=? AND id!=? AND user_id=?').get(clean, id, req.userId);
    if (dup) return res.status(409).json({ error: 'Tag name already exists' });
    db.prepare('UPDATE tags SET name=? WHERE id=?').run(clean, id);
  }
  if (color !== undefined) {
    db.prepare('UPDATE tags SET color=? WHERE id=?').run(color, id);
  }
  res.json(db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?').get(id, req.userId));
});

router.delete('/api/tags/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM tags WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ ok: true });
});

// Set tags for a task (replace all)
router.put('/api/tasks/:id/tags', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const taskOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!taskOwner) return res.status(404).json({ error: 'Not found' });
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds array required' });
  db.prepare('DELETE FROM task_tags WHERE task_id=?').run(id);
  const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
  tagIds.forEach(tid => { if (Number.isInteger(tid)) ins.run(id, tid); });
  res.json({ ok: true, tags: deps.getTaskTags(id) });
});

// ─── Subtasks ───
router.get('/api/tasks/:taskId/subtasks', (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'Invalid ID' });
  const tOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(taskId, req.userId);
  if (!tOwner) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(taskId));
});
router.post('/api/tasks/:taskId/subtasks', (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'Invalid ID' });
  const tOwner2 = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(taskId, req.userId);
  if (!tOwner2) return res.status(404).json({ error: 'Not found' });
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const pos = getNextPosition('subtasks', 'task_id', taskId);
  const r = db.prepare('INSERT INTO subtasks (task_id,title,position) VALUES (?,?,?)').run(taskId, title.trim(), pos);
  res.status(201).json(db.prepare('SELECT * FROM subtasks WHERE id=?').get(r.lastInsertRowid));
});
// Subtask reorder (must be before :id route)
router.put('/api/subtasks/reorder', (req, res) => {
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
router.put('/api/subtasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, done, note } = req.body;
  db.prepare('UPDATE subtasks SET title=COALESCE(?,title),done=COALESCE(?,done),note=COALESCE(?,note) WHERE id=? AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id=subtasks.task_id AND tasks.user_id=?)').run(title||null, done!==undefined?(done?1:0):null, note!==undefined?note:null, id, req.userId);
  const s = db.prepare('SELECT s.* FROM subtasks s JOIN tasks t ON s.task_id=t.id WHERE s.id=? AND t.user_id=?').get(id, req.userId);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});
router.delete('/api/subtasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const sOwner = db.prepare('SELECT s.id FROM subtasks s JOIN tasks t ON s.task_id=t.id WHERE s.id=? AND t.user_id=?').get(id, req.userId);
  if (!sOwner) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM subtasks WHERE id=?').run(id);
  res.json({ ok: true });
});

  return router;
};
