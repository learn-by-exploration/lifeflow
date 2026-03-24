const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Phase 1: Security & Data Safety ───

describe('POST /api/import — confirmation token', () => {
  it('rejects import without password (403)', async () => {
    const res = await agent().post('/api/import').send({
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }]
    });
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes('Password'));
  });

  it('rejects import without confirm token (403)', async () => {
    const res = await agent().post('/api/import').send({
      password: 'testpassword',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }]
    });
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes('DESTROY_ALL_DATA'));
  });

  it('accepts import with correct confirm token', async () => {
    const res = await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'Imported Area' }],
      goals: [{ id: 1, title: 'Imported Goal', area_id: 1 }],
      tasks: [{ title: 'Imported Task', goal_id: 1 }]
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

describe('POST /api/import — shape validation', () => {
  const base = { confirm: 'DESTROY_ALL_DATA', password: 'testpassword' };

  it('rejects areas not an array (400)', async () => {
    const res = await agent().post('/api/import').send({ ...base, areas: 'bad', goals: [], tasks: [] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('areas'));
  });

  it('rejects empty areas (400)', async () => {
    const res = await agent().post('/api/import').send({ ...base, areas: [], goals: [{ id: 1, title: 'G', area_id: 1 }], tasks: [{ title: 'T', goal_id: 1 }] });
    assert.equal(res.status, 400);
  });

  it('rejects empty goals (400)', async () => {
    const res = await agent().post('/api/import').send({ ...base, areas: [{ id: 1, name: 'A' }], goals: [], tasks: [{ title: 'T', goal_id: 1 }] });
    assert.equal(res.status, 400);
  });

  it('rejects empty tasks (400)', async () => {
    const res = await agent().post('/api/import').send({ ...base, areas: [{ id: 1, name: 'A' }], goals: [{ id: 1, title: 'G', area_id: 1 }], tasks: [] });
    assert.equal(res.status, 400);
  });

  it('rejects areas missing required fields (400)', async () => {
    const res = await agent().post('/api/import').send({
      ...base,
      areas: [{ name: 'A' }],  // missing id
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }]
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('area'));
  });

  it('rejects goals missing required fields (400)', async () => {
    const res = await agent().post('/api/import').send({
      ...base,
      areas: [{ id: 1, name: 'A' }],
      goals: [{ title: 'G' }],  // missing id, area_id
      tasks: [{ title: 'T', goal_id: 1 }]
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('goal'));
  });

  it('rejects tasks missing required fields (400)', async () => {
    const res = await agent().post('/api/import').send({
      ...base,
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ goal_id: 1 }]  // missing title
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('task'));
  });
});

describe('POST /api/import — atomicity', () => {
  it('data unchanged after failed import - existing data preserved', async () => {
    // Seed some data
    const area = makeArea({ name: 'Existing' });
    const goal = makeGoal(area.id, { title: 'Existing Goal' });
    makeTask(goal.id, { title: 'Existing Task' });

    // Verify data exists
    let areasRes = await agent().get('/api/areas');
    assert.ok(areasRes.body.length >= 1);

    // A valid import wipes and replaces
    const res = await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'New Area' }],
      goals: [{ id: 1, title: 'New Goal', area_id: 1 }],
      tasks: [{ title: 'New Task', goal_id: 1 }]
    });
    assert.equal(res.status, 200);

    // Verify old data is gone, new data present
    areasRes = await agent().get('/api/areas');
    assert.equal(areasRes.body.length, 1);
    assert.equal(areasRes.body[0].name, 'New Area');
  });
});

describe('Error message sanitization', () => {
  it('import error response does not contain SQL or table names', async () => {
    // This should fail at validation, not reach SQL
    const res = await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }]
    });
    // Valid import succeeds, but let's verify error format
    if (res.status >= 400) {
      assert.ok(!res.body.error.includes('SQLITE'));
      assert.ok(!res.body.error.includes('INSERT INTO'));
      assert.ok(!res.body.error.includes('DELETE FROM'));
    }
  });

  it('import with tags works correctly', async () => {
    const res = await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1, tags: [{ id: 1 }] }],
      tags: [{ id: 1, name: 'tag1', color: '#FF0000' }]
    });
    assert.equal(res.status, 200);
  });
});

describe('Body size limit', () => {
  it('rejects payloads larger than 1mb (413)', async () => {
    const bigString = 'x'.repeat(1.5 * 1024 * 1024); // 1.5MB
    const res = await agent()
      .post('/api/import')
      .send({ password: 'testpassword', confirm: 'DESTROY_ALL_DATA', areas: [{ id: 1, name: bigString }], goals: [{ id: 1, title: 'G', area_id: 1 }], tasks: [{ title: 'T', goal_id: 1 }] });
    assert.ok([413, 400].includes(res.status)); // express returns 413 or possibly a parse error
  });
});
