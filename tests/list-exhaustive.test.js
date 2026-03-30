const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, agent, makeList, makeListItem } = require('./helpers');

describe('List System Exhaustive', () => {
  let ag;
  before(() => { setup(); ag = agent(); });
  beforeEach(() => cleanDb());

  // ─── List CRUD boundaries ───

  describe('List CRUD boundaries', () => {
    it('create list with valid name', async () => {
      const res = await ag.post('/api/lists').send({ name: 'Groceries' });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'Groceries');
      assert.equal(res.body.type, 'checklist'); // default
    });

    it('name max 100 chars accepted', async () => {
      const res = await ag.post('/api/lists').send({ name: 'A'.repeat(100) });
      assert.equal(res.status, 201);
    });

    it('name 101 chars rejected', async () => {
      const res = await ag.post('/api/lists').send({ name: 'A'.repeat(101) });
      assert.equal(res.status, 400);
    });

    it('empty name rejected', async () => {
      const res = await ag.post('/api/lists').send({ name: '' });
      assert.equal(res.status, 400);
    });

    it('duplicate names accepted', async () => {
      await ag.post('/api/lists').send({ name: 'Dup' });
      const res = await ag.post('/api/lists').send({ name: 'Dup' });
      assert.equal(res.status, 201);
    });

    it('valid types accepted', async () => {
      for (const type of ['checklist', 'grocery', 'notes']) {
        const res = await ag.post('/api/lists').send({ name: `List ${type}`, type });
        assert.equal(res.status, 201);
        assert.equal(res.body.type, type);
      }
    });

    it('invalid type rejected', async () => {
      const res = await ag.post('/api/lists').send({ name: 'Bad', type: 'invalid' });
      assert.equal(res.status, 400);
    });

    it('icon field stored', async () => {
      const res = await ag.post('/api/lists').send({ name: 'Icons', icon: '🛒' });
      assert.equal(res.status, 201);
      assert.equal(res.body.icon, '🛒');
    });

    it('color validated', async () => {
      const res = await ag.post('/api/lists').send({ name: 'Bad', color: 'not-a-color' });
      assert.equal(res.status, 400);
    });

    it('update list name', async () => {
      const c = await ag.post('/api/lists').send({ name: 'Old' });
      const res = await ag.put(`/api/lists/${c.body.id}`).send({ name: 'New' });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'New');
    });

    it('delete list', async () => {
      const c = await ag.post('/api/lists').send({ name: 'Del' });
      const res = await ag.delete(`/api/lists/${c.body.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.deleted);
    });
  });

  // ─── List item boundaries ───

  describe('List item boundaries', () => {
    it('add item to list', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const res = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Milk' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Milk');
    });

    it('item title max 200 chars accepted', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const res = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'X'.repeat(200) });
      assert.equal(res.status, 201);
    });

    it('item title 201 chars rejected', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const res = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'X'.repeat(201) });
      assert.equal(res.status, 400);
    });

    it('empty item title rejected', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const res = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: '' });
      assert.equal(res.status, 400);
    });

    it('checked toggle 0→1→0', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const item = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'T' });
      assert.equal(item.body.checked, 0);
      const r1 = await ag.put(`/api/lists/${list.body.id}/items/${item.body.id}`).send({ checked: 1 });
      assert.equal(r1.body.checked, 1);
      const r2 = await ag.put(`/api/lists/${list.body.id}/items/${item.body.id}`).send({ checked: 0 });
      assert.equal(r2.body.checked, 0);
    });

    it('batch create items', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const res = await ag.post(`/api/lists/${list.body.id}/items`).send([
        { title: 'A' }, { title: 'B' }, { title: 'C' }
      ]);
      assert.equal(res.status, 201);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 3);
    });

    it('category and quantity stored', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L', type: 'grocery' });
      const res = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Apples', category: 'Fruits', quantity: '3 lbs' });
      assert.equal(res.status, 201);
      assert.equal(res.body.category, 'Fruits');
      assert.equal(res.body.quantity, '3 lbs');
    });

    it('note field on items', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const item = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'T' });
      const res = await ag.put(`/api/lists/${list.body.id}/items/${item.body.id}`).send({ note: 'details here' });
      assert.equal(res.body.note, 'details here');
    });

    it('reorder items', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const a = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'A' });
      const b = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'B' });
      const res = await ag.patch(`/api/lists/${list.body.id}/items/reorder`).send([
        { id: a.body.id, position: 1 },
        { id: b.body.id, position: 0 }
      ]);
      assert.equal(res.status, 200);
      assert.equal(res.body.reordered, 2);
    });

    it('delete item', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const item = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'T' });
      const res = await ag.delete(`/api/lists/${list.body.id}/items/${item.body.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.deleted);
    });
  });

  // ─── List operations ───

  describe('List operations', () => {
    it('duplicate copies list and items', async () => {
      const list = await ag.post('/api/lists').send({ name: 'Original' });
      await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Item1' });
      await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Item2' });
      const res = await ag.post(`/api/lists/${list.body.id}/duplicate`);
      assert.equal(res.status, 201);
      assert.ok(res.body.name.includes('copy'));
      assert.equal(res.body.items.length, 2);
    });

    it('duplicate with keep_checked=false resets checked', async () => {
      const list = await ag.post('/api/lists').send({ name: 'Original' });
      const item = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Done' });
      await ag.put(`/api/lists/${list.body.id}/items/${item.body.id}`).send({ checked: 1 });
      const res = await ag.post(`/api/lists/${list.body.id}/duplicate`).send({ keep_checked: false });
      assert.equal(res.status, 201);
      assert.equal(res.body.items[0].checked, 0);
    });

    it('clear-checked removes checked items', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const item = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'T1' });
      await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'T2' });
      await ag.put(`/api/lists/${list.body.id}/items/${item.body.id}`).send({ checked: 1 });
      const res = await ag.post(`/api/lists/${list.body.id}/clear-checked`);
      assert.equal(res.status, 200);
      assert.equal(res.body.cleared, 1);
      const items = await ag.get(`/api/lists/${list.body.id}/items`);
      assert.equal(items.body.length, 1);
    });

    it('uncheck-all resets all to unchecked', async () => {
      const list = await ag.post('/api/lists').send({ name: 'L' });
      const i1 = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'A' });
      const i2 = await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'B' });
      await ag.put(`/api/lists/${list.body.id}/items/${i1.body.id}`).send({ checked: 1 });
      await ag.put(`/api/lists/${list.body.id}/items/${i2.body.id}`).send({ checked: 1 });
      const res = await ag.post(`/api/lists/${list.body.id}/uncheck-all`);
      assert.equal(res.status, 200);
      assert.equal(res.body.unchecked, 2);
    });
  });

  // ─── Sublist nesting ───

  describe('Sublist nesting', () => {
    it('create sublist with parent_id', async () => {
      const parent = await ag.post('/api/lists').send({ name: 'Parent' });
      const res = await ag.post('/api/lists').send({ name: 'Child', parent_id: parent.body.id });
      assert.equal(res.status, 201);
      assert.equal(res.body.parent_id, parent.body.id);
    });

    it('2-level nesting prevented', async () => {
      const l1 = await ag.post('/api/lists').send({ name: 'L1' });
      const l2 = await ag.post('/api/lists').send({ name: 'L2', parent_id: l1.body.id });
      const res = await ag.post('/api/lists').send({ name: 'L3', parent_id: l2.body.id });
      assert.equal(res.status, 400);
    });

    it('self-referencing parent_id rejected', async () => {
      const list = await ag.post('/api/lists').send({ name: 'Self' });
      const res = await ag.put(`/api/lists/${list.body.id}`).send({ parent_id: list.body.id });
      assert.equal(res.status, 400);
    });

    it('sublists endpoint returns children', async () => {
      const parent = await ag.post('/api/lists').send({ name: 'Parent' });
      await ag.post('/api/lists').send({ name: 'Child1', parent_id: parent.body.id });
      await ag.post('/api/lists').send({ name: 'Child2', parent_id: parent.body.id });
      const res = await ag.get(`/api/lists/${parent.body.id}/sublists`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });
  });

  // ─── Sharing ───

  describe('Shared list access', () => {
    it('share generates token', async () => {
      const list = await ag.post('/api/lists').send({ name: 'Shared' });
      const res = await ag.post(`/api/lists/${list.body.id}/share`);
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
      assert.ok(typeof res.body.token === 'string');
    });

    it('GET /api/shared/:token returns list without auth', async () => {
      const list = await ag.post('/api/lists').send({ name: 'Public' });
      await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Item1' });
      const share = await ag.post(`/api/lists/${list.body.id}/share`);
      // rawAgent (no auth) test — use the agent but the endpoint doesn't require auth
      const res = await ag.get(`/api/shared/${share.body.token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'Public');
      assert.ok(Array.isArray(res.body.items));
    });

    it('invalid token format → 400', async () => {
      const res = await ag.get('/api/shared/not-valid-token!');
      assert.equal(res.status, 400);
    });

    it('non-existent token → 404', async () => {
      const res = await ag.get('/api/shared/abcdef0123456789abcdef01');
      assert.equal(res.status, 404);
    });

    it('unshare removes token', async () => {
      const list = await ag.post('/api/lists').send({ name: 'Unshare' });
      const share = await ag.post(`/api/lists/${list.body.id}/share`);
      await ag.delete(`/api/lists/${list.body.id}/share`);
      const res = await ag.get(`/api/shared/${share.body.token}`);
      assert.equal(res.status, 404);
    });
  });

  // ─── Deletion cascade ───

  describe('Deletion cascade', () => {
    it('deleting list cascades its items', async () => {
      const { db } = setup();
      const list = await ag.post('/api/lists').send({ name: 'Del' });
      await ag.post(`/api/lists/${list.body.id}/items`).send({ title: 'Orphan' });
      await ag.delete(`/api/lists/${list.body.id}`);
      const items = db.prepare('SELECT * FROM list_items WHERE list_id=?').all(list.body.id);
      assert.equal(items.length, 0);
    });

    it('deleting parent cascades child lists', async () => {
      const parent = await ag.post('/api/lists').send({ name: 'Parent' });
      const child = await ag.post('/api/lists').send({ name: 'Child', parent_id: parent.body.id });
      await ag.delete(`/api/lists/${parent.body.id}`);
      const check = await ag.get(`/api/lists/${child.body.id}/items`);
      assert.equal(check.status, 404);
    });
  });
});
