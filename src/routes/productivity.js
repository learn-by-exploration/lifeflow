const { Router } = require('express');
module.exports = function(deps) {
  const { db, getNextPosition } = deps;
  const router = Router();
  const { VALID_TRIGGER_TYPES, VALID_ACTION_TYPES, TRIGGER_LABELS, ACTION_LABELS } = require('../services/automation-engine');

// ─── AUTOMATION RULES ENGINE ───
router.get('/api/rules', (req, res) => {
  res.json(db.prepare('SELECT * FROM automation_rules WHERE user_id=? ORDER BY created_at DESC').all(req.userId));
});
router.get('/api/rules/constants', (req, res) => {
  // Return available triggers, actions, labels for the frontend builder
  const tags = db.prepare('SELECT id, name, color FROM tags WHERE user_id=?').all(req.userId);
  const goals = db.prepare('SELECT g.id, g.title, a.name as area_name FROM goals g JOIN life_areas a ON g.area_id=a.id WHERE g.user_id=? AND g.status=\'active\' ORDER BY a.position, g.position').all(req.userId);
  const areas = db.prepare('SELECT id, name, icon FROM life_areas WHERE user_id=? AND archived=0 ORDER BY position').all(req.userId);
  const habits = db.prepare('SELECT id, name, icon FROM habits WHERE user_id=? AND archived=0 ORDER BY position').all(req.userId);
  const templates = db.prepare('SELECT id, name FROM task_templates WHERE user_id=?').all(req.userId);
  res.json({
    trigger_types: VALID_TRIGGER_TYPES,
    action_types: VALID_ACTION_TYPES,
    trigger_labels: TRIGGER_LABELS,
    action_labels: ACTION_LABELS,
    tags, goals, areas, habits, templates
  });
});
router.post('/api/rules', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config, conditions, actions, description } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'name max 100 characters' });
  if (!trigger_type || !VALID_TRIGGER_TYPES.includes(trigger_type)) return res.status(400).json({ error: 'invalid trigger_type' });
  // Validate actions array or single action_type
  if (actions && Array.isArray(actions)) {
    if (actions.length === 0) return res.status(400).json({ error: 'at least one action required' });
    if (actions.length > 10) return res.status(400).json({ error: 'max 10 actions per rule' });
    for (const a of actions) {
      if (!a.type || !VALID_ACTION_TYPES.includes(a.type)) return res.status(400).json({ error: `invalid action_type: ${a.type}` });
    }
  } else {
    if (!action_type || !VALID_ACTION_TYPES.includes(action_type)) return res.status(400).json({ error: 'invalid action_type' });
  }
  // Validate conditions
  if (conditions && typeof conditions === 'object') {
    if (conditions.rules && conditions.rules.length > 20) return res.status(400).json({ error: 'max 20 conditions' });
  }
  // Limit schedule rules
  if (trigger_type.startsWith('schedule_')) {
    const schedCount = db.prepare('SELECT COUNT(*) as c FROM automation_rules WHERE user_id=? AND trigger_type LIKE \'schedule_%\'').get(req.userId).c;
    if (schedCount >= 10) return res.status(400).json({ error: 'max 10 schedule rules' });
  }
  const r = db.prepare(
    'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, conditions, actions, description, user_id) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(
    name.trim(), trigger_type,
    JSON.stringify(trigger_config || {}),
    actions ? (actions[0]?.type || 'add_to_myday') : (action_type || 'add_to_myday'),
    actions ? JSON.stringify(actions[0]?.config || {}) : JSON.stringify(action_config || {}),
    conditions ? JSON.stringify(conditions) : null,
    actions ? JSON.stringify(actions) : null,
    (description || '').slice(0, 500),
    req.userId
  );
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(r.lastInsertRowid));
});
router.put('/api/rules/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM automation_rules WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { name, trigger_type, trigger_config, action_type, action_config, conditions, actions, description, enabled } = req.body;
  if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'name cannot be empty' });
  if (name !== undefined && typeof name === 'string' && name.trim().length > 100) return res.status(400).json({ error: 'name max 100 characters' });
  if (trigger_type !== undefined && !VALID_TRIGGER_TYPES.includes(trigger_type)) return res.status(400).json({ error: 'invalid trigger_type' });
  if (action_type !== undefined && !VALID_ACTION_TYPES.includes(action_type)) return res.status(400).json({ error: 'invalid action_type' });
  if (actions !== undefined && Array.isArray(actions)) {
    if (actions.length > 10) return res.status(400).json({ error: 'max 10 actions per rule' });
    for (const a of actions) {
      if (!a.type || !VALID_ACTION_TYPES.includes(a.type)) return res.status(400).json({ error: `invalid action_type: ${a.type}` });
    }
  }
  db.prepare(`UPDATE automation_rules SET
    name=COALESCE(?,name), trigger_type=COALESCE(?,trigger_type),
    trigger_config=COALESCE(?,trigger_config), action_type=COALESCE(?,action_type),
    action_config=COALESCE(?,action_config), conditions=COALESCE(?,conditions),
    actions=COALESCE(?,actions), description=COALESCE(?,description),
    enabled=COALESCE(?,enabled)
    WHERE id=? AND user_id=?`).run(
    name ? name.trim() : null, trigger_type || null,
    trigger_config ? JSON.stringify(trigger_config) : null,
    actions ? (actions[0]?.type || null) : (action_type || null),
    actions ? JSON.stringify(actions[0]?.config || {}) : (action_config ? JSON.stringify(action_config) : null),
    conditions !== undefined ? (conditions ? JSON.stringify(conditions) : null) : null,
    actions !== undefined ? (actions ? JSON.stringify(actions) : null) : null,
    description !== undefined ? (description || '').slice(0, 500) : null,
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    id, req.userId
  );
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id=? AND user_id=?').get(id, req.userId));
});
router.delete('/api/rules/:id', (req, res) => {
  const result = db.prepare('DELETE FROM automation_rules WHERE id=? AND user_id=?').run(Number(req.params.id), req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ─── Execution Log ───
router.get('/api/rules/log', (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const ruleId = req.query.rule_id ? Number(req.query.rule_id) : null;
  let sql = 'SELECT l.*, r.name as rule_name FROM automation_log l LEFT JOIN automation_rules r ON l.rule_id=r.id WHERE l.user_id=?';
  const params = [req.userId];
  if (ruleId) { sql += ' AND l.rule_id=?'; params.push(ruleId); }
  sql += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const logs = db.prepare(sql).all(...params);
  const countSql = ruleId
    ? 'SELECT COUNT(*) as c FROM automation_log WHERE user_id=? AND rule_id=?'
    : 'SELECT COUNT(*) as c FROM automation_log WHERE user_id=?';
  const total = ruleId
    ? db.prepare(countSql).get(req.userId, ruleId).c
    : db.prepare(countSql).get(req.userId).c;
  res.json({ logs, total, limit, offset });
});

// ─── Templates ───
router.get('/api/rules/templates', (req, res) => {
  const templates = db.prepare('SELECT * FROM automation_templates ORDER BY sort_order').all();
  res.json(templates);
});
router.post('/api/rules/templates/:id/install', (req, res) => {
  const tmpl = db.prepare('SELECT * FROM automation_templates WHERE id=?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  const customizations = req.body.customizations || {};
  // Build rule from template, applying customizations
  let triggerConfig = JSON.parse(tmpl.trigger_config || '{}');
  let conditions = tmpl.conditions ? JSON.parse(tmpl.conditions) : null;
  let actions = JSON.parse(tmpl.actions || '[]');
  // Apply customizations using dot-path notation
  for (const [path, value] of Object.entries(customizations)) {
    const parts = path.split('.');
    if (parts[0] === 'trigger_config') {
      triggerConfig[parts.slice(1).join('.')] = value;
    } else if (parts[0] === 'conditions' && conditions) {
      // Simple: "conditions.rules[0].value" type paths
      const match = path.match(/conditions\.rules\[(\d+)\]\.(\w+)/);
      if (match && conditions.rules && conditions.rules[Number(match[1])]) {
        conditions.rules[Number(match[1])][match[2]] = value;
      }
    } else if (parts[0].startsWith('actions')) {
      const match = path.match(/actions\[(\d+)\]\.config\.(\w+)/);
      if (match && actions[Number(match[1])]) {
        if (!actions[Number(match[1])].config) actions[Number(match[1])].config = {};
        actions[Number(match[1])].config[match[2]] = value;
      }
    }
  }
  const r = db.prepare(
    'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, conditions, actions, description, template_id, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(
    tmpl.name, tmpl.trigger_type, JSON.stringify(triggerConfig),
    actions[0]?.type || 'add_to_myday', JSON.stringify(actions[0]?.config || {}),
    conditions ? JSON.stringify(conditions) : null,
    JSON.stringify(actions), tmpl.description, tmpl.id, req.userId
  );
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id=?').get(r.lastInsertRowid));
});

// ─── Rule Testing (Dry Run) ───
router.post('/api/rules/:id/test', (req, res) => {
  const rule = db.prepare('SELECT * FROM automation_rules WHERE id=? AND user_id=?').get(Number(req.params.id), req.userId);
  if (!rule) return res.status(404).json({ error: 'Not found' });
  const triggerConfig = JSON.parse(rule.trigger_config || '{}');
  const conditions = rule.conditions ? JSON.parse(rule.conditions) : null;
  const actions = rule.actions ? JSON.parse(rule.actions) : [{ type: rule.action_type, config: JSON.parse(rule.action_config || '{}') }];

  let matches = [];
  // For task-based triggers, find matching tasks
  if (rule.trigger_type.startsWith('task_')) {
    const allTasks = db.prepare('SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE t.user_id=? AND t.status!=\'done\' ORDER BY t.position LIMIT 100').all(req.userId);
    const { AutomationEngine } = require('../services/automation-engine');
    const engine = new AutomationEngine(db, console, {});
    for (const task of allTasks) {
      // Enrich with tags for condition evaluation
      task.tags = db.prepare('SELECT t.name FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id=?').all(task.id).map(r => r.name);
      const ctx = { userId: req.userId, task };
      if (rule.trigger_type === 'task_overdue') {
        if (!task.due_date || task.due_date >= new Date().toISOString().slice(0, 10)) continue;
        const daysOverdue = Math.floor((Date.now() - new Date(task.due_date + 'T00:00:00').getTime()) / (86400000));
        ctx.days_overdue = daysOverdue;
      }
      if (engine._evaluateConditions(conditions, triggerConfig, ctx)) {
        matches.push({ task_id: task.id, title: task.title, priority: task.priority, due_date: task.due_date, days_overdue: ctx.days_overdue });
      }
    }
  }

  const actionPreview = actions.map(a => ({
    type: a.type,
    description: `Would ${ACTION_LABELS[a.type] || a.type}${a.config?.priority !== undefined ? ` to ${['None','Normal','High','Critical'][a.config.priority]}` : ''}${a.config?.title ? `: "${a.config.title}"` : ''}${a.config?.message ? `: "${a.config.message}"` : ''}`
  }));

  res.json({ matches, count: matches.length, actions_preview: actionPreview });
});

// ─── Suggestions ───
router.get('/api/rules/suggestions', (req, res) => {
  const suggestions = db.prepare('SELECT * FROM automation_suggestions WHERE user_id=? AND dismissed=0 ORDER BY created_at DESC LIMIT 5').all(req.userId);
  res.json(suggestions);
});
router.post('/api/rules/suggestions/:id/dismiss', (req, res) => {
  const id = Number(req.params.id);
  const permanent = req.body.permanent ? 1 : 0;
  db.prepare('UPDATE automation_suggestions SET dismissed=1, dismissed_permanently=? WHERE id=? AND user_id=?').run(permanent, id, req.userId);
  res.json({ ok: true });
});

// ─── Automation Toasts (polled by frontend) ───
router.get('/api/rules/toasts', (req, res) => {
  const engine = req.app.locals.automationEngine;
  if (!engine) return res.json([]);
  res.json(engine.drainToasts(req.userId));
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
  const result = db.prepare('DELETE FROM inbox WHERE id=? AND user_id=?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
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
  const triageTx = db.transaction(() => {
    const r = db.prepare('INSERT INTO tasks (goal_id,title,note,priority,due_date,position,user_id) VALUES (?,?,?,?,?,?,?)').run(
      gid, item.title, item.note, priority !== undefined ? priority : item.priority, due_date || null, pos, req.userId
    );
    db.prepare('DELETE FROM inbox WHERE id=? AND user_id=?').run(id, req.userId);
    return r.lastInsertRowid;
  });
  const taskId = triageTx();
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId));
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
  const result = db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
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
  if (!week_start || typeof week_start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week_start)) return res.status(400).json({ error: 'week_start required (YYYY-MM-DD)' });
  if (isNaN(new Date(week_start).getTime())) return res.status(400).json({ error: 'week_start is not a valid date' });
  const ratingVal = rating !== null && rating !== undefined ? Math.min(5, Math.max(1, Number(rating))) : null;
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

// ─── DAILY MICRO-REVIEW API ───
router.post('/api/reviews/daily', (req, res) => {
  const { date, note } = req.body;
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const completedCount = db.prepare(
    `SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)=? AND user_id=?`
  ).get(date, req.userId).c;
  const existing = db.prepare('SELECT id FROM daily_reviews WHERE date=? AND user_id=?').get(date, req.userId);
  if (existing) {
    db.prepare('UPDATE daily_reviews SET note=?, completed_count=? WHERE id=?').run(note || '', completedCount, existing.id);
    res.json(db.prepare('SELECT * FROM daily_reviews WHERE id=?').get(existing.id));
  } else {
    const r = db.prepare('INSERT INTO daily_reviews (user_id, date, note, completed_count) VALUES (?,?,?,?)').run(
      req.userId, date, note || '', completedCount
    );
    res.status(201).json(db.prepare('SELECT * FROM daily_reviews WHERE id=?').get(r.lastInsertRowid));
  }
});

router.get('/api/reviews/daily/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' });
  const review = db.prepare('SELECT * FROM daily_reviews WHERE date=? AND user_id=?').get(date, req.userId);
  if (!review) return res.status(404).json({ error: 'No review for this date' });
  const completedCount = db.prepare(
    `SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)=? AND user_id=?`
  ).get(date, req.userId).c;
  review.completed_count = completedCount;
  res.json(review);
});

  return router;
};
