const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Notes, Inbox, Reviews Edge Cases', () => {
  let ag;
  before(() => { setup(); ag = agent(); });
  beforeEach(() => cleanDb());

  // ─── Inbox CRUD ───

  describe('Inbox CRUD', () => {
    it('POST /api/inbox with title → 201', async () => {
      const res = await ag.post('/api/inbox').send({ title: 'Quick thought' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Quick thought');
    });

    it('POST /api/inbox with empty title → 400', async () => {
      const res = await ag.post('/api/inbox').send({ title: '' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/inbox/:id updates fields', async () => {
      const c = await ag.post('/api/inbox').send({ title: 'Old' });
      const res = await ag.put(`/api/inbox/${c.body.id}`).send({ title: 'New', note: 'details' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'New');
    });

    it('priority 0-3 accepted', async () => {
      for (const p of [0, 1, 2, 3]) {
        const res = await ag.post('/api/inbox').send({ title: `P${p}`, priority: p });
        assert.equal(res.status, 201);
      }
    });

    it('priority 4 → 400', async () => {
      const c = await ag.post('/api/inbox').send({ title: 'X' });
      const res = await ag.put(`/api/inbox/${c.body.id}`).send({ priority: 4 });
      assert.equal(res.status, 400);
    });

    it('DELETE /api/inbox/:id → 200', async () => {
      const c = await ag.post('/api/inbox').send({ title: 'Del' });
      const res = await ag.delete(`/api/inbox/${c.body.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });

    it('DELETE non-existent inbox → 404', async () => {
      const res = await ag.delete('/api/inbox/99999');
      assert.equal(res.status, 404);
    });
  });

  // ─── Inbox triage ───

  describe('Inbox triage workflow', () => {
    it('triage creates task and deletes inbox item', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const inbox = await ag.post('/api/inbox').send({ title: 'Triage me' });
      const res = await ag.post(`/api/inbox/${inbox.body.id}/triage`).send({ goal_id: goal.id });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Triage me');
      // Inbox item deleted
      const check = await ag.get('/api/inbox');
      assert.equal(check.body.length, 0);
    });

    it('triage with due_date → task has due_date', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const inbox = await ag.post('/api/inbox').send({ title: 'Due' });
      const res = await ag.post(`/api/inbox/${inbox.body.id}/triage`).send({ goal_id: goal.id, due_date: '2026-04-01' });
      assert.equal(res.status, 201);
      assert.equal(res.body.due_date, '2026-04-01');
    });

    it('triage to non-owned goal → 403', async () => {
      const inbox = await ag.post('/api/inbox').send({ title: 'Bad' });
      const res = await ag.post(`/api/inbox/${inbox.body.id}/triage`).send({ goal_id: 99999 });
      assert.equal(res.status, 403);
    });

    it('triage without goal_id → 400', async () => {
      const inbox = await ag.post('/api/inbox').send({ title: 'No goal' });
      const res = await ag.post(`/api/inbox/${inbox.body.id}/triage`).send({});
      assert.equal(res.status, 400);
    });
  });

  // ─── Notes CRUD ───

  describe('Notes CRUD', () => {
    it('POST /api/notes with title → 201', async () => {
      const res = await ag.post('/api/notes').send({ title: 'My Note' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'My Note');
    });

    it('POST /api/notes with empty title → 400', async () => {
      const res = await ag.post('/api/notes').send({ title: '' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/notes/:id updates title and content', async () => {
      const c = await ag.post('/api/notes').send({ title: 'Old', content: 'old body' });
      const res = await ag.put(`/api/notes/${c.body.id}`).send({ title: 'New', content: 'new body' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'New');
      assert.equal(res.body.content, 'new body');
    });

    it('notes with goal_id filters by goal', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await ag.post('/api/notes').send({ title: 'Linked', goal_id: goal.id });
      await ag.post('/api/notes').send({ title: 'Unlinked' });
      const res = await ag.get(`/api/notes?goal_id=${goal.id}`);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Linked');
    });

    it('DELETE /api/notes/:id → 200', async () => {
      const c = await ag.post('/api/notes').send({ title: 'Del' });
      const res = await ag.delete(`/api/notes/${c.body.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });

    it('GET /api/notes/:id returns single note', async () => {
      const c = await ag.post('/api/notes').send({ title: 'Single', content: 'body' });
      const res = await ag.get(`/api/notes/${c.body.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Single');
    });
  });

  // ─── Weekly Review ───

  describe('Weekly review', () => {
    it('POST /api/reviews creates weekly review', async () => {
      const res = await ag.post('/api/reviews').send({ week_start: '2026-03-23', reflection: 'Good week' });
      assert.ok([200, 201].includes(res.status));
      assert.ok(res.body.id);
    });

    it('same week_start → upsert', async () => {
      await ag.post('/api/reviews').send({ week_start: '2026-03-23', reflection: 'V1' });
      const res = await ag.post('/api/reviews').send({ week_start: '2026-03-23', reflection: 'V2' });
      assert.equal(res.status, 200);
      assert.equal(res.body.reflection, 'V2');
    });

    it('rating clamped to 1-5', async () => {
      const r1 = await ag.post('/api/reviews').send({ week_start: '2026-03-16', rating: 0 });
      assert.ok([200, 201].includes(r1.status));
      assert.equal(r1.body.rating, 1); // clamped from 0 to 1

      const r2 = await ag.post('/api/reviews').send({ week_start: '2026-03-09', rating: 10 });
      assert.ok([200, 201].includes(r2.status));
      assert.equal(r2.body.rating, 5); // clamped to 5
    });

    it('invalid week_start format → 400', async () => {
      const res = await ag.post('/api/reviews').send({ week_start: 'not-a-date' });
      assert.equal(res.status, 400);
    });

    it('DELETE /api/reviews/:id → 200', async () => {
      const c = await ag.post('/api/reviews').send({ week_start: '2026-03-23' });
      const res = await ag.delete(`/api/reviews/${c.body.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });

    it('GET /api/reviews/current returns week stats', async () => {
      const res = await ag.get('/api/reviews/current');
      assert.equal(res.status, 200);
      assert.ok(res.body.weekStart);
      assert.ok('tasksCompletedCount' in res.body);
      assert.ok('areaStats' in res.body);
    });
  });

  // ─── Daily Review ───

  describe('Daily review', () => {
    it('POST /api/reviews/daily creates review', async () => {
      const res = await ag.post('/api/reviews/daily').send({ date: '2026-03-30', note: 'Good day' });
      assert.ok([200, 201].includes(res.status));
      assert.equal(res.body.date, '2026-03-30');
    });

    it('same date → upsert', async () => {
      await ag.post('/api/reviews/daily').send({ date: '2026-03-30', note: 'V1' });
      const res = await ag.post('/api/reviews/daily').send({ date: '2026-03-30', note: 'V2' });
      assert.equal(res.status, 200);
      assert.equal(res.body.note, 'V2');
    });

    it('invalid date → 400', async () => {
      const res = await ag.post('/api/reviews/daily').send({ date: 'bad' });
      assert.equal(res.status, 400);
    });

    it('GET /api/reviews/daily/:date returns review', async () => {
      await ag.post('/api/reviews/daily').send({ date: '2026-03-30', note: 'Test' });
      const res = await ag.get('/api/reviews/daily/2026-03-30');
      assert.equal(res.status, 200);
      assert.equal(res.body.note, 'Test');
    });

    it('GET /api/reviews/daily/:date for missing → 404', async () => {
      const res = await ag.get('/api/reviews/daily/2025-01-01');
      assert.equal(res.status, 404);
    });
  });

  // ─── Automation Rules ───

  describe('Automation rules', () => {
    it('POST /api/rules with valid trigger/action → 201', async () => {
      const res = await ag.post('/api/rules').send({
        name: 'Auto tag',
        trigger_type: 'task_completed',
        action_type: 'add_tag'
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'Auto tag');
    });

    it('invalid trigger_type → 400', async () => {
      const res = await ag.post('/api/rules').send({
        name: 'Bad', trigger_type: 'invalid', action_type: 'add_tag'
      });
      assert.equal(res.status, 400);
    });

    it('invalid action_type → 400', async () => {
      const res = await ag.post('/api/rules').send({
        name: 'Bad', trigger_type: 'task_completed', action_type: 'invalid'
      });
      assert.equal(res.status, 400);
    });

    it('name max 100 chars', async () => {
      const res = await ag.post('/api/rules').send({
        name: 'A'.repeat(101), trigger_type: 'task_completed', action_type: 'add_tag'
      });
      assert.equal(res.status, 400);
    });

    it('enable/disable toggle', async () => {
      const c = await ag.post('/api/rules').send({
        name: 'Toggle', trigger_type: 'task_completed', action_type: 'add_tag'
      });
      const res = await ag.put(`/api/rules/${c.body.id}`).send({ enabled: 0 });
      assert.equal(res.status, 200);
      assert.equal(res.body.enabled, 0);
    });

    it('DELETE /api/rules/:id → 200', async () => {
      const c = await ag.post('/api/rules').send({
        name: 'Del', trigger_type: 'task_completed', action_type: 'add_tag'
      });
      const res = await ag.delete(`/api/rules/${c.body.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });

    it('empty name → 400', async () => {
      const res = await ag.post('/api/rules').send({
        name: '', trigger_type: 'task_completed', action_type: 'add_tag'
      });
      assert.equal(res.status, 400);
    });
  });
});
