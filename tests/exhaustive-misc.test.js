const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

describe('Misc API – exhaustive edge-case coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── Templates Edge Cases ──────────────────────────────────────

  describe('Templates Edge Cases', () => {
    it('POST /api/templates/:id/apply creates tasks with correct priority from template', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const cr = await agent().post('/api/templates').send({
        name: 'Priority Test',
        tasks: [
          { title: 'Critical', priority: 3, subtasks: [] },
          { title: 'High', priority: 2, subtasks: [] },
          { title: 'Low', priority: 0, subtasks: [] }
        ]
      });
      assert.equal(cr.status, 200);
      const res = await agent().post(`/api/templates/${cr.body.id}/apply`).send({ goalId: g.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.created.length, 3);
      const tasks = await agent().get(`/api/goals/${g.id}/tasks`);
      const byTitle = {};
      tasks.body.forEach(t => { byTitle[t.title] = t; });
      assert.equal(byTitle['Critical'].priority, 3);
      assert.equal(byTitle['High'].priority, 2);
      assert.equal(byTitle['Low'].priority, 0);
    });

    it('POST /api/templates stores tasks as JSON array', async () => {
      const { db } = setup();
      const res = await agent().post('/api/templates').send({
        name: 'JSON Test',
        tasks: [
          { title: 'Task A', priority: 2, subtasks: ['Sub 1'] },
          { title: 'Task B', priority: 1, subtasks: [] }
        ]
      });
      assert.equal(res.status, 200);
      const row = db.prepare('SELECT tasks FROM task_templates WHERE id=?').get(res.body.id);
      const parsed = JSON.parse(row.tasks);
      assert.ok(Array.isArray(parsed));
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].title, 'Task A');
      assert.deepEqual(parsed[0].subtasks, ['Sub 1']);
    });

    it('DELETE /api/templates/:id - deleting nonexistent template returns 404', async () => {
      const res = await agent().delete('/api/templates/999999');
      assert.equal(res.status, 404);
    });
  });

  // ── Comments Edge Cases ───────────────────────────────────────

  describe('Comments Edge Cases', () => {
    it('GET /api/tasks/:id/comments returns empty array for task with no comments', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().get(`/api/tasks/${t.id}/comments`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('POST /api/tasks/:id/comments returns 400 for whitespace-only text', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().post(`/api/tasks/${t.id}/comments`).send({ text: '   ' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /text/i);
    });

    it('POST /api/tasks/:id/comments trims text', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().post(`/api/tasks/${t.id}/comments`).send({ text: '  hello world  ' });
      assert.equal(res.status, 201);
      assert.equal(res.body.text, 'hello world');
    });

    it('DELETE /api/tasks/:id/comments/:commentId - returns 404 for nonexistent comment', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      const res = await agent().delete(`/api/tasks/${t.id}/comments/999999`);
      assert.equal(res.status, 404);
    });

    it('GET /api/tasks/:id/comments returns 400 for non-integer ID', async () => {
      const res = await agent().get('/api/tasks/abc/comments');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid/i);
    });
  });

  // ── Milestones Edge Cases ─────────────────────────────────────

  describe('Milestones Edge Cases', () => {
    it('GET /api/goals/:id/milestones returns empty array for goal with no milestones', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const res = await agent().get(`/api/goals/${g.id}/milestones`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('POST /api/goals/:id/milestones returns 400 for empty title', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const res = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: '' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /title/i);
    });

    it('POST /api/goals/:id/milestones auto-increments position', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const m1 = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'First' });
      const m2 = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Second' });
      const m3 = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Third' });
      assert.equal(m1.body.position, 0);
      assert.equal(m2.body.position, 1);
      assert.equal(m3.body.position, 2);
    });

    it('PUT /api/milestones/:id sets completed_at when marking done', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const m = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Milestone' });
      assert.equal(m.body.completed_at, null);
      const res = await agent().put(`/api/milestones/${m.body.id}`).send({ done: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.done, 1);
      assert.ok(res.body.completed_at);
    });

    it('PUT /api/milestones/:id clears completed_at when marking undone', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const m = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Milestone' });
      await agent().put(`/api/milestones/${m.body.id}`).send({ done: true });
      const res = await agent().put(`/api/milestones/${m.body.id}`).send({ done: false });
      assert.equal(res.status, 200);
      assert.equal(res.body.done, 0);
      assert.equal(res.body.completed_at, null);
    });

    it('PUT /api/milestones/:id returns 404 for nonexistent milestone', async () => {
      const res = await agent().put('/api/milestones/999999').send({ done: true });
      assert.equal(res.status, 404);
    });

    it('DELETE /api/milestones/:id returns 400 for invalid ID (NaN)', async () => {
      const res = await agent().delete('/api/milestones/abc');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid/i);
    });
  });

  // ── Goal Progress Edge Cases ──────────────────────────────────

  describe('Goal Progress Edge Cases', () => {
    it('GET /api/goals/:id/progress returns 404 for nonexistent goal', async () => {
      const res = await agent().get('/api/goals/999999/progress');
      assert.equal(res.status, 404);
    });

    it('GET /api/goals/:id/progress returns velocity for recent completions', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { status: 'done', title: 'Done 1' });
      const t2 = makeTask(g.id, { status: 'done', title: 'Done 2' });
      const { db } = setup();
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(now, t1.id);
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(now, t2.id);
      const res = await agent().get(`/api/goals/${g.id}/progress`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.velocity));
      assert.ok(res.body.velocity.length >= 1);
      assert.ok(res.body.velocity[0].count >= 2);
    });

    it('GET /api/goals/:id/progress pct is 0 when no tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const res = await agent().get(`/api/goals/${g.id}/progress`);
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 0);
      assert.equal(res.body.done, 0);
      assert.equal(res.body.pct, 0);
    });
  });

  // ── Backup Edge Cases ─────────────────────────────────────────

  describe('Backup Edge Cases', () => {
    it('POST /api/backup creates file on disk (response has filename)', async () => {
      const res = await agent().post('/api/backup').send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.file);
      assert.match(res.body.file, /lifeflow-backup-.*\.json/);
    });

    it('GET /api/export includes areas, goals, tasks, tags', async () => {
      const a = makeArea({ name: 'Export Area' });
      const g = makeGoal(a.id, { title: 'Export Goal' });
      makeTask(g.id, { title: 'Export Task' });
      const tag = makeTag({ name: 'export-tag' });
      const res = await agent().get('/api/export');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.areas));
      assert.ok(Array.isArray(res.body.goals));
      assert.ok(Array.isArray(res.body.tasks));
      assert.ok(Array.isArray(res.body.tags));
      assert.ok(res.body.areas.some(a => a.name === 'Export Area'));
      assert.ok(res.body.goals.some(g => g.title === 'Export Goal'));
      assert.ok(res.body.tasks.some(t => t.title === 'Export Task'));
      assert.ok(res.body.tags.some(t => t.name === 'export-tag'));
    });
  });

  // ── Areas Edge Cases ──────────────────────────────────────────

  describe('Areas Edge Cases', () => {
    it('GET /api/areas enriched with goal_count, pending_tasks, total_tasks, done_tasks', async () => {
      const a = makeArea({ name: 'Enriched Area' });
      const g = makeGoal(a.id);
      makeTask(g.id, { status: 'todo' });
      makeTask(g.id, { status: 'done' });
      makeTask(g.id, { status: 'doing' });
      const res = await agent().get('/api/areas');
      assert.equal(res.status, 200);
      const area = res.body.find(x => x.name === 'Enriched Area');
      assert.ok(area);
      assert.equal(area.goal_count, 1);
      assert.equal(area.total_tasks, 3);
      assert.equal(area.done_tasks, 1);
      assert.equal(area.pending_tasks, 2); // todo + doing
    });

    it('POST /api/areas returns 400 for missing name', async () => {
      const res = await agent().post('/api/areas').send({ icon: '🎯' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /name/i);
    });
  });

  // ── Goals Edge Cases ──────────────────────────────────────────

  describe('Goals Edge Cases', () => {
    it('GET /api/goals returns all active goals with area_name and area_icon', async () => {
      const a = makeArea({ name: 'Goal Area', icon: '🎯' });
      makeGoal(a.id, { title: 'Active Goal', status: 'active' });
      makeGoal(a.id, { title: 'Archived Goal', status: 'archived' });
      const res = await agent().get('/api/goals');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const active = res.body.find(g => g.title === 'Active Goal');
      assert.ok(active);
      assert.equal(active.area_name, 'Goal Area');
      assert.equal(active.area_icon, '🎯');
      // Archived goals should not appear
      assert.ok(!res.body.find(g => g.title === 'Archived Goal'));
    });

    it('PUT /api/goals/:id can set due_date to null', async () => {
      const a = makeArea();
      const g = makeGoal(a.id, { due_date: '2025-12-31' });
      const res = await agent().put(`/api/goals/${g.id}`).send({ due_date: null });
      assert.equal(res.status, 200);
      assert.equal(res.body.due_date, null);
    });

    it('GET /api/goals/:goalId/tasks returns enriched tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Enriched Task' });
      makeSubtask(t.id, { title: 'Sub A', done: 1 });
      makeSubtask(t.id, { title: 'Sub B', done: 0 });
      const tag = makeTag({ name: 'enrich-tag' });
      linkTag(t.id, tag.id);
      const res = await agent().get(`/api/goals/${g.id}/tasks`);
      assert.equal(res.status, 200);
      const task = res.body.find(x => x.title === 'Enriched Task');
      assert.ok(task);
      assert.ok(Array.isArray(task.tags));
      assert.ok(task.tags.some(tg => tg.name === 'enrich-tag'));
      assert.ok(Array.isArray(task.subtasks));
      assert.equal(task.subtask_total, 2);
      assert.equal(task.subtask_done, 1);
      assert.ok(Array.isArray(task.blocked_by));
    });
  });

  // ── Tags Edge Cases ───────────────────────────────────────────

  describe('Tags Edge Cases', () => {
    it('POST /api/tags returns existing tag when duplicate name', async () => {
      const first = await agent().post('/api/tags').send({ name: 'dup-tag', color: '#FF0000' });
      assert.ok(first.body.id);
      const second = await agent().post('/api/tags').send({ name: 'dup-tag', color: '#00FF00' });
      assert.equal(second.status, 200);
      assert.equal(second.body.id, first.body.id);
      assert.equal(second.body.name, 'dup-tag');
    });

    it('PUT /api/tags/:id returns 409 for duplicate name', async () => {
      const t1 = await agent().post('/api/tags').send({ name: 'tag-one' });
      const t2 = await agent().post('/api/tags').send({ name: 'tag-two' });
      const res = await agent().put(`/api/tags/${t2.body.id}`).send({ name: 'tag-one' });
      assert.equal(res.status, 409);
      assert.match(res.body.error, /exists/i);
    });
  });

  // ── Task Enrichment ───────────────────────────────────────────

  describe('Task Enrichment', () => {
    it('GET /api/tasks/:id returns blocked_by array', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Blocker' });
      const t2 = makeTask(g.id, { title: 'Blocked' });
      const { db } = setup();
      db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(t2.id, t1.id);
      const res = await agent().get(`/api/tasks/${t2.id}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.blocked_by));
      assert.equal(res.body.blocked_by.length, 1);
      assert.equal(res.body.blocked_by[0].id, t1.id);
      assert.equal(res.body.blocked_by[0].title, 'Blocker');
    });

    it('GET /api/tasks/:id returns subtask_done and subtask_total counts', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id);
      makeSubtask(t.id, { title: 'Done Sub', done: 1 });
      makeSubtask(t.id, { title: 'Open Sub', done: 0 });
      makeSubtask(t.id, { title: 'Also Done', done: 1 });
      const res = await agent().get(`/api/tasks/${t.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.subtask_total, 3);
      assert.equal(res.body.subtask_done, 2);
    });

    it('GET /api/tasks/board enriched tasks include tags and subtasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Board Task' });
      makeSubtask(t.id, { title: 'Board Sub' });
      const tag = makeTag({ name: 'board-tag' });
      linkTag(t.id, tag.id);
      const res = await agent().get('/api/tasks/board');
      assert.equal(res.status, 200);
      const task = res.body.find(x => x.title === 'Board Task');
      assert.ok(task);
      assert.ok(Array.isArray(task.tags));
      assert.ok(task.tags.some(tg => tg.name === 'board-tag'));
      assert.ok(Array.isArray(task.subtasks));
      assert.equal(task.subtask_total, 1);
    });
  });
});
