const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

let _db;
before(() => { const s = setup(); _db = s.db; });
beforeEach(() => cleanDb());
after(() => teardown());

describe('Scheduler', () => {
  it('runs registered job immediately on start', async () => {
    const createScheduler = require('../src/scheduler');
    const logger = { error: () => {}, info: () => {} };
    const scheduler = createScheduler(_db, logger);
    let ran = false;
    scheduler.register('test-job', 60000, async () => { ran = true; });
    scheduler.start();
    // Give the immediate invocation time to resolve
    await new Promise(r => setTimeout(r, 50));
    scheduler.stop();
    assert.equal(ran, true);
  });

  it('handles job failure gracefully (other jobs continue)', async () => {
    const createScheduler = require('../src/scheduler');
    const errors = [];
    const logger = { error: (ctx) => errors.push(ctx), info: () => {} };
    const scheduler = createScheduler(_db, logger);
    let goodRan = false;
    scheduler.register('failing-job', 60000, async () => { throw new Error('boom'); });
    scheduler.register('good-job', 60000, async () => { goodRan = true; });
    scheduler.start();
    await new Promise(r => setTimeout(r, 50));
    scheduler.stop();
    assert.equal(goodRan, true);
    assert.ok(errors.length >= 1);
  });

  it('stop clears all intervals', async () => {
    const createScheduler = require('../src/scheduler');
    const logger = { error: () => {}, info: () => {} };
    const scheduler = createScheduler(_db, logger);
    let count = 0;
    scheduler.register('counter', 50, async () => { count++; });
    scheduler.start();
    await new Promise(r => setTimeout(r, 30));
    scheduler.stop();
    const countAfterStop = count;
    await new Promise(r => setTimeout(r, 100));
    assert.equal(count, countAfterStop, 'Job should not run after stop');
  });

  it('stale session cleanup deletes expired sessions', async () => {
    // Insert an expired session
    _db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 0, datetime('now','-1 hour'))").run('expired-sess-1');
    _db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 0, datetime('now','+1 day'))").run('valid-sess-1');

    const createScheduler = require('../src/scheduler');
    const logger = { error: () => {}, info: () => {} };
    const scheduler = createScheduler(_db, logger);
    scheduler.registerBuiltinJobs();
    scheduler.start();
    await new Promise(r => setTimeout(r, 50));
    scheduler.stop();

    const expired = _db.prepare("SELECT * FROM sessions WHERE sid='expired-sess-1'").get();
    const valid = _db.prepare("SELECT * FROM sessions WHERE sid='valid-sess-1'").get();
    assert.equal(expired, undefined, 'Expired session should be deleted');
    assert.ok(valid, 'Valid session should remain');
  });

  it('midnight recurring spawn creates missing recurring tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    // Create a daily recurring task that is done and due yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    makeTask(goal.id, {
      title: 'Daily Standup',
      status: 'done',
      due_date: yStr,
      recurring: JSON.stringify({ type: 'daily' })
    });

    const createScheduler = require('../src/scheduler');
    const logger = { error: () => {}, info: () => {} };
    const scheduler = createScheduler(_db, logger);
    scheduler.registerBuiltinJobs();
    scheduler.start();
    await new Promise(r => setTimeout(r, 100));
    scheduler.stop();

    // Check that a new task was spawned
    const spawned = _db.prepare("SELECT * FROM tasks WHERE title='Daily Standup' AND status='todo'").all();
    assert.ok(spawned.length >= 1, 'Should have spawned a new recurring task');
  });
});
