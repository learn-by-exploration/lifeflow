const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, today } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');

describe('Daily Reflection UI', () => {
  before(() => { setup(); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('daily reflection wizard exposes 3-step structure with progress bar', () => {
    assert.ok(indexHtml.includes('id="dr-ov"'));
    assert.ok(indexHtml.includes('data-step="1"'));
    assert.ok(indexHtml.includes('data-step="2"'));
    assert.ok(indexHtml.includes('data-step="3"'));
    assert.ok(indexHtml.includes('id="dr-progress-bar"'));
    assert.ok(stylesCss.includes('.dr-progress'));
  });

  it('step-2 planning and step-3 priorities controls are rendered in app source', () => {
    assert.ok(appJs.includes('id="dr-goal"'));
    assert.ok(appJs.includes('id="dr-mins"'));
    assert.ok(appJs.includes('id="dr-mood"'));
    assert.ok(appJs.includes('id="dr-energy"'));
    assert.ok(appJs.includes('id="dr-note"'));
    assert.ok(appJs.includes('class="dr-rate'));
  });

  it('daily review save path posts to supported API route', () => {
    assert.ok(appJs.includes("api.post('/api/reviews/daily'"));
    assert.ok(appJs.includes('date:_toDateStr(new Date())'));
  });

  it('daily review API accepts save and fetch for current date', async () => {
    const date = today();
    const save = await agent().post('/api/reviews/daily').send({
      date,
      note: 'Good day overall'
    });
    assert.ok([200, 201].includes(save.status));
    const get = await agent().get(`/api/reviews/daily/${date}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.date, date);
  });
});
