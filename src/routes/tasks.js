const { Router } = require('express');
const { isValidHHMM, isValidDate, isPositiveInt } = require('../middleware/validate');
const RecurringService = require('../services/recurring.service');
const { validateRecurring } = require('../schemas/tasks.schema');
const pushService = require('../services/push.service');
const logger = require('../logger');
module.exports = function(deps) {
  const { db, rebuildSearchIndex, enrichTask, enrichTasks, getNextPosition, nextDueDate, executeRules, verifyGoalOwnership } = deps;
  const router = Router();
  const recurringSvc = new RecurringService(db, deps);

// ─── Tasks ───
router.get('/api/goals/:goalId/tasks', (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'Invalid ID' });
  res.json(enrichTasks(db.prepare("SELECT * FROM tasks WHERE goal_id=? AND user_id=? ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, position").all(goalId, req.userId)));
});
router.get('/api/tasks/my-day', (req, res) => {
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE (t.my_day=1 OR t.due_date=date('now')) AND t.user_id=?
    ORDER BY t.priority DESC, t.position
  `).all(req.userId)));
});
router.get('/api/tasks/all', (req, res) => {
  if (req.query.limit !== undefined) {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 500);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const total = db.prepare('SELECT COUNT(*) as c FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id WHERE t.user_id=?').get(req.userId).c;
    const items = enrichTasks(db.prepare(`
      SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.user_id=? ORDER BY t.status, t.priority DESC, t.due_date LIMIT ? OFFSET ?
    `).all(req.userId, limit, offset));
    return res.json({ items, total, hasMore: offset + limit < total, offset });
  }
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.user_id=?
    ORDER BY t.status, t.priority DESC, t.due_date
  `).all(req.userId)));
});
router.get('/api/tasks/board', (req, res) => {
  const goalId = req.query.goal_id ? Number(req.query.goal_id) : null;
  const areaId = req.query.area_id ? Number(req.query.area_id) : null;
  const priority = req.query.priority !== undefined ? Number(req.query.priority) : null;
  const tagId = req.query.tag_id ? Number(req.query.tag_id) : null;
  const clauses = ['t.user_id=?'], params = [req.userId];
  if (goalId && Number.isInteger(goalId)) { clauses.push('t.goal_id=?'); params.push(goalId); }
  if (areaId && Number.isInteger(areaId)) { clauses.push('a.id=?'); params.push(areaId); }
  if (priority !== null && Number.isInteger(priority)) { clauses.push('t.priority=?'); params.push(priority); }
  if (tagId && Number.isInteger(tagId)) { clauses.push('t.id IN (SELECT task_id FROM task_tags WHERE tag_id=?)'); params.push(tagId); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.id as area_id
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    ${where} ORDER BY t.priority DESC, t.position
  `).all(...params)));
});
router.get('/api/tasks/calendar', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date BETWEEN ? AND ? AND t.user_id=? ORDER BY t.due_date, t.priority DESC
  `).all(start, end, req.userId)));
});
router.get('/api/tasks/timeline', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  const tasks = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.id as area_id
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date BETWEEN ? AND ? AND t.user_id=? ORDER BY t.due_date, t.priority DESC
  `).all(start, end, req.userId));
  // Add blocked_by arrays for dependency arrows (batched query)
  if (tasks.length > 0) {
    const placeholders = tasks.map(() => '?').join(',');
    const allDeps = db.prepare(
      `SELECT task_id, blocked_by_id FROM task_deps WHERE task_id IN (${placeholders})`
    ).all(...tasks.map(t => t.id));
    const depMap = new Map();
    for (const d of allDeps) {
      if (!depMap.has(d.task_id)) depMap.set(d.task_id, []);
      depMap.get(d.task_id).push(d.blocked_by_id);
    }
    for (const t of tasks) t.blocked_by = depMap.get(t.id) || [];
  }
  res.json({ tasks });
});
router.post('/api/goals/:goalId/tasks', (req, res) => {
  const goalId = Number(req.params.goalId);
  if (!Number.isInteger(goalId)) return res.status(400).json({ error: 'Invalid ID' });
  if (!db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(goalId, req.userId)) return res.status(404).json({ error: 'Goal not found' });
  const { title, note, priority, due_date, due_time, recurring, assigned_to, my_day, tagIds, time_block_start, time_block_end, estimated_minutes, list_id } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title required' });
  if (title.trim().length > 500) return res.status(400).json({ error: 'Title too long (max 500 characters)' });
  if (note !== undefined && note !== null && typeof note !== 'string') return res.status(400).json({ error: 'Note must be a string' });
  if (note && note.length > 5000) return res.status(400).json({ error: 'Note too long (max 5000 characters)' });
  if (due_date !== undefined && due_date !== null && !isValidDate(due_date)) return res.status(400).json({ error: 'Invalid due_date format (YYYY-MM-DD)' });
  if (!isValidHHMM(due_time)) return res.status(400).json({ error: 'Invalid due_time format (HH:MM)' });
  if (priority !== undefined && priority !== null && (typeof priority === 'boolean' || ![0,1,2,3].includes(Number(priority)))) return res.status(400).json({ error: 'Priority must be 0-3' });
  if (estimated_minutes !== undefined && estimated_minutes !== null && (typeof estimated_minutes !== 'number' || estimated_minutes < 0)) return res.status(400).json({ error: 'estimated_minutes must be a non-negative number' });
  if (time_block_start !== undefined && time_block_start !== null && !isValidHHMM(time_block_start)) return res.status(400).json({ error: 'Invalid time_block_start format (HH:MM)' });
  if (time_block_end !== undefined && time_block_end !== null && !isValidHHMM(time_block_end)) return res.status(400).json({ error: 'Invalid time_block_end format (HH:MM)' });
  if (list_id) { const lid = Number(list_id); if (!Number.isInteger(lid) || !db.prepare('SELECT id FROM lists WHERE id=? AND user_id=?').get(lid, req.userId)) return res.status(400).json({ error: 'Invalid list_id' }); }
  let validatedRecurring = null;
  if (recurring !== undefined && recurring !== null) {
    const rv = validateRecurring(recurring);
    if (!rv.valid) return res.status(400).json({ error: rv.error });
    validatedRecurring = rv.value;
  }
  const createTaskTx = db.transaction(() => {
    const pos = getNextPosition('tasks', 'goal_id', goalId);
    const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,due_time,recurring,assigned_to,my_day,position,time_block_start,time_block_end,estimated_minutes,list_id,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      goalId,title.trim(),note||'',priority||0,due_date||null,due_time||null,validatedRecurring,assigned_to||'',my_day?1:0,pos,time_block_start||null,time_block_end||null,estimated_minutes||null,list_id?Number(list_id):null,req.userId
    );
    const taskId = r.lastInsertRowid;
    if (Array.isArray(tagIds)) {
      const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
      tagIds.forEach(tid => { if (Number.isInteger(tid)) ins.run(taskId, tid); });
    }
    return taskId;
  });
  const taskId = createTaskTx();
  res.status(201).json(enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId)));
});
// ─── Task Reorder (must be before :id routes) ───
router.put('/api/tasks/reorder', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  const upd = db.prepare('UPDATE tasks SET position=?, due_date=COALESCE(?,due_date) WHERE id=? AND user_id=?');
  const tx = db.transaction(() => {
    items.forEach(({ id, position, due_date }) => {
      if (Number.isInteger(id) && Number.isInteger(position) && position >= 0) upd.run(position, due_date !== undefined ? due_date : null, id, req.userId);
    });
  });
  tx();
  res.json({ ok: true });
});

// ─── Search (before :id to avoid param capture) ───
router.get('/api/tasks/search', (req, res) => {
  const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const hasQ = q && typeof q === 'string' && q.trim();
  const hasFilters = req.query.area_id || req.query.goal_id || req.query.status;
  if (!hasQ && !hasFilters) return res.json([]);
  const whereParts = [], params = [];
  if (hasQ) {
    const term = '%' + q.trim() + '%';
    whereParts.push('(t.title LIKE ? OR t.note LIKE ? OR s.title LIKE ?)');
    params.push(term, term, term);
  }
  whereParts.push('t.user_id=?'); params.push(req.userId);
  if (req.query.area_id) { whereParts.push('a.id=?'); params.push(Number(req.query.area_id)); }
  if (req.query.goal_id) { whereParts.push('g.id=?'); params.push(Number(req.query.goal_id)); }
  if (req.query.status && ['todo','doing','done'].includes(req.query.status)) { whereParts.push('t.status=?'); params.push(req.query.status); }
  const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  res.json(enrichTasks(db.prepare(`
    SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    LEFT JOIN subtasks s ON s.task_id=t.id
    ${whereClause}
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, t.priority DESC
    LIMIT 50
  `).all(...params)));
});

// ─── Suggested tasks (before :id to avoid param capture) ───
router.get('/api/tasks/suggested', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status != 'done' AND t.my_day = 0 AND (t.due_date IS NULL OR t.due_date != ?) AND t.user_id=?
  `).all(today, req.userId));
  // Score each task
  const scored = tasks.map(t => {
    let score = 0;
    if (t.due_date && t.due_date < today) score += 50; // overdue
    if (t.due_date) {
      const days = Math.round((new Date(t.due_date) - new Date(today)) / 86400000);
      if (days >= 0 && days <= 3) score += 30; // due within 3 days
    }
    if (t.priority >= 2) score += 20; // high priority
    if (t.estimated_minutes && t.estimated_minutes <= 15) score += 5; // quick win
    return { ...t, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);
  res.json(scored.slice(0, 5).map(({ _score, ...t }) => t));
});

