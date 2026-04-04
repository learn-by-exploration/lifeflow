const { Router } = require('express');
const crypto = require('crypto');
const { isValidColor } = require('../middleware/validate');
module.exports = function(deps) {
  const { db, rebuildSearchIndex, getNextPosition } = deps;
  const router = Router();

  // ─── CUSTOM LISTS API ───
  const GROCERY_CATEGORIES = ['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other'];
  const LIST_TEMPLATES = [
    // Home & Life
    {id:'weekly-groceries',name:'Weekly Groceries',type:'grocery',icon:'🛒',category:'Home & Life',items:['Milk','Eggs','Bread','Bananas','Chicken','Rice','Onions','Tomatoes','Cheese','Yogurt']},
    {id:'home-maintenance',name:'Home Maintenance',type:'checklist',icon:'🏠',category:'Home & Life',items:['Check smoke detectors','Replace air filters','Clean gutters','Test water heater','Inspect roof','Service HVAC','Flush water heater','Check caulking','Clean dryer vent','Test garage door']},
    {id:'cleaning-routine',name:'Cleaning Routine',type:'checklist',icon:'🧹',category:'Home & Life',items:['Vacuum floors','Mop kitchen','Clean bathrooms','Dust surfaces','Wipe counters','Take out trash','Clean mirrors','Wash bedding','Organize fridge','Wipe appliances']},
    // Entertainment & Media
    {id:'movies-to-watch',name:'Movies to Watch',type:'checklist',icon:'🎬',category:'Entertainment & Media',items:['The Shawshank Redemption','Inception','Parasite','The Godfather','Spirited Away','Everything Everywhere All at Once','Interstellar','The Dark Knight','Amélie','Whiplash']},
    {id:'books-to-read',name:'Books to Read',type:'checklist',icon:'📚',category:'Entertainment & Media',items:['Atomic Habits','Sapiens','The Alchemist','Dune','Project Hail Mary','Educated','The Psychology of Money','Thinking Fast and Slow','The Midnight Library','Klara and the Sun']},
    {id:'tv-shows',name:'TV Shows to Watch',type:'checklist',icon:'📺',category:'Entertainment & Media',items:['Breaking Bad','The Bear','Severance','Succession','Shogun','The Last of Us','Arcane','Better Call Saul','The White Lotus','Andor']},
    {id:'podcasts',name:'Podcasts to Try',type:'checklist',icon:'🎙️',category:'Entertainment & Media',items:['The Daily','Huberman Lab','Lex Fridman','How I Built This','Radiolab','99% Invisible','Serial','Freakonomics','The Tim Ferriss Show','Hardcore History']},
    // Travel & Events
    {id:'travel-packing',name:'Travel Packing',type:'checklist',icon:'🧳',category:'Travel & Events',items:['Passport','Phone charger','Toiletries','Underwear','Socks','Medications','Snacks','Water bottle','Headphones','Travel pillow']},
    {id:'moving-checklist',name:'Moving Checklist',type:'checklist',icon:'📦',category:'Travel & Events',items:['Change address','Forward mail','Transfer utilities','Pack room by room','Label boxes','Hire movers','Clean old place','Get new keys','Update subscriptions','Notify employer']},
    {id:'party-planning',name:'Party Planning',type:'checklist',icon:'🎉',category:'Travel & Events',items:['Set date & time','Create guest list','Send invitations','Plan menu','Buy decorations','Arrange music','Order cake','Set up space','Prepare games','Buy drinks']},
    {id:'camping-trip',name:'Camping Trip',type:'checklist',icon:'⛺',category:'Travel & Events',items:['Tent','Sleeping bag','Flashlight','First aid kit','Water bottles','Sunscreen','Bug spray','Camp stove','Firewood','Matches']},
    // Personal
    {id:'gift-ideas',name:'Gift Ideas',type:'checklist',icon:'🎁',category:'Personal',items:['Birthday gifts','Holiday presents','Thank you gifts','Housewarming ideas','Wedding gift','Anniversary','Teacher appreciation','Host/hostess gift','Graduation','Baby shower']},
    {id:'bucket-list',name:'Bucket List',type:'checklist',icon:'⭐',category:'Personal',items:['Learn a new language','Run a marathon','Visit Japan','Write a book','Learn an instrument','Go skydiving','See the Northern Lights','Cook a 5-course meal','Volunteer abroad','Start a garden']},
    {id:'restaurants-to-try',name:'Restaurants to Try',type:'checklist',icon:'🍽️',category:'Personal',items:['Italian place downtown','New Thai spot','Brunch café','Seafood restaurant','Ramen shop','Pizza place','Taco truck','Sushi bar','Farm-to-table bistro','Bakery']},
    // Health & Wellness
    {id:'workout-routine',name:'Workout Routine',type:'checklist',icon:'💪',category:'Health & Wellness',items:['Push-ups','Squats','Planks','Lunges','Burpees','Jump rope','Pull-ups','Deadlifts','Bench press','Stretching']},
    // Work & Productivity
    {id:'meeting-agenda',name:'Meeting Agenda',type:'checklist',icon:'📋',category:'Work & Productivity',items:['Review action items from last meeting','Share progress updates','Discuss blockers and dependencies','Review upcoming deadlines','Assign new action items','Set next meeting date','Share relevant documents','Capture decisions made','Identify risks','Confirm attendee follow-ups']},
    {id:'project-launch',name:'Project Launch Checklist',type:'checklist',icon:'🚀',category:'Work & Productivity',items:['Define project scope and goals','Identify stakeholders','Create project timeline','Set up communication channels','Assign team roles','Prepare launch announcement','Test all deliverables','Create rollback plan','Schedule post-launch review','Update documentation']},
    {id:'onboarding-checklist',name:'New Employee Onboarding',type:'checklist',icon:'🤝',category:'Work & Productivity',items:['Set up workstation and accounts','Complete HR paperwork','Review company handbook','Meet team members','Set up email and calendar','Get building access/badge','Schedule 1:1 with manager','Review first-week goals','Join relevant Slack channels','Complete security training','Set up dev environment','Review team documentation']},
    // Finance
    {id:'monthly-bills',name:'Monthly Bills Tracker',type:'checklist',icon:'💳',category:'Finance',items:['Rent/Mortgage','Electricity','Water/Sewer','Internet','Phone plan','Car insurance','Health insurance','Streaming subscriptions','Gym membership','Credit card payment','Student loans','Groceries budget']},
    {id:'subscription-tracker',name:'Subscription Tracker',type:'checklist',icon:'🔄',category:'Finance',items:['Netflix','Spotify','Cloud storage','News subscription','Software licenses','Meal kit service','App subscriptions','Domain renewals','Password manager','VPN service']},
    {id:'savings-goals',name:'Savings Goals',type:'checklist',icon:'🎯',category:'Finance',items:['Emergency fund (3-6 months)','Vacation fund','Down payment savings','Retirement contribution','New car fund','Home improvement fund','Education fund','Investment portfolio review','Debt payoff target','Side project budget']},
    // Education & Learning
    {id:'study-plan',name:'Study Plan',type:'checklist',icon:'📖',category:'Education & Learning',items:['Review lecture notes','Complete practice problems','Read assigned chapters','Watch supplementary videos','Create flashcards for key terms','Join study group session','Review past exams','Summarize main concepts','Ask instructor about unclear topics','Take practice quiz']},
    {id:'course-progress',name:'Course Progress Tracker',type:'checklist',icon:'🎓',category:'Education & Learning',items:['Complete Module 1: Introduction','Complete Module 2: Fundamentals','Complete Module 3: Intermediate concepts','Complete Module 4: Advanced topics','Submit Assignment 1','Submit Assignment 2','Complete midterm project','Review peer feedback','Submit final project','Get course certificate']},
    {id:'language-learning',name:'Language Learning',type:'checklist',icon:'🌍',category:'Education & Learning',items:['Practice vocabulary (20 min)','Listen to podcast in target language','Complete grammar exercise','Write 5 sentences','Have conversation practice','Review flashcard deck','Watch show with subtitles','Read a short article','Record yourself speaking','Learn 10 new words']},
    // Seasonal & Situational
    {id:'spring-cleaning',name:'Spring Cleaning',type:'checklist',icon:'🌸',category:'Seasonal & Situational',items:['Deep clean kitchen appliances','Wash windows inside and out','Clean behind furniture','Organize closets and donate','Flip/rotate mattresses','Clean light fixtures','Wash curtains and blinds','Declutter garage/storage','Power wash exterior','Clean out medicine cabinet','Organize pantry','Service lawn mower']},
    {id:'holiday-prep',name:'Holiday Prep',type:'checklist',icon:'🎄',category:'Seasonal & Situational',items:['Set holiday budget','Create gift list with budget per person','Order gifts by shipping deadline','Plan holiday meals and menu','Buy decorations','Send holiday cards','Schedule travel/accommodations','Plan outfits for events','Coordinate with family on plans','Wrap and label gifts','Prepare guest room','Stock up on baking supplies']},
    {id:'new-apartment',name:'New Apartment Setup',type:'checklist',icon:'🏢',category:'Seasonal & Situational',items:['Set up utilities (electric, gas, water)','Get internet installed','Change locks or get new keys','Update address everywhere','Get renter\'s insurance','Buy essential furniture','Set up kitchen basics','Stock cleaning supplies','Meet neighbors','Find nearest grocery/pharmacy','Register to vote at new address','Update vehicle registration']}
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
    const { name, type, icon, color, area_id, parent_id, view_mode, board_columns } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (name.length > 100) return res.status(400).json({ error: 'name must be 100 chars or less' });
    const validTypes = ['checklist', 'grocery', 'notes', 'tracker'];
    if (type && !validTypes.includes(type)) return res.status(400).json({ error: 'type must be checklist, grocery, notes, or tracker' });
    const validViewModes = ['list', 'board'];
    if (view_mode && !validViewModes.includes(view_mode)) return res.status(400).json({ error: 'view_mode must be list or board' });
    if (board_columns && !Array.isArray(board_columns)) return res.status(400).json({ error: 'board_columns must be an array' });
    if (color && !isValidColor(color)) return res.status(400).json({ error: 'Invalid hex color' });
    const listCount = db.prepare('SELECT COUNT(*) as c FROM lists WHERE user_id=?').get(req.userId).c;
    if (listCount >= 100) return res.status(400).json({ error: 'Maximum 100 lists reached' });
    if (parent_id) {
      const pid = Number(parent_id);
      if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
      const parent = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(pid, req.userId);
      if (!parent) return res.status(400).json({ error: 'Parent list not found' });
      // Prevent nesting deeper than 1 level
      if (parent.parent_id) return res.status(400).json({ error: 'Cannot nest more than one level deep' });
    }
    const pos = getNextPosition('lists');
    const vm = (type === 'tracker') ? (view_mode || 'board') : (view_mode || 'list');
    const bc = board_columns ? JSON.stringify(board_columns) : (type === 'tracker' ? '["Want","In Progress","Done"]' : null);
    const r = db.prepare('INSERT INTO lists (name,type,icon,color,area_id,parent_id,view_mode,board_columns,position,user_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      name.trim(), type || 'checklist', icon || '📋', color || '#2563EB', area_id ? Number(area_id) : null, parent_id ? Number(parent_id) : null, vm, bc, pos, req.userId
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
    if (color && !isValidColor(color)) return res.status(400).json({ error: 'Invalid hex color' });
    const { view_mode, board_columns } = req.body;
    if (view_mode !== undefined) {
      const validViewModes = ['list', 'board'];
      if (!validViewModes.includes(view_mode)) return res.status(400).json({ error: 'view_mode must be list or board' });
    }
    if (board_columns !== undefined && board_columns !== null && !Array.isArray(board_columns)) return res.status(400).json({ error: 'board_columns must be an array' });
    const { parent_id: newParentId } = req.body;
    if (newParentId !== undefined && newParentId !== null) {
      const pid = Number(newParentId);
      if (!Number.isInteger(pid)) return res.status(400).json({ error: 'Invalid parent_id' });
      if (pid === id) return res.status(400).json({ error: 'Cannot be own parent' });
      const parent = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(pid, req.userId);
      if (!parent) return res.status(400).json({ error: 'Parent list not found' });
      if (parent.parent_id) return res.status(400).json({ error: 'Cannot nest more than one level deep' });
    }
    db.prepare('UPDATE lists SET name=?,icon=?,color=?,area_id=?,parent_id=?,view_mode=?,board_columns=?,position=? WHERE id=? AND user_id=?').run(
      name || ex.name, icon !== undefined ? icon : ex.icon, color || ex.color,
      area_id !== undefined ? (area_id ? Number(area_id) : null) : ex.area_id,
      newParentId !== undefined ? (newParentId ? Number(newParentId) : null) : ex.parent_id,
      view_mode !== undefined ? view_mode : (ex.view_mode || 'list'),
      board_columns !== undefined ? (board_columns ? JSON.stringify(board_columns) : null) : ex.board_columns,
      position !== undefined ? position : ex.position, id, req.userId
    );
    res.json(db.prepare('SELECT * FROM lists WHERE id=?').get(id));
  });

  router.delete('/api/lists/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    // Also delete child lists
    db.prepare('DELETE FROM lists WHERE parent_id=? AND user_id=?').run(id, req.userId);
    db.prepare('DELETE FROM lists WHERE id=? AND user_id=?').run(id, req.userId);
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
      const ins = db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,metadata,status,position) VALUES (?,?,?,?,?,?,?,?,?)');
      const created = [];
      for (const item of items) {
        const meta = item.metadata ? (typeof item.metadata === 'string' ? item.metadata : JSON.stringify(item.metadata)) : null;
        const r = ins.run(id, item.title.trim(), item.checked ? 1 : 0, item.category || null, item.quantity || null, item.note || '', meta, item.status || null, pos++);
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
    const { title, checked, category, quantity, note, position, metadata, status } = req.body;
    if (title !== undefined && (!title || title.length > 200)) return res.status(400).json({ error: 'Invalid title' });
    const meta = metadata !== undefined ? (metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null) : ex.metadata;
    db.prepare('UPDATE list_items SET title=?,checked=?,category=?,quantity=?,note=?,metadata=?,status=?,position=? WHERE id=? AND list_id=?').run(
      title || ex.title, checked !== undefined ? (checked ? 1 : 0) : ex.checked,
      category !== undefined ? category : ex.category, quantity !== undefined ? quantity : ex.quantity,
      note !== undefined ? note : ex.note, meta, status !== undefined ? status : ex.status,
      position !== undefined ? position : ex.position, itemId, id
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
    db.prepare('DELETE FROM list_items WHERE id=? AND list_id=?').run(itemId, id);
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
    const config = require('../config');
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    if (ex.share_token) return res.json({ token: ex.share_token, url: (config.baseUrl || '') + '/share/' + ex.share_token });
    const token = crypto.randomBytes(12).toString('hex');
    db.prepare('UPDATE lists SET share_token=? WHERE id=? AND user_id=?').run(token, id, req.userId);
    res.json({ token, url: (config.baseUrl || '') + '/share/' + token });
  });

  router.delete('/api/lists/:id/share', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ID' });
    const ex = db.prepare('SELECT * FROM lists WHERE id=? AND user_id=?').get(id, req.userId);
    if (!ex) return res.status(404).json({ error: 'List not found' });
    db.prepare('UPDATE lists SET share_token=NULL WHERE id=? AND user_id=?').run(id, req.userId);
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
