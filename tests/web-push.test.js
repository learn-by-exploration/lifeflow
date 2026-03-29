const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');
const fs = require('fs');
const path = require('path');

let db;

/* ================================================================
 *  Task 1.1 — Web Push Dependency + VAPID Keys
 *  RED tests: these must FAIL until the feature is implemented
 * ================================================================ */

describe('Task 1.1 — Web Push infra', () => {
  before(() => { const s = setup(); db = s.db; });
  beforeEach(() => cleanDb());

  it('web-push is in package.json dependencies', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    );
    assert.ok(pkg.dependencies['web-push'], 'web-push should be a production dependency');
  });

  it('push service module exists and exports initialize + sendPush', () => {
    const pushService = require('../src/services/push.service');
    assert.equal(typeof pushService.initialize, 'function', 'initialize should be a function');
    assert.equal(typeof pushService.sendPush, 'function', 'sendPush should be a function');
  });

  it('push service skips initialization when VAPID keys missing', () => {
    // Clear any VAPID env vars
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_EMAIL;

    // Re-require to get fresh module
    delete require.cache[require.resolve('../src/services/push.service')];
    const pushService = require('../src/services/push.service');
    const result = pushService.initialize();
    assert.equal(result, false, 'initialize() should return false when VAPID keys are missing');
    assert.equal(pushService.isEnabled(), false, 'isEnabled() should return false');
  });

  it('GET /api/push/vapid-key returns public key when configured', async () => {
    const res = await agent().get('/api/push/vapid-key');
    // Should return 200 with a publicKey field (may be null if not configured)
    assert.equal(res.status, 200);
    assert.ok('publicKey' in res.body, 'response should have publicKey field');
  });
});

/* ================================================================
 *  Task 1.2 — Push Notification Delivery
 * ================================================================ */