// ─── Overdue (before :id to avoid param capture) ───
router.get('/api/tasks/overdue', (req, res) => {
  res.json(enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.due_date < date('now') AND t.status != 'done' AND t.user_id=?
    ORDER BY t.due_date, t.priority DESC
  `).all(req.userId)));
});

// Recurring tasks list (before :id to avoid param capture)
router.get('/api/tasks/recurring', (req, res) => {
  if (req.query.limit !== undefined) {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 500);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const total = db.prepare(`SELECT COUNT(DISTINCT t.id) as c FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id WHERE t.recurring IS NOT NULL AND t.status!='done' AND t.user_id=?`).get(req.userId).c;
    const items = enrichTasks(db.prepare(`SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.recurring IS NOT NULL AND t.status!='done' AND t.user_id=?
      ORDER BY t.due_date LIMIT ? OFFSET ?`).all(req.userId, limit, offset));
    return res.json({ items, total, hasMore: offset + limit < total, offset });
  }
  const tasks = enrichTasks(db.prepare(`SELECT DISTINCT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.recurring IS NOT NULL AND t.status!='done' AND t.user_id=?
    ORDER BY t.due_date`).all(req.userId));
  res.json(tasks);
});

// Single task GET
router.get('/api/tasks/table', (req, res) => {
  const SORT_WHITELIST = ['title', 'due_date', 'priority', 'status', 'area', 'created_at'];
  const sortBy = SORT_WHITELIST.includes(req.query.sort_by) ? req.query.sort_by : 'due_date';
  const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
  const groupBy = ['area', 'goal', 'status', 'priority', 'none'].includes(req.query.group_by) ? req.query.group_by : 'none';
  const status = ['todo', 'doing', 'done'].includes(req.query.status) ? req.query.status : null;
  const areaId = req.query.area_id ? Number(req.query.area_id) : null;
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const clauses = ['t.user_id=?'], params = [req.userId];
  if (status) { clauses.push('t.status=?'); params.push(status); }
  if (areaId && Number.isInteger(areaId)) { clauses.push('a.id=?'); params.push(areaId); }
  const where = 'WHERE ' + clauses.join(' AND ');

  // Map sort_by to SQL column
  let orderCol;
  if (sortBy === 'area') orderCol = 'a.name';
  else if (sortBy === 'title') orderCol = 't.title';
  else orderCol = `t.${sortBy}`;

  // Nulls last for ASC, nulls first for DESC
  const nullsOrder = sortDir === 'ASC'
    ? `CASE WHEN ${orderCol} IS NULL THEN 1 ELSE 0 END, ${orderCol} ${sortDir}`
    : `CASE WHEN ${orderCol} IS NULL THEN 1 ELSE 0 END, ${orderCol} ${sortDir}`;

  const total = db.prepare(`SELECT COUNT(*) as c FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id ${where}`).get(...params).c;
  const tasks = enrichTasks(db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.id as area_id
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    ${where} ORDER BY ${nullsOrder} LIMIT ? OFFSET ?
  `).all(...params, limit, offset));

  let groups = [];
  if (groupBy !== 'none') {
    let groupCol, groupLabel;
    if (groupBy === 'area') { groupCol = 'a.id'; groupLabel = 'a.name'; }
    else if (groupBy === 'goal') { groupCol = 'g.id'; groupLabel = 'g.title'; }
    else if (groupBy === 'status') { groupCol = 't.status'; groupLabel = 't.status'; }
    else if (groupBy === 'priority') { groupCol = 't.priority'; groupLabel = 't.priority'; }
    groups = db.prepare(`
      SELECT ${groupLabel} as name, COUNT(*) as count
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      ${where} GROUP BY ${groupCol} ORDER BY count DESC
    `).all(...params);
  }

  res.json({ tasks, total, groups });
});

