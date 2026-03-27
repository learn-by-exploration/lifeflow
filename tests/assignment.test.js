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
    // Should not expose password_hash or email
    assert.equal(res.body[0].password_hash, undefined);
  });
});
