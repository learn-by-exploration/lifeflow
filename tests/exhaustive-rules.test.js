const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent } = require('./helpers');

describe('Automation Rules API – exhaustive coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── GET /api/rules ────────────────────────────────────────────────

  it('returns empty array when no rules exist', async () => {
    const res = await agent().get('/api/rules');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });

  // ── POST /api/rules ──────────────────────────────────────────────

  it('stores trigger_config as JSON string', async () => {
    const tc = { area_id: 42, priority: 1 };
    const res = await agent().post('/api/rules').send({
      name: 'TC rule',
      trigger_type: 'task_completed',
      trigger_config: tc,
      action_type: 'add_to_myday',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.trigger_config, JSON.stringify(tc));
  });

  it('stores action_config as JSON string', async () => {
    const ac = { priority: 3 };
    const res = await agent().post('/api/rules').send({
      name: 'AC rule',
      trigger_type: 'task_completed',
      action_type: 'set_priority',
      action_config: ac,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.action_config, JSON.stringify(ac));
  });

  it('defaults trigger_config and action_config to empty object JSON', async () => {
    const res = await agent().post('/api/rules').send({
      name: 'Defaults',
      trigger_type: 'task_completed',
      action_type: 'add_to_myday',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.trigger_config, '{}');
    assert.equal(res.body.action_config, '{}');
  });

  it('trims name', async () => {
    const res = await agent().post('/api/rules').send({
      name: '  Padded Name  ',
      trigger_type: 'task_completed',
      action_type: 'add_to_myday',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Padded Name');
  });

  it('returns 400 when name is missing', async () => {
    const res = await agent().post('/api/rules').send({
      trigger_type: 'task_completed',
      action_type: 'add_to_myday',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when trigger_type is missing', async () => {
    const res = await agent().post('/api/rules').send({
      name: 'No trigger',
      action_type: 'add_to_myday',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when action_type is missing', async () => {
    const res = await agent().post('/api/rules').send({
      name: 'No action',
      trigger_type: 'task_completed',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  // ── PUT /api/rules/:id ───────────────────────────────────────────

  it('returns 404 for nonexistent rule', async () => {
    const res = await agent().put('/api/rules/99999').send({ name: 'Ghost' });
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('partial update – only name', async () => {
    const { body: r } = await agent().post('/api/rules').send({
      name: 'Original',
      trigger_type: 'task_completed',
      action_type: 'add_to_myday',
    });
    const res = await agent().put('/api/rules/' + r.id).send({ name: 'Renamed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Renamed');
    assert.equal(res.body.trigger_type, 'task_completed');
    assert.equal(res.body.action_type, 'add_to_myday');
  });

  it('partial update – only enabled to 0', async () => {
    const { body: r } = await agent().post('/api/rules').send({
      name: 'Active',
      trigger_type: 'task_completed',
      action_type: 'add_to_myday',
    });
    assert.equal(r.enabled, 1);
    const res = await agent().put('/api/rules/' + r.id).send({ enabled: 0 });
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, 0);
    assert.equal(res.body.name, 'Active'); // unchanged
  });

  it('updates trigger_config', async () => {
    const { body: r } = await agent().post('/api/rules').send({
      name: 'TC update',
      trigger_type: 'task_completed',
      action_type: 'add_to_myday',
      trigger_config: { area_id: 1 },
    });
    const newTc = { area_id: 2, priority: 3 };
    const res = await agent().put('/api/rules/' + r.id).send({ trigger_config: newTc });
    assert.equal(res.status, 200);
    assert.equal(res.body.trigger_config, JSON.stringify(newTc));
  });

  // ── DELETE /api/rules/:id ─────────────────────────────────────────

  it('deleting nonexistent rule still returns ok', async () => {
    const res = await agent().delete('/api/rules/99999');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  // ── Rule execution on task completion ─────────────────────────────

  it('set_priority action updates task priority on completion', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { priority: 1 });

    await agent().post('/api/rules').send({
      name: 'Bump priority',
      trigger_type: 'task_completed',
      action_type: 'set_priority',
      action_config: { priority: 3 },
    });

    await agent().put('/api/tasks/' + t.id).send({ status: 'done' });

    const res = await agent().get('/api/tasks/' + t.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.priority, 3);
  });

  it('add_tag action adds tag to task on completion', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const tag = makeTag({ name: 'auto-tagged' });

    await agent().post('/api/rules').send({
      name: 'Auto tag',
      trigger_type: 'task_completed',
      action_type: 'add_tag',
      action_config: { tag_id: tag.id },
    });

    await agent().put('/api/tasks/' + t.id).send({ status: 'done' });

    const res = await agent().get('/api/tasks/' + t.id);
    assert.equal(res.status, 200);
    const tagNames = res.body.tags.map(tg => tg.name);
    assert.ok(tagNames.includes('auto-tagged'), 'Expected tag "auto-tagged" on task');
  });

  it('trigger_config area_id filter – only fires for matching area', async () => {
    const a1 = makeArea({ name: 'Area 1' });
    const a2 = makeArea({ name: 'Area 2' });
    const g1 = makeGoal(a1.id);
    const g2 = makeGoal(a2.id);
    const t1 = makeTask(g1.id, { priority: 0 });
    const t2 = makeTask(g2.id, { priority: 0 });

    // Rule targets area 1 only
    await agent().post('/api/rules').send({
      name: 'Area 1 only',
      trigger_type: 'task_completed',
      trigger_config: { area_id: a1.id },
      action_type: 'set_priority',
      action_config: { priority: 3 },
    });

    // Complete both tasks
    await agent().put('/api/tasks/' + t1.id).send({ status: 'done' });
    await agent().put('/api/tasks/' + t2.id).send({ status: 'done' });

    const r1 = await agent().get('/api/tasks/' + t1.id);
    const r2 = await agent().get('/api/tasks/' + t2.id);
    assert.equal(r1.body.priority, 3, 'Matching area task should have priority updated');
    assert.equal(r2.body.priority, 0, 'Non-matching area task should keep original priority');
  });

  it('trigger_config goal_id filter – only fires for matching goal', async () => {
    const a = makeArea();
    const g1 = makeGoal(a.id, { title: 'Goal 1' });
    const g2 = makeGoal(a.id, { title: 'Goal 2' });
    const t1 = makeTask(g1.id, { priority: 0 });
    const t2 = makeTask(g2.id, { priority: 0 });

    await agent().post('/api/rules').send({
      name: 'Goal 1 only',
      trigger_type: 'task_completed',
      trigger_config: { goal_id: g1.id },
      action_type: 'set_priority',
      action_config: { priority: 3 },
    });

    await agent().put('/api/tasks/' + t1.id).send({ status: 'done' });
    await agent().put('/api/tasks/' + t2.id).send({ status: 'done' });

    const r1 = await agent().get('/api/tasks/' + t1.id);
    const r2 = await agent().get('/api/tasks/' + t2.id);
    assert.equal(r1.body.priority, 3, 'Matching goal task should have priority updated');
    assert.equal(r2.body.priority, 0, 'Non-matching goal task should keep original priority');
  });

  it('trigger_config priority filter – only fires for matching priority', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t1 = makeTask(g.id, { priority: 2 });
    const t2 = makeTask(g.id, { priority: 1 });

    await agent().post('/api/rules').send({
      name: 'Priority 2 only',
      trigger_type: 'task_completed',
      trigger_config: { priority: 2 },
      action_type: 'add_to_myday',
    });

    await agent().put('/api/tasks/' + t1.id).send({ status: 'done' });
    await agent().put('/api/tasks/' + t2.id).send({ status: 'done' });

    const r1 = await agent().get('/api/tasks/' + t1.id);
    const r2 = await agent().get('/api/tasks/' + t2.id);
    assert.equal(r1.body.my_day, 1, 'Matching priority task should be added to my_day');
    assert.equal(r2.body.my_day, 0, 'Non-matching priority task should not be in my_day');
  });

  it('multiple rules can fire for same event', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { priority: 0 });
    const tag = makeTag({ name: 'multi-rule-tag' });

    // Rule 1: set priority
    await agent().post('/api/rules').send({
      name: 'Rule A',
      trigger_type: 'task_completed',
      action_type: 'set_priority',
      action_config: { priority: 3 },
    });

    // Rule 2: add tag
    await agent().post('/api/rules').send({
      name: 'Rule B',
      trigger_type: 'task_completed',
      action_type: 'add_tag',
      action_config: { tag_id: tag.id },
    });

    await agent().put('/api/tasks/' + t.id).send({ status: 'done' });

    const res = await agent().get('/api/tasks/' + t.id);
    assert.equal(res.body.priority, 3, 'First rule should have set priority');
    const tagNames = res.body.tags.map(tg => tg.name);
    assert.ok(tagNames.includes('multi-rule-tag'), 'Second rule should have added tag');
  });
});
