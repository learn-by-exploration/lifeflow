const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeList, makeListItem, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Area Archive / Unarchive ───

describe('Area archive', () => {
  it('PUT /api/areas/:id/archive sets archived=1', async () => {
    const a = makeArea({ name: 'Work' });
    const res = await agent().put('/api/areas/' + a.id + '/archive').expect(200);
    assert.equal(res.body.archived, 1);
  });

  it('PUT /api/areas/:id/unarchive sets archived=0', async () => {
    const a = makeArea({ name: 'Work' });
    await agent().put('/api/areas/' + a.id + '/archive').expect(200);
    const res = await agent().put('/api/areas/' + a.id + '/unarchive').expect(200);
    assert.equal(res.body.archived, 0);
  });

  it('GET /api/areas excludes archived by default', async () => {
    makeArea({ name: 'Active' });
    const archived = makeArea({ name: 'Archived' });
    await agent().put('/api/areas/' + archived.id + '/archive').expect(200);
    const res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Active');
  });

  it('GET /api/areas?include_archived=1 includes archived', async () => {
    makeArea({ name: 'Active' });
    const archived = makeArea({ name: 'Archived' });
    await agent().put('/api/areas/' + archived.id + '/archive').expect(200);
    const res = await agent().get('/api/areas?include_archived=1').expect(200);
    assert.equal(res.body.length, 2);
  });

  it('archive returns 404 for missing area', async () => {
    await agent().put('/api/areas/99999/archive').expect(404);
  });

  it('unarchive returns 404 for missing area', async () => {
    await agent().put('/api/areas/99999/unarchive').expect(404);
  });
});

// ─── Area Reorder ───

describe('Area reorder', () => {
  it('PUT /api/areas/reorder updates positions', async () => {
    const a1 = makeArea({ name: 'First', position: 0 });
    const a2 = makeArea({ name: 'Second', position: 1 });
    const a3 = makeArea({ name: 'Third', position: 2 });
    await agent().put('/api/areas/reorder')
      .send([{ id: a3.id, position: 0 }, { id: a1.id, position: 1 }, { id: a2.id, position: 2 }])
      .expect(200);
    const res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body[0].name, 'Third');
    assert.equal(res.body[1].name, 'First');
    assert.equal(res.body[2].name, 'Second');
  });

  it('reorder rejects non-array body', async () => {
    await agent().put('/api/areas/reorder').send({ bad: true }).expect(400);
  });
});

// ─── Area Edit Enhanced ───

describe('Area edit enhanced', () => {
  it('PUT /api/areas/:id updates position', async () => {
    const a = makeArea({ name: 'Work', position: 0 });
    const res = await agent().put('/api/areas/' + a.id).send({ name: 'Work', icon: '💼', color: '#00F', position: 5 }).expect(200);
    assert.equal(res.body.position, 5);
  });

  it('PUT /api/areas/:id rejects empty name', async () => {
    const a = makeArea({ name: 'Work' });
    await agent().put('/api/areas/' + a.id).send({ name: '', icon: '💼', color: '#00F' }).expect(400);
  });

  it('PUT /api/areas/:id returns 404 for missing area', async () => {
    await agent().put('/api/areas/99999').send({ name: 'X', icon: '💼', color: '#00F' }).expect(404);
  });
});

// ─── List Duplicate ───

describe('List duplicate', () => {
  it('POST /api/lists/:id/duplicate creates a copy with items', async () => {
    const list = makeList({ name: 'Groceries', type: 'grocery' });
    makeListItem(list.id, { title: 'Milk', checked: 0 });
    makeListItem(list.id, { title: 'Eggs', checked: 1 });
    const res = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    assert.equal(res.body.name, 'Groceries (copy)');
    assert.equal(res.body.items.length, 2);
    assert.notEqual(res.body.id, list.id);
    // By default checked items are included but unchecked
    assert.ok(res.body.items.every(i => !i.checked));
  });

  it('duplicate with keep_checked preserves check state', async () => {
    const list = makeList({ name: 'Shopping' });
    makeListItem(list.id, { title: 'A', checked: 1 });
    makeListItem(list.id, { title: 'B', checked: 0 });
    const res = await agent().post('/api/lists/' + list.id + '/duplicate').send({ keep_checked: true }).expect(201);
    const checkedItems = res.body.items.filter(i => i.checked);
    assert.equal(checkedItems.length, 1);
  });

  it('duplicate returns 404 for missing list', async () => {
    await agent().post('/api/lists/99999/duplicate').expect(404);
  });
});

