const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, makeArea, makeGoal, agent } = require('./helpers');

describe('Templates API', () => {
  beforeEach(() => cleanDb());

  it('GET /api/templates returns empty array initially', async () => {
    const res = await agent().get('/api/templates').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('POST /api/templates creates a template', async () => {
    const res = await agent().post('/api/templates').send({
      name: 'Sprint Planning',
      description: 'Agile sprint checklist',
      icon: '🏃',
      tasks: [
        { title: 'Review retro', priority: 1, subtasks: [] },
        { title: 'Groom backlog', priority: 2, subtasks: ['Clarify criteria', 'Estimate'] }
      ]
    }).expect(200);
    assert.ok(res.body.id);
    assert.equal(res.body.name, 'Sprint Planning');
    assert.equal(res.body.tasks.length, 2);
    assert.equal(res.body.tasks[1].subtasks.length, 2);
  });

  it('POST /api/templates rejects empty name', async () => {
    await agent().post('/api/templates').send({
      name: '',
      tasks: [{ title: 'Task 1' }]
    }).expect(400);
  });

  it('POST /api/templates rejects empty tasks array', async () => {
    await agent().post('/api/templates').send({
      name: 'Empty',
      tasks: []
    }).expect(400);
  });

  it('GET /api/templates lists created templates', async () => {
    await agent().post('/api/templates').send({
      name: 'Template A', tasks: [{ title: 'T1' }]
    });
    await agent().post('/api/templates').send({
      name: 'Template B', tasks: [{ title: 'T2' }, { title: 'T3' }]
    });
    const res = await agent().get('/api/templates').expect(200);
    assert.ok(res.body.length >= 2);
    const names = res.body.map(t => t.name);
    assert.ok(names.includes('Template A'));
    assert.ok(names.includes('Template B'));
  });

  it('DELETE /api/templates/:id deletes a template', async () => {
    const cr = await agent().post('/api/templates').send({
      name: 'To Delete', tasks: [{ title: 'T1' }]
    });
    await agent().delete('/api/templates/' + cr.body.id).expect(200);
    const res = await agent().get('/api/templates').expect(200);
    assert.ok(!res.body.find(t => t.name === 'To Delete'));
  });

  it('POST /api/templates/:id/apply creates tasks in goal', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const cr = await agent().post('/api/templates').send({
      name: 'Apply Test',
      tasks: [
        { title: 'Task 1', priority: 2, subtasks: [] },
        { title: 'Task 2', priority: 1, subtasks: ['Sub A', 'Sub B'] },
        { title: 'Task 3', priority: 0, subtasks: [] }
      ]
    });
    const res = await agent().post('/api/templates/' + cr.body.id + '/apply').send({
      goalId: g.id
    }).expect(200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.created.length, 3);
    // Verify tasks exist in goal
    const tasks = await agent().get('/api/goals/' + g.id + '/tasks').expect(200);
    assert.equal(tasks.body.length, 3);
    assert.equal(tasks.body[0].title, 'Task 1');
    assert.equal(tasks.body[0].priority, 2);
  });

  it('POST /api/templates/:id/apply creates subtasks', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    const cr = await agent().post('/api/templates').send({
      name: 'Subtask Test',
      tasks: [{ title: 'Parent', subtasks: ['Child 1', 'Child 2', 'Child 3'] }]
    });
    const res = await agent().post('/api/templates/' + cr.body.id + '/apply').send({
      goalId: g.id
    }).expect(200);
    const taskId = res.body.created[0].id;
    const subs = await agent().get('/api/tasks/' + taskId + '/subtasks').expect(200);
    assert.equal(subs.body.length, 3);
    assert.equal(subs.body[0].title, 'Child 1');
    assert.equal(subs.body[2].title, 'Child 3');
  });

  it('POST /api/templates/:id/apply rejects invalid goalId', async () => {
    const cr = await agent().post('/api/templates').send({
      name: 'Bad Goal', tasks: [{ title: 'T1' }]
    });
    await agent().post('/api/templates/' + cr.body.id + '/apply').send({
      goalId: 'abc'
    }).expect(400);
  });

  it('POST /api/templates/:id/apply returns 404 for missing template', async () => {
    const a = makeArea(); const g = makeGoal(a.id);
    await agent().post('/api/templates/99999/apply').send({
      goalId: g.id
    }).expect(404);
  });

  it('sanitizes task titles and limits length', async () => {
    const longTitle = 'A'.repeat(600);
    const res = await agent().post('/api/templates').send({
      name: 'Sanitize Test',
      tasks: [{ title: longTitle, priority: 99 }]
    }).expect(200);
    assert.ok(res.body.tasks[0].title.length <= 500);
    assert.equal(res.body.tasks[0].priority, 0); // invalid priority -> 0
  });
});

after(() => teardown());
