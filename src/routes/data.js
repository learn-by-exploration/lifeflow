const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

module.exports = function(deps) {
  const { db, enrichTasks, dbDir, audit } = deps;
  const router = Router();

  // ─── Auto Backup ───
  const backupDir = path.join(dbDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  function runBackup(userId) {
    const areas = db.prepare('SELECT * FROM life_areas WHERE user_id=? ORDER BY position').all(userId);
    const goals = db.prepare('SELECT * FROM goals WHERE user_id=? ORDER BY area_id, position').all(userId);
    const tasks = enrichTasks(db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY goal_id, position').all(userId));
    const tags = db.prepare('SELECT * FROM tags WHERE user_id=? ORDER BY name').all(userId);
    // Safety: don't overwrite good backups with empty data
    if (areas.length === 0 && goals.length === 0 && tasks.length === 0) {
      logger.warn({ userId }, 'Skipping backup — database appears empty, refusing to overwrite valid backups');
      return null;
    }
    const data = JSON.stringify({ backupDate: new Date().toISOString(), areas, goals, tasks, tags });
    const fname = `lifeflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    fs.writeFileSync(path.join(backupDir, fname), data);
    // Rotate: keep last 14
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('lifeflow-backup-')).sort();
    while (files.length > 14) { fs.unlinkSync(path.join(backupDir, files.shift())); }
    return fname;
  }

  // Backup on startup (for default user)
  try { runBackup(1); } catch(e) { logger.error({ err: e }, 'Startup backup failed'); }
  // Backup every 24h
  setInterval(() => { try { runBackup(1); } catch(e) { logger.error({ err: e }, 'Scheduled backup failed'); } }, 24 * 60 * 60 * 1000);

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
    const areas = db.prepare('SELECT * FROM life_areas WHERE user_id=? ORDER BY position').all(req.userId);
    const goals = db.prepare('SELECT * FROM goals WHERE user_id=? ORDER BY area_id, position').all(req.userId);
    const tasks = enrichTasks(db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY goal_id, position').all(req.userId));
    const tags = db.prepare('SELECT * FROM tags WHERE user_id=? ORDER BY name').all(req.userId);
    // Extended tables
    const habits = db.prepare('SELECT * FROM habits WHERE user_id=? ORDER BY position').all(req.userId);
    const habitIds = habits.map(h => h.id);
    const habit_logs = habitIds.length
      ? db.prepare(`SELECT * FROM habit_logs WHERE habit_id IN (${habitIds.map(() => '?').join(',')}) ORDER BY date`).all(...habitIds)
      : [];
    const focus_sessions = db.prepare('SELECT * FROM focus_sessions WHERE user_id=?').all(req.userId);
    const taskIds = tasks.map(t => t.id);
    const task_comments = taskIds.length
      ? db.prepare(`SELECT * FROM task_comments WHERE task_id IN (${taskIds.map(() => '?').join(',')}) ORDER BY created_at`).all(...taskIds)
      : [];
    const task_deps = taskIds.length
      ? db.prepare(`SELECT * FROM task_deps WHERE task_id IN (${taskIds.map(() => '?').join(',')})`)
          .all(...taskIds)
      : [];
    const notes = db.prepare('SELECT * FROM notes WHERE user_id=? ORDER BY updated_at DESC').all(req.userId);
    const lists = db.prepare('SELECT * FROM lists WHERE user_id=? ORDER BY position').all(req.userId);
    const listIds = lists.map(l => l.id);
    const list_items = listIds.length
      ? db.prepare(`SELECT * FROM list_items WHERE list_id IN (${listIds.map(() => '?').join(',')}) ORDER BY position`).all(...listIds)
      : [];
    const custom_field_defs = db.prepare('SELECT * FROM custom_field_defs WHERE user_id=? ORDER BY position').all(req.userId);
    const task_custom_values = taskIds.length
      ? db.prepare(`SELECT * FROM task_custom_values WHERE task_id IN (${taskIds.map(() => '?').join(',')})`)
          .all(...taskIds)
      : [];
    const automation_rules = db.prepare('SELECT * FROM automation_rules WHERE user_id=?').all(req.userId);
    const saved_filters = db.prepare('SELECT * FROM saved_filters WHERE user_id=? ORDER BY position').all(req.userId);
    const task_templates = db.prepare('SELECT * FROM task_templates WHERE user_id=?').all(req.userId);
    const weekly_reviews = db.prepare('SELECT * FROM weekly_reviews WHERE user_id=? ORDER BY week_start DESC').all(req.userId);
    const inbox = db.prepare('SELECT * FROM inbox WHERE user_id=? ORDER BY created_at').all(req.userId);
    const badges = db.prepare('SELECT * FROM badges WHERE user_id=?').all(req.userId);
    const settings = db.prepare('SELECT * FROM settings WHERE user_id=?').all(req.userId);
    const goalIds = goals.map(g => g.id);
    const goal_milestones = goalIds.length
      ? db.prepare(`SELECT * FROM goal_milestones WHERE goal_id IN (${goalIds.map(() => '?').join(',')}) ORDER BY position`).all(...goalIds)
      : [];
    res.setHeader('Content-Disposition', 'attachment; filename=lifeflow-export.json');
    if (audit) audit.log(req.userId, 'data_export', 'export', null, req);
    res.json({
      exportDate: new Date().toISOString(), areas, goals, tasks, tags,
      habits, habit_logs, focus_sessions, task_comments, task_deps,
      notes, lists, list_items, custom_field_defs, task_custom_values,
      automation_rules, saved_filters, task_templates, weekly_reviews,
      inbox, badges, settings, goal_milestones,
    });
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
      const insArea = db.prepare('INSERT INTO life_areas (name, icon, color, position, user_id) VALUES (?, ?, ?, ?, ?)');
      areas.forEach(a => {
        const r = insArea.run(a.name, a.icon || '📂', a.color || '#2563EB', a.position || 0, req.userId);
        areaMap[a.id] = r.lastInsertRowid;
      });

      // Import goals
      const insGoal = db.prepare('INSERT INTO goals (area_id, title, description, due_date, color, status, position, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      goals.forEach(g => {
        const newAreaId = areaMap[g.area_id];
        if (!newAreaId) return; // skip orphan goals
        const r = insGoal.run(newAreaId, g.title, g.description || '', g.due_date || null, g.color || '#6C63FF', g.status || 'active', g.position || 0, req.userId);
        goalMap[g.id] = r.lastInsertRowid;
      });

      // Import tasks
      const insTask = db.prepare('INSERT INTO tasks (goal_id, title, note, status, priority, due_date, my_day, position, recurring, completed_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insSubtask = db.prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, ?, ?)');
      const insTaskTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
      tasks.forEach(t => {
        const newGoalId = goalMap[t.goal_id];
        if (!newGoalId) return; // skip orphan tasks
        const r = insTask.run(newGoalId, t.title, t.notes || t.note || '', t.status || 'todo', t.priority || 0, t.due_date || null, t.my_day ? 1 : 0, t.position || 0, t.recurring || null, t.completed_at || null, req.userId);
        const newTaskId = r.lastInsertRowid;
        taskMap[t.id] = newTaskId;
        // Subtasks
        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach(s => insSubtask.run(newTaskId, s.title, s.done ? 1 : 0, s.position || 0));
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
        const insHabit = db.prepare('INSERT INTO habits (name, icon, color, frequency, target, position, area_id, user_id) VALUES (?,?,?,?,?,?,?,?)');
        req.body.habits.forEach(h => {
          const r = insHabit.run(h.name, h.icon || '✅', h.color || '#22C55E', h.frequency || 'daily', h.target || 1, h.position || 0, h.area_id ? (areaMap[h.area_id] || null) : null, req.userId);
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
        const insFocus = db.prepare('INSERT INTO focus_sessions (task_id, started_at, duration_sec, type, user_id) VALUES (?,?,?,?,?)');
        req.body.focus_sessions.forEach(f => {
          const newTaskId = taskMap[f.task_id];
          if (newTaskId) insFocus.run(newTaskId, f.started_at, f.duration_sec || 0, f.type || 'pomodoro', req.userId);
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

      // Lists + list_items
      if (Array.isArray(req.body.lists)) {
        const insList = db.prepare('INSERT INTO lists (name, type, icon, color, position, user_id) VALUES (?,?,?,?,?,?)');
        req.body.lists.forEach(l => {
          const r = insList.run(l.name, l.type || 'checklist', l.icon || '📋', l.color || '#2563EB', l.position || 0, req.userId);
          listMap[l.id] = r.lastInsertRowid;
        });
      }
      if (Array.isArray(req.body.list_items)) {
        const insItem = db.prepare('INSERT INTO list_items (list_id, title, checked, category, quantity, note, position) VALUES (?,?,?,?,?,?,?)');
        req.body.list_items.forEach(i => {
          const newListId = listMap[i.list_id];
          if (newListId) insItem.run(newListId, i.title, i.checked || 0, i.category || null, i.quantity || null, i.note || '', i.position || 0);
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
