const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeList, makeListItem, agent, makeUser2 } = require('./helpers');

describe('List Items Edit API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('PUT /api/lists/:id/items/:itemId — title update', () => {
    it('updates item title', async () => {
      const list = makeList({ name: 'Shopping' });
      const item = makeListItem(list.id, { title: 'Milk' });
      const res = await agent()
        .put(`/api/lists/${list.id}/items/${item.id}`)
        .send({ title: 'Almond Milk' })
        .expect(200);
      assert.equal(res.body.title, 'Almond Milk');
      assert.equal(res.body.id, item.id);
    });
  });

  describe('PUT /api/lists/:id/items/:itemId — quantity and note', () => {
    it('updates quantity and note', async () => {
      const list = makeList({ name: 'Groceries', type: 'grocery' });
      const item = makeListItem(list.id, { title: 'Eggs', quantity: '6', note: '' });
      const res = await agent()
        .put(`/api/lists/${list.id}/items/${item.id}`)
        .send({ quantity: '12', note: 'Free range only' })
        .expect(200);
      assert.equal(res.body.quantity, '12');
      assert.equal(res.body.note, 'Free range only');
      assert.equal(res.body.title, 'Eggs'); // title unchanged
    });
  });

  describe('PUT /api/lists/:id/items/:itemId — enhanced metadata', () => {
    it('updates metadata (price, url, rating)', async () => {
      const list = makeList({ name: 'Wish List' });
      const item = makeListItem(list.id, { title: 'Headphones' });
      const res = await agent()
        .put(`/api/lists/${list.id}/items/${item.id}`)
        .send({ metadata: { price: 49.99, url: 'https://example.com/headphones', rating: 4 } })
        .expect(200);
      const meta = JSON.parse(res.body.metadata);
      assert.equal(meta.price, 49.99);
      assert.equal(meta.url, 'https://example.com/headphones');
      assert.equal(meta.rating, 4);
    });
  });

  describe('PUT /api/lists/:id/items/:itemId — IDOR validation', () => {
    it('rejects edit from non-owner', async () => {
      const list = makeList({ name: 'Private List' });
      const item = makeListItem(list.id, { title: 'Secret item' });
      const user2 = makeUser2();
      await user2.agent
        .put(`/api/lists/${list.id}/items/${item.id}`)
        .send({ title: 'Hacked' })
        .expect(404); // list not found for user2
    });
  });

  describe('PUT /api/lists/:id/items/:itemId — input validation', () => {
    it('rejects title exceeding max length', async () => {
      const list = makeList({ name: 'Test' });
      const item = makeListItem(list.id, { title: 'Short' });
      await agent()
        .put(`/api/lists/${list.id}/items/${item.id}`)
        .send({ title: 'A'.repeat(201) })
        .expect(400);
    });

    it('rejects empty title', async () => {
      const list = makeList({ name: 'Test' });
      const item = makeListItem(list.id, { title: 'Valid' });
      await agent()
        .put(`/api/lists/${list.id}/items/${item.id}`)
        .send({ title: '' })
        .expect(400);
    });
  });
});
