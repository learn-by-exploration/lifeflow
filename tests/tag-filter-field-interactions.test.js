const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

let db;

describe('Tag/Filter/Custom-Field Interactions', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── 1. Filter by tag ───

  describe('Filter by tag', () => {
    it('filter execute by tag_id returns only tagged tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Tagged task' });
      const t2 = makeTask(g.id, { title: 'Untagged task' });
      const tag = makeTag({ name: 'focus' });
      linkTag(t1.id, tag.id);

      const res = await agent().get(`/api/filters/execute?tag_id=${tag.id}`).expect(200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Tagged task');
    });

    it('filter execute with multiple tags returns tasks matching either', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Task A' });
      const t2 = makeTask(g.id, { title: 'Task B' });
      const t3 = makeTask(g.id, { title: 'Task C' });
      const tagA = makeTag({ name: 'alpha' });
      const tagB = makeTag({ name: 'beta' });
      linkTag(t1.id, tagA.id);
      linkTag(t2.id, tagB.id);
      // t3 has no tags

      // Filter by tagA
      const resA = await agent().get(`/api/filters/execute?tag_id=${tagA.id}`).expect(200);
      assert.equal(resA.body.length, 1);
      assert.equal(resA.body[0].title, 'Task A');

      // Filter by tagB
      const resB = await agent().get(`/api/filters/execute?tag_id=${tagB.id}`).expect(200);
      assert.equal(resB.body.length, 1);
      assert.equal(resB.body[0].title, 'Task B');
    });

    it('deleting a tag removes it from task_tags', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'T1' });
      const tag = makeTag({ name: 'deleteme' });
      linkTag(t1.id, tag.id);

      // Verify tag link exists
      const before = db.prepare('SELECT COUNT(*) as c FROM task_tags WHERE tag_id=?').get(tag.id);
      assert.equal(before.c, 1);

      // Delete tag via API
      await agent().delete(`/api/tags/${tag.id}`).expect(200);

      // task_tags cascade deleted
      const after = db.prepare('SELECT COUNT(*) as c FROM task_tags WHERE tag_id=?').get(tag.id);
      assert.equal(after.c, 0);
    });

    it('renaming a tag does not break filter-by-tag', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'My task' });
      const tag = makeTag({ name: 'old-name' });
      linkTag(t1.id, tag.id);

      // Rename the tag
      await agent().put(`/api/tags/${tag.id}`).send({ name: 'new-name' }).expect(200);

      // Filter by tag_id still works
      const res = await agent().get(`/api/filters/execute?tag_id=${tag.id}`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'My task');
    });

    it('tag filter combined with status filter', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Todo tagged', status: 'todo' });
      const t2 = makeTask(g.id, { title: 'Done tagged', status: 'done' });
      const t3 = makeTask(g.id, { title: 'Todo untagged', status: 'todo' });
      const tag = makeTag({ name: 'combined' });
      linkTag(t1.id, tag.id);
      linkTag(t2.id, tag.id);

      const res = await agent().get(`/api/filters/execute?tag_id=${tag.id}&status=todo`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Todo tagged');
    });
  });

  // ─── 2. Smart filters ───

  describe('Smart filters', () => {
    it('smart/stale returns tasks older than threshold', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      db.prepare("INSERT INTO tasks (goal_id,title,status,created_at,user_id) VALUES (?,'Stale task','todo',datetime('now','-14 days'),1)").run(g.id);
      makeTask(g.id, { title: 'Fresh task' });

      const res = await agent().get('/api/filters/smart/stale').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some(t => t.title === 'Stale task'));
      assert.ok(!res.body.some(t => t.title === 'Fresh task'));
    });

    it('smart/quickwins returns quick tasks only', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      db.prepare("INSERT INTO tasks (goal_id,title,status,estimated_minutes,user_id) VALUES (?,'Quick','todo',5,1)").run(g.id);
      db.prepare("INSERT INTO tasks (goal_id,title,status,estimated_minutes,user_id) VALUES (?,'Slow','todo',120,1)").run(g.id);

      const res = await agent().get('/api/filters/smart/quickwins').expect(200);
      assert.ok(res.body.some(t => t.title === 'Quick'));
      assert.ok(!res.body.some(t => t.title === 'Slow'));
    });

    it('smart/blocked returns blocked tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const blocker = makeTask(g.id, { title: 'Blocker', status: 'todo' });
      const blocked = makeTask(g.id, { title: 'Blocked task', status: 'todo' });
      db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(blocked.id, blocker.id);

      const res = await agent().get('/api/filters/smart/blocked').expect(200);
      assert.ok(res.body.some(t => t.title === 'Blocked task'));
      assert.ok(!res.body.some(t => t.title === 'Blocker'));
    });

    it('smart filter with 0 results returns empty array', async () => {
      // No tasks at all
      const res = await agent().get('/api/filters/smart/quickwins').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });

    it('unknown smart filter type returns 400', async () => {
      const res = await agent().get('/api/filters/smart/nonexistent').expect(400);
      assert.ok(res.body.error);
    });
  });

  // ─── 3. Custom field lifecycle ───

  describe('Custom field lifecycle', () => {
    it('create field → set value → update value → read back', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'CF task' });

      // Create a text field
      const fieldRes = await agent().post('/api/custom-fields')
        .send({ name: 'Sprint', field_type: 'text' }).expect(201);
      const fieldId = fieldRes.body.id;

      // Set value on task
      await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldId, value: 'Sprint 1' }] }).expect(200);

      // Read back
      let vals = await agent().get(`/api/tasks/${t.id}/custom-fields`).expect(200);
      assert.equal(vals.body.length, 1);
      assert.equal(vals.body[0].value, 'Sprint 1');
      assert.equal(vals.body[0].name, 'Sprint');

      // Update value
      await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldId, value: 'Sprint 2' }] }).expect(200);

      vals = await agent().get(`/api/tasks/${t.id}/custom-fields`).expect(200);
      assert.equal(vals.body[0].value, 'Sprint 2');
    });

    it('deleting field def cascades to task_custom_values', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'CF cascade' });

      const fieldRes = await agent().post('/api/custom-fields')
        .send({ name: 'Temp Field', field_type: 'text' }).expect(201);
      const fieldId = fieldRes.body.id;

      await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldId, value: 'some value' }] }).expect(200);

      // Delete field definition
      await agent().delete(`/api/custom-fields/${fieldId}`).expect(204);

      // Task custom values should be gone (CASCADE)
      const vals = db.prepare('SELECT COUNT(*) as c FROM task_custom_values WHERE field_id=?').get(fieldId);
      assert.equal(vals.c, 0);
    });

    it('number field rejects non-numeric value', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Num task' });

      const fieldRes = await agent().post('/api/custom-fields')
        .send({ name: 'Budget', field_type: 'number' }).expect(201);

      const res = await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldRes.body.id, value: 'not-a-number' }] });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('number'));
    });

    it('select field only accepts defined options', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Select task' });

      const fieldRes = await agent().post('/api/custom-fields')
        .send({ name: 'Priority Level', field_type: 'select', options: ['Low', 'Medium', 'High'] })
        .expect(201);

      // Valid option
      await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldRes.body.id, value: 'High' }] }).expect(200);

      // Invalid option
      const bad = await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldRes.body.id, value: 'Critical' }] });
      assert.equal(bad.status, 400);
      assert.ok(bad.body.error.includes('must be one of'));
    });

    it('date field rejects non-date value', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t = makeTask(g.id, { title: 'Date task' });

      const fieldRes = await agent().post('/api/custom-fields')
        .send({ name: 'Start Date', field_type: 'date' }).expect(201);

      const bad = await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldRes.body.id, value: 'tomorrow' }] });
      assert.equal(bad.status, 400);
      assert.ok(bad.body.error.includes('YYYY-MM-DD'));

      // Valid date
      await agent().put(`/api/tasks/${t.id}/custom-fields`)
        .send({ fields: [{ field_id: fieldRes.body.id, value: '2026-04-01' }] }).expect(200);
    });
  });

  // ─── 4. Tag stats accuracy ───

  describe('Tag stats accuracy', () => {
    it('GET /api/tags/stats returns correct usage count', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'T1' });
      const t2 = makeTask(g.id, { title: 'T2' });
      const tag = makeTag({ name: 'stat-tag' });
      linkTag(t1.id, tag.id);
      linkTag(t2.id, tag.id);

      const res = await agent().get('/api/tags/stats').expect(200);
      const entry = res.body.find(s => s.id === tag.id);
      assert.ok(entry);
      assert.equal(entry.usage_count, 2);
    });

    it('usage count updates when task is deleted', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'T1' });
      const t2 = makeTask(g.id, { title: 'T2' });
      const tag = makeTag({ name: 'del-tag' });
      linkTag(t1.id, tag.id);
      linkTag(t2.id, tag.id);

      // Delete one task
      await agent().delete(`/api/tasks/${t1.id}`).expect(200);

      const res = await agent().get('/api/tags/stats').expect(200);
      const entry = res.body.find(s => s.id === tag.id);
      assert.ok(entry);
      assert.equal(entry.usage_count, 1);
    });

    it('tag with 0 usage shows count=0', async () => {
      const tag = makeTag({ name: 'unused-tag' });

      const res = await agent().get('/api/tags/stats').expect(200);
      const entry = res.body.find(s => s.id === tag.id);
      assert.ok(entry);
      assert.equal(entry.usage_count, 0);
    });

    it('removing all tag links via setTaskTags updates stats', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'T1' });
      const tag = makeTag({ name: 'unlink-tag' });
      linkTag(t1.id, tag.id);

      // Verify usage = 1
      let res = await agent().get('/api/tags/stats').expect(200);
      assert.equal(res.body.find(s => s.id === tag.id).usage_count, 1);

      // Clear tags on task
      await agent().put(`/api/tasks/${t1.id}/tags`).send({ tagIds: [] }).expect(200);

      res = await agent().get('/api/tags/stats').expect(200);
      assert.equal(res.body.find(s => s.id === tag.id).usage_count, 0);
    });
  });

  // ─── 5. Saved filter lifecycle ───

  describe('Saved filter lifecycle', () => {
    it('create → list → update → delete', async () => {
      // Create
      const cr = await agent().post('/api/filters').send({
        name: 'High Priority', filters: { priority: 3 }
      }).expect(201);
      assert.ok(cr.body.id);
      assert.equal(cr.body.name, 'High Priority');

      // List
      const list = await agent().get('/api/filters').expect(200);
      assert.ok(list.body.some(f => f.id === cr.body.id));

      // Update
      const up = await agent().put(`/api/filters/${cr.body.id}`).send({
        name: 'Urgent Items'
      }).expect(200);
      assert.equal(up.body.name, 'Urgent Items');

      // Delete
      await agent().delete(`/api/filters/${cr.body.id}`).expect(200);

      // Verify deleted
      const list2 = await agent().get('/api/filters').expect(200);
      assert.ok(!list2.body.some(f => f.id === cr.body.id));
    });

    it('saved filter with complex criteria', async () => {
      const a = makeArea();
      const res = await agent().post('/api/filters').send({
        name: 'Complex Filter',
        icon: '🎯',
        color: '#FF5733',
        filters: { area_id: a.id, status: 'todo', priority: 2 }
      }).expect(201);

      assert.equal(res.body.name, 'Complex Filter');
      assert.equal(res.body.icon, '🎯');
      assert.equal(res.body.color, '#FF5733');
      const parsed = JSON.parse(res.body.filters);
      assert.equal(parsed.status, 'todo');
      assert.equal(parsed.priority, 2);
    });

    it('filter execute with saved filter criteria returns matching tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'High todo', status: 'todo', priority: 3 });
      makeTask(g.id, { title: 'Low todo', status: 'todo', priority: 1 });
      makeTask(g.id, { title: 'High done', status: 'done', priority: 3 });

      // Execute as ad-hoc filter
      const res = await agent().get('/api/filters/execute?status=todo&priority=3').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'High todo');
    });

    it('deleted filter no longer appears in list', async () => {
      const cr = await agent().post('/api/filters').send({
        name: 'Ephemeral', filters: { status: 'doing' }
      }).expect(201);

      await agent().delete(`/api/filters/${cr.body.id}`).expect(200);

      const list = await agent().get('/api/filters').expect(200);
      assert.ok(!list.body.some(f => f.id === cr.body.id));
    });

    it('filter execute with no matches returns empty array', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'A task', status: 'todo', priority: 0 });

      // Filter for priority 3 — no match
      const res = await agent().get('/api/filters/execute?priority=3').expect(200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 0);
    });
  });

  // ─── 6. Cross-entity filters ───

  describe('Cross-entity filters', () => {
    it('filter by area_id + priority', async () => {
      const a1 = makeArea({ name: 'Work' });
      const a2 = makeArea({ name: 'Home' });
      const g1 = makeGoal(a1.id);
      const g2 = makeGoal(a2.id);
      makeTask(g1.id, { title: 'Work P3', priority: 3 });
      makeTask(g1.id, { title: 'Work P1', priority: 1 });
      makeTask(g2.id, { title: 'Home P3', priority: 3 });

      const res = await agent().get(`/api/filters/execute?area_id=${a1.id}&priority=3`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Work P3');
    });

    it('filter by tag + status', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      const t1 = makeTask(g.id, { title: 'Tag+todo', status: 'todo' });
      const t2 = makeTask(g.id, { title: 'Tag+done', status: 'done' });
      const t3 = makeTask(g.id, { title: 'NoTag+todo', status: 'todo' });
      const tag = makeTag({ name: 'cross-tag' });
      linkTag(t1.id, tag.id);
      linkTag(t2.id, tag.id);

      const res = await agent().get(`/api/filters/execute?tag_id=${tag.id}&status=todo`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Tag+todo');
    });

    it('filter by due=overdue returns only overdue incomplete tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Overdue task', due_date: daysFromNow(-5), status: 'todo' });
      makeTask(g.id, { title: 'Future task', due_date: daysFromNow(5), status: 'todo' });
      makeTask(g.id, { title: 'Done overdue', due_date: daysFromNow(-3), status: 'done' });

      const res = await agent().get('/api/filters/execute?due=overdue').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Overdue task');
    });

    it('filter by goal_id returns only tasks in that goal', async () => {
      const a = makeArea();
      const g1 = makeGoal(a.id, { title: 'Goal A' });
      const g2 = makeGoal(a.id, { title: 'Goal B' });
      makeTask(g1.id, { title: 'In Goal A' });
      makeTask(g2.id, { title: 'In Goal B' });

      const res = await agent().get(`/api/filters/execute?goal_id=${g1.id}`).expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'In Goal A');
    });

    it('filter by my_day returns flagged tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'My day task', my_day: 1 });
      makeTask(g.id, { title: 'Normal task', my_day: 0 });

      const res = await agent().get('/api/filters/execute?my_day=1').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'My day task');
    });

    it('filter by due=none returns tasks without due date', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Has date', due_date: today() });
      makeTask(g.id, { title: 'No date' });

      const res = await agent().get('/api/filters/execute?due=none').expect(200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'No date');
    });
  });
});
