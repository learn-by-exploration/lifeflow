const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');

describe('Business Logic Break Tests', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── Helper: create area+goal via HTTP ───
  async function setupAreaAndGoal() {
    const areaRes = await agent()
      .post('/api/areas')
      .send({ name: 'Test Area', icon: '🧪', color: '#FF0000' });
    assert.equal(areaRes.status, 201, 'area creation should succeed');
    const area = areaRes.body;

    const goalRes = await agent()
      .post(`/api/areas/${area.id}/goals`)
      .send({ title: 'Test Goal', color: '#6C63FF' });
    assert.equal(goalRes.status, 201, 'goal creation should succeed');
    const goal = goalRes.body;

    return { area, goal };
  }

  // ─── Helper: create task via HTTP ───
  async function setupTask(goalId, overrides = {}) {
    const body = { title: 'Recurring Task', ...overrides };
    const res = await agent()
      .post(`/api/goals/${goalId}/tasks`)
      .send(body);
    assert.equal(res.status, 201, 'task creation should succeed');
    return res.body;
  }

  // ─── Helper: get all tasks for a goal ───
  async function getGoalTasks(goalId) {
    const res = await agent().get(`/api/goals/${goalId}/tasks`);
    assert.equal(res.status, 200);
    return res.body;
  }

  // ─── Helper: complete a task ───
  async function completeTask(taskId) {
    const res = await agent()
      .put(`/api/tasks/${taskId}`)
      .send({ status: 'done' });
    assert.equal(res.status, 200, `completing task ${taskId} should succeed`);
    return res.body;
  }

  // ======================================================================
  // GROUP: Recurring Task endAfter
  // ======================================================================

  it('endAfter: recurring task stops after N completions', async () => {
    const { goal } = await setupAreaAndGoal();

    // Create task, then set recurring via PUT
    const task = await setupTask(goal.id, { title: 'endAfter:2 Task', due_date: '2024-01-01' });
    await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ recurring: JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 2, count: 0 }) });

    // Complete original (count=0 < endAfter=2) → spawns child with count=1
    await completeTask(task.id);
    let allTasks = await getGoalTasks(goal.id);
    let remaining = allTasks.filter(t => t.status !== 'done');
    assert.equal(remaining.length, 1, 'should have exactly 1 active child after first completion');

    const child = remaining[0];
    const childCfg = JSON.parse(child.recurring);
    assert.equal(childCfg.count, 1, 'child should have count=1');

    // Complete child (count=1 < endAfter=2) → spawns grandchild with count=2
    await completeTask(child.id);
    allTasks = await getGoalTasks(goal.id);
    remaining = allTasks.filter(t => t.status !== 'done');
    assert.equal(remaining.length, 1, 'should have exactly 1 active grandchild after second completion');

    const grandchild = remaining[0];
    const gcCfg = JSON.parse(grandchild.recurring);
    assert.equal(gcCfg.count, 2, 'grandchild should have count=2');

    // Complete grandchild (count=2 >= endAfter=2) → no more spawning
    await completeTask(grandchild.id);
    allTasks = await getGoalTasks(goal.id);
    const totalTasks = allTasks.length;
    assert.equal(totalTasks, 3, 'total tasks should be 3 (original + 2 spawned), not 4 — endAfter=2 enforced');
    const activeAfterFinal = allTasks.filter(t => t.status !== 'done');
    assert.equal(activeAfterFinal.length, 0, 'no active tasks should remain after endAfter reached');
  });

  it('endAfter: 0 — BUG: endAfter:0 spawns a child due to falsy 0 in JS short-circuit', async () => {
    // BUG REPORT: The guard `if (cfg.endAfter && cfg.count >= cfg.endAfter)` uses a truthy check on
    // cfg.endAfter. When endAfter=0, `cfg.endAfter` is falsy (0 is falsy in JS), so the check
    // short-circuits to false and the "stop" branch is never entered.
    // Intent: endAfter:0 should mean "never spawn", but due to the falsy bug a child IS spawned.
    // Fix would be: `if (cfg.endAfter != null && cfg.count >= cfg.endAfter)`
    const { goal } = await setupAreaAndGoal();

    const task = await setupTask(goal.id, { title: 'endAfter:0 BUG', due_date: '2024-01-01' });
    await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ recurring: JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 0, count: 0 }) });

    await completeTask(task.id);

    const allTasks = await getGoalTasks(goal.id);
    // BUG: 0 is falsy, so `cfg.endAfter && ...` short-circuits, child IS spawned (total=2)
    assert.equal(allTasks.length, 2,
      'BUG CONFIRMED: endAfter:0 spawns a child because 0 is falsy in `cfg.endAfter && count>=endAfter`');
    // The correct behavior would be allTasks.length === 1 (no spawn when endAfter=0)
  });

  it('endAfter: 1 — original spawns one child, child spawns nothing', async () => {
    const { goal } = await setupAreaAndGoal();

    const task = await setupTask(goal.id, { title: 'endAfter:1', due_date: '2024-01-01' });
    await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ recurring: JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 1, count: 0 }) });

    // count=0 < endAfter=1 → spawn child with count=1
    await completeTask(task.id);
    let allTasks = await getGoalTasks(goal.id);
    assert.equal(allTasks.length, 2, 'should have 2 tasks after first completion');

    const child = allTasks.find(t => t.status !== 'done');
    assert.ok(child, 'child task should exist');
    const childCfg = JSON.parse(child.recurring);
    assert.equal(childCfg.count, 1, 'child should have count=1');

    // count=1 >= endAfter=1 → no grandchild
    await completeTask(child.id);
    allTasks = await getGoalTasks(goal.id);
    assert.equal(allTasks.length, 2, 'should have exactly 2 tasks total (no grandchild spawned)');
    assert.equal(allTasks.filter(t => t.status !== 'done').length, 0, 'no active tasks remain');
  });

  it('Recurring with endDate in the past — no new task spawned', async () => {
    const { goal } = await setupAreaAndGoal();

    // endDate is in the past (year 2000); next date from 2024-01-01 would be 2024-01-02
    const task = await setupTask(goal.id, { title: 'endDate past', due_date: '2024-01-01' });
    await agent()
      .put(`/api/tasks/${task.id}`)
      .send({ recurring: JSON.stringify({ pattern: 'daily', interval: 1, endDate: '2000-01-01' }) });

    await completeTask(task.id);

    const allTasks = await getGoalTasks(goal.id);
    assert.equal(allTasks.length, 1, 'endDate in past → next date 2024-01-02 > endDate 2000-01-01 → no spawn');
    assert.equal(allTasks[0].status, 'done');
  });

  it("Recurring simple string 'daily' — spawns next day", async () => {
    const { goal } = await setupAreaAndGoal();

    const task = await setupTask(goal.id, { title: 'daily simple', due_date: '2024-01-15', recurring: 'daily' });
    await completeTask(task.id);

    const allTasks = await getGoalTasks(goal.id);
    assert.equal(allTasks.length, 2, 'should have 2 tasks total after completing a daily recurring task');

    const spawned = allTasks.find(t => t.status !== 'done');
    assert.ok(spawned, 'spawned task should exist');
    assert.equal(spawned.due_date, '2024-01-16', "spawned task's due_date should be the next day");
  });

  it("Recurring 'every-999999-days' — capped at 36500 days, no crash", async () => {
    const { goal } = await setupAreaAndGoal();

    const task = await setupTask(goal.id, { title: 'huge interval', due_date: '2024-01-01', recurring: 'every-999999-days' });
    await completeTask(task.id);

    const allTasks = await getGoalTasks(goal.id);
    assert.equal(allTasks.length, 2, 'should spawn a new task even with huge interval (capped at 36500 days)');

    const spawned = allTasks.find(t => t.status !== 'done');
    assert.ok(spawned, 'spawned task should exist');
    assert.ok(spawned.due_date, 'spawned task should have a parseable due_date');

    const dueDate = new Date(spawned.due_date);
    assert.ok(!isNaN(dueDate.getTime()), `due_date "${spawned.due_date}" should be a valid date`);

    // Cap is 36500 days from 2024-01-01 (not 999999 days)
    const baseDateMs = new Date('2024-01-01').getTime();
    const spawnedMs = dueDate.getTime();
    const diffDays = (spawnedMs - baseDateMs) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays <= 36500, `interval should be capped at 36500 days, got ${diffDays} days`);
    assert.ok(diffDays >= 1, 'interval should be at least 1 day');
  });

  it("Recurring 'every-0-days' — treated as 1 day minimum", async () => {
    const { goal } = await setupAreaAndGoal();

    const task = await setupTask(goal.id, { title: 'zero days', due_date: '2024-01-01', recurring: 'every-0-days' });
    await completeTask(task.id);

    const allTasks = await getGoalTasks(goal.id);
    assert.equal(allTasks.length, 2, 'should spawn next task');

    const spawned = allTasks.find(t => t.status !== 'done');
    assert.ok(spawned, 'spawned task should exist');
    assert.equal(spawned.due_date, '2024-01-02', "Math.max(1, 0)=1 → next date should be 2024-01-02");
  });

  // ======================================================================
  // GROUP: Circular Dependencies
  // ======================================================================

  it('Self-dependency rejected — blockedBy is empty for self-dep', async () => {
    const { goal } = await setupAreaAndGoal();
    const task = await setupTask(goal.id, { title: 'Self-dep Task' });

    const res = await agent()
      .put(`/api/tasks/${task.id}/deps`)
      .send({ blockedByIds: [task.id] });

    assert.equal(res.status, 200, 'self-dep PUT should return 200 (filter, not error)');
    // Self-dep is filtered out by: valid = blockedByIds.filter(bid => bid !== id)
    assert.equal(res.body.blockedBy.length, 0, 'blockedBy should be empty — self-dep silently filtered');
  });

  it('Direct circular dependency rejected with 400', async () => {
    const { goal } = await setupAreaAndGoal();
    const T1 = await setupTask(goal.id, { title: 'T1' });
    const T2 = await setupTask(goal.id, { title: 'T2' });

    // T1 blocked by T2 → ok
    const r1 = await agent()
      .put(`/api/tasks/${T1.id}/deps`)
      .send({ blockedByIds: [T2.id] });
    assert.equal(r1.status, 200, 'T1 → T2 should be accepted');

    // T2 blocked by T1 → circular: T2→T1→T2
    const r2 = await agent()
      .put(`/api/tasks/${T2.id}/deps`)
      .send({ blockedByIds: [T1.id] });
    assert.equal(r2.status, 400, 'T2 → T1 creates a cycle and should return 400');
    assert.ok(
      r2.body.error && r2.body.error.toLowerCase().includes('circular'),
      `expected "circular" in error, got: ${r2.body.error}`
    );
  });

  it('Three-way circular dependency rejected with 400', async () => {
    const { goal } = await setupAreaAndGoal();
    const T1 = await setupTask(goal.id, { title: 'T1 chain' });
    const T2 = await setupTask(goal.id, { title: 'T2 chain' });
    const T3 = await setupTask(goal.id, { title: 'T3 chain' });

    // T1 → T2
    const r1 = await agent()
      .put(`/api/tasks/${T1.id}/deps`)
      .send({ blockedByIds: [T2.id] });
    assert.equal(r1.status, 200, 'T1 blocked by T2 should succeed');

    // T2 → T3
    const r2 = await agent()
      .put(`/api/tasks/${T2.id}/deps`)
      .send({ blockedByIds: [T3.id] });
    assert.equal(r2.status, 200, 'T2 blocked by T3 should succeed');

    // T3 → T1 → cycle: T3→T1→T2→T3
    const r3 = await agent()
      .put(`/api/tasks/${T3.id}/deps`)
      .send({ blockedByIds: [T1.id] });
    assert.equal(r3.status, 400, 'T3 → T1 should be rejected as it closes a three-way cycle');
    assert.ok(
      r3.body.error && r3.body.error.toLowerCase().includes('circular'),
      `expected "circular" in error, got: ${r3.body.error}`
    );
  });

  it('Deep dependency chain (10 tasks) — all accepted within depth limit', async () => {
    const { goal } = await setupAreaAndGoal();

    // Create 10 tasks
    const tasks = [];
    for (let i = 0; i < 10; i++) {
      const t = await setupTask(goal.id, { title: `Chain Task ${i + 1}` });
      tasks.push(t);
    }

    // Chain: T[i+1] blocked by T[i] — linear chain of 9 deps
    for (let i = 0; i < tasks.length - 1; i++) {
      const res = await agent()
        .put(`/api/tasks/${tasks[i + 1].id}/deps`)
        .send({ blockedByIds: [tasks[i].id] });
      assert.equal(res.status, 200, `link tasks[${i + 1}] → tasks[${i}] should succeed`);
    }

    // Verify the chain is correct (last task is blocked by 9th)
    const depsRes = await agent().get(`/api/tasks/${tasks[9].id}/deps`);
    assert.equal(depsRes.status, 200);
    assert.equal(depsRes.body.blockedBy.length, 1, 'last task should have exactly 1 direct blocker');
    assert.equal(depsRes.body.blockedBy[0].id, tasks[8].id, 'blocked by the 9th task');
  });

  it('Deps chain 101 nodes — adding last link either 200 (within limit) or 400 (chain too deep)', async () => {
    const { goal } = await setupAreaAndGoal();

    // Create 102 tasks
    const tasks = [];
    for (let i = 0; i < 102; i++) {
      const t = await setupTask(goal.id, { title: `Deep Task ${i + 1}` });
      tasks.push(t);
    }

    // Build chain of 100 links: T[i+1] blocked by T[i] for i=0..99
    for (let i = 0; i < 100; i++) {
      const res = await agent()
        .put(`/api/tasks/${tasks[i + 1].id}/deps`)
        .send({ blockedByIds: [tasks[i].id] });
      // Links 0-99 should succeed (chain depth 1-100)
      assert.equal(res.status, 200, `link ${i + 1} should succeed`);
    }

    // Adding the 101st link (tasks[101] → tasks[100]) makes the chain 101 nodes deep
    // Server uses MAX_DEPTH=100 for visited set; at >100 visited it returns 400
    const finalRes = await agent()
      .put(`/api/tasks/${tasks[101].id}/deps`)
      .send({ blockedByIds: [tasks[100].id] });

    assert.ok(
      finalRes.status === 200 || finalRes.status === 400,
      `expected 200 or 400, got ${finalRes.status}`
    );
    // Document the actual behavior
    if (finalRes.status === 400) {
      assert.ok(
        finalRes.body.error && (finalRes.body.error.includes('deep') || finalRes.body.error.includes('circular')),
        `Expected depth or circular error, got: ${finalRes.body.error}`
      );
    }
    // If 200: the chain accepted (visited.size never exceeded 100 before DFS completion)
  });

  // ======================================================================
  // GROUP: Bulk Operations
  // ======================================================================

  it('Negative position in task reorder — FIXED: silently skipped (position >= 0 guard)', async () => {
    const { goal } = await setupAreaAndGoal();
    const task = await setupTask(goal.id, { title: 'Reorder Target' });

    // PUT with negative position — now guarded with position >= 0 check
    const res = await agent()
      .put('/api/tasks/reorder')
      .send({ items: [{ id: task.id, position: -5 }] });

    assert.equal(res.status, 200, 'reorder still returns 200');
    assert.ok(res.body.ok, 'response should have ok:true');

    // Verify the task was NOT updated to negative position
    const tasksRes = await agent().get(`/api/goals/${goal.id}/tasks`);
    assert.equal(tasksRes.status, 200);
    const updated = tasksRes.body.find(t => t.id === task.id);
    assert.ok(updated, 'task should still exist');
    assert.notEqual(updated.position, -5, 'FIXED: negative position not stored');
  });

  it('Bulk myday — empty array returns updated:0', async () => {
    const res = await agent()
      .post('/api/tasks/bulk-myday')
      .send({ ids: [] });

    assert.equal(res.status, 200, 'empty ids array should return 200');
    assert.equal(res.body.updated, 0, 'updated count should be 0 for empty array');
  });

  it('Bulk reschedule — invalid date format rejected with 400', async () => {
    const res = await agent()
      .post('/api/tasks/reschedule')
      .send({ ids: [1, 2, 3], due_date: 'not-a-date' });

    assert.equal(res.status, 400, 'invalid date format should return 400');
    assert.ok(res.body.error, 'response should have error field');
    assert.ok(
      res.body.error.toLowerCase().includes('yyyy-mm-dd') || res.body.error.toLowerCase().includes('due_date'),
      `expected date format error, got: ${res.body.error}`
    );
  });

  it('Bulk reschedule — valid date format updates task', async () => {
    const { goal } = await setupAreaAndGoal();
    const task = await setupTask(goal.id, { title: 'To Reschedule' });

    const res = await agent()
      .post('/api/tasks/reschedule')
      .send({ ids: [task.id], due_date: '2025-06-15' });

    assert.equal(res.status, 200, 'valid reschedule should return 200');
    assert.equal(res.body.updated, 1, 'should report 1 updated');

    // Verify the task's due_date was actually changed
    const taskRes = await agent().get(`/api/tasks/${task.id}`);
    assert.equal(taskRes.status, 200);
    assert.equal(taskRes.body.due_date, '2025-06-15', "task's due_date should be updated to 2025-06-15");
  });

  it('Bulk reschedule — atomic transaction updates both tasks', async () => {
    const { goal } = await setupAreaAndGoal();
    const T1 = await setupTask(goal.id, { title: 'Reschedule T1' });
    const T2 = await setupTask(goal.id, { title: 'Reschedule T2' });

    const res = await agent()
      .post('/api/tasks/reschedule')
      .send({ ids: [T1.id, T2.id], due_date: '2025-01-01' });

    assert.equal(res.status, 200, 'bulk reschedule should succeed');
    assert.equal(res.body.updated, 2, 'should report 2 updated');

    const t1Res = await agent().get(`/api/tasks/${T1.id}`);
    const t2Res = await agent().get(`/api/tasks/${T2.id}`);
    assert.equal(t1Res.body.due_date, '2025-01-01', 'T1 due_date should be updated');
    assert.equal(t2Res.body.due_date, '2025-01-01', 'T2 due_date should be updated');
  });

  // ======================================================================
  // GROUP: Weekly Reviews
  // ======================================================================

  it('Review with malformed week_start — SERVER BUG: crashes with 500', async () => {
    // BUG REPORT: POST /api/reviews does not validate week_start format before using it
    // in `new Date(week_start)` date arithmetic. When week_start is "not-a-date", `new Date("not-a-date")`
    // returns an Invalid Date, and calling `.setDate()` on it throws "Invalid time value" (TypeError).
    // Express catches it and returns 500. The fix would be to validate week_start as YYYY-MM-DD first.
    const res = await agent()
      .post('/api/reviews')
      .send({ week_start: 'not-a-date' });

    assert.equal(res.status, 500,
      'BUG CONFIRMED: malformed week_start causes unhandled date arithmetic crash → 500');
  });

  it('Review rating clamped — 0 stored as 1 (cannot store zero rating)', async () => {
    const res = await agent()
      .post('/api/reviews')
      .send({ week_start: '2024-01-01', rating: 0 });

    assert.ok(res.status === 200 || res.status === 201, `expected 200/201, got ${res.status}`);
    assert.equal(
      res.body.rating,
      1,
      'rating 0 should be clamped to 1 via Math.max(1, ...) — users cannot store a 0 rating'
    );
  });

  it('Review rating clamped — 6 stored as 5', async () => {
    const res = await agent()
      .post('/api/reviews')
      .send({ week_start: '2024-01-01', rating: 6 });

    assert.ok(res.status === 200 || res.status === 201, `expected 200/201, got ${res.status}`);
    assert.equal(res.body.rating, 5, 'rating 6 should be clamped to 5 via Math.min(5, ...)');
  });

  it('Review rating: null when not provided', async () => {
    const res = await agent()
      .post('/api/reviews')
      .send({ week_start: '2024-01-01' });

    assert.ok(res.status === 200 || res.status === 201, `expected 200/201, got ${res.status}`);
    assert.equal(res.body.rating, null, 'rating should be null when not provided in request body');
  });

  it('Review upsert — same week_start updates existing, only 1 review stored', async () => {
    // First POST
    const r1 = await agent()
      .post('/api/reviews')
      .send({ week_start: '2024-01-01', reflection: 'first' });
    assert.ok(r1.status === 200 || r1.status === 201, `first review: expected 200/201, got ${r1.status}`);

    // Second POST with same week_start but different reflection
    const r2 = await agent()
      .post('/api/reviews')
      .send({ week_start: '2024-01-01', reflection: 'updated' });
    assert.ok(r2.status === 200 || r2.status === 201, `upsert review: expected 200/201, got ${r2.status}`);

    // GET all reviews and verify deduplication
    const listRes = await agent().get('/api/reviews');
    assert.equal(listRes.status, 200);
    const weekReviews = listRes.body.filter(r => r.week_start === '2024-01-01');
    assert.equal(weekReviews.length, 1, 'only 1 review should exist for week_start 2024-01-01 (upsert)');
    assert.equal(weekReviews[0].reflection, 'updated', 'reflection should be updated to the second value');
  });

  // ======================================================================
  // GROUP: Import DoS Protection
  // ======================================================================

  it('Import — 1000 tasks performance test completes within 10 seconds', async () => {
    // Import requires both `confirm: 'DESTROY_ALL_DATA'` (body field) AND
    // `password: 'testpassword'` (requirePassword middleware on this route).
    const tasks = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      title: `Task ${i}`,
      note: '',
      status: 'todo',
      priority: 0,
      position: i,
      goal_id: 1,
      subtasks: []
    }));

    const importBody = {
      confirm: 'DESTROY_ALL_DATA',
      password: 'testpassword',
      areas: [{ id: 1, name: 'A', icon: '📋', color: '#FF0000', position: 0 }],
      goals: [{ id: 1, title: 'G', description: '', color: '#6C63FF', status: 'active', position: 0, area_id: 1 }],
      tasks,
      tags: []
    };

    const start = Date.now();
    const res = await agent()
      .post('/api/import')
      .send(importBody)
      .timeout(15000);
    const elapsed = Date.now() - start;

    assert.equal(res.status, 200, `import should succeed, got: ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(res.body.ok, 'import response should have ok:true');
    assert.ok(elapsed < 10000, `import of 1000 tasks should complete in under 10 seconds (took ${elapsed}ms)`);
  });

  it('Triage inbox item — missing goal_id returns 400', async () => {
    // Create an inbox item
    const inboxRes = await agent()
      .post('/api/inbox')
      .send({ title: 'Triage me' });
    assert.equal(inboxRes.status, 201, 'inbox item creation should succeed');
    const item = inboxRes.body;

    // Triage without goal_id
    const res = await agent()
      .post(`/api/inbox/${item.id}/triage`)
      .send({});

    assert.equal(res.status, 400, 'triage without goal_id should return 400');
    assert.ok(res.body.error, 'response should have error field');
    assert.ok(
      res.body.error.toLowerCase().includes('goal_id'),
      `expected "goal_id" in error, got: ${res.body.error}`
    );
  });

  it('Triage inbox item to non-existent goal — returns 403', async () => {
    const inboxRes = await agent()
      .post('/api/inbox')
      .send({ title: 'Triage to nowhere' });
    assert.equal(inboxRes.status, 201);
    const item = inboxRes.body;

    // Triage to a goal that doesn't exist
    const res = await agent()
      .post(`/api/inbox/${item.id}/triage`)
      .send({ goal_id: 99999 });

    assert.equal(res.status, 403, 'triage to non-owned/nonexistent goal should return 403');
    assert.ok(res.body.error, 'response should have error');
  });

  // ======================================================================
  // GROUP: Skip Recurring
  // ======================================================================

  it('Skip non-recurring task — returns 400 "Not a recurring task"', async () => {
    const { goal } = await setupAreaAndGoal();
    const task = await setupTask(goal.id, { title: 'Non-recurring Skip Test' });

    const res = await agent().post(`/api/tasks/${task.id}/skip`);

    assert.equal(res.status, 400, 'skip on non-recurring task should return 400');
    assert.ok(res.body.error, 'response should have error field');
    assert.ok(
      res.body.error.toLowerCase().includes('recurring'),
      `expected "recurring" in error message, got: ${res.body.error}`
    );
  });

  it('Skip recurring task — spawns next occurrence with incremented count', async () => {
    const { goal } = await setupAreaAndGoal();
    const task = await setupTask(goal.id, {
      title: 'Skip Recurring',
      due_date: '2024-01-15',
      recurring: JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 3, count: 0 })
    });

    const res = await agent().post(`/api/tasks/${task.id}/skip`);

    assert.equal(res.status, 200, 'skip should return 200');
    assert.ok(res.body.skipped, 'response should have skipped field');
    assert.equal(res.body.skipped, task.id, 'skipped field should be the original task id');
    assert.ok(res.body.next, 'next field should be present and non-null');
    assert.ok(res.body.next.id, 'next task should have an id');

    // Verify the next task has count=1
    const newTaskRes = await agent().get(`/api/tasks/${res.body.next.id}`);
    assert.equal(newTaskRes.status, 200);
    const newCfg = JSON.parse(newTaskRes.body.recurring);
    assert.equal(newCfg.count, 1, 'skipped task should spawn next with count incremented to 1');
    assert.equal(newTaskRes.body.due_date, '2024-01-16', 'next task due_date should be the next day');
  });

  it('Skip recurring task with endAfter already reached — next is null', async () => {
    const { goal } = await setupAreaAndGoal();
    // count=1, endAfter=1 → count >= endAfter → nextDueDate returns null
    const task = await setupTask(goal.id, {
      title: 'Skip — endAfter reached',
      due_date: '2024-01-15',
      recurring: JSON.stringify({ pattern: 'daily', interval: 1, endAfter: 1, count: 1 })
    });

    const res = await agent().post(`/api/tasks/${task.id}/skip`);

    assert.equal(res.status, 200, 'skip should return 200 even when endAfter is reached');
    assert.equal(res.body.skipped, task.id, 'should confirm which task was skipped');
    assert.equal(res.body.next, null, 'next should be null since count(1) >= endAfter(1)');
  });

});
