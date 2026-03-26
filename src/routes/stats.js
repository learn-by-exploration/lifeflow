const { Router } = require('express');
module.exports = function(deps) {
  const { db, enrichTasks } = deps;
  const router = Router();

// ─── Stats / Dashboard ───
router.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE user_id=?').get(req.userId).c;
  const done = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND user_id=?").get(req.userId).c;
  const overdue = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date < date('now') AND status != 'done' AND user_id=?").get(req.userId).c;
  const dueToday = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date = date('now') AND status != 'done' AND user_id=?").get(req.userId).c;
  const thisWeek = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE completed_at >= date('now','-7 days') AND status='done' AND user_id=?").get(req.userId).c;
  const byArea = db.prepare(`
    SELECT a.name, a.icon, a.color,
      COUNT(t.id) as total,
      SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done
    FROM life_areas a
    LEFT JOIN goals g ON g.area_id=a.id
    LEFT JOIN tasks t ON t.goal_id=g.id
    WHERE a.user_id=?
    GROUP BY a.id ORDER BY a.position
  `).all(req.userId);
  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) as total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done
    FROM tasks WHERE user_id=? GROUP BY priority
  `).all(req.userId);
  const recentDone = db.prepare(`
    SELECT t.title, t.completed_at, g.title as goal_title
    FROM tasks t JOIN goals g ON t.goal_id=g.id
    WHERE t.status='done' AND t.completed_at IS NOT NULL AND t.user_id=?
    ORDER BY t.completed_at DESC LIMIT 10
  `).all(req.userId);
  res.json({ total, done, overdue, dueToday, thisWeek, byArea, byPriority, recentDone });
});

// ─── Focus Session Tracking ───
router.post('/api/focus', (req, res) => {
  const { task_id, duration_sec, type, scheduled_at } = req.body;
  if (!task_id || !Number.isInteger(Number(task_id))) return res.status(400).json({ error: 'task_id required' });
  // Verify task exists and belongs to user
  const taskOwner = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(Number(task_id), req.userId);
  if (!taskOwner) return res.status(404).json({ error: 'Task not found' });
  const durSec = Number(duration_sec) || 0;
  if (durSec < 0) return res.status(400).json({ error: 'duration_sec must be non-negative' });
  const r = db.prepare('INSERT INTO focus_sessions (task_id, duration_sec, type, scheduled_at, user_id) VALUES (?,?,?,?,?)').run(
    Number(task_id), durSec, type || 'pomodoro', scheduled_at || null, req.userId
  );
  res.status(201).json(db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(r.lastInsertRowid));
});

// CRITICAL: /api/focus/stats and /api/focus/history BEFORE /api/focus/:id routes
router.get('/api/focus/stats', (req, res) => {
  const today = db.prepare("SELECT COALESCE(SUM(duration_sec),0) as total FROM focus_sessions WHERE date(started_at)=date('now') AND user_id=?").get(req.userId).total;
  const week = db.prepare("SELECT COALESCE(SUM(duration_sec),0) as total FROM focus_sessions WHERE started_at>=date('now','-7 days') AND user_id=?").get(req.userId).total;
  const sessions = db.prepare("SELECT COALESCE(COUNT(*),0) as c FROM focus_sessions WHERE date(started_at)=date('now') AND user_id=?").get(req.userId).c;
  const byTask = db.prepare(`
    SELECT t.title, SUM(f.duration_sec) as total_sec, COUNT(f.id) as sessions
    FROM focus_sessions f JOIN tasks t ON f.task_id=t.id
    WHERE f.started_at>=date('now','-7 days') AND f.user_id=?
    GROUP BY f.task_id ORDER BY total_sec DESC LIMIT 10
  `).all(req.userId);
  res.json({ today, week, sessions, byTask });
});

// ─── Focus Session History ───
router.get('/api/focus/history', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as c FROM focus_sessions WHERE user_id=?').get(req.userId).c;
  const items = db.prepare(`
    SELECT f.*, t.title as task_title, g.title as goal_title, a.name as area_name
    FROM focus_sessions f
    JOIN tasks t ON f.task_id=t.id
    JOIN goals g ON t.goal_id=g.id
    JOIN life_areas a ON g.area_id=a.id
    WHERE f.user_id=?
    ORDER BY f.started_at DESC LIMIT ? OFFSET ?
  `).all(req.userId, limit, offset);
  // Also return daily totals for the last 14 days
  const daily = db.prepare(`
    SELECT date(started_at) as day, SUM(duration_sec) as total_sec, COUNT(*) as sessions
    FROM focus_sessions
    WHERE started_at >= date('now', '-14 days') AND user_id=?
    GROUP BY date(started_at) ORDER BY day
  `).all(req.userId);
  res.json({ total, page, pages: Math.ceil(total / limit), items, daily });
});

// ─── Focus Insights ───
router.get('/api/focus/insights', (req, res) => {
  const peakHours = db.prepare(`
    SELECT CAST(strftime('%H', started_at) AS INTEGER) as hour,
      COUNT(*) as sessions, AVG(duration_sec) as avg_duration
    FROM focus_sessions WHERE user_id=? AND started_at >= date('now', '-365 days') GROUP BY hour ORDER BY sessions DESC
  `).all(req.userId);
  const byStrategy = db.prepare(`
    SELECT COALESCE(m.strategy, 'pomodoro') as strategy, COUNT(*) as sessions,
      AVG(f.duration_sec) as avg_duration, AVG(m.focus_rating) as avg_rating
    FROM focus_sessions f LEFT JOIN focus_session_meta m ON m.session_id=f.id
    WHERE f.user_id=?
    GROUP BY strategy
  `).all(req.userId);
  const avgRating = db.prepare(`SELECT AVG(m.focus_rating) as avg FROM focus_session_meta m JOIN focus_sessions f ON m.session_id=f.id WHERE m.focus_rating > 0 AND f.user_id=?`).get(req.userId);
  const completionRate = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN m.steps_completed >= m.steps_planned AND m.steps_planned > 0 THEN 1 ELSE 0 END) as completed
    FROM focus_session_meta m JOIN focus_sessions f ON m.session_id=f.id WHERE m.steps_planned > 0 AND f.user_id=?
  `).get(req.userId);
  res.json({ peakHours, byStrategy, avgRating: avgRating?.avg || 0, completionRate });
});