// ─── List Uncheck All ───

describe('List uncheck all', () => {
  it('POST /api/lists/:id/uncheck-all unchecks all items', async () => {
    const list = makeList({ name: 'Todo' });
    makeListItem(list.id, { title: 'A', checked: 1 });
    makeListItem(list.id, { title: 'B', checked: 1 });
    makeListItem(list.id, { title: 'C', checked: 0 });
    const res = await agent().post('/api/lists/' + list.id + '/uncheck-all').expect(200);
    assert.equal(res.body.unchecked, 2);
    // Verify all unchecked
    const items = await agent().get('/api/lists/' + list.id + '/items').expect(200);
    assert.ok(items.body.every(i => !i.checked));
  });

  it('uncheck-all returns 0 when nothing checked', async () => {
    const list = makeList({ name: 'Todo' });
    makeListItem(list.id, { title: 'A', checked: 0 });
    const res = await agent().post('/api/lists/' + list.id + '/uncheck-all').expect(200);
    assert.equal(res.body.unchecked, 0);
  });

  it('uncheck-all returns 404 for missing list', async () => {
    await agent().post('/api/lists/99999/uncheck-all').expect(404);
  });
});

// ─── Configurable Grocery Categories ───

describe('Configurable grocery categories', () => {
  it('GET /api/lists/categories/configured returns default categories', async () => {
    const res = await agent().get('/api/lists/categories/configured').expect(200);
    assert.ok(res.body.length > 0);
    assert.ok(res.body.includes('Produce'));
    assert.ok(res.body.includes('Dairy'));
  });

  it('returns custom categories when configured', async () => {
    const { db } = setup();
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('groceryCategories',?)").run(JSON.stringify(['Custom1', 'Custom2']));
    const res = await agent().get('/api/lists/categories/configured').expect(200);
    assert.deepEqual(res.body, ['Custom1', 'Custom2']);
  });

  it('falls back to defaults on malformed JSON', async () => {
    const { db } = setup();
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('groceryCategories','not valid json{')").run();
    const res = await agent().get('/api/lists/categories/configured').expect(200);
    assert.ok(res.body.length > 0);
    assert.ok(res.body.includes('Produce'));
  });
});

// ─── QA Panel: Error / Negative Paths ───

describe('Area archive edge cases', () => {
  it('archive already-archived area is idempotent', async () => {
    const a = makeArea({ name: 'Work' });
    await agent().put('/api/areas/' + a.id + '/archive').expect(200);
    const res = await agent().put('/api/areas/' + a.id + '/archive').expect(200);
    assert.equal(res.body.archived, 1);
  });

  it('unarchive already-active area is idempotent', async () => {
    const a = makeArea({ name: 'Work' });
    const res = await agent().put('/api/areas/' + a.id + '/unarchive').expect(200);
    assert.equal(res.body.archived, 0);
  });

  it('archived area goals still accessible via /api/areas/:id/goals', async () => {
    const a = makeArea({ name: 'Work' });
    makeGoal(a.id, { title: 'Ship v1' });
    await agent().put('/api/areas/' + a.id + '/archive').expect(200);
    const res = await agent().get('/api/areas/' + a.id + '/goals').expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Ship v1');
  });
});

