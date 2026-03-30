/**
 * Recurring Task Spawn Edge Cases
 * Tests for date calculation edge cases, spawn relations, skip endpoint,
 * idempotency, recurring JSON validation, and field preservation.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, agent } = require('./helpers');

let db, helpers;

before(() => {
  const s = setup();
  db = s.db;
  helpers = require('../src/helpers')(db);
});
after(() => teardown());
beforeEach(() => cleanDb());

function mkChain() {
  const a = makeArea();
  const g = makeGoal(a.id);
  return { area: a, goal: g };
}

// ─── 1. Next Due Date Calculation Edge Cases ───────────────────────────────────

describe('Recurring Spawn Edges > Next Due Date Calculation', () => {
  it('yearly: Feb 29 leap year 2028 → Mar 1 2029 (simple string does not clamp)', () => {
    // Simple string 'yearly' uses setFullYear which overflows Feb 29 → Mar 1
    const result = helpers.nextDueDate('2028-02-29', 'yearly');
    assert.equal(result, '2029-03-01');
  });

  it('yearly JSON pattern with interval 1 also does not clamp Feb 29', () => {
    // JSON yearly also uses setFullYear, same overflow behavior
    const result = helpers.nextDueDate('2028-02-29', JSON.stringify({ pattern: 'yearly', interval: 1 }));
    assert.equal(result, '2029-03-01');
  });

  it('yearly JSON pattern with interval 2', () => {
    const result = helpers.nextDueDate('2026-03-15', JSON.stringify({ pattern: 'yearly', interval: 2 }));
    assert.equal(result, '2028-03-15');
  });

  it('every-3-days string pattern', () => {
    const result = helpers.nextDueDate('2026-03-30', 'every-3-days');
    assert.equal(result, '2026-04-02');
  });

  it('every-2-weeks string pattern', () => {
    const result = helpers.nextDueDate('2026-03-30', 'every-2-weeks');
    assert.equal(result, '2026-04-13');
  });

  it('weekdays: Friday → Monday', () => {
    // 2026-03-27 is Friday
    const result = helpers.nextDueDate('2026-03-27', 'weekdays');
    assert.equal(result, '2026-03-30'); // Monday
  });

  it('weekdays: Saturday → Monday', () => {
    // 2026-03-28 is Saturday
    const result = helpers.nextDueDate('2026-03-28', 'weekdays');
    assert.equal(result, '2026-03-30'); // Monday
  });

  it('weekdays: Wednesday → Thursday', () => {
    // 2026-03-25 is Wednesday
    const result = helpers.nextDueDate('2026-03-25', 'weekdays');
    assert.equal(result, '2026-03-26'); // Thursday
  });

  it('biweekly string pattern', () => {
    const result = helpers.nextDueDate('2026-03-01', 'biweekly');
    assert.equal(result, '2026-03-15');
  });

  it('monthly: Dec 31 → Jan 31 (year rollover)', () => {
    const result = helpers.nextDueDate('2026-12-31', 'monthly');
    assert.equal(result, '2027-01-31');
  });
});

// ─── 2. Spawn with Relations ───────────────────────────────────────────────────

describe('Recurring Spawn Edges > Spawn Relations', () => {
  it('spawned task does NOT copy comments', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    // Add a comment to the original task (table uses 'text' column)
    db.prepare('INSERT INTO task_comments (task_id, text) VALUES (?, ?)').run(t.id, 'Original comment');
    const origComments = db.prepare('SELECT * FROM task_comments WHERE task_id=?').all(t.id);
    assert.equal(origComments.length, 1);

    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const spawned = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
    assert.ok(spawned, 'spawned task should exist');
    const spawnedComments = db.prepare('SELECT * FROM task_comments WHERE task_id=?').all(spawned.id);
    assert.equal(spawnedComments.length, 0, 'comments should NOT be copied to spawned task');
  });

  it('spawned task copies custom field values', async () => {
    const { goal } = mkChain();
    // Create custom field definition
    const cfd = db.prepare('INSERT INTO custom_field_defs (user_id, name, field_type, position) VALUES (1, ?, ?, 0)').run('Effort', 'select');
    const fieldId = cfd.lastInsertRowid;
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    // Set custom field value on original task
    db.prepare('INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?, ?, ?)').run(t.id, fieldId, 'high');

    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const spawned = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
    assert.ok(spawned);
    const cfv = db.prepare('SELECT * FROM task_custom_values WHERE task_id=?').all(spawned.id);
    assert.equal(cfv.length, 1, 'custom field value should be copied');
    assert.equal(cfv[0].value, 'high');
  });

  it('spawned task preserves note content', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily', note: 'Important details here' });

    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const spawned = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
    assert.ok(spawned);
    assert.equal(spawned.note, 'Important details here');
  });

  it('spawned task does NOT copy dependencies', async () => {
    const { goal } = mkChain();
    const dep = makeTask(goal.id, { status: 'todo', title: 'Dependency' });
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(t.id, dep.id);

    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo' AND recurring IS NOT NULL").get(goal.id);
    assert.ok(spawned);
    const deps = db.prepare('SELECT * FROM task_deps WHERE task_id=?').all(spawned.id);
    assert.equal(deps.length, 0, 'dependencies should NOT be copied to spawned task');
  });
});

// ─── 3. Skip Endpoint ─────────────────────────────────────────────────────────

describe('Recurring Spawn Edges > Skip Endpoint', () => {
  it('POST /api/tasks/:id/skip marks done and spawns next', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });

    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.equal(res.status, 200);
    assert.equal(res.body.skipped, t.id);
    assert.ok(res.body.next, 'should return next task');
    assert.equal(res.body.next.due_date, '2026-03-31');
    assert.equal(res.body.next.status, 'todo');

    // Verify original is done
    const orig = db.prepare('SELECT * FROM tasks WHERE id=?').get(t.id);
    assert.equal(orig.status, 'done');
    assert.ok(orig.completed_at, 'completed_at should be set on skipped task');
  });

  it('skip on non-recurring task returns 400', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30' });

    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /not a recurring task/i);
  });

  it('skip with no due_date returns null next', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: null, recurring: 'daily' });

    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.equal(res.status, 200);
    assert.equal(res.body.skipped, t.id);
    assert.equal(res.body.next, null, 'no next task without due_date');
  });

  it('skip preserves tags on spawned next', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'weekly' });
    const tag = makeTag({ name: 'skip-tag' });
    linkTag(t.id, tag.id);

    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.equal(res.status, 200);
    assert.ok(res.body.next);
    const spawnedTags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(res.body.next.id);
    assert.equal(spawnedTags.length, 1);
    assert.equal(spawnedTags[0].tag_id, tag.id);
  });
});

// ─── 4. Spawn Idempotency ─────────────────────────────────────────────────────

describe('Recurring Spawn Edges > Spawn Idempotency', () => {
  it('done → done again does NOT double spawn', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });

    // First completion
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const afterFirst = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(afterFirst.length, 1, 'one spawn after first completion');

    // Second PUT with same status (already done)
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const afterSecond = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(afterSecond.length, 1, 'no additional spawn on re-done');
  });

  it('done → todo → done spawns one more', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });

    // First completion
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    let todoTasks = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(todoTasks.length, 1, 'one spawn after first completion');

    // Reopen
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });

    // Second completion — should spawn again since status changed from non-done to done
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    todoTasks = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(todoTasks.length, 2, 'second completion spawns another');
  });

  it('PUT same status (todo→todo) does not spawn', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });

    await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });
    const tasks = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(tasks.length, 1, 'no spawn on same status');
  });

  it('doing → done spawns next occurrence', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'doing', due_date: '2026-03-30', recurring: 'daily' });

    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const tasks = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(tasks.length, 1, 'doing→done triggers spawn');
    assert.equal(tasks[0].due_date, '2026-03-31');
  });
});

// ─── 5. Recurring JSON Validation ──────────────────────────────────────────────

describe('Recurring Spawn Edges > Recurring JSON Validation', () => {
  it('simple string "daily" accepted', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Daily task', due_date: '2026-04-01', recurring: 'daily'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.recurring, 'daily');
  });

  it('simple string "yearly" accepted', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Yearly task', due_date: '2026-04-01', recurring: 'yearly'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.recurring, 'yearly');
  });

  it('JSON object pattern accepted', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Custom', due_date: '2026-04-01',
      recurring: { pattern: 'daily', interval: 3 }
    });
    assert.equal(res.status, 201);
    const parsed = JSON.parse(res.body.recurring);
    assert.equal(parsed.pattern, 'daily');
    assert.equal(parsed.interval, 3);
  });

  it('every-5-days string accepted', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Every 5 days', due_date: '2026-04-01', recurring: 'every-5-days'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.recurring, 'every-5-days');
  });

  it('invalid random string → 400', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Bad recurring', due_date: '2026-04-01', recurring: 'every-full-moon'
    });
    assert.equal(res.status, 400);
  });

  it('negative interval → 400', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Negative', due_date: '2026-04-01',
      recurring: { pattern: 'daily', interval: -1 }
    });
    assert.equal(res.status, 400);
  });

  it('zero interval → 400', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Zero', due_date: '2026-04-01',
      recurring: { pattern: 'daily', interval: 0 }
    });
    assert.equal(res.status, 400);
  });

  it('interval > 365 → 400', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Huge interval', due_date: '2026-04-01',
      recurring: { pattern: 'daily', interval: 999 }
    });
    assert.equal(res.status, 400);
  });

  it('unknown pattern in JSON → 400', async () => {
    const { goal } = mkChain();
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'Unknown', due_date: '2026-04-01',
      recurring: { pattern: 'lunar' }
    });
    assert.equal(res.status, 400);
  });

  it('null recurring clears recurring on update', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-04-01', recurring: 'daily' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ recurring: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.recurring, null);
  });
});

// ─── 6. Spawned Task Field Preservation ────────────────────────────────────────

describe('Recurring Spawn Edges > Spawned Task Fields', () => {
  it('spawned task has status=todo', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    assert.equal(spawned.status, 'todo');
  });

  it('spawned task has my_day=0', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily', my_day: 1 });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    assert.equal(spawned.my_day, 0, 'my_day should reset to 0');
  });

  it('spawned task has completed_at=null', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    assert.equal(spawned.completed_at, null, 'completed_at should be null');
  });

  it('spawned task inherits goal_id', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    assert.equal(spawned.goal_id, goal.id);
  });

  it('spawned task inherits title', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { title: 'Morning standup', status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    assert.equal(spawned.title, 'Morning standup');
  });

  it('spawned task has actual_minutes reset (not carried over)', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring: 'daily' });
    db.prepare('UPDATE tasks SET actual_minutes=60 WHERE id=?').run(t.id);
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    // Spawn INSERT does not include actual_minutes, so it defaults to column default (0 or null)
    assert.ok(spawned.actual_minutes === null || spawned.actual_minutes === 0, 'actual_minutes should not carry over from completed task');
    assert.notEqual(spawned.actual_minutes, 60, 'should not inherit actual_minutes=60');
  });

  it('endAfter count increments on spawn', async () => {
    const { goal } = mkChain();
    const recurring = JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 5, count: 0 });
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").get(goal.id);
    assert.ok(spawned);
    const cfg = JSON.parse(spawned.recurring);
    assert.equal(cfg.count, 1, 'count should increment');
    assert.equal(cfg.endAfter, 5, 'endAfter should be preserved');
  });

  it('endAfter reached → no spawn', async () => {
    const { goal } = mkChain();
    const recurring = JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 3, count: 3 });
    const t = makeTask(goal.id, { status: 'todo', due_date: '2026-03-30', recurring });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const spawned = db.prepare("SELECT * FROM tasks WHERE goal_id=? AND status='todo'").all(goal.id);
    assert.equal(spawned.length, 0, 'no spawn when count reaches endAfter');
  });
});
