const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, agent, today, daysFromNow } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mkChain() {
  const a = makeArea();
  const g = makeGoal(a.id);
  return { area: a, goal: g };
}

// ─── 1. Valid Transitions ──────────────────────────────────────────────────────

describe('Task Status State Machine > Valid Transitions', () => {
  it('todo → doing', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'doing' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'doing');
  });

  it('doing → done', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'doing' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'done');
  });

  it('todo → done', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'done');
  });

  it('done → todo (reopen)', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'done' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'todo');
  });

  it('done → doing', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'done' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'doing' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'doing');
  });

  it('doing → todo', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'doing' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'todo');
  });

  it('rejects invalid status value', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'invalid' });
    assert.equal(res.status, 400);
  });
});

// ─── 2. completed_at Lifecycle ─────────────────────────────────────────────────

describe('Task Status State Machine > completed_at Lifecycle', () => {
  it('sets completed_at when transitioning to done', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    assert.ok(res.body.completed_at, 'completed_at should be set');
  });

  it('clears completed_at when reopening (done → todo)', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    // Complete
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    // Reopen
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });
    assert.equal(res.status, 200);
    assert.equal(res.body.completed_at, null, 'completed_at should be cleared on reopen');
  });

  it('clears completed_at when reopening (done → doing)', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'doing' });
    assert.equal(res.status, 200);
    assert.equal(res.body.completed_at, null, 'completed_at should be cleared on done→doing');
  });

  it('does not change completed_at on non-status update', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'done' });
    // Complete first to set completed_at
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const r1 = await agent().get(`/api/tasks/${t.id}`);
    const origCompletedAt = r1.body.completed_at;
    // Update title only
    const res = await agent().put(`/api/tasks/${t.id}`).send({ title: 'Updated Title' });
    assert.equal(res.status, 200);
    assert.equal(res.body.completed_at, origCompletedAt, 'completed_at should not change on title update');
  });

  it('completed_at is ISO 8601 format', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    // ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
    assert.match(res.body.completed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sets completed_at on doing → done (not just todo → done)', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'doing' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    assert.ok(res.body.completed_at, 'completed_at should be set on doing→done');
  });
});

// ─── 3. Recurring Spawn on Complete ────────────────────────────────────────────

describe('Task Status State Machine > Recurring Spawn on Complete', () => {
  it('daily recurring spawns next occurrence', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: today(), recurring: 'daily' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    // Check that a new task was spawned
    const { db } = setup();
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
    assert.equal(tasks.length, 1, 'should spawn 1 new task');
    assert.equal(tasks[0].due_date, daysFromNow(1));
  });

  it('weekly recurring spawns next occurrence', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: today(), recurring: 'weekly' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].due_date, daysFromNow(7));
  });

  it('monthly recurring spawns next occurrence', async () => {
    const { goal } = mkChain();
    const dueDate = '2026-01-15';
    const t = makeTask(goal.id, { status: 'todo', due_date: dueDate, recurring: 'monthly' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].due_date, '2026-02-15');
  });

  it('JSON pattern recurring spawns correctly', async () => {
    const { goal } = mkChain();
    const recurring = JSON.stringify({ pattern: 'daily', interval: 3 });
    const t = makeTask(goal.id, { status: 'todo', due_date: today(), recurring });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].due_date, daysFromNow(3));
  });

  it('spawn copies tags to new task', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: today(), recurring: 'daily' });
    const tag1 = makeTag({ name: 'tag-a' });
    const tag2 = makeTag({ name: 'tag-b' });
    linkTag(t.id, tag1.id);
    linkTag(t.id, tag2.id);
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const spawned = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
    assert.ok(spawned, 'spawned task should exist');
    const tags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(spawned.id);
    assert.equal(tags.length, 2, 'tags should be copied');
    const tagIds = tags.map(t => t.tag_id).sort();
    assert.deepEqual(tagIds, [tag1.id, tag2.id].sort());
  });

  it('spawn copies subtasks (reset to undone)', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: today(), recurring: 'daily' });
    makeSubtask(t.id, { title: 'Sub A', done: 1 });
    makeSubtask(t.id, { title: 'Sub B', done: 0 });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const spawned = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
    assert.ok(spawned);
    const subs = db.prepare('SELECT * FROM subtasks WHERE task_id=? ORDER BY position').all(spawned.id);
    assert.equal(subs.length, 2, 'subtasks should be copied');
    assert.equal(subs[0].title, 'Sub A');
    assert.equal(subs[0].done, 0, 'copied subtask should be reset to undone');
    assert.equal(subs[1].done, 0, 'copied subtask should be reset to undone');
  });

  it('spawned task resets to todo status', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'doing', due_date: today(), recurring: 'daily' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const spawned = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').get(goal.id, 'todo');
    assert.ok(spawned);
    assert.equal(spawned.status, 'todo');
    assert.equal(spawned.my_day, 0, 'spawned task should not be in my_day');
  });

  it('does not spawn when task has no due_date', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: null, recurring: 'daily' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND status=?').all(goal.id, 'todo');
    assert.equal(tasks.length, 0, 'no spawn without due_date');
  });
});

