const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent, today, daysFromNow } = require('./helpers');

describe('Phase 7 - Search, Smart Planner, iCal Export', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── GLOBAL UNIFIED SEARCH ───
  describe('Global Search (FTS5)', () => {
    it('GET /api/search returns empty for no query', async () => {
      const res = await agent().get('/api/search').expect(200);
      assert.deepEqual(res.body, { results: [], query: '' });
    });

    it('GET /api/search finds tasks by title', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Buy groceries for dinner' });
      makeTask(g.id, { title: 'Read a book' });
      // Rebuild index
      const { db } = setup();
      db.exec('DELETE FROM search_index');
      db.prepare("INSERT INTO search_index (type,source_id,user_id,title,body,context) VALUES ('task',1,1,'Buy groceries for dinner','','')").run();
      db.prepare("INSERT INTO search_index (type,source_id,user_id,title,body,context) VALUES ('task',2,1,'Read a book','','')").run();
      const res = await agent().get('/api/search?q=groceries').expect(200);
      assert.ok(res.body.results.length >= 1);
      assert.ok(res.body.results[0].title.includes('groceries'));
    });

    it('GET /api/search returns grouped results with type', async () => {
      const { db } = setup();
      db.exec('DELETE FROM search_index');
      db.prepare("INSERT INTO search_index (type,source_id,user_id,title,body,context) VALUES ('task',1,1,'Deploy app','','')").run();
      db.prepare("INSERT INTO search_index (type,source_id,user_id,title,body,context) VALUES ('note',1,1,'Deploy instructions','How to deploy','')").run();
      const res = await agent().get('/api/search?q=deploy').expect(200);
      assert.ok(res.body.results.length === 2);
      const types = res.body.results.map(r => r.type);
      assert.ok(types.includes('task'));
      assert.ok(types.includes('note'));
    });

    it('GET /api/search respects limit', async () => {
      const { db } = setup();
      db.exec('DELETE FROM search_index');
      for (let i = 0; i < 5; i++) {
        db.prepare("INSERT INTO search_index (type,source_id,user_id,title,body,context) VALUES ('task',?,1,?,'','')").run(i, `Test task ${i}`);
      }
      const res = await agent().get('/api/search?q=test&limit=2').expect(200);
      assert.ok(res.body.results.length <= 2);
    });

    it('GET /api/search handles special characters safely', async () => {
      const res = await agent().get('/api/search?q=test" OR 1=1--').expect(200);
      assert.ok(Array.isArray(res.body.results));
    });
  });

  // ─── ICAL EXPORT ───
  describe('iCal Export', () => {
    it('GET /api/export/ical returns valid iCal with tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Task with date', due_date: '2025-03-15' });
      makeTask(g.id, { title: 'No date task' }); // should be excluded
      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.headers['content-type'].includes('text/calendar'));
      assert.ok(res.text.includes('BEGIN:VCALENDAR'));
      assert.ok(res.text.includes('END:VCALENDAR'));
      assert.ok(res.text.includes('Task with date'));
      assert.ok(!res.text.includes('No date task'));
    });

    it('GET /api/export/ical includes RRULE for recurring tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Daily standup', due_date: '2025-03-15', recurring: 'daily' });
      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.text.includes('RRULE:FREQ=DAILY'));
    });

    it('GET /api/export/ical excludes done tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Done task', due_date: '2025-03-15', status: 'done' });
      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(!res.text.includes('Done task'));
    });

    it('GET /api/export/ical sets priority for high-priority tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Urgent task', due_date: '2025-03-15', priority: 3 });
      const res = await agent().get('/api/export/ical').expect(200);
      assert.ok(res.text.includes('PRIORITY:1'));
    });
  });

  // ─── SMART DAY PLANNING ───
  describe('Smart Day Planning', () => {
    it('GET /api/planner/smart returns suggested tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Overdue task', due_date: daysFromNow(-2), priority: 3 });
      makeTask(g.id, { title: 'Normal task', priority: 0 });
      const res = await agent().get('/api/planner/smart').expect(200);
      assert.ok(Array.isArray(res.body.suggested));
      assert.ok(typeof res.body.total_minutes === 'number');
      assert.ok(typeof res.body.max_minutes === 'number');
    });

    it('GET /api/planner/smart scores overdue tasks higher', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Overdue', due_date: daysFromNow(-5), priority: 0 });
      makeTask(g.id, { title: 'Future', due_date: daysFromNow(30), priority: 0 });
      const res = await agent().get('/api/planner/smart').expect(200);
      if (res.body.suggested.length >= 2) {
        assert.equal(res.body.suggested[0].title, 'Overdue');
      }
    });

    it('GET /api/planner/smart respects max_minutes', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      // default estimated_minutes=null, algorithm treats as 30min
      for (let i = 0; i < 5; i++) {
        makeTask(g.id, { title: `Task ${i}` });
      }
      // max 60 = room for 2 tasks at 30min each
      const res = await agent().get('/api/planner/smart?max_minutes=60').expect(200);
      assert.ok(res.body.total_minutes <= 60);
      assert.ok(res.body.suggested.length <= 2);
    });

    it('GET /api/planner/smart excludes my_day tasks', async () => {
      const a = makeArea();
      const g = makeGoal(a.id);
      makeTask(g.id, { title: 'Already planned', my_day: 1, priority: 3 });
      makeTask(g.id, { title: 'Not planned', priority: 0 });
      const res = await agent().get('/api/planner/smart').expect(200);
      const titles = res.body.suggested.map(t => t.title);
      assert.ok(!titles.includes('Already planned'));
    });
  });
});
