class TagsRepository {
  constructor(db) {
    this.db = db;
    this._stmts = {
      findAll: db.prepare('SELECT * FROM tags WHERE user_id=? ORDER BY name'),
      findById: db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?'),
      findByName: db.prepare('SELECT * FROM tags WHERE name=? AND user_id=?'),
      findDuplicate: db.prepare('SELECT * FROM tags WHERE name=? AND id!=? AND user_id=?'),
      create: db.prepare('INSERT INTO tags (name,color,user_id) VALUES (?,?,?)'),
      updateName: db.prepare('UPDATE tags SET name=? WHERE id=? AND user_id=?'),
      updateColor: db.prepare('UPDATE tags SET color=? WHERE id=? AND user_id=?'),
      remove: db.prepare('DELETE FROM tags WHERE id=? AND user_id=?'),
      stats: db.prepare(`
        SELECT t.*, COUNT(tt.task_id) as usage_count
        FROM tags t LEFT JOIN task_tags tt ON t.id=tt.tag_id
        WHERE t.user_id=?
        GROUP BY t.id ORDER BY t.name
      `),
      clearTaskTags: db.prepare('DELETE FROM task_tags WHERE task_id=?'),
      addTaskTag: db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)'),
    };
  }

  findAll(userId) {
    return this._stmts.findAll.all(userId);
  }

  findById(id, userId) {
    return this._stmts.findById.get(id, userId);
  }

  findByName(name, userId) {
    return this._stmts.findByName.get(name, userId);
  }

  findDuplicate(name, excludeId, userId) {
    return this._stmts.findDuplicate.get(name, excludeId, userId);
  }

  create(name, color, userId) {
    const r = this._stmts.create.run(name, color, userId);
    return this._stmts.findById.get(r.lastInsertRowid, userId);
  }

  updateName(id, name, userId) {
    this._stmts.updateName.run(name, id, userId);
  }

  updateColor(id, color, userId) {
    this._stmts.updateColor.run(color, id, userId);
  }

  remove(id, userId) {
    return this._stmts.remove.run(id, userId);
  }

  stats(userId) {
    return this._stmts.stats.all(userId);
  }

  setTaskTags(taskId, tagIds) {
    this._stmts.clearTaskTags.run(taskId);
    for (const tid of tagIds) {
      if (Number.isInteger(tid)) this._stmts.addTaskTag.run(taskId, tid);
    }
  }
}

module.exports = TagsRepository;
