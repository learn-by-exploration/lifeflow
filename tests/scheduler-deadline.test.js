const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask } = require('./helpers');
const { buildDeadlinePayload, formatTaskList } = require('../src/scheduler');

let _db;
before(() => { const s = setup(); _db = s.db; });
beforeEach(() => cleanDb());
after(() => teardown());

describe('buildDeadlinePayload', () => {
  it('single task due today', () => {
    const p = buildDeadlinePayload([], [{ id: 1, title: 'Buy milk' }]);
    assert.equal(p.title, '📅 Task due today');
    assert.equal(p.body, 'Buy milk');
    assert.equal(p.tag, 'deadline-batch');
  });

  it('single overdue task', () => {
    const p = buildDeadlinePayload([{ id: 1, title: 'Submit report' }], []);
    assert.equal(p.title, '⚠️ 1 overdue task');
    assert.equal(p.body, 'Submit report');
  });

  it('multiple tasks due today', () => {
    const today = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }, { id: 3, title: 'C' }];
    const p = buildDeadlinePayload([], today);
    assert.equal(p.title, '📅 3 tasks due today');
    assert.equal(p.body, 'A, B and 1 more');
  });

  it('multiple overdue tasks', () => {
    const overdue = [{ id: 1, title: 'X' }, { id: 2, title: 'Y' }, { id: 3, title: 'Z' }, { id: 4, title: 'W' }];
    const p = buildDeadlinePayload(overdue, []);
    assert.equal(p.title, '⚠️ 4 overdue tasks');
    assert.equal(p.body, 'X, Y and 2 more');
  });

  it('mixed overdue and due today', () => {
    const overdue = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
    const today = [{ id: 3, title: 'C' }, { id: 4, title: 'D' }, { id: 5, title: 'E' }];
    const p = buildDeadlinePayload(overdue, today);
    assert.equal(p.title, '⏰ 5 tasks need attention');
    assert.equal(p.body, '2 overdue · 3 due today');
  });

  it('truncates long task title', () => {
    const longTitle = 'A'.repeat(200);
    const p = buildDeadlinePayload([], [{ id: 1, title: longTitle }]);
    assert.ok(p.body.length <= 120);
  });
});

describe('formatTaskList', () => {
  it('single task', () => {
    assert.equal(formatTaskList([{ title: 'Hello' }]), 'Hello');
  });

  it('two tasks', () => {
    assert.equal(formatTaskList([{ title: 'A' }, { title: 'B' }]), 'A, B');
  });

  it('three tasks', () => {
    assert.equal(formatTaskList([{ title: 'A' }, { title: 'B' }, { title: 'C' }]), 'A, B and 1 more');
  });

  it('five tasks', () => {
    const tasks = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, { title: 'E' }];
    assert.equal(formatTaskList(tasks), 'A, B and 3 more');
  });

  it('truncates long titles to 50 chars', () => {
    const longTitle = 'X'.repeat(60);
    const result = formatTaskList([{ title: longTitle }]);
    assert.equal(result.length, 50);
    assert.ok(result.endsWith('...'));
  });
});

describe('deadline-notifications scheduler job', () => {
  it('is registered as a builtin job', () => {
    const createScheduler = require('../src/scheduler');
    const logger = { error: () => {}, info: () => {} };
    const scheduler = createScheduler(_db, logger);
    scheduler.registerBuiltinJobs();
    // The job is registered but won't fire since pushService.isEnabled() is false
    scheduler.start();
    scheduler.stop();
    // No assertion needed — just verify it doesn't throw
  });

  it('does not send when push is not enabled', async () => {
    // Insert a user with a push subscription and an overdue task
    const area = makeArea();
    const goal = makeGoal(area.id);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    makeTask(goal.id, { title: 'Overdue task', status: 'todo', due_date: yesterday.toISOString().slice(0, 10) });
    _db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (1, 'https://example.com/push', 'key1', 'auth1')").run();

    const createScheduler = require('../src/scheduler');
    const logger = { error: () => {}, info: () => {} };
    const scheduler = createScheduler(_db, logger);
    scheduler.registerBuiltinJobs();
    scheduler.start();
    await new Promise(r => setTimeout(r, 100));
    scheduler.stop();

    // No push_notification_log entries should exist (push not enabled)
    const logs = _db.prepare("SELECT * FROM push_notification_log WHERE type='deadline'").all();
    assert.equal(logs.length, 0);
  });

  it('excludes completed tasks from deadline queries', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    makeTask(goal.id, { title: 'Done task', status: 'done', due_date: yesterday.toISOString().slice(0, 10) });

    // Verify the query logic — done tasks should not appear
    const tasks = _db.prepare(`
      SELECT t.id FROM tasks t
      WHERE t.status != 'done'
        AND t.due_date IS NOT NULL
        AND t.due_date <= date('now')
        AND t.user_id = 1
    `).all();
    assert.equal(tasks.length, 0);
  });

  it('excludes tasks without due_date', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'No date task', status: 'todo' });

    const tasks = _db.prepare(`
      SELECT t.id FROM tasks t
      WHERE t.status != 'done'
        AND t.due_date IS NOT NULL
        AND t.due_date <= date('now')
        AND t.user_id = 1
    `).all();
    assert.equal(tasks.length, 0);
  });

  it('dedup query excludes recently notified tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const task = makeTask(goal.id, { title: 'Overdue', status: 'todo', due_date: yesterday.toISOString().slice(0, 10) });

    // Simulate a recent notification
    _db.prepare("INSERT INTO push_notification_log (user_id, task_id, type) VALUES (1, ?, 'deadline')").run(task.id);

    const tasks = _db.prepare(`
      SELECT t.id FROM tasks t
      WHERE t.status != 'done'
        AND t.due_date IS NOT NULL
        AND t.due_date <= date('now')
        AND t.user_id = 1
        AND NOT EXISTS (
          SELECT 1 FROM push_notification_log pnl
          WHERE pnl.task_id = t.id
            AND pnl.user_id = 1
            AND pnl.type = 'deadline'
            AND pnl.sent_at > datetime('now', '-24 hours')
        )
    `).all();
    assert.equal(tasks.length, 0);
  });

  it('includes tasks notified more than 24h ago', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const task = makeTask(goal.id, { title: 'Old overdue', status: 'todo', due_date: yesterday.toISOString().slice(0, 10) });

    // Simulate a notification sent 25 hours ago
    _db.prepare("INSERT INTO push_notification_log (user_id, task_id, type, sent_at) VALUES (1, ?, 'deadline', datetime('now', '-25 hours'))").run(task.id);

    const tasks = _db.prepare(`
      SELECT t.id FROM tasks t
      WHERE t.status != 'done'
        AND t.due_date IS NOT NULL
        AND t.due_date <= date('now')
        AND t.user_id = 1
        AND NOT EXISTS (
          SELECT 1 FROM push_notification_log pnl
          WHERE pnl.task_id = t.id
            AND pnl.user_id = 1
            AND pnl.type = 'deadline'
            AND pnl.sent_at > datetime('now', '-24 hours')
        )
    `).all();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, task.id);
  });
});