describe('Area reorder validation', () => {
  it('rejects non-integer position', async () => {
    const a = makeArea({ name: 'Work' });
    await agent().put('/api/areas/reorder')
      .send([{ id: a.id, position: 'abc' }])
      .expect(400);
  });

  it('rejects negative position', async () => {
    const a = makeArea({ name: 'Work' });
    await agent().put('/api/areas/reorder')
      .send([{ id: a.id, position: -1 }])
      .expect(400);
  });

  it('rejects missing id', async () => {
    await agent().put('/api/areas/reorder')
      .send([{ position: 0 }])
      .expect(400);
  });

  it('handles empty array gracefully', async () => {
    const res = await agent().put('/api/areas/reorder').send([]).expect(200);
    assert.equal(res.body.reordered, 0);
  });

  it('non-existent IDs silently succeed (no rows updated)', async () => {
    const res = await agent().put('/api/areas/reorder')
      .send([{ id: 99999, position: 0 }])
      .expect(200);
    assert.equal(res.body.reordered, 1);
  });
});

describe('Area name validation', () => {
  it('POST /api/areas rejects name over 100 chars', async () => {
    await agent().post('/api/areas')
      .send({ name: 'x'.repeat(101), icon: '📋', color: '#000' })
      .expect(400);
  });

  it('POST /api/areas accepts name at 100 chars', async () => {
    await agent().post('/api/areas')
      .send({ name: 'x'.repeat(100), icon: '📋', color: '#000' })
      .expect(201);
  });

  it('PUT /api/areas/:id rejects name over 100 chars', async () => {
    const a = makeArea({ name: 'Work' });
    await agent().put('/api/areas/' + a.id)
      .send({ name: 'x'.repeat(101), icon: '📋', color: '#000' })
      .expect(400);
  });
});

describe('List duplicate edge cases', () => {
  it('duplicate list with 0 items creates empty copy', async () => {
    const list = makeList({ name: 'Empty' });
    const res = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    assert.equal(res.body.name, 'Empty (copy)');
    assert.equal(res.body.items.length, 0);
  });

  it('duplicate list has unique item IDs', async () => {
    const list = makeList({ name: 'Todo' });
    const item = makeListItem(list.id, { title: 'Task 1' });
    const res = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    assert.notEqual(res.body.items[0].id, item.id);
  });

  it('duplicate list sets parent_id to null', async () => {
    const parent = makeList({ name: 'Parent' });
    const child = makeList({ name: 'Child', parent_id: parent.id });
    const res = await agent().post('/api/lists/' + child.id + '/duplicate').expect(201);
    assert.equal(res.body.parent_id, null);
  });

  it('duplicate preserves item categories and quantities', async () => {
    const list = makeList({ name: 'Groceries', type: 'grocery' });
    makeListItem(list.id, { title: 'Milk', category: 'Dairy', quantity: '2L' });
    const res = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    assert.equal(res.body.items[0].category, 'Dairy');
    assert.equal(res.body.items[0].quantity, '2L');
  });

  it('duplicate at max 100 lists returns 400', async () => {
    const { db } = setup();
    // Insert 100 lists directly
    const ins = db.prepare('INSERT INTO lists (name,type,icon,color,position) VALUES (?,?,?,?,?)');
    for (let i = 0; i < 100; i++) ins.run('List ' + i, 'checklist', '📋', '#000', i);
    const first = db.prepare('SELECT id FROM lists LIMIT 1').get();
    const res = await agent().post('/api/lists/' + first.id + '/duplicate').expect(400);
    assert.ok(res.body.error.includes('100'));
  });

  it('duplicate does not copy share_token', async () => {
    const list = makeList({ name: 'Shared' });
    const { db } = setup();
    db.prepare('UPDATE lists SET share_token=? WHERE id=?').run('abc123', list.id);
    const res = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    assert.equal(res.body.share_token, null);
  });
});

// ─── QA Panel: Integration Tests ───

