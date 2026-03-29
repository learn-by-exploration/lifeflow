'use strict';
/**
 * Authentication & IDOR Security Tests
 *
 * Adversarial test suite that probes cross-user data isolation, privilege
 * escalation, and authentication bypass across all major API surfaces.
 *
 * Test outcome legend:
 *   [PASS-EXPECTED]  — The implementation is correct; test should pass.
 *   [FAIL-EXPECTED]  — A known bug exists; the assertion documents the
 *                      DESIRED behaviour. The test will fail until the bug
 *                      is fixed. When it fails, treat it as a confirmed
 *                      vulnerability report.
 *
 * User model:
 *   User1  — id=1, auto-created by helpers.js _ensureTestAuth()
 *   User2  — created fresh inside each test / beforeEach via makeUser2()
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const {
  setup,
  cleanDb,
  teardown,
  makeArea,
  makeGoal,
  makeTask,
  makeList,
  makeListItem,
  agent,    // User1 authenticated agent
  rawAgent, // unauthenticated agent
} = require('./helpers');

// ─── User2 factory helpers ────────────────────────────────────────────────────

/**
 * Create a second user (User2) + a long-lived session in the shared test DB.
 * Returns { userId, sid, agent } where agent auto-attaches the session cookie.
 *
 * NOTE: cleanDb() does NOT delete users/sessions, so User2 must be created
 * AFTER cleanDb() in each test that needs isolation — i.e. call makeUser2()
 * inside the test body or inside beforeEach, AFTER cleanDb().
 */
// Counter to ensure each makeUser2() call gets a unique email address.
// cleanDb() does not delete the users table, so each test that calls
// makeUser2() needs a distinct email or it will hit a UNIQUE constraint.
let _user2Counter = 0;

function makeUser2(db) {
  _user2Counter++;
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('testpassword', 4); // low rounds for test speed
  const email = `user2-${_user2Counter}@break.com`;
  const r = db
    .prepare(
      'INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)'
    )
    .run(email, hash, 'User Two');
  const sid = 'break-u2-session-' + Date.now() + '-' + Math.random();
  db.prepare(
    "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
  ).run(sid, r.lastInsertRowid);
  return {
    userId: r.lastInsertRowid,
    sid,
    agent: agentWithSid(sid),
  };
}

/**
 * Return a supertest proxy that auto-injects the given session cookie into
 * every HTTP method call.
 */
