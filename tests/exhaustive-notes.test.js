const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, agent } = require('./helpers');

function makeNote(overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Note', content: '', goal_id: null, ...overrides };
  const r = db.prepare('INSERT INTO notes (title, content, goal_id, created_at, updated_at) VALUES (?,?,?,?,?)').run(
    o.title, o.content, o.goal_id,
    o.created_at || new Date().toISOString(),
    o.updated_at || new Date().toISOString()
  );
  return db.prepare('SELECT * FROM notes WHERE id=?').get(r.lastInsertRowid);
}

describe('Notes API – exhaustive coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── GET /api/notes ──────────────────────────────────────────────

  it('returns empty array when no notes', async () => {
    const res = await agent().get('/api/notes');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('ordered by updated_at DESC', async () => {
    makeNote({ title: 'Old', updated_at: '2025-01-01T00:00:00Z' });
    makeNote({ title: 'Mid', updated_at: '2025-06-01T00:00:00Z' });
    makeNote({ title: 'New', updated_at: '2025-12-01T00:00:00Z' });
    const res = await agent().get('/api/notes');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3);
    assert.equal(res.body[0].title, 'New');
    assert.equal(res.body[1].title, 'Mid');
    assert.equal(res.body[2].title, 'Old');
  });

  it('returns empty for nonexistent goal_id filter', async () => {
    makeNote({ title: 'Unrelated' });
    const res = await agent().get('/api/notes?goal_id=999');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  // ── GET /api/notes/:id ─────────────────────────────────────────

  it('returns 404 for nonexistent note', async () => {
    const res = await agent().get('/api/notes/99999');
    assert.equal(res.status, 404);
  });

  // ── POST /api/notes ────────────────────────────────────────────

  it('whitespace-only title returns 400', async () => {
    const res = await agent().post('/api/notes').send({ title: '   ' });
    assert.equal(res.status, 400);
  });

  it('trims title', async () => {
    const res = await agent().post('/api/notes').send({ title: '  Trimmed  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Trimmed');
  });

  it('content defaults to empty string when omitted', async () => {
    const res = await agent().post('/api/notes').send({ title: 'No content' });
    assert.equal(res.status, 201);
    assert.equal(res.body.content, '');
  });

  it('goal_id defaults to null when omitted', async () => {
    const res = await agent().post('/api/notes').send({ title: 'No goal' });
    assert.equal(res.status, 201);
    assert.equal(res.body.goal_id, null);
  });

  it('creates with all fields (title, content, goal_id)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post('/api/notes').send({
      title: 'Full Note',
      content: 'Some content here',
      goal_id: goal.id
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Full Note');
    assert.equal(res.body.content, 'Some content here');
    assert.equal(res.body.goal_id, goal.id);
  });

  // ── PUT /api/notes/:id ─────────────────────────────────────────

  it('updates title only', async () => {
    const n = makeNote({ title: 'Original', content: 'Keep this' });
    const res = await agent().put('/api/notes/' + n.id).send({ title: 'New Title' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'New Title');
    assert.equal(res.body.content, 'Keep this');
  });

  it('updates content only', async () => {
    const n = makeNote({ title: 'Keep Title', content: 'Old content' });
    const res = await agent().put('/api/notes/' + n.id).send({ content: 'New content' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Keep Title');
    assert.equal(res.body.content, 'New content');
  });

  it('updates goal_id (link to different goal)', async () => {
    const area = makeArea();
    const g1 = makeGoal(area.id, { title: 'Goal 1' });
    const g2 = makeGoal(area.id, { title: 'Goal 2' });
    const n = makeNote({ title: 'Linked', goal_id: g1.id });
    const res = await agent().put('/api/notes/' + n.id).send({ goal_id: g2.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.goal_id, g2.id);
  });

  it('can set goal_id to null (unlink)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const n = makeNote({ title: 'Linked', goal_id: goal.id });
    const res = await agent().put('/api/notes/' + n.id).send({ goal_id: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.goal_id, null);
  });

  it('returns 404 for nonexistent note', async () => {
    const res = await agent().put('/api/notes/99999').send({ title: 'Nope' });
    assert.equal(res.status, 404);
  });

  it('updates updated_at timestamp', async () => {
    const n = makeNote({ title: 'Timestamp', updated_at: '2020-01-01T00:00:00Z' });
    const before = n.updated_at;
    const res = await agent().put('/api/notes/' + n.id).send({ title: 'Changed' });
    assert.equal(res.status, 200);
    assert.notEqual(res.body.updated_at, before);
  });

  // ── DELETE /api/notes/:id ──────────────────────────────────────

  it('deleting nonexistent note returns ok', async () => {
    const res = await agent().delete('/api/notes/99999');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});
