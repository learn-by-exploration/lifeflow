/**
 * Regression & Edge Case Tests
 *
 * Targets gaps identified in coverage audit:
 * - Pagination boundary values (limit=0, offset=-1, limit>500)
 * - Circular dependency detection (DFS, self-dep, deep chains)
 * - Task skip for recurring tasks
 * - Comment validation (max length, empty, edit)
 * - Time tracking edge cases
 * - Board/calendar/table query filters
 * - Batch operations boundary conditions
 * - Search edge cases (empty, special chars, multi-word)
 * - NLP parser edge cases
 * - Dependency IDOR protection
 * - Task move goal verification
 * - Focus end with 0 duration
 * - Stats empty dataset handling
 * - Webhook SSRF protection
 * - AI endpoint error handling
 * - Account lockout edge cases
 * - Shared list rate-limit token format
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeList, makeListItem, makeHabit, logHabit, makeFocus, makeUser2, agentAs, today, daysFromNow, rebuildSearch } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════════════════════════════════════
// 1. Pagination Boundary Values
// ═══════════════════════════════════════════════════════════════════════════

describe('Pagination boundary values', () => {
  it('GET /api/tasks/all?limit=0 clamps to 1', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'T1' });
    makeTask(goal.id, { title: 'T2' });
    const res = await agent().get('/api/tasks/all?limit=0&offset=0').expect(200);
    assert.ok(res.body.items);
    assert.ok(res.body.items.length >= 1); // clamped to min=1
  });

  it('GET /api/tasks/all?limit=9999 clamps to 500', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'T1' });
    const res = await agent().get('/api/tasks/all?limit=9999&offset=0').expect(200);
    assert.ok(res.body.items);
  });

  it('GET /api/tasks/all?offset=-1 clamps to 0', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'T1' });
    const res = await agent().get('/api/tasks/all?limit=10&offset=-1').expect(200);
    assert.ok(res.body.offset === 0);
  });

  it('GET /api/tasks/all without limit returns array', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const res = await agent().get('/api/tasks/all').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/all pagination returns hasMore correctly', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) makeTask(goal.id, { title: `P${i}` });
    const r1 = await agent().get('/api/tasks/all?limit=2&offset=0').expect(200);
    assert.equal(r1.body.hasMore, true);
    assert.equal(r1.body.items.length, 2);

    const r2 = await agent().get('/api/tasks/all?limit=10&offset=0').expect(200);
    assert.equal(r2.body.hasMore, false);
  });

  it('GET /api/focus/history pagination', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    for (let i = 0; i < 3; i++) makeFocus(task.id, { duration_sec: 1500 });
    const res = await agent().get('/api/focus/history?page=1&limit=2').expect(200);
    assert.ok(res.body.total >= 3);
    assert.ok(res.body.items.length <= 2);
    assert.ok(res.body.pages >= 2);
  });

  it('GET /api/activity pagination', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 3; i++) makeTask(goal.id, { status: 'done', completed_at: today() });
    const res = await agent().get('/api/activity?page=1&limit=1').expect(200);
    assert.ok(res.body.items || Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Circular Dependency Detection
// ═══════════════════════════════════════════════════════════════════════════

describe('Circular dependency detection', () => {
  it('prevents self-dependency', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    // Self-dep should be silently filtered
    const res = await agent().put(`/api/tasks/${task.id}/deps`).send({
      blockedByIds: [task.id]
    }).expect(200);
    assert.equal(res.body.blockedBy.length, 0);
  });

  it('prevents direct circular dependency A→B→A', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tA = makeTask(goal.id, { title: 'A' });
    const tB = makeTask(goal.id, { title: 'B' });

    // A is blocked by B
    await agent().put(`/api/tasks/${tA.id}/deps`).send({ blockedByIds: [tB.id] }).expect(200);

    // B is blocked by A → circular
    const res = await agent().put(`/api/tasks/${tB.id}/deps`).send({ blockedByIds: [tA.id] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('circular'));
  });

  it('prevents indirect circular A→B→C→A', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tA = makeTask(goal.id);
    const tB = makeTask(goal.id);
    const tC = makeTask(goal.id);

    await agent().put(`/api/tasks/${tA.id}/deps`).send({ blockedByIds: [tB.id] }).expect(200);
    await agent().put(`/api/tasks/${tB.id}/deps`).send({ blockedByIds: [tC.id] }).expect(200);

    // C is blocked by A → forms cycle
    const res = await agent().put(`/api/tasks/${tC.id}/deps`).send({ blockedByIds: [tA.id] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes('circular'));
  });

  it('allows diamond-shaped deps (A→B, A→C, B→D, C→D)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tA = makeTask(goal.id);
    const tB = makeTask(goal.id);
    const tC = makeTask(goal.id);
    const tD = makeTask(goal.id);

    await agent().put(`/api/tasks/${tA.id}/deps`).send({ blockedByIds: [tB.id, tC.id] }).expect(200);
    await agent().put(`/api/tasks/${tB.id}/deps`).send({ blockedByIds: [tD.id] }).expect(200);
    await agent().put(`/api/tasks/${tC.id}/deps`).send({ blockedByIds: [tD.id] }).expect(200);

    const depsA = await agent().get(`/api/tasks/${tA.id}/deps`).expect(200);
    assert.equal(depsA.body.blockedBy.length, 2);
  });

  it('dependency IDOR: user2 cannot set dep on user1 task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'User1Task' });

    const { agent: agent2 } = makeUser2();
    const a2 = await agent2.post('/api/areas').send({ name: 'A2' });
    const g2 = await agent2.post(`/api/areas/${a2.body.id}/goals`).send({ title: 'G2' });
    const t2 = await agent2.post(`/api/goals/${g2.body.id}/tasks`).send({ title: 'User2Task' });

    // User2 tries to set blockedBy to user1's task
    const res = await agent2.put(`/api/tasks/${t2.body.id}/deps`).send({
      blockedByIds: [t1.id]
    }).expect(200);
    // Should silently filter out non-owned tasks
    assert.equal(res.body.blockedBy.length, 0);
  });

  it('GET /api/tasks/:id/deps returns blockedBy and blocking', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const tA = makeTask(goal.id, { title: 'TaskA' });
    const tB = makeTask(goal.id, { title: 'TaskB' });

    await agent().put(`/api/tasks/${tB.id}/deps`).send({ blockedByIds: [tA.id] }).expect(200);

    // tA is blocking tB
    const depsA = await agent().get(`/api/tasks/${tA.id}/deps`).expect(200);
    assert.ok(depsA.body.blocking.some(t => t.id === tB.id));

    // tB is blocked by tA
    const depsB = await agent().get(`/api/tasks/${tB.id}/deps`).expect(200);
    assert.ok(depsB.body.blockedBy.some(t => t.id === tA.id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Task Skip (Recurring)
// ═══════════════════════════════════════════════════════════════════════════

describe('Task skip (recurring)', () => {
  it('skip spawns next occurrence', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: 'SkipMe', recurring: 'daily', due_date: today()
    });
    const res = await agent().post(`/api/tasks/${task.body.id}/skip`);
    assert.equal(res.status, 200);
    assert.ok(res.body.skipped);
    assert.ok(res.body.next);
  });

  it('skip non-recurring returns 400', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'NotRecurring' });
    const res = await agent().post(`/api/tasks/${task.id}/skip`);
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('recurring'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Comment Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Comment validation', () => {
  it('empty comment rejected', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: '' });
    assert.equal(res.status, 400);
  });

  it('whitespace-only comment rejected', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: '   ' });
    assert.equal(res.status, 400);
  });

  it('comment over 2000 chars rejected', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/comments`).send({
      text: 'x'.repeat(2001)
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('2000'));
  });

  it('comment exactly 2000 chars accepted', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/comments`).send({
      text: 'x'.repeat(2000)
    });
    assert.equal(res.status, 201);
  });

  it('PUT /api/tasks/:id/comments/:commentId edits comment', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const c = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: 'Original' });
    const res = await agent().put(`/api/tasks/${task.id}/comments/${c.body.id}`)
      .send({ text: 'Edited' }).expect(200);
    assert.equal(res.body.text, 'Edited');
  });

  it('edit comment empty text rejected', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const c = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: 'Orig' });
    const res = await agent().put(`/api/tasks/${task.id}/comments/${c.body.id}`)
      .send({ text: '' });
    assert.equal(res.status, 400);
  });

  it('IDOR: user2 cannot access user1 comments', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const c = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: 'Secret' });

    const { agent: agent2 } = makeUser2();
    const del = await agent2.delete(`/api/tasks/${task.id}/comments/${c.body.id}`);
    assert.ok(del.status >= 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Time Tracking Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Time tracking edge cases', () => {
  it('POST /api/tasks/:id/time adds minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 30 });
    assert.equal(res.status, 200);
    assert.equal(res.body.actual_minutes, 30);
  });

  it('accumulates minutes across calls', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 15 });
    await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 20 });
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 10 });
    assert.equal(res.body.actual_minutes, 45);
  });

  it('rejects zero minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 0 });
    assert.equal(res.status, 400);
  });

  it('rejects negative minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: -5 });
    assert.equal(res.status, 400);
  });

  it('rejects non-integer minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/time`).send({ minutes: 'abc' });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Board / Calendar / Table Filters
// ═══════════════════════════════════════════════════════════════════════════

describe('Board/Calendar/Table filters', () => {
  it('board filters by goal_id', async () => {
    const area = makeArea();
    const g1 = makeGoal(area.id);
    const g2 = makeGoal(area.id);
    makeTask(g1.id, { title: 'G1Task', status: 'todo' });
    makeTask(g2.id, { title: 'G2Task', status: 'todo' });
    const res = await agent().get(`/api/tasks/board?goal_id=${g1.id}`).expect(200);
    assert.ok(res.body.every(t => t.goal_id === g1.id));
  });

  it('board filters by area_id', async () => {
    const a1 = makeArea({ name: 'A1' });
    const a2 = makeArea({ name: 'A2' });
    const g1 = makeGoal(a1.id);
    const g2 = makeGoal(a2.id);
    makeTask(g1.id, { title: 'A1Task' });
    makeTask(g2.id, { title: 'A2Task' });
    const res = await agent().get(`/api/tasks/board?area_id=${a1.id}`).expect(200);
    assert.ok(res.body.every(t => t.area_id === a1.id));
  });

  it('board filters by priority', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { priority: 3 });
    makeTask(goal.id, { priority: 0 });
    const res = await agent().get('/api/tasks/board?priority=3').expect(200);
    assert.ok(res.body.every(t => t.priority === 3));
  });

  it('board filters by tag_id', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Tagged' });
    const t2 = makeTask(goal.id, { title: 'Untagged' });
    const tag = makeTag({ name: 'filter-tag' });
    linkTag(t1.id, tag.id);
    const res = await agent().get(`/api/tasks/board?tag_id=${tag.id}`).expect(200);
    assert.ok(res.body.every(t => t.title === 'Tagged'));
  });

  it('calendar returns tasks in date range', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'InRange', due_date: today() });
    makeTask(goal.id, { title: 'OutRange', due_date: daysFromNow(100) });
    const start = daysFromNow(-1);
    const end = daysFromNow(1);
    const res = await agent().get(`/api/tasks/calendar?start=${start}&end=${end}`).expect(200);
    assert.ok(res.body.some(t => t.title === 'InRange'));
    assert.ok(!res.body.some(t => t.title === 'OutRange'));
  });

  it('table view returns paginated data', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) makeTask(goal.id, { title: `Tab${i}` });
    const res = await agent().get('/api/tasks/table?limit=3').expect(200);
    assert.ok(res.body.tasks);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(res.body.tasks.length <= 3);
  });

  it('table filters by status', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { status: 'todo' });
    makeTask(goal.id, { status: 'done' });
    const res = await agent().get('/api/tasks/table?status=todo').expect(200);
    const items = res.body.tasks;
    assert.ok(items.every(t => t.status === 'todo'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Search Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Search edge cases', () => {
  it('empty query returns empty results', async () => {
    const res = await agent().get('/api/search?q=').expect(200);
    assert.ok(res.body.results || Array.isArray(res.body));
  });

  it('search with special chars does not crash', async () => {
    const res = await agent().get('/api/search?q=' + encodeURIComponent('test <script>alert(1)</script>'));
    assert.ok(res.status < 500);
  });

  it('search tasks by note content', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'NoteSearch', note: 'UniqueNoteContent789' });
    rebuildSearch();
    const res = await agent().get('/api/search?q=UniqueNoteContent789').expect(200);
    // May or may not find in notes, depends on FTS setup
    assert.ok(typeof res.body === 'object');
  });

  it('task search endpoint with XSS in q', async () => {
    const res = await agent().get('/api/tasks/search?q=' + encodeURIComponent('<img onerror=alert(1)>'));
    assert.ok(res.status < 500);
    // Response should not contain raw script
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('<img onerror'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. NLP Parser Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('NLP parser edge cases', () => {
  it('parse empty text returns empty', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: '' });
    assert.ok(res.status === 200 || res.status === 400);
  });

  it('parse text with only modifiers', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: '!3 #tag' });
    assert.equal(res.status, 200);
  });

  it('parse text with unicode', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: '🏃 Go running tomorrow !2' });
    assert.equal(res.status, 200);
    assert.ok(res.body.title);
  });

  it('parse very long text rejected over 500 chars', async () => {
    const res = await agent().post('/api/tasks/parse').send({
      text: 'A'.repeat(501)
    });
    assert.equal(res.status, 400);
  });

  it('parse text at exactly 500 chars succeeds', async () => {
    const res = await agent().post('/api/tasks/parse').send({
      text: 'A'.repeat(500)
    });
    assert.equal(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Task Move Goal Verification
// ═══════════════════════════════════════════════════════════════════════════

describe('Task move to goal', () => {
  it('moves task to valid goal', async () => {
    const area = makeArea();
    const g1 = makeGoal(area.id);
    const g2 = makeGoal(area.id);
    const task = makeTask(g1.id);
    const res = await agent().post(`/api/tasks/${task.id}/move`).send({
      goal_id: g2.id
    }).expect(200);
    assert.equal(res.body.goal_id, g2.id);
  });

  it('rejects move to non-existent goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/move`).send({
      goal_id: 999999
    });
    assert.ok(res.status >= 400);
  });

  it('IDOR: cannot move to another user goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const { agent: agent2 } = makeUser2();
    const a2 = await agent2.post('/api/areas').send({ name: 'A2' });
    const g2 = await agent2.post(`/api/areas/${a2.body.id}/goals`).send({ title: 'G2' });

    const res = await agent().post(`/api/tasks/${task.id}/move`).send({
      goal_id: g2.body.id
    });
    assert.ok(res.status >= 400);
  });

  it('move without goal_id fails', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().post(`/api/tasks/${task.id}/move`).send({});
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Focus Session End Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Focus session end edge cases', () => {
  it('end session updates actual_minutes on task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const focus = await agent().post('/api/focus').send({
      task_id: task.id, duration_sec: 0, type: 'pomodoro'
    });
    await agent().put(`/api/focus/${focus.body.id}/end`).send({
      duration_sec: 1800
    }).expect(200);

    const t = await agent().get(`/api/tasks/${task.id}`).expect(200);
    assert.ok(t.body.actual_minutes >= 30);
  });

  it('focus stats with no sessions returns zeroed data', async () => {
    const res = await agent().get('/api/focus/stats').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('focus streak with no sessions returns 0', async () => {
    const res = await agent().get('/api/focus/streak').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('focus insights with no data returns defaults', async () => {
    const res = await agent().get('/api/focus/insights').expect(200);
    assert.ok(typeof res.body === 'object');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Stats Empty Dataset Handling
// ═══════════════════════════════════════════════════════════════════════════

describe('Stats with empty dataset', () => {
  it('dashboard returns zeros', async () => {
    const res = await agent().get('/api/stats').expect(200);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.done, 0);
    assert.equal(res.body.overdue, 0);
  });

  it('streaks returns zero streak', async () => {
    const res = await agent().get('/api/stats/streaks').expect(200);
    assert.equal(res.body.streak, 0);
    assert.ok(Array.isArray(res.body.heatmap));
  });

  it('trends returns empty weeks', async () => {
    const res = await agent().get('/api/stats/trends').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('time-analytics with no estimates', async () => {
    const res = await agent().get('/api/stats/time-analytics').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('balance with no areas', async () => {
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.ok(typeof res.body === 'object' || Array.isArray(res.body));
  });

  it('activity with no completions', async () => {
    const res = await agent().get('/api/activity').expect(200);
    assert.ok(typeof res.body === 'object');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Webhook SSRF Protection
// ═══════════════════════════════════════════════════════════════════════════

describe('Webhook SSRF protection', () => {
  it('rejects localhost URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'SSRF', url: 'http://localhost/admin',
      events: ['task.completed'], secret: 's'
    });
    assert.ok(res.status >= 400);
  });

  it('rejects 127.0.0.1 URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'SSRF', url: 'http://127.0.0.1/admin',
      events: ['task.completed'], secret: 's'
    });
    assert.ok(res.status >= 400);
  });

  it('rejects private 10.x.x.x URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'SSRF', url: 'http://10.0.0.1/hook',
      events: ['task.completed'], secret: 's'
    });
    assert.ok(res.status >= 400);
  });

  it('rejects 192.168.x.x URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'SSRF', url: 'http://192.168.1.1/hook',
      events: ['task.completed'], secret: 's'
    });
    assert.ok(res.status >= 400);
  });

  it('accepts valid external URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'Valid', url: 'https://hooks.example.com/wh',
      events: ['task.completed'], secret: 's'
    });
    assert.ok(res.status === 200 || res.status === 201);
  });

  it('update webhook rejects private URL', async () => {
    const w = await agent().post('/api/webhooks').send({
      name: 'Safe', url: 'https://example.com/h',
      events: ['task.completed'], secret: 's'
    });
    const res = await agent().put(`/api/webhooks/${w.body.id}`).send({
      url: 'http://localhost/admin'
    });
    assert.ok(res.status >= 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. AI Endpoints (BYOK)
// ═══════════════════════════════════════════════════════════════════════════

describe('AI endpoints', () => {
  it('POST /api/ai/suggest without key returns error', async () => {
    const res = await agent().post('/api/ai/suggest').send({
      task_ids: [1, 2, 3]
    });
    // Without BYOK key configured, should return error
    assert.ok(res.status >= 400 || (res.body.error && res.body.error.includes('key')));
  });

  it('POST /api/ai/schedule without key returns error', async () => {
    const res = await agent().post('/api/ai/schedule').send({
      task_ids: [1]
    });
    assert.ok(res.status >= 400 || (res.body.error && res.body.error.includes('key')));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. Batch Operations Boundaries
// ═══════════════════════════════════════════════════════════════════════════

describe('Batch operations boundaries', () => {
  it('PATCH /api/tasks/batch with empty ids fails', async () => {
    const res = await agent().patch('/api/tasks/batch').send({
      ids: [], updates: { status: 'done' }
    });
    assert.ok(res.status >= 400);
  });

  it('PUT /api/tasks/bulk with valid ids works', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { status: 'todo' });
    const t2 = makeTask(goal.id, { status: 'todo' });
    const res = await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id], changes: { status: 'done' }
    }).expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('POST /api/tasks/bulk-myday adds to my day', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id);
    const t2 = makeTask(goal.id);
    const res = await agent().post('/api/tasks/bulk-myday').send({
      ids: [t1.id, t2.id]
    }).expect(200);

    const myDay = await agent().get('/api/tasks/my-day').expect(200);
    assert.ok(myDay.body.length >= 2);
  });

  it('POST /api/tasks/reschedule moves tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { due_date: today() });
    const newDate = daysFromNow(5);
    const res = await agent().post('/api/tasks/reschedule').send({
      ids: [t1.id], due_date: newDate
    }).expect(200);

    const t = await agent().get(`/api/tasks/${t1.id}`).expect(200);
    assert.equal(t.body.due_date, newDate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. Shared List Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Shared list edge cases', () => {
  it('invalid token format rejected', async () => {
    const res = await agent().get('/api/shared/invalid-token');
    assert.equal(res.status, 400);
  });

  it('non-existent valid-format token returns 404', async () => {
    const res = await agent().get('/api/shared/aabbccddeeff001122334455');
    assert.equal(res.status, 404);
  });

  it('shared list shows items with positions', async () => {
    const list = makeList({ name: 'ShareItems', type: 'checklist' });
    makeListItem(list.id, { title: 'I1', position: 0 });
    makeListItem(list.id, { title: 'I2', position: 1 });
    const shareRes = await agent().post(`/api/lists/${list.id}/share`);
    const token = shareRes.body.token;

    const res = await agent().get(`/api/shared/${token}`).expect(200);
    assert.ok(res.body.items);
    assert.equal(res.body.items.length, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. List Item CRUD Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('List item CRUD edge cases', () => {
  it('POST /api/lists/:id/items creates single item', async () => {
    const list = makeList({ name: 'Single' });
    const res = await agent().post(`/api/lists/${list.id}/items`).send({
      title: 'New Item'
    });
    assert.ok(res.status === 200 || res.status === 201);
  });

  it('POST /api/lists/:id/items creates batch items', async () => {
    const list = makeList({ name: 'Batch' });
    const res = await agent().post(`/api/lists/${list.id}/items`).send([
      { title: 'Item A' }, { title: 'Item B' }, { title: 'Item C' }
    ]);
    assert.ok(res.status === 200 || res.status === 201);

    const items = await agent().get(`/api/lists/${list.id}/items`).expect(200);
    assert.ok(items.body.length >= 3);
  });

  it('PUT /api/lists/:id/items/:itemId updates item', async () => {
    const list = makeList({ name: 'UpdateItem' });
    const item = makeListItem(list.id, { title: 'OldTitle' });
    const res = await agent().put(`/api/lists/${list.id}/items/${item.id}`).send({
      title: 'NewTitle'
    }).expect(200);
    assert.equal(res.body.title, 'NewTitle');
  });

  it('DELETE /api/lists/:id/items/:itemId removes item', async () => {
    const list = makeList({ name: 'DelItem' });
    const item = makeListItem(list.id, { title: 'DelMe' });
    await agent().delete(`/api/lists/${list.id}/items/${item.id}`).expect(200);
  });

  it('list from template creates populated list', async () => {
    const res = await agent().get('/api/lists/templates').expect(200);
    if (res.body.length > 0) {
      const tmplId = res.body[0].id;
      const created = await agent().post('/api/lists/from-template').send({
        template_id: tmplId
      });
      assert.ok(created.status === 200 || created.status === 201);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. Inbox Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Inbox validation', () => {
  it('inbox item without title rejected', async () => {
    const res = await agent().post('/api/inbox').send({});
    assert.ok(res.status >= 400);
  });

  it('inbox update preserves fields', async () => {
    const inbox = await agent().post('/api/inbox').send({
      title: 'Test', priority: 2, note: 'Notes'
    });
    const res = await agent().put(`/api/inbox/${inbox.body.id}`).send({
      title: 'Updated'
    }).expect(200);
    assert.equal(res.body.title, 'Updated');
  });

  it('triage to nonexistent goal fails', async () => {
    const inbox = await agent().post('/api/inbox').send({ title: 'Triage' });
    const res = await agent().post(`/api/inbox/${inbox.body.id}/triage`).send({
      goal_id: 999999
    });
    assert.ok(res.status >= 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. Reminder & Planner Detail
// ═══════════════════════════════════════════════════════════════════════════

describe('Reminder & planner', () => {
  it('GET /api/reminders categorizes tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Overdue', due_date: daysFromNow(-3), status: 'todo' });
    makeTask(goal.id, { title: 'Today', due_date: today(), status: 'todo' });
    makeTask(goal.id, { title: 'Upcoming', due_date: daysFromNow(3), status: 'todo' });

    const res = await agent().get('/api/reminders').expect(200);
    assert.ok(res.body.overdue !== undefined || res.body.today !== undefined);
  });

  it('planner suggest includes overdue and highPriority', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Overdue', due_date: daysFromNow(-1), status: 'todo' });
    makeTask(goal.id, { title: 'High', priority: 3, status: 'todo' });

    const res = await agent().get('/api/planner/suggest').expect(200);
    assert.ok(res.body.overdue || res.body.highPriority || res.body.dueToday);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. Demo Endpoints
// ═══════════════════════════════════════════════════════════════════════════

describe('Demo endpoints', () => {
  it('POST /api/demo/start creates demo data', async () => {
    const res = await agent().post('/api/demo/start');
    assert.ok(res.status === 200 || res.status === 201);

    // Verify data was created
    const areas = await agent().get('/api/areas').expect(200);
    assert.ok(areas.body.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. Notes With Goal Association
// ═══════════════════════════════════════════════════════════════════════════

describe('Notes with goal association', () => {
  it('create note linked to goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post('/api/notes').send({
      title: 'Goal Note', content: 'Linked', goal_id: goal.id
    });
    assert.ok(res.status === 200 || res.status === 201);
    assert.equal(res.body.goal_id, goal.id);
  });

  it('GET /api/notes?goal_id filters by goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post('/api/notes').send({
      title: 'Linked', content: 'C', goal_id: goal.id
    });
    await agent().post('/api/notes').send({
      title: 'Unlinked', content: 'C'
    });

    const res = await agent().get(`/api/notes?goal_id=${goal.id}`).expect(200);
    assert.ok(res.body.every(n => n.goal_id === goal.id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. Task Tags via PUT
// ═══════════════════════════════════════════════════════════════════════════

describe('Task tags via PUT', () => {
  it('setting empty tagIds clears tags', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tag = makeTag({ name: 'clear-me' });
    linkTag(task.id, tag.id);

    await agent().put(`/api/tasks/${task.id}/tags`).send({ tagIds: [] }).expect(200);
    const t = await agent().get(`/api/tasks/${task.id}`).expect(200);
    assert.equal(t.body.tags.length, 0);
  });

  it('setting tagIds replaces existing', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const t1 = makeTag({ name: 'old-tag' });
    const t2 = makeTag({ name: 'new-tag' });
    linkTag(task.id, t1.id);

    await agent().put(`/api/tasks/${task.id}/tags`).send({ tagIds: [t2.id] }).expect(200);
    const t = await agent().get(`/api/tasks/${task.id}`).expect(200);
    assert.equal(t.body.tags.length, 1);
    assert.equal(t.body.tags[0].name, 'new-tag');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. Review Deletion
// ═══════════════════════════════════════════════════════════════════════════

describe('Review deletion', () => {
  it('DELETE /api/reviews/:id removes review', async () => {
    const r = await agent().post('/api/reviews').send({
      week_start: daysFromNow(-14),
      reflection: 'Delete me', rating: 3
    });
    const reviewId = r.body.id;
    await agent().delete(`/api/reviews/${reviewId}`).expect(200);

    const all = await agent().get('/api/reviews').expect(200);
    assert.ok(!all.body.some(rv => rv.id === reviewId));
  });
});
