const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setup, cleanDb } = require('./helpers');

describe('Settings API', () => {
  let app;
  beforeEach(() => { ({ app } = setup()); cleanDb(); });

  it('GET /api/settings returns defaults when none stored', async () => {
    const res = await request(app).get('/api/settings');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.defaultView, 'myday');
    assert.strictEqual(res.body.theme, 'midnight');
    assert.strictEqual(res.body.focusDuration, '25');
    assert.strictEqual(res.body.shortBreak, '5');
    assert.strictEqual(res.body.longBreak, '15');
    assert.strictEqual(res.body.weekStart, '0');
    assert.strictEqual(res.body.defaultPriority, '0');
    assert.strictEqual(res.body.showCompleted, 'true');
    assert.strictEqual(res.body.confirmDelete, 'true');
    assert.strictEqual(res.body.dateFormat, 'relative');
    assert.strictEqual(res.body.autoMyDay, 'false');
  });

  it('PUT /api/settings stores and returns merged settings', async () => {
    const res = await request(app).put('/api/settings')
      .send({ theme: 'ocean', focusDuration: '30' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.theme, 'ocean');
    assert.strictEqual(res.body.focusDuration, '30');
    // other defaults unchanged
    assert.strictEqual(res.body.defaultView, 'myday');
    assert.strictEqual(res.body.longBreak, '15');
  });

  it('PUT /api/settings persists across GET', async () => {
    await request(app).put('/api/settings').send({ weekStart: '1' });
    const res = await request(app).get('/api/settings');
    assert.strictEqual(res.body.weekStart, '1');
    assert.strictEqual(res.body.defaultView, 'myday');
  });

  it('PUT /api/settings rejects unknown keys', async () => {
    const res = await request(app).put('/api/settings')
      .send({ unknown_key: 'bad', theme: 'forest' });
    assert.strictEqual(res.status, 200);
    // Valid key saved
    assert.strictEqual(res.body.theme, 'forest');
    // Unknown key not stored
    assert.strictEqual(res.body.unknown_key, undefined);
  });

  it('PUT /api/settings handles empty body', async () => {
    const res = await request(app).put('/api/settings').send({});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.defaultView, 'myday');
  });

  it('POST /api/settings/reset clears all and returns defaults', async () => {
    // Store some custom values
    await request(app).put('/api/settings')
      .send({ theme: 'nord', focusDuration: '50', weekStart: '1' });

    // Verify stored
    let res = await request(app).get('/api/settings');
    assert.strictEqual(res.body.theme, 'nord');

    // Reset
    res = await request(app).post('/api/settings/reset');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.theme, 'midnight');
    assert.strictEqual(res.body.focusDuration, '25');
    assert.strictEqual(res.body.weekStart, '0');

    // Verify reset persisted
    res = await request(app).get('/api/settings');
    assert.strictEqual(res.body.theme, 'midnight');
  });

  it('PUT /api/settings overwrites previous value for same key', async () => {
    await request(app).put('/api/settings').send({ dateFormat: 'iso' });
    await request(app).put('/api/settings').send({ dateFormat: 'eu' });
    const res = await request(app).get('/api/settings');
    assert.strictEqual(res.body.dateFormat, 'eu');
  });

  it('PUT /api/settings stores string values', async () => {
    const res = await request(app).put('/api/settings')
      .send({ confirmDelete: 'false', autoMyDay: 'true' });
    assert.strictEqual(res.body.confirmDelete, 'false');
    assert.strictEqual(res.body.autoMyDay, 'true');
  });
});
