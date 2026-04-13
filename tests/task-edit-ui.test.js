const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');

describe('Task Edit UI', () => {
  before(() => { setup(); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('task edit source includes grouped sections and note editor improvements', () => {
    assert.ok(appJs.includes('function enhanceTaskEditUI()'));
    assert.ok(appJs.includes("title:'Core Details'"));
    assert.ok(appJs.includes("title:'Schedule & Priority'"));
    assert.ok(appJs.includes("title:'Execution Breakdown'"));
    assert.ok(appJs.includes('dp-note-editor'));
    assert.ok(stylesCss.includes('.dp-group-title'));
  });

  it('task title validation checks required and max length', () => {
    assert.ok(appJs.includes('Title is required'));
    assert.ok(appJs.includes('255 characters or fewer'));
    assert.ok(appJs.includes('Task title is too long (max 255 chars)'));
  });

  it('task update endpoint still supports title and note edits', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Old Title', note: 'Old note' });
    const res = await agent().put('/api/tasks/' + task.id).send({
      title: 'New Title',
      note: '# Heading\n- item'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'New Title');
    assert.ok(res.body.note.includes('# Heading'));
  });
});
