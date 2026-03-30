/**
 * Error Handler & Information Leakage tests (v0.7.17)
 *
 * Verifies:
 * - Error responses use consistent JSON shape
 * - No stack traces, file paths, or SQL leaked to client
 * - Malformed request handling (bad JSON, wrong content-type)
 * - 404 handling for API routes
 * - Health endpoint does not expose excessive info
 * - Error handler source strips stack in non-development mode
 */
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Error Handler & Information Leakage', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  // ─── Error handler response shape ─────────────────────────────────────────

  describe('Error response shape', () => {
    it('400 error response has { error: "message" } shape', async () => {
      // POST /api/areas without required name → 400
      const res = await agent().post('/api/areas').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error, 'Response must have error property');
      assert.equal(typeof res.body.error, 'string', 'Error must be a string message');
    });

    it('404 error response has { error: "..." } shape', async () => {
      const res = await agent().get('/api/tasks/99999');
      assert.equal(res.status, 404);
      assert.ok(res.body.error, 'Response must have error property');
      assert.equal(typeof res.body.error, 'string');
    });

    it('Error response Content-Type is application/json', async () => {
      const res = await agent().post('/api/areas').send({});
      assert.equal(res.status, 400);
      assert.ok(
        res.headers['content-type'].includes('application/json'),
        'Error responses must be JSON'
      );
    });
  });

  // ─── Malformed request handling ───────────────────────────────────────────

  describe('Malformed request handling', () => {
    it('Malformed JSON body → 400 (not 500)', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('{ this is not valid json }');
      assert.equal(res.status, 400, 'Malformed JSON must return 400');
      assert.ok(res.body.error, 'Must have error message');
    });

    it('Content-Type: text/plain on POST /api/areas → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'text/plain')
        .send('{"name":"test"}');
      assert.equal(res.status, 400, 'Non-JSON content-type must return 400');
    });
  });

  // ─── 404 handling ─────────────────────────────────────────────────────────

  describe('API 404 handling', () => {
    it('GET /api/nonexistent → 404 (not SPA fallback)', async () => {
      const res = await agent().get('/api/nonexistent');
      assert.equal(res.status, 404, 'Unknown API routes must return 404');
      assert.ok(res.body.error, 'Must have error message');
    });

    it('GET /api/tasks/99999 → 404', async () => {
      const res = await agent().get('/api/tasks/99999');
      assert.equal(res.status, 404);
    });

    it('DELETE /api/tasks/99999 → 404', async () => {
      const res = await agent().delete('/api/tasks/99999');
      assert.equal(res.status, 404);
    });
  });

  // ─── Information leakage prevention ───────────────────────────────────────

  describe('No information leakage in error responses', () => {
    it('Error responses do not contain stack traces', async () => {
      const res = await agent().post('/api/areas').send({});
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('at '), 'Must not contain stack trace "at " pattern');
      assert.ok(!body.includes('Error:'), 'Must not contain Error: prefix');
    });

    it('Error responses do not contain file paths', async () => {
      const res = await agent().post('/api/areas').send({});
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('/home/'), 'Must not contain absolute paths');
      assert.ok(!body.includes('/src/'), 'Must not contain source paths');
      assert.ok(!body.includes('.js:'), 'Must not contain JS file references');
      assert.ok(!body.includes('node_modules'), 'Must not contain node_modules');
    });

    it('Error responses do not contain SQL query text', async () => {
      // Try to trigger a constraint violation
      const area = makeArea();
      const goal = makeGoal(area.id);
      const _task = makeTask(goal.id);
      // Try to delete the goal which has tasks — should cascade or error
      const res = await agent().delete(`/api/goals/${goal.id}`);
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('SELECT'), 'Must not contain SQL SELECT');
      assert.ok(!body.includes('INSERT'), 'Must not contain SQL INSERT');
      assert.ok(!body.includes('DELETE FROM'), 'Must not contain SQL DELETE FROM');
      assert.ok(!body.includes('SQLITE'), 'Must not contain SQLITE references');
    });

    it('404 responses do not leak internal details', async () => {
      const res = await agent().get('/api/tasks/99999');
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('Cannot'), 'Must not contain Express default "Cannot" message');
      assert.ok(!body.includes('node_modules'), 'Must not contain node_modules');
    });
  });

  // ─── Health endpoint ──────────────────────────────────────────────────────

  describe('Health endpoint information exposure', () => {
    it('GET /health does not expose version', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.ok(!res.body.version, 'Health endpoint must not expose version');
    });

    it('GET /health does not expose uptime', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.ok(res.body.uptime === undefined, 'Health endpoint must not expose uptime');
    });

    it('GET /health returns minimal status', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    });
  });

  // ─── Static analysis of error handler ─────────────────────────────────────

  describe('Error handler source code safety', () => {
    it('Error handler does not send stack traces in non-dev mode', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'middleware', 'errors.js'), 'utf8'
      );
      // Should not have err.stack in a res.json or res.send call
      const lines = src.split('\n');
      for (const line of lines) {
        if (line.includes('res.json') || line.includes('res.send')) {
          assert.ok(
            !line.includes('err.stack') && !line.includes('stack'),
            `Line should not send stack: ${line.trim()}`
          );
        }
      }
    });

    it('Error handler does not expose err.message directly for 500 errors', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'middleware', 'errors.js'), 'utf8'
      );
      // The 500 catch-all should use a generic message, not err.message
      // Look for the pattern: status 500 should use fixed string
      assert.ok(
        src.includes("'Internal server error'") || src.includes('"Internal server error"'),
        'Must have generic "Internal server error" message for 500s'
      );
    });
  });
});
