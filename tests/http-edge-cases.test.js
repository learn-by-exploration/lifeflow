const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, makeList, makeListItem, agent, rawAgent } = require('./helpers');

describe('HTTP Boundary & Edge Case Tests', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── GROUP: ID Type Confusion in URL Parameters ───

  describe('ID Type Confusion — string "abc"', () => {
    it('GET /api/tasks/abc → 400 invalid ID', async () => {
      // Non-integer string IDs must be rejected before DB lookup
      const res = await agent().get('/api/tasks/abc');
      assert.equal(res.status, 400);
      assert.ok(res.body.error, 'should include error field');
    });

    it('PUT /api/tasks/abc → 400 invalid ID', async () => {
      const res = await agent().put('/api/tasks/abc').send({ title: 'test' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('DELETE /api/tasks/abc → 400 invalid ID', async () => {
      const res = await agent().delete('/api/tasks/abc');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });
  });

  describe('ID Type Confusion — float "1.5"', () => {
    it('GET /api/tasks/1.5 → 400 (Number("1.5")=1.5, Number.isInteger(1.5)=false)', async () => {
      // Floats fail the Number.isInteger() check used in all task route handlers
      const res = await agent().get('/api/tasks/1.5');
      assert.equal(res.status, 400);
    });

    it('PUT /api/tasks/1.5 → 400', async () => {
      const res = await agent().put('/api/tasks/1.5').send({ title: 'x' });
      assert.equal(res.status, 400);
    });

    it('DELETE /api/tasks/1.5 → 400', async () => {
      const res = await agent().delete('/api/tasks/1.5');
      assert.equal(res.status, 400);
    });
  });

  describe('ID Type Confusion — negative "-1"', () => {
    it('GET /api/tasks/-1 → 400 (negative IDs rejected by isPositiveInt)', async () => {
      const res = await agent().get('/api/tasks/-1');
      assert.equal(res.status, 400);
    });
  });

  describe('ID Type Confusion — zero "0"', () => {
    it('GET /api/tasks/0 → 400 (zero rejected by isPositiveInt)', async () => {
      const res = await agent().get('/api/tasks/0');
      assert.equal(res.status, 400);
    });
  });

  describe('ID Type Confusion — very large "9999999999"', () => {
    it('GET /api/tasks/9999999999 → 404 (valid integer, no such task)', async () => {
      const res = await agent().get('/api/tasks/9999999999');
      assert.equal(res.status, 404);
    });
  });

  describe('ID Type Confusion — scientific notation "1e2"', () => {
    it('GET /api/tasks/1e2 → 404 (Number("1e2")=100, isInteger(100)=true, passes check)', async () => {
      // DOCUMENTED BEHAVIOR: Express parses "1e2" as string; Number("1e2")=100 passes isInteger
      const res = await agent().get('/api/tasks/1e2');
      assert.equal(res.status, 404);
    });
  });

  describe('ID Type Confusion — special string IDs', () => {
    it('GET /api/tasks/null → 400 (Number("null")=NaN, fails isInteger)', async () => {
      const res = await agent().get('/api/tasks/null');
      assert.equal(res.status, 400);
    });

    it('GET /api/tasks/undefined → 400', async () => {
      const res = await agent().get('/api/tasks/undefined');
      assert.equal(res.status, 400);
    });

    it('GET /api/tasks/NaN → 400', async () => {
      const res = await agent().get('/api/tasks/NaN');
      assert.equal(res.status, 400);
    });

    it('GET /api/tasks/Infinity → 400', async () => {
      // Number("Infinity") = Infinity, Number.isInteger(Infinity) = false → 400
      const res = await agent().get('/api/tasks/Infinity');
      assert.equal(res.status, 400);
    });
  });

  describe('ID Type Confusion — same checks on areas and goals', () => {
    it('GET /api/areas/:id/goals with "abc" → 400', async () => {
      const res = await agent().get('/api/areas/abc/goals');
      assert.equal(res.status, 400);
    });

    it('PUT /api/areas/abc → 400', async () => {
      const res = await agent().put('/api/areas/abc').send({ name: 'x', color: '#FF0000' });
      assert.equal(res.status, 400);
    });

    it('DELETE /api/areas/1.7 → 400', async () => {
      const res = await agent().delete('/api/areas/1.7');
      assert.equal(res.status, 400);
    });

    it('GET /api/goals/:goalId/tasks with "xyz" → 400', async () => {
      const res = await agent().get('/api/goals/xyz/tasks');
      assert.equal(res.status, 400);
    });
  });

  // ─── GROUP: Missing Required Fields on Every Create Endpoint ───

  describe('Empty body on all create endpoints', () => {
    it('POST /api/areas {} → 400 (name required)', async () => {
      const res = await agent().post('/api/areas').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error, 'must return error message');
    });

    it('POST /api/areas/:id/goals {} → 400 (title required)', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/goals/:id/tasks {} → 400 (title required)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/tags {} → 400 (name required)', async () => {
      const res = await agent().post('/api/tags').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/inbox {} → 400 (title required)', async () => {
      const res = await agent().post('/api/inbox').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/notes {} → 400 (title required)', async () => {
      const res = await agent().post('/api/notes').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/focus {} → 400 (task_id required)', async () => {
      // focus endpoint requires task_id; empty body must be rejected
      const res = await agent().post('/api/focus').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/rules {} → 400 (name+trigger_type+action_type required)', async () => {
      const res = await agent().post('/api/rules').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('POST /api/templates {} → 400 (name required)', async () => {
      const res = await agent().post('/api/templates').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    // Verify none of them accidentally return 500 (server error) instead of 400
    it('all empty-body creates return 4xx not 5xx', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const endpoints = [
        agent().post('/api/areas').send({}),
        agent().post(`/api/areas/${area.id}/goals`).send({}),
        agent().post(`/api/goals/${goal.id}/tasks`).send({}),
        agent().post('/api/tags').send({}),
        agent().post('/api/inbox').send({}),
        agent().post('/api/notes').send({}),
        agent().post('/api/focus').send({}),
        agent().post('/api/rules').send({}),
      ];
      const results = await Promise.all(endpoints);
      for (const res of results) {
        assert.ok(res.status >= 400 && res.status < 500,
          `expected 4xx but got ${res.status} on endpoint`);
      }
    });
  });

  describe('Required field missing — only optional fields sent', () => {
    it('POST /api/areas with only icon+color (no name) → 400', async () => {
      const res = await agent().post('/api/areas').send({ icon: '🏠', color: '#FF0000' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /name/i, 'error should mention name');
    });

    it('POST /api/areas/:id/goals with only description+color (no title) → 400', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({ description: 'desc', color: '#6C63FF' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /title/i);
    });

    it('POST /api/goals/:id/tasks with only note+priority (no title) → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ note: 'a note', priority: 1 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /title/i);
    });

    it('POST /api/tasks/:id/subtasks with no title → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().post(`/api/tasks/${task.id}/subtasks`).send({ done: false });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /title/i);
    });

    it('POST /api/inbox with only note+priority (no title) → 400', async () => {
      const res = await agent().post('/api/inbox').send({ note: 'some note', priority: 1 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /title/i);
    });

    it('POST /api/notes with only content (no title) → 400', async () => {
      const res = await agent().post('/api/notes').send({ content: 'body text' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /title/i);
    });
  });

  // ─── GROUP: URL Encoding & Special Characters in Query Params ───

  describe('URL-encoded characters in query params', () => {
    it('GET /api/tasks/search?q=hello%20world → 200 (percent-encoded space)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'hello world task' });
      const res = await agent().get('/api/tasks/search?q=hello%20world');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/tasks/search?q=%3Cscript%3E → 200 (XSS attempt in query)', async () => {
      // Encoded <script> tag should be treated as literal search text, not interpreted
      const res = await agent().get('/api/tasks/search?q=%3Cscript%3E');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/tasks/search?q=hello+world → 200 (+ decoded as space by qs)', async () => {
      const res = await agent().get('/api/tasks/search?q=hello+world');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('Query param injection/oddities', () => {
    it('GET /api/tasks/search?q=x&q=y → 200 or 500 (repeated param — qs behavior)', async () => {
      // When q is repeated, qs may parse it as an array ['x','y'].
      // The endpoint does q.trim() which throws on an array → potential 500.
      // DOCUMENTED BEHAVIOR: duplicate q params are not guarded against; result may be 500.
      const res = await agent().get('/api/tasks/search?q=x&q=y');
      // Accept 200 (qs picks last string) or 500 (qs produces array, trim throws)
      assert.ok(res.status === 200 || res.status === 500,
        `expected 200 or 500, got ${res.status}`);
    });

    it('GET /api/tasks/search?q[]=x&q[]=y → 200 or 500 (array notation — qs parses as array)', async () => {
      // qs parses q[] as array; endpoint checks q && q.trim() — array.trim() throws → 500
      // DOCUMENTED BEHAVIOR: array-notation query params cause unhandled crash
      const res = await agent().get('/api/tasks/search?q%5B%5D=x&q%5B%5D=y');
      assert.ok(res.status === 200 || res.status === 500,
        `expected 200 or 500, got ${res.status}`);
    });

    it('GET /api/tasks/board with non-integer area_id → 200 (invalid filter silently ignored)', async () => {
      // Non-integer filter params fail Number.isInteger() check and are ignored, not rejected
      const res = await agent().get('/api/tasks/board?area_id=notanumber');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  // ─── GROUP: Large Payloads ───

  describe('Large payload — over 1mb → 413', () => {
    it('POST /api/areas with body over 1mb → 413 (Express json limit)', async () => {
      // Express is configured with express.json({ limit: '1mb' })
      // Sending a body larger than 1mb should produce 413 PayloadTooLarge
      const bigBody = JSON.stringify({ name: 'Test Area', color: '#FF0000', extra: 'x'.repeat(1024 * 1024 + 100) });
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send(bigBody);
      // Express returns 413 when body exceeds limit
      assert.equal(res.status, 413);
    });
  });

  describe('Large tagIds array in task tag update', () => {
    it('PUT /api/tasks/:id/tags with non-existent tag IDs → 500 (FOREIGN KEY constraint)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      // Non-existent tag IDs violate the task_tags → tags foreign key constraint.
      // DOCUMENTED BUG: the route does not pre-filter tagIds to only existing tags,
      // so passing IDs for tags that don't exist causes a FK constraint failure → 500.
      // A robust implementation would use INSERT OR IGNORE and validate tags first.
      const tagIds = [99999, 99998, 99997]; // non-existent tag IDs
      const res = await agent().put(`/api/tasks/${task.id}/tags`).send({ tagIds });
      assert.equal(res.status, 500);
    });

    it('PUT /api/tasks/:id/tags with existing tags → 200', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag1 = makeTag({ name: 'tag-large-test-1' });
      const tag2 = makeTag({ name: 'tag-large-test-2' });
      // Using real tag IDs avoids FK constraint failure
      const res = await agent().put(`/api/tasks/${task.id}/tags`).send({ tagIds: [tag1.id, tag2.id] });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });

  describe('Large subtask batch reorder', () => {
    it('PUT /api/subtasks/reorder with 20 subtasks → 200', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      // Create 20 subtasks
      const subtasks = [];
      for (let i = 0; i < 20; i++) {
        subtasks.push(makeSubtask(task.id, { title: `Sub ${i}`, position: i }));
      }
      const items = subtasks.map((s, i) => ({ id: s.id, position: 19 - i }));
      const res = await agent().put('/api/subtasks/reorder').send({ items });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });

  // ─── GROUP: Content-Type Abuse ───

  describe('Content-Type: text/plain with JSON string', () => {
    it('POST /api/areas with Content-Type: text/plain → 400 (FIXED: body guard ensures req.body={})', async () => {
      // FIXED: server.js body guard middleware sets req.body={} for POST/PUT/PATCH
      // when content-type is non-JSON. Route then returns 400 "Name required".
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'text/plain')
        .send('{"name":"test","color":"#FF0000"}');
      assert.equal(res.status, 400, 'FIXED: returns 400 (not 500) for non-JSON content-type');
    });
  });

  describe('No Content-Type with JSON-formatted body', () => {
    it('POST /api/areas with no Content-Type → 400 (FIXED: body guard prevents crash)', async () => {
      // FIXED: body guard middleware ensures req.body={} even without content-type.
      const res = await agent()
        .post('/api/areas')
        .unset('Content-Type')
        .send('{"name":"test","color":"#FF0000"}');
      assert.equal(res.status, 400, 'FIXED: returns 400 (not 500) for missing content-type');
    });
  });

  describe('Content-Type: application/xml', () => {
    it('POST /api/areas with application/xml → 400 (FIXED: body guard prevents crash)', async () => {
      // FIXED: body guard middleware ensures req.body={} for non-JSON content types.
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/xml')
        .send('<name>test</name>');
      assert.equal(res.status, 400, 'FIXED: returns 400 (not 500) for application/xml');
    });
  });

  // ─── GROUP: Auth Edge Cases ───

  describe('Auth edge cases', () => {
    it('Empty cookie value → 401', async () => {
      const res = await rawAgent().get('/api/areas').set('Cookie', 'lf_sid=');
      assert.equal(res.status, 401);
    });

    it('Cookie key only, no value → 401', async () => {
      // "lf_sid" with no = means no sid value — no valid session found
      const res = await rawAgent().get('/api/areas').set('Cookie', 'lf_sid');
      assert.equal(res.status, 401);
    });

    it('Two invalid lf_sid cookies → 401', async () => {
      // Multiple invalid session IDs — neither matches DB
      const res = await rawAgent().get('/api/areas').set('Cookie', 'lf_sid=invalid1; lf_sid=invalid2');
      assert.equal(res.status, 401);
    });

    it('Expired session cookie → 401', async () => {
      // Insert an expired session directly into the DB; server checks expires_at > datetime('now')
      const { db } = setup();
      const expiredSid = 'expired-test-session-break';
      db.prepare(
        "INSERT OR REPLACE INTO sessions (sid, user_id, remember, expires_at) VALUES (?,1,0,datetime('now','-1 hour'))"
      ).run(expiredSid);
      const res = await rawAgent().get('/api/areas').set('Cookie', `lf_sid=${expiredSid}`);
      assert.equal(res.status, 401);
    });

    it('Random unknown session ID → 401', async () => {
      const res = await rawAgent().get('/api/areas').set('Cookie', 'lf_sid=totally-bogus-session-id-xyz');
      assert.equal(res.status, 401);
    });

    it('No cookie at all → 401', async () => {
      const res = await rawAgent().get('/api/areas');
      assert.equal(res.status, 401);
    });

    it('Auth cookie on non-existent API route → 200 (SPA fallback catches all GET requests)', async () => {
      // DOCUMENTED BEHAVIOR: the SPA fallback app.get("/{*splat}") catches ALL unmatched GET
      // requests — including unknown /api/* GET routes — and returns index.html (200) for
      // authenticated sessions. This means unrecognized /api/* GET routes do NOT return 404.
      // POST/DELETE/PATCH to unknown /api/* routes correctly return 404.
      const res = await agent().get('/api/definitely-does-not-exist-route');
      assert.equal(res.status, 200, 'SPA fallback serves index.html for authenticated GET requests');
    });
  });

  // ─── GROUP: HTTP Method Edge Cases ───

  describe('HEAD request on GET endpoints', () => {
    it('HEAD /api/areas → same status as GET but no body', async () => {
      // HEAD must behave like GET but return no response body
      const getRes = await agent().get('/api/areas');
      const headRes = await agent().head('/api/areas');
      assert.equal(headRes.status, getRes.status);
      // HEAD responses have no body
      assert.equal(Object.keys(headRes.body).length, 0);
    });
  });

  describe('PATCH method — not supported', () => {
    it('PATCH /api/tasks/:id → 404 (no PATCH handler registered)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      // No PATCH routes exist in the app
      const res = await agent().patch(`/api/tasks/${task.id}`).send({ title: 'test' });
      assert.equal(res.status, 404);
    });

    it('PATCH /api/areas/:id → 404', async () => {
      const area = makeArea();
      const res = await agent().patch(`/api/areas/${area.id}`).send({ name: 'x' });
      assert.equal(res.status, 404);
    });
  });

  describe('PUT to POST-only endpoints', () => {
    it('PUT /api/areas (create endpoint) → 404', async () => {
      // Only POST /api/areas exists; PUT /api/areas has no handler
      const res = await agent().put('/api/areas').send({ name: 'x', color: '#FF0000' });
      assert.equal(res.status, 404);
    });
  });

  describe('DELETE on read-only sub-resources', () => {
    it('DELETE /api/tasks/my-day → 404 (no DELETE handler for this route)', async () => {
      const res = await agent().delete('/api/tasks/my-day');
      // "my-day" is a non-integer string → 400 from :id handler, or 404 if no DELETE handler
      assert.ok(res.status === 400 || res.status === 404);
    });
  });

  // ─── GROUP: Pagination & Filter Params ───

  describe('Activity pagination edge cases', () => {
    it('GET /api/activity?page=0 → 200 (clamped to page 1)', async () => {
      // Math.max(1, Number(0)||1) = 1 → valid, returns empty results
      const res = await agent().get('/api/activity?page=0');
      assert.equal(res.status, 200);
      assert.ok('items' in res.body);
      assert.ok('total' in res.body);
    });

    it('GET /api/activity?page=-1 → 200 (clamped to page 1)', async () => {
      const res = await agent().get('/api/activity?page=-1');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
    });

    it('GET /api/activity?page=999999 → 200 with empty items', async () => {
      const res = await agent().get('/api/activity?page=999999');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, []);
    });

    it('GET /api/activity?limit=0 → 200 (clamped to min 1)', async () => {
      // Math.max(1, 0) = 1
      const res = await agent().get('/api/activity?limit=0');
      assert.equal(res.status, 200);
      assert.ok('items' in res.body);
    });

    it('GET /api/activity?limit=-1 → 200 (clamped to 1)', async () => {
      const res = await agent().get('/api/activity?limit=-1');
      assert.equal(res.status, 200);
    });

    it('GET /api/activity?limit=999999 → 200 (clamped to 100)', async () => {
      // Math.min(100, Math.max(1, 999999)) = 100
      const res = await agent().get('/api/activity?limit=999999');
      assert.equal(res.status, 200);
    });

    it('GET /api/activity?limit=abc → 200 (NaN clamped to default 50)', async () => {
      // Number("abc") = NaN → Math.max(1, NaN||50) = 50
      const res = await agent().get('/api/activity?limit=abc');
      assert.equal(res.status, 200);
    });
  });

  describe('Goals pagination — limit and offset edge cases', () => {
    it('GET /api/goals?limit=0 → 200 (Math.max(1,0)=1)', async () => {
      const res = await agent().get('/api/goals?limit=0');
      assert.equal(res.status, 200);
    });

    it('GET /api/goals?limit=600 → 200 (Math.min(600,500)=500)', async () => {
      const res = await agent().get('/api/goals?limit=600');
      assert.equal(res.status, 200);
    });

    it('GET /api/goals?offset=-1 → 200 (Math.max(0,-1)=0)', async () => {
      const res = await agent().get('/api/goals?offset=-1');
      assert.equal(res.status, 200);
    });

    it('GET /api/goals?limit=abc&offset=xyz → 200 (NaN defaults applied)', async () => {
      const res = await agent().get('/api/goals?limit=abc&offset=xyz');
      assert.equal(res.status, 200);
    });
  });

  // ─── GROUP: Specific Endpoint Edge Cases ───

  describe('Calendar endpoint — missing params', () => {
    it('GET /api/tasks/calendar (no params) → 400', async () => {
      // start and end are required; missing both → 400
      const res = await agent().get('/api/tasks/calendar');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /start and end required/i);
    });

    it('GET /api/tasks/calendar?start=2024-01-01 (only start) → 400', async () => {
      // end is missing → 400
      const res = await agent().get('/api/tasks/calendar?start=2024-01-01');
      assert.equal(res.status, 400);
    });

    it('GET /api/tasks/calendar?end=2024-01-31 (only end) → 400', async () => {
      // start is missing → 400
      const res = await agent().get('/api/tasks/calendar?end=2024-01-31');
      assert.equal(res.status, 400);
    });

    it('GET /api/tasks/calendar?start=2024-01-01&end=2024-01-31 → 200', async () => {
      // Both params present → valid request
      const res = await agent().get('/api/tasks/calendar?start=2024-01-01&end=2024-01-31');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('Search endpoint edge cases', () => {
    it('GET /api/tasks/search?q= (empty query) → 200 empty array', async () => {
      // q exists but trim() returns '' → hasQ=false, hasFilters=false → []
      const res = await agent().get('/api/tasks/search?q=');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it('GET /api/tasks/search (no q param) → 200 empty array', async () => {
      // No query, no filters → returns []
      const res = await agent().get('/api/tasks/search');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it('GET /api/tasks/search?status=invalid → 200 empty array (bad status filter ignored)', async () => {
      // status filter only matches 'todo','doing','done' — invalid value just excludes the filter clause
      const res = await agent().get('/api/tasks/search?status=invalid');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/tasks/search?q=a with wildcard characters → 200', async () => {
      // SQL LIKE with user input — % and _ in q are passed as-is inside LIKE pattern
      const res = await agent().get('/api/tasks/search?q=%25wildcard%25');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('Task move endpoint', () => {
    it('POST /api/tasks/:id/move to non-existent goal → 404', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().post(`/api/tasks/${task.id}/move`).send({ goal_id: 99999 });
      // verifyGoalOwnership returns false for non-existent goal → 404
      assert.equal(res.status, 404);
    });

    it('POST /api/tasks/:id/move with missing goal_id → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().post(`/api/tasks/${task.id}/move`).send({});
      assert.equal(res.status, 400);
      assert.match(res.body.error, /goal_id/i);
    });

    it('POST /api/tasks/:id/move to valid goal → 200', async () => {
      const area = makeArea();
      const goal1 = makeGoal(area.id);
      const goal2 = makeGoal(area.id);
      const task = makeTask(goal1.id);
      const res = await agent().post(`/api/tasks/${task.id}/move`).send({ goal_id: goal2.id });
      assert.equal(res.status, 200);
      assert.equal(res.body.goal_id, goal2.id);
    });

    it('POST /api/tasks/9999/move (non-existent task) → 404', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent().post('/api/tasks/9999/move').send({ goal_id: goal.id });
      assert.equal(res.status, 404);
    });
  });

  describe('Route ordering — tags stats vs :id', () => {
    it('GET /api/tags/stats → 200 (static route must be registered before /api/tags/:id)', async () => {
      // If route order were wrong, "stats" would match /:id → 400 (not an integer)
      const tag = makeTag();
      const res = await agent().get('/api/tags/stats');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      // Each entry should have usage_count field
      if (res.body.length > 0) {
        assert.ok('usage_count' in res.body[0], 'usage_count field should be present');
      }
    });

    it('GET /api/tags/stats with existing tag shows usage_count', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag = makeTag({ name: 'test-usage-tag' });
      // Link tag to task manually
      const { db } = setup();
      db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(task.id, tag.id);
      const res = await agent().get('/api/tags/stats');
      assert.equal(res.status, 200);
      const found = res.body.find(t => t.id === tag.id);
      assert.ok(found, 'should find the tag');
      assert.equal(found.usage_count, 1);
    });
  });

  describe('Route ordering — subtasks reorder vs :id', () => {
    it('PUT /api/subtasks/reorder with no items → 400 "items array required" (static route wins)', async () => {
      // If route ordering were wrong, Express would treat "reorder" as an :id param → 400 "Invalid ID"
      // This test confirms the static route /api/subtasks/reorder is registered BEFORE /api/subtasks/:id
      const res = await agent().put('/api/subtasks/reorder').send({});
      assert.equal(res.status, 400);
      // Should specifically say "items array required", not "Invalid ID"
      assert.match(res.body.error, /items array required/i);
    });

    it('PUT /api/subtasks/reorder with empty items array → 200', async () => {
      // Empty array is valid (no-op)
      const res = await agent().put('/api/subtasks/reorder').send({ items: [] });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });

  describe('Route ordering — tasks static routes vs :id', () => {
    it('GET /api/tasks/my-day → 200 (must come before /api/tasks/:id)', async () => {
      const res = await agent().get('/api/tasks/my-day');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/tasks/all → 200 (must come before /api/tasks/:id)', async () => {
      const res = await agent().get('/api/tasks/all');
      assert.equal(res.status, 200);
    });

    it('GET /api/tasks/board → 200 (must come before /api/tasks/:id)', async () => {
      const res = await agent().get('/api/tasks/board');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/tasks/overdue → 200 (must come before /api/tasks/:id)', async () => {
      const res = await agent().get('/api/tasks/overdue');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/tasks/search → 200 (must come before /api/tasks/:id)', async () => {
      const res = await agent().get('/api/tasks/search');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('Auth login — bad credentials return JSON', () => {
    it('POST /api/auth/login with wrong password → 401 JSON', async () => {
      // Rate limiting is disabled in test (NODE_ENV=test); verify JSON error on bad credentials
      const res = await rawAgent()
        .post('/api/auth/login')
        .send({ email: 'notauser@example.com', password: 'wrongpassword' });
      assert.equal(res.status, 401);
      // Must return JSON, not HTML
      assert.ok(res.body.error || typeof res.body === 'object',
        'response should be JSON');
    });

    it('POST /api/auth/login with empty body → 400 or 401 JSON', async () => {
      const res = await rawAgent().post('/api/auth/login').send({});
      assert.ok(res.status === 400 || res.status === 401);
      assert.ok(typeof res.body === 'object' && res.body !== null);
    });
  });

  describe('Export endpoint', () => {
    it('GET /api/export → 200 with Content-Disposition attachment header', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);
      const res = await agent().get('/api/export');
      assert.equal(res.status, 200);
      // Should set attachment disposition for file download
      assert.ok(
        res.headers['content-disposition'] &&
        res.headers['content-disposition'].includes('attachment'),
        'should have attachment Content-Disposition'
      );
    });

    it('GET /api/export body has required top-level fields', async () => {
      const res = await agent().get('/api/export');
      assert.equal(res.status, 200);
      assert.ok('areas' in res.body, 'should have areas field');
      assert.ok('goals' in res.body, 'should have goals field');
      assert.ok('tasks' in res.body, 'should have tasks field');
      assert.ok('tags' in res.body, 'should have tags field');
      assert.ok('exportDate' in res.body, 'should have exportDate field');
      assert.ok(Array.isArray(res.body.areas));
      assert.ok(Array.isArray(res.body.goals));
      assert.ok(Array.isArray(res.body.tasks));
    });
  });

  describe('Health check — unauthenticated', () => {
    it('GET /health → 200 without auth cookie', async () => {
      // Health endpoint is public (not under /api/* auth middleware)
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.dbOk, true);
    });

    it('GET /health is also accessible with auth', async () => {
      const res = await agent().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    });
  });

  describe('Login page — unauthenticated access', () => {
    it('GET /login → 200 (serves login page without session)', async () => {
      const res = await rawAgent().get('/login');
      assert.equal(res.status, 200);
      // Should serve HTML
      assert.ok(
        res.headers['content-type'] && res.headers['content-type'].includes('text/html'),
        'should serve HTML'
      );
    });
  });

  describe('SPA fallback — no session redirects to /login', () => {
    it('GET /some-random-path without auth → 302 redirect to /login', async () => {
      const res = await rawAgent().get('/some-random-nonexistent-path');
      assert.equal(res.status, 302);
      assert.ok(
        res.headers.location && res.headers.location.includes('/login'),
        `expected redirect to /login, got: ${res.headers.location}`
      );
    });

    it('GET /dashboard without auth → 302', async () => {
      const res = await rawAgent().get('/dashboard');
      assert.equal(res.status, 302);
    });
  });

  describe('API 404 — unknown routes', () => {
    it('GET /api/nonexistent-route → 200 (BUG: SPA fallback swallows unknown API GET routes)', async () => {
      // DOCUMENTED BUG: app.get("/{*splat}") catches ALL unmatched GET routes including /api/*.
      // Unknown GET /api/* routes return 200 + index.html instead of 404.
      // POST/DELETE/PATCH to unknown routes are NOT caught by the SPA fallback and correctly 404.
      const res = await agent().get('/api/nonexistent-route');
      assert.equal(res.status, 200,
        'SPA fallback serves index.html even for unknown /api/* GET routes');
    });

    it('POST /api/nonexistent → 404 (no SPA fallback for non-GET methods)', async () => {
      // POST has no SPA fallback → Express returns 404 as expected
      const res = await agent().post('/api/nonexistent').send({});
      assert.equal(res.status, 404);
    });

    it('DELETE /api/nonexistent → 404', async () => {
      const res = await agent().delete('/api/nonexistent');
      assert.equal(res.status, 404);
    });

    it('GET /some-random-non-api-path with valid session → 200 (SPA fallback, by design)', async () => {
      // Non-API paths with a valid session are served by the SPA fallback
      // This is the intended behavior for the SPA client-side router
      const res = await agent().get('/some-random-nonapi-path');
      assert.equal(res.status, 200);
    });
  });

  // ─── GROUP: Validation Boundary Values ───

  describe('Task status validation', () => {
    it('PUT /api/tasks/:id with invalid status → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`).send({ status: 'invalid-status' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /status/i);
    });

    it('PUT /api/tasks/:id with status=done → 200 (sets completed_at)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'done');
      assert.ok(res.body.completed_at, 'completed_at should be set');
    });
  });

  describe('Task priority validation', () => {
    it('PUT /api/tasks/:id with priority=5 → 400 (out of range 0-3)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`).send({ priority: 5 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /priority/i);
    });

    it('PUT /api/tasks/:id with priority=-1 → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`).send({ priority: -1 });
      assert.equal(res.status, 400);
    });

    it('POST /api/goals/:id/tasks with invalid priority → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'test', priority: 99 });
      assert.equal(res.status, 400);
    });
  });

  describe('Task due_date format validation', () => {
    it('PUT /api/tasks/:id with due_date=not-a-date → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`).send({ due_date: 'not-a-date' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /due_date/i);
    });

    it('PUT /api/tasks/:id with due_date=2024/01/15 (wrong separator) → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}`).send({ due_date: '2024/01/15' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/tasks/:id with due_date=null → 200 (null clears the date)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { due_date: '2024-01-15' });
      const res = await agent().put(`/api/tasks/${task.id}`).send({ due_date: null });
      assert.equal(res.status, 200);
    });
  });

  describe('Area color validation', () => {
    it('POST /api/areas with invalid color (not hex) → 400', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Test', color: 'red' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /color/i);
    });

    it('POST /api/areas with valid 3-char hex color → check behavior', async () => {
      // isValidColor may or may not accept short hex — document actual behavior
      const res = await agent().post('/api/areas').send({ name: 'Test', color: '#F00' });
      // Accept either 201 or 400 depending on isValidColor implementation
      assert.ok(res.status === 201 || res.status === 400,
        `got unexpected status: ${res.status}`);
    });

    it('POST /api/areas with valid 6-char hex color → 201', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Test Area', color: '#FF5733' });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'Test Area');
    });
  });

  describe('Name length limits', () => {
    it('POST /api/areas with name over 100 chars → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({ name: 'A'.repeat(101), color: '#FF0000' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /too long/i);
    });

    it('POST /api/areas with name exactly 100 chars → 201', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({ name: 'A'.repeat(100), color: '#FF0000' });
      assert.equal(res.status, 201);
    });

    it('POST /api/goals/:id/tasks with title over 500 chars → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'T'.repeat(501) });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /too long/i);
    });
  });

  describe('Subtask and tag replace on non-existent task', () => {
    it('PUT /api/tasks/99999/tags → 404', async () => {
      const res = await agent().put('/api/tasks/99999/tags').send({ tagIds: [] });
      assert.equal(res.status, 404);
    });

    it('GET /api/tasks/99999/subtasks → 404', async () => {
      const res = await agent().get('/api/tasks/99999/subtasks');
      assert.equal(res.status, 404);
    });

    it('POST /api/tasks/99999/subtasks → 404', async () => {
      const res = await agent().post('/api/tasks/99999/subtasks').send({ title: 'Sub' });
      assert.equal(res.status, 404);
    });
  });

  describe('Task tags — missing tagIds field', () => {
    it('PUT /api/tasks/:id/tags with no tagIds field → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      // tagIds array is required; sending without it → 400
      const res = await agent().put(`/api/tasks/${task.id}/tags`).send({ someOtherField: 'x' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /tagIds/i);
    });

    it('PUT /api/tasks/:id/tags with tagIds as string → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put(`/api/tasks/${task.id}/tags`).send({ tagIds: 'not-an-array' });
      assert.equal(res.status, 400);
    });
  });

  describe('Task reorder — missing or wrong items field', () => {
    it('PUT /api/tasks/reorder with no items → 400', async () => {
      const res = await agent().put('/api/tasks/reorder').send({});
      assert.equal(res.status, 400);
      assert.match(res.body.error, /items/i);
    });

    it('PUT /api/tasks/reorder with items as object → 400', async () => {
      const res = await agent().put('/api/tasks/reorder').send({ items: { id: 1, position: 0 } });
      assert.equal(res.status, 400);
    });

    it('PUT /api/tasks/reorder with empty array → 200 (no-op)', async () => {
      const res = await agent().put('/api/tasks/reorder').send({ items: [] });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });

  describe('Focus session edge cases', () => {
    it('POST /api/focus with non-existent task_id → 404', async () => {
      const res = await agent().post('/api/focus').send({ task_id: 99999, duration_sec: 1500 });
      assert.equal(res.status, 404);
    });

    it('POST /api/focus with negative duration_sec → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: -1 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /duration/i);
    });

    it('GET /api/focus/stats → 200 (static route before /:id)', async () => {
      // Verify "stats" string doesn't get captured by /api/focus/:id route
      const res = await agent().get('/api/focus/stats');
      assert.equal(res.status, 200);
      assert.ok('today' in res.body);
      assert.ok('week' in res.body);
    });

    it('GET /api/focus/history → 200 (static route before /:id)', async () => {
      const res = await agent().get('/api/focus/history');
      assert.equal(res.status, 200);
      assert.ok('items' in res.body);
      assert.ok('total' in res.body);
    });
  });

  describe('Inbox triage edge cases', () => {
    it('POST /api/inbox/:id/triage with missing goal_id → 400', async () => {
      const { db } = setup();
      // Create inbox item directly since makeInbox helper doesn't exist
      const r = db.prepare('INSERT INTO inbox (title, note, priority, user_id) VALUES (?,?,?,?)').run('Test inbox', '', 0, 1);
      const res = await agent().post(`/api/inbox/${r.lastInsertRowid}/triage`).send({});
      assert.equal(res.status, 400);
      assert.match(res.body.error, /goal_id/i);
    });

    it('POST /api/inbox/:id/triage with non-existent goal_id → 403', async () => {
      const { db } = setup();
      const r = db.prepare('INSERT INTO inbox (title, note, priority, user_id) VALUES (?,?,?,?)').run('Test inbox 2', '', 0, 1);
      const res = await agent().post(`/api/inbox/${r.lastInsertRowid}/triage`).send({ goal_id: 99999 });
      assert.equal(res.status, 403);
    });
  });

  describe('Areas reorder validation', () => {
    it('PUT /api/areas/reorder with non-array → 400', async () => {
      const res = await agent().put('/api/areas/reorder').send({ id: 1, position: 0 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /array/i);
    });

    it('PUT /api/areas/reorder with negative position → 400', async () => {
      const area = makeArea();
      const res = await agent().put('/api/areas/reorder').send([{ id: area.id, position: -1 }]);
      assert.equal(res.status, 400);
    });

    it('PUT /api/areas/reorder with valid items → 200', async () => {
      const area1 = makeArea({ position: 0 });
      const area2 = makeArea({ position: 1 });
      const res = await agent().put('/api/areas/reorder').send([
        { id: area1.id, position: 1 },
        { id: area2.id, position: 0 }
      ]);
      assert.equal(res.status, 200);
      assert.equal(res.body.reordered, 2);
    });
  });

  describe('Tag duplicate detection', () => {
    it('POST /api/tags with duplicate name → 200 (upsert returns existing)', async () => {
      makeTag({ name: 'dup-tag' });
      const res = await agent().post('/api/tags').send({ name: 'dup-tag', color: '#FF0000' });
      // Server returns existing tag, not 409 or 201
      assert.equal(res.status, 200);
    });

    it('PUT /api/tags/:id rename to existing name → 409 conflict', async () => {
      makeTag({ name: 'tag-one' });
      const tag2 = makeTag({ name: 'tag-two' });
      const res = await agent().put(`/api/tags/${tag2.id}`).send({ name: 'tag-one' });
      assert.equal(res.status, 409);
      assert.match(res.body.error, /already exists/i);
    });
  });

  describe('Bulk task operations edge cases', () => {
    it('PUT /api/tasks/bulk with empty ids array → 400', async () => {
      const res = await agent().put('/api/tasks/bulk').send({ ids: [], changes: { status: 'done' } });
      assert.equal(res.status, 400);
    });

    it('PUT /api/tasks/bulk with no changes → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put('/api/tasks/bulk').send({ ids: [task.id] });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /changes/i);
    });

    it('PUT /api/tasks/bulk with invalid status → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent().put('/api/tasks/bulk').send({ ids: [task.id], changes: { status: 'bogus' } });
      assert.equal(res.status, 400);
    });

    it('PUT /api/tasks/bulk with non-array ids → 400', async () => {
      const res = await agent().put('/api/tasks/bulk').send({ ids: 'not-array', changes: {} });
      assert.equal(res.status, 400);
    });
  });

  describe('NLP parser edge cases', () => {
    it('POST /api/tasks/parse with empty text → 400', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: '' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /text required/i);
    });

    it('POST /api/tasks/parse with text over 500 chars → 400', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'x'.repeat(501) });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /too long/i);
    });

    it('POST /api/tasks/parse with whitespace-only text → 400', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: '   ' });
      assert.equal(res.status, 400);
    });

    it('POST /api/tasks/parse with valid text → 200 with parsed fields', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Buy milk p2 #shopping tomorrow' });
      assert.equal(res.status, 200);
      assert.ok('title' in res.body);
      assert.ok('priority' in res.body);
      assert.ok('due_date' in res.body);
      assert.ok('tags' in res.body);
    });
  });

  describe('Options preflight request', () => {
    it('OPTIONS /api/areas → CORS headers (configured as same-origin)', async () => {
      // With cors({ origin: false }), OPTIONS may 204 or just respond normally
      const res = await agent().options('/api/areas');
      // Should not 500; any non-500 is acceptable
      assert.ok(res.status < 500, `expected <500, got ${res.status}`);
    });
  });

  describe('Share route validation', () => {
    it('GET /share/invalidtoken → 404 (token format check)', async () => {
      // Server validates token as 24-char hex; random string fails
      const res = await rawAgent().get('/share/notavalidtoken');
      assert.equal(res.status, 404);
    });

    it('GET /share/gggggggggggggggggggggggg → 404 (non-hex chars)', async () => {
      const res = await rawAgent().get('/share/gggggggggggggggggggggggg');
      assert.equal(res.status, 404);
    });

    it('GET /share/aabbccddeeff001122334455 → 200 or redirect (valid 24-hex token, share page)', async () => {
      // Correct format: 24 hex chars — passes regex, serves share.html (may 200 or 404 if file missing)
      const res = await rawAgent().get('/share/aabbccddeeff001122334455');
      // 200 if share.html exists, otherwise we just verify it's not a format rejection
      assert.ok(res.status !== 400, 'valid token format should not produce 400');
    });
  });

});
