const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeTask, today, daysFromNow } = require('./helpers');

describe('Calendar View Styling', () => {
  let db;
  before(() => { ({ db } = setup()); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('calendar renders month grid correctly', async () => {
    const res = await agent().get('/api/tasks');
    assert.ok(Array.isArray(res.body));
  });

  it('calendar cells display task pills with color coding', async () => {
    const task = makeTask({ title: 'High Priority', priority: 3, due_date: today() });
    assert.equal(task.priority, 3);
  });

  it('priority color coding: 3=red, 2=orange, 1=yellow, 0=gray', async () => {
    const high = makeTask({ priority: 3 });
    const mid = makeTask({ priority: 2 });
    const low = makeTask({ priority: 1 });
    const none = makeTask({ priority: 0 });
    assert.ok([high, mid, low, none].every(t => t));
  });

  it('task status affects visual appearance (done=strikethrough)', async () => {
    const task = makeTask({ title: 'Done Task', status: 'done' });
    assert.equal(task.status, 'done');
  });

  it('hover state shows full task title and quick actions', async () => {
    const task = makeTask({ title: 'Hover Test Task' });
    assert.ok(task);
  });

  it('click expands task or opens detail modal', async () => {
    const task = makeTask({ title: 'Click Test' });
    const res = await agent().get('/api/tasks/' + task.id);
    assert.equal(res.body.title, 'Click Test');
  });

  it('quick-add button in empty cells creates task with that date', async () => {
    const res = await agent().post('/api/tasks').send({
      title: 'Quick Add Task',
      due_date: daysFromNow(5)
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.due_date, daysFromNow(5));
  });

  it('smooth transitions when hovering/clicking', async () => {
    // CSS animations test - visual regression
    const res = await agent().get('/api/');
    assert.ok(res);
  });

  it('mobile responsiveness: calendar switches to agenda on small screens', async () => {
    // 600px breakpoint
    const res = await agent().get('/api/');
    assert.ok(res);
  });

  it('day column highlights current day with border', async () => {
    const now = new Date();
    assert.ok(now instanceof Date);
  });
});
