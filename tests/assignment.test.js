const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Multi-User Task Assignment', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('assigns a task to another user', async () => {
    // Create a second user
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('Test1234!@#$', 4);
    db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, display_name) VALUES (?,?,?,?)')
      .run(2, 'user2@test.com', hash, 'User Two');

    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Assignable' });

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: 2 });
    assert.equal(res.status, 200);
  });

  it('rejects assignment to non-existent user', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'No One' });

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: 99999 });
    assert.equal(res.status, 400);
  });

  it('unassigns a task by setting assigned_to_user_id to null', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Unassign Me' });

    const res = await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ assigned_to_user_id: null });
    assert.equal(res.status, 200);
  });

  it('GET /api/users lists instance users (id, display_name)', async () => {
    const res = await agent().get('/api/users').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    // Should not expose password_hash, email, or created_at
    assert.equal(res.body[0].password_hash, undefined);
    assert.equal(res.body[0].email, undefined);
    assert.equal(res.body[0].created_at, undefined, 'Should not expose created_at');
    // Should have id and display_name
    assert.ok(res.body[0].id !== undefined);
    assert.ok('display_name' in res.body[0]);
  });

  it('assigned task still only editable by owner (assignee cannot modify)', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('Test1234!@#$', 4);
    db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, display_name) VALUES (?,?,?,?)')
      .run(2, 'user2@test.com', hash, 'User Two');

    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Owner Only' });

    // Assign to user2
    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: 2 });

    // Create session for user2
    const crypto = require('crypto');
    const sid2 = 'user2-sess-' + crypto.randomUUID();
    db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '+1 day'))").run(sid2, 2);

    // User2 should NOT be able to modify the task (it belongs to user1)
    const { app } = require('./helpers').setup();
    const request = require('supertest');
    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .set('Cookie', `lf_sid=${sid2}`)
      .send({ title: 'Hacked Title' });
    assert.equal(res.status, 404, 'Assignee should not be able to modify owner task');
  });

  it('assigned task not visible in assignee task list', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('Test1234!@#$', 4);
    db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, display_name) VALUES (?,?,?,?)')
      .run(2, 'user2@test.com', hash, 'User Two');

    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Not Yours' });
    await agent().put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: 2 });

    // Create session for user2
    const crypto = require('crypto');
    const sid2 = 'user2-sess2-' + crypto.randomUUID();
    db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '+1 day'))").run(sid2, 2);

    const { app } = require('./helpers').setup();
    const request = require('supertest');
    const res = await request(app)
      .get('/api/tasks/all')
      .set('Cookie', `lf_sid=${sid2}`);
    assert.equal(res.status, 200);
    const allTasks = Array.isArray(res.body) ? res.body : (res.body.tasks || []);
    const taskIds = allTasks.map(t => t.id);
    assert.ok(!taskIds.includes(task.id), 'Assignee should not see owner task in their task list');
  });
});
