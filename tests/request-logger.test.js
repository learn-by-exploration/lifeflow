const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

describe('Request Logger Middleware', () => {
  it('middleware calls next()', async () => {
    const createRequestLogger = require('../src/middleware/request-logger');
    let called = false;
    const logger = { info: () => {} };
    const mw = createRequestLogger(logger);
    const req = { method: 'GET', path: '/api/test', ip: '127.0.0.1' };
    const res = { on: (ev, fn) => { if (ev === 'finish') fn(); }, statusCode: 200 };
    const next = () => { called = true; };
    mw(req, res, next);
    assert.equal(called, true);
  });

  it('emits log with method, path, status', async () => {
    const createRequestLogger = require('../src/middleware/request-logger');
    let logged = null;
    const logger = { info: (data) => { logged = data; } };
    const mw = createRequestLogger(logger);
    const req = { method: 'POST', path: '/api/tasks', ip: '127.0.0.1', userId: null };
    let finishCb;
    const res = { on: (ev, fn) => { if (ev === 'finish') finishCb = fn; }, statusCode: 201 };
    mw(req, res, () => {});
    finishCb();
    assert.equal(logged.method, 'POST');
    assert.equal(logged.path, '/api/tasks');
    assert.equal(logged.status, 201);
  });

  it('includes userId when authenticated', async () => {
    const createRequestLogger = require('../src/middleware/request-logger');
    let logged = null;
    const logger = { info: (data) => { logged = data; } };
    const mw = createRequestLogger(logger);
    const req = { method: 'GET', path: '/api/areas', ip: '127.0.0.1', userId: 42 };
    let finishCb;
    const res = { on: (ev, fn) => { if (ev === 'finish') finishCb = fn; }, statusCode: 200 };
    mw(req, res, () => {});
    finishCb();
    assert.equal(logged.userId, 42);
  });
});