router.get('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid ID' });
  const t = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id WHERE t.id=? AND t.user_id=?
  `).get(id, req.userId);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(enrichTask(t));
});

// ─── BULK OPERATIONS (before :id to avoid param capture) ───
router.put('/api/tasks/bulk', (req, res) => {
  const { ids, changes } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'changes object required' });
  if (changes.status !== undefined && !['todo','doing','done'].includes(changes.status)) return res.status(400).json({ error: 'Invalid status' });
  if (changes.priority !== undefined && (typeof changes.priority === 'boolean' || ![0,1,2,3].includes(Number(changes.priority)))) return res.status(400).json({ error: 'Priority must be 0-3' });
  const bulkTx = db.transaction(() => {
    const results = [];
      const selectTask = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?');
    for (const rawId of ids) {
      const id = Number(rawId);
      if (!Number.isInteger(id)) continue;
      const ex = selectTask.get(id, req.userId);
      if (!ex) continue;
      const sets = [], vals = [];
      if (changes.priority !== undefined) { sets.push('priority=?'); vals.push(changes.priority); }
      if (changes.due_date !== undefined) { sets.push('due_date=?'); vals.push(changes.due_date); }
      if (changes.my_day !== undefined) { sets.push('my_day=?'); vals.push(changes.my_day ? 1 : 0); }
      if (changes.goal_id !== undefined) {
        if (!verifyGoalOwnership(Number(changes.goal_id), req.userId)) continue;
        sets.push('goal_id=?'); vals.push(changes.goal_id);
      }
      if (changes.status !== undefined) {
        sets.push('status=?'); vals.push(changes.status);
        if (changes.status === 'done' && ex.status !== 'done') {
          sets.push('completed_at=?'); vals.push(new Date().toISOString());
        }
      }
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...vals, req.userId);
      }
      if (changes.add_tag_id) {
        const tagId = Number(changes.add_tag_id);
        if (db.prepare('SELECT id FROM tags WHERE id=? AND user_id=?').get(tagId, req.userId)) {
          db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(id, tagId);
        }
      }
      if (changes.remove_tag_id) {
        db.prepare('DELETE FROM task_tags WHERE task_id=? AND tag_id=?').run(id, Number(changes.remove_tag_id));
      }
      results.push(id);
    }
    return results;
  });
  const results = bulkTx();
  res.json({ updated: results.length, ids: results });
});

// ─── BATCH OPERATIONS (PATCH — flexible updates + multi-tag) ───
router.patch('/api/tasks/batch', (req, res) => {
  const { ids, updates, add_tags } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  if (!updates && !add_tags) return res.status(400).json({ error: 'updates or add_tags required' });
  // Validate all IDs belong to user
  const selectTask = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?');
  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || !selectTask.get(id, req.userId)) {
      return res.status(400).json({ error: 'Task ' + rawId + ' not found or not owned by you' });
    }
  }
  const batchTx = db.transaction(() => {
    let count = 0;
    for (const rawId of ids) {
      const id = Number(rawId);
      if (updates && typeof updates === 'object') {
        const sets = [], vals = [];
        if (updates.priority !== undefined) { sets.push('priority=?'); vals.push(Number(updates.priority)); }
        if (updates.due_date !== undefined) { sets.push('due_date=?'); vals.push(updates.due_date || null); }
        if (updates.my_day !== undefined) { sets.push('my_day=?'); vals.push(updates.my_day ? 1 : 0); }
        if (updates.status !== undefined) {
          sets.push('status=?'); vals.push(updates.status);
          if (updates.status === 'done') { sets.push("completed_at=datetime('now')"); }
        }
        if (updates.goal_id !== undefined) {
          if (!verifyGoalOwnership(Number(updates.goal_id), req.userId)) continue;
          sets.push('goal_id=?'); vals.push(updates.goal_id);
        }
        if (sets.length) {
          vals.push(id, req.userId);
          db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id=? AND user_id=?`).run(...vals);
        }
      }
      if (Array.isArray(add_tags)) {
        for (const tagId of add_tags) {
          const tid = Number(tagId);
          if (db.prepare('SELECT id FROM tags WHERE id=? AND user_id=?').get(tid, req.userId)) {
            db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(id, tid);
          }
        }
      }
      count++;
    }
    return count;
  });
  const updated = batchTx();
  res.json({ updated });
});