// ─── 4. Bulk Status Change ─────────────────────────────────────────────────────

describe('Task Status State Machine > Bulk Status Change', () => {
  it('bulk complete sets all to done with completed_at', async () => {
    const { goal } = mkChain();
    const t1 = makeTask(goal.id, { status: 'todo', title: 'Task 1' });
    const t2 = makeTask(goal.id, { status: 'doing', title: 'Task 2' });
    const res = await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id],
      changes: { status: 'done' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 2);
    const { db } = setup();
    const r1 = db.prepare('SELECT * FROM tasks WHERE id=?').get(t1.id);
    const r2 = db.prepare('SELECT * FROM tasks WHERE id=?').get(t2.id);
    assert.equal(r1.status, 'done');
    assert.equal(r2.status, 'done');
    assert.ok(r1.completed_at, 'completed_at should be set');
    assert.ok(r2.completed_at, 'completed_at should be set');
  });

  it('bulk reopen sets all to todo', async () => {
    const { goal } = mkChain();
    const t1 = makeTask(goal.id, { status: 'done', title: 'Task 1' });
    const t2 = makeTask(goal.id, { status: 'done', title: 'Task 2' });
    // Complete them first to set completed_at
    const { db } = setup();
    const now = new Date().toISOString();
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(now, t1.id);
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(now, t2.id);

    const res = await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id],
      changes: { status: 'todo' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 2);
    const r1 = db.prepare('SELECT * FROM tasks WHERE id=?').get(t1.id);
    assert.equal(r1.status, 'todo');
  });

  it('bulk with mixed statuses', async () => {
    const { goal } = mkChain();
    const t1 = makeTask(goal.id, { status: 'todo' });
    const t2 = makeTask(goal.id, { status: 'done' });
    const t3 = makeTask(goal.id, { status: 'doing' });
    const res = await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id, t3.id],
      changes: { status: 'done' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 3);
    const { db } = setup();
    for (const tid of [t1.id, t2.id, t3.id]) {
      const r = db.prepare('SELECT status FROM tasks WHERE id=?').get(tid);
      assert.equal(r.status, 'done');
    }
  });

  it('bulk with empty ids array returns 400', async () => {
    const res = await agent().put('/api/tasks/bulk').send({
      ids: [],
      changes: { status: 'done' }
    });
    assert.equal(res.status, 400);
  });
});

// ─── 5. Status + my_day Interaction ────────────────────────────────────────────

describe('Task Status State Machine > Status + my_day Interaction', () => {
  it('completing a my_day task keeps status as done', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', my_day: 1 });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'done');
  });

  it('reopening keeps my_day flag intact', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', my_day: 1 });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'todo');
    // my_day should still be set since we only changed status
    assert.equal(res.body.my_day, 1, 'my_day should be preserved on status-only reopen');
  });

  it('can set status and my_day simultaneously', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', my_day: 0 });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ status: 'doing', my_day: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'doing');
    assert.equal(res.body.my_day, 1);
  });

  it('bulk complete preserves completed_at for already-done tasks', async () => {
    const { goal } = mkChain();
    const t1 = makeTask(goal.id, { status: 'done', title: 'Already done' });
    const { db } = setup();
    const earlyDate = '2026-01-01T00:00:00.000Z';
    db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(earlyDate, t1.id);
    const t2 = makeTask(goal.id, { status: 'todo', title: 'Not done yet' });
    const res = await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id],
      changes: { status: 'done' }
    });
    assert.equal(res.status, 200);
    // Already-done task should keep its original completed_at
    const r1 = db.prepare('SELECT completed_at FROM tasks WHERE id=?').get(t1.id);
    assert.equal(r1.completed_at, earlyDate, 'already-done task should keep original completed_at');
    // Newly completed task should get fresh completed_at
    const r2 = db.prepare('SELECT completed_at FROM tasks WHERE id=?').get(t2.id);
    assert.ok(r2.completed_at, 'newly completed task should have completed_at');
    assert.notEqual(r2.completed_at, earlyDate);
  });
});

