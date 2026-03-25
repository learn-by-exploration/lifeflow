const { Router } = require('express');
const path = require('path');
const fs = require('fs');

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
    const data = JSON.stringify({ backupDate: new Date().toISOString(), areas, goals, tasks, tags });
    const fname = `lifeflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    fs.writeFileSync(path.join(backupDir, fname), data);
    // Rotate: keep last 7
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('lifeflow-backup-')).sort();
    while (files.length > 7) { fs.unlinkSync(path.join(backupDir, files.shift())); }
    return fname;
  }

  // Backup on startup (for default user)
  try { runBackup(1); } catch(e) { console.error('Backup failed:', e.message); }
  // Backup every 24h
  setInterval(() => { try { runBackup(1); } catch(e) { console.error('Backup failed:', e.message); } }, 24 * 60 * 60 * 1000);

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
    res.setHeader('Content-Disposition', 'attachment; filename=lifeflow-export.json');
    if (audit) audit.log(req.userId, 'data_export', 'export', null, req);
    res.json({ exportDate: new Date().toISOString(), areas, goals, tasks, tags });
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
      db.prepare('DELETE FROM focus_sessions WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id=?)').run(req.userId);
      db.prepare('DELETE FROM tasks WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM goals WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM life_areas WHERE user_id=?').run(req.userId);
      db.prepare('DELETE FROM tags WHERE user_id=?').run(req.userId);

      // Map old IDs to new IDs
      const areaMap = {}, goalMap = {}, tagMap = {};

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
    });
    try {
      importTx();
      if (audit) audit.log(req.userId, 'data_import', 'import', null, req);
      res.json({ ok: true, message: 'Import successful' });
    } catch (e) {
      console.error('Import failed:', e.message);
      res.status(500).json({ error: 'Import failed' });
    }
  });

  // ─── Global Unified Search (FTS5) ───
  router.get('/api/search', (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [], query: '' });
    const sanitized = q.replace(/[^\w\s'-]/g, '').trim();
    if (!sanitized) return res.json({ results: [], query: q });
    const ftsQuery = sanitized.split(/\s+/).map(w => w + '*').join(' ');
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    try {
      const rows = db.prepare(`
        SELECT type, source_id, title, snippet(search_index, 3, '<mark>', '</mark>', '\u2026', 24) as snippet, context, rank
        FROM search_index WHERE search_index MATCH ?
        ORDER BY rank LIMIT ?
      `).all(ftsQuery, limit);
      res.json({ results: rows, query: q });
    } catch {
      const term = '%' + sanitized + '%';
      const rows = db.prepare(`
        SELECT type, source_id, title, body as snippet, context, 0 as rank
        FROM search_index WHERE title LIKE ? OR body LIKE ?
        ORDER BY type LIMIT ?
      `).all(term, term, limit);
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

  return router;
};