router.put('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { title, note, status, priority, due_date, due_time, recurring, assigned_to, assigned_to_user_id, my_day, position, goal_id, time_block_start, time_block_end, estimated_minutes, actual_minutes, list_id } = req.body;
  if (status !== undefined && status !== null && !['todo','doing','done'].includes(status)) return res.status(400).json({ error: 'Invalid status (must be todo, doing, or done)' });
  if (priority !== undefined && priority !== null && (typeof priority === 'boolean' || ![0,1,2,3].includes(Number(priority)))) return res.status(400).json({ error: 'Priority must be 0-3' });
  if (title !== undefined && title !== null && (typeof title !== 'string' || !title.trim())) return res.status(400).json({ error: 'Title must be a non-empty string' });
  if (due_date !== undefined && due_date !== null && !isValidDate(due_date)) return res.status(400).json({ error: 'Invalid due_date format (YYYY-MM-DD)' });
  if (due_time !== undefined && !isValidHHMM(due_time)) return res.status(400).json({ error: 'Invalid due_time format (HH:MM)' });
  if (estimated_minutes !== undefined && estimated_minutes !== null && (typeof estimated_minutes !== 'number' || estimated_minutes < 0)) return res.status(400).json({ error: 'estimated_minutes must be a non-negative number' });
  if (list_id !== undefined && list_id !== null) { const lid = Number(list_id); if (!Number.isInteger(lid) || !db.prepare('SELECT id FROM lists WHERE id=? AND user_id=?').get(lid, req.userId)) return res.status(400).json({ error: 'Invalid list_id' }); }
  // Validate assigned_to_user_id if provided
  if (assigned_to_user_id !== undefined && assigned_to_user_id !== null) {
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(assigned_to_user_id);
    if (!targetUser) return res.status(400).json({ error: 'Assigned user not found' });
  }
  let validatedRecurring = recurring;
  if (recurring !== undefined && recurring !== null) {
    const rv = validateRecurring(recurring);
    if (!rv.valid) return res.status(400).json({ error: rv.error });
    validatedRecurring = rv.value;
  }
  const completedAt = status==='done' && ex.status!=='done' ? new Date().toISOString() : (status && status!=='done' ? null : ex.completed_at);
  db.prepare(`UPDATE tasks SET title=COALESCE(?,title),note=COALESCE(?,note),status=COALESCE(?,status),
    priority=COALESCE(?,priority),due_date=?,due_time=?,recurring=?,assigned_to=COALESCE(?,assigned_to),
    my_day=COALESCE(?,my_day),position=COALESCE(?,position),goal_id=COALESCE(?,goal_id),completed_at=?,
    time_block_start=?,time_block_end=?,estimated_minutes=?,actual_minutes=?,list_id=?,
    assigned_to_user_id=? WHERE id=?`).run(
    title||null, note!==undefined?note:null, status||null, priority!==undefined?priority:null,
    due_date!==undefined?due_date:ex.due_date, due_time!==undefined?due_time:ex.due_time,
    validatedRecurring!==undefined?validatedRecurring:ex.recurring,
    assigned_to!==undefined?assigned_to:null, my_day!==undefined?(my_day?1:0):null,
    position!==undefined?position:null, goal_id||null, completedAt,
    time_block_start!==undefined?time_block_start:ex.time_block_start, time_block_end!==undefined?time_block_end:ex.time_block_end,
    estimated_minutes!==undefined?estimated_minutes:ex.estimated_minutes, actual_minutes!==undefined?actual_minutes:ex.actual_minutes,
    list_id!==undefined?(list_id?Number(list_id):null):ex.list_id,
    assigned_to_user_id!==undefined?assigned_to_user_id:ex.assigned_to_user_id, id
  );
  // Push notification for assignment change
  if (assigned_to_user_id !== undefined && assigned_to_user_id !== null && assigned_to_user_id !== ex.assigned_to_user_id) {
    // Dedup: check if we already sent an assignment notification for this task to this user within 24h
    const recent = db.prepare(
      `SELECT 1 FROM push_notification_log WHERE task_id = ? AND user_id = ? AND type = 'assignment' AND sent_at > datetime('now', '-24 hours')`
    ).get(id, assigned_to_user_id);
    if (!recent) {
      db.prepare(
        `INSERT INTO push_notification_log (user_id, task_id, type) VALUES (?, ?, 'assignment')`
      ).run(assigned_to_user_id, id);
      // Fire-and-forget push (don't block response)
      if (pushService.isEnabled()) {
        const taskTitle = title || ex.title;
        pushService.sendPush(db, assigned_to_user_id, {
          title: 'Task Assigned',
          body: `You've been assigned: ${taskTitle}`,
          url: `/tasks/${id}`
        }).catch(err => logger.warn({ err, taskId: id, userId: assigned_to_user_id }, 'Assignment push notification failed'));
      }
    }
  }
  // Recurring: spawn next task when completed
  if (status === 'done' && ex.status !== 'done' && ex.recurring) {
    recurringSvc.spawnNext(ex, req.userId);
  }
  // Execute automation rules on completion
  if (status === 'done' && ex.status !== 'done') {
    const updated = db.prepare('SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE t.id=?').get(id);
    if (updated) executeRules('task_completed', updated);
  }
  // Execute rules on task creation (for overdue auto-add etc.)
  if (status && status !== ex.status && status !== 'done') {
    const updated = db.prepare('SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE t.id=?').get(id);
    if (updated) executeRules('task_updated', updated);
  }
  res.json(enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(id)));
});
router.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid ID' });
  const result = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ─── NLP Quick Capture Parser ───
