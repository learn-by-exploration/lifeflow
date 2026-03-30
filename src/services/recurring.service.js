/**
 * Recurring task service — shared logic for spawning next occurrence.
 * Eliminates duplication between PUT /api/tasks/:id and POST /api/tasks/:id/skip.
 */
class RecurringService {
  constructor(db, deps) {
    this.db = db;
    this.nextDueDate = deps.nextDueDate;
    this.getNextPosition = deps.getNextPosition;
  }

  /**
   * Spawn the next occurrence of a recurring task.
   * @param {object} task — the completed/skipped task row
   * @param {number} userId
   * @returns {number|null} — new task ID, or null if no next date
   */
  spawnNext(task, userId) {
    const nd = this.nextDueDate(task.due_date, task.recurring);
    if (!nd) return null;

    // Increment occurrence count for endAfter tracking
    let newRecurring = task.recurring;
    try {
      const rcfg = JSON.parse(task.recurring);
      if (rcfg && typeof rcfg === 'object') {
        rcfg.count = (rcfg.count || 0) + 1;
        newRecurring = JSON.stringify(rcfg);
      }
    } catch {}

    const db = this.db;
    const pos = this.getNextPosition('tasks', 'goal_id', task.goal_id);
    const spawnTx = db.transaction(() => {
      const r = db.prepare(
        'INSERT INTO tasks (goal_id,title,note,priority,due_date,due_time,recurring,assigned_to,my_day,position,time_block_start,time_block_end,estimated_minutes,list_id,user_id,assigned_to_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        task.goal_id, task.title, task.note, task.priority, nd,
        task.due_time, newRecurring, task.assigned_to, 0, pos,
        task.time_block_start || null, task.time_block_end || null,
        task.estimated_minutes || null, task.list_id || null, userId,
        task.assigned_to_user_id || null
      );
      // Copy tags to new task
      const oldTags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(task.id);
      const insTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)');
      oldTags.forEach(tt => insTag.run(r.lastInsertRowid, tt.tag_id));
      // Copy subtasks to new task (reset done=0)
      const oldSubs = db.prepare('SELECT title, note, position FROM subtasks WHERE task_id=? ORDER BY position').all(task.id);
      const insSub = db.prepare('INSERT INTO subtasks (task_id, title, note, done, position) VALUES (?, ?, ?, 0, ?)');
      oldSubs.forEach(s => insSub.run(r.lastInsertRowid, s.title, s.note || '', s.position));
      // Copy custom field values to new task
      const oldCfv = db.prepare('SELECT field_id, value FROM task_custom_values WHERE task_id=?').all(task.id);
      if (oldCfv.length) {
        const insCfv = db.prepare('INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?, ?, ?)');
        oldCfv.forEach(v => insCfv.run(r.lastInsertRowid, v.field_id, v.value));
      }
      return r.lastInsertRowid;
    });
    return spawnTx();
  }
}

module.exports = RecurringService;