// ─── Focus Streak ───
router.get('/api/focus/streak', (req, res) => {
  const heatmap = db.prepare(`
    SELECT date(started_at) as day, COUNT(*) as sessions, SUM(duration_sec) as total_sec
    FROM focus_sessions WHERE started_at >= date('now','-365 days') AND user_id=?
    GROUP BY date(started_at) ORDER BY day
  `).all(req.userId);
  // Use SQLite date('now') as reference to stay consistent with heatmap dates
  const todayStr = db.prepare("SELECT date('now') as d").get().d;
  const today = new Date(todayStr + 'T00:00:00Z');
  const dayMs = 86400000;
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * dayMs);
    const ds = d.toISOString().slice(0,10);
    if (heatmap.find(h => h.day === ds)) streak++;
    else break;
  }
  let bestStreak = 0, cur = 0;
  for (let i = 365; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    const ds = d.toISOString().slice(0,10);
    if (heatmap.find(h => h.day === ds)) { cur++; if (cur > bestStreak) bestStreak = cur; }
    else cur = 0;
  }
  res.json({ streak, bestStreak, heatmap });
});

// ─── Focus Daily Goal ───
router.get('/api/focus/goal', (req, res) => {
  const goalRow = db.prepare("SELECT value FROM settings WHERE key='dailyFocusGoalMinutes' AND user_id=?").get(req.userId);
  const goalMinutes = goalRow ? Number(goalRow.value) : 120;
  const todaySec = db.prepare("SELECT COALESCE(SUM(duration_sec),0) as total FROM focus_sessions WHERE date(started_at)=date('now') AND user_id=?").get(req.userId).total;
  res.json({ goalMinutes, todayMinutes: Math.floor(todaySec / 60), todaySec, pct: Math.min(100, Math.round((todaySec / 60) / goalMinutes * 100)) });
});

router.put('/api/focus/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const { duration_sec, type } = req.body;
  db.prepare('UPDATE focus_sessions SET duration_sec=COALESCE(?,duration_sec), type=COALESCE(?,type) WHERE id=? AND user_id=?').run(
    duration_sec !== undefined ? duration_sec : null, type || null, id, req.userId
  );
  res.json(db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId));
});

// ─── End Focus Session ───
router.put('/api/focus/:id/end', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const { duration_sec } = req.body;
  db.prepare('UPDATE focus_sessions SET ended_at=CURRENT_TIMESTAMP, duration_sec=COALESCE(?,duration_sec) WHERE id=? AND user_id=?').run(
    duration_sec !== undefined ? duration_sec : null, id, req.userId
  );
  res.json(db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId));
});

