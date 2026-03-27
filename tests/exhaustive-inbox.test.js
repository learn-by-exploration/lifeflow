const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, agent, today } = require('./helpers');

function makeInbox(overrides = {}) {
  const { db } = setup();
  const o = { title: 'Inbox Item', note: '', priority: 0, ...overrides };
  const r = db.prepare('INSERT INTO inbox (title, note, priority, created_at) VALUES (?,?,?,?)').run(
    o.title, o.note, o.priority, o.created_at || new Date().toISOString()
  );
  return db.prepare('SELECT * FROM inbox WHERE id=?').get(r.lastInsertRowid);
}

describe('Inbox API – exhaustive coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── GET /api/inbox ──────────────────────────────────────────────

  it('returns empty array when no items', async () => {
    const res = await agent().get('/api/inbox');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns items in reverse chronological order (newest first)', async () => {
    makeInbox({ title: 'Old', created_at: '2025-01-01T00:00:00Z' });
    makeInbox({ title: 'Mid', created_at: '2025-06-01T00:00:00Z' });
    makeInbox({ title: 'New', created_at: '2025-12-01T00:00:00Z' });
    const res = await agent().get('/api/inbox');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3);
    assert.equal(res.body[0].title, 'New');
    assert.equal(res.body[1].title, 'Mid');
    assert.equal(res.body[2].title, 'Old');
  });

  // ── POST /api/inbox ─────────────────────────────────────────────

  it('returns 400 for whitespace-only title', async () => {
    const res = await agent().post('/api/inbox').send({ title: '   ' });
    assert.equal(res.status, 400);
  });

  it('creates item with note and priority (all fields)', async () => {
    const res = await agent().post('/api/inbox').send({ title: 'Full item', note: 'details here', priority: 2 });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Full item');
    assert.equal(res.body.note, 'details here');
    assert.equal(res.body.priority, 2);
  });

  it('trims title whitespace', async () => {
    const res = await agent().post('/api/inbox').send({ title: '  padded title  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'padded title');
  });

  // ── PUT /api/inbox/:id ──────────────────────────────────────────

  it('returns 400 for invalid (non-numeric) ID', async () => {
    const res = await agent().put('/api/inbox/abc').send({ title: 'nope' });
    assert.equal(res.status, 400);
  });

  it('returns 404 for nonexistent ID', async () => {
    const res = await agent().put('/api/inbox/99999').send({ title: 'ghost' });
    assert.equal(res.status, 404);
  });

  it('partial update – only title', async () => {
    const { body: item } = await agent().post('/api/inbox').send({ title: 'Original', note: 'keep me', priority: 1 });
    const res = await agent().put('/api/inbox/' + item.id).send({ title: 'Changed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Changed');
    assert.equal(res.body.note, 'keep me');
    assert.equal(res.body.priority, 1);
  });

  it('partial update – only priority', async () => {
    const { body: item } = await agent().post('/api/inbox').send({ title: 'Keep title', note: 'keep note', priority: 0 });
    const res = await agent().put('/api/inbox/' + item.id).send({ priority: 3 });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Keep title');
    assert.equal(res.body.note, 'keep note');
    assert.equal(res.body.priority, 3);
  });

  it('partial update – only note', async () => {
    const { body: item } = await agent().post('/api/inbox').send({ title: 'Keep title', note: 'old note', priority: 2 });
    const res = await agent().put('/api/inbox/' + item.id).send({ note: 'new note' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Keep title');
    assert.equal(res.body.note, 'new note');
    assert.equal(res.body.priority, 2);
  });

  // ── DELETE /api/inbox/:id ───────────────────────────────────────

  it('deleting nonexistent ID returns 404', async () => {
    const res = await agent().delete('/api/inbox/99999');
    assert.equal(res.status, 404);
  });

  // ── POST /api/inbox/:id/triage ──────────────────────────────────

  it('returns 404 for nonexistent inbox item', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const res = await agent().post('/api/inbox/99999/triage').send({ goal_id: g.id });
    assert.equal(res.status, 404);
  });

  it('returns 400 for invalid goal_id', async () => {
    const { body: item } = await agent().post('/api/inbox').send({ title: 'Bad goal' });
    const res = await agent().post('/api/inbox/' + item.id + '/triage').send({ goal_id: 'xyz' });
    assert.equal(res.status, 400);
  });

  it('preserves inbox item note in created task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { body: item } = await agent().post('/api/inbox').send({ title: 'With note', note: 'important detail' });
    const res = await agent().post('/api/inbox/' + item.id + '/triage').send({ goal_id: g.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.note, 'important detail');
  });

  it('preserves inbox item priority when not overridden', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { body: item } = await agent().post('/api/inbox').send({ title: 'High prio', priority: 2 });
    const res = await agent().post('/api/inbox/' + item.id + '/triage').send({ goal_id: g.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.priority, 2);
  });

  it('allows overriding priority during triage', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { body: item } = await agent().post('/api/inbox').send({ title: 'Override prio', priority: 1 });
    const res = await agent().post('/api/inbox/' + item.id + '/triage').send({ goal_id: g.id, priority: 3 });
    assert.equal(res.status, 201);
    assert.equal(res.body.priority, 3);
  });

  it('removes item from inbox after triage', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { body: item } = await agent().post('/api/inbox').send({ title: 'Gone after triage' });
    await agent().post('/api/inbox/' + item.id + '/triage').send({ goal_id: g.id });
    const inbox = await agent().get('/api/inbox');
    assert.equal(inbox.body.length, 0);
  });
});
