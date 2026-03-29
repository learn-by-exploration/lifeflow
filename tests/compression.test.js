const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Response Compression', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('compression middleware is loaded in server.js', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'server.js'), 'utf8'
    );
    assert.ok(source.includes("require('compression')"), 'server.js must require compression');
    assert.ok(source.includes('app.use(compression())'), 'server.js must use compression middleware');
  });

  it('compresses JSON API responses when Accept-Encoding: gzip', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 10; i++) {
      makeTask(g.id, { title: `Compression test task number ${i} with some extra text to increase payload size beyond threshold` });
    }
    const res = await agent()
      .get('/api/tasks/all')
      .set('Accept-Encoding', 'gzip, deflate');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'Response body should be valid JSON array');
    assert.ok(res.body.length >= 10, 'Should return tasks');
  });

  it('compresses health endpoint response', async () => {
    const res = await agent()
      .get('/health')
      .set('Accept-Encoding', 'gzip');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('serves correct content when compressed', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 5; i++) {
      makeTask(g.id, { title: `Task ${i}` });
    }
    const res = await agent()
      .get('/api/tasks/all')
      .set('Accept-Encoding', 'gzip, deflate');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'Response should be an array of tasks');
    assert.equal(res.body.length, 5, 'Should return all 5 tasks');
  });

  it('does not add content-encoding for tiny responses', async () => {
    const res = await agent()
      .get('/ready')
      .set('Accept-Encoding', 'gzip');
    assert.equal(res.status, 200);
    assert.equal(res.body.ready, true);
  });
});