function agentWithSid(sid) {
  const { app } = setup();
  const base = request(app);
  return new Proxy(base, {
    get(target, prop) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(prop)) {
        return (...args) =>
          target[prop](...args).set('Cookie', `lf_sid=${sid}`);
      }
      return target[prop];
    },
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Authentication & IDOR Security Tests', () => {
  let db;
  before(() => {
    const s = setup();
    db = s.db;
  });
  after(() => teardown());

  // ── Scenario 1: FTS Global Search — Cross-User Data Leak ─────────────────
  describe('Scenario 1: FTS global search cross-user data leak — CRITICAL', () => {
    /**
     * FIXED: rebuildSearchIndex() now inserts rows WITH user_id column.
     * The /api/search (FTS5) endpoint filters by user_id, so users
     * can only find their own data.
     */
    it('User2 should NOT find User1 task titles via global FTS search', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      // User1 creates a task with a highly unique canary title via HTTP so
      // user_id is stamped correctly and the task is indexed.
      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Secret Area', color: '#FF0000' });
      assert.equal(areaRes.status, 201, 'User1 area creation failed');
      const areaId = areaRes.body.id;

      const goalRes = await agent()
        .post(`/api/areas/${areaId}/goals`)
        .send({ title: 'Secret Goal', color: '#FF0000' });
      assert.equal(goalRes.status, 201, 'User1 goal creation failed');
      const goalId = goalRes.body.id;

      await agent()
        .post(`/api/goals/${goalId}/tasks`)
        .send({ title: 'xqz-secret-canary-alpha-42', note: 'sensitive-data-xyz' });

      // NOTE: The task route does NOT call rebuildSearchIndex() on insert.
      // rebuildSearchIndex() is only triggered by list write operations.
      // To ensure the task is in the FTS index, we create and immediately
      // delete a User1 list item — this triggers a rebuild that picks up
      // all tasks (including User1's canary) with NO user_id column in
      // search_index.  This is itself part of the bug: the rebuild is
      // global and unscoped.
      const triggerListRes = await agent()
        .post('/api/lists')
        .send({ name: 'Trigger Rebuild List', type: 'checklist' });
      if (triggerListRes.status === 201) {
        await agent()
          .post(`/api/lists/${triggerListRes.body.id}/items`)
          .send({ title: 'trigger item' });
      }

      // User2 searches for the canary string.
      const searchRes = await user2.agent.get(
        '/api/search?q=xqz-secret-canary'
      );
      assert.equal(
        searchRes.status,
        200,
        'Search endpoint should return 200 for authenticated user'
      );

      const body = searchRes.body;
      const results = Array.isArray(body.results) ? body.results : body;

      // SECURE behaviour: User2 should receive zero results for User1's canary.
      const leaked = results.filter(
        (r) =>
          (r.title && r.title.includes('xqz-secret-canary')) ||
          (r.snippet && r.snippet.includes('xqz-secret-canary')) ||
          (r.body && r.body.includes('xqz-secret-canary'))
      );
      assert.equal(
        leaked.length,
        0,
        `CONFIRMED BUG: FTS search returned ${leaked.length} result(s) ` +
          `belonging to User1 when queried by User2. ` +
          `Leaked items: ${JSON.stringify(leaked)}`
      );
    });
  });

  // ── Scenario 2: IDOR Silent Delete — Area ────────────────────────────────
  describe('Scenario 2: IDOR silent delete — area', () => {
    /**
     * BUG: DELETE /api/areas/:id runs:
     *   DELETE FROM life_areas WHERE id=? AND user_id=?
     * If no rows match (wrong user), it still responds {ok:true} with HTTP 200.
     * There is no pre-flight ownership check.
     *
     * [FAIL-EXPECTED] — Test expects 404; current code returns 200 {ok:true}.
     */
    it('User2 DELETE on User1 area should return 404, not silently succeed', async () => {
      cleanDb();

      // Create User1's area first, then create User2
      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'User1 Private Area', color: '#123456' });
      assert.equal(areaRes.status, 201);
      const areaId = areaRes.body.id;

      const user2 = makeUser2(db);

      const delRes = await user2.agent.delete(`/api/areas/${areaId}`);
      // [FAIL-EXPECTED]: should be 404 — current code returns 200
      assert.equal(
        delRes.status,
        404,
        `CONFIRMED BUG: User2 deleted User1's area (id=${areaId}) ` +
          `and received status ${delRes.status} instead of 404. ` +
          `Response body: ${JSON.stringify(delRes.body)}`
      );

      // Verify area still exists for User1
      const listRes = await agent().get('/api/areas');
      assert.equal(listRes.status, 200);
      const area = listRes.body.find((a) => a.id === areaId);
      assert.ok(
        area,
        `Area ${areaId} should still exist for User1 after User2 delete attempt`
      );
    });
  });

  // ── Scenario 3: IDOR Silent Delete — Task ────────────────────────────────
  describe('Scenario 3: IDOR silent delete — task', () => {
    /**
     * BUG: DELETE /api/tasks/:id runs:
     *   DELETE FROM tasks WHERE id=? AND user_id=?
     * Same silent-IDOR pattern as areas — {ok:true} even when 0 rows deleted.
     *
     * [FAIL-EXPECTED] — Test expects 404; current code returns 200 {ok:true}.
     */
    it('User2 DELETE on User1 task should return 404', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      // User1 creates area + goal + task via HTTP
      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area A', color: '#AABBCC' });
      const goalRes = await agent()
        .post(`/api/areas/${areaRes.body.id}/goals`)
        .send({ title: 'Goal A', color: '#AABBCC' });
      const taskRes = await agent()
        .post(`/api/goals/${goalRes.body.id}/tasks`)
        .send({ title: 'User1 Confidential Task' });
      assert.equal(taskRes.status, 201);
      const taskId = taskRes.body.id;

      // User2 attempts to delete User1's task
      const delRes = await user2.agent.delete(`/api/tasks/${taskId}`);
      // [FAIL-EXPECTED]: should be 404
      assert.equal(
        delRes.status,
        404,
        `CONFIRMED BUG: User2 received status ${delRes.status} when deleting User1's task. ` +
          `Body: ${JSON.stringify(delRes.body)}`
      );

      // Verify task still visible to User1
      const allRes = await agent().get('/api/tasks/all');
      assert.equal(allRes.status, 200);
      const tasks = Array.isArray(allRes.body)
        ? allRes.body
        : allRes.body.items || [];
      const stillExists = tasks.find((t) => t.id === taskId);
      assert.ok(
        stillExists,
        `Task ${taskId} should still exist for User1 after User2's delete attempt`
      );
    });
  });

  // ── Scenario 4: IDOR Read — GET task by ID ───────────────────────────────
  describe('Scenario 4: IDOR read — GET /api/tasks/:id', () => {
    /**
     * [PASS-EXPECTED] — The GET handler checks user_id; should return 404.
     */
    it('User2 GET on User1 task should return 404', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area Read', color: '#112233' });
      const goalRes = await agent()
        .post(`/api/areas/${areaRes.body.id}/goals`)
        .send({ title: 'Goal Read', color: '#112233' });
      const taskRes = await agent()
        .post(`/api/goals/${goalRes.body.id}/tasks`)
        .send({ title: 'Private task read test' });
      assert.equal(taskRes.status, 201);
      const taskId = taskRes.body.id;

      const readRes = await user2.agent.get(`/api/tasks/${taskId}`);
      assert.equal(
        readRes.status,
        404,
        `Expected 404 but got ${readRes.status}. Body: ${JSON.stringify(readRes.body)}`
      );
    });
  });

  // ── Scenario 5: IDOR Update — PUT /api/tasks/:id ─────────────────────────
  describe('Scenario 5: IDOR update task — PUT /api/tasks/:id', () => {
    /**
     * [PASS-EXPECTED] — PUT handler checks user_id via SELECT before update.
     * Should return 404 and leave task unchanged.
     */
    it('User2 PUT on User1 task should return 404 and not mutate data', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area Update', color: '#334455' });
      const goalRes = await agent()
        .post(`/api/areas/${areaRes.body.id}/goals`)
        .send({ title: 'Goal Update', color: '#334455' });
      const taskRes = await agent()
        .post(`/api/goals/${goalRes.body.id}/tasks`)
        .send({ title: 'Original Title — Do Not Touch' });
      assert.equal(taskRes.status, 201);
      const taskId = taskRes.body.id;

      // User2 attempts title hijack
      const updateRes = await user2.agent
        .put(`/api/tasks/${taskId}`)
        .send({ title: 'HACKED' });
      assert.notEqual(
        updateRes.status,
        200,
        `Expected non-200 status but got ${updateRes.status}. ` +
          `IDOR: User2 may have updated User1's task.`
      );

      // Confirm title is unchanged from User1's perspective
      const getRes = await agent().get(`/api/tasks/${taskId}`);
      assert.equal(getRes.status, 200);
      assert.equal(
        getRes.body.title,
        'Original Title — Do Not Touch',
        `Task title was mutated to "${getRes.body.title}" by User2`
      );
    });
  });

  // ── Scenario 6: IDOR Task Deps — Cross-User blockedByIds ─────────────────
  describe('Scenario 6: IDOR task deps cross-user blockedByIds reference', () => {
    /**
     * BUG: PUT /api/tasks/:id/deps verifies ownership of the target task
     * (the one being updated), but does NOT verify that each id in
     * blockedByIds belongs to the requesting user.  This allows User2 to
     * create a dependency link on a task User1 owns, potentially leaking
     * task existence and status through the blockedBy response array.
     *
     * [FAIL-EXPECTED] — The endpoint should return 403/404 when any
     * blockedByIds element is not owned by the requesting user.
     */
    it('User2 PUT deps with User1 task as blockedById should fail or not leak details', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      // User1 creates task T1
      const area1Res = await agent()
        .post('/api/areas')
        .send({ name: 'Area Deps U1', color: '#AA0000' });
      const goal1Res = await agent()
        .post(`/api/areas/${area1Res.body.id}/goals`)
        .send({ title: 'Goal Deps U1', color: '#AA0000' });
      const t1Res = await agent()
        .post(`/api/goals/${goal1Res.body.id}/tasks`)
        .send({ title: 'User1 Blocker Task' });
      assert.equal(t1Res.status, 201);
      const t1Id = t1Res.body.id;

      // User2 creates their own task T2
      const area2Res = await user2.agent
        .post('/api/areas')
        .send({ name: 'Area Deps U2', color: '#0000AA' });
      const goal2Res = await user2.agent
        .post(`/api/areas/${area2Res.body.id}/goals`)
        .send({ title: 'Goal Deps U2', color: '#0000AA' });
      const t2Res = await user2.agent
        .post(`/api/goals/${goal2Res.body.id}/tasks`)
        .send({ title: 'User2 Blocked Task' });
      assert.equal(t2Res.status, 201);
      const t2Id = t2Res.body.id;

      // User2 tries to set T1 (User1's task) as a blocker for T2
      const depsRes = await user2.agent
        .put(`/api/tasks/${t2Id}/deps`)
        .send({ blockedByIds: [t1Id] });

      if (depsRes.status === 200 || depsRes.status === 201) {
        // The server accepted the request. Now check whether it leaked T1's details.
        const blockedBy = depsRes.body.blockedBy || [];
        const leakedT1 = blockedBy.find((b) => b.id === t1Id);
        // [FAIL-EXPECTED]: If T1 appears in the response, this is an IDOR leak.
        assert.equal(
          leakedT1,
          undefined,
          `CONFIRMED BUG: User2's deps response includes User1's task ` +
            `(id=${t1Id}, title="${leakedT1 && leakedT1.title}"). ` +
            `blockedByIds ownership is not verified server-side.`
        );
      } else {
        // A 403/404 is the correct behaviour — no further assertion needed.
        assert.ok(
          [403, 404].includes(depsRes.status),
          `Expected 403 or 404 but got ${depsRes.status}: ${JSON.stringify(depsRes.body)}`
        );
      }
    });
  });

  // ── Scenario 7: IDOR Comment POST on Other User's Task ───────────────────
  describe('Scenario 7: IDOR — POST comment on another user\'s task', () => {
    /**
     * [PASS-EXPECTED] — The handler checks task ownership before insert.
     * Should return 404.
     */
    it('User2 POST /api/tasks/:id/comments on User1 task should return 404', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area Comment', color: '#223344' });
      const goalRes = await agent()
        .post(`/api/areas/${areaRes.body.id}/goals`)
        .send({ title: 'Goal Comment', color: '#223344' });
      const taskRes = await agent()
        .post(`/api/goals/${goalRes.body.id}/tasks`)
        .send({ title: 'Task for Comment IDOR' });
      assert.equal(taskRes.status, 201);
      const taskId = taskRes.body.id;

      const commentRes = await user2.agent
        .post(`/api/tasks/${taskId}/comments`)
        .send({ text: 'hacked comment from user2' });

      assert.equal(
        commentRes.status,
        404,
        `Expected 404 but got ${commentRes.status}. ` +
          `Body: ${JSON.stringify(commentRes.body)}`
      );
    });
  });

  // ── Scenario 8: IDOR Subtask Create on Other User's Task ─────────────────
  describe('Scenario 8: IDOR — POST subtask on another user\'s task', () => {
    /**
     * [PASS-EXPECTED] — The subtask POST handler checks task ownership.
     * Should return 404.
     */
    it('User2 POST /api/tasks/:id/subtasks on User1 task should return 404', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area Subtask', color: '#556677' });
      const goalRes = await agent()
        .post(`/api/areas/${areaRes.body.id}/goals`)
        .send({ title: 'Goal Subtask', color: '#556677' });
      const taskRes = await agent()
        .post(`/api/goals/${goalRes.body.id}/tasks`)
        .send({ title: 'Task for Subtask IDOR' });
      assert.equal(taskRes.status, 201);
      const taskId = taskRes.body.id;

      const subtaskRes = await user2.agent
        .post(`/api/tasks/${taskId}/subtasks`)
        .send({ title: 'hacked subtask' });

      assert.equal(
        subtaskRes.status,
        404,
        `Expected 404 but got ${subtaskRes.status}. ` +
          `Body: ${JSON.stringify(subtaskRes.body)}`
      );
    });
  });

  // ── Scenario 9: IDOR List Item Update Across Users ───────────────────────
  describe('Scenario 9: IDOR — PUT /api/lists/:id/items/:itemId cross-user', () => {
    /**
     * [PASS-EXPECTED] — PUT list item checks list ownership via user_id.
     * Should return 404.
     */
    it('User2 PUT on User1 list item should return 404', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      // User1 creates list L1 with item I1 via HTTP
      const l1Res = await agent()
        .post('/api/lists')
        .send({ name: 'User1 List', type: 'checklist' });
      assert.equal(l1Res.status, 201, `User1 list creation failed: ${JSON.stringify(l1Res.body)}`);
      const l1Id = l1Res.body.id;

      const i1Res = await agent()
        .post(`/api/lists/${l1Id}/items`)
        .send({ title: 'User1 Secret Item' });
      assert.equal(i1Res.status, 201, `User1 item creation failed: ${JSON.stringify(i1Res.body)}`);
      // The endpoint returns the item directly (or an array if batch)
      const i1 = Array.isArray(i1Res.body) ? i1Res.body[0] : i1Res.body;
      const i1Id = i1.id;

      // User2 creates their own list + item (just to confirm user2 can use the API)
      const l2Res = await user2.agent
        .post('/api/lists')
        .send({ name: 'User2 List', type: 'checklist' });
      assert.equal(l2Res.status, 201);

      // User2 attempts to update User1's item via User1's list path
      const updRes = await user2.agent
        .put(`/api/lists/${l1Id}/items/${i1Id}`)
        .send({ title: 'hacked by user2' });

      assert.equal(
        updRes.status,
        404,
        `Expected 404 but got ${updRes.status}. ` +
          `Body: ${JSON.stringify(updRes.body)}`
      );

      // Verify item is unchanged for User1
      const itemsRes = await agent().get(`/api/lists/${l1Id}/items`);
      assert.equal(itemsRes.status, 200);
      const item = itemsRes.body.find((i) => i.id === i1Id);
      assert.ok(item, 'Item should still exist for User1');
      assert.equal(
        item.title,
        'User1 Secret Item',
        `Item title was mutated to "${item.title}" by User2`
      );
    });
  });

  // ── Scenario 10: Unauthenticated Access — 401 on All API Routes ──────────
  describe('Scenario 10: No session cookie — all API routes return 401', () => {
    /**
     * [PASS-EXPECTED] — requireAuth middleware should reject every /api/*
     * request that lacks a valid lf_sid cookie.
     */
    it('GET /api/areas without cookie returns 401', async () => {
      const res = await rawAgent().get('/api/areas');
      assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
    });

    it('GET /api/tasks/all without cookie returns 401', async () => {
      const res = await rawAgent().get('/api/tasks/all');
      assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
    });

    it('POST /api/areas without cookie returns 401', async () => {
      const res = await rawAgent()
        .post('/api/areas')
        .send({ name: 'Unauthorized Area', color: '#FF0000' });
      assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
    });

    it('GET /api/tasks/my-day without cookie returns 401', async () => {
      const res = await rawAgent().get('/api/tasks/my-day');
      assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
    });

    it('GET /api/goals without cookie returns 401', async () => {
      const res = await rawAgent().get('/api/goals');
      assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
    });

    it('GET /api/search without cookie returns 401', async () => {
      const res = await rawAgent().get('/api/search?q=test');
      assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
    });
  });

  // ── Scenario 11: IDOR Update — PUT /api/areas/:id ────────────────────────
  describe('Scenario 11: IDOR update area — PUT /api/areas/:id', () => {
    /**
     * [PASS-EXPECTED] — PUT area handler does a SELECT with user_id check first.
     * Should return 404.
     */
    it('User2 PUT on User1 area should return 404 and not mutate data', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'User1 Original Area Name', color: '#AABBCC' });
      assert.equal(areaRes.status, 201);
      const areaId = areaRes.body.id;

      const updateRes = await user2.agent
        .put(`/api/areas/${areaId}`)
        .send({ name: 'HACKED', color: '#FF0000' });

      assert.equal(
        updateRes.status,
        404,
        `Expected 404 but got ${updateRes.status}. ` +
          `Body: ${JSON.stringify(updateRes.body)}`
      );

      // Confirm name unchanged for User1
      const getRes = await agent().get('/api/areas');
      assert.equal(getRes.status, 200);
      const area = getRes.body.find((a) => a.id === areaId);
      assert.ok(area, 'Area should still exist for User1');
      assert.equal(
        area.name,
        'User1 Original Area Name',
        `Area name was mutated to "${area.name}" by User2`
      );
    });
  });

  // ── Scenario 12: Area Count Integrity After Mass Deletion Attempt ─────────
  describe('Scenario 12: User1 area count intact after User2 bulk delete attempts', () => {
    /**
     * Even when the silent-IDOR bug exists (DELETE returns 200 on mismatch),
     * the data should be physically intact because the WHERE user_id clause
     * prevents actual row deletion. This test validates data integrity
     * independently of the status code bug.
     *
     * [PASS-EXPECTED] — Data should survive even if status codes are wrong.
     */
    it('User1 still has all 3 areas after User2 attempts to delete them all', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      // User1 creates 3 areas
      const names = ['Area Alpha', 'Area Beta', 'Area Gamma'];
      const areaIds = [];
      for (const name of names) {
        const r = await agent()
          .post('/api/areas')
          .send({ name, color: '#112233' });
        assert.equal(r.status, 201, `Failed to create area "${name}"`);
        areaIds.push(r.body.id);
      }

      // User2 attempts to delete all 3
      for (const id of areaIds) {
        await user2.agent.delete(`/api/areas/${id}`);
        // We don't assert the status here — some may 200 (bug) or 404 (fixed).
        // The important assertion is below.
      }

      // User1 should still see all 3 areas
      const listRes = await agent().get('/api/areas');
      assert.equal(listRes.status, 200);
      const remaining = listRes.body.filter((a) => areaIds.includes(a.id));
      assert.equal(
        remaining.length,
        3,
        `Expected 3 areas to survive User2's deletion attempts, ` +
          `but only ${remaining.length} remain: ` +
          `${JSON.stringify(remaining.map((a) => a.name))}`
      );
    });
  });

  // ── Bonus Scenario 13: IDOR — Goal Delete Across Users ───────────────────
  describe('Scenario 13: IDOR silent delete — goal', () => {
    /**
     * BUG: DELETE /api/goals/:id runs:
     *   DELETE FROM goals WHERE id=? AND user_id=?
     * Same silent-IDOR pattern — {ok:true} even on mismatch.
     *
     * [FAIL-EXPECTED] — Test expects 404.
     */
    it('User2 DELETE on User1 goal should return 404', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area for Goal Delete', color: '#445566' });
      const goalRes = await agent()
        .post(`/api/areas/${areaRes.body.id}/goals`)
        .send({ title: 'User1 Private Goal', color: '#445566' });
      assert.equal(goalRes.status, 201);
      const goalId = goalRes.body.id;

      const delRes = await user2.agent.delete(`/api/goals/${goalId}`);
      // [FAIL-EXPECTED]: should be 404
      assert.equal(
        delRes.status,
        404,
        `CONFIRMED BUG: User2 received status ${delRes.status} when deleting User1's goal. ` +
          `Body: ${JSON.stringify(delRes.body)}`
      );

      // Verify goal still visible to User1
      const goalsRes = await agent().get(`/api/areas/${areaRes.body.id}/goals`);
      assert.equal(goalsRes.status, 200);
      const goal = goalsRes.body.find((g) => g.id === goalId);
      assert.ok(
        goal,
        `Goal ${goalId} should still exist for User1 after User2's delete attempt`
      );
    });
  });

  // ── Bonus Scenario 14: Session Fixation — Expired Session Rejected ────────
  describe('Scenario 14: Expired/invalid session cookie is rejected', () => {
    /**
     * [PASS-EXPECTED] — requireAuth checks expires_at against datetime('now').
     */
    it('Expired session cookie returns 401', async () => {
      const { db: testDb } = setup();
      const expiredSid = 'expired-session-' + Date.now();
      testDb
        .prepare(
          "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 0, datetime('now', '-1 day'))"
        )
        .run(expiredSid, 1);

      const expiredAgent = agentWithSid(expiredSid);
      const res = await expiredAgent.get('/api/areas');
      assert.equal(
        res.status,
        401,
        `Expired session should be rejected with 401, got ${res.status}`
      );
    });

    it('Completely fabricated session cookie returns 401', async () => {
      const fakeAgent = agentWithSid('totally-fake-session-that-does-not-exist');
      const res = await fakeAgent.get('/api/tasks/all');
      assert.equal(
        res.status,
        401,
        `Fabricated session should be rejected with 401, got ${res.status}`
      );
    });
  });

  // ── Bonus Scenario 15: User2 cannot read User1 goals list ────────────────
  describe('Scenario 15: IDOR — User2 cannot read User1 goals via area endpoint', () => {
    /**
     * [PASS-EXPECTED] — GET /api/areas/:areaId/goals filters by user_id.
     * User2 querying User1's area ID should get empty results (not 404,
     * because the route doesn't verify area ownership first — but the
     * goals query is scoped to user_id so no data leaks).
     */
    it('User2 GET /api/areas/:user1AreaId/goals returns empty array, not User1 goals', async () => {
      cleanDb();
      const user2 = makeUser2(db);

      const areaRes = await agent()
        .post('/api/areas')
        .send({ name: 'Area Goals Leak Test', color: '#CCDDEE' });
      const areaId = areaRes.body.id;

      await agent()
        .post(`/api/areas/${areaId}/goals`)
        .send({ title: 'User1 Sensitive Goal', color: '#CCDDEE' });

      const goalsRes = await user2.agent.get(`/api/areas/${areaId}/goals`);
      // May be 200 with empty array OR 404 — either is acceptable as long as
      // User1's goals are not included.
      if (goalsRes.status === 200) {
        const leaked = (goalsRes.body || []).filter(
          (g) => g.title === 'User1 Sensitive Goal'
        );
        assert.equal(
          leaked.length,
          0,
          `IDOR: User2 can read User1's goals via area ${areaId}. ` +
            `Leaked: ${JSON.stringify(leaked)}`
        );
      } else {
        // 404 or similar — no data leak possible
        assert.ok(
          goalsRes.status >= 400,
          `Expected 4xx but got ${goalsRes.status}`
        );
      }
    });
  });
});
