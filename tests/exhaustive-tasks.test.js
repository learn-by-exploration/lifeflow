const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

describe('Tasks API – exhaustive edge-case coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── POST /api/tasks/bulk-myday ────────────────────────────────

  describe('POST /api/tasks/bulk-myday', () => {
    it('returns 400 for non-array ids', async () => {
      const res = await agent().post('/api/tasks/bulk-myday').send({ ids: 'not-an-array' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /ids/i);
    });

    it('handles empty ids array gracefully', async () => {
      const res = await agent().post('/api/tasks/bulk-myday').send({ ids: [] });
      assert.equal(res.status, 200);
      assert.equal(res.body.updated, 0);
    });

    it('skips nonexistent task ids silently', async () => {
      const res = await agent().post('/api/tasks/bulk-myday').send({ ids: [999999, 999998] });
      assert.equal(res.status, 200);
      // Server runs UPDATE per id; nonexistent rows are no-ops but still counted
      assert.equal(res.body.updated, 2);
    });
  });

  // ── POST /api/tasks/reschedule ────────────────────────────────

  describe('POST /api/tasks/reschedule', () => {
    it('returns 400 for non-array ids', async () => {
      const res = await agent().post('/api/tasks/reschedule').send({ ids: 42 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /ids/i);
    });

    it('sets due_date on multiple tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id);
      const t2 = makeTask(g.id);
      const newDate = daysFromNow(5);
      const res = await agent().post('/api/tasks/reschedule').send({
        ids: [t1.id, t2.id],
        due_date: newDate
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.updated, 2);
      const r1 = await agent().get('/api/tasks/' + t1.id);
      const r2 = await agent().get('/api/tasks/' + t2.id);
      assert.equal(r1.body.due_date, newDate);
      assert.equal(r2.body.due_date, newDate);
    });

    it('clears my_day when clear_myday=true', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { my_day: 1 });
      const t2 = makeTask(g.id, { my_day: 1 });
      const res = await agent().post('/api/tasks/reschedule').send({
        ids: [t1.id, t2.id],
        clear_myday: true
      });
      assert.equal(res.status, 200);
      const r1 = await agent().get('/api/tasks/' + t1.id);
      const r2 = await agent().get('/api/tasks/' + t2.id);
      assert.equal(r1.body.my_day, 0);
      assert.equal(r2.body.my_day, 0);
    });

    it('can set both due_date and clear_myday', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { my_day: 1, due_date: today() });
      const newDate = daysFromNow(3);
      const res = await agent().post('/api/tasks/reschedule').send({
        ids: [t.id],
        due_date: newDate,
        clear_myday: true
      });
      assert.equal(res.status, 200);
      const r = await agent().get('/api/tasks/' + t.id);
      assert.equal(r.body.due_date, newDate);
      assert.equal(r.body.my_day, 0);
    });
  });

  // ── POST /api/tasks/:id/skip ──────────────────────────────────

  describe('POST /api/tasks/:id/skip', () => {
    it('returns 400 for invalid ID', async () => {
      const res = await agent().post('/api/tasks/abc/skip');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid/i);
    });

    it('returns 404 for nonexistent task', async () => {
      const res = await agent().post('/api/tasks/999999/skip');
      assert.equal(res.status, 404);
    });

    it('copies tags to next occurrence', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Tagged recurring', recurring: 'weekly', due_date: today() });
      const tag1 = makeTag({ name: 'work' });
      const tag2 = makeTag({ name: 'important' });
      linkTag(t.id, tag1.id);
      linkTag(t.id, tag2.id);

      const res = await agent().post('/api/tasks/' + t.id + '/skip');
      assert.equal(res.status, 200);
      assert.ok(res.body.next);
      const nextTask = res.body.next;
      assert.ok(Array.isArray(nextTask.tags));
      const tagNames = nextTask.tags.map(tg => tg.name);
      assert.ok(tagNames.includes('work'));
      assert.ok(tagNames.includes('important'));
    });
  });

  // ── POST /api/tasks/:id/move ──────────────────────────────────

  describe('POST /api/tasks/:id/move', () => {
    it('returns 400 for invalid ID', async () => {
      const res = await agent().post('/api/tasks/xyz/move').send({ goal_id: 1 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid/i);
    });

    it('returns 404 for nonexistent task', async () => {
      const res = await agent().post('/api/tasks/999999/move').send({ goal_id: 1 });
      assert.equal(res.status, 404);
    });

    it('returns 404 for nonexistent goal', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().post('/api/tasks/' + t.id + '/move').send({ goal_id: 999999 });
      assert.equal(res.status, 404);
      assert.match(res.body.error, /goal/i);
    });

    it('returns 400 when goal_id missing', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().post('/api/tasks/' + t.id + '/move').send({});
      assert.equal(res.status, 400);
      assert.match(res.body.error, /goal_id/i);
    });
  });

  // ── PUT /api/tasks/bulk ───────────────────────────────────────

  describe('PUT /api/tasks/bulk', () => {
    it('sets completed_at when status=done', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id);
      const t2 = makeTask(g.id);
      const res = await agent().put('/api/tasks/bulk').send({
        ids: [t1.id, t2.id],
        changes: { status: 'done' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.updated, 2);
      const r1 = await agent().get('/api/tasks/' + t1.id);
      const r2 = await agent().get('/api/tasks/' + t2.id);
      assert.equal(r1.body.status, 'done');
      assert.ok(r1.body.completed_at, 'completed_at should be set on first task');
      assert.ok(r2.body.completed_at, 'completed_at should be set on second task');
    });

    it('add_tag_id adds tags to tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id);
      const t2 = makeTask(g.id);
      const tag = makeTag({ name: 'bulk-tagged' });
      const res = await agent().put('/api/tasks/bulk').send({
        ids: [t1.id, t2.id],
        changes: { add_tag_id: tag.id }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.updated, 2);
      const r1 = await agent().get('/api/tasks/' + t1.id);
      const r2 = await agent().get('/api/tasks/' + t2.id);
      assert.ok(r1.body.tags.some(tg => tg.name === 'bulk-tagged'));
      assert.ok(r2.body.tags.some(tg => tg.name === 'bulk-tagged'));
    });
  });

  // ── PUT /api/tasks/:id/deps ───────────────────────────────────

  describe('PUT /api/tasks/:id/deps', () => {
    it('self-dependency is silently ignored', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().put('/api/tasks/' + t.id + '/deps').send({
        blockedByIds: [t.id]
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
      assert.equal(res.body.blockedBy.length, 0);
    });

    it('replaces existing deps', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Main' });
      const t2 = makeTask(g.id, { title: 'Old dep' });
      const t3 = makeTask(g.id, { title: 'New dep' });
      const { db } = setup();
      // Insert an existing dep
      db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(t1.id, t2.id);

      // Replace with new dep
      const res = await agent().put('/api/tasks/' + t1.id + '/deps').send({
        blockedByIds: [t3.id]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.blockedBy.length, 1);
      assert.equal(res.body.blockedBy[0].id, t3.id);

      // Verify old dep removed via GET
      const get = await agent().get('/api/tasks/' + t1.id + '/deps');
      assert.equal(get.body.blockedBy.length, 1);
      assert.equal(get.body.blockedBy[0].id, t3.id);
    });
  });

  // ── GET /api/export/ical ──────────────────────────────────────

  describe('GET /api/export/ical', () => {
    it('sets Content-Type to text/calendar', async () => {
      const res = await agent().get('/api/export/ical');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/calendar'));
    });

    it('excludes done tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Active task', due_date: today(), status: 'todo' });
      makeTask(g.id, { title: 'Done task', due_date: today(), status: 'done' });

      const res = await agent().get('/api/export/ical');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('Active task'));
      assert.ok(!res.text.includes('Done task'));
    });

    it('includes SUMMARY from task title', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'My Important Task', due_date: daysFromNow(2), status: 'todo' });

      const res = await agent().get('/api/export/ical');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('SUMMARY:My Important Task'));
    });
  });

  // ── GET /api/search ───────────────────────────────────────────

  describe('GET /api/search', () => {
    it('returns empty for no query', async () => {
      const res = await agent().get('/api/search');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.results, []);
    });

    it('handles special characters safely', async () => {
      const res = await agent().get('/api/search?q=' + encodeURIComponent('DROP TABLE; <script>'));
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.results));
    });

    it('respects limit parameter', async () => {
      // Seed search index with enough data to test limiting
      const a = makeArea();
      const g = makeGoal(a.id);
      const { db } = setup();
      for (let i = 0; i < 10; i++) {
        makeTask(g.id, { title: `Searchable item ${i}` });
      }
      // Rebuild search index entries
      db.exec(`
        DELETE FROM search_index;
        INSERT INTO search_index (type, source_id, title, body, context)
        SELECT 'task', id, title, note, 'tasks' FROM tasks;
      `);

      const res = await agent().get('/api/search?q=Searchable&limit=3');
      assert.equal(res.status, 200);
      assert.ok(res.body.results.length <= 3);
    });
  });
});
