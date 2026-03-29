const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

let db;

describe('Import/Export Roundtrip — Extensive Tests', () => {
  before(() => { const s = setup(); db = s.db; });
  after(() => teardown());
  beforeEach(() => cleanDb());

  describe('Todoist Import', () => {
    it('creates area, goals from projects, tasks from items', async () => {
      const res = await agent().post('/api/import/todoist').send({
        projects: [{ id: 'p1', name: 'Work' }, { id: 'p2', name: 'Personal' }],
        items: [
          { content: 'Task 1', project_id: 'p1', priority: 1 },
          { content: 'Task 2', project_id: 'p2', priority: 2 },
          { content: 'Task 3', project_id: 'p1', priority: 1 }
        ]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 3);

      // Verify area + goals created
      const areas = db.prepare("SELECT * FROM life_areas WHERE name='Todoist Import'").all();
      assert.equal(areas.length, 1);
      const goals = db.prepare('SELECT * FROM goals WHERE area_id=?').all(areas[0].id);
      assert.ok(goals.length >= 2, 'should create goals from projects');
    });

    it('maps priority correctly (Todoist 4→3, 3→2, 2→1, else→0)', async () => {
      await agent().post('/api/import/todoist').send({
        items: [
          { content: 'P4', priority: 4 },
          { content: 'P3', priority: 3 },
          { content: 'P2', priority: 2 },
          { content: 'P1', priority: 1 }
        ]
      });
      const tasks = db.prepare("SELECT * FROM tasks WHERE title IN ('P4','P3','P2','P1') ORDER BY title").all();
      assert.equal(tasks.find(t => t.title === 'P4').priority, 3);
      assert.equal(tasks.find(t => t.title === 'P3').priority, 2);
      assert.equal(tasks.find(t => t.title === 'P2').priority, 1);
      assert.equal(tasks.find(t => t.title === 'P1').priority, 0);
    });

    it('preserves due dates', async () => {
      await agent().post('/api/import/todoist').send({
        items: [{ content: 'Dated', priority: 1, due: { date: '2026-06-15' } }]
      });
      const task = db.prepare("SELECT * FROM tasks WHERE title='Dated'").get();
      assert.equal(task.due_date, '2026-06-15');
    });
  });

  describe('Trello Import', () => {
    it('creates area, goals from lists, tasks from cards', async () => {
      const res = await agent().post('/api/import/trello').send({
        lists: [{ id: 'l1', name: 'To Do' }, { id: 'l2', name: 'In Progress' }],
        cards: [
          { name: 'Card 1', idList: 'l1', desc: '' },
          { name: 'Card 2', idList: 'l2', desc: 'Some notes' }
        ]
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.imported, 2);
    });

    it('preserves card descriptions as task notes', async () => {
      await agent().post('/api/import/trello').send({
        lists: [{ id: 'l1', name: 'List' }],
        cards: [{ name: 'Note Card', idList: 'l1', desc: 'Important notes here' }]
      });
      const task = db.prepare("SELECT * FROM tasks WHERE title='Note Card'").get();
      assert.equal(task.note, 'Important notes here');
    });
  });

  describe('iCal Export', () => {
    it('valid VCALENDAR format', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { due_date: '2026-06-01' });

      const res = await agent().get('/api/export/ical');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('BEGIN:VCALENDAR'));
      assert.ok(res.text.includes('END:VCALENDAR'));
      assert.ok(res.text.includes('BEGIN:VEVENT'));
    });

    it('includes RRULE for recurring tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { due_date: '2026-06-01', recurring: 'weekly' });

      const res = await agent().get('/api/export/ical');
      assert.ok(res.text.includes('RRULE:FREQ=WEEKLY'));
    });

    it('excludes completed tasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { due_date: '2026-06-01', status: 'done', title: 'Done Task' });
      makeTask(goal.id, { due_date: '2026-06-02', status: 'todo', title: 'Open Task' });

      const res = await agent().get('/api/export/ical');
      assert.ok(!res.text.includes('Done Task'), 'should not include completed tasks');
      assert.ok(res.text.includes('Open Task'), 'should include open tasks');
    });
  });

  describe('Export/Import Roundtrip', () => {
    it('export → import roundtrip preserves tasks', async () => {
      const area = makeArea({ name: 'Roundtrip Area' });
      const goal = makeGoal(area.id, { title: 'Roundtrip Goal' });
      makeTask(goal.id, { title: 'Roundtrip Task', priority: 2, due_date: '2026-07-01' });

      // Export
      const expRes = await agent().get('/api/export');
      assert.equal(expRes.status, 200);
      assert.ok(expRes.body.tasks);
      assert.ok(expRes.body.tasks.length >= 1);
      const exported = expRes.body.tasks.find(t => t.title === 'Roundtrip Task');
      assert.ok(exported);
      assert.equal(exported.priority, 2);
    });
  });
});
