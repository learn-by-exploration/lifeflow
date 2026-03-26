const { Router } = require('express');
const crypto = require('crypto');
module.exports = function(deps) {
  const { db, rebuildSearchIndex, getNextPosition } = deps;
  const router = Router();

  // ─── CUSTOM LISTS API ───
  const GROCERY_CATEGORIES = ['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other'];
  const LIST_TEMPLATES = [
    {id:'weekly-groceries',name:'Weekly Groceries',type:'grocery',icon:'🛒',items:['Milk','Eggs','Bread','Bananas','Chicken','Rice','Onions','Tomatoes','Cheese','Yogurt']},
    {id:'travel-packing',name:'Travel Packing',type:'checklist',icon:'🧳',items:['Passport','Phone charger','Toiletries','Underwear','Socks','Medications','Snacks','Water bottle','Headphones','Travel pillow']},
    {id:'moving-checklist',name:'Moving Checklist',type:'checklist',icon:'📦',items:['Change address','Forward mail','Transfer utilities','Pack room by room','Label boxes','Hire movers','Clean old place','Get new keys','Update subscriptions','Notify employer']},
    {id:'party-planning',name:'Party Planning',type:'checklist',icon:'🎉',items:['Set date & time','Create guest list','Send invitations','Plan menu','Buy decorations','Arrange music','Order cake','Set up space','Prepare games','Buy drinks']}
  ];

  // Rate limiter for shared endpoints
  const shareRateMap = new Map();
  function checkShareRate(token) {
    const now = Date.now();
    const entry = shareRateMap.get(token) || { count: 0, reset: now + 60000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
    entry.count++;
    shareRateMap.set(token, entry);
    return entry.count <= 60;
  }
  setInterval(() => { for (const [k, v] of shareRateMap) { if (Date.now() > v.reset + 60000) shareRateMap.delete(k); } }, 120000);

  router.get('/api/lists/categories', (req, res) => {
    res.json(GROCERY_CATEGORIES);
  });

  // Configurable grocery categories from settings (falls back to hardcoded)
  router.get('/api/lists/categories/configured', (req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key='groceryCategories' AND user_id=?").get(req.userId);
    if (row) { try { return res.json(JSON.parse(row.value)); } catch {} }
    res.json(GROCERY_CATEGORIES);
  });

  router.get('/api/lists/templates', (req, res) => {
    res.json(LIST_TEMPLATES);
  });

  router.post('/api/lists/from-template', (req, res) => {
    const { template_id } = req.body;
    const tpl = LIST_TEMPLATES.find(t => t.id === template_id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    const listCount = db.prepare('SELECT COUNT(*) as c FROM lists WHERE user_id=?').get(req.userId).c;
    if (listCount >= 100) return res.status(400).json({ error: 'Maximum 100 lists reached' });
    const pos = getNextPosition('lists');
    const r = db.prepare('INSERT INTO lists (name,type,icon,position,user_id) VALUES (?,?,?,?,?)').run(tpl.name, tpl.type, tpl.icon, pos, req.userId);
    const lid = r.lastInsertRowid;
    const insItem = db.prepare('INSERT INTO list_items (list_id,title,position) VALUES (?,?,?)');
    tpl.items.forEach((item, i) => insItem.run(lid, item, i));
    rebuildSearchIndex();
    const list = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(lid, req.userId);
    const items = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(lid);
    res.status(201).json({ ...list, items });
  });

  router.get('/api/lists', (req, res) => {
    const lists = db.prepare(`SELECT l.*, COUNT(li.id) as item_count, SUM(CASE WHEN li.checked=1 THEN 1 ELSE 0 END) as checked_count
      FROM lists l LEFT JOIN list_items li ON li.list_id=l.id WHERE l.user_id=? GROUP BY l.id ORDER BY l.position, l.created_at DESC`).all(req.userId);
    res.json(lists);
  });

  router.post('/api/lists', (req, res) => {
    const { name, type, icon, color, area_id, parent_id } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (name.length > 100) return res.status(400).json({ error: 'name must be 100 chars or less' });
    const validTypes = ['checklist', 'grocery', 'notes'];
    if (type && !validTypes.includes(type)) return res.status(400).json({ error: 'type must be checklist, grocery, or notes' });
    const listCount = db.prepare('SELECT COUNT(*) as c FROM lists WHERE user_id=?').get(req.userId).c;
    if (listCount >= 100) return res.status(400).json({ error: 'Maximum 100 lists reached' });
    if (parent_id) {
      const pid = Number(parent_id);
      if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
      const parent = db.prepare('SELECT * FROM lists WHERE id=?').get(pid);
      if (!parent) return res.status(400).json({ error: 'Parent list not found' });
      // Prevent nesting deeper than 1 level
      if (parent.parent_id) return res.status(400).json({ error: 'Cannot nest more than one level deep' });
    }
    const pos = getNextPosition('lists');
    const r = db.prepare('INSERT INTO lists (name,type,icon,color,area_id,parent_id,position,user_id) VALUES (?,?,?,?,?,?,?,?)').run(
      name.trim(), type || 'checklist', icon || '📋', color || '#2563EB', area_id ? Number(area_id) : null, parent_id ? Number(parent_id) : null, pos, req.userId
    );
    res.status(201).json(db.prepare('SELECT * FROM lists WHERE id=?').get(r.lastInsertRowid));
  });

  router.get('/api/lists/:id/sublists', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const sublists = db.prepare(`SELECT l.*, COUNT(li.id) as item_count, SUM(CASE WHEN li.checked=1 THEN 1 ELSE 0 END) as checked_count
      FROM lists l LEFT JOIN list_items li ON li.list_id=l.id WHERE l.parent_id=? GROUP BY l.id ORDER BY l.position, l.created_at DESC`).all(id);
    res.json(sublists);
  });

  router.put('/api/lists/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const { name, icon, color, area_id, position } = req.body;
    if (name !== undefined && (!name || name.length > 100)) return res.status(400).json({ error: 'Invalid name' });
    const { parent_id: newParentId } = req.body;
    if (newParentId !== undefined && newParentId !== null) {
      const pid = Number(newParentId);
      if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
      if (pid === id) return res.status(400).json({ error: 'Cannot be own parent' });
      const parent = db.prepare('SELECT * FROM lists WHERE id=?').get(pid);
      if (!parent) return res.status(400).json({ error: 'Parent list not found' });
      if (parent.parent_id) return res.status(400).json({ error: 'Cannot nest more than one level deep' });
    }
    db.prepare('UPDATE lists SET name=?,icon=?,color=?,area_id=?,parent_id=?,position=? WHERE id=?').run(
      name || ex.name, icon !== undefined ? icon : ex.icon, color || ex.color,
      area_id !== undefined ? (area_id ? Number(area_id) : null) : ex.area_id,
      newParentId !== undefined ? (newParentId ? Number(newParentId) : null) : ex.parent_id,
      position !== undefined ? position : ex.position, id
    );
    res.json(db.prepare('SELECT * FROM lists WHERE id=?').get(id));
  });

  router.delete('/api/lists/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    // Also delete child lists
    db.prepare('DELETE FROM lists WHERE parent_id=?').run(id);
    db.prepare('DELETE FROM lists WHERE id=?').run(id);
    rebuildSearchIndex();
    res.json({ deleted: true });
  });

  router.get('/api/lists/:id/items', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const items = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(id);
    res.json(items);
  });

  router.post('/api/lists/:id/items', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const itemCount = db.prepare('SELECT COUNT(*) as c FROM list_items WHERE list_id=?').get(id).c;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (itemCount + items.length > 500) return res.status(400).json({ error: 'Maximum 500 items per list' });
    // Validate all items first
    for (const item of items) {
      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) return res.status(400).json({ error: 'Item title is required' });
      if (item.title.length > 200) return res.status(400).json({ error: 'Item title must be 200 chars or less' });
    }
    const batchTx = db.transaction(() => {
      let pos = getNextPosition('list_items', 'list_id', id);
      const ins = db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,position) VALUES (?,?,?,?,?,?,?)');
      const created = [];
      for (const item of items) {
        const r = ins.run(id, item.title.trim(), item.checked ? 1 : 0, item.category || null, item.quantity || null, item.note || '', pos++);
        created.push(db.prepare('SELECT * FROM list_items WHERE id=?').get(r.lastInsertRowid));
      }
      return created;
    });
    const created = batchTx();
    rebuildSearchIndex();
    res.status(201).json(created.length === 1 ? created[0] : created);
  });

  router.put('/api/lists/:id/items/:itemId', (req, res) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(id) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid ID' });
    if (!db.prepare('SELECT id FROM lists WHERE id=? AND user_id=?').get(id, req.userId)) return res.status(404).json({ error: 'List not found' });
    const ex = db.prepare('SELECT * FROM list_items WHERE id=? AND list_id=?').get(itemId, id);
    if (!ex) return res.status(404).json({ error: 'Item not found' });
    const { title, checked, category, quantity, note, position } = req.body;
    if (title !== undefined && (!title || title.length > 200)) return res.status(400).json({ error: 'Invalid title' });
    db.prepare('UPDATE list_items SET title=?,checked=?,category=?,quantity=?,note=?,position=? WHERE id=?').run(
      title || ex.title, checked !== undefined ? (checked ? 1 : 0) : ex.checked,
      category !== undefined ? category : ex.category, quantity !== undefined ? quantity : ex.quantity,
      note !== undefined ? note : ex.note, position !== undefined ? position : ex.position, itemId
    );
    rebuildSearchIndex();
    res.json(db.prepare('SELECT * FROM list_items WHERE id=?').get(itemId));
  });

  router.delete('/api/lists/:id/items/:itemId', (req, res) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(id) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid ID' });
    if (!db.prepare('SELECT id FROM lists WHERE id=? AND user_id=?').get(id, req.userId)) return res.status(404).json({ error: 'List not found' });
    const ex = db.prepare('SELECT * FROM list_items WHERE id=? AND list_id=?').get(itemId, id);
    if (!ex) return res.status(404).json({ error: 'Item not found' });
    db.prepare('DELETE FROM list_items WHERE id=?').run(itemId);
    rebuildSearchIndex();
    res.json({ deleted: true });
  });

  router.patch('/api/lists/:id/items/reorder', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    if (!db.prepare('SELECT id FROM lists WHERE id=? AND user_id=?').get(id, req.userId)) return res.status(404).json({ error: 'List not found' });
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array of {id, position} required' });
    const stmt = db.prepare('UPDATE list_items SET position=? WHERE id=? AND list_id=?');
    items.forEach(i => stmt.run(i.position, i.id, id));
    res.json({ reordered: items.length });
  });

  router.post('/api/lists/:id/clear-checked', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const result = db.prepare('DELETE FROM list_items WHERE list_id=? AND checked=1').run(id);
    rebuildSearchIndex();
    res.json({ cleared: result.changes });
  });

  // ─── Duplicate list with items ───
  router.post('/api/lists/:id/duplicate', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const listCount = db.prepare('SELECT COUNT(*) as c FROM lists WHERE user_id=?').get(req.userId).c;
    if (listCount >= 100) return res.status(400).json({ error: 'Maximum 100 lists reached' });
    const keepChecked = req.body && req.body.keep_checked;
    const pos = getNextPosition('lists');
    const copyTx = db.transaction(() => {
      const r = db.prepare('INSERT INTO lists (name,type,icon,color,area_id,parent_id,position,user_id) VALUES (?,?,?,?,?,?,?,?)').run(
        ex.name + ' (copy)', ex.type, ex.icon, ex.color, ex.area_id, null, pos, req.userId
      );
      const newId = r.lastInsertRowid;
      const items = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(id);
      const ins = db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,position) VALUES (?,?,?,?,?,?,?)');
      items.forEach(i => ins.run(newId, i.title, keepChecked ? i.checked : 0, i.category, i.quantity, i.note, i.position));
      return newId;
    });
    const newId = copyTx();
    rebuildSearchIndex();
    const newList = db.prepare('SELECT * FROM lists WHERE id=?').get(newId);
    const newItems = db.prepare('SELECT * FROM list_items WHERE list_id=? ORDER BY position').all(newId);
    res.status(201).json({ ...newList, items: newItems });
  });

  // ─── Uncheck all items ───
  router.post('/api/lists/:id/uncheck-all', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    const result = db.prepare('UPDATE list_items SET checked=0 WHERE list_id=? AND checked=1').run(id);
    res.json({ unchecked: result.changes });
  });

  // ─── SHARING ───
  router.post('/api/lists/:id/share', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    if (ex.share_token) return res.json({ token: ex.share_token, url: '/share/' + ex.share_token });
    const token = crypto.randomBytes(12).toString('hex');
    db.prepare('UPDATE lists SET share_token=? WHERE id=?').run(token, id);
    res.json({ token, url: '/share/' + token });
  });

  router.delete('/api/lists/:id/share', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    db.prepare('UPDATE lists SET share_token=NULL WHERE id=?').run(id);
    res.json({ unshared: true });
  });

  // Public shared endpoints
  router.get('/api/shared/:token', (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ error: 'Invalid token format' });
    if (!checkShareRate(token)) return res.status(429).json({ error: 'Too many requests' });
    const list = db.prepare('SELECT name, type, icon, color, share_token, created_at FROM lists WHERE share_token=?').get(token);
    if (!list) return res.status(404).json({ error: 'Shared list not found' });
    const listId = db.prepare('SELECT id FROM lists WHERE share_token=?').get(token).id;
    const items = db.prepare('SELECT id, title, checked, category, quantity, note, position FROM list_items WHERE list_id=? ORDER BY position').all(listId);
    res.json({ ...list, items });
  });

  router.put('/api/shared/:token/items/:itemId', (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ error: 'Invalid token format' });
    if (!checkShareRate(token)) return res.status(429).json({ error: 'Too many requests' });
    const list = db.prepare('SELECT id FROM lists WHERE share_token=?').get(token);
    if (!list) return res.status(404).json({ error: 'Shared list not found' });
    const itemId = Number(req.params.itemId);
    const ex = db.prepare('SELECT * FROM list_items WHERE id=? AND list_id=?').get(itemId, list.id);
    if (!ex) return res.status(404).json({ error: 'Item not found' });
    const { checked } = req.body;
    db.prepare('UPDATE list_items SET checked=? WHERE id=?').run(checked ? 1 : 0, itemId);
    res.json(db.prepare('SELECT id, title, checked, category, quantity, note, position FROM list_items WHERE id=?').get(itemId));
  });

  router.post('/api/shared/:token/items', (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{24}$/.test(token)) return res.status(400).json({ error: 'Invalid token format' });
    if (!checkShareRate(token)) return res.status(429).json({ error: 'Too many requests' });
    const list = db.prepare('SELECT id FROM lists WHERE share_token=?').get(token);
    if (!list) return res.status(404).json({ error: 'Shared list not found' });
    const { title, category, quantity } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
    if (title.length > 200) return res.status(400).json({ error: 'title must be 200 chars or less' });
    const itemCount = db.prepare('SELECT COUNT(*) as c FROM list_items WHERE list_id=?').get(list.id).c;
    if (itemCount >= 500) return res.status(400).json({ error: 'Maximum 500 items per list' });
    const ipos = getNextPosition('list_items', 'list_id', list.id);
    const r = db.prepare('INSERT INTO list_items (list_id,title,category,quantity,position) VALUES (?,?,?,?,?)').run(
      list.id, title.trim(), category || null, quantity || null, ipos
    );
    rebuildSearchIndex();
    res.status(201).json(db.prepare('SELECT id, title, checked, category, quantity, note, position FROM list_items WHERE id=?').get(r.lastInsertRowid));
  });

  return router;
};
