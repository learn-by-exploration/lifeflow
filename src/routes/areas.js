const { Router } = require('express');
const { validate, isValidColor } = require('../middleware/validate');
const { createArea, updateArea, createGoal, updateGoal, createMilestone, updateMilestone } = require('../schemas/areas.schema');
const { idParam } = require('../schemas/common.schema');
const AreasRepository = require('../repositories/areas.repository');
const AreasService = require('../services/areas.service');

module.exports = function(deps) {
  const { db, getNextPosition } = deps;
  const router = Router();

  const areasRepo = new AreasRepository(db);
  const areasSvc = new AreasService(areasRepo, deps);

// ─── Life Areas ───
router.get('/api/areas', (req, res) => {
  res.json(areasSvc.list(req.userId, req.query.include_archived === '1'));
});
router.post('/api/areas', validate(createArea), (req, res) => {
  res.status(201).json(areasSvc.create(req.userId, req.body));
});

// ─── Reorder areas (bulk) — MUST be before :id routes ───
router.put('/api/areas/reorder', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Array of {id, position} required' });
  areasSvc.reorder(items, req.userId);
  res.json({ reordered: items.length });
});

router.put('/api/areas/:id', validate(idParam, 'params'), validate(updateArea), (req, res) => {
  res.json(areasSvc.update(req.params.id, req.userId, req.body));
});

// ─── Archive / Unarchive area ───
router.put('/api/areas/:id/archive', validate(idParam, 'params'), (req, res) => {
  res.json(areasSvc.archive(req.params.id, req.userId));
});
router.put('/api/areas/:id/unarchive', validate(idParam, 'params'), (req, res) => {
  res.json(areasSvc.unarchive(req.params.id, req.userId));
});
router.delete('/api/areas/:id', validate(idParam, 'params'), (req, res) => {
  areasSvc.remove(req.params.id, req.userId);
  res.json({ ok: true });
});

// ─── Goals ───
router.get('/api/areas/:areaId/goals', (req, res) => {
  const areaId = Number(req.params.areaId);
  if (!Number.isInteger(areaId)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(areasSvc.listGoals(areaId, req.userId));
});
router.post('/api/areas/:areaId/goals', (req, res) => {
  const areaId = Number(req.params.areaId);
  if (!Number.isInteger(areaId)) return res.status(400).json({ error: 'Invalid ID' });
  const { title, description, color, due_date } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title required' });
  if (title.trim().length > 200) return res.status(400).json({ error: 'Title too long (max 200 characters)' });
  if (description && description.length > 2000) return res.status(400).json({ error: 'Description too long (max 2000 characters)' });
  if (color && !isValidColor(color)) return res.status(400).json({ error: 'Invalid hex color' });
  res.status(201).json(areasSvc.createGoal(areaId, req.userId, { title: title.trim(), description: description || '', color: color || '#6C63FF', due_date: due_date || null }));
});
router.put('/api/goals/:id', validate(idParam, 'params'), (req, res) => {
  res.json(areasSvc.updateGoal(req.params.id, req.userId, req.body));
});
router.delete('/api/goals/:id', validate(idParam, 'params'), (req, res) => {
  areasSvc.removeGoal(req.params.id, req.userId);
  res.json({ ok: true });
});

// ─── All Goals (for quick capture) ───
router.get('/api/goals', (req, res) => {
  res.json(areasSvc.allGoals(req.userId, req.query));
});

// ─── GOAL MILESTONES API ───
router.get('/api/goals/:id/milestones', validate(idParam, 'params'), (req, res) => {
  res.json(areasSvc.listMilestones(req.params.id, req.userId));
});
router.post('/api/goals/:id/milestones', validate(idParam, 'params'), validate(createMilestone), (req, res) => {
  res.status(201).json(areasSvc.createMilestone(req.params.id, req.userId, req.body.title));
});
router.put('/api/milestones/:id', validate(idParam, 'params'), (req, res) => {
  const { title, done } = req.body;
  res.json(areasSvc.updateMilestone(req.params.id, req.userId, { title, done }));
});
router.delete('/api/milestones/:id', validate(idParam, 'params'), (req, res) => {
  areasSvc.removeMilestone(req.params.id, req.userId);
  res.json({ ok: true });
});

// ─── GOAL PROGRESS (enhanced) ───
router.get('/api/goals/:id/progress', validate(idParam, 'params'), (req, res) => {
  const { goal, total, done, milestones } = areasSvc.goalProgress(req.params.id, req.userId);
  // Velocity: completions per week over last 4 weeks
  const velocity = db.prepare(`
    SELECT strftime('%Y-W%W', completed_at) as week, COUNT(*) as count
    FROM tasks WHERE goal_id=? AND status='done' AND completed_at >= date('now','-28 days')
    GROUP BY week ORDER BY week
  `).all(req.params.id);
  res.json({ goal, total, done, pct: total ? Math.round(done / total * 100) : 0, milestones, velocity });
});

  return router;
};
