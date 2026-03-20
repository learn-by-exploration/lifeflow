const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, agent } = require('./helpers');

describe('NLP Quick Capture Parser', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  const fmt = (d) => d.toISOString().slice(0, 10);
  function todayDate() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  it('returns 400 when text is missing', async () => {
    await agent().post('/api/tasks/parse').send({}).expect(400);
  });

  it('returns 400 when text is whitespace', async () => {
    await agent().post('/api/tasks/parse').send({ text: '   ' }).expect(400);
  });

  it('extracts priority from p1/p2/p3', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Buy milk p2' })
      .expect(200);
    assert.equal(res.body.priority, 2);
    assert.equal(res.body.title, 'Buy milk');
  });

  it('extracts priority from !1/!2/!3 (adjacent to word)', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Fix bug!3' })
      .expect(200);
    assert.equal(res.body.priority, 3);
    assert.equal(res.body.title, 'Fix bug');
  });

  it('extracts tags with # prefix', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Deploy app #urgent #devops' })
      .expect(200);
    assert.deepStrictEqual(res.body.tags, ['urgent', 'devops']);
    assert.equal(res.body.title, 'Deploy app');
  });

  it('extracts "today" as due_date', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Call dentist today' })
      .expect(200);
    assert.equal(res.body.due_date, fmt(todayDate()));
    assert.equal(res.body.title, 'Call dentist');
  });

  it('extracts "tomorrow" as due_date', async () => {
    const d = todayDate();
    d.setDate(d.getDate() + 1);
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Submit report tomorrow' })
      .expect(200);
    assert.equal(res.body.due_date, fmt(d));
    assert.equal(res.body.title, 'Submit report');
  });

  it('extracts "day after tomorrow" as due_date', async () => {
    const d = todayDate();
    d.setDate(d.getDate() + 2);
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Meeting day after tomorrow' })
      .expect(200);
    assert.equal(res.body.due_date, fmt(d));
  });

  it('extracts "in N days" as due_date', async () => {
    const d = todayDate();
    d.setDate(d.getDate() + 5);
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Follow up in 5 days' })
      .expect(200);
    assert.equal(res.body.due_date, fmt(d));
    assert.equal(res.body.title, 'Follow up');
  });

  it('extracts "next <weekday>" as due_date', async () => {
    const d = todayDate();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = 1; // Monday
    let diff = targetDay - d.getDay();
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);

    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Team standup next monday' })
      .expect(200);
    assert.equal(res.body.due_date, fmt(d));
  });

  it('extracts YYYY-MM-DD date', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Deadline 2025-12-25' })
      .expect(200);
    assert.equal(res.body.due_date, '2025-12-25');
    assert.equal(res.body.title, 'Deadline');
  });

  it('extracts MM/DD date', async () => {
    const year = new Date().getFullYear();
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Party on 3/15' })
      .expect(200);
    assert.equal(res.body.due_date, `${year}-03-15`);
  });

  it('extracts "my day" flag', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Read book my day' })
      .expect(200);
    assert.equal(res.body.my_day, true);
    assert.equal(res.body.title, 'Read book');
  });

  it('handles combined extraction (priority + tag + date)', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Ship feature p1 #release tomorrow' })
      .expect(200);
    assert.equal(res.body.priority, 1);
    assert.deepStrictEqual(res.body.tags, ['release']);
    const d = todayDate(); d.setDate(d.getDate() + 1);
    assert.equal(res.body.due_date, fmt(d));
    assert.equal(res.body.title, 'Ship feature');
  });

  it('returns original text as title when nothing is extracted', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'Simple task' })
      .expect(200);
    assert.equal(res.body.title, 'Simple task');
    assert.equal(res.body.priority, 0);
    assert.equal(res.body.due_date, null);
    assert.deepStrictEqual(res.body.tags, []);
    assert.equal(res.body.my_day, false);
  });

  it('falls back to original text if everything is extracted from title', async () => {
    const res = await agent()
      .post('/api/tasks/parse')
      .send({ text: 'p1 today #urgent' })
      .expect(200);
    // Title might be empty after extraction, falls back to original
    assert.ok(res.body.title);
  });
});
