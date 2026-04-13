const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, today, daysFromNow } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');

describe('Calendar View Styling', () => {
  before(() => { setup(); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('calendar source includes priority pills and quick-add controls', () => {
    assert.ok(appJs.includes('cal-quick-add'));
    assert.ok(appJs.includes('ctd p${pri}'));
    assert.ok(stylesCss.includes('.ctd.p3'));
    assert.ok(stylesCss.includes('.ctd.p2'));
    assert.ok(stylesCss.includes('.ctd.p1'));
    assert.ok(stylesCss.includes('.ctd.p0'));
  });

  it('calendar source includes mobile agenda mode and today highlighting', () => {
    assert.ok(appJs.includes('const isMobileAgenda=window.innerWidth<600'));
    assert.ok(stylesCss.includes('.cal-agenda'));
    assert.ok(stylesCss.includes('.cal-agenda-day.today'));
    assert.ok(stylesCss.includes('.cc.today'));
  });

  it('calendar API returns created tasks within date range', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const due = daysFromNow(3);
    makeTask(goal.id, { title: 'Cal Task', due_date: due, priority: 3 });
    const res = await agent().get(`/api/tasks/calendar?start=${today()}&end=${daysFromNow(7)}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(t => t.title === 'Cal Task'));
  });
});