router.post('/api/tasks/parse', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  if (String(text).length > 500) return res.status(400).json({ error: 'Input too long (max 500 characters)' });
  let input = text.trim();
  let priority = 0, due_date = null, tags = [], my_day = false;
  // Extract priority: p1 p2 p3 or !1 !2 !3
  input = input.replace(/\b[pP!]([1-3])\b/g, (_, n) => { priority = Number(n); return ''; });
  // Extract tags: #tagname
  input = input.replace(/#([a-zA-Z0-9_-]+)/g, (_, tag) => { tags.push(tag.toLowerCase()); return ''; });
  // Extract my_day: *today* or *myday*
  if (/\bmy\s*day\b/i.test(input)) { my_day = true; input = input.replace(/\bmy\s*day\b/gi, ''); }
  // Extract dates: today, tomorrow, day-after-tomorrow, next monday-sunday, in N days
  const today = new Date(); today.setHours(0,0,0,0);
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  input = input.replace(/\b(today)\b/gi, () => { due_date = fmt(today); return ''; });
  input = input.replace(/\bday\s*after\s*tomorrow\b/gi, () => { const d = new Date(today); d.setDate(d.getDate()+2); due_date = fmt(d); return ''; });
  input = input.replace(/\b(tomorrow)\b/gi, () => { const d = new Date(today); d.setDate(d.getDate()+1); due_date = fmt(d); return ''; });
  input = input.replace(/\bin\s+(\d+)\s*days?\b/gi, (_, n) => { const d = new Date(today); d.setDate(d.getDate()+Number(n)); due_date = fmt(d); return ''; });
  input = input.replace(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, (_, day) => {
    const targetDay = dayNames.indexOf(day.toLowerCase());
    const d = new Date(today); let diff = targetDay - d.getDay(); if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff); due_date = fmt(d); return '';
  });
  // Extract YYYY-MM-DD or MM/DD
  input = input.replace(/(\d{4})-(\d{2})-(\d{2})/g, (m) => { due_date = m; return ''; });
  input = input.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (_, mo, da) => {
    const y = today.getFullYear(); due_date = `${y}-${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`; return '';
  });
  const title = input.replace(/\s+/g, ' ').trim();
  function fmt(d) { return d.toISOString().slice(0, 10); }
  res.json({ title: title || text.trim(), priority, due_date, tags, my_day });
});

