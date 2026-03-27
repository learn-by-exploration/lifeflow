class FiltersRepository {
  constructor(db) {
    this.db = db;
    this._stmts = {
      findAll: db.prepare('SELECT * FROM saved_filters WHERE user_id=? ORDER BY position'),
      findById: db.prepare('SELECT * FROM saved_filters WHERE id=? AND user_id=?'),
      create: db.prepare('INSERT INTO saved_filters (name,icon,color,filters,position,user_id) VALUES (?,?,?,?,?,?)'),
      update: db.prepare('UPDATE saved_filters SET name=COALESCE(?,name),icon=COALESCE(?,icon),color=COALESCE(?,color),filters=COALESCE(?,filters) WHERE id=? AND user_id=?'),
      remove: db.prepare('DELETE FROM saved_filters WHERE id=? AND user_id=?'),
    };
  }

  findAll(userId) {
    return this._stmts.findAll.all(userId);
  }

  findById(id, userId) {
    return this._stmts.findById.get(id, userId);
  }

  create(data, position, userId) {
    const r = this._stmts.create.run(data.name, data.icon, data.color, JSON.stringify(data.filters), position, userId);
    return this.db.prepare('SELECT * FROM saved_filters WHERE id=?').get(r.lastInsertRowid);
  }

  update(id, userId, { name, icon, color, filters }) {
    this._stmts.update.run(
      name || null, icon || null, color || null,
      filters ? JSON.stringify(filters) : null, id, userId
    );
    return this._stmts.findById.get(id, userId);
  }

  remove(id, userId) {
    return this._stmts.remove.run(id, userId);
  }
}

module.exports = FiltersRepository;
