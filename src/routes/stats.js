const { Router } = require('express');
const { toDateStr, addDays } = require('../utils/date');
module.exports = function(deps) {
  const { db, enrichTasks, automationEngine } = deps;
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

router.get('/api/stats/habits', (req, res) => {
  const habits = db.prepare(`
    SELECT h.id, h.name, h.icon, h.color, h.target, h.frequency, h.position,
      la.name as area_name
    FROM habits h
    LEFT JOIN life_areas la ON la.id=h.area_id
    WHERE h.user_id=? AND h.archived=0
    ORDER BY h.position, h.id
  `).all(req.userId);
  if (!habits.length) {
    return res.json({
      overall: { totalHabits: 0, activeHabits: 0, avgCompletion30: 0, avgCompletion90: 0, totalLogs: 0 },
      trends: [],
      heatmap: [],
      bestDay: null,
      worstDay: null,
      habits: []
    });
  }

  const habitIds = habits.map(habit => habit.id);
  const placeholders = habitIds.map(() => '?').join(',');
  const logs = db.prepare(`
    SELECT habit_id, date, count
    FROM habit_logs
    WHERE habit_id IN (${placeholders})
      AND date >= date('now','-365 days')
    ORDER BY date DESC
  `).all(...habitIds);

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const logMap = new Map();
  const dailyTotals = new Map();
  const dayOfWeekTotals = new Map(DAY_NAMES.map(day => [day, 0]));
  for (const log of logs) {
    const dateMap = logMap.get(log.habit_id) || new Map();
    dateMap.set(log.date, log.count);
    logMap.set(log.habit_id, dateMap);
    dailyTotals.set(log.date, (dailyTotals.get(log.date) || 0) + Number(log.count || 0));
    const dayName = DAY_NAMES[new Date(log.date + 'T00:00:00').getDay()];
    dayOfWeekTotals.set(dayName, (dayOfWeekTotals.get(dayName) || 0) + Number(log.count || 0));
  }

  const calcStreaks = (habit, logsByDate) => {
    const target = Math.max(1, Number(habit.target) || 1);
    let streak = 0;
    let bestStreak = 0;
    let current = 0;
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    for (let offset = 365; offset >= 0; offset--) {
      const day = new Date(startDate);
      day.setDate(day.getDate() - offset);
      const count = Number(logsByDate.get(toDateStr(day)) || 0);
      if (count >= target) {
        current += 1;
        bestStreak = Math.max(bestStreak, current);
      } else {
        current = 0;
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = Number(logsByDate.get(toDateStr(today)) || 0);
    const cursor = new Date(today);
    if (todayCount < target) cursor.setDate(cursor.getDate() - 1);
    else streak = 1;
    for (;;) { // eslint-disable-line no-constant-condition
      const ds = toDateStr(cursor);
      const count = Number(logsByDate.get(ds) || 0);
      if (count >= target) {
        if (streak === 0 || ds !== toDateStr(today)) streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    return { streak, bestStreak };
  };

  const habitAnalytics = habits.map(habit => {
    const logsByDate = logMap.get(habit.id) || new Map();
    const { streak, bestStreak } = calcStreaks(habit, logsByDate);
    const last30 = Array.from({ length: 30 }, (_, index) => {
      const day = addDays(new Date(), -(29 - index));
      return { date: toDateStr(day), count: Number(logsByDate.get(toDateStr(day)) || 0) };
    });
    const completed30 = last30.filter(entry => entry.count >= Math.max(1, Number(habit.target) || 1)).length;
    const last90 = Array.from({ length: 90 }, (_, index) => {
      const day = addDays(new Date(), -(89 - index));
      return Number(logsByDate.get(toDateStr(day)) || 0) >= Math.max(1, Number(habit.target) || 1) ? 1 : 0;
    });
    const completed90 = last90.reduce((sum, value) => sum + value, 0);
    const totalLogs = Array.from(logsByDate.values()).reduce((sum, value) => sum + Number(value || 0), 0);
    const weekdayBreakdown = DAY_NAMES.map(day => ({ day, total: 0 }));
    for (const [date, count] of logsByDate.entries()) {
      const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
      const bucket = weekdayBreakdown.find(entry => entry.day === dayName);
      if (bucket) bucket.total += Number(count || 0);
    }
    return {
      id: habit.id,
      name: habit.name,
      icon: habit.icon,
      color: habit.color,
      target: habit.target,
      frequency: habit.frequency,
      area_name: habit.area_name,
      streak,
      best_streak: bestStreak,
      completion_30: completed30,
      completion_90: completed90,
      completion_rate_30: Math.round((completed30 / 30) * 100),
      completion_rate_90: Math.round((completed90 / 90) * 100),
      total_logs: totalLogs,
      sparkline_30: last30,
      weekday_breakdown: weekdayBreakdown,
    };
  });

  const trends = Array.from({ length: 90 }, (_, index) => {
    const day = addDays(new Date(), -(89 - index));
    const ds = toDateStr(day);
    return { date: ds, total: dailyTotals.get(ds) || 0 };
  });
  const heatmap = Array.from({ length: 365 }, (_, index) => {
    const day = addDays(new Date(), -(364 - index));
    const ds = toDateStr(day);
    return { date: ds, total: dailyTotals.get(ds) || 0 };
  });
  const sortedDays = Array.from(dayOfWeekTotals.entries()).sort((left, right) => right[1] - left[1]);

  res.json({
    overall: {
      totalHabits: habits.length,
      activeHabits: habitAnalytics.filter(habit => habit.total_logs > 0).length,
      avgCompletion30: Math.round(habitAnalytics.reduce((sum, habit) => sum + habit.completion_rate_30, 0) / habitAnalytics.length),
      avgCompletion90: Math.round(habitAnalytics.reduce((sum, habit) => sum + habit.completion_rate_90, 0) / habitAnalytics.length),
      totalLogs: habitAnalytics.reduce((sum, habit) => sum + habit.total_logs, 0),
    },
    trends,
    heatmap,
    bestDay: sortedDays[0] ? { day: sortedDays[0][0], total: sortedDays[0][1] } : null,
    worstDay: sortedDays[sortedDays.length - 1] ? { day: sortedDays[sortedDays.length - 1][0], total: sortedDays[sortedDays.length - 1][1] } : null,
    habits: habitAnalytics.sort((left, right) => right.streak - left.streak || right.completion_rate_30 - left.completion_rate_30),
  });
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
  const focusRow = db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(r.lastInsertRowid);
  // Emit focus_completed automation event
  if (automationEngine && focusRow) {
    const task = db.prepare('SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE t.id=?').get(Number(task_id));
    // Count today's sessions for focus_streak
    const todaySessions = db.prepare("SELECT COUNT(*) as c FROM focus_sessions WHERE date(started_at)=date('now') AND user_id=?").get(req.userId).c;
    automationEngine.emit('focus_completed', {
      userId: req.userId,
      task,
      duration_sec: focusRow.duration_sec,
      type: focusRow.type,
      today_sessions: todaySessions
    });
    if (todaySessions >= 3 || todaySessions >= 5 || todaySessions >= 10) {
      automationEngine.emit('focus_streak', { userId: req.userId, count: todaySessions });
    }
  }
  res.status(201).json(focusRow);
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
    const ds = toDateStr(d);
    if (heatmap.find(h => h.day === ds)) streak++;
    else break;
  }
  let bestStreak = 0, cur = 0;
  for (let i = 365; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    const ds = toDateStr(d);
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
  // Auto-update task's actual_minutes with focus session duration
  const finalDuration = duration_sec !== undefined ? duration_sec : ex.duration_sec;
  if (ex.task_id && finalDuration > 0) {
    const minutes = Math.round(finalDuration / 60);
    if (minutes > 0) {
      db.prepare('UPDATE tasks SET actual_minutes = COALESCE(actual_minutes, 0) + ? WHERE id=? AND user_id=?')
        .run(minutes, ex.task_id, req.userId);
    }
  }
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
    const ds = toDateStr(d);
    const cnt = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done' AND date(completed_at)=? AND user_id=?").get(ds, req.userId).c;
    if (cnt > 0) streak++;
    else break;
  }
  const bestStreak = (() => {
    let best = 0, cur = 0;
    for (let i = 365; i >= 0; i--) {
      const d = new Date(today - i * dayMs);
      const ds = toDateStr(d);
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
    SELECT t.*, g.title as goal_title, g.color as goal_color, a.name as area_name, a.icon as area_icon, a.color as area_color
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
    const startStr = toDateStr(start);
    const endStr = toDateStr(end);
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
  `).all(toDateStr(weekAgo), toDateStr(weekAgo), req.userId);
  const total = rows.reduce((s,r) => s + r.task_count, 0);
  const areas = rows.map(r => ({ ...r, pct: total ? Math.round(r.task_count / total * 100) : 0 }));
  const dominant = areas.find(a => a.pct > 60);
  const lowest = areas.length > 1 ? areas[areas.length - 1] : null;
  res.json({ areas, total, dominant: dominant || null, lowest: lowest || null });
});

  return router;
};
