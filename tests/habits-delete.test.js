const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHabit, logHabit, makeUser2, today } = require('./helpers');

describe('Habits Delete', () => {
  let db;
  before(() => { ({ db } = setup()); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('DELETE /api/habits/:id returns 200 and removes the habit', async () => {
    const hab = makeHabit({ name: 'Morning Run' });
    const res = await agent().delete('/api/habits/' + hab.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    // Verify habit is gone
    const list = await agent().get('/api/habits');
    assert.equal(list.body.length, 0);
  });

  it('habit_logs are cascade-deleted when habit is deleted', async () => {
    const hab = makeHabit({ name: 'Read Books' });
    logHabit(hab.id, today());
    logHabit(hab.id, '2026-01-01');
    // Verify logs exist before delete
    const logsBefore = db.prepare('SELECT * FROM habit_logs WHERE habit_id=?').all(hab.id);
    assert.equal(logsBefore.length, 2);
    // Delete the habit
    const res = await agent().delete('/api/habits/' + hab.id);
    assert.equal(res.status, 200);
    // Verify logs are cascade-deleted
    const logsAfter = db.prepare('SELECT * FROM habit_logs WHERE habit_id=?').all(hab.id);
    assert.equal(logsAfter.length, 0);
  });

  it('DELETE non-existent habit returns 404', async () => {
    const res = await agent().delete('/api/habits/999999');
    assert.equal(res.status, 404);
  });

  it('DELETE another user\'s habit returns 404 (IDOR protection)', async () => {
    // Create habit as default user (user 1)
    const hab = makeHabit({ name: 'Secret Habit', user_id: 1 });
    // Create second user and try to delete user 1's habit
    const { agent: agent2 } = makeUser2();
    const res = await agent2.delete('/api/habits/' + hab.id);
    // Backend uses WHERE user_id=req.userId so it returns 404 (not found for that user)
    assert.equal(res.status, 404);
    // Verify habit still exists for user 1
    const check = db.prepare('SELECT * FROM habits WHERE id=?').get(hab.id);
    assert.ok(check, 'Habit should still exist after IDOR attempt');
  });
});
