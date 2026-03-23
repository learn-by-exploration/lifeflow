const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Phase 5: Frontend Resilience ───

describe('API error responses are JSON', () => {
  it('returns JSON body for 404 focus delete', async () => {
    const res = await agent().delete('/api/focus/999999');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns JSON body for invalid task creation (bad priority)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T', priority: 99 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns JSON body for 404 review delete', async () => {
    const res = await agent().delete('/api/reviews/999999');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });
});

describe('No inline onclick in served HTML', () => {
  it('index.html contains no onclick= attributes', async () => {
    const res = await agent().get('/');
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes('onclick='), 'Found inline onclick= in served HTML');
  });
});

// ─── Phase 6: Frontend Quality — ARIA ───

describe('Modal ARIA attributes', () => {
  it('search overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="sr-ov" role="dialog"'));
  });

  it('quick capture overlay has role=dialog and aria-modal', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="qc-ov" role="dialog" aria-modal="true"'));
  });

  it('keyboard shortcuts overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="kb-ov" role="dialog" aria-modal="true"'));
  });

  it('focus timer overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="ft-ov" role="dialog" aria-modal="true"'));
  });

  it('tour overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="tour-ov" role="dialog" aria-modal="true"'));
  });

  it('onboarding overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="onb-ov" role="dialog" aria-modal="true"'));
  });

  it('template apply overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="tmpl-apply-ov" role="dialog" aria-modal="true"'));
  });

  it('daily review overlay has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="dr-ov" role="dialog" aria-modal="true"'));
  });

  it('area modal has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="am" role="dialog" aria-modal="true"'));
  });

  it('goal modal has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="gm" role="dialog" aria-modal="true"'));
  });

  it('detail panel has role=dialog', async () => {
    const res = await agent().get('/');
    assert.ok(res.text.includes('id="dp" role="dialog"'));
  });
});