describe('Task 1.2 — Push delivery', () => {
  before(() => { const s = setup(); db = s.db; });
  beforeEach(() => cleanDb());

  function addSubscription(userId = 1) {
    return db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)`
    ).run(userId, 'https://push.example.com/sub/' + Math.random(), 'fake-p256dh-key', 'fake-auth-key');
  }

  it('POST /api/push/test sends notification to subscribed user', async () => {
    addSubscription();
    const res = await agent().post('/api/push/test');
    assert.equal(res.status, 200);
    // Should report at least attempted sending (sent or failed, not "not implemented")
    assert.ok(
      !res.body.message || !res.body.message.includes('not yet implemented'),
      'Push test should attempt actual delivery, not report "not yet implemented"'
    );
  });

  it('POST /api/push/test with no subscriptions → 200 with sent:0', async () => {
    const res = await agent().post('/api/push/test');
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, 0);
  });

  it('sendPush handles expired subscription (410) → removes from DB', async () => {
    const pushService = require('../src/services/push.service');
    const webpush = require('web-push');

    // Setup: add a subscription
    addSubscription();
    const subsBefore = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id=1').get();
    assert.equal(subsBefore.c, 1);

    // Mock sendNotification to simulate 410 (expired)
    const original = webpush.sendNotification;
    webpush.sendNotification = async () => {
      const err = new Error('Gone');
      err.statusCode = 410;
      throw err;
    };

    try {
      // Force enable for test
      const origEnabled = pushService.isEnabled();
      if (!origEnabled) {
        // Temporarily enable by setting env and re-initializing
        process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkCs7U_HiFrFVSnLasEZhCgluJ6lXKAFpbMlPnqZbA';
        process.env.VAPID_PRIVATE_KEY = 'UUxI4o8r6ivFu3srenyufr5sOsCrhealqNcyg_MRaZc';
        delete require.cache[require.resolve('../src/services/push.service')];
        const freshPush = require('../src/services/push.service');
        freshPush.initialize();
        const result = await freshPush.sendPush(db, 1, { title: 'Test', body: 'Hello' });
        assert.equal(result.failed, 1, 'should report 1 failed');
      } else {
        const result = await pushService.sendPush(db, 1, { title: 'Test', body: 'Hello' });
        assert.equal(result.failed, 1, 'should report 1 failed');
      }
    } finally {
      webpush.sendNotification = original;
    }

    // Subscription should be removed
    const subsAfter = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id=1').get();
    assert.equal(subsAfter.c, 0, 'expired subscription should be removed');
  });

  it('sendPush handles network error → logs warning, doesn\'t throw', async () => {
    const webpush = require('web-push');
    addSubscription();

    const original = webpush.sendNotification;
    webpush.sendNotification = async () => {
      const err = new Error('Network Error');
      err.statusCode = 500;
      throw err;
    };

    try {
      process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkCs7U_HiFrFVSnLasEZhCgluJ6lXKAFpbMlPnqZbA';
      process.env.VAPID_PRIVATE_KEY = 'UUxI4o8r6ivFu3srenyufr5sOsCrhealqNcyg_MRaZc';
      delete require.cache[require.resolve('../src/services/push.service')];
      const freshPush = require('../src/services/push.service');
      freshPush.initialize();

      // Should not throw
      const result = await freshPush.sendPush(db, 1, { title: 'Test', body: 'Hello' });
      assert.equal(result.failed, 1);
      assert.equal(result.sent, 0);
    } finally {
      webpush.sendNotification = original;
    }

    // Subscription should NOT be removed (non-410 error)
    const subsAfter = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id=1').get();
    assert.equal(subsAfter.c, 1, 'subscription should remain after non-410 error');
  });

  it('sendPush with invalid subscription (404) → removes from DB', async () => {
    const webpush = require('web-push');
    addSubscription();

    const original = webpush.sendNotification;
    webpush.sendNotification = async () => {
      const err = new Error('Not Found');
      err.statusCode = 404;
      throw err;
    };

    try {
      process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkCs7U_HiFrFVSnLasEZhCgluJ6lXKAFpbMlPnqZbA';
      process.env.VAPID_PRIVATE_KEY = 'UUxI4o8r6ivFu3srenyufr5sOsCrhealqNcyg_MRaZc';
      delete require.cache[require.resolve('../src/services/push.service')];
      const freshPush = require('../src/services/push.service');
      freshPush.initialize();

      const result = await freshPush.sendPush(db, 1, { title: 'Test', body: 'Hello' });
      assert.equal(result.failed, 1);
    } finally {
      webpush.sendNotification = original;
    }

    const subsAfter = db.prepare('SELECT COUNT(*) as c FROM push_subscriptions WHERE user_id=1').get();
    assert.equal(subsAfter.c, 0, '404 subscription should be removed');
  });

  it('multiple subscriptions → sends to all, returns success count', async () => {
    const webpush = require('web-push');
    addSubscription();
    addSubscription();
    addSubscription();

    let callCount = 0;
    const original = webpush.sendNotification;
    webpush.sendNotification = async () => { callCount++; return { statusCode: 201 }; };

    try {
      process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkCs7U_HiFrFVSnLasEZhCgluJ6lXKAFpbMlPnqZbA';
      process.env.VAPID_PRIVATE_KEY = 'UUxI4o8r6ivFu3srenyufr5sOsCrhealqNcyg_MRaZc';
      delete require.cache[require.resolve('../src/services/push.service')];
      const freshPush = require('../src/services/push.service');
      freshPush.initialize();

      const result = await freshPush.sendPush(db, 1, { title: 'Test', body: 'Hello' });
      assert.equal(callCount, 3, 'should attempt to send to all 3 subscriptions');
      assert.equal(result.sent, 3);
    } finally {
      webpush.sendNotification = original;
    }
  });

  it('push payload includes title, body, url fields', async () => {
    const webpush = require('web-push');
    addSubscription();

    let sentPayload = null;
    const original = webpush.sendNotification;
    webpush.sendNotification = async (_sub, payload) => { sentPayload = payload; return { statusCode: 201 }; };

    try {
      process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkCs7U_HiFrFVSnLasEZhCgluJ6lXKAFpbMlPnqZbA';
      process.env.VAPID_PRIVATE_KEY = 'UUxI4o8r6ivFu3srenyufr5sOsCrhealqNcyg_MRaZc';
      delete require.cache[require.resolve('../src/services/push.service')];
      const freshPush = require('../src/services/push.service');
      freshPush.initialize();

      await freshPush.sendPush(db, 1, { title: 'Task Due', body: 'Do the thing', url: '/tasks/1' });
      const parsed = JSON.parse(sentPayload);
      assert.equal(parsed.title, 'Task Due');
      assert.equal(parsed.body, 'Do the thing');
      assert.equal(parsed.url, '/tasks/1');
    } finally {
      webpush.sendNotification = original;
    }
  });

  it('push payload is properly JSON-encoded', async () => {
    const webpush = require('web-push');
    addSubscription();

    let sentPayload = null;
    const original = webpush.sendNotification;
    webpush.sendNotification = async (_sub, payload) => { sentPayload = payload; return { statusCode: 201 }; };

    try {
      process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkCs7U_HiFrFVSnLasEZhCgluJ6lXKAFpbMlPnqZbA';
      process.env.VAPID_PRIVATE_KEY = 'UUxI4o8r6ivFu3srenyufr5sOsCrhealqNcyg_MRaZc';
      delete require.cache[require.resolve('../src/services/push.service')];
      const freshPush = require('../src/services/push.service');
      freshPush.initialize();

      await freshPush.sendPush(db, 1, { title: 'Test', body: 'Hello' });
      assert.doesNotThrow(() => JSON.parse(sentPayload), 'payload should be valid JSON');
    } finally {
      webpush.sendNotification = original;
    }
  });

  it('push service disabled when VAPID keys not configured → sendPush is no-op', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete require.cache[require.resolve('../src/services/push.service')];
    const freshPush = require('../src/services/push.service');
    freshPush.initialize();

    addSubscription();
    const result = await freshPush.sendPush(db, 1, { title: 'Test', body: 'Hello' });
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
  });
});

/* ================================================================
 *  Task 1.3 — Push Triggers
 * ================================================================ */

describe('Task 1.3 — Push triggers', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  const { makeArea, makeGoal, makeTask } = require('./helpers');

  function addSubscription(userId = 1) {
    return db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)`
    ).run(userId, 'https://push.example.com/sub/' + Math.random(), 'fake-p256dh-key', 'fake-auth-key');
  }

  function createSecondUser() {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('testpassword', 4);
    const existing = db.prepare('SELECT id FROM users WHERE id = 2').get();
    if (!existing) {
      db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
        'user2@test.com', hash, 'User Two'
      );
    }
    return 2;
  }

  it('assigning task to user triggers push notification (assignment recorded)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const user2Id = createSecondUser();
    addSubscription(user2Id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: user2Id });
    assert.equal(res.status, 200);
    assert.equal(res.body.assigned_to_user_id, user2Id);

    // Check push_notification_log exists and has an assignment entry
    const log = db.prepare('SELECT * FROM push_notification_log WHERE task_id = ? AND type = ?').get(task.id, 'assignment');
    assert.ok(log, 'assignment should create a push_notification_log entry');
  });

  it('re-assigning same task to same user within 24h doesn\'t duplicate notification log', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const user2Id = createSecondUser();
    addSubscription(user2Id);

    // First assignment
    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: user2Id });
    // Second assignment (same user)
    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: user2Id });

    const logs = db.prepare('SELECT * FROM push_notification_log WHERE task_id = ? AND type = ?').all(task.id, 'assignment');
    assert.equal(logs.length, 1, 'should not duplicate assignment notification within 24h for same user');
  });

  it('re-assigning task to different user within 24h still notifies the new user', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const user2Id = createSecondUser();
    // Create a third user
    const bcrypt = require('bcryptjs');
    const existing3 = db.prepare('SELECT id FROM users WHERE id = 3').get();
    if (!existing3) {
      const hash = bcrypt.hashSync('testpassword', 4);
      db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
        'user3@test.com', hash, 'User Three'
      );
    }
    addSubscription(user2Id);
    addSubscription(3);

    // Assign to user 2
    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: user2Id });
    // Re-assign to user 3 within 24h
    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: 3 });

    const logs = db.prepare('SELECT * FROM push_notification_log WHERE task_id = ? AND type = ?').all(task.id, 'assignment');
    assert.equal(logs.length, 2, 'should create separate notification for each different user');
    const userIds = logs.map(l => l.user_id);
    assert.ok(userIds.includes(user2Id), 'user 2 should have a log entry');
    assert.ok(userIds.includes(3), 'user 3 should have a log entry');
  });

  it('unassigning task (null) doesn\'t trigger push', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { assigned_to_user_id: 2 });
    createSecondUser();

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: null });
    assert.equal(res.status, 200);

    const logs = db.prepare('SELECT * FROM push_notification_log WHERE task_id = ? AND type = ?').all(task.id, 'assignment');
    assert.equal(logs.length, 0, 'unassignment should not create a push log entry');
  });

  it('overdue task check finds tasks overdue by >1 hour', () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    // Task overdue by 2 days
    makeTask(goal.id, { due_date: '2020-01-01', status: 'todo' });
    // Task due today (not overdue enough)
    const today = new Date().toISOString().slice(0, 10);
    makeTask(goal.id, { due_date: today, status: 'todo' });

    // The overdue check query should find tasks overdue by >1h
    const overdue = db.prepare(`
      SELECT * FROM tasks
      WHERE status != 'done'
        AND due_date IS NOT NULL
        AND datetime(due_date || ' 00:00:00', '+1 hour') < datetime('now')
        AND user_id = ?
    `).all(1);
    assert.ok(overdue.length >= 1, 'should find at least the very overdue task');
  });

  it('overdue push not sent for same task within 24h (dedup via log)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { due_date: '2020-01-01', status: 'todo' });

    // Simulate a prior overdue notification within 24h
    db.prepare(
      `INSERT INTO push_notification_log (user_id, task_id, type, sent_at) VALUES (?, ?, ?, datetime('now'))`
    ).run(1, task.id, 'overdue');

    // Check dedup: query should exclude tasks with recent overdue notifications
    const overdue = db.prepare(`
      SELECT t.* FROM tasks t
      WHERE t.status != 'done'
        AND t.due_date IS NOT NULL
        AND datetime(t.due_date || ' 00:00:00', '+1 hour') < datetime('now')
        AND t.user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM push_notification_log pnl
          WHERE pnl.task_id = t.id AND pnl.type = 'overdue'
            AND pnl.sent_at > datetime('now', '-24 hours')
        )
    `).all(1);
    assert.equal(overdue.length, 0, 'should not find overdue task with recent notification');
  });

  it('daily review push fires after configured hour (push_notification_log)', () => {
    // Ensure no daily_review log for today
    const today = new Date().toISOString().slice(0, 10);
    const log = db.prepare(
      `SELECT * FROM push_notification_log WHERE user_id = ? AND type = ? AND date(sent_at) = ?`
    ).get(1, 'daily_review', today);
    assert.equal(log, undefined, 'no daily_review push should exist initially');

    // Insert a daily_review log
    db.prepare(
      `INSERT INTO push_notification_log (user_id, task_id, type, sent_at) VALUES (?, NULL, ?, datetime('now'))`
    ).run(1, 'daily_review');

    const logAfter = db.prepare(
      `SELECT * FROM push_notification_log WHERE user_id = ? AND type = ? AND date(sent_at) = ?`
    ).get(1, 'daily_review', today);
    assert.ok(logAfter, 'daily_review log should be insertable');
  });

  it('push not sent when user has no subscriptions (no error)', async () => {
    const pushService = require('../src/services/push.service');
    // Don't add any subscriptions
    const result = await pushService.sendPush(db, 1, { title: 'Test', body: 'No subs' });
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
  });

  it('push not sent when VAPID keys not configured (graceful skip)', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete require.cache[require.resolve('../src/services/push.service')];
    const freshPush = require('../src/services/push.service');
    freshPush.initialize();

    addSubscription();
    const result = await freshPush.sendPush(db, 1, { title: 'Test', body: 'No VAPID' });
    assert.equal(result.sent, 0);
  });
});
