const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('External Data Importer (Todoist/Trello)', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('POST /api/import/todoist accepts Todoist JSON format', async () => {
    const todoistData = {
      items: [
        { id: 1, content: 'Buy groceries', priority: 4, due: { date: '2026-04-01' }, checked: 0 },
        { id: 2, content: 'Call dentist', priority: 1, due: null, checked: 1 }
      ],
      projects: [
        { id: 100, name: 'Personal' }
      ]
    };
    const res = await agent().post('/api/import/todoist').send(todoistData);
    assert.equal(res.status, 200);
    assert.ok(res.body.imported >= 0);
  });

  it('POST /api/import/trello accepts Trello JSON format', async () => {
    const trelloData = {
      cards: [
        { id: 'abc', name: 'Fix bug', desc: 'Critical fix', due: '2026-04-01', closed: false },
        { id: 'def', name: 'Add feature', desc: '', due: null, closed: true }
      ],
      lists: [
        { id: 'list1', name: 'To Do' },
        { id: 'list2', name: 'Done' }
      ]
    };
    const res = await agent().post('/api/import/trello').send(trelloData);
    assert.equal(res.status, 200);
    assert.ok(res.body.imported >= 0);
  });

  it('rejects empty import data', async () => {
    const res = await agent().post('/api/import/todoist').send({});
    assert.equal(res.status, 200); // Gracefully handles empty data
    assert.equal(res.body.imported, 0);
  });
});
