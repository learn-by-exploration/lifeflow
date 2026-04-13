const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const workerJs = fs.readFileSync(path.join(PUBLIC, 'timer-worker.js'), 'utf8');

describe('Focus Timer Worker', () => {
  before(() => { setup(); });
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('timer-worker.js defines timer worker command/message contract', () => {
    assert.ok(workerJs.includes("cmd: 'start'"));
    assert.ok(workerJs.includes("type: 'tick'"));
    assert.ok(workerJs.includes("type: 'complete'"));
    assert.ok(workerJs.includes('self.onmessage'));
  });

  it('app.js creates worker and handles fallback', () => {
    assert.ok(appJs.includes("new Worker('/timer-worker.js')"));
    assert.ok(appJs.includes('function ensureFocusWorker()'));
    assert.ok(appJs.includes('ftWorker.onerror'));
    assert.ok(appJs.includes('Using standard timer'));
  });

  it('focus completion includes notification and audio hooks', () => {
    assert.ok(appJs.includes('function notifyFocusCompletion()'));
    assert.ok(appJs.includes('function playFocusCompletionChime()'));
    assert.ok(appJs.includes('new Notification('));
    assert.ok(appJs.includes('AudioContext||window.webkitAudioContext'));
  });

  it('focus API session lifecycle still works with authenticated user', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Focus Lifecycle Task' });
    const created = await agent().post('/api/focus').send({
      task_id: task.id,
      duration_sec: 0,
      type: 'pomodoro'
    });
    assert.equal(created.status, 201);
    const ended = await agent().put(`/api/focus/${created.body.id}/end`).send({ duration_sec: 120 });
    assert.equal(ended.status, 200);
  });
});
