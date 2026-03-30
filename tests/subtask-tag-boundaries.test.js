const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag } = require('./helpers');

describe('Subtask & Tag Boundary Values', () => {
  let area, goal, task;

  beforeEach(() => {
    cleanDb();
    area = makeArea();
    goal = makeGoal(area.id);
    task = makeTask(goal.id);
  });
  after(() => teardown());

  // ─── Subtask title boundaries ───────────────────────────────────────────────

  describe('Subtask title boundaries', () => {
    it('rejects empty title → 400', async () => {
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: '' })
        .expect(400);
      assert.ok(res.body.error);
    });

    it('accepts very long title (1000 chars)', async () => {
      const title = 'A'.repeat(1000);
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title })
        .expect(201);
      assert.equal(res.body.title, title);
    });

    it('accepts unicode title (emoji, CJK, Arabic)', async () => {
      const title = '🎯 サブタスク 子任務 مهمة فرعية';
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title })
        .expect(201);
      assert.equal(res.body.title, title);
    });

    it('rejects whitespace-only title → 400', async () => {
      await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: '   \t\n  ' })
        .expect(400);
    });

    it('stores HTML/XSS content as-is (no execution context)', async () => {
      const title = '<script>alert("xss")</script>';
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title })
        .expect(201);
      // Stored as-is — frontend esc() handles output encoding
      assert.equal(res.body.title, title);
    });
  });

  // ─── Subtask note boundaries ────────────────────────────────────────────────

  describe('Subtask note boundaries', () => {
    it('accepts null note (defaults to empty)', async () => {
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: 'Note test' })
        .expect(201);
      assert.equal(res.body.note, '');
    });

    it('accepts empty string note', async () => {
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: 'Note test', note: '' })
        .expect(201);
      assert.equal(res.body.note, '');
    });

    it('accepts very long note (5000 chars)', async () => {
      const note = 'N'.repeat(5000);
      const res = await agent()
        .post(`/api/tasks/${task.id}/subtasks`)
        .send({ title: 'Long note', note })
        .expect(201);
      assert.equal(res.body.note, note);
    });
  });

  // ─── Subtask done toggle boundaries ─────────────────────────────────────────

  describe('Subtask done toggle', () => {
    it('toggles 0 → 1', async () => {
      const sub = makeSubtask(task.id, { done: 0 });
      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: true })
        .expect(200);
      assert.equal(res.body.done, 1);
    });

    it('toggles 1 → 0', async () => {
      const sub = makeSubtask(task.id, { done: 1 });
      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: false })
        .expect(200);
      assert.equal(res.body.done, 0);
    });

    it('preserves done when not sent (null/undefined)', async () => {
      const sub = makeSubtask(task.id, { done: 1 });
      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ title: 'Updated' })
        .expect(200);
      assert.equal(res.body.done, 1);
      assert.equal(res.body.title, 'Updated');
    });

    it('coerces string "yes" to truthy (done=1)', async () => {
      const sub = makeSubtask(task.id, { done: 0 });
      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: 'yes' })
        .expect(200);
      // "yes" is truthy → done ? 1 : 0 → 1
      assert.equal(res.body.done, 1);
    });
  });

  // ─── Subtask position boundaries ───────────────────────────────────────────

  describe('Subtask position / reorder', () => {
    it('reorder handles negative positions', async () => {
      const s1 = makeSubtask(task.id, { title: 'A', position: 0 });
      const s2 = makeSubtask(task.id, { title: 'B', position: 1 });

      await agent()
        .put('/api/subtasks/reorder')
        .send({ items: [{ id: s1.id, position: -1 }, { id: s2.id, position: 0 }] })
        .expect(200);

      const res = await agent().get(`/api/tasks/${task.id}/subtasks`).expect(200);
      // Negative position sorts before zero
      assert.equal(res.body[0].title, 'A');
      assert.equal(res.body[0].position, -1);
    });

    it('handles duplicate positions gracefully', async () => {
      const s1 = makeSubtask(task.id, { title: 'A', position: 0 });
      const s2 = makeSubtask(task.id, { title: 'B', position: 1 });

      const res = await agent()
        .put('/api/subtasks/reorder')
        .send({ items: [{ id: s1.id, position: 5 }, { id: s2.id, position: 5 }] })
        .expect(200);
      assert.ok(res.body.ok);

      // Both positions set to 5 — DB allows it
      const subs = await agent().get(`/api/tasks/${task.id}/subtasks`).expect(200);
      assert.equal(subs.body.length, 2);
    });

    it('handles position gaps (0, 10, 100)', async () => {
      const s1 = makeSubtask(task.id, { title: 'A', position: 0 });
      const s2 = makeSubtask(task.id, { title: 'B', position: 1 });
      const s3 = makeSubtask(task.id, { title: 'C', position: 2 });

      await agent()
        .put('/api/subtasks/reorder')
        .send({ items: [
          { id: s1.id, position: 0 },
          { id: s2.id, position: 10 },
          { id: s3.id, position: 100 },
        ] })
        .expect(200);

      const subs = await agent().get(`/api/tasks/${task.id}/subtasks`).expect(200);
      assert.equal(subs.body[0].position, 0);
      assert.equal(subs.body[1].position, 10);
      assert.equal(subs.body[2].position, 100);
    });
  });

  // ─── Tag name boundaries ───────────────────────────────────────────────────

  describe('Tag name boundaries', () => {
    it('rejects empty name → 400', async () => {
      await agent()
        .post('/api/tags')
        .send({ name: '' })
        .expect(400);
    });

    it('returns existing tag on duplicate name (same user)', async () => {
      const first = await agent()
        .post('/api/tags')
        .send({ name: 'dupetag' })
        .expect(201);
      const second = await agent()
        .post('/api/tags')
        .send({ name: 'dupetag' })
        .expect(200);
      assert.equal(first.body.id, second.body.id);
    });

    it('accepts unicode name (keeps alphanumeric only)', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'café' })
        .expect(201);
      // Service strips non-[a-z0-9-_ ] characters
      assert.equal(res.body.name, 'caf');
    });

    it('strips special characters (#@!)', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: '#urgent @now !important' })
        .expect(201);
      assert.equal(res.body.name, 'urgent now important');
    });

    it('accepts max length name (50 chars)', async () => {
      const name = 'a'.repeat(50);
      const res = await agent()
        .post('/api/tags')
        .send({ name })
        .expect(201);
      assert.equal(res.body.name, name);
    });

    it('rejects name over 50 chars → 400', async () => {
      const name = 'a'.repeat(51);
      await agent()
        .post('/api/tags')
        .send({ name })
        .expect(400);
    });

    it('is case-insensitive (lowercased on create)', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'URGENT' })
        .expect(201);
      assert.equal(res.body.name, 'urgent');
    });

    it('treats differently-cased names as duplicates', async () => {
      const first = await agent()
        .post('/api/tags')
        .send({ name: 'Work' })
        .expect(201);
      const second = await agent()
        .post('/api/tags')
        .send({ name: 'work' })
        .expect(200);
      assert.equal(first.body.id, second.body.id);
    });
  });

  // ─── Tag color boundaries ──────────────────────────────────────────────────

  describe('Tag color boundaries', () => {
    it('accepts valid 6-digit hex color', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'hexcolor', color: '#FF5733' })
        .expect(201);
      assert.equal(res.body.color, '#FF5733');
    });

    it('accepts valid 3-digit hex color', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'shorthex', color: '#F00' })
        .expect(201);
      assert.equal(res.body.color, '#F00');
    });

    it('rejects invalid hex color → 400', async () => {
      await agent()
        .post('/api/tags')
        .send({ name: 'badhex', color: 'notacolor' })
        .expect(400);
    });

    it('uses default color when color is omitted', async () => {
      const res = await agent()
        .post('/api/tags')
        .send({ name: 'nocolor' })
        .expect(201);
      assert.equal(res.body.color, '#64748B');
    });
  });

  // ─── Task-tag association boundaries ───────────────────────────────────────

  describe('Task-tag association boundaries', () => {
    it('setting same tag twice results in only one association', async () => {
      const tag = makeTag({ name: 'dup-assoc' });
      await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [tag.id, tag.id] })
        .expect(200);
      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.equal(res.body.tags.length, 1);
    });

    it('setting tags with non-existent IDs ignores invalid ones', async () => {
      const tag = makeTag({ name: 'real-tag' });
      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [tag.id, 99999, 88888] })
        .expect(200);
      // Only the real tag gets associated (INSERT OR IGNORE for non-existent FK)
      assert.equal(res.body.tags.length, 1);
      assert.equal(res.body.tags[0].name, 'real-tag');
    });

    it('stress: set 20 tags on a single task', async () => {
      const tagIds = [];
      for (let i = 0; i < 20; i++) {
        const t = makeTag({ name: `stress-tag-${i}` });
        tagIds.push(t.id);
      }
      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds })
        .expect(200);
      assert.equal(res.body.tags.length, 20);
    });

    it('setting empty array clears all tags', async () => {
      const tag = makeTag({ name: 'cleared' });
      linkTag(task.id, tag.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [] })
        .expect(200);
      assert.equal(res.body.tags.length, 0);
    });

    it('returns 404 when setting tags on non-existent task', async () => {
      const tag = makeTag({ name: 'orphan-tag' });
      await agent()
        .put('/api/tasks/99999/tags')
        .send({ tagIds: [tag.id] })
        .expect(404);
    });

    it('setting tags with mixed valid/invalid IDs keeps only valid', async () => {
      const tag1 = makeTag({ name: 'valid1' });
      const tag2 = makeTag({ name: 'valid2' });
      const res = await agent()
        .put(`/api/tasks/${task.id}/tags`)
        .send({ tagIds: [tag1.id, 'abc', null, tag2.id, 3.14] })
        .expect(200);
      assert.equal(res.body.tags.length, 2);
    });
  });

  // ─── Subtask on non-existent/deleted task ──────────────────────────────────

  describe('Subtask on non-existent/deleted task', () => {
    it('create subtask on non-existent task → 404', async () => {
      await agent()
        .post('/api/tasks/99999/subtasks')
        .send({ title: 'Orphan' })
        .expect(404);
    });

    it('read subtasks of non-existent task → 404', async () => {
      await agent()
        .get('/api/tasks/99999/subtasks')
        .expect(404);
    });

    it('update subtask after parent task deleted → 404', async () => {
      const sub = makeSubtask(task.id);
      // Delete the parent task (cascades subtasks)
      await agent().delete(`/api/tasks/${task.id}`).expect(200);

      await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ title: 'Ghost' })
        .expect(404);
    });

    it('delete subtask after parent task deleted → 404', async () => {
      const sub = makeSubtask(task.id);
      await agent().delete(`/api/tasks/${task.id}`).expect(200);

      await agent()
        .delete(`/api/subtasks/${sub.id}`)
        .expect(404);
    });
  });
});
