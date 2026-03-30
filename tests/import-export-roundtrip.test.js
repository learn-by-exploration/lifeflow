const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeList, makeListItem, makeHabit, logHabit } = require('./helpers');

let db;

describe('Import/Export Roundtrip Fidelity', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── Full Roundtrip ─────────────────────────────────────────────────────────

  describe('Full roundtrip', () => {
    it('export → wipe → import → re-export preserves entity counts', async () => {
      // Create dataset
      const area = makeArea({ name: 'RT Area', icon: '🚀', color: '#FF0000' });
      const goal = makeGoal(area.id, { title: 'RT Goal' });
      const task = makeTask(goal.id, { title: 'RT Task', priority: 2 });
      const tag = makeTag({ name: 'rt-tag', color: '#ABCDEF' });
      linkTag(task.id, tag.id);
      makeSubtask(task.id, { title: 'RT Sub', done: 1, position: 0 });

      // Export
      const exp1 = await agent().get('/api/export').expect(200);
      assert.ok(exp1.body.areas.length >= 1);
      assert.ok(exp1.body.goals.length >= 1);
      assert.ok(exp1.body.tasks.length >= 1);
      assert.ok(exp1.body.tags.length >= 1);

      // Wipe + Import
      cleanDb();
      const importData = { confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body };
      const impRes = await agent().post('/api/import').send(importData).expect(200);
      assert.ok(impRes.body.ok);

      // Re-export
      const exp2 = await agent().get('/api/export').expect(200);
      assert.equal(exp2.body.areas.length, exp1.body.areas.length, 'area count preserved');
      assert.equal(exp2.body.goals.length, exp1.body.goals.length, 'goal count preserved');
      assert.equal(exp2.body.tasks.length, exp1.body.tasks.length, 'task count preserved');
      assert.equal(exp2.body.tags.length, exp1.body.tags.length, 'tag count preserved');
    });

    it('export includes all major entity types', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'T1' });

      const res = await agent().get('/api/export').expect(200);
      assert.ok('areas' in res.body);
      assert.ok('goals' in res.body);
      assert.ok('tasks' in res.body);
      assert.ok('tags' in res.body);
      assert.ok('habits' in res.body);
      assert.ok('lists' in res.body);
      assert.ok('list_items' in res.body);
      assert.ok('notes' in res.body);
      assert.ok('custom_field_defs' in res.body);
      assert.ok('settings' in res.body);
      assert.ok('exportDate' in res.body);
    });

    it('import without confirm returns 403', async () => {
      const res = await agent().post('/api/import').send({
        areas: [{ id: 1, name: 'A' }],
        goals: [{ id: 1, area_id: 1, title: 'G' }],
        tasks: [{ id: 1, goal_id: 1, title: 'T' }]
      });
      assert.equal(res.status, 403);
    });

    it('multiple-entity roundtrip preserves counts across all tables', async () => {
      const area = makeArea({ name: 'Multi Area' });
      const goal = makeGoal(area.id, { title: 'Multi Goal' });
      makeTask(goal.id, { title: 'Task A' });
      makeTask(goal.id, { title: 'Task B' });
      const list = makeList({ name: 'Grocery' });
      makeListItem(list.id, { title: 'Milk' });
      makeListItem(list.id, { title: 'Eggs' });
      const habit = makeHabit({ name: 'Exercise' });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);

      assert.equal(exp2.body.tasks.length, exp1.body.tasks.length);
      assert.equal(exp2.body.lists.length, exp1.body.lists.length);
      assert.equal(exp2.body.list_items.length, exp1.body.list_items.length);
      assert.equal(exp2.body.habits.length, exp1.body.habits.length);
    });
  });

  // ─── Per-entity Roundtrip ──────────────────────────────────────────────────

  describe('Per-entity field preservation', () => {
    it('area fields: name, icon, color, position preserved', async () => {
      const area = makeArea({ name: 'Health', icon: '❤️', color: '#E11D48', position: 5 });
      const goal = makeGoal(area.id, { title: 'Area Goal' });
      makeTask(goal.id, { title: 'Area Task' });
      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      const a = exp2.body.areas.find(a => a.name === 'Health');
      assert.ok(a, 'area found after roundtrip');
      assert.equal(a.icon, '❤️');
      assert.equal(a.color, '#E11D48');
      assert.equal(a.position, 5);
    });

    it('goal fields: title, description, status, due_date preserved', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { title: 'Ship MVP', description: 'Launch by Q2', status: 'active', due_date: '2026-06-30' });
      makeTask(goal.id, { title: 'Goal Task' });
      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      const g = exp2.body.goals.find(g => g.title === 'Ship MVP');
      assert.ok(g);
      assert.equal(g.description, 'Launch by Q2');
      assert.equal(g.status, 'active');
      assert.equal(g.due_date, '2026-06-30');
    });

    it('task fields: title, note, priority, status, due_date, recurring preserved', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, {
        title: 'Weekly Review', note: 'Check goals', priority: 3,
        status: 'doing', due_date: '2026-04-01', recurring: 'weekly'
      });
      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      const t = exp2.body.tasks.find(t => t.title === 'Weekly Review');
      assert.ok(t);
      assert.equal(t.note, 'Check goals');
      assert.equal(t.priority, 3);
      assert.equal(t.status, 'doing');
      assert.equal(t.due_date, '2026-04-01');
      assert.equal(t.recurring, 'weekly');
    });

    it('tags: name, color preserved', async () => {
      makeTag({ name: 'urgent', color: '#DC2626' });
      makeTag({ name: 'blocked', color: '#F97316' });
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Placeholder' });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      const urgent = exp2.body.tags.find(t => t.name === 'urgent');
      assert.ok(urgent);
      assert.equal(urgent.color, '#DC2626');
      const blocked = exp2.body.tags.find(t => t.name === 'blocked');
      assert.ok(blocked);
      assert.equal(blocked.color, '#F97316');
    });

    it('subtasks: title, done, position preserved', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'With Subs' });
      makeSubtask(task.id, { title: 'Step 1', done: 1, position: 0 });
      makeSubtask(task.id, { title: 'Step 2', done: 0, position: 1 });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      const t = exp2.body.tasks.find(t => t.title === 'With Subs');
      assert.ok(t);
      assert.equal(t.subtasks.length, 2);
      const s1 = t.subtasks.find(s => s.title === 'Step 1');
      assert.equal(s1.done, 1);
      const s2 = t.subtasks.find(s => s.title === 'Step 2');
      assert.equal(s2.done, 0);
    });

    it('habits: name, frequency preserved', async () => {
      makeHabit({ name: 'Meditate', frequency: 'daily', color: '#22C55E' });
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Filler' });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      const h = exp2.body.habits.find(h => h.name === 'Meditate');
      assert.ok(h);
      assert.equal(h.frequency, 'daily');
    });

    it('lists and list items preserved', async () => {
      const list = makeList({ name: 'Shopping', type: 'checklist' });
      makeListItem(list.id, { title: 'Bread', checked: 1, position: 0 });
      makeListItem(list.id, { title: 'Butter', checked: 0, position: 1 });
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Filler' });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);
      assert.equal(exp2.body.lists.length, 1);
      assert.equal(exp2.body.lists[0].name, 'Shopping');
      assert.equal(exp2.body.list_items.length, 2);
      const bread = exp2.body.list_items.find(i => i.title === 'Bread');
      assert.ok(bread);
      assert.equal(bread.checked, 1);
    });
  });

  // ─── ID Remapping ──────────────────────────────────────────────────────────

  describe('ID remapping', () => {
    it('tags get new IDs; task_tags use remapped IDs', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Tagged' });
      const tag = makeTag({ name: 'remap-tag' });
      linkTag(task.id, tag.id);
      const origTagId = tag.id;

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);

      // Tag exists with (potentially) new ID
      const newTag = exp2.body.tags.find(t => t.name === 'remap-tag');
      assert.ok(newTag);
      // Task still has the tag associated
      const t = exp2.body.tasks.find(t => t.title === 'Tagged');
      assert.ok(t.tags.length >= 1);
      assert.ok(t.tags.some(tg => tg.name === 'remap-tag'));
    });

    it('areas get new IDs; goals use remapped area_id', async () => {
      const area = makeArea({ name: 'Remap Area' });
      const origAreaId = area.id;
      makeGoal(area.id, { title: 'Remap Goal' });
      const filler = makeGoal(area.id, { title: 'Filler Goal' });
      makeTask(filler.id, { title: 'Filler Task' });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);

      const newArea = exp2.body.areas.find(a => a.name === 'Remap Area');
      assert.ok(newArea);
      // All goals should point to the new area
      const areaGoals = exp2.body.goals.filter(g => g.area_id === newArea.id);
      assert.ok(areaGoals.length >= 2, 'goals remapped to new area ID');
    });

    it('goals get new IDs; tasks use remapped goal_id', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id, { title: 'Goal for Remap' });
      makeTask(goal.id, { title: 'Remapped Task 1' });
      makeTask(goal.id, { title: 'Remapped Task 2' });

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);

      const newGoal = exp2.body.goals.find(g => g.title === 'Goal for Remap');
      assert.ok(newGoal);
      const goalTasks = exp2.body.tasks.filter(t => t.goal_id === newGoal.id);
      assert.equal(goalTasks.length, 2, 'tasks remapped to new goal ID');
    });

    it('custom field defs remapped; task_custom_values use new field IDs', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Custom Fields Task' });

      // Create custom field + value
      db.prepare('INSERT INTO custom_field_defs (name, field_type, position, user_id) VALUES (?,?,?,?)').run('Priority Level', 'text', 0, 1);
      const fieldId = db.prepare("SELECT id FROM custom_field_defs WHERE name='Priority Level'").get().id;
      db.prepare('INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?,?,?)').run(task.id, fieldId, 'Critical');

      const exp1 = await agent().get('/api/export').expect(200);
      cleanDb();
      await agent().post('/api/import').send({ confirm: 'DESTROY_ALL_DATA', password: 'testpassword', ...exp1.body }).expect(200);
      const exp2 = await agent().get('/api/export').expect(200);

      assert.equal(exp2.body.custom_field_defs.length, 1);
      assert.equal(exp2.body.custom_field_defs[0].name, 'Priority Level');
      assert.equal(exp2.body.task_custom_values.length, 1);
      assert.equal(exp2.body.task_custom_values[0].value, 'Critical');
      // field_id should match the new def ID
      assert.equal(exp2.body.task_custom_values[0].field_id, exp2.body.custom_field_defs[0].id);
    });
  });

  // ─── Corrupt Import Handling ───────────────────────────────────────────────

  describe('Corrupt import handling', () => {
    it('missing areas array → 400', async () => {
      const res = await agent().post('/api/import').send({
        confirm: 'DESTROY_ALL_DATA', password: 'testpassword',
        goals: [{ id: 1, area_id: 1, title: 'G' }],
        tasks: [{ id: 1, goal_id: 1, title: 'T' }]
      });
      assert.equal(res.status, 400);
    });

    it('empty areas array → 400', async () => {
      const res = await agent().post('/api/import').send({
        confirm: 'DESTROY_ALL_DATA', password: 'testpassword',
        areas: [],
        goals: [{ id: 1, area_id: 1, title: 'G' }],
        tasks: [{ id: 1, goal_id: 1, title: 'T' }]
      });
      assert.equal(res.status, 400);
    });

    it('missing goals array → 400', async () => {
      const res = await agent().post('/api/import').send({
        confirm: 'DESTROY_ALL_DATA', password: 'testpassword',
        areas: [{ id: 1, name: 'A' }],
        tasks: [{ id: 1, goal_id: 1, title: 'T' }]
      });
      assert.equal(res.status, 400);
    });

    it('missing tasks array → 400', async () => {
      const res = await agent().post('/api/import').send({
        confirm: 'DESTROY_ALL_DATA', password: 'testpassword',
        areas: [{ id: 1, name: 'A' }],
        goals: [{ id: 1, area_id: 1, title: 'G' }]
      });
      assert.equal(res.status, 400);
    });

    it('large payload (100 areas) → accepted', async () => {
      const areas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Area ${i + 1}` }));
      const goals = areas.map((a, i) => ({ id: i + 1, area_id: a.id, title: `Goal ${i + 1}` }));
      const tasks = goals.map((g, i) => ({ id: i + 1, goal_id: g.id, title: `Task ${i + 1}` }));
      const res = await agent().post('/api/import').send({
        confirm: 'DESTROY_ALL_DATA', password: 'testpassword', areas, goals, tasks
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
      // Verify data was imported
      const exp = await agent().get('/api/export').expect(200);
      assert.equal(exp.body.areas.length, 100);
    });

    it('extra unknown fields → ignored gracefully', async () => {
      const res = await agent().post('/api/import').send({
        confirm: 'DESTROY_ALL_DATA', password: 'testpassword',
        areas: [{ id: 1, name: 'A', unknownField: 'xyz' }],
        goals: [{ id: 1, area_id: 1, title: 'G', foo: 'bar' }],
        tasks: [{ id: 1, goal_id: 1, title: 'T', baz: 123 }],
        nonexistent_table: [{ id: 1 }]
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });
  });

  // ─── Todoist Import Additional ─────────────────────────────────────────────

  describe('Todoist import additional', () => {
    it('empty items → { imported: 0 }', async () => {
      const res = await agent().post('/api/import/todoist').send({
        projects: [{ id: 'p1', name: 'Empty Project' }],
        items: []
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 0);
    });

    it('no items field → { imported: 0 }', async () => {
      const res = await agent().post('/api/import/todoist').send({
        projects: [{ id: 'p1', name: 'No Items' }]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 0);
    });

    it('checked items → status done', async () => {
      const res = await agent().post('/api/import/todoist').send({
        items: [
          { content: 'Done Item', priority: 1, checked: true },
          { content: 'Open Item', priority: 1, checked: false }
        ]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 2);
      const done = db.prepare("SELECT * FROM tasks WHERE title='Done Item'").get();
      assert.equal(done.status, 'done');
      const open = db.prepare("SELECT * FROM tasks WHERE title='Open Item'").get();
      assert.equal(open.status, 'todo');
    });

    it('items without project_id go to default goal', async () => {
      const res = await agent().post('/api/import/todoist').send({
        projects: [{ id: 'p1', name: 'Proj1' }],
        items: [
          { content: 'Orphan Task', priority: 1 }
        ]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 1);
      const task = db.prepare("SELECT * FROM tasks WHERE title='Orphan Task'").get();
      assert.ok(task);
      // Verify it was assigned to the default "Imported Tasks" goal
      const goal = db.prepare('SELECT * FROM goals WHERE id=?').get(task.goal_id);
      assert.equal(goal.title, 'Imported Tasks');
    });
  });

  // ─── Trello Import Additional ──────────────────────────────────────────────

  describe('Trello import additional', () => {
    it('empty cards → { imported: 0 }', async () => {
      const res = await agent().post('/api/import/trello').send({
        lists: [{ id: 'l1', name: 'List' }],
        cards: []
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 0);
    });

    it('closed cards → status done', async () => {
      const res = await agent().post('/api/import/trello').send({
        lists: [{ id: 'l1', name: 'Done List' }],
        cards: [
          { name: 'Closed Card', idList: 'l1', desc: '', closed: true },
          { name: 'Open Card', idList: 'l1', desc: '', closed: false }
        ]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 2);
      const closed = db.prepare("SELECT * FROM tasks WHERE title='Closed Card'").get();
      assert.equal(closed.status, 'done');
      const open = db.prepare("SELECT * FROM tasks WHERE title='Open Card'").get();
      assert.equal(open.status, 'todo');
    });

    it('cards with due dates preserved', async () => {
      const res = await agent().post('/api/import/trello').send({
        lists: [{ id: 'l1', name: 'List' }],
        cards: [
          { name: 'Dated Card', idList: 'l1', desc: '', due: '2026-08-15T12:00:00.000Z' }
        ]
      });
      assert.equal(res.status, 200);
      const task = db.prepare("SELECT * FROM tasks WHERE title='Dated Card'").get();
      assert.equal(task.due_date, '2026-08-15');
    });
  });

  // ─── iCal Export Additional ────────────────────────────────────────────────

  describe('iCal export additional', () => {
    it('returns Content-Type text/calendar', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { due_date: '2026-06-01', title: 'Cal Task' });

      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.headers['content-type'].includes('text/calendar'));
    });

    it('tasks without due_date are excluded', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'No Date Task', due_date: null });
      makeTask(goal.id, { title: 'Has Date Task', due_date: '2026-07-01' });

      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(!res.text.includes('No Date Task'));
      assert.ok(res.text.includes('Has Date Task'));
    });

    it('high priority tasks get PRIORITY:1', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'High Prio', due_date: '2026-06-01', priority: 3 });

      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.text.includes('PRIORITY:1'));
    });

    it('medium priority tasks get PRIORITY:5', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Med Prio', due_date: '2026-06-01', priority: 1 });

      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.text.includes('PRIORITY:5'));
    });

    it('daily recurring tasks have RRULE:FREQ=DAILY', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Daily Recurring', due_date: '2026-06-01', recurring: 'daily' });

      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.text.includes('RRULE:FREQ=DAILY'));
    });
  });
});
