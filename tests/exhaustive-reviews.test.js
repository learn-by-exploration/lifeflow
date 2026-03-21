const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent, today, daysFromNow } = require('./helpers');

/**
 * Helper: compute this week's Monday date string (matches server logic).
 */
function currentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  return mon.toISOString().split('T')[0];
}

describe('Weekly Reviews API – exhaustive coverage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ── GET /api/reviews ──────────────────────────────────────────────

  it('returns empty array when no reviews exist', async () => {
    const res = await agent().get('/api/reviews');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });

  it('returns reviews ordered by week_start DESC (newest first)', async () => {
    const ws1 = '2025-01-06';
    const ws2 = '2025-01-13';
    const ws3 = '2025-01-20';

    await agent().post('/api/reviews').send({ week_start: ws2, reflection: 'mid' });
    await agent().post('/api/reviews').send({ week_start: ws1, reflection: 'old' });
    await agent().post('/api/reviews').send({ week_start: ws3, reflection: 'new' });

    const res = await agent().get('/api/reviews').expect(200);
    assert.equal(res.body.length, 3);
    assert.equal(res.body[0].week_start, ws3);
    assert.equal(res.body[1].week_start, ws2);
    assert.equal(res.body[2].week_start, ws1);
  });

  // ── POST /api/reviews ─────────────────────────────────────────────

  it('returns 400 when week_start is missing', async () => {
    const res = await agent().post('/api/reviews').send({
      reflection: 'no week_start provided'
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('stores top_accomplishments as JSON string', async () => {
    const { db } = setup();
    const ws = currentWeekStart();
    const accomplishments = ['Shipped v2', 'Fixed auth bug'];

    await agent().post('/api/reviews').send({
      week_start: ws,
      top_accomplishments: accomplishments
    }).expect(201);

    const row = db.prepare('SELECT top_accomplishments FROM weekly_reviews WHERE week_start=?').get(ws);
    assert.equal(row.top_accomplishments, JSON.stringify(accomplishments));
  });

  it('stores next_week_priorities as JSON string', async () => {
    const { db } = setup();
    const ws = currentWeekStart();
    const priorities = ['Deploy staging', 'Write tests'];

    await agent().post('/api/reviews').send({
      week_start: ws,
      next_week_priorities: priorities
    }).expect(201);

    const row = db.prepare('SELECT next_week_priorities FROM weekly_reviews WHERE week_start=?').get(ws);
    assert.equal(row.next_week_priorities, JSON.stringify(priorities));
  });

  it('reflection defaults to empty string when omitted', async () => {
    const ws = currentWeekStart();
    const res = await agent().post('/api/reviews').send({
      week_start: ws
    }).expect(201);
    assert.equal(res.body.reflection, '');
  });

  it('top_accomplishments defaults to empty array when omitted', async () => {
    const ws = currentWeekStart();
    const res = await agent().post('/api/reviews').send({
      week_start: ws
    }).expect(201);
    // Stored as JSON string '[]'
    assert.equal(res.body.top_accomplishments, '[]');
  });

  it('auto-computes tasks_completed count from DB', async () => {
    const { db } = setup();
    const ws = currentWeekStart();
    const a = makeArea();
    const g = makeGoal(a.id);

    // Create 3 tasks marked done with completed_at inside this week
    for (let i = 0; i < 3; i++) {
      const t = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(ws + 'T10:00:00.000Z', t.id);
    }
    // One task NOT done — should not count
    makeTask(g.id, { status: 'todo' });

    const res = await agent().post('/api/reviews').send({ week_start: ws }).expect(201);
    assert.equal(res.body.tasks_completed, 3);
  });

  it('auto-computes tasks_created count from DB', async () => {
    const { db } = setup();
    const ws = currentWeekStart();
    const a = makeArea();
    const g = makeGoal(a.id);

    // Create 2 tasks with created_at inside this week
    for (let i = 0; i < 2; i++) {
      const t = makeTask(g.id);
      db.prepare('UPDATE tasks SET created_at=? WHERE id=?').run(ws + 'T08:00:00.000Z', t.id);
    }
    // One task created outside this week — should not count
    const old = makeTask(g.id);
    db.prepare('UPDATE tasks SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', old.id);

    const res = await agent().post('/api/reviews').send({ week_start: ws }).expect(201);
    assert.equal(res.body.tasks_created, 2);
  });

  it('upsert: updating an existing review returns 200 (not 201)', async () => {
    const ws = currentWeekStart();

    // First create → 201
    const create = await agent().post('/api/reviews').send({
      week_start: ws,
      reflection: 'draft'
    });
    assert.equal(create.status, 201);

    // Update same week → 200
    const update = await agent().post('/api/reviews').send({
      week_start: ws,
      reflection: 'final'
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.reflection, 'final');
  });

  // ── GET /api/reviews/current ──────────────────────────────────────

  it('returns weekStart and weekEnd as date strings', async () => {
    const res = await agent().get('/api/reviews/current').expect(200);
    // Both should be YYYY-MM-DD format
    assert.match(res.body.weekStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(res.body.weekEnd, /^\d{4}-\d{2}-\d{2}$/);
    // weekEnd should be 7 days after weekStart
    const start = new Date(res.body.weekStart);
    const end = new Date(res.body.weekEnd);
    const diff = (end - start) / (1000 * 60 * 60 * 24);
    assert.equal(diff, 7);
  });

  it('existingReview is null when no review has been saved', async () => {
    const res = await agent().get('/api/reviews/current').expect(200);
    assert.equal(res.body.existingReview, null);
  });

  it('activeDays counts distinct days with completions', async () => {
    const { db } = setup();
    const ws = currentWeekStart();
    const a = makeArea();
    const g = makeGoal(a.id);

    // 2 tasks completed on day 1, 1 task completed on day 2 → 2 active days
    const t1 = makeTask(g.id, { status: 'done' });
    const t2 = makeTask(g.id, { status: 'done' });
    const t3 = makeTask(g.id, { status: 'done' });
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(ws + 'T09:00:00.000Z', t1.id);
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(ws + 'T14:00:00.000Z', t2.id);
    // Day 2 = ws + 1 day
    const day2 = new Date(ws);
    day2.setDate(day2.getDate() + 1);
    const day2Str = day2.toISOString().split('T')[0];
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(day2Str + 'T10:00:00.000Z', t3.id);

    const res = await agent().get('/api/reviews/current').expect(200);
    assert.equal(res.body.activeDays, 2);
  });

  it('overdueTasks lists tasks past due date', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);

    // Overdue: due before this week's start, not done
    makeTask(g.id, { title: 'Overdue task', status: 'todo', due_date: daysFromNow(-14) });
    // Not overdue: due in the future, not done
    makeTask(g.id, { title: 'Future task', status: 'todo', due_date: daysFromNow(7) });
    // Not overdue: done (even if due_date passed)
    makeTask(g.id, { title: 'Done task', status: 'done', due_date: daysFromNow(-14) });

    const res = await agent().get('/api/reviews/current').expect(200);
    const titles = res.body.overdueTasks.map(t => t.title);
    assert.ok(titles.includes('Overdue task'), 'should include overdue task');
    assert.ok(!titles.includes('Future task'), 'should not include future task');
    assert.ok(!titles.includes('Done task'), 'should not include done task');
  });

  it('completedTasks includes goal_title', async () => {
    const { db } = setup();
    const ws = currentWeekStart();
    const a = makeArea();
    const g = makeGoal(a.id, { title: 'Fitness Plan' });
    const t = makeTask(g.id, { title: 'Run 5k', status: 'done' });
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(ws + 'T12:00:00.000Z', t.id);

    const res = await agent().get('/api/reviews/current').expect(200);
    assert.ok(res.body.completedTasks.length >= 1);
    const found = res.body.completedTasks.find(ct => ct.title === 'Run 5k');
    assert.ok(found, 'completed task should be in list');
    assert.equal(found.goal_title, 'Fitness Plan');
  });
});
