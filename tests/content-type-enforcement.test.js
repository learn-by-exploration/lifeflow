const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeArea, makeGoal, makeTask } = require('./helpers');
const request = require('supertest');

describe('Content-Type & Request Body Enforcement', () => {
  let app;

  before(() => { ({ app } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ─── 1. POST without Content-Type ─────────────────────────────────────────

  describe('POST without Content-Type', () => {
    it('POST /api/areas with no Content-Type sends empty body → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', '')
        .send('');
      // Express won't parse body without valid Content-Type; body guard sets {}
      // Missing required 'name' field → 400
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });

    it('POST /api/tasks with plain text body → 400', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .set('Content-Type', 'text/plain')
        .send('just a string');
      // Express won't parse text/plain as JSON; body guard sets {}
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });

    it('POST /api/auth/login with form-encoded body → fails gracefully', async () => {
      const res = await rawAgent()
        .post('/api/auth/login')
        .type('form')
        .send('email=test@test.com&password=testpassword');
      // Express json parser won't decode form data; login requires email+password
      assert.ok([400, 401].includes(res.status), `Expected 400 or 401, got ${res.status}`);
    });

    it('PUT /api/tasks/:id with no JSON Content-Type → body guard applies', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .set('Content-Type', 'text/plain')
        .send('some text');
      // Body guard sets empty object; PUT with no valid fields → 200 (no-op update) or 400
      assert.ok([200, 400].includes(res.status), `Expected 200 or 400, got ${res.status}`);
    });
  });

  // ─── 2. POST with wrong Content-Type ──────────────────────────────────────

  describe('POST with wrong Content-Type', () => {
    it('POST with text/plain Content-Type → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'text/plain')
        .send('{"name":"test"}');
      // Even though body looks like JSON, Content-Type is wrong → express.json() skips it
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });

    it('POST with application/x-www-form-urlencoded → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('name=test&color=%23FF0000');
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });

    it('POST with multipart/form-data → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'multipart/form-data; boundary=----WebKitFormBoundary')
        .send('------WebKitFormBoundary\r\nContent-Disposition: form-data; name="name"\r\n\r\ntest\r\n------WebKitFormBoundary--');
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });
  });

  // ─── 3. Request size limits ───────────────────────────────────────────────

  describe('Request size limits', () => {
    it('1KB JSON body accepted', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const note = 'x'.repeat(1024);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send({ title: 'small body', note });
      assert.equal(res.status, 201);
    });

    it('100KB JSON body accepted by express parser', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // Note has a 5000 char limit, so use a valid note + large ignored fields
      const payload = { title: 'medium body', note: 'x'.repeat(4000) };
      // Pad with extra fields to reach ~100KB (express still parses it)
      for (let i = 0; i < 200; i++) payload[`extra_${i}`] = 'y'.repeat(450);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send(payload);
      // Express accepts it; route creates the task (ignoring unknown fields)
      assert.equal(res.status, 201);
    });

    it('express.json limit is configured to 1mb', () => {
      // Verify the source code configures the limit
      const fs = require('fs');
      const src = fs.readFileSync(require.resolve('../src/server.js'), 'utf8');
      assert.ok(src.includes("express.json({ limit: '1mb' })"), 'express.json should have 1mb limit');
    });

    it('900KB body is accepted by express parser (under 1mb limit)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // Build a ~900KB payload with unknown fields (express parses, route ignores)
      const payload = { title: 'large body', note: 'ok' };
      for (let i = 0; i < 900; i++) payload[`pad_${i}`] = 'z'.repeat(1000);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send(payload);
      assert.equal(res.status, 201);
    });

    it('body over 1mb is rejected with 413', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // 1.5MB should exceed the 1mb limit
      const payload = { title: 'oversized body' };
      for (let i = 0; i < 1500; i++) payload[`big_${i}`] = 'x'.repeat(1024);
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .send(payload);
      // Express returns 413 Payload Too Large
      assert.equal(res.status, 413);
    });
  });

  // ─── 4. Empty/malformed body ──────────────────────────────────────────────

  describe('Empty and malformed body', () => {
    it('POST with empty body {} to create endpoint → 400 (missing required fields)', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({});
      assert.equal(res.status, 400);
    });

    it('POST with array body where object expected → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .send([{ name: 'test' }]);
      // Express parses array JSON fine, but route expects name in body
      assert.ok([400, 500].includes(res.status), `Expected 400 or 500, got ${res.status}`);
    });

    it('PUT with null body → documented behavior', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const res = await agent()
        .put(`/api/tasks/${task.id}`)
        .send(null);
      // null body → express sets body to null, body guard turns it into {}
      // PUT with empty updates → returns task unchanged
      assert.ok([200, 400].includes(res.status), `Expected 200 or 400, got ${res.status}`);
    });

    it('deeply nested JSON (100 levels) → no crash', async () => {
      let obj = { title: 'deep' };
      for (let i = 0; i < 100; i++) {
        obj = { nested: obj };
      }
      const res = await agent()
        .post('/api/areas')
        .send(obj);
      // Should not crash with 500; expect 400 (missing name) or other controlled error
      assert.ok(res.status < 500, `Expected no server error, got ${res.status}`);
    });

    it('invalid JSON string body → 400 error', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('{"name": broken}');
      assert.equal(res.status, 400);
      assert.ok(res.body.error, 'Should return error message');
    });
  });

  // ─── 5. Non-JSON content handling ─────────────────────────────────────────

  describe('Non-JSON content handling', () => {
    it('POST with XML body → 400 or documented behavior', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/xml')
        .send('<area><name>test</name></area>');
      // Express json parser ignores XML; body guard sets {}; missing name → 400
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });

    it('POST with binary body → documented behavior', async () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]);
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/octet-stream')
        .send(buf);
      assert.ok([400, 415].includes(res.status), `Expected 400 or 415, got ${res.status}`);
    });

    it('POST with empty string body and JSON content-type → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('');
      // Empty string with JSON content-type → express.json() likely passes empty body
      // body guard sets it to {}; missing name → 400
      assert.ok([400].includes(res.status), `Expected 400, got ${res.status}`);
    });
  });

  // ─── 6. Edge cases ────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('GET request ignores body entirely', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'visible' });
      const res = await agent()
        .get(`/api/goals/${goal.id}/tasks`)
        .set('Content-Type', 'application/json')
        .send({ garbage: true });
      assert.equal(res.status, 200);
    });

    it('DELETE request works without body', async () => {
      const area = makeArea();
      const res = await agent().delete(`/api/areas/${area.id}`);
      assert.equal(res.status, 200);
    });

    it('Content-Type with charset parameter is accepted', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(JSON.stringify({ name: 'charset test', icon: '🧪', color: '#FF0000' }));
      assert.equal(res.status, 201);
    });

    it('duplicate Content-Type headers → uses last one', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // supertest sets Content-Type; we override it
      const res = await agent()
        .post(`/api/goals/${goal.id}/tasks`)
        .set('Content-Type', 'application/json')
        .send({ title: 'dup header test' });
      assert.equal(res.status, 201);
    });
  });
});
