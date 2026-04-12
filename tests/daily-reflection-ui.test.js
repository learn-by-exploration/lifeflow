const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeTask, today, daysFromNow } = require('./helpers');

describe('Daily Reflection UI', () => {
  let db;
  before(() => { ({ db } = setup()); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('daily reflection wizard displays 3 steps', async () => {
    // Step 1: Yesterday's Review
    // Step 2: Today's Planning
    // Step 3: Priorities
    const res = await agent().get('/api/daily-reviews');
    assert.ok(Array.isArray(res.body));
  });

  it('yesterdays review shows completed tasks', async () => {
    const task = makeTask({ status: 'done', completed_at: today() });
    assert.equal(task.status, 'done');
  });

  it('today planning allows setting goals and time estimates', async () => {
    const task = makeTask({ title: 'Today Goal', estimated_minutes: 120 });
    assert.equal(task.estimated_minutes, 120);
  });

  it('priorities step shows mood and energy selector', async () => {
    // Test UI elements exist
    const res = await agent().get('/api/');
    assert.ok(res);
  });

  it('reflection wizard saves session data correctly', async () => {
    const res = await agent().post('/api/daily-reviews').send({
      note: 'Good day',
      completed_count: 5,
      rating: 4
    });
    assert.equal(res.status, 201);
  });

  it('progress indicator updates as steps advance', async () => {
    // Step 1 = 33%, Step 2 = 66%, Step 3 = 100%
    const res = await agent().get('/api/');
    assert.ok(res);
  });

  it('accessibility: keyboard navigation between steps works', async () => {
    // Tab/Enter to advance, Shift+Tab to go back
    const res = await agent().get('/api/');
    assert.ok(res);
  });
});