router.post('/api/tasks/bulk-myday', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const stmt = db.prepare('UPDATE tasks SET my_day=1 WHERE id=? AND user_id=?');
  ids.forEach(id => stmt.run(Number(id), req.userId));
  res.json({ updated: ids.length });
});

// Batch reschedule (clear my_day or set new due date)
router.post('/api/tasks/reschedule', (req, res) => {
  const { ids, due_date, clear_myday } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  if (due_date !== undefined && due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });
  }
  const rescheduleTx = db.transaction(() => {
    if (clear_myday) {
      const stmt = db.prepare('UPDATE tasks SET my_day=0 WHERE id=? AND user_id=?');
      ids.forEach(id => stmt.run(Number(id), req.userId));
    }
    if (due_date !== undefined) {
      const stmt = db.prepare('UPDATE tasks SET due_date=? WHERE id=? AND user_id=?');
      ids.forEach(id => stmt.run(due_date, Number(id), req.userId));
    }
  });
  rescheduleTx();
  res.json({ updated: ids.length });
});

// ─── Task Dependencies ───
router.get('/api/tasks/:id/deps', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const taskOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!taskOwner) return res.status(404).json({ error: 'Not found' });
  const blockedBy = db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id=? AND t.user_id=?').all(id, req.userId);
  const blocking = db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.task_id WHERE d.blocked_by_id=? AND t.user_id=?').all(id, req.userId);
  res.json({ blockedBy, blocking });
});

