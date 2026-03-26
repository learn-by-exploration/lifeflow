module.exports = function createHelpers(db) {
  function verifyGoalOwnership(goalId, userId) {
    const goal = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(goalId, userId);
    return !!goal;
  }
  function getTaskTags(taskId) {
    return db.prepare('SELECT t.* FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id=?').all(taskId);
  }
  function getSubtasks(taskId) {
    return db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(taskId);
  }
  function getBlockedBy(taskId) {
    return db.prepare('SELECT t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id=?').all(taskId);
  }
  function getNextPosition(table, scopeCol, scopeVal) {
    const sql = scopeCol
      ? `SELECT COALESCE(MAX(position),-1)+1 as p FROM ${table} WHERE ${scopeCol}=?`
      : `SELECT COALESCE(MAX(position),-1)+1 as p FROM ${table}`;
    return scopeCol ? db.prepare(sql).get(scopeVal).p : db.prepare(sql).get().p;
  }
  function enrichTask(t) {
    return enrichTasks([t])[0];
  }
  function enrichTasks(tasks) {
    if (!tasks.length) return tasks;
    const ids = tasks.map(t => t.id);
    const ph = ids.map(() => '?').join(',');
    const allTags = db.prepare(`SELECT tt.task_id, t.* FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id IN (${ph})`).all(...ids);
    const tagMap = {};
    allTags.forEach(r => { (tagMap[r.task_id] = tagMap[r.task_id] || []).push({ id: r.id, name: r.name, color: r.color }); });
    const allSubs = db.prepare(`SELECT * FROM subtasks WHERE task_id IN (${ph}) ORDER BY position`).all(...ids);
    const subMap = {};
    allSubs.forEach(r => { (subMap[r.task_id] = subMap[r.task_id] || []).push(r); });
    const allDeps = db.prepare(`SELECT d.task_id, t.id, t.title, t.status FROM tasks t JOIN task_deps d ON t.id=d.blocked_by_id WHERE d.task_id IN (${ph})`).all(...ids);
    const depMap = {};
    allDeps.forEach(r => { (depMap[r.task_id] = depMap[r.task_id] || []).push({ id: r.id, title: r.title, status: r.status }); });
    const listIds = [...new Set(tasks.filter(t => t.list_id).map(t => t.list_id))];
    const listMap = {};
    if (listIds.length) {
      const lph = listIds.map(() => '?').join(',');
      db.prepare(`SELECT id, name, icon, color FROM lists WHERE id IN (${lph})`).all(...listIds).forEach(l => { listMap[l.id] = l; });
    }
    return tasks.map(t => {
      t.tags = tagMap[t.id] || [];
      t.subtasks = subMap[t.id] || [];
      t.subtask_done = t.subtasks.filter(s => s.done).length;
      t.subtask_total = t.subtasks.length;
      t.blocked_by = depMap[t.id] || [];
      if (t.list_id && listMap[t.list_id]) {
        t.list_name = listMap[t.list_id].name;
        t.list_icon = listMap[t.list_id].icon;
        t.list_color = listMap[t.list_id].color;
      }
      return t;
    });
  }
  function nextDueDate(dueDate, recurrence) {
    if (!dueDate || !recurrence) return null;
    const d = new Date(dueDate + 'T00:00:00');
    // Try to parse JSON recurring config
    let cfg = null;
    try { cfg = JSON.parse(recurrence); } catch {}
    if (cfg && typeof cfg === 'object') {
      // Advanced recurring: {pattern, interval, days, endAfter, endDate, count}
      const p = cfg.pattern || 'daily';
      const n = cfg.interval || 1;
      if (p === 'daily') d.setDate(d.getDate() + n);
      else if (p === 'weekly') d.setDate(d.getDate() + 7 * n);
      else if (p === 'biweekly') d.setDate(d.getDate() + 14);
      else if (p === 'monthly') {
        const origDay = d.getDate();
        for (let i = 0; i < n; i++) {
          d.setDate(1); // avoid month-end overflow
          d.setMonth(d.getMonth() + 1);
          const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          d.setDate(Math.min(origDay, maxDay));
        }
      }
      else if (p === 'yearly') d.setFullYear(d.getFullYear() + n);
      else if (p === 'weekdays') {
        do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      } else if (p === 'specific-days' && Array.isArray(cfg.days)) {
        // days = [0-6] (Sun-Sat). Find next matching day. Guard: max 8 iterations.
        let found = false;
        for (let i = 0; i < 8; i++) {
          d.setDate(d.getDate() + 1);
          if (cfg.days.includes(d.getDay())) { found = true; break; }
        }
        if (!found) return null;
      } else return null;
      // Check end conditions
      const nextDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (cfg.endDate && nextDate > cfg.endDate) return null;
      if (cfg.endAfter && typeof cfg.count === 'number' && cfg.count >= cfg.endAfter) return null;
    } else {
      // Simple string recurrence (backward compatible)
      if (recurrence === 'daily') d.setDate(d.getDate() + 1);
      else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
      else if (recurrence === 'biweekly') d.setDate(d.getDate() + 14);
      else if (recurrence === 'monthly') {
        const origDay = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(origDay, maxDay));
      }
      else if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
      else {
        const evDays = recurrence.match(/^every-(\d+)-days$/);
        const evWeeks = recurrence.match(/^every-(\d+)-weeks$/);
        if (evDays) { const n = Math.min(Math.max(1, Number(evDays[1])), 36500); d.setDate(d.getDate() + n); }
        else if (evWeeks) { const n = Math.min(Math.max(1, Number(evWeeks[1])), 5200); d.setDate(d.getDate() + n * 7); }
        else if (recurrence === 'weekdays') {
          do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
        }
        else return null;
      }
    }
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function executeRules(event, task) {
    const rules = db.prepare('SELECT * FROM automation_rules WHERE enabled=1 AND trigger_type=?').all(event);
    rules.forEach(rule => {
      let tc, ac;
      try { tc = JSON.parse(rule.trigger_config || '{}'); } catch { tc = {}; }
      try { ac = JSON.parse(rule.action_config || '{}'); } catch { ac = {}; }
      if (tc.area_id && task.area_id !== tc.area_id) return;
      if (tc.goal_id && task.goal_id !== tc.goal_id) return;
      if (tc.priority !== undefined && task.priority !== tc.priority) return;
      if (rule.action_type === 'add_to_myday') {
        db.prepare('UPDATE tasks SET my_day=1 WHERE id=?').run(task.id);
      } else if (rule.action_type === 'set_priority' && ac.priority !== undefined) {
        db.prepare('UPDATE tasks SET priority=? WHERE id=?').run(ac.priority, task.id);
      } else if (rule.action_type === 'add_tag' && ac.tag_id) {
        db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(task.id, ac.tag_id);
      } else if (rule.action_type === 'create_followup' && ac.title) {
        const fpos = getNextPosition('tasks', 'goal_id', task.goal_id);
        db.prepare('INSERT INTO tasks (goal_id, title, priority, position) VALUES (?,?,?,?)').run(
          task.goal_id, ac.title, ac.priority || 0, fpos
        );
      }
    });
  }
  return { getTaskTags, getSubtasks, getBlockedBy, getNextPosition, enrichTask, enrichTasks, nextDueDate, executeRules, verifyGoalOwnership };
};
