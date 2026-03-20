const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, makeSubtask, linkTag, makeFocus, agent } = require('./helpers');

describe('Import API', () => {
  beforeEach(() => cleanDb());

  it('imports areas, goals, tasks, and tags', async () => {
    const data = {
      areas: [{ id: 1, name: 'Health', icon: '💪', color: '#FF0000', position: 0 }],
      goals: [{ id: 1, area_id: 1, title: 'Get Fit', description: 'Lose weight', color: '#6C63FF', status: 'active', position: 0 }],
      tasks: [{ id: 1, goal_id: 1, title: 'Run 5K', notes: '', status: 'todo', priority: 2, due_date: null, my_day: 0, position: 0, recurring: null, completed_at: null, subtasks: [], tags: [] }],
      tags: [{ id: 1, name: 'exercise', color: '#22C55E' }]
    };
    const res = await agent().post('/api/import').send(data).expect(200);
    assert.equal(res.body.ok, true);

    // Verify data was imported
    const areas = await agent().get('/api/areas').expect(200);
    assert.equal(areas.body.length, 1);
    assert.equal(areas.body[0].name, 'Health');

    const tags = await agent().get('/api/tags').expect(200);
    assert.equal(tags.body.length, 1);
    assert.equal(tags.body[0].name, 'exercise');
  });

  it('replaces existing data on import', async () => {
    makeArea({ name: 'Old Area' });
    const data = {
      areas: [{ id: 1, name: 'New Area', icon: '🌟', color: '#0000FF', position: 0 }],
      goals: [{ id: 1, area_id: 1, title: 'New Goal', color: '#6C63FF', status: 'active', position: 0 }],
      tasks: [],
      tags: []
    };
    await agent().post('/api/import').send(data).expect(200);
    const areas = await agent().get('/api/areas').expect(200);
    assert.equal(areas.body.length, 1);
    assert.equal(areas.body[0].name, 'New Area');
  });

  it('imports tasks with subtasks and tags', async () => {
    const data = {
      areas: [{ id: 1, name: 'Work', icon: '💼', color: '#2563EB', position: 0 }],
      goals: [{ id: 1, area_id: 1, title: 'Project X', color: '#6C63FF', status: 'active', position: 0 }],
      tasks: [{
        id: 1, goal_id: 1, title: 'Design API', notes: 'REST design', status: 'todo', priority: 1,
        due_date: null, my_day: 0, position: 0, recurring: null, completed_at: null,
        subtasks: [{ title: 'Schema', done: 0, position: 0 }, { title: 'Routes', done: 1, position: 1 }],
        tags: [{ id: 1 }]
      }],
      tags: [{ id: 1, name: 'api', color: '#7C3AED' }]
    };
    await agent().post('/api/import').send(data).expect(200);

    const areas = await agent().get('/api/areas').expect(200);
    const goals = await agent().get('/api/areas/' + areas.body[0].id + '/goals').expect(200);
    const tasks = await agent().get('/api/goals/' + goals.body[0].id + '/tasks').expect(200);
    assert.equal(tasks.body.length, 1);
    assert.equal(tasks.body[0].subtasks.length, 2);
    assert.equal(tasks.body[0].tags.length, 1);
    assert.equal(tasks.body[0].tags[0].name, 'api');
  });

  it('returns 400 for invalid import data', async () => {
    await agent().post('/api/import').send({ bad: true }).expect(400);
    await agent().post('/api/import').send({ areas: [] }).expect(400);
  });

  it('skips orphan goals/tasks with missing parent IDs', async () => {
    const data = {
      areas: [{ id: 1, name: 'Area', icon: '📂', color: '#2563EB', position: 0 }],
      goals: [
        { id: 1, area_id: 1, title: 'Valid Goal', color: '#6C63FF', status: 'active', position: 0 },
        { id: 2, area_id: 999, title: 'Orphan Goal', color: '#6C63FF', status: 'active', position: 0 }
      ],
      tasks: [
        { id: 1, goal_id: 1, title: 'Valid Task', status: 'todo', priority: 0, subtasks: [], tags: [] },
        { id: 2, goal_id: 999, title: 'Orphan Task', status: 'todo', priority: 0, subtasks: [], tags: [] }
      ],
      tags: []
    };
    await agent().post('/api/import').send(data).expect(200);
    const areas = await agent().get('/api/areas').expect(200);
    const goals = await agent().get('/api/areas/' + areas.body[0].id + '/goals').expect(200);
    assert.equal(goals.body.length, 1);
    assert.equal(goals.body[0].title, 'Valid Goal');
  });
});

