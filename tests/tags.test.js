const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent } = require('./helpers');

describe('Tags API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/tags', () => {
    it('returns empty array when no tags', async () => {
      const res = await agent().get('/api/tags').expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('returns tags ordered by name', async () => {
      makeTag({ name: 'zzz' });
      makeTag({ name: 'aaa' });

      const res = await agent().get('/api/tags').expect(200);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].name, 'aaa');
      assert.equal(res.body[1].name, 'zzz');
    });
  });

  describe('POST /api/tags', () => {
    it('creates a new tag', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'important', color: '#FF0000' })
        .expect(201);
      assert.equal(res.body.name, 'important');
      assert.equal(res.body.color, '#FF0000');
      assert.ok(res.body.id);
    });

    it('uses default color when not provided', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'plain' })
        .expect(201);
      assert.equal(res.body.color, '#64748B');
    });

    it('sanitizes tag name (lowercase, remove special chars)', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: '  Hello World!@#$  ' })
        .expect(201);
      assert.equal(res.body.name, 'hello world');
    });

    it('returns existing tag when name already exists (dedup)', async () => {
      const first = await agent()
        .post('/api/tags')
        .send({ name: 'duplicate', color: '#111' })
        .expect(201);
      const second = await agent()
        .post('/api/tags')
        .send({ name: 'duplicate', color: '#222' })
        .expect(200);
      assert.equal(first.body.id, second.body.id);
      assert.equal(second.body.color, '#111'); // Keeps original color
    });

    it('returns 400 when name is missing', async () => {
      await agent().post('/api/tags').send({}).expect(400);
    });

    it('returns 400 when name is whitespace', async () => {
      await agent().post('/api/tags').send({ name: '   ' }).expect(400);
    });
  });

  describe('DELETE /api/tags/:id', () => {
    it('deletes a tag', async () => {
      const tag = makeTag({ name: 'to-delete' });
      await agent().delete(`/api/tags/${tag.id}`).expect(200);

      const res = await agent().get('/api/tags').expect(200);
      assert.equal(res.body.length, 0);
    });

    it('removes tag associations from tasks (cascade)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag = makeTag({ name: 'to-delete' });
      linkTag(task.id, tag.id);

      await agent().delete(`/api/tags/${tag.id}`).expect(200);

      // Task should have no tags
      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.equal(res.body.tags.length, 0);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().delete('/api/tags/abc').expect(400);
    });
  });

  describe('PUT /api/tasks/:id/tags', () => {
    it('sets tags for a task (replaces all)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag1 = makeTag({ name: 'tag-a' });
      const tag2 = makeTag({ name: 'tag-b' });

      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [tag1.id, tag2.id] })
        .expect(200);
      assert.equal(res.body.tags.length, 2);
    });

    it('replaces existing tags completely', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag1 = makeTag({ name: 'old-tag' });
      const tag2 = makeTag({ name: 'new-tag' });
      linkTag(task.id, tag1.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [tag2.id] })
        .expect(200);
      assert.equal(res.body.tags.length, 1);
      assert.equal(res.body.tags[0].name, 'new-tag');
    });

    it('clears all tags when empty array', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag = makeTag({ name: 'to-clear' });
      linkTag(task.id, tag.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [] })
        .expect(200);
      assert.equal(res.body.tags.length, 0);
    });

    it('returns 400 when tagIds is not an array', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: 'not-array' })
        .expect(400);
    });

    it('returns 400 for invalid task ID', async () => {
      await agent()
        .put('/api/tasks/abc/tags')
        .send({ tagIds: [] })
        .expect(400);
    });

    it('ignores non-integer tag IDs gracefully', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag = makeTag({ name: 'valid' });

      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [tag.id, 'bad', null, 3.5] })
        .expect(200);
      assert.equal(res.body.tags.length, 1);
      assert.equal(res.body.tags[0].name, 'valid');
    });
  });
});