// ─── Focus Session Meta (intention / reflection) ───
router.post('/api/focus/:id/meta', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const { intention, reflection, focus_rating, steps_planned, steps_completed, strategy } = req.body;
  const rating = Number(focus_rating) || 0;
  if (rating < 0 || rating > 5) return res.status(400).json({ error: 'focus_rating must be 0-5' });
  const existing = db.prepare('SELECT * FROM focus_session_meta WHERE session_id=?').get(id);
  if (existing) {
    db.prepare(`UPDATE focus_session_meta SET
      intention=COALESCE(?,intention), reflection=COALESCE(?,reflection),
      focus_rating=COALESCE(?,focus_rating), steps_planned=COALESCE(?,steps_planned),
      steps_completed=COALESCE(?,steps_completed), strategy=COALESCE(?,strategy)
      WHERE session_id=?`).run(
      intention ?? null, reflection ?? null,
      rating || null, steps_planned ?? null, steps_completed ?? null, strategy ?? null, id
    );
  } else {
    db.prepare(`INSERT INTO focus_session_meta (session_id, intention, reflection, focus_rating, steps_planned, steps_completed, strategy)
      VALUES (?,?,?,?,?,?,?)`).run(id, intention || null, reflection || null, rating, steps_planned || 0, steps_completed || 0, strategy || 'pomodoro');
  }
  res.json(db.prepare('SELECT * FROM focus_session_meta WHERE session_id=?').get(id));
});

router.get('/api/focus/:id/meta', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const meta = db.prepare('SELECT * FROM focus_session_meta WHERE session_id=?').get(id);
  if (!meta) return res.status(404).json({ error: 'No meta found for this session' });
  res.json(meta);
});

// ─── Focus Steps (micro-goals) ───
router.post('/api/focus/:id/steps', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const { steps } = req.body;
  if (!Array.isArray(steps) || !steps.length) return res.status(400).json({ error: 'steps array required' });
  const ins = db.prepare('INSERT INTO focus_steps (session_id, text, position) VALUES (?,?,?)');
  const run = db.transaction(() => {
    steps.forEach((s, i) => {
      const text = typeof s === 'string' ? s : s.text;
      if (text && text.trim()) ins.run(id, text.trim(), i);
    });
  });
  run();
  const all = db.prepare('SELECT * FROM focus_steps WHERE session_id=? ORDER BY position').all(id);
  res.status(201).json(all);
});

router.get('/api/focus/:id/steps', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  const all = db.prepare('SELECT * FROM focus_steps WHERE session_id=? ORDER BY position').all(id);
  res.json(all);
});

router.put('/api/focus/steps/:stepId', (req, res) => {
  const stepId = Number(req.params.stepId);
  if (!Number.isInteger(stepId)) return res.status(400).json({ error: 'Invalid step ID' });
  const step = db.prepare('SELECT fs.* FROM focus_steps fs JOIN focus_sessions f ON fs.session_id=f.id WHERE fs.id=? AND f.user_id=?').get(stepId, req.userId);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  const done = step.done ? 0 : 1;
  db.prepare('UPDATE focus_steps SET done=?, completed_at=? WHERE id=?').run(
    done, done ? new Date().toISOString() : null, stepId
  );
  res.json(db.prepare('SELECT * FROM focus_steps WHERE id=?').get(stepId));
});

router.delete('/api/focus/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id=? AND user_id=?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Focus session not found' });
  db.prepare('DELETE FROM focus_sessions WHERE id=? AND user_id=?').run(id, req.userId);
  res.json({ ok: true });
});

// ─── Streak & Heatmap ───
router.get('/api/stats/streaks', (req, res) => {
  // Heatmap: completions per day for last 365 days
  const heatmap = db.prepare(`
    SELECT date(completed_at) as day, COUNT(*) as count
    FROM tasks WHERE status='done' AND completed_at IS NOT NULL
      AND completed_at >= date('now','-365 days') AND user_id=?
    GROUP BY date(completed_at) ORDER BY day
  `).all(req.userId);
  // Streak: consecutive days with at least 1 completion ending today
  let streak = 0;
  const today = new Date(); today.setHours(0,0,0,0);
  const dayMs = 86400000;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today - i * dayMs);
    const ds = d.toISOString().slice(0,10);
    const cnt = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)=? AND user_id=?").get(ds, req.userId).c;
    if (cnt > 0) streak++;
    else break;
  }
  const bestStreak = (() => {
    let best = 0, cur = 0;
    for (let i = 365; i >= 0; i--) {
      const d = new Date(today - i * dayMs);
      const ds = d.toISOString().slice(0,10);
      const found = heatmap.find(h => h.day === ds);
      if (found && found.count > 0) { cur++; if (cur > best) best = cur; }
      else cur = 0;
    }
    return best;
  })();
  res.json({ streak, bestStreak, heatmap });
});

