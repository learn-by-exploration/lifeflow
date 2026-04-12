const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

module.exports = function(deps) {
  const { db, enrichTasks, dbDir, audit } = deps;
  const router = Router();

  // SSRF protection for imported webhook URLs.
  function isPrivateUrl(urlString) {
    try {
      const parsed = new URL(urlString);
      const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
      if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
      if (hostname === '0.0.0.0' || hostname === '::1' || hostname === '::') return true;

      const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        if (a === 127) return true;
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0) return true;
      }

      if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(hostname)) {
        const mapped = hostname.replace(/^::ffff:/i, '');
        return isPrivateUrl(`http://${mapped}`);
      }

      return false;
    } catch {
      return true;
    }
  }

  // ─── Auto Backup ───
  const backupDir = path.join(dbDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  // Helper: query ALL user data for backup/export (single source of truth)
  function queryAllUserData(userId) {
    const areas = db.prepare('SELECT * FROM life_areas WHERE user_id=? ORDER BY position').all(userId);
    const goals = db.prepare('SELECT * FROM goals WHERE user_id=? ORDER BY area_id, position').all(userId);
    const tasks = enrichTasks(db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY goal_id, position').all(userId));
    const tags = db.prepare('SELECT * FROM tags WHERE user_id=? ORDER BY name').all(userId);

    const taskIds = tasks.map(t => t.id);
    const goalIds = goals.map(g => g.id);
    const habitIds = [];

    // Habits + habit logs
    const habits = db.prepare('SELECT * FROM habits WHERE user_id=? ORDER BY position').all(userId);
    habits.forEach(h => habitIds.push(h.id));
    const habit_logs = habitIds.length
      ? db.prepare(`SELECT * FROM habit_logs WHERE habit_id IN (${habitIds.map(() => '?').join(',')}) ORDER BY date`).all(...habitIds)
      : [];

    // Focus sessions + meta + steps
    const focus_sessions = db.prepare('SELECT * FROM focus_sessions WHERE user_id=?').all(userId);
    const fsIds = focus_sessions.map(f => f.id);
    const focus_session_meta = fsIds.length
      ? db.prepare(`SELECT * FROM focus_session_meta WHERE session_id IN (${fsIds.map(() => '?').join(',')})`).all(...fsIds)
      : [];
    const focus_steps = fsIds.length
      ? db.prepare(`SELECT * FROM focus_steps WHERE session_id IN (${fsIds.map(() => '?').join(',')}) ORDER BY position`).all(...fsIds)
      : [];

    // Task-linked data
    const task_comments = taskIds.length
      ? db.prepare(`SELECT * FROM task_comments WHERE task_id IN (${taskIds.map(() => '?').join(',')}) ORDER BY created_at`).all(...taskIds)
      : [];
    const task_deps = taskIds.length
      ? db.prepare(`SELECT * FROM task_deps WHERE task_id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds)
      : [];
    const task_custom_values = taskIds.length
      ? db.prepare(`SELECT * FROM task_custom_values WHERE task_id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds)
      : [];

    // Goal-linked
    const goal_milestones = goalIds.length
      ? db.prepare(`SELECT * FROM goal_milestones WHERE goal_id IN (${goalIds.map(() => '?').join(',')}) ORDER BY position`).all(...goalIds)
      : [];

    // User-scoped tables
    const notes = db.prepare('SELECT * FROM notes WHERE user_id=? ORDER BY updated_at DESC').all(userId);
    const lists = db.prepare('SELECT * FROM lists WHERE user_id=? ORDER BY position').all(userId);
    const listIds = lists.map(l => l.id);
    const list_items = listIds.length
      ? db.prepare(`SELECT * FROM list_items WHERE list_id IN (${listIds.map(() => '?').join(',')}) ORDER BY position`).all(...listIds)
      : [];
    const custom_field_defs = db.prepare('SELECT * FROM custom_field_defs WHERE user_id=? ORDER BY position').all(userId);
    const automation_rules = db.prepare('SELECT * FROM automation_rules WHERE user_id=?').all(userId);
    const saved_filters = db.prepare('SELECT * FROM saved_filters WHERE user_id=? ORDER BY position').all(userId);
    const task_templates = db.prepare('SELECT * FROM task_templates WHERE user_id=?').all(userId);
    const weekly_reviews = db.prepare('SELECT * FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC').all(userId);
    const daily_reviews = db.prepare('SELECT * FROM daily_reviews WHERE user_id=? ORDER BY date DESC').all(userId);
    const inbox = db.prepare('SELECT * FROM inbox WHERE user_id=? ORDER BY created_at').all(userId);
    const badges = db.prepare('SELECT * FROM badges WHERE user_id=?').all(userId);
    const settings = db.prepare("SELECT * FROM settings WHERE user_id=? AND key NOT LIKE '\\_%' ESCAPE '\\'").all(userId);
    const user_xp = db.prepare('SELECT * FROM user_xp WHERE user_id=? ORDER BY created_at DESC').all(userId);
    const task_attachments = taskIds.length
      ? db.prepare(`SELECT id, task_id, user_id, original_name, mime_type, size_bytes, created_at FROM task_attachments WHERE task_id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds)
      : [];
    const custom_statuses = goalIds.length
      ? db.prepare(`SELECT * FROM custom_statuses WHERE goal_id IN (${goalIds.map(() => '?').join(',')}) ORDER BY position`).all(...goalIds)
      : [];

    // Integrations
    const webhooks = db.prepare('SELECT * FROM webhooks WHERE user_id=?').all(userId);
    const api_tokens = db.prepare('SELECT id, user_id, name, token_hash, last_used_at, created_at, expires_at FROM api_tokens WHERE user_id=?').all(userId);
    const push_subscriptions = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId);

    // Include all user accounts (id, email, password_hash, display_name) for full restore capability
    // Password hashes are bcrypt — safe to store (same as what's in the SQLite file)
    const users = db.prepare('SELECT id, email, password_hash, display_name, created_at FROM users').all();

    return {
      users,
      areas, goals, tasks, tags,
      habits, habit_logs,
      focus_sessions, focus_session_meta, focus_steps,
      task_comments, task_deps, task_custom_values,
      goal_milestones,
      notes, lists, list_items,
      custom_field_defs, automation_rules, saved_filters, task_templates,
      weekly_reviews, daily_reviews, inbox, badges, settings,
      user_xp, task_attachments, custom_statuses,
      webhooks, api_tokens, push_subscriptions,
    };
  }

  function runBackup(userId) {
    const d = queryAllUserData(userId);
    // Safety: don't create backups when DB has no real user data (empty or seed-only)
    if (d.tasks.length === 0 && d.goals.length === 0) {
      // Seed data creates areas but no goals/tasks — don't let it overwrite real backups
      logger.warn({ userId }, 'Skipping backup — no tasks or goals in database (empty/seed-only)');
      return null;
    }
    const fname = `lifeflow-backup-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}.json`;
    const fpath = path.join(backupDir, fname);
    const data = JSON.stringify({ backupDate: new Date().toISOString(), ...d });
    fs.writeFileSync(fpath, data);
    // Rotate: keep last 14
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('lifeflow-backup-')).sort();
    while (files.length > 14) { fs.unlinkSync(path.join(backupDir, files.shift())); }
    // Update data watermark — ratchet upward only (never decrease)
    // This prevents corrupt/seed data from lowering the watermark and masking real data loss
    try {
      const existingWm = db.prepare("SELECT value FROM settings WHERE key='_data_watermark' AND user_id=0").get();
      const prev = existingWm ? JSON.parse(existingWm.value) : {};
      const watermark = JSON.stringify({
        areas: Math.max(d.areas.length, prev.areas || 0),
        goals: Math.max(d.goals.length, prev.goals || 0),
        tasks: Math.max(d.tasks.length, prev.tasks || 0),
        tags: Math.max(d.tags.length, prev.tags || 0),
        habits: Math.max(d.habits.length, prev.habits || 0),
        focus_sessions: Math.max(d.focus_sessions.length, prev.focus_sessions || 0),
        notes: Math.max(d.notes.length, prev.notes || 0),
        lists: Math.max(d.lists.length, prev.lists || 0),
        at: new Date().toISOString(),
      });
      db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (0, '_data_watermark', ?)").run(watermark);
    } catch (e) { logger.error({ err: e }, 'Failed to update data watermark'); }
    return fname;
  }

  // Backup on startup (for default user)
  try { runBackup(1); } catch(e) { logger.error({ err: e }, 'Startup backup failed'); }
  // Backup every 4h
  setInterval(() => { try { runBackup(1); } catch(e) { logger.error({ err: e }, 'Scheduled backup failed'); } }, 4 * 60 * 60 * 1000);

  router.post('/api/backup', (req, res) => {
    const fname = runBackup(req.userId);
    res.json({ ok: true, file: fname });
  });

  router.get('/api/backups', (req, res) => {
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('lifeflow-backup-')).sort().reverse();
    res.json(files.map(f => ({ name: f, size: fs.statSync(path.join(backupDir, f)).size, date: f.replace('lifeflow-backup-', '').replace('.json', '') })));
  });

  // ─── Export ───
  router.get('/api/export', (req, res) => {
    const d = queryAllUserData(req.userId);
    res.setHeader('Content-Disposition', 'attachment; filename=lifeflow-export.json');
    if (audit) audit.log(req.userId, 'data_export', 'export', null, req);
    res.json({ exportDate: new Date().toISOString(), ...d });
  });

  // ─── Import ───
  router.post('/api/import', (req, res) => {
    const { areas, goals, tasks, tags, confirm } = req.body;
    if (confirm !== 'DESTROY_ALL_DATA') return res.status(403).json({ error: 'Import requires confirm: "DESTROY_ALL_DATA" — this will erase all existing data' });
    if (!Array.isArray(areas) || !areas.length) return res.status(400).json({ error: 'areas must be a non-empty array' });
    if (!Array.isArray(goals) || !goals.length) return res.status(400).json({ error: 'goals must be a non-empty array' });
    if (!Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: 'tasks must be a non-empty array' });
    // Validate required fields in import data
    for (const a of areas) { if (!a.name || !a.id) return res.status(400).json({ error: 'Each area must have id and name' }); }
    for (const g of goals) { if (!g.title || !g.id || !g.area_id) return res.status(400).json({ error: 'Each goal must have id, title, and area_id' }); }
    for (const t of tasks) { if (!t.title || !t.goal_id) return res.status(400).json({ error: 'Each task must have title and goal_id' }); }

    if (Array.isArray(req.body.webhooks)) {
      for (const [i, w] of req.body.webhooks.entries()) {
        if (!w || typeof w.name !== 'string' || !w.name.trim()) {
          return res.status(400).json({ error: `Invalid webhook at index ${i}: name is required` });
        }
        if (!w.url || typeof w.url !== 'string') {
          return res.status(400).json({ error: `Invalid webhook at index ${i}: URL is required` });
        }
        try { new URL(w.url); } catch {
          return res.status(400).json({ error: `Invalid webhook at index ${i}: URL is invalid` });
        }
        if (!w.url.startsWith('https://')) {
          return res.status(400).json({ error: `Invalid webhook at index ${i}: URL must use HTTPS` });
        }
        if (isPrivateUrl(w.url)) {
          return res.status(400).json({ error: `Invalid webhook at index ${i}: URL must not point to private/internal networks` });
        }
      }
    }

    const importTx = db.transaction(() => {
      // Clear existing data in dependency order
      db.prepare('DELETE FROM task_custom_values WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM custom_field_defs WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM task_deps WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM focus_sessions WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM tasks WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM goals WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM life_areas WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM tags WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM habits WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM notes WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM lists WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM automation_rules WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM saved_filters WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM task_templates WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM weekly_reviews WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM inbox WHERE user_id=?').run(req.userId);
      try { db.prepare('DELETE FROM badges WHERE user_id=?').run(req.userId); } catch(e) {}
      db.prepare('DELETE FROM settings WHERE user_id=?').run(req.userId);
      try { db.prepare('DELETE FROM webhooks WHERE user_id=?').run(req.userId); } catch(e) {}
      try { db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(req.userId); } catch(e) {}
      try { db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').run(req.userId); } catch(e) {}
      // goal_milestones cascade from goals delete

      // Map old IDs to new IDs
      const areaMap = {}, goalMap = {}, tagMap = {}, taskMap = {}, habitMap = {}, listMap = {}, fieldMap = {};

      // Import tags
      if (Array.isArray(tags)) {
        const insTag = db.prepare('INSERT INTO tags (name, color, user_id) VALUES (?, ?, ?)');
        tags.forEach(t => {
          const r = insTag.run(t.name, t.color || '#64748B', req.userId);
          tagMap[t.id] = r.lastInsertRowid;
        });
      }

      // Import areas
      const insArea = db.prepare('INSERT INTO life_areas (name, icon, color, position, user_id, archived, default_view, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      areas.forEach(a => {
        const r = insArea.run(a.name, a.icon || '📂', a.color || '#2563EB', a.position || 0, req.userId, a.archived || 0, a.default_view || null, a.created_at || new Date().toISOString());
        areaMap[a.id] = r.lastInsertRowid;
      });

      // Import goals
      const insGoal = db.prepare('INSERT INTO goals (area_id, title, description, due_date, color, status, position, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      goals.forEach(g => {
        const newAreaId = areaMap[g.area_id];
        if (!newAreaId) return; // skip orphan goals
        const r = insGoal.run(newAreaId, g.title, g.description || '', g.due_date || null, g.color || '#6C63FF', g.status || 'active', g.position || 0, req.userId, g.created_at || new Date().toISOString());
        goalMap[g.id] = r.lastInsertRowid;
      });

      // Lists + list_items (before tasks so list_id can be remapped)
      if (Array.isArray(req.body.lists)) {
        const insList = db.prepare('INSERT INTO lists (name, type, icon, color, position, user_id, area_id, parent_id, share_token, view_mode, board_columns, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        const allLists = req.body.lists;
        const parentLists = allLists.filter(l => !l.parent_id);
        const childLists = allLists.filter(l => l.parent_id);
        [...parentLists, ...childLists].forEach(l => {
          const newAreaId = l.area_id ? (areaMap[l.area_id] || null) : null;
          const newParentId = l.parent_id ? (listMap[l.parent_id] || null) : null;
          const r = insList.run(l.name, l.type || 'checklist', l.icon || '📋', l.color || '#2563EB', l.position || 0, req.userId, newAreaId, newParentId, l.share_token || null, l.view_mode || 'list', l.board_columns || null, l.created_at || new Date().toISOString());
          listMap[l.id] = r.lastInsertRowid;
        });
      }
      if (Array.isArray(req.body.list_items)) {
        const insItem = db.prepare('INSERT INTO list_items (list_id, title, checked, category, quantity, note, position, metadata, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
        req.body.list_items.forEach(i => {
          const newListId = listMap[i.list_id];
          if (newListId) insItem.run(newListId, i.title, i.checked || 0, i.category || null, i.quantity || null, i.note || '', i.position || 0, i.metadata || null, i.status || null, i.created_at || new Date().toISOString());
        });
      }

      // Import tasks
      const insTask = db.prepare('INSERT INTO tasks (goal_id, title, note, status, priority, due_date, due_time, my_day, position, recurring, completed_at, user_id, assigned_to, assigned_to_user_id, estimated_minutes, actual_minutes, list_id, time_block_start, time_block_end, created_at, starred, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insSubtask = db.prepare('INSERT INTO subtasks (task_id, title, note, done, position, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      const insTaskTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
      tasks.forEach(t => {
        const newGoalId = goalMap[t.goal_id];
        if (!newGoalId) return; // skip orphan tasks
        const newListId = t.list_id ? (listMap[t.list_id] || null) : null;
        const r = insTask.run(newGoalId, t.title, t.notes || t.note || '', t.status || 'todo', t.priority || 0, t.due_date || null, t.due_time || null, t.my_day ? 1 : 0, t.position || 0, t.recurring || null, t.completed_at || null, req.userId, t.assigned_to || '', t.assigned_to_user_id || null, t.estimated_minutes || null, t.actual_minutes || 0, newListId, t.time_block_start || null, t.time_block_end || null, t.created_at || new Date().toISOString(), t.starred ? 1 : 0, t.start_date || null);
        const newTaskId = r.lastInsertRowid;
        taskMap[t.id] = newTaskId;
        // Subtasks
        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach(s => insSubtask.run(newTaskId, s.title, s.note || '', s.done ? 1 : 0, s.position || 0, s.created_at || new Date().toISOString()));
        }
        // Tags
        if (Array.isArray(t.tags)) {
          t.tags.forEach(tag => {
            const newTagId = tagMap[tag.id];
            if (newTagId) insTaskTag.run(newTaskId, newTagId);
          });
        }
      });

      // Import extended tables (all optional for backward compat)

      // Habits + habit_logs
      if (Array.isArray(req.body.habits)) {
        const insHabit = db.prepare('INSERT INTO habits (name, icon, color, frequency, target, position, area_id, user_id, preferred_time, archived, schedule_days, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        req.body.habits.forEach(h => {
          const r = insHabit.run(h.name, h.icon || '✅', h.color || '#22C55E', h.frequency || 'daily', h.target || 1, h.position || 0, h.area_id ? (areaMap[h.area_id] || null) : null, req.userId, h.preferred_time || null, h.archived || 0, h.schedule_days || null, h.created_at || new Date().toISOString());
          habitMap[h.id] = r.lastInsertRowid;
        });
      }
      if (Array.isArray(req.body.habit_logs)) {
        const insLog = db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id, date, count) VALUES (?,?,?)');
        req.body.habit_logs.forEach(l => {
          const newHabitId = habitMap[l.habit_id];
          if (newHabitId) insLog.run(newHabitId, l.date, l.count || 1);
        });
      }

      // Focus sessions
      if (Array.isArray(req.body.focus_sessions)) {
        const insFocus = db.prepare('INSERT INTO focus_sessions (task_id, started_at, duration_sec, type, user_id, ended_at, scheduled_at) VALUES (?,?,?,?,?,?,?)');
        req.body.focus_sessions.forEach(f => {
          const newTaskId = taskMap[f.task_id];
          if (newTaskId) insFocus.run(newTaskId, f.started_at, f.duration_sec || 0, f.type || 'pomodoro', req.userId, f.ended_at || null, f.scheduled_at || null);
        });
      }

      // Task comments
      if (Array.isArray(req.body.task_comments)) {
        const insComment = db.prepare('INSERT INTO task_comments (task_id, text, created_at) VALUES (?,?,?)');
        req.body.task_comments.forEach(c => {
          const newTaskId = taskMap[c.task_id];
          if (newTaskId) insComment.run(newTaskId, c.text, c.created_at || new Date().toISOString());
        });
      }

      // Task dependencies
      if (Array.isArray(req.body.task_deps)) {
        const insDep = db.prepare('INSERT OR IGNORE INTO task_deps (task_id, blocked_by_id) VALUES (?,?)');
        req.body.task_deps.forEach(d => {
          const newTaskId = taskMap[d.task_id];
          const newBlockedById = taskMap[d.blocked_by_id];
          if (newTaskId && newBlockedById) insDep.run(newTaskId, newBlockedById);
        });
      }

      // Notes
      if (Array.isArray(req.body.notes)) {
        const insNote = db.prepare('INSERT INTO notes (title, content, goal_id, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?)');
        req.body.notes.forEach(n => {
          insNote.run(n.title, n.content || '', n.goal_id ? (goalMap[n.goal_id] || null) : null, req.userId, n.created_at || new Date().toISOString(), n.updated_at || new Date().toISOString());
        });
      }

      // Custom field definitions + values
      if (Array.isArray(req.body.custom_field_defs)) {
        const insField = db.prepare('INSERT INTO custom_field_defs (name, field_type, options, position, required, show_in_card, user_id) VALUES (?,?,?,?,?,?,?)');
        req.body.custom_field_defs.forEach(f => {
          const r = insField.run(f.name, f.field_type, f.options || null, f.position || 0, f.required || 0, f.show_in_card || 0, req.userId);
          fieldMap[f.id] = r.lastInsertRowid;
        });
      }
      if (Array.isArray(req.body.task_custom_values)) {
        const insVal = db.prepare('INSERT OR IGNORE INTO task_custom_values (task_id, field_id, value) VALUES (?,?,?)');
        req.body.task_custom_values.forEach(v => {
          const newTaskId = taskMap[v.task_id];
          const newFieldId = fieldMap[v.field_id];
          if (newTaskId && newFieldId) insVal.run(newTaskId, newFieldId, v.value);
        });
      }

      // Automation rules
      if (Array.isArray(req.body.automation_rules)) {
        const insRule = db.prepare('INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, enabled, user_id) VALUES (?,?,?,?,?,?,?)');
        req.body.automation_rules.forEach(r => {
          insRule.run(r.name, r.trigger_type, r.trigger_config || '{}', r.action_type, r.action_config || '{}', r.enabled !== undefined ? r.enabled : 1, req.userId);
        });
      }

      // Saved filters
      if (Array.isArray(req.body.saved_filters)) {
        const insFilter = db.prepare('INSERT INTO saved_filters (name, icon, color, filters, position, user_id) VALUES (?,?,?,?,?,?)');
        req.body.saved_filters.forEach(f => {
          insFilter.run(f.name, f.icon || '🔍', f.color || '#2563EB', f.filters || '{}', f.position || 0, req.userId);
        });
      }

      // Task templates
      if (Array.isArray(req.body.task_templates)) {
        db.prepare('DELETE FROM task_templates WHERE user_id=?').run(req.userId);
        const insTpl = db.prepare('INSERT INTO task_templates (name, description, icon, tasks, user_created, source_type, user_id) VALUES (?,?,?,?,?,?,?)');
        req.body.task_templates.forEach(t => {
          insTpl.run(t.name, t.description || '', t.icon || '📋', t.tasks || '[]', t.user_created || 0, t.source_type || 'task', req.userId);
        });
      }

      // Weekly reviews
      if (Array.isArray(req.body.weekly_reviews)) {
        db.prepare('DELETE FROM weekly_reviews WHERE user_id=?').run(req.userId);
        const insReview = db.prepare('INSERT INTO weekly_reviews (week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities, rating, user_id) VALUES (?,?,?,?,?,?,?,?)');
        req.body.weekly_reviews.forEach(r => {
          insReview.run(r.week_start, r.tasks_completed || 0, r.tasks_created || 0, r.top_accomplishments || '[]', r.reflection || '', r.next_week_priorities || '[]', r.rating || null, req.userId);
        });
      }

      // Inbox
      if (Array.isArray(req.body.inbox)) {
        db.prepare('DELETE FROM inbox WHERE user_id=?').run(req.userId);
        const insInbox = db.prepare('INSERT INTO inbox (title, note, priority, user_id) VALUES (?,?,?,?)');
        req.body.inbox.forEach(i => {
          insInbox.run(i.title, i.note || '', i.priority || 0, req.userId);
        });
      }

      // Badges
      if (Array.isArray(req.body.badges)) {
        try { db.prepare('DELETE FROM badges WHERE user_id=?').run(req.userId); } catch(e) {}
        const insBadge = db.prepare('INSERT OR IGNORE INTO badges (type, earned_at, user_id) VALUES (?,?,?)');
        req.body.badges.forEach(b => {
          insBadge.run(b.type, b.earned_at || new Date().toISOString(), req.userId);
        });
      }

      // Settings
      if (Array.isArray(req.body.settings)) {
        db.prepare('DELETE FROM settings WHERE user_id=?').run(req.userId);
        const insSetting = db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?,?,?)');
        req.body.settings.forEach(s => {
          insSetting.run(req.userId, s.key, s.value);
        });
      }

      // Goal milestones
      if (Array.isArray(req.body.goal_milestones)) {
        const insMilestone = db.prepare('INSERT INTO goal_milestones (goal_id, title, done, position, completed_at) VALUES (?,?,?,?,?)');
        req.body.goal_milestones.forEach(m => {
          const newGoalId = goalMap[m.goal_id];
          if (newGoalId) insMilestone.run(newGoalId, m.title, m.done || 0, m.position || 0, m.completed_at || null);
        });
      }

      // Webhooks
      if (Array.isArray(req.body.webhooks)) {
        const insWebhook = db.prepare('INSERT INTO webhooks (name, url, events, secret, active, user_id, created_at) VALUES (?,?,?,?,?,?,?)');
        req.body.webhooks.forEach(w => {
          insWebhook.run(w.name, w.url, w.events || '[]', w.secret || '', w.active !== undefined ? w.active : 1, req.userId, w.created_at || new Date().toISOString());
        });
      }

      // API tokens
      if (Array.isArray(req.body.api_tokens)) {
        const insToken = db.prepare('INSERT INTO api_tokens (name, token_hash, user_id, last_used_at, created_at, expires_at) VALUES (?,?,?,?,?,?)');
        req.body.api_tokens.forEach(t => {
          insToken.run(t.name, t.token_hash, req.userId, t.last_used_at || null, t.created_at || new Date().toISOString(), t.expires_at || null);
        });
      }

      // Push subscriptions
      if (Array.isArray(req.body.push_subscriptions)) {
        const insPush = db.prepare('INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, created_at) VALUES (?,?,?,?,?)');
        req.body.push_subscriptions.forEach(p => {
          insPush.run(p.endpoint, p.p256dh, p.auth, req.userId, p.created_at || new Date().toISOString());
        });
      }
    });
    try {
      importTx();
      if (audit) audit.log(req.userId, 'data_import', 'import', null, req);
      res.json({ ok: true, message: 'Import successful' });
    } catch (e) {
      logger.error({ err: e }, 'Data import failed');
      res.status(500).json({ error: 'Import failed' });
    }
  });

  // ─── Global Unified Search (FTS5) ───
  router.get('/api/search', (req, res) => {
    const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const q = (rawQ || '').trim();
    if (!q) return res.json({ results: [], query: '' });
    const sanitized = q.replace(/[^\w\s'-]/g, '').trim();
    if (!sanitized) return res.json({ results: [], query: q });
    const ftsQuery = sanitized.split(/\s+/).map(w => w + '*').join(' ');
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    try {
      const rows = db.prepare(`
        SELECT type, source_id, title, snippet(search_index, 4, '<mark>', '</mark>', '\u2026', 24) as snippet, context, rank
        FROM search_index WHERE search_index MATCH ? AND user_id=?
        ORDER BY rank LIMIT ?
      `).all(ftsQuery, req.userId, limit);
      res.json({ results: rows, query: q });
    } catch {
      const term = '%' + sanitized + '%';
      const rows = db.prepare(`
        SELECT type, source_id, title, body as snippet, context, 0 as rank
        FROM search_index WHERE user_id=? AND (title LIKE ? OR body LIKE ?)
        ORDER BY type LIMIT ?
      `).all(req.userId, term, term, limit);
      res.json({ results: rows, query: q });
    }
  });

  // ─── iCal Export ───
  router.get('/api/export/ical', (req, res) => {
    const tasks = db.prepare(`
      SELECT t.*, g.title as goal_title, a.name as area_name
      FROM tasks t JOIN goals g ON t.goal_id=g.id JOIN life_areas a ON g.area_id=a.id
      WHERE t.due_date IS NOT NULL AND t.status != 'done' AND t.user_id=?
      ORDER BY t.due_date
    `).all(req.userId);
    const now = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//LifeFlow//EN\r\nX-WR-CALNAME:LifeFlow Tasks\r\n';
    for (const t of tasks) {
      const d = t.due_date.replace(/-/g, '');
      const uid = `task-${t.id}@lifeflow`;
      const summary = t.title.replace(/[\\;,]/g, c => '\\' + c);
      const desc = `${t.area_name} \u2192 ${t.goal_title}`.replace(/[\\;,]/g, c => '\\' + c);
      ical += `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${now}\r\nDTSTART;VALUE=DATE:${d}\r\n`;
      ical += `SUMMARY:${summary}\r\nDESCRIPTION:${desc}\r\n`;
      if (t.priority >= 2) ical += 'PRIORITY:1\r\n';
      else if (t.priority === 1) ical += 'PRIORITY:5\r\n';
      if (t.recurring) {
        const rmap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
        if (rmap[t.recurring]) ical += `RRULE:FREQ=${rmap[t.recurring]}\r\n`;
      }
      ical += 'END:VEVENT\r\n';
    }
    ical += 'END:VCALENDAR\r\n';
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="lifeflow.ics"');
    res.send(ical);
  });

  // ─── External Importers ───

  // Import from Todoist JSON export
  router.post('/api/import/todoist', (req, res) => {
    const { items, projects } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.json({ imported: 0, message: 'No items to import' });
    }

    const importTx = db.transaction(() => {
      // Create a default area + goal for imported Todoist tasks
      const areaResult = db.prepare('INSERT INTO life_areas (name, icon, color, position, user_id) VALUES (?,?,?,?,?)')
        .run('Todoist Import', '📥', '#6366F1', 0, req.userId);
      const areaId = areaResult.lastInsertRowid;

      // Map Todoist projects → goals
      const goalMap = {};
      if (Array.isArray(projects)) {
        for (const p of projects) {
          const gr = db.prepare('INSERT INTO goals (area_id, title, color, status, position, user_id) VALUES (?,?,?,?,?,?)')
            .run(areaId, String(p.name || 'Imported').slice(0, 200), '#6366F1', 'active', 0, req.userId);
          goalMap[p.id] = gr.lastInsertRowid;
        }
      }
      // Default goal for unmatched items
      const defGoal = db.prepare('INSERT INTO goals (area_id, title, color, status, position, user_id) VALUES (?,?,?,?,?,?)')
        .run(areaId, 'Imported Tasks', '#6366F1', 'active', 0, req.userId);
      const defaultGoalId = defGoal.lastInsertRowid;

      let count = 0;
      for (const item of items) {
        const goalId = goalMap[item.project_id] || defaultGoalId;
        const priority = item.priority === 4 ? 3 : item.priority === 3 ? 2 : item.priority === 2 ? 1 : 0;
        const status = item.checked ? 'done' : 'todo';
        const dueDate = item.due?.date || null;
        db.prepare('INSERT INTO tasks (goal_id, title, status, priority, due_date, position, user_id) VALUES (?,?,?,?,?,?,?)')
          .run(goalId, String(item.content || '').slice(0, 500), status, priority, dueDate, count, req.userId);
        count++;
      }
      return count;
    });

    const imported = importTx();
    res.json({ imported, message: `Imported ${imported} tasks from Todoist` });
  });

  // Import from Trello JSON export
  router.post('/api/import/trello', (req, res) => {
    const { cards, lists: trelloLists } = req.body;
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.json({ imported: 0, message: 'No cards to import' });
    }

    const importTx = db.transaction(() => {
      const areaResult = db.prepare('INSERT INTO life_areas (name, icon, color, position, user_id) VALUES (?,?,?,?,?)')
        .run('Trello Import', '📋', '#0079BF', 0, req.userId);
      const areaId = areaResult.lastInsertRowid;

      // Map Trello lists → goals
      const goalMap = {};
      if (Array.isArray(trelloLists)) {
        for (const l of trelloLists) {
          const gr = db.prepare('INSERT INTO goals (area_id, title, color, status, position, user_id) VALUES (?,?,?,?,?,?)')
            .run(areaId, String(l.name || 'List').slice(0, 200), '#0079BF', 'active', 0, req.userId);
          goalMap[l.id] = gr.lastInsertRowid;
        }
      }
      const defGoal = db.prepare('INSERT INTO goals (area_id, title, color, status, position, user_id) VALUES (?,?,?,?,?,?)')
        .run(areaId, 'Imported Cards', '#0079BF', 'active', 0, req.userId);
      const defaultGoalId = defGoal.lastInsertRowid;

      let count = 0;
      for (const card of cards) {
        const goalId = goalMap[card.idList] || defaultGoalId;
        const status = card.closed ? 'done' : 'todo';
        const dueDate = card.due ? card.due.slice(0, 10) : null;
        db.prepare('INSERT INTO tasks (goal_id, title, note, status, due_date, position, user_id) VALUES (?,?,?,?,?,?,?)')
          .run(goalId, String(card.name || '').slice(0, 500), String(card.desc || '').slice(0, 5000), status, dueDate, count, req.userId);
        count++;
      }
      return count;
    });

    const imported = importTx();
    res.json({ imported, message: `Imported ${imported} cards from Trello` });
  });

  return router;
};
