class AreasRepository {
  constructor(db) {
    this.db = db;
    this._stmts = {
      findById: db.prepare('SELECT * FROM life_areas WHERE id=? AND user_id=?'),
      create: db.prepare('INSERT INTO life_areas (name,icon,color,position,user_id) VALUES (?,?,?,?,?)'),
      updateWithView: db.prepare('UPDATE life_areas SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),position=COALESCE(?,position),default_view=? WHERE id=? AND user_id=?'),
      updateNoView: db.prepare('UPDATE life_areas SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),position=COALESCE(?,position) WHERE id=? AND user_id=?'),
      remove: db.prepare('DELETE FROM life_areas WHERE id=? AND user_id=?'),
      setArchived: db.prepare('UPDATE life_areas SET archived=? WHERE id=? AND user_id=?'),
      reorder: db.prepare('UPDATE life_areas SET position=? WHERE id=? AND user_id=?'),

      findGoalById: db.prepare('SELECT * FROM goals WHERE id=? AND user_id=?'),
      createGoal: db.prepare('INSERT INTO goals (area_id,title,description,color,due_date,position,user_id) VALUES (?,?,?,?,?,?,?)'),
      updateGoal: db.prepare('UPDATE goals SET title=COALESCE(?,title),description=COALESCE(?,description),color=COALESCE(?,color),status=COALESCE(?,status),due_date=? WHERE id=? AND user_id=?'),
      removeGoal: db.prepare('DELETE FROM goals WHERE id=? AND user_id=?'),

      findMilestoneOwned: db.prepare('SELECT m.* FROM goal_milestones m JOIN goals g ON m.goal_id=g.id WHERE m.id=? AND g.user_id=?'),
      removeMilestone: db.prepare('DELETE FROM goal_milestones WHERE id=?'),
    };
  }

  findAllWithCounts(userId, includeArchived) {
    const where = includeArchived ? 'WHERE a.user_id=?' : 'WHERE a.archived=0 AND a.user_id=?';
    return this.db.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM goals g WHERE g.area_id=a.id) as goal_count,
        (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status!='done') as pending_tasks,
        (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks t JOIN goals g ON t.goal_id=g.id WHERE g.area_id=a.id AND t.status='done') as done_tasks
      FROM life_areas a ${where} ORDER BY a.position
    `).all(userId);
  }

  findById(id, userId) {
    return this._stmts.findById.get(id, userId);
  }

  create(data, position, userId) {
    const r = this._stmts.create.run(data.name, data.icon, data.color, position, userId);
    return this._stmts.findById.get(r.lastInsertRowid, userId);
  }

  update(id, userId, data) {
    const { name, icon, color, position, default_view } = data;
    if (default_view !== undefined) {
      this._stmts.updateWithView.run(name || null, icon || null, color || null, position !== undefined ? position : null, default_view || null, id, userId);
    } else {
      this._stmts.updateNoView.run(name || null, icon || null, color || null, position !== undefined ? position : null, id, userId);
    }
    return this._stmts.findById.get(id, userId);
  }

  remove(id, userId) {
    return this._stmts.remove.run(id, userId);
  }

  setArchived(id, userId, archived) {
    this._stmts.setArchived.run(archived ? 1 : 0, id, userId);
    return this._stmts.findById.get(id, userId);
  }

  reorder(items, userId) {
    const tx = this.db.transaction(() => {
      for (const i of items) this._stmts.reorder.run(i.position, i.id, userId);
    });
    tx();
  }

  // Goals
  findGoalsForArea(areaId, userId) {
    return this.db.prepare(`
      SELECT g.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id) as total_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id AND t.status='done') as done_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id AND t.status!='done') as pending_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.goal_id=g.id AND t.status!='done' AND t.due_date < date('now')) as overdue_count
      FROM goals g WHERE g.area_id=? AND g.user_id=? ORDER BY g.position
    `).all(areaId, userId).map(g => ({
      ...g,
      progress_pct: g.total_tasks ? Math.round(100 * g.done_tasks / g.total_tasks) : 0,
      days_until_due: g.due_date ? Math.round((new Date(g.due_date) - new Date()) / 86400000) : null,
    }));
  }

  findGoalById(id, userId) {
    return this._stmts.findGoalById.get(id, userId);
  }

  createGoal(areaId, data, position, userId) {
    const r = this._stmts.createGoal.run(areaId, data.title, data.description, data.color, data.due_date, position, userId);
    return this._stmts.findGoalById.get(r.lastInsertRowid, userId);
  }

  updateGoal(id, userId, { title, description, color, status, due_date }) {
    this._stmts.updateGoal.run(
      title || null, description !== undefined ? description : null,
      color || null, status || null,
      due_date !== undefined ? due_date : null, id, userId
    );
    return this._stmts.findGoalById.get(id, userId);
  }

  removeGoal(id, userId) {
    return this._stmts.removeGoal.run(id, userId);
  }

  findAllGoals(userId, opts = {}) {
    if (opts.limit !== undefined) {
      const limit = Math.min(Math.max(1, Number(opts.limit) || 200), 500);
      const offset = Math.max(0, Number(opts.offset) || 0);
      const total = this.db.prepare("SELECT COUNT(*) as c FROM goals g WHERE g.status='active' AND g.user_id=?").get(userId).c;
      const items = this.db.prepare(`
        SELECT g.*, a.name as area_name, a.icon as area_icon
        FROM goals g JOIN life_areas a ON g.area_id=a.id
        WHERE g.status='active' AND g.user_id=?
        ORDER BY a.position, g.position LIMIT ? OFFSET ?
      `).all(userId, limit, offset);
      return { items, total, hasMore: offset + limit < total, offset };
    }
    return this.db.prepare(`
      SELECT g.*, a.name as area_name, a.icon as area_icon
      FROM goals g JOIN life_areas a ON g.area_id=a.id
      WHERE g.status='active' AND g.user_id=?
      ORDER BY a.position, g.position
    `).all(userId);
  }

  // Milestones
  findMilestones(goalId) {
    return this.db.prepare('SELECT * FROM goal_milestones WHERE goal_id=? ORDER BY position').all(goalId);
  }

  createMilestone(goalId, title, position) {
    const r = this.db.prepare('INSERT INTO goal_milestones (goal_id, title, position) VALUES (?,?,?)').run(goalId, title, position);
    return this.db.prepare('SELECT * FROM goal_milestones WHERE id=?').get(r.lastInsertRowid);
  }

  findMilestoneOwned(id, userId) {
    return this._stmts.findMilestoneOwned.get(id, userId);
  }

  updateMilestone(id, userId, { title, done }, existing) {
    const completedAt = done && !existing.done ? new Date().toISOString() : (done ? existing.completed_at : null);
    this.db.prepare('UPDATE goal_milestones SET title=COALESCE(?,title), done=COALESCE(?,done), completed_at=? WHERE id=? AND goal_id IN (SELECT id FROM goals WHERE user_id=?)').run(
      title || null, done !== undefined ? (done ? 1 : 0) : null, completedAt, id, userId
    );
    return this.db.prepare('SELECT * FROM goal_milestones WHERE id=?').get(id);
  }

  removeMilestone(id) {
    this._stmts.removeMilestone.run(id);
  }

  getGoalProgress(goalId) {
    return this.db.prepare('SELECT status, completed_at FROM tasks WHERE goal_id=?').all(goalId);
  }
}

module.exports = AreasRepository;