// ─── Activity Log ───
router.get('/api/activity', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const total = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND completed_at IS NOT NULL AND user_id=?").get(req.userId).c;
  const items = db.prepare(`
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon
    FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
    WHERE t.status='done' AND t.completed_at IS NOT NULL AND t.user_id=?
    ORDER BY t.completed_at DESC LIMIT ? OFFSET ?
  `).all(req.userId, limit, offset);
  res.json({ total, page, pages: Math.ceil(total / limit), items: enrichTasks(items) });
});

router.get('/api/stats/trends', (req, res) => {
  const weeks = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const row = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status='done' AND completed_at >= ? AND completed_at < ? AND user_id=?`).get(startStr, endStr, req.userId);
    weeks.push({ week_start: startStr, week_end: endStr, completed: row.count });
  }
  res.json(weeks);
});

// ─── TIME ANALYTICS ───
router.get('/api/stats/time-analytics', (req, res) => {
  // Estimate vs actual per area
  const byArea = db.prepare(`
    SELECT la.name, la.icon, la.color,
      SUM(t.estimated_minutes) as total_estimated,
      SUM(t.actual_minutes) as total_actual,
      COUNT(CASE WHEN t.estimated_minutes > 0 THEN 1 END) as estimated_count,
      COUNT(*) as task_count
    FROM tasks t
    JOIN goals g ON t.goal_id = g.id
    JOIN life_areas la ON g.area_id = la.id
    WHERE t.status = 'done' AND t.user_id=?
    GROUP BY la.id ORDER BY total_actual DESC
  `).all(req.userId);
  // Completion by hour of day
  const byHour = db.prepare(`
    SELECT CAST(strftime('%H', completed_at) AS INTEGER) as hour, COUNT(*) as count
    FROM tasks WHERE status='done' AND completed_at IS NOT NULL AND user_id=?
    GROUP BY hour ORDER BY hour
  `).all(req.userId);
  // Weekly velocity (last 8 weeks)
  const weeklyVelocity = db.prepare(`
    SELECT strftime('%Y-W%W', completed_at) as week, COUNT(*) as count,
      SUM(actual_minutes) as minutes
    FROM tasks WHERE status='done' AND completed_at >= date('now', '-56 days') AND user_id=?
    GROUP BY week ORDER BY week
  `).all(req.userId);
  // Estimation accuracy
  const accuracy = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN actual_minutes <= estimated_minutes THEN 1 ELSE 0 END) as on_time,
      SUM(CASE WHEN actual_minutes > estimated_minutes THEN 1 ELSE 0 END) as over,
      AVG(CASE WHEN estimated_minutes > 0 THEN CAST(actual_minutes AS FLOAT) / estimated_minutes END) as avg_ratio
    FROM tasks WHERE status='done' AND estimated_minutes > 0 AND actual_minutes > 0 AND user_id=?
  `).get(req.userId);
  res.json({ byArea, byHour, weeklyVelocity, accuracy });
});

// ─── Balance alert ───
router.get('/api/stats/balance', (req, res) => {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const rows = db.prepare(`
    SELECT la.id, la.name, la.icon, la.color, COUNT(t.id) as task_count
    FROM tasks t
    JOIN goals g ON t.goal_id = g.id
    JOIN life_areas la ON g.area_id = la.id
    WHERE (t.created_at >= ? OR (t.due_date IS NOT NULL AND t.due_date >= ?)) AND la.user_id=?
    GROUP BY la.id
    ORDER BY task_count DESC
  `).all(weekAgo.toISOString().slice(0,10), weekAgo.toISOString().slice(0,10), req.userId);
  const total = rows.reduce((s,r) => s + r.task_count, 0);
  const areas = rows.map(r => ({ ...r, pct: total ? Math.round(r.task_count / total * 100) : 0 }));
  const dominant = areas.find(a => a.pct > 60);
  const lowest = areas.length > 1 ? areas[areas.length - 1] : null;
  res.json({ areas, total, dominant: dominant || null, lowest: lowest || null });
});

  return router;
};