router.put('/api/tasks/:id/deps', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const taskOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!taskOwner) return res.status(404).json({ error: 'Not found' });
  const { blockedByIds } = req.body;
  if (!Array.isArray(blockedByIds)) return res.status(400).json({ error: 'blockedByIds array required' });
  // Prevent self-dependency
  const valid = blockedByIds.filter(bid => Number.isInteger(bid) && bid !== id);
  // Verify all blockedByIds belong to the requesting user
  const verifyOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?');
  const owned = valid.filter(bid => verifyOwner.get(bid, req.userId));
  // Check for circular dependencies via DFS (with depth limit to prevent DoS)
  const MAX_DEPTH = 100;
  for (const bid of owned) {
    const visited = new Set();
    const stack = [bid];
    while (stack.length) {
      if (visited.size > MAX_DEPTH) return res.status(400).json({ error: 'Dependency chain too deep' });
      const curr = stack.pop();
      if (curr === id) return res.status(400).json({ error: 'Circular dependency detected' });
      if (visited.has(curr)) continue;
      visited.add(curr);
      const deps = db.prepare('SELECT blocked_by_id FROM task_deps WHERE task_id=?').all(curr);
      deps.forEach(d => stack.push(d.blocked_by_id));
    }
  }
  db.prepare('DELETE FROM task_deps WHERE task_id=? AND task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(id, req.userId);
  const ins = db.prepare('INSERT OR IGNORE INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)');
  owned.forEach(bid => ins.run(id, bid));
  res.json({ ok: true, blockedBy: db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id=? AND t.user_id=?').all(id, req.userId) });
});

// ─── TASK COMMENTS API ───
router.get('/api/tasks/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const tOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!tOwner) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at ASC').all(id));
});
router.post('/api/tasks/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const tOwn2 = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!tOwn2) return res.status(404).json({ error: 'Not found' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  if (text.trim().length > 2000) return res.status(400).json({ error: 'Comment too long (max 2000 characters)' });
  const r = db.prepare('INSERT INTO task_comments (task_id, text) VALUES (?,?)').run(id, text.trim());
  res.status(201).json(db.prepare('SELECT * FROM task_comments WHERE id=?').get(r.lastInsertRowid));
});
router.delete('/api/tasks/:id/comments/:commentId', (req, res) => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(id) || !Number.isInteger(commentId)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT c.id FROM task_comments c JOIN tasks t ON c.task_id=t.id WHERE c.id=? AND c.task_id=? AND t.user_id=?').get(commentId, id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Comment not found' });
  db.prepare('DELETE FROM task_comments WHERE id=? AND task_id=?').run(commentId, id);
  res.json({ ok: true });
});
router.put('/api/tasks/:id/comments/:commentId', (req, res) => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(id) || !Number.isInteger(commentId)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT c.* FROM task_comments c JOIN tasks t ON c.task_id=t.id WHERE c.id=? AND c.task_id=? AND t.user_id=?').get(commentId, id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Comment not found' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
  if (text.trim().length > 2000) return res.status(400).json({ error: 'Comment too long (max 2000 characters)' });
  db.prepare('UPDATE task_comments SET text=? WHERE id=? AND task_id=?').run(text.trim(), commentId, id);
  res.json(db.prepare('SELECT * FROM task_comments WHERE id=?').get(commentId));
});

