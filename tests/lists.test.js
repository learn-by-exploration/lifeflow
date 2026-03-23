const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeList, makeListItem, agent, setup } = require('./helpers');

describe('Lists API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── LIST CRUD ───

  describe('GET /api/lists', () => {
    it('returns empty array initially', async () => {
      const res = await agent().get('/api/lists').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('returns lists with item counts', async () => {
      const list = makeList({ name: 'Groceries', type: 'grocery' });
      makeListItem(list.id, { title: 'Milk', checked: 1 });
      makeListItem(list.id, { title: 'Eggs', checked: 0 });
      const res = await agent().get('/api/lists').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].name, 'Groceries');
      assert.equal(res.body[0].item_count, 2);
      assert.equal(res.body[0].checked_count, 1);
    });
  });

  describe('POST /api/lists', () => {
    it('creates a checklist with defaults', async () => {
      const res = await agent().post('/api/lists').send({ name: 'My List' }).expect(201);
      assert.equal(res.body.name, 'My List');
      assert.equal(res.body.type, 'checklist');
      assert.equal(res.body.icon, '📋');
    });

    it('creates a grocery list', async () => {
      const res = await agent().post('/api/lists').send({ name: 'Groceries', type: 'grocery', icon: '🛒' }).expect(201);
      assert.equal(res.body.type, 'grocery');
      assert.equal(res.body.icon, '🛒');
    });

    it('creates a notes list', async () => {
      const res = await agent().post('/api/lists').send({ name: 'Notes', type: 'notes', icon: '📝' }).expect(201);
      assert.equal(res.body.type, 'notes');
    });

    it('rejects empty name', async () => {
      await agent().post('/api/lists').send({ name: '' }).expect(400);
    });

    it('rejects missing name', async () => {
      await agent().post('/api/lists').send({}).expect(400);
    });

    it('rejects name over 100 chars', async () => {
      await agent().post('/api/lists').send({ name: 'A'.repeat(101) }).expect(400);
    });

    it('rejects invalid type', async () => {
      await agent().post('/api/lists').send({ name: 'X', type: 'invalid' }).expect(400);
    });

    it('accepts area_id', async () => {
      const area = makeArea();
      const res = await agent().post('/api/lists').send({ name: 'Linked', area_id: area.id }).expect(201);
      assert.equal(res.body.area_id, area.id);
    });
  });

  describe('PUT /api/lists/:id', () => {
    it('updates list metadata', async () => {
      const list = makeList({ name: 'Old' });
      const res = await agent().put('/api/lists/' + list.id).send({ name: 'New', icon: '🎯', color: '#FF0000' }).expect(200);
      assert.equal(res.body.name, 'New');
      assert.equal(res.body.icon, '🎯');
      assert.equal(res.body.color, '#FF0000');
    });

    it('returns 404 for non-existent list', async () => {
      await agent().put('/api/lists/9999').send({ name: 'X' }).expect(404);
    });

    it('rejects invalid ID', async () => {
      await agent().put('/api/lists/abc').send({ name: 'X' }).expect(400);
    });
  });

  describe('DELETE /api/lists/:id', () => {
    it('deletes list and its items', async () => {
      const list = makeList();
      makeListItem(list.id, { title: 'Item' });
      await agent().delete('/api/lists/' + list.id).expect(200);
      const res = await agent().get('/api/lists').expect(200);
      assert.equal(res.body.length, 0);
    });

    it('returns 404 for non-existent list', async () => {
      await agent().delete('/api/lists/9999').expect(404);
    });
  });

  // ─── LIST ITEMS ───

  describe('GET /api/lists/:id/items', () => {
    it('returns items in order', async () => {
      const list = makeList();
      makeListItem(list.id, { title: 'B', position: 1 });
      makeListItem(list.id, { title: 'A', position: 0 });
      const res = await agent().get('/api/lists/' + list.id + '/items').expect(200);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].title, 'A');
      assert.equal(res.body[1].title, 'B');
    });
  });

  describe('POST /api/lists/:id/items', () => {
    it('adds a single item', async () => {
      const list = makeList();
      const res = await agent().post('/api/lists/' + list.id + '/items').send({ title: 'Buy milk' }).expect(201);
      assert.equal(res.body.title, 'Buy milk');
    });

    it('adds items with category and quantity', async () => {
      const list = makeList({ type: 'grocery' });
      const res = await agent().post('/api/lists/' + list.id + '/items')
        .send({ title: 'Apples', category: 'Produce', quantity: '6' }).expect(201);
      assert.equal(res.body.category, 'Produce');
      assert.equal(res.body.quantity, '6');
    });

    it('adds multiple items via array', async () => {
      const list = makeList();
      const res = await agent().post('/api/lists/' + list.id + '/items')
        .send([{ title: 'A' }, { title: 'B' }, { title: 'C' }]).expect(201);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 3);
    });

    it('rejects empty title', async () => {
      const list = makeList();
      await agent().post('/api/lists/' + list.id + '/items').send({ title: '' }).expect(400);
    });

    it('rejects title over 200 chars', async () => {
      const list = makeList();
      await agent().post('/api/lists/' + list.id + '/items').send({ title: 'X'.repeat(201) }).expect(400);
    });

    it('rejects adding to non-existent list', async () => {
      await agent().post('/api/lists/9999/items').send({ title: 'Nope' }).expect(404);
    });
  });

  describe('PUT /api/lists/:id/items/:itemId', () => {
    it('updates item title', async () => {
      const list = makeList();
      const item = makeListItem(list.id, { title: 'Old' });
      const res = await agent().put('/api/lists/' + list.id + '/items/' + item.id)
        .send({ title: 'New' }).expect(200);
      assert.equal(res.body.title, 'New');
    });

    it('toggles checked status', async () => {
      const list = makeList();
      const item = makeListItem(list.id, { title: 'X', checked: 0 });
      const res = await agent().put('/api/lists/' + list.id + '/items/' + item.id)
        .send({ checked: 1 }).expect(200);
      assert.equal(res.body.checked, 1);
    });
  });

  describe('DELETE /api/lists/:id/items/:itemId', () => {
    it('deletes an item', async () => {
      const list = makeList();
      const item = makeListItem(list.id, { title: 'Gone' });
      await agent().delete('/api/lists/' + list.id + '/items/' + item.id).expect(200);
      const res = await agent().get('/api/lists/' + list.id + '/items').expect(200);
      assert.equal(res.body.length, 0);
    });
  });

  // ─── REORDER & CLEAR ───

  describe('PATCH /api/lists/:id/items/reorder', () => {
    it('reorders items', async () => {
      const list = makeList();
      const a = makeListItem(list.id, { title: 'A', position: 0 });
      const b = makeListItem(list.id, { title: 'B', position: 1 });
      await agent().patch('/api/lists/' + list.id + '/items/reorder')
        .send([{ id: b.id, position: 0 }, { id: a.id, position: 1 }]).expect(200);
      const res = await agent().get('/api/lists/' + list.id + '/items').expect(200);
      assert.equal(res.body[0].title, 'B');
      assert.equal(res.body[1].title, 'A');
    });
  });

  describe('POST /api/lists/:id/clear-checked', () => {
    it('removes all checked items', async () => {
      const list = makeList();
      makeListItem(list.id, { title: 'Done', checked: 1 });
      makeListItem(list.id, { title: 'Pending', checked: 0 });
      const res = await agent().post('/api/lists/' + list.id + '/clear-checked').expect(200);
      assert.equal(res.body.cleared, 1);
      const items = await agent().get('/api/lists/' + list.id + '/items').expect(200);
      assert.equal(items.body.length, 1);
      assert.equal(items.body[0].title, 'Pending');
    });
  });

  // ─── CATEGORIES & TEMPLATES ───

  describe('GET /api/lists/categories', () => {
    it('returns grocery categories', async () => {
      const res = await agent().get('/api/lists/categories').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.includes('Produce'));
      assert.ok(res.body.includes('Dairy'));
      assert.ok(res.body.length >= 10);
    });
  });

  describe('GET /api/lists/templates', () => {
    it('returns list templates', async () => {
      const res = await agent().get('/api/lists/templates').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 4);
      assert.ok(res.body.some(t => t.id === 'weekly-groceries'));
    });
  });

  describe('POST /api/lists/from-template', () => {
    it('creates list from grocery template', async () => {
      const res = await agent().post('/api/lists/from-template').send({ template_id: 'weekly-groceries' }).expect(201);
      assert.equal(res.body.name, 'Weekly Groceries');
      assert.equal(res.body.type, 'grocery');
      // Verify items were created
      const items = await agent().get('/api/lists/' + res.body.id + '/items').expect(200);
      assert.ok(items.body.length >= 10);
    });

    it('creates list from travel template', async () => {
      const res = await agent().post('/api/lists/from-template').send({ template_id: 'travel-packing' }).expect(201);
      assert.equal(res.body.type, 'checklist');
    });

    it('rejects invalid template id', async () => {
      await agent().post('/api/lists/from-template').send({ template_id: 'nope' }).expect(404);
    });
  });

  // ─── SHARING ───

  describe('POST /api/lists/:id/share', () => {
    it('generates a share token', async () => {
      const list = makeList();
      const res = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      assert.ok(res.body.token);
      assert.match(res.body.token, /^[a-f0-9]{24}$/);
    });

    it('is idempotent (returns same token)', async () => {
      const list = makeList();
      const r1 = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      const r2 = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      assert.equal(r1.body.token, r2.body.token);
    });
  });

  describe('DELETE /api/lists/:id/share', () => {
    it('revokes sharing', async () => {
      const list = makeList();
      await agent().post('/api/lists/' + list.id + '/share').expect(200);
      await agent().delete('/api/lists/' + list.id + '/share').expect(200);
      const lists = await agent().get('/api/lists').expect(200);
      assert.equal(lists.body[0].share_token, null);
    });
  });

  describe('GET /api/shared/:token', () => {
    it('returns shared list data', async () => {
      const list = makeList({ name: 'Shared List' });
      makeListItem(list.id, { title: 'Item 1' });
      const shared = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      const res = await agent().get('/api/shared/' + shared.body.token).expect(200);
      assert.equal(res.body.name, 'Shared List');
      assert.ok(Array.isArray(res.body.items));
      assert.equal(res.body.items.length, 1);
      // Should NOT expose list id
      assert.equal(res.body.id, undefined);
    });

    it('rejects invalid token format', async () => {
      await agent().get('/api/shared/invalid').expect(400);
    });

    it('returns 404 for non-existent token', async () => {
      await agent().get('/api/shared/aabbccddeeff00112233aabb').expect(404);
    });
  });

  describe('PUT /api/shared/:token/items/:itemId', () => {
    it('toggles checked on shared item', async () => {
      const list = makeList();
      const item = makeListItem(list.id, { title: 'X', checked: 0 });
      const shared = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      const res = await agent().put('/api/shared/' + shared.body.token + '/items/' + item.id)
        .send({ checked: 1 }).expect(200);
      assert.equal(res.body.checked, 1);
    });
  });

  describe('POST /api/shared/:token/items', () => {
    it('adds item via shared link', async () => {
      const list = makeList();
      const shared = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      const res = await agent().post('/api/shared/' + shared.body.token + '/items')
        .send({ title: 'Added via share' }).expect(201);
      assert.equal(res.body.title, 'Added via share');
    });

    it('rejects empty title', async () => {
      const list = makeList();
      const shared = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      await agent().post('/api/shared/' + shared.body.token + '/items')
        .send({ title: '' }).expect(400);
    });

    it('rejects title over 200 chars', async () => {
      const list = makeList();
      const shared = await agent().post('/api/lists/' + list.id + '/share').expect(200);
      await agent().post('/api/shared/' + shared.body.token + '/items')
        .send({ title: 'Z'.repeat(201) }).expect(400);
    });
  });

  // ─── LIMIT ENFORCEMENT ───

  describe('limits', () => {
    it('enforces max 100 lists', async () => {
      const { db } = setup();
      for (let i = 0; i < 100; i++) {
        db.prepare('INSERT INTO lists (name,type,icon,color,position) VALUES (?,?,?,?,?)').run('L' + i, 'checklist', '📋', '#000', i);
      }
      await agent().post('/api/lists').send({ name: 'Over limit' }).expect(400);
    });
  });
});
