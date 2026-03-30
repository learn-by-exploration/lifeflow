const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, agent } = require('./helpers');

before(() => setup());
after(() => teardown());

describe('Area & Goal Boundary Values', () => {
  beforeEach(() => cleanDb());

  // ─── Area Name Boundaries ──────────────────────────────────────────────────

  describe('Area name boundaries', () => {
    it('rejects empty name', async () => {
      await agent().post('/api/areas').send({ name: '' }).expect(400);
    });

    it('accepts 1-character name', async () => {
      const res = await agent().post('/api/areas').send({ name: 'X' }).expect(201);
      assert.equal(res.body.name, 'X');
    });

    it('accepts name at max length (100 chars)', async () => {
      const name = 'A'.repeat(100);
      const res = await agent().post('/api/areas').send({ name }).expect(201);
      assert.equal(res.body.name, name);
    });

    it('rejects name exceeding max length (101 chars)', async () => {
      const name = 'A'.repeat(101);
      await agent().post('/api/areas').send({ name }).expect(400);
    });

    it('accepts unicode name (CJK, emoji, diacritics)', async () => {
      const name = '健康 Ñoño 🚀';
      const res = await agent().post('/api/areas').send({ name }).expect(201);
      assert.equal(res.body.name, name);
    });

    it('stores HTML entities as literal text (no XSS)', async () => {
      const name = '<script>alert("xss")</script>';
      const res = await agent().post('/api/areas').send({ name }).expect(201);
      assert.equal(res.body.name, name);
      assert.ok(!res.body.name.includes('&lt;'), 'Server stores raw text, frontend escapes on render');
    });

    it('allows duplicate area names', async () => {
      await agent().post('/api/areas').send({ name: 'Dup' }).expect(201);
      const res = await agent().post('/api/areas').send({ name: 'Dup' }).expect(201);
      assert.equal(res.body.name, 'Dup');
    });
  });

  // ─── Area Icon Boundaries ─────────────────────────────────────────────────

  describe('Area icon boundaries', () => {
    it('uses default icon when null/omitted', async () => {
      const res = await agent().post('/api/areas').send({ name: 'NoIcon' }).expect(201);
      assert.equal(res.body.icon, '📋');
    });

    it('accepts empty string icon', async () => {
      const res = await agent().post('/api/areas').send({ name: 'EmptyIcon', icon: '' }).expect(201);
      // Empty string may be stored or default applied
      assert.ok(typeof res.body.icon === 'string');
    });

    it('accepts multi-byte emoji icon (family emoji)', async () => {
      const icon = '👨‍👩‍👧‍👦';
      const res = await agent().post('/api/areas').send({ name: 'Family', icon }).expect(201);
      assert.equal(res.body.icon, icon);
    });

    it('accepts very long icon string', async () => {
      const icon = '🚀'.repeat(50);
      const res = await agent().post('/api/areas').send({ name: 'LongIcon', icon }).expect(201);
      assert.equal(res.body.icon, icon);
    });
  });

  // ─── Area Color Boundaries ────────────────────────────────────────────────

  describe('Area color boundaries', () => {
    it('uses default color when omitted', async () => {
      const res = await agent().post('/api/areas').send({ name: 'NoCOlor' }).expect(201);
      assert.equal(res.body.color, '#2563EB');
    });

    it('accepts valid 6-char hex color', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Red', color: '#FF0000' }).expect(201);
      assert.equal(res.body.color, '#FF0000');
    });

    it('rejects invalid hex color (#GGG)', async () => {
      await agent().post('/api/areas').send({ name: 'Bad', color: '#GGGGGG' }).expect(400);
    });

    it('rejects rgb() color format', async () => {
      await agent().post('/api/areas').send({ name: 'RGB', color: 'rgb(255,0,0)' }).expect(400);
    });

    it('accepts 3-char hex shorthand (#F00)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Short', color: '#F00' }).expect(201);
      assert.equal(res.body.color, '#F00');
    });
  });

  // ─── Goal Title Boundaries ────────────────────────────────────────────────

  describe('Goal title boundaries', () => {
    it('rejects empty goal title', async () => {
      const area = makeArea();
      await agent().post(`/api/areas/${area.id}/goals`).send({ title: '' }).expect(400);
    });

    it('rejects missing goal title', async () => {
      const area = makeArea();
      await agent().post(`/api/areas/${area.id}/goals`).send({}).expect(400);
    });

    it('accepts goal title at max length (200 chars)', async () => {
      const area = makeArea();
      const title = 'G'.repeat(200);
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title }).expect(201);
      assert.equal(res.body.title, title);
    });

    it('rejects goal title exceeding max length (201 chars)', async () => {
      const area = makeArea();
      const title = 'G'.repeat(201);
      await agent().post(`/api/areas/${area.id}/goals`).send({ title }).expect(400);
    });

    it('accepts unicode goal title', async () => {
      const area = makeArea();
      const title = '目標 Ñoño 🎯';
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title }).expect(201);
      assert.equal(res.body.title, title);
    });

    it('stores XSS attempt as literal text', async () => {
      const area = makeArea();
      const title = '<img src=x onerror=alert(1)>';
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title }).expect(201);
      assert.equal(res.body.title, title);
    });

    it('trims leading and trailing whitespace from title', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title: '  Trimmed Goal  ' }).expect(201);
      assert.equal(res.body.title, 'Trimmed Goal');
    });
  });

  // ─── Goal Description Boundaries ──────────────────────────────────────────

  describe('Goal description boundaries', () => {
    it('accepts null description', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'NullDesc', description: null }).expect(201);
      // null description stored as empty string per route logic
      assert.ok(res.body.description === '' || res.body.description === null);
    });

    it('accepts empty string description', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'EmptyDesc', description: '' }).expect(201);
      assert.equal(res.body.description, '');
    });

    it('accepts description at max length (2000 chars)', async () => {
      const area = makeArea();
      const description = 'D'.repeat(2000);
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'MaxDesc', description }).expect(201);
      assert.equal(res.body.description.length, 2000);
    });

    it('rejects description exceeding max length (2001 chars)', async () => {
      const area = makeArea();
      const description = 'D'.repeat(2001);
      await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'TooLong', description }).expect(400);
    });

    it('accepts markdown in description', async () => {
      const area = makeArea();
      const description = '# Heading\n\n- bullet 1\n- bullet 2\n\n**bold** and _italic_';
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'Markdown', description }).expect(201);
      assert.equal(res.body.description, description);
    });
  });

  // ─── Goal Status Transitions ──────────────────────────────────────────────

  describe('Goal status transitions', () => {
    it('transitions active → completed', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { status: 'active' });
      const res = await agent().put(`/api/goals/${goal.id}`)
        .send({ status: 'completed' }).expect(200);
      assert.equal(res.body.status, 'completed');
    });

    it('transitions completed → active', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { status: 'completed' });
      const res = await agent().put(`/api/goals/${goal.id}`)
        .send({ status: 'active' }).expect(200);
      assert.equal(res.body.status, 'active');
    });

    it('rejects invalid status value', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().put(`/api/goals/${goal.id}`)
        .send({ status: 'invalid_status' }).expect(400);
    });

    it('preserves status when status field is omitted', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { status: 'active' });
      const res = await agent().put(`/api/goals/${goal.id}`)
        .send({ title: 'Updated' }).expect(200);
      assert.equal(res.body.status, 'active');
      assert.equal(res.body.title, 'Updated');
    });
  });

  // ─── Goal Due Date Boundaries ─────────────────────────────────────────────

  describe('Goal due_date boundaries', () => {
    it('accepts null due_date', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'NoDue', due_date: null }).expect(201);
      assert.equal(res.body.due_date, null);
    });

    it('accepts past due_date', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'PastDue', due_date: '2020-01-01' }).expect(201);
      assert.equal(res.body.due_date, '2020-01-01');
    });

    it('accepts far-future due_date', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'FarFuture', due_date: '2099-12-31' }).expect(201);
      assert.equal(res.body.due_date, '2099-12-31');
    });

    it('accepts or rejects invalid date format gracefully', async () => {
      const area = makeArea();
      // The route doesn't validate date format for goals — it passes through
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'BadDate', due_date: 'not-a-date' });
      // Either 400 (validated) or 201 (stored as-is) — document actual behavior
      assert.ok([201, 400].includes(res.status));
    });
  });

  // ─── Milestone Boundaries ─────────────────────────────────────────────────

  describe('Milestone boundaries', () => {
    it('rejects empty milestone title', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      await agent().post(`/api/goals/${goal.id}/milestones`)
        .send({ title: '' }).expect(400);
    });

    it('accepts milestone title at max length (200 chars)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const title = 'M'.repeat(200);
      const res = await agent().post(`/api/goals/${goal.id}/milestones`)
        .send({ title }).expect(201);
      assert.equal(res.body.title, title);
    });

    it('rejects milestone title exceeding max length (201 chars)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const title = 'M'.repeat(201);
      await agent().post(`/api/goals/${goal.id}/milestones`)
        .send({ title }).expect(400);
    });

    it('toggles milestone done flag', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const ms = await agent().post(`/api/goals/${goal.id}/milestones`)
        .send({ title: 'Step 1' }).expect(201);
      assert.equal(ms.body.done, 0);

      const toggled = await agent().put(`/api/milestones/${ms.body.id}`)
        .send({ done: true }).expect(200);
      assert.equal(toggled.body.done, 1);

      const untoggled = await agent().put(`/api/milestones/${ms.body.id}`)
        .send({ done: false }).expect(200);
      assert.equal(untoggled.body.done, 0);
    });

    it('auto-increments milestone position', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const m1 = await agent().post(`/api/goals/${goal.id}/milestones`)
        .send({ title: 'First' }).expect(201);
      const m2 = await agent().post(`/api/goals/${goal.id}/milestones`)
        .send({ title: 'Second' }).expect(201);
      assert.equal(m1.body.position, 0);
      assert.equal(m2.body.position, 1);
    });

    it('returns 404 for milestone on non-existent goal', async () => {
      await agent().post('/api/goals/99999/milestones')
        .send({ title: 'Orphan' }).expect(404);
    });
  });

  // ─── Goal Color Boundaries ────────────────────────────────────────────────

  describe('Goal color boundaries', () => {
    it('uses default color when omitted', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'NoColor' }).expect(201);
      assert.equal(res.body.color, '#6C63FF');
    });

    it('accepts valid hex color', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'Red', color: '#FF0000' }).expect(201);
      assert.equal(res.body.color, '#FF0000');
    });

    it('rejects invalid hex color on goal', async () => {
      const area = makeArea();
      await agent().post(`/api/areas/${area.id}/goals`)
        .send({ title: 'BadColor', color: '#ZZZZZZ' }).expect(400);
    });
  });

  // ─── Area Update Boundaries ───────────────────────────────────────────────

  describe('Area update boundaries', () => {
    it('rejects update with empty name', async () => {
      const area = makeArea({ name: 'Existing' });
      await agent().put(`/api/areas/${area.id}`)
        .send({ name: '' }).expect(400);
    });

    it('rejects update with name exceeding max length', async () => {
      const area = makeArea({ name: 'Existing' });
      await agent().put(`/api/areas/${area.id}`)
        .send({ name: 'A'.repeat(101) }).expect(400);
    });

    it('rejects update with invalid color', async () => {
      const area = makeArea();
      await agent().put(`/api/areas/${area.id}`)
        .send({ color: 'not-a-color' }).expect(400);
    });
  });
});
