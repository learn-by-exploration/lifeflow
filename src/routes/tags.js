const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createTag, updateTag, setTaskTags } = require('../schemas/tags.schema');
const { idParam } = require('../schemas/common.schema');
const TagsRepository = require('../repositories/tags.repository');
const TagsService = require('../services/tags.service');

module.exports = function(deps) {
  const { db, getNextPosition } = deps;
  const router = Router();

  const tagsRepo = new TagsRepository(db);
  const tagsSvc = new TagsService(tagsRepo, deps);

// ─── Tags ───
router.get('/api/tags', (req, res) => {
  res.json(tagsSvc.list(req.userId));
});
router.post('/api/tags', validate(createTag), (req, res) => {
  const { tag, created } = tagsSvc.create(req.userId, req.body);
  res.status(created ? 201 : 200).json(tag);
});

// CRITICAL: /api/tags/stats MUST come before /api/tags/:id
router.get('/api/tags/stats', (req, res) => {
  res.json(tagsSvc.stats(req.userId));
});

// ─── Tag Management ───
router.put('/api/tags/:id', validate(idParam, 'params'), validate(updateTag), (req, res) => {
  const tag = tagsSvc.update(req.params.id, req.userId, req.body);
  res.json(tag);
});

router.delete('/api/tags/:id', validate(idParam, 'params'), (req, res) => {
  tagsSvc.remove(req.params.id, req.userId);
  res.json({ ok: true });
});

// Set tags for a task (replace all)
router.put('/api/tasks/:id/tags', validate(idParam, 'params'), validate(setTaskTags), (req, res) => {
  const tags = tagsSvc.setTaskTags(req.params.id, req.userId, req.body.tagIds);
  res.json({ ok: true, tags });
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
  const { title, note, done, parent_id } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  // Validate parent_id for nesting (max 3 levels)
  if (parent_id !== undefined && parent_id !== null) {
    const pid = Number(parent_id);
    if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
    const parent = db.prepare('SELECT id, parent_id FROM subtasks WHERE id=? AND task_id=?').get(pid, taskId);
    if (!parent) return res.status(400).json({ error: 'Parent subtask not found' });
    // Check depth: parent's parent must not have a parent (max 3 levels)
    if (parent.parent_id) {
      const grandparent = db.prepare('SELECT parent_id FROM subtasks WHERE id=?').get(parent.parent_id);
      if (grandparent && grandparent.parent_id) return res.status(400).json({ error: 'Max 3 levels of nesting' });
    }
  }
  const pos = getNextPosition('subtasks', 'task_id', taskId);
  const r = db.prepare('INSERT INTO subtasks (task_id,title,note,done,position,parent_id) VALUES (?,?,?,?,?,?)').run(taskId, title.trim(), note || '', done ? 1 : 0, pos, parent_id || null);
  res.status(201).json(db.prepare('SELECT * FROM subtasks WHERE id=?').get(r.lastInsertRowid));
});
// Subtask reorder (must be before :id route)
router.put('/api/subtasks/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const upd = db.prepare('UPDATE subtasks SET position=? WHERE id=? AND task_id IN (SELECT id FROM tasks WHERE user_id=?)');
  const tx = db.transaction(() => {
    items.forEach(({ id, position }) => {
      if (Number.isInteger(id) && Number.isInteger(position)) upd.run(position, id, req.userId);
    });
  });
  tx();
  res.json({ ok: true });
});
router.put('/api/subtasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, done, note, parent_id } = req.body;
  if (parent_id !== undefined) {
    if (parent_id !== null) {
      const pid = Number(parent_id);
      if (pid === id) return res.status(400).json({ error: 'Cannot be own parent' });
    }
  }
  db.prepare('UPDATE subtasks SET title=COALESCE(?,title),done=COALESCE(?,done),note=COALESCE(?,note),parent_id=COALESCE(?,parent_id) WHERE id=? AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id=subtasks.task_id AND tasks.user_id=?)').run(title||null, done!==undefined?(done?1:0):null, note!==undefined?note:null, parent_id!==undefined?parent_id:null, id, req.userId);
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