// ─── TIME TRACKING API ───
router.post('/api/tasks/:id/time', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { minutes } = req.body;
  if (!minutes || !Number.isInteger(Number(minutes)) || Number(minutes) <= 0) return res.status(400).json({ error: 'minutes required (positive integer)' });
  const newActual = (ex.actual_minutes || 0) + Number(minutes);
  db.prepare('UPDATE tasks SET actual_minutes=? WHERE id=? AND user_id=?').run(newActual, id, req.userId);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.userId));
});

// ─── RECURRING TASKS: Skip & Pause ───
router.post('/api/tasks/:id/skip', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  if (!ex.recurring) return res.status(400).json({ error: 'Not a recurring task' });
  // Mark as skipped (done but not actually completed)
  db.prepare("UPDATE tasks SET status='done', completed_at=? WHERE id=? AND user_id=?").run(new Date().toISOString(), id, req.userId);
  // Spawn next occurrence
  const newId = recurringSvc.spawnNext(ex, req.userId);
  if (!newId) return res.json({ skipped: id, next: null });
  res.json({ skipped: id, next: enrichTask(db.prepare('SELECT * FROM tasks WHERE id=?').get(newId)) });
});

// Move task to different goal
router.post('/api/tasks/:id/move', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { goal_id } = req.body;
  if (!goal_id) return res.status(400).json({ error: 'goal_id required' });
  const ex = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  if (!verifyGoalOwnership(Number(goal_id), req.userId)) return res.status(404).json({ error: 'Goal not found or not owned by you' });
  db.prepare('UPDATE tasks SET goal_id=? WHERE id=? AND user_id=?').run(Number(goal_id), id, req.userId);
  res.json(enrichTask(db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(id, req.userId)));
});

  return router;
};
