const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createCustomField, updateCustomField } = require('../schemas/custom-fields.schema');

module.exports = function(deps) {
  const { db } = deps;
  const router = Router();

  const VALID_TYPES = ['text', 'number', 'date', 'select'];

  // ── Field Definition CRUD ──

  router.get('/api/custom-fields', (req, res) => {
    const fields = db.prepare('SELECT * FROM custom_field_defs WHERE user_id=? ORDER BY position, id').all(req.userId);
    res.json(fields);
  });

  router.post('/api/custom-fields', validate(createCustomField), (req, res) => {
    const { name, field_type, options, position, required, show_in_card } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
    if (name.trim().length > 100) return res.status(400).json({ error: 'name too long (max 100)' });
    if (!VALID_TYPES.includes(field_type)) return res.status(400).json({ error: 'field_type must be text, number, date, or select' });
    if (field_type === 'select' && (!Array.isArray(options) || options.length === 0)) return res.status(400).json({ error: 'select type requires options array' });
    const optionsJson = Array.isArray(options) ? JSON.stringify(options) : null;
    try {
      const r = db.prepare(
        'INSERT INTO custom_field_defs (user_id, name, field_type, options, position, required, show_in_card) VALUES (?,?,?,?,?,?,?)'
      ).run(req.userId, name.trim(), field_type, optionsJson, position || 0, required ? 1 : 0, show_in_card ? 1 : 0);
      res.status(201).json(db.prepare('SELECT * FROM custom_field_defs WHERE id=?').get(r.lastInsertRowid));
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Field name already exists' });
      throw e;
    }
  });

  router.put('/api/custom-fields/:id', validate(updateCustomField), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM custom_field_defs WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'Field not found' });
    const { name, options, position, show_in_card } = req.body;
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'name must be non-empty' });
    const optionsJson = Array.isArray(options) ? JSON.stringify(options) : undefined;
    try {
      db.prepare(`UPDATE custom_field_defs SET
        name=COALESCE(?,name), options=COALESCE(?,options),
        position=COALESCE(?,position), show_in_card=COALESCE(?,show_in_card)
        WHERE id=? AND user_id=?`).run(
        name ? name.trim() : null,
        optionsJson !== undefined ? optionsJson : null,
        position !== undefined ? position : null,
        show_in_card !== undefined ? (show_in_card ? 1 : 0) : null,
        id, req.userId
      );
      res.json(db.prepare('SELECT * FROM custom_field_defs WHERE id=?').get(id));
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Field name already exists' });
      throw e;
    }
  });

  router.delete('/api/custom-fields/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM custom_field_defs WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'Field not found' });
    db.prepare('DELETE FROM custom_field_defs WHERE id=? AND user_id=?').run(id, req.userId);
    res.status(204).end();
  });

  // ── Task Custom Field Values ──

  router.get('/api/tasks/:id/custom-fields', (req, res) => {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'Invalid ID' });
    const task = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(taskId, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const values = db.prepare(`
      SELECT v.field_id, v.value, d.name, d.field_type, d.options
      FROM task_custom_values v
      JOIN custom_field_defs d ON v.field_id=d.id
      WHERE v.task_id=?
      ORDER BY d.position, d.id
    `).all(taskId);
    res.json(values);
  });

  router.put('/api/tasks/:id/custom-fields', (req, res) => {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId)) return res.status(400).json({ error: 'Invalid ID' });
    const task = db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(taskId, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields array required' });

    // Validate each field value
    for (const f of fields) {
      if (!f.field_id) return res.status(400).json({ error: 'field_id required' });
      const def = db.prepare('SELECT * FROM custom_field_defs WHERE id=? AND user_id=?').get(f.field_id, req.userId);
      if (!def) return res.status(400).json({ error: `Field ${f.field_id} not found` });

      const val = f.value;
      if (val !== null && val !== undefined) {
        if (def.field_type === 'text' && String(val).length > 500) {
          return res.status(400).json({ error: `${def.name}: text value too long (max 500)` });
        }
        if (def.field_type === 'number' && (isNaN(Number(val)) || !isFinite(Number(val)))) {
          return res.status(400).json({ error: `${def.name}: must be a valid number` });
        }
        if (def.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          return res.status(400).json({ error: `${def.name}: must be YYYY-MM-DD` });
        }
        if (def.field_type === 'select') {
          const opts = def.options ? JSON.parse(def.options) : [];
          if (!opts.includes(val)) {
            return res.status(400).json({ error: `${def.name}: value must be one of: ${opts.join(', ')}` });
          }
        }
      }
    }

    // Upsert values in transaction
    const upsertTx = db.transaction(() => {
      const upsert = db.prepare(
        'INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?,?,?) ON CONFLICT(task_id, field_id) DO UPDATE SET value=excluded.value'
      );
      for (const f of fields) {
        upsert.run(taskId, f.field_id, f.value !== undefined ? String(f.value) : null);
      }
    });
    upsertTx();

    // Return updated values
    const values = db.prepare(`
      SELECT v.field_id, v.value, d.name, d.field_type, d.options
      FROM task_custom_values v
      JOIN custom_field_defs d ON v.field_id=d.id
      WHERE v.task_id=?
      ORDER BY d.position, d.id
    `).all(taskId);
    res.json(values);
  });

  return router;
};
