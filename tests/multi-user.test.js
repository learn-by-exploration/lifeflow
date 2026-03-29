const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask } = require('./helpers');

const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const STYLES_PATH = path.join(__dirname, '..', 'public', 'styles.css');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
const css = fs.readFileSync(STYLES_PATH, 'utf8');

let db;

/* ================================================================
 *  Task 2.1 — User Picker in Task Detail Panel
 * ================================================================ */

describe('Task 2.1 — User picker UI', () => {
  it('app.js contains /api/users fetch call', () => {
    assert.ok(
      /\/api\/users/.test(appJs),
      'app.js should fetch /api/users for user picker'
    );
  });

  it('app.js contains assigned_to_user_id in task update', () => {
    assert.ok(
      /assigned_to_user_id/.test(appJs),
      'app.js should use assigned_to_user_id when updating tasks'
    );
  });

  it('app.js contains user picker dropdown or select markup', () => {
    // Should have either a select element or datalist for user picking
    assert.ok(
      /dp-asg-user|user-picker|assigned_to_user_id/.test(appJs),
      'app.js should have a user picker element'
    );
  });

  it('PUT /api/tasks/:id with assigned_to_user_id=valid → 200', async () => {
    const { db: testDb } = setup();
    db = testDb;
    cleanDb();

    const bcrypt = require('bcryptjs');
    const existing = db.prepare('SELECT id FROM users WHERE id = 2').get();
    if (!existing) {
      const hash = bcrypt.hashSync('testpassword', 4);
      db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
        'user2@test.com', hash, 'User Two'
      );
    }

    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.assigned_to_user_id, 2);
  });

  it('PUT /api/tasks/:id with assigned_to_user_id=nonexistent → 400', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: 99999 });
    assert.equal(res.status, 400);
  });

  it('task detail panel shows assigned user display name', () => {
    // app.js should reference display_name or assignee_name in the detail panel
    assert.ok(
      /assignee_name|display_name|assigned.*user/.test(appJs),
      'app.js should display assigned user name in detail panel'
    );
  });
});

/* ================================================================
 *  Task 2.2 — Assignment Indicators in Task Cards
 * ================================================================ */

describe('Task 2.2 — Assignment indicators', () => {
  it('tcHtml includes assignee badge when assigned_to_user_id is set', () => {
    assert.ok(
      /assigned_to_user_id|assignee_name/.test(appJs),
      'tcHtml should reference assigned_to_user_id for badge rendering'
    );
  });

  it('assignee badge shows user initials or name', () => {
    assert.ok(
      /assignee.*badge|initials|👤.*assignee_name/.test(appJs),
      'app.js should show assignee initials or name badge'
    );
  });

  it('tasks assigned to current user show "You" indicator', () => {
    assert.ok(
      /You|assigned.*me|currentUser/.test(appJs),
      'app.js should show "You" for self-assigned tasks'
    );
  });

  it('CSS contains assignee badge styles', () => {
    assert.ok(
      /assignee-badge|\.assignee|\.asg-badge/.test(css),
      'styles.css should have assignee badge styles'
    );
  });
});

/* ================================================================
 *  Task 2.3 — Assignment API Hardening
 * ================================================================ */

describe('Task 2.3 — Assignment API hardening', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  function createSecondUser() {
    const bcrypt = require('bcryptjs');
    const existing = db.prepare('SELECT id FROM users WHERE id = 2').get();
    if (!existing) {
      const hash = bcrypt.hashSync('testpassword', 4);
      db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
        'user2@test.com', hash, 'User Two'
      );
    }
    return 2;
  }

  it('assign task to valid user → 200, assigned_to_user_id set', async () => {
    const user2 = createSecondUser();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: user2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.assigned_to_user_id, user2);
  });

  it('assign task to nonexistent user → 400', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: 99999 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'should return error message');
  });

  it('assign task to user_id=0 → 400', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: 0 });
    assert.equal(res.status, 400);
  });

  it('unassign task (null) → 200, assigned_to_user_id cleared', async () => {
    const user2 = createSecondUser();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { assigned_to_user_id: user2 });

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.assigned_to_user_id, null);
  });

  it('enrichTask includes assignee_name when assigned_to_user_id set', async () => {
    const user2 = createSecondUser();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: user2 });

    const res = await agent().get(`/api/tasks/${task.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.assignee_name, 'User Two', 'enrichTask should include assignee_name');
  });

  it('GET /api/users excludes password_hash from response', async () => {
    const res = await agent().get('/api/users');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    for (const user of res.body) {
      assert.equal(user.password_hash, undefined, 'password_hash should not be exposed');
    }
  });

  it('GET /api/users requires authentication', async () => {
    const res = await rawAgent().get('/api/users');
    assert.equal(res.status, 401);
  });

  it('assign to user_id=-1 → 400', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: -1 });
    assert.equal(res.status, 400);
  });
});
