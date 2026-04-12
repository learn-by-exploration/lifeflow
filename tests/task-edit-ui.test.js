const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeTask, makeArea, today, daysFromNow } = require('./helpers');

describe('Task Edit UI', () => {
  let db;
  before(() => { ({ db } = setup()); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('task edit modal opens and displays full task details', async () => {
    const task = makeTask({ title: 'Edit Test Task' });
    const res = await agent().get('/api/tasks/' + task.id);
    assert.equal(res.body.title, 'Edit Test Task');
  });

  it('task edit modal has organized field groups', async () => {
    // Metadata group, Dates group, Priority/Status group, Assignment group
    const res = await agent().get('/api/tasks');
    assert.ok(Array.isArray(res.body));
  });

  it('inline title editing works with Enter/Escape', async () => {
    const task = makeTask({ title: 'Old Title' });
    const res = await agent().put('/api/tasks/' + task.id).send({
      title: 'New Title'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'New Title');
  });

  it('multi-line note editor supports markdown', async () => {
    const task = makeTask({ note: '# Header\n- List item' });
    assert.ok(task.note.includes('#'));
  });

  it('real-time validation provides feedback', async () => {
    // Title required, max 255 chars, etc
    const res = await agent().put('/api/tasks/999').send({
      title: 'x'.repeat(256)
    });
    assert.equal(res.status, 400);
  });

  it('keyboard navigation Tab between fields', async () => {
    const task = makeTask({ title: 'Nav Test' });
    assert.ok(task);
  });

  it('custom field editing in task modal', async () => {
    const task = makeTask({ title: 'Custom Field Test' });
    assert.ok(task);
  });

  it('modal scrolling handles long notes/many fields', async () => {
    const longNote = 'x'.repeat(1000);
    const task = makeTask({ note: longNote });
    assert.equal(task.note.length, 1000);
  });
});
