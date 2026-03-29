const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeTag, linkTag, agent } = require('./helpers');

describe('Concurrency & Race Condition Tests', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── Test 1: Double-submit task completion — only one recurring spawn ───
  it('double-submit task completion — only one recurring spawn', async () => {
    // NOTE: SQLite with better-sqlite3 serializes all writes synchronously.
    // Two "simultaneous" HTTP requests via supertest will still be processed one
    // at a time by Node's event loop. The TOCTOU window here is:
    //   read ex.status ('todo') → check ex.recurring → write 'done' → spawn child
    // Both requests read ex.status='todo' before either writes, so both would
    // spawn a recurring child if they truly ran in parallel. In practice, because
    // better-sqlite3 is synchronous, the first request completes entirely before
    // the second starts — meaning the second sees ex.status='done' and skips spawn.
    // This test documents that behavior and guards against any future async refactor.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { recurring: 'daily', due_date: '2024-01-01' });

    const [r1, r2] = await Promise.all([
      agent().put('/api/tasks/' + task.id).send({ status: 'done' }),
      agent().put('/api/tasks/' + task.id).send({ status: 'done' })
    ]);

    // Both must not crash the server
    assert.ok(r1.status !== 500, `r1 crashed with 500: ${JSON.stringify(r1.body)}`);
    assert.ok(r2.status !== 500, `r2 crashed with 500: ${JSON.stringify(r2.body)}`);
    assert.equal(r1.status, 200, `r1 expected 200, got ${r1.status}`);
    assert.equal(r2.status, 200, `r2 expected 200, got ${r2.status}`);

    const tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.status, 200);
    const tasks = tasksRes.body;

    // Ideal: exactly 2 tasks (original + 1 recurring child).
    // If 2 children spawned, this assert fails and documents a confirmed TOCTOU bug.
    assert.equal(
      tasks.length,
      2,
      `TOCTOU RACE BUG DETECTED: expected 2 tasks (original + 1 child), got ${tasks.length}. ` +
      `Both concurrent completions spawned a recurring child.`
    );

    const children = tasks.filter(t => t.id !== task.id);
    assert.equal(children.length, 1, 'Exactly one recurring child task should exist');
    assert.equal(children[0].due_date, '2024-01-02', 'Child due date should be next day');
  });

  // ─── Test 2: Concurrent duplicate tag creation — constraint handling ───
  it('concurrent duplicate tag creation — no 500, exactly one tag', async () => {
    // The tag POST handler has a TOCTOU gap:
    //   SELECT where name='race-tag' → (tag not found) → INSERT
    // If two requests both hit the SELECT before either INSERTs, both proceed to
    // INSERT and the second will hit a SQLITE_CONSTRAINT UNIQUE violation.
    // In practice, better-sqlite3 serializes INSERTs, so the second request's
    // SELECT may still see the tag inserted by the first. This test documents
    // which path actually occurs.
    const [r1, r2] = await Promise.all([
      agent().post('/api/tags').send({ name: 'race-tag', color: '#111111' }),
      agent().post('/api/tags').send({ name: 'race-tag', color: '#222222' })
    ]);

    // Neither should return 500 — the upsert logic or UNIQUE constraint error
    // should be handled gracefully
    assert.ok(
      r1.status !== 500,
      `r1 returned 500 (unhandled SQLITE_CONSTRAINT?): ${JSON.stringify(r1.body)}`
    );
    assert.ok(
      r2.status !== 500,
      `r2 returned 500 (unhandled SQLITE_CONSTRAINT?): ${JSON.stringify(r2.body)}`
    );

    // Both should succeed (200 = existing returned, 201 = newly created)
    assert.ok([200, 201].includes(r1.status), `r1 unexpected status ${r1.status}`);
    assert.ok([200, 201].includes(r2.status), `r2 unexpected status ${r2.status}`);

    const tagsRes = await agent().get('/api/tags');
    assert.equal(tagsRes.status, 200);
    const raceTags = tagsRes.body.filter(t => t.name === 'race-tag');

    // Exactly one tag named 'race-tag' must exist — no duplicate rows
    assert.equal(
      raceTags.length,
      1,
      `DUPLICATE TAG BUG: expected 1 tag named 'race-tag', got ${raceTags.length}. ` +
      `Concurrent inserts created duplicate rows.`
    );
  });

  // ─── Test 3: Concurrent area deletion and goal creation ───
  it('concurrent area deletion and goal creation — no 500 crash', async () => {
    // Race between DELETE /api/areas/:id and POST /api/areas/:id/goals.
    // Possible outcomes:
    //   A) Delete wins: goal POST gets 404 (area gone). No orphan.
    //   B) Goal POST wins: goal created, then delete cascades it away.
    // Either outcome is acceptable. A 500 is not.
    const area = makeArea();

    const [delRes, goalRes] = await Promise.all([
      agent().delete('/api/areas/' + area.id),
      agent().post('/api/areas/' + area.id + '/goals').send({ title: 'Race Goal', color: '#FF0000' })
    ]);

    assert.ok(delRes.status !== 500, `DELETE /api/areas crashed: ${JSON.stringify(delRes.body)}`);
    assert.ok(goalRes.status !== 500, `POST /api/areas/goals crashed: ${JSON.stringify(goalRes.body)}`);

    // Delete should succeed with 200
    assert.equal(delRes.status, 200, `Area delete expected 200, got ${delRes.status}`);

    // Goal creation is either 201 (goal POST won) or 404 (delete won first)
    assert.ok(
      [201, 404].includes(goalRes.status),
      `Goal creation unexpected status: ${goalRes.status} — ${JSON.stringify(goalRes.body)}`
    );

    // Regardless, after both complete the area must be gone
    const areasRes = await agent().get('/api/areas');
    assert.equal(areasRes.status, 200);
    const found = areasRes.body.find(a => a.id === area.id);
    assert.ok(!found, 'Area should be deleted — not found in list');
  });

  // ─── Test 4: Concurrent position updates — no corruption ───
  it('concurrent position updates — all tasks retain integer positions', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(makeTask(goal.id, { title: `Task ${i}`, position: i }));
    }

    // Fire 5 simultaneous reorder requests with different position offsets
    const reqs = Array.from({ length: 5 }, (_, i) =>
      agent().put('/api/tasks/reorder').send({
        items: tasks.map((t, j) => ({ id: t.id, position: (i * 5 + j) % 10 }))
      })
    );
    const results = await Promise.all(reqs);

    // All reorder requests must succeed without error
    for (let i = 0; i < results.length; i++) {
      assert.equal(
        results[i].status,
        200,
        `Reorder request ${i} failed with ${results[i].status}: ${JSON.stringify(results[i].body)}`
      );
    }

    // All tasks must still exist with valid integer positions
    const tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.status, 200);
    const finalTasks = tasksRes.body;
    assert.equal(finalTasks.length, 5, `Expected 5 tasks, got ${finalTasks.length}`);

    for (const t of finalTasks) {
      assert.ok(
        Number.isInteger(t.position),
        `Task ${t.id} has non-integer position: ${JSON.stringify(t.position)}`
      );
      assert.ok(t.position !== null, `Task ${t.id} has null position`);
    }
  });

  // ─── Test 5: Concurrent subtask creation — all inserted correctly ───
  it('concurrent subtask creation — all 5 subtasks created', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const reqs = Array.from({ length: 5 }, (_, i) =>
      agent().post('/api/tasks/' + task.id + '/subtasks').send({ title: 'Sub ' + i })
    );
    const results = await Promise.all(reqs);

    for (let i = 0; i < results.length; i++) {
      assert.equal(
        results[i].status,
        201,
        `Subtask creation ${i} failed with ${results[i].status}: ${JSON.stringify(results[i].body)}`
      );
    }

    // Verify all 5 subtasks are present
    const subtasksRes = await agent().get('/api/tasks/' + task.id + '/subtasks');
    assert.equal(subtasksRes.status, 200);
    assert.equal(
      subtasksRes.body.length,
      5,
      `Expected 5 subtasks, got ${subtasksRes.body.length}. Some concurrent inserts may have been dropped.`
    );
  });

  // ─── Test 6: Concurrent comment creation — all inserted ───
  it('concurrent comment creation — all 3 comments created', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const [r1, r2, r3] = await Promise.all([
      agent().post('/api/tasks/' + task.id + '/comments').send({ text: 'Comment 1' }),
      agent().post('/api/tasks/' + task.id + '/comments').send({ text: 'Comment 2' }),
      agent().post('/api/tasks/' + task.id + '/comments').send({ text: 'Comment 3' })
    ]);

    assert.equal(r1.status, 201, `Comment 1 failed: ${JSON.stringify(r1.body)}`);
    assert.equal(r2.status, 201, `Comment 2 failed: ${JSON.stringify(r2.body)}`);
    assert.equal(r3.status, 201, `Comment 3 failed: ${JSON.stringify(r3.body)}`);

    const commentsRes = await agent().get('/api/tasks/' + task.id + '/comments');
    assert.equal(commentsRes.status, 200);
    assert.equal(
      commentsRes.body.length,
      3,
      `Expected 3 comments, got ${commentsRes.body.length}`
    );

    const texts = commentsRes.body.map(c => c.text).sort();
    assert.deepEqual(texts, ['Comment 1', 'Comment 2', 'Comment 3']);
  });

  // ─── Test 7: Rapid status cycling — expected double-spawn ───
  it('rapid status cycling confirms second completion spawns another child', async () => {
    // This test documents EXPECTED (not ideal) behavior:
    // The recurring spawn guard checks: status === 'done' && ex.status !== 'done'
    // If a task is re-opened (todo) after being completed, completing it again
    // passes the guard and spawns another child. This is by design, but worth confirming.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { recurring: 'daily', due_date: '2024-01-01' });

    // First completion — should spawn one child
    const comp1 = await agent().put('/api/tasks/' + task.id).send({ status: 'done' });
    assert.equal(comp1.status, 200, `First completion failed: ${JSON.stringify(comp1.body)}`);

    let tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.body.length, 2, 'After first completion: original + 1 child expected');

    // Re-open the original task
    const reopen = await agent().put('/api/tasks/' + task.id).send({ status: 'todo' });
    assert.equal(reopen.status, 200, `Re-open failed: ${JSON.stringify(reopen.body)}`);

    // Second completion — guard sees ex.status='todo' again, so it WILL spawn another child
    const comp2 = await agent().put('/api/tasks/' + task.id).send({ status: 'done' });
    assert.equal(comp2.status, 200, `Second completion failed: ${JSON.stringify(comp2.body)}`);

    tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    // 2 children spawned total (one per completion) + original = 3
    assert.equal(
      tasksRes.body.length,
      3,
      `Expected 3 tasks (original + 2 spawned children) after status cycling, ` +
      `got ${tasksRes.body.length}. The second completion should always spawn a child ` +
      `when task is re-opened first.`
    );
  });

  // ─── Test 8: Concurrent dep set and task delete ───
  it('concurrent dep set and task delete — no 500, consistent final state', async () => {
    // Race between setting T2 blocked-by T1, and deleting T1.
    // The task_deps table has ON DELETE CASCADE from tasks, so if T1 is deleted
    // any dep referencing it is also removed.
    // Possible outcomes:
    //   A) Dep-set wins: T1 stored in task_deps, then T1 delete cascades dep row away.
    //   B) Delete wins: T1 gone, dep-set's INSERT OR IGNORE references non-existent T1
    //      (foreign key enforced if FK pragma is ON — may fail silently with OR IGNORE).
    // Either way: no 500, and final dep list for T2 is empty.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Blocker' });
    const t2 = makeTask(goal.id, { title: 'Blocked' });

    const [depRes, delRes] = await Promise.all([
      agent().put('/api/tasks/' + t2.id + '/deps').send({ blockedByIds: [t1.id] }),
      agent().delete('/api/tasks/' + t1.id)
    ]);

    assert.ok(depRes.status !== 500, `Dep set crashed: ${JSON.stringify(depRes.body)}`);
    assert.ok(delRes.status !== 500, `Task delete crashed: ${JSON.stringify(delRes.body)}`);

    assert.equal(delRes.status, 200, `Delete expected 200, got ${delRes.status}`);
    assert.ok([200, 404].includes(depRes.status), `Dep set unexpected status: ${depRes.status}`);

    // After both settle, T2's blockedBy list must be empty (T1 is gone)
    const depsRes = await agent().get('/api/tasks/' + t2.id + '/deps');
    assert.equal(depsRes.status, 200);
    assert.equal(
      depsRes.body.blockedBy.length,
      0,
      `Expected empty blockedBy after T1 deleted, got: ${JSON.stringify(depsRes.body.blockedBy)}`
    );
  });

  // ─── Test 9: Double-complete on non-recurring task — idempotent ───
  it('double-complete on non-recurring task — idempotent, no extra tasks', async () => {
    // Non-recurring tasks: completing twice must not create any child tasks.
    // The guard (ex.recurring) prevents spawning, so this should be safe
    // even without SQLite serialization. This test confirms idempotency.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id); // no recurring

    const comp1 = await agent().put('/api/tasks/' + task.id).send({ status: 'done' });
    assert.equal(comp1.status, 200, `First completion failed: ${JSON.stringify(comp1.body)}`);

    const comp2 = await agent().put('/api/tasks/' + task.id).send({ status: 'done' });
    assert.equal(comp2.status, 200, `Second completion failed: ${JSON.stringify(comp2.body)}`);

    const tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.status, 200);
    assert.equal(
      tasksRes.body.length,
      1,
      `Expected exactly 1 task (no spawn for non-recurring), got ${tasksRes.body.length}`
    );
    assert.equal(tasksRes.body[0].status, 'done');
  });

  // ─── Test 10: Concurrent focus session creation — multiple valid sessions ───
  it('concurrent focus session creation — all sessions recorded, totals correct', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const SESSIONS = 3;
    const DURATION = 1500;

    const reqs = Array.from({ length: SESSIONS }, () =>
      agent().post('/api/focus').send({ task_id: task.id, duration_sec: DURATION })
    );
    const results = await Promise.all(reqs);

    for (let i = 0; i < results.length; i++) {
      assert.equal(
        results[i].status,
        201,
        `Focus session ${i} failed with ${results[i].status}: ${JSON.stringify(results[i].body)}`
      );
    }

    // Verify all sessions were stored — today's total should be SESSIONS * DURATION
    const statsRes = await agent().get('/api/focus/stats');
    assert.equal(statsRes.status, 200);
    assert.equal(
      statsRes.body.today,
      SESSIONS * DURATION,
      `Expected today total=${SESSIONS * DURATION}s, got ${statsRes.body.today}s. ` +
      `Some concurrent focus sessions may have been lost.`
    );
  });

  // ─── Test 11: Sequential imports — no data doubling ───
  it('sequential imports — second import wipes then reloads, server stays stable', async () => {
    // NOTE: POST /api/import requires confirm:'DESTROY_ALL_DATA' in the body.
    // The import is NOT idempotent — it clears all user data before inserting.
    // Running it twice: first import loads data, second import wipes it and reloads
    // from the same snapshot. The final count should equal one import's worth of data.
    const area = makeArea({ name: 'Import Area' });
    const goal = makeGoal(area.id, { title: 'Import Goal' });
    makeTask(goal.id, { title: 'Import Task 1' });
    makeTask(goal.id, { title: 'Import Task 2' });

    // Export current state
    const exportRes = await agent().get('/api/export');
    assert.equal(exportRes.status, 200);
    const exportData = exportRes.body;

    // The import endpoint requires confirm field and non-empty arrays
    // POST /api/import requires both confirm:'DESTROY_ALL_DATA' and password confirmation
    // (requirePassword middleware is applied at app level before the route handler).
    // The test user's password is 'testpassword' (set in helpers._ensureTestAuth).
    const importPayload = { ...exportData, confirm: 'DESTROY_ALL_DATA', password: 'testpassword' };

    // First import
    const import1 = await agent().post('/api/import').send(importPayload);
    assert.ok(import1.status !== 500, `First import crashed: ${JSON.stringify(import1.body)}`);
    assert.ok([200, 201].includes(import1.status), `First import unexpected status: ${import1.status} — body: ${JSON.stringify(import1.body)}`);

    // Get task count after first import
    const afterImport1 = await agent().get('/api/tasks/all');
    assert.equal(afterImport1.status, 200);
    const tasksAfter1 = Array.isArray(afterImport1.body)
      ? afterImport1.body
      : afterImport1.body.items || [];
    const countAfterImport1 = tasksAfter1.length;

    // Second import — clears existing data, then reloads same snapshot
    const import2 = await agent().post('/api/import').send(importPayload);
    assert.ok(import2.status !== 500, `Second import crashed: ${JSON.stringify(import2.body)}`);
    assert.ok([200, 201].includes(import2.status), `Second import unexpected status: ${import2.status}`);

    const afterImport2 = await agent().get('/api/tasks/all');
    assert.equal(afterImport2.status, 200);
    const tasksAfter2 = Array.isArray(afterImport2.body)
      ? afterImport2.body
      : afterImport2.body.items || [];
    const countAfterImport2 = tasksAfter2.length;

    // Second import wipes then re-adds same snapshot — count must equal first import count,
    // not double it. This confirms the DELETE-then-INSERT pattern works correctly.
    assert.equal(
      countAfterImport2,
      countAfterImport1,
      `Second import doubled data: after import1=${countAfterImport1}, after import2=${countAfterImport2}. ` +
      `The import should REPLACE data (delete-then-insert), not append it.`
    );
    assert.ok(countAfterImport2 > 0, 'After two sequential imports, some tasks must exist');
  });

  // ─── Test 12: Rapid tag assignment and removal — final state is last write ───
  it('rapid tag cycling — final state reflects last assignment', async () => {
    // PUT /api/tasks/:id/tags DELETEs all task_tags then re-inserts.
    // Three sequential rapid assignments — the last one must win.
    // Because these are sequential (not truly parallel in this implementation),
    // the final state should match the last call made.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tag1 = makeTag({ name: 'tag-alpha' });
    const tag2 = makeTag({ name: 'tag-beta' });
    const tag3 = makeTag({ name: 'tag-gamma' });

    // Sequential rapid cycling
    const r1 = await agent().put('/api/tasks/' + task.id + '/tags').send({ tagIds: [tag1.id, tag2.id] });
    assert.ok(r1.status !== 500, `Tag set 1 crashed: ${JSON.stringify(r1.body)}`);

    const r2 = await agent().put('/api/tasks/' + task.id + '/tags').send({ tagIds: [tag2.id, tag3.id] });
    assert.ok(r2.status !== 500, `Tag set 2 crashed: ${JSON.stringify(r2.body)}`);

    const r3 = await agent().put('/api/tasks/' + task.id + '/tags').send({ tagIds: [tag1.id] });
    assert.ok(r3.status !== 500, `Tag set 3 crashed: ${JSON.stringify(r3.body)}`);

    // Final state: only tag1 should remain
    const taskRes = await agent().get('/api/tasks/' + task.id);
    assert.equal(taskRes.status, 200);
    const finalTags = taskRes.body.tags || [];
    assert.equal(
      finalTags.length,
      1,
      `Expected 1 tag after cycling, got ${finalTags.length}: ${JSON.stringify(finalTags)}`
    );
    assert.equal(
      finalTags[0].id,
      tag1.id,
      `Expected tag1 (id=${tag1.id}) to be the final tag, got: ${JSON.stringify(finalTags[0])}`
    );
  });

  // ─── Test 12b: Concurrent tag assignment — no 500, consistent final state ───
  it('concurrent tag assignment — no 500, task ends up with valid tag set', async () => {
    // When DELETE-then-INSERT sequences interleave, task_tags could temporarily be empty
    // or have mixed state. This probes whether concurrent PUT /tags leads to any crash.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tagA = makeTag({ name: 'concurrent-a' });
    const tagB = makeTag({ name: 'concurrent-b' });

    const [ra, rb] = await Promise.all([
      agent().put('/api/tasks/' + task.id + '/tags').send({ tagIds: [tagA.id] }),
      agent().put('/api/tasks/' + task.id + '/tags').send({ tagIds: [tagB.id] })
    ]);

    assert.ok(ra.status !== 500, `Concurrent tag set A crashed: ${JSON.stringify(ra.body)}`);
    assert.ok(rb.status !== 500, `Concurrent tag set B crashed: ${JSON.stringify(rb.body)}`);

    // Final state: one of the two assignments must have won — not empty, not both
    const taskRes = await agent().get('/api/tasks/' + task.id);
    assert.equal(taskRes.status, 200);
    const finalTags = taskRes.body.tags || [];

    // Should be 1 tag (either A or B — whichever was last)
    assert.equal(
      finalTags.length,
      1,
      `Expected exactly 1 tag after concurrent assignment, got ${finalTags.length}: ${JSON.stringify(finalTags)}. ` +
      `This indicates a DELETE/INSERT interleaving left an unexpected state.`
    );

    const winningId = finalTags[0].id;
    assert.ok(
      [tagA.id, tagB.id].includes(winningId),
      `Winning tag id=${winningId} is neither tagA nor tagB`
    );
  });

  // ─── Test 13: Concurrent bulk-myday on same tasks — idempotent ───
  it('concurrent bulk-myday — idempotent, all tasks end with my_day=1', async () => {
    // PUT /api/tasks/bulk-myday runs UPDATE tasks SET my_day=1.
    // Multiple concurrent calls are safe because UPDATE is idempotent for the same value.
    // This test confirms no 500 and correct final state.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(makeTask(goal.id, { title: `MyDay Task ${i}`, my_day: 0 }));
    }

    const ids = tasks.map(t => t.id);

    const reqs = [
      agent().post('/api/tasks/bulk-myday').send({ ids }),
      agent().post('/api/tasks/bulk-myday').send({ ids }),
      agent().post('/api/tasks/bulk-myday').send({ ids })
    ];
    const results = await Promise.all(reqs);

    for (let i = 0; i < results.length; i++) {
      assert.ok(
        results[i].status !== 500,
        `bulk-myday request ${i} crashed: ${JSON.stringify(results[i].body)}`
      );
      assert.equal(
        results[i].status,
        200,
        `bulk-myday request ${i} returned ${results[i].status}: ${JSON.stringify(results[i].body)}`
      );
    }

    // All 5 tasks must have my_day=1
    const tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.status, 200);
    const finalTasks = tasksRes.body;
    assert.equal(finalTasks.length, tasks.length, `Expected ${tasks.length} tasks, got ${finalTasks.length}`);

    for (const t of finalTasks) {
      assert.equal(
        t.my_day,
        1,
        `Task ${t.id} (${t.title}) should have my_day=1, got ${t.my_day}`
      );
    }
  });

  // ─── Test 14: Concurrent task creation under same goal ───
  it('concurrent task creation under same goal — all tasks created with unique IDs', async () => {
    // SQLite's AUTOINCREMENT guarantees unique IDs even under concurrent inserts
    // (since better-sqlite3 serializes all writes). This verifies no ID collision.
    const area = makeArea();
    const goal = makeGoal(area.id);

    const reqs = Array.from({ length: 10 }, (_, i) =>
      agent().post('/api/goals/' + goal.id + '/tasks').send({ title: `Concurrent Task ${i}` })
    );
    const results = await Promise.all(reqs);

    for (let i = 0; i < results.length; i++) {
      assert.equal(
        results[i].status,
        201,
        `Task creation ${i} failed with ${results[i].status}: ${JSON.stringify(results[i].body)}`
      );
    }

    const ids = results.map(r => r.body.id);
    const uniqueIds = new Set(ids);
    assert.equal(
      uniqueIds.size,
      10,
      `ID collision detected: ${ids.length} tasks but only ${uniqueIds.size} unique IDs. IDs: ${JSON.stringify(ids)}`
    );

    const tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.status, 200);
    assert.equal(tasksRes.body.length, 10, `Expected 10 tasks in goal, got ${tasksRes.body.length}`);
  });

  // ─── Test 15: Concurrent area creation — all succeed with unique IDs ───
  it('concurrent area creation — all 5 areas created without conflict', async () => {
    const reqs = Array.from({ length: 5 }, (_, i) =>
      agent().post('/api/areas').send({ name: `Race Area ${i}`, icon: '⚡', color: '#FF0000' })
    );
    const results = await Promise.all(reqs);

    for (let i = 0; i < results.length; i++) {
      assert.equal(
        results[i].status,
        201,
        `Area creation ${i} failed with ${results[i].status}: ${JSON.stringify(results[i].body)}`
      );
    }

    const ids = results.map(r => r.body.id);
    const uniqueIds = new Set(ids);
    assert.equal(
      uniqueIds.size,
      5,
      `Area ID collision: only ${uniqueIds.size} unique IDs for 5 areas. IDs: ${JSON.stringify(ids)}`
    );
  });

  // ─── Test 16: Concurrent recurring task completions — TOCTOU stress test ───
  it('concurrent recurring completions with 5 parallel requests — bounded spawn count', async () => {
    // Stress test: fire 5 concurrent completions on the same recurring task.
    // best-sqlite3 serializes, so only the first completion should find ex.status='todo'
    // and spawn. All subsequent ones see ex.status='done' and skip spawn.
    // This is the critical TOCTOU scenario — documents actual bound on spawns.
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { recurring: 'daily', due_date: '2024-06-01' });

    const CONCURRENCY = 5;
    const reqs = Array.from({ length: CONCURRENCY }, () =>
      agent().put('/api/tasks/' + task.id).send({ status: 'done' })
    );
    const results = await Promise.all(reqs);

    for (let i = 0; i < results.length; i++) {
      assert.ok(
        results[i].status !== 500,
        `Completion request ${i} crashed: ${JSON.stringify(results[i].body)}`
      );
    }

    const tasksRes = await agent().get('/api/goals/' + goal.id + '/tasks');
    assert.equal(tasksRes.status, 200);
    const total = tasksRes.body.length;

    // Ideal: 2 (original + 1 spawn). Max with TOCTOU: 1 + CONCURRENCY.
    // Document actual count to detect regressions if async refactor occurs.
    assert.ok(
      total >= 2,
      `Expected at least 1 recurring child spawned, got total=${total}`
    );
    assert.ok(
      total <= 1 + CONCURRENCY,
      `Spawned too many children: total=${total}, max expected=${1 + CONCURRENCY}`
    );

    if (total === 2) {
      // Expected outcome with synchronous SQLite serialization
    } else {
      // This would indicate a TOCTOU race — log for visibility
      console.warn(
        `[TOCTOU WARNING] Recurring task spawned ${total - 1} children from ${CONCURRENCY} concurrent completions. ` +
        `Expected 1 spawn. This indicates concurrent read-check-write without a transaction guard.`
      );
    }
  });
});