describe('Tag Management API', () => {
  beforeEach(() => cleanDb());

  describe('PUT /api/tags/:id', () => {
    it('renames a tag', async () => {
      const tag = makeTag({ name: 'old-name', color: '#FF0000' });
      const res = await agent().put('/api/tags/' + tag.id).send({ name: 'new-name' }).expect(200);
      assert.equal(res.body.name, 'new-name');
      assert.equal(res.body.color, '#FF0000'); // color unchanged
    });

    it('recolors a tag', async () => {
      const tag = makeTag({ name: 'test', color: '#FF0000' });
      const res = await agent().put('/api/tags/' + tag.id).send({ color: '#00FF00' }).expect(200);
      assert.equal(res.body.color, '#00FF00');
      assert.equal(res.body.name, 'test');
    });

    it('renames and recolors at the same time', async () => {
      const tag = makeTag({ name: 'old', color: '#000' });
      const res = await agent().put('/api/tags/' + tag.id).send({ name: 'new', color: '#FFF' }).expect(200);
      assert.equal(res.body.name, 'new');
      assert.equal(res.body.color, '#FFF');
    });

    it('returns 404 for nonexistent tag', async () => {
      await agent().put('/api/tags/9999').send({ name: 'x' }).expect(404);
    });

    it('returns 400 for invalid ID', async () => {
      await agent().put('/api/tags/abc').send({ name: 'x' }).expect(400);
    });

    it('returns 409 for duplicate name', async () => {
      makeTag({ name: 'alpha' });
      const t2 = makeTag({ name: 'beta' });
      await agent().put('/api/tags/' + t2.id).send({ name: 'alpha' }).expect(409);
    });

    it('sanitizes name to lowercase', async () => {
      const tag = makeTag({ name: 'test' });
      const res = await agent().put('/api/tags/' + tag.id).send({ name: 'Hello World' }).expect(200);
      assert.equal(res.body.name, 'hello world');
    });
  });

  describe('GET /api/tags/stats', () => {
    it('returns tags with usage counts', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag = makeTag({ name: 'urgent' });
      linkTag(task.id, tag.id);
      const unused = makeTag({ name: 'unused' });

      const res = await agent().get('/api/tags/stats').expect(200);
      assert.ok(Array.isArray(res.body));
      const urgentTag = res.body.find(t => t.name === 'urgent');
      const unusedTag = res.body.find(t => t.name === 'unused');
      assert.equal(urgentTag.usage_count, 1);
      assert.equal(unusedTag.usage_count, 0);
    });

    it('returns empty array when no tags', async () => {
      const res = await agent().get('/api/tags/stats').expect(200);
      assert.deepEqual(res.body, []);
    });
  });
});

describe('Focus History API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/focus/history', () => {
    it('returns paginated focus sessions with task info', async () => {
      const area = makeArea({ name: 'Work' });
      const goal = makeGoal(area.id, { title: 'Project' });
      const task = makeTask(goal.id, { title: 'Coding' });
      makeFocus(task.id, { duration_sec: 1500 });
      makeFocus(task.id, { duration_sec: 900 });

      const res = await agent().get('/api/focus/history').expect(200);
      assert.equal(res.body.total, 2);
      assert.equal(res.body.items.length, 2);
      assert.equal(res.body.items[0].task_title, 'Coding');
      assert.equal(res.body.items[0].goal_title, 'Project');
      assert.equal(res.body.items[0].area_name, 'Work');
      assert.ok(Array.isArray(res.body.daily));
    });

    it('returns empty results when no sessions', async () => {
      const res = await agent().get('/api/focus/history').expect(200);
      assert.equal(res.body.total, 0);
      assert.equal(res.body.items.length, 0);
    });

    it('supports pagination', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      for (let i = 0; i < 5; i++) makeFocus(task.id, { duration_sec: 100 * (i + 1) });

      const res = await agent().get('/api/focus/history?page=1&limit=2').expect(200);
      assert.equal(res.body.items.length, 2);
      assert.equal(res.body.total, 5);
      assert.equal(res.body.pages, 3);
    });
  });
});