// ─── 6. Automation triggers ────────────────────────────────────────────────────

describe('Task Status State Machine > Automation Triggers', () => {
  it('task_completed fires automation rules', async () => {
    const { goal } = mkChain();
    const tag = makeTag({ name: 'auto-tag' });
    const { db } = setup();
    // Create automation rule: on task_completed, add tag
    db.prepare(
      'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, enabled, user_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Add tag on complete', 'task_completed', '{}', 'add_tag', JSON.stringify({ tag_id: tag.id }), 1, 1);

    const t = makeTask(goal.id, { status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const tags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(t.id);
    assert.ok(tags.some(tt => tt.tag_id === tag.id), 'automation should have added the tag');
  });

  it('task_updated fires automation rules on non-done status change', async () => {
    const { goal } = mkChain();
    const { db } = setup();
    // Create automation rule: on task_updated, add to my_day
    db.prepare(
      'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, enabled, user_id) VALUES (?,?,?,?,?,?,?)'
    ).run('My day on update', 'task_updated', '{}', 'add_to_myday', '{}', 1, 1);

    const t = makeTask(goal.id, { status: 'todo', my_day: 0 });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'doing' });

    const updated = db.prepare('SELECT my_day FROM tasks WHERE id=?').get(t.id);
    assert.equal(updated.my_day, 1, 'task_updated should fire add_to_myday rule');
  });

  it('done → todo does NOT fire task_completed rule', async () => {
    const { goal } = mkChain();
    const tag = makeTag({ name: 'should-not-appear' });
    const { db } = setup();
    db.prepare(
      'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, enabled, user_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Tag on complete', 'task_completed', '{}', 'add_tag', JSON.stringify({ tag_id: tag.id }), 1, 1);

    const t = makeTask(goal.id, { status: 'done' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });

    const tags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(t.id);
    assert.ok(!tags.some(tt => tt.tag_id === tag.id), 'reopening should NOT fire task_completed rule');
  });

  it('create_followup action creates new task on complete', async () => {
    const { goal } = mkChain();
    const { db } = setup();
    db.prepare(
      'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, enabled, user_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Followup', 'task_completed', '{}', 'create_followup', JSON.stringify({ title: 'Follow-up task', priority: 2 }), 1, 1);

    const t = makeTask(goal.id, { status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=? AND title=?').all(goal.id, 'Follow-up task');
    assert.equal(tasks.length, 1, 'followup task should be created');
    assert.equal(tasks[0].priority, 2);
  });

  it('disabled automation rules do not fire', async () => {
    const { goal } = mkChain();
    const tag = makeTag({ name: 'disabled-rule-tag' });
    const { db } = setup();
    db.prepare(
      'INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, enabled, user_id) VALUES (?,?,?,?,?,?,?)'
    ).run('Disabled rule', 'task_completed', '{}', 'add_tag', JSON.stringify({ tag_id: tag.id }), 0, 1);

    const t = makeTask(goal.id, { status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });

    const tags = db.prepare('SELECT tag_id FROM task_tags WHERE task_id=?').all(t.id);
    assert.ok(!tags.some(tt => tt.tag_id === tag.id), 'disabled rules should not fire');
  });
});

// ─── 7. Edge Cases ─────────────────────────────────────────────────────────────

describe('Task Status State Machine > Edge Cases', () => {
  it('double-complete (done → done) is idempotent', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo' });
    const r1 = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const firstCompleted = r1.body.completed_at;
    // Complete again
    const r2 = await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.status, 'done');
    // completed_at should remain the same (not re-set)
    assert.equal(r2.body.completed_at, firstCompleted, 'completed_at should not change on re-complete');
  });

  it('recurring task does not spawn on reopen', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'done', due_date: today(), recurring: 'daily' });
    // Reopen the task
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' });
    const { db } = setup();
    // Only the original task should exist (no spawn)
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=?').all(goal.id);
    assert.equal(tasks.length, 1, 'reopening should not spawn a new recurring task');
  });

  it('completing non-recurring task does not spawn', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'todo', due_date: today() });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' });
    const { db } = setup();
    const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id=?').all(goal.id);
    assert.equal(tasks.length, 1, 'non-recurring task should not spawn');
  });

  it('status null in update preserves current status', async () => {
    const { goal } = mkChain();
    const t = makeTask(goal.id, { status: 'doing' });
    const res = await agent().put(`/api/tasks/${t.id}`).send({ title: 'New title' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'doing', 'status should be preserved');
  });
});
