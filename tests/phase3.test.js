const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent, today, daysFromNow } = require('./helpers');

describe('Phase 3 Features', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('Inbox API', () => {
    it('creates an inbox item', async () => {
      const res = await agent().post('/api/inbox').send({ title: 'Quick thought' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Quick thought');
      assert.ok(res.body.id);
    });

    it('lists inbox items', async () => {
      await agent().post('/api/inbox').send({ title: 'Item 1' });
      await agent().post('/api/inbox').send({ title: 'Item 2' });
      const res = await agent().get('/api/inbox');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('updates an inbox item', async () => {
      const { body: item } = await agent().post('/api/inbox').send({ title: 'Update me' });
      const res = await agent().put('/api/inbox/' + item.id).send({ title: 'Updated', priority: 2 });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Updated');
      assert.equal(res.body.priority, 2);
    });

    it('deletes an inbox item', async () => {
      const { body: item } = await agent().post('/api/inbox').send({ title: 'Delete me' });
      const del = await agent().delete('/api/inbox/' + item.id);
      assert.equal(del.status, 200);
      const list = await agent().get('/api/inbox');
      assert.equal(list.body.length, 0);
    });

    it('returns 400 for empty title', async () => {
      const res = await agent().post('/api/inbox').send({ title: '' });
      assert.equal(res.status, 400);
    });

    it('triages an inbox item to a goal', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: item } = await agent().post('/api/inbox').send({ title: 'Triage me', note: 'some note', priority: 2 });
      const res = await agent().post('/api/inbox/' + item.id + '/triage').send({ goal_id: g.id, due_date: today() });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Triage me');
      assert.equal(res.body.goal_id, g.id);
      assert.equal(res.body.due_date, today());
      // Inbox item should be removed
      const inbox = await agent().get('/api/inbox');
      assert.equal(inbox.body.length, 0);
    });

    it('returns 400 for triage without goal_id', async () => {
      const { body: item } = await agent().post('/api/inbox').send({ title: 'No goal' });
      const res = await agent().post('/api/inbox/' + item.id + '/triage').send({});
      assert.equal(res.status, 400);
    });
  });

  describe('Time Estimates & Tracking', () => {
    it('creates a task with estimated_minutes', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const res = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Estimated', estimated_minutes: 45 });
      assert.equal(res.status, 201);
      assert.equal(res.body.estimated_minutes, 45);
    });

    it('updates estimated_minutes on a task', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Update est' });
      const res = await agent().put('/api/tasks/' + t.id).send({ estimated_minutes: 30 });
      assert.equal(res.status, 200);
      assert.equal(res.body.estimated_minutes, 30);
    });

    it('logs time on a task', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Track time' });
      await agent().post('/api/tasks/' + t.id + '/time').send({ minutes: 15 });
      const res = await agent().post('/api/tasks/' + t.id + '/time').send({ minutes: 10 });
      assert.equal(res.body.actual_minutes, 25);
    });

    it('rejects non-positive time', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const { body: t } = await agent().post('/api/goals/' + g.id + '/tasks').send({ title: 'Bad time' });
      const res = await agent().post('/api/tasks/' + t.id + '/time').send({ minutes: 0 });
      assert.equal(res.status, 400);
    });
  });

  describe('Notes API', () => {
    it('creates a note', async () => {
      const res = await agent().post('/api/notes').send({ title: 'My Note', content: 'Hello world' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'My Note');
      assert.equal(res.body.content, 'Hello world');
      assert.ok(res.body.id);
    });

    it('creates a note linked to a goal', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const res = await agent().post('/api/notes').send({ title: 'Goal Note', goal_id: g.id });
      assert.equal(res.status, 201);
      assert.equal(res.body.goal_id, g.id);
    });

    it('lists all notes', async () => {
      await agent().post('/api/notes').send({ title: 'Note 1' });
      await agent().post('/api/notes').send({ title: 'Note 2' });
      const res = await agent().get('/api/notes');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('filters notes by goal_id', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      await agent().post('/api/notes').send({ title: 'Goal note', goal_id: g.id });
      await agent().post('/api/notes').send({ title: 'Standalone' });
      const res = await agent().get('/api/notes?goal_id=' + g.id);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Goal note');
    });

    it('gets a single note', async () => {
      const { body: n } = await agent().post('/api/notes').send({ title: 'Single', content: 'body' });
      const res = await agent().get('/api/notes/' + n.id);
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Single');
    });

    it('updates a note', async () => {
      const { body: n } = await agent().post('/api/notes').send({ title: 'Original' });
      const res = await agent().put('/api/notes/' + n.id).send({ title: 'Updated', content: 'new content' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Updated');
    });

    it('deletes a note', async () => {
      const { body: n } = await agent().post('/api/notes').send({ title: 'Delete me' });
      const del = await agent().delete('/api/notes/' + n.id);
      assert.equal(del.status, 200);
      const list = await agent().get('/api/notes');
      assert.equal(list.body.length, 0);
    });

    it('returns 400 for empty title', async () => {
      const res = await agent().post('/api/notes').send({ title: '' });
      assert.equal(res.status, 400);
    });
  });

  describe('Weekly Review API', () => {
    it('gets current week review data', async () => {
      const res = await agent().get('/api/reviews/current');
      assert.equal(res.status, 200);
      assert.ok(res.body.weekStart);
      assert.ok(res.body.weekEnd);
      assert.ok(Array.isArray(res.body.completedTasks));
      assert.ok(Array.isArray(res.body.overdueTasks));
      assert.equal(typeof res.body.tasksCompletedCount, 'number');
      assert.equal(typeof res.body.tasksCreatedCount, 'number');
      assert.equal(typeof res.body.activeDays, 'number');
    });

    it('saves a weekly review', async () => {
      const current = await agent().get('/api/reviews/current');
      const res = await agent().post('/api/reviews').send({
        week_start: current.body.weekStart,
        top_accomplishments: ['Built feature X', 'Fixed bug Y'],
        reflection: 'Good week overall',
        next_week_priorities: ['Deploy', 'Write docs']
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.week_start, current.body.weekStart);
      assert.equal(res.body.reflection, 'Good week overall');
    });

    it('updates existing review for same week', async () => {
      const current = await agent().get('/api/reviews/current');
      await agent().post('/api/reviews').send({
        week_start: current.body.weekStart,
        reflection: 'First draft'
      });
      const res = await agent().post('/api/reviews').send({
        week_start: current.body.weekStart,
        reflection: 'Updated reflection'
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.reflection, 'Updated reflection');
      // Should still be just 1 review
      const list = await agent().get('/api/reviews');
      assert.equal(list.body.length, 1);
    });

    it('lists past reviews', async () => {
      const current = await agent().get('/api/reviews/current');
      await agent().post('/api/reviews').send({
        week_start: current.body.weekStart,
        reflection: 'Test review'
      });
      const res = await agent().get('/api/reviews');
      assert.equal(res.status, 200);
      assert.ok(res.body.length >= 1);
    });
  });
});
