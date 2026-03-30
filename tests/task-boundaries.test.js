const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, agent, makeArea, makeGoal, makeTask, setup, today } = require('./helpers');

describe('Task CRUD Boundary Values', () => {
  let area, goal;

  beforeEach(() => {
    cleanDb();
    area = makeArea();
    goal = makeGoal(area.id);
  });
  after(() => teardown());

  // ─── Title boundaries ───────────────────────────────────────────────────────

  describe('Title boundaries', () => {
    it('rejects empty title → 400', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: '' })
        .expect(400);
      assert.ok(res.body.error);
    });

    it('rejects whitespace-only title → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: '   \t\n  ' })
        .expect(400);
    });

    it('accepts 1-character title', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'X' })
        .expect(201);
      assert.equal(res.body.title, 'X');
    });

    it('accepts 499-character title', async () => {
      const title = 'A'.repeat(499);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title })
        .expect(201);
      assert.equal(res.body.title, title);
    });

    it('accepts exactly 500-character title', async () => {
      const title = 'B'.repeat(500);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title })
        .expect(201);
      assert.equal(res.body.title, title);
    });

    it('rejects 501-character title → 400', async () => {
      const title = 'C'.repeat(501);
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title })
        .expect(400);
    });

    it('accepts unicode title (emoji, CJK)', async () => {
      const title = '🎯 任務テスト 작업 مهمة';
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title })
        .expect(201);
      assert.equal(res.body.title, title);
    });

    it('accepts title with special chars (&, <, >, ")', async () => {
      const title = 'Task <script>alert("xss")</script> & "quotes"';
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title })
        .expect(201);
      // Title stored as-is (output escaping handled by frontend)
      assert.equal(res.body.title, title);
    });

    it('rejects empty title on PUT → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ title: '' })
        .expect(400);
    });

    it('rejects whitespace-only title on PUT → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ title: '   ' })
        .expect(400);
    });
  });

  // ─── Note boundaries ───────────────────────────────────────────────────────

  describe('Note boundaries', () => {
    it('accepts null note', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', note: null })
        .expect(201);
      // null note stored as empty string
      assert.ok(res.body.note === '' || res.body.note === null);
    });

    it('accepts empty string note', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', note: '' })
        .expect(201);
      assert.equal(res.body.note, '');
    });

    it('accepts 4999-character note', async () => {
      const note = 'N'.repeat(4999);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', note })
        .expect(201);
      assert.equal(res.body.note, note);
    });

    it('accepts exactly 5000-character note', async () => {
      const note = 'M'.repeat(5000);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', note })
        .expect(201);
      assert.equal(res.body.note, note);
    });

    it('rejects 5001-character note → 400', async () => {
      const note = 'L'.repeat(5001);
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', note })
        .expect(400);
    });

    it('accepts note with markdown content', async () => {
      const note = '# Heading\n\n- item 1\n- item 2\n\n**bold** _italic_ `code`\n\n```js\nconsole.log("hi");\n```';
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', note })
        .expect(201);
      assert.equal(res.body.note, note);
    });
  });

  // ─── Priority boundaries ────────────────────────────────────────────────────

  describe('Priority boundaries', () => {
    it('accepts priority 0', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: 0 })
        .expect(201);
      assert.equal(res.body.priority, 0);
    });

    it('accepts priority 1', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: 1 })
        .expect(201);
      assert.equal(res.body.priority, 1);
    });

    it('accepts priority 2', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: 2 })
        .expect(201);
      assert.equal(res.body.priority, 2);
    });

    it('accepts priority 3', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: 3 })
        .expect(201);
      assert.equal(res.body.priority, 3);
    });

    it('rejects priority -1 → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: -1 })
        .expect(400);
    });

    it('rejects priority 4 → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: 4 })
        .expect(400);
    });

    it('defaults to 0 when priority is null', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: null })
        .expect(201);
      assert.equal(res.body.priority, 0);
    });

    it('rejects boolean false priority → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: false })
        .expect(400);
    });

    it('rejects float priority 1.5 → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: 1.5 })
        .expect(400);
    });

    it('handles string priority "2" (coerced via Number())', async () => {
      // Server uses Number(priority) which coerces "2" to 2 — valid per [0,1,2,3].includes(2)
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', priority: '2' })
        .expect(201);
      // priority stored as integer after coercion
      assert.equal(res.body.priority, 2);
    });

    it('rejects priority -1 on PUT → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ priority: -1 })
        .expect(400);
    });

    it('rejects priority 4 on PUT → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ priority: 4 })
        .expect(400);
    });
  });

  // ─── Due date boundaries ────────────────────────────────────────────────────

  describe('Due date boundaries', () => {
    it('accepts null due_date', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: null })
        .expect(201);
      assert.equal(res.body.due_date, null);
    });

    it('accepts today as due_date', async () => {
      const d = today();
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: d })
        .expect(201);
      assert.equal(res.body.due_date, d);
    });

    it('accepts past due_date (yesterday)', async () => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      const yesterday = d.toISOString().slice(0, 10);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: yesterday })
        .expect(201);
      assert.equal(res.body.due_date, yesterday);
    });

    it('accepts far future 9999-12-31', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: '9999-12-31' })
        .expect(201);
      assert.equal(res.body.due_date, '9999-12-31');
    });

    it('accepts Feb 29 2028 (leap year)', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: '2028-02-29' })
        .expect(201);
      assert.equal(res.body.due_date, '2028-02-29');
    });

    it('rejects Feb 29 2027 (non-leap) → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: '2027-02-29' })
        .expect(400);
    });

    it('rejects invalid month 2026-13-01 → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: '2026-13-01' })
        .expect(400);
    });

    it('rejects malformed date "not-a-date" → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', due_date: 'not-a-date' })
        .expect(400);
    });

    it('clears due_date via PUT with null', async () => {
      const task = makeTask(goal.id, { due_date: '2026-06-01' });
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ due_date: null })
        .expect(200);
      assert.equal(res.body.due_date, null);
    });
  });

  // ─── Status transitions via PUT ─────────────────────────────────────────────

  describe('Status transitions via PUT', () => {
    it('todo → doing', async () => {
      const task = makeTask(goal.id, { status: 'todo' });
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'doing' })
        .expect(200);
      assert.equal(res.body.status, 'doing');
    });

    it('doing → done (sets completed_at)', async () => {
      const task = makeTask(goal.id, { status: 'doing' });
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'done' })
        .expect(200);
      assert.equal(res.body.status, 'done');
      assert.ok(res.body.completed_at, 'completed_at should be set');
    });

    it('done → todo (clears completed_at)', async () => {
      const { db } = setup();
      const task = makeTask(goal.id, { status: 'done' });
      db.prepare("UPDATE tasks SET completed_at=datetime('now') WHERE id=?").run(task.id);

      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'todo' })
        .expect(200);
      assert.equal(res.body.status, 'todo');
      assert.equal(res.body.completed_at, null);
    });

    it('rejects status "cancelled" → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: 'cancelled' })
        .expect(400);
    });

    it('keeps current status when status is omitted', async () => {
      const task = makeTask(goal.id, { status: 'doing' });
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ title: 'Updated' })
        .expect(200);
      assert.equal(res.body.status, 'doing');
      assert.equal(res.body.title, 'Updated');
    });

    it('rejects empty string status → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ status: '' })
        .expect(400);
    });
  });

  // ─── Position boundaries ────────────────────────────────────────────────────

  describe('Position boundaries', () => {
    it('accepts position 0 on PUT', async () => {
      const task = makeTask(goal.id, { position: 5 });
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ position: 0 })
        .expect(200);
      assert.equal(res.body.position, 0);
    });

    it('accepts large position 999999', async () => {
      const task = makeTask(goal.id);
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ position: 999999 })
        .expect(200);
      assert.equal(res.body.position, 999999);
    });

    it('handles negative position (server stores as-is)', async () => {
      const task = makeTask(goal.id);
      // The server uses COALESCE(?,position) — negative is stored
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ position: -1 })
        .expect(200);
      // Server doesn't reject negative positions currently
      assert.equal(res.body.position, -1);
    });

    it('handles float position (stored as-is by SQLite)', async () => {
      const task = makeTask(goal.id);
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ position: 2.5 })
        .expect(200);
      assert.equal(res.body.position, 2.5);
    });
  });

  // ─── estimated_minutes boundaries ───────────────────────────────────────────

  describe('estimated_minutes boundaries', () => {
    it('accepts 0', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', estimated_minutes: 0 })
        .expect(201);
      // 0 is falsy so estimated_minutes||null becomes null
      assert.ok(res.body.estimated_minutes === 0 || res.body.estimated_minutes === null);
    });

    it('rejects negative → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', estimated_minutes: -5 })
        .expect(400);
    });

    it('accepts float (stored as-is)', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', estimated_minutes: 30.5 })
        .expect(201);
      assert.equal(res.body.estimated_minutes, 30.5);
    });

    it('accepts null', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', estimated_minutes: null })
        .expect(201);
      assert.equal(res.body.estimated_minutes, null);
    });

    it('accepts large value 99999', async () => {
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', estimated_minutes: 99999 })
        .expect(201);
      assert.equal(res.body.estimated_minutes, 99999);
    });

    it('rejects negative on PUT → 400', async () => {
      const task = makeTask(goal.id);
      await agent()
        .put(`/api/tasks/${task.id}`)
        .send({ estimated_minutes: -10 })
        .expect(400);
    });

    it('rejects string on POST → 400', async () => {
      await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'Task', estimated_minutes: 'thirty' })
        .expect(400);
    });
  });
});
