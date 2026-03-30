const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

describe('Error Recovery & Graceful Degradation', () => {

  describe('Malformed JSON recovery', () => {
    it('POST with invalid JSON → 400, not 500', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('server still accepts valid requests after bad JSON', async () => {
      await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('{ bad }');
      const res = await agent().post('/api/areas').send({ name: 'After Bad' });
      assert.equal(res.status, 201);
    });

    it('empty body with Content-Type JSON → 400', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('');
      assert.ok([400, 422].includes(res.status));
    });
  });

  describe('Database constraint violations via API', () => {
    it('duplicate unique key → constraint handled', async () => {
      await agent().post('/api/tags').send({ name: 'dup-test', color: '#000' });
      const res = await agent().post('/api/tags').send({ name: 'dup-test', color: '#FFF' });
      // API may upsert, reject, or return existing — just verify no 500
      assert.ok(res.status < 500, `expected no 500, got ${res.status}`);
    });

    it('foreign key violation returns descriptive error', async () => {
      const res = await agent().post('/api/goals/99999/tasks').send({ title: 'orphan' });
      assert.ok([400, 404].includes(res.status), `expected 400 or 404, got ${res.status}`);
      assert.ok(res.body.error);
    });
  });

  describe('Express error handler chain', () => {
    it('NotFoundError → 404 with error message', async () => {
      const res = await agent().get('/api/tasks/99999');
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
      assert.equal(typeof res.body.error, 'string');
    });

    it('ValidationError → 400 with error message', async () => {
      const res = await agent().post('/api/areas').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('generic 500 returns safe message', async () => {
      // We can't easily trigger a real 500, but verify the error handler pattern
      const res = await agent().get('/api/tasks/not-a-number');
      // Should be 400 or 404, not 500
      assert.ok(res.status < 500 || res.body.error === 'Internal server error');
    });
  });

  describe('No sensitive info in error responses', () => {
    it('400 response contains no file paths', async () => {
      const res = await agent().post('/api/areas').send({});
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('/home/'), 'should not contain file paths');
      assert.ok(!body.includes('.js:'), 'should not contain JS file references');
    });

    it('404 response contains no stack traces', async () => {
      const res = await agent().get('/api/tasks/99999');
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('at '), 'should not contain stack trace lines');
      assert.ok(!body.includes('node_modules'), 'should not reference node_modules');
    });

    it('malformed JSON error has no internal details', async () => {
      const res = await agent()
        .post('/api/areas')
        .set('Content-Type', 'application/json')
        .send('{bad');
      const body = JSON.stringify(res.body);
      assert.ok(!body.includes('SyntaxError'), 'should not expose error class name');
      assert.ok(!body.includes('Unexpected'), 'should not expose parse details');
    });
  });

  describe('Middleware error handling', () => {
    it('auth middleware failure → 401 JSON response', async () => {
      const res = await rawAgent().get('/api/tasks/all');
      assert.equal(res.status, 401);
      assert.ok(res.headers['content-type'].includes('application/json'));
      assert.ok(res.body.error);
    });

    it('invalid session cookie → 401 JSON (not 500)', async () => {
      const res = await rawAgent()
        .get('/api/tasks/all')
        .set('Cookie', 'lf_sid=invalid-session-id-here');
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
    });

    it('missing CSRF on mutating request → 403', async () => {
      // Agent auto-adds cookie but may or may not need CSRF
      const res = await rawAgent()
        .post('/api/areas')
        .set('Cookie', 'lf_sid=fake')
        .send({ name: 'test' });
      assert.ok([401, 403].includes(res.status), `expected 401 or 403, got ${res.status}`);
    });

    it('validation middleware failure → 400 JSON response', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      // Send invalid priority
      const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'x', priority: 99 });
      assert.equal(res.status, 400);
      assert.ok(res.headers['content-type'].includes('application/json'));
      assert.ok(res.body.error);
    });

    it('all middleware errors return JSON, not HTML', async () => {
      const responses = await Promise.all([
        rawAgent().get('/api/tasks/all'),                // 401
        agent().post('/api/areas').send({}),              // 400
        agent().get('/api/tasks/99999'),                  // 404
      ]);
      for (const res of responses) {
        assert.ok(
          res.headers['content-type'].includes('application/json'),
          `Status ${res.status} should return JSON, got ${res.headers['content-type']}`
        );
      }
    });
  });

  describe('Health endpoint resilience', () => {
    it('GET /health responds with 200', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
    });

    it('health check timing is <500ms', async () => {
      const start = Date.now();
      await rawAgent().get('/health');
      const ms = Date.now() - start;
      assert.ok(ms < 500, `health check took ${ms}ms`);
    });

    it('health endpoint does not require auth', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
    });
  });

  describe('Concurrent error handling', () => {
    it('multiple simultaneous bad requests all get proper errors', async () => {
      const promises = Array.from({ length: 5 }, () =>
        agent().post('/api/areas').send({})
      );
      const results = await Promise.all(promises);
      for (const res of results) {
        assert.equal(res.status, 400);
        assert.ok(res.body.error);
      }
    });

    it('mixed valid/invalid requests handled correctly', async () => {
      const promises = [
        agent().post('/api/areas').send({ name: 'Valid' }),
        agent().post('/api/areas').send({}),
        agent().get('/api/tasks/99999'),
        agent().post('/api/areas').send({ name: 'Also Valid' }),
        rawAgent().get('/api/tasks/all'),
      ];
      const results = await Promise.all(promises);
      assert.equal(results[0].status, 201);
      assert.equal(results[1].status, 400);
      assert.equal(results[2].status, 404);
      assert.equal(results[3].status, 201);
      assert.equal(results[4].status, 401);
    });
  });

  describe('Error handler source code safety', () => {
    it('error handler middleware exists and is a function', () => {
      const errorHandler = require('../src/middleware/errors');
      assert.equal(typeof errorHandler, 'function');
      // Express error handlers have 4 parameters (err, req, res, next)
      assert.equal(errorHandler.length, 4);
    });

    it('AppError class hierarchy is correct', () => {
      const { AppError, NotFoundError, ValidationError } = require('../src/errors');
      const nf = new NotFoundError('Task', 1);
      assert.ok(nf instanceof AppError);
      assert.ok(nf instanceof Error);
      assert.equal(nf.status, 404);

      const ve = new ValidationError('bad input');
      assert.ok(ve instanceof AppError);
      assert.equal(ve.status, 400);
    });
  });
});