describe('Area lifecycle integration', () => {
  it('archive → exclude → unarchive → include', async () => {
    const a = makeArea({ name: 'Health' });
    await agent().put('/api/areas/' + a.id + '/archive').expect(200);
    let res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body.length, 0);
    await agent().put('/api/areas/' + a.id + '/unarchive').expect(200);
    res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Health');
  });

  it('reorder preserves non-position fields', async () => {
    const a = makeArea({ name: 'Work', icon: '💼', color: '#FF0000' });
    await agent().put('/api/areas/reorder').send([{ id: a.id, position: 5 }]).expect(200);
    const res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body[0].name, 'Work');
    assert.equal(res.body[0].icon, '💼');
    assert.equal(res.body[0].color, '#FF0000');
    assert.equal(res.body[0].position, 5);
  });

  it('create → reorder → archive → remaining order intact', async () => {
    const a1 = makeArea({ name: 'A', position: 0 });
    const a2 = makeArea({ name: 'B', position: 1 });
    const a3 = makeArea({ name: 'C', position: 2 });
    await agent().put('/api/areas/reorder').send([
      { id: a3.id, position: 0 }, { id: a2.id, position: 1 }, { id: a1.id, position: 2 }
    ]).expect(200);
    await agent().put('/api/areas/' + a2.id + '/archive').expect(200);
    const res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].name, 'C');
    assert.equal(res.body[1].name, 'A');
  });
});

describe('List duplicate integration', () => {
  it('original list unchanged after duplicate', async () => {
    const list = makeList({ name: 'Original' });
    makeListItem(list.id, { title: 'Item A', checked: 1 });
    await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    const items = await agent().get('/api/lists/' + list.id + '/items').expect(200);
    assert.equal(items.body.length, 1);
    assert.equal(items.body[0].title, 'Item A');
    assert.equal(items.body[0].checked, 1);
  });

  it('duplicate list can be independently edited', async () => {
    const list = makeList({ name: 'Base' });
    makeListItem(list.id, { title: 'X' });
    const dup = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    await agent().put('/api/lists/' + dup.body.id).send({ name: 'Changed', icon: '🔥', color: '#FF0000' }).expect(200);
    const orig = (await agent().get('/api/lists').expect(200)).body.find(l => l.id === list.id);
    assert.equal(orig.name, 'Base');
  });

  it('duplicate list can be independently deleted', async () => {
    const list = makeList({ name: 'Keep' });
    const dup = await agent().post('/api/lists/' + list.id + '/duplicate').expect(201);
    await agent().delete('/api/lists/' + dup.body.id).expect(200);
    const lists = await agent().get('/api/lists').expect(200);
    assert.equal(lists.body.length, 1);
    assert.equal(lists.body[0].name, 'Keep');
  });
});

// ─── QA Panel: Data Integrity ───

describe('Data integrity', () => {
  it('duplicate list gets unique position', async () => {
    const l1 = makeList({ name: 'First', position: 0 });
    const l2 = makeList({ name: 'Second', position: 1 });
    const dup = await agent().post('/api/lists/' + l1.id + '/duplicate').expect(201);
    assert.ok(dup.body.position > l2.position || dup.body.position !== l1.position);
    assert.notEqual(dup.body.position, l1.position);
  });

  it('archived column default is 0 for new areas', async () => {
    const res = await agent().post('/api/areas').send({ name: 'New', icon: '📋', color: '#000' }).expect(201);
    assert.equal(res.body.archived, 0);
  });

  it('uncheck-all does not affect other lists', async () => {
    const l1 = makeList({ name: 'List 1' });
    const l2 = makeList({ name: 'List 2' });
    makeListItem(l1.id, { title: 'A', checked: 1 });
    makeListItem(l2.id, { title: 'B', checked: 1 });
    await agent().post('/api/lists/' + l1.id + '/uncheck-all').expect(200);
    const items2 = await agent().get('/api/lists/' + l2.id + '/items').expect(200);
    assert.equal(items2.body[0].checked, 1);
  });
});
