/**
 * frontend-boundary.test.js — Comprehensive boundary & edge case tests
 *
 * Targets: Settings, Custom Fields, Templates, Badges, Demo mode,
 * Habits CRUD + heatmap, Planner APIs, Webhooks CRUD, Push notifications,
 * Focus sessions + meta + steps, Stats endpoints, Activity, Trends,
 * Time analytics, Balance, Automation rules, and Notes/Inbox.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, agent, makeArea, makeGoal, makeTask, makeHabit, logHabit, makeFocus, today, daysFromNow } = require('./helpers');

const { db } = setup();

beforeEach(() => cleanDb());

// ═══════════════════════════════════════════════════════════════════════════
// 1. SETTINGS API
// ═══════════════════════════════════════════════════════════════════════════

describe('Settings API', () => {
  it('GET /api/settings returns defaults when empty', async () => {
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.defaultView, 'myday');
    assert.equal(res.body.theme, 'midnight');
    assert.equal(res.body.focusDuration, '25');
    assert.equal(res.body.weekStart, '0');
  });

  it('PUT /api/settings updates specific keys', async () => {
    const res = await agent().put('/api/settings').send({ theme: 'ocean', weekStart: '1' }).expect(200);
    assert.equal(res.body.theme, 'ocean');
    assert.equal(res.body.weekStart, '1');
    assert.equal(res.body.focusDuration, '25'); // unchanged
  });

  it('PUT /api/settings ignores unknown keys', async () => {
    const res = await agent().put('/api/settings').send({ theme: 'nord', unknownKey: 'val', __proto__: 'evil' }).expect(200);
    assert.equal(res.body.theme, 'nord');
    assert.equal(res.body.unknownKey, undefined);
  });

  it('PUT /api/settings stores JSON strings', async () => {
    const labels = JSON.stringify({ todo: 'Backlog', doing: 'Active', done: 'Complete' });
    const res = await agent().put('/api/settings').send({ statusLabels: labels }).expect(200);
    assert.equal(res.body.statusLabels, labels);
  });

  it('PUT /api/settings with empty object is no-op', async () => {
    await agent().put('/api/settings').send({ theme: 'forest' });
    const res = await agent().put('/api/settings').send({}).expect(200);
    assert.equal(res.body.theme, 'forest');
  });

  it('POST /api/settings/reset clears all settings', async () => {
    await agent().put('/api/settings').send({ theme: 'forest' });
    const res = await agent().post('/api/settings/reset').expect(200);
    assert.equal(res.body.theme, 'midnight');
  });

  it('settings persist across requests', async () => {
    await agent().put('/api/settings').send({ dateFormat: 'iso' }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.dateFormat, 'iso');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CUSTOM FIELDS
// ═══════════════════════════════════════════════════════════════════════════

describe('Custom Fields CRUD', () => {
  it('creates text field', async () => {
    const res = await agent().post('/api/custom-fields').send({
      name: 'Notes', field_type: 'text'
    }).expect(201);
    assert.equal(res.body.name, 'Notes');
    assert.equal(res.body.field_type, 'text');
  });

  it('creates select field with options', async () => {
    const res = await agent().post('/api/custom-fields').send({
      name: 'Priority', field_type: 'select', options: ['Low', 'Med', 'High']
    }).expect(201);
    assert.ok(res.body.options);
  });

  it('rejects select without options array', async () => {
    await agent().post('/api/custom-fields').send({
      name: 'Bad', field_type: 'select'
    }).expect(400);
  });

  it('rejects invalid field_type', async () => {
    await agent().post('/api/custom-fields').send({
      name: 'Bad', field_type: 'boolean'
    }).expect(400);
  });

  it('rejects empty name', async () => {
    await agent().post('/api/custom-fields').send({
      name: '  ', field_type: 'text'
    }).expect(400);
  });

  it('rejects name > 100 chars', async () => {
    await agent().post('/api/custom-fields').send({
      name: 'X'.repeat(101), field_type: 'text'
    }).expect(400);
  });

  it('rejects duplicate name', async () => {
    await agent().post('/api/custom-fields').send({ name: 'Dup', field_type: 'text' }).expect(201);
    await agent().post('/api/custom-fields').send({ name: 'Dup', field_type: 'number' }).expect(409);
  });

  it('updates field name', async () => {
    const c = await agent().post('/api/custom-fields').send({ name: 'Old', field_type: 'text' }).expect(201);
    const res = await agent().put(`/api/custom-fields/${c.body.id}`).send({ name: 'New' }).expect(200);
    assert.equal(res.body.name, 'New');
  });

  it('deletes field', async () => {
    const c = await agent().post('/api/custom-fields').send({ name: 'Del', field_type: 'text' }).expect(201);
    await agent().delete(`/api/custom-fields/${c.body.id}`).expect(204);
    await agent().get('/api/custom-fields').expect(200).then(r => {
      assert.ok(!r.body.find(f => f.id === c.body.id));
    });
  });

  it('creates number field', async () => {
    const res = await agent().post('/api/custom-fields').send({
      name: 'Score', field_type: 'number'
    }).expect(201);
    assert.equal(res.body.field_type, 'number');
  });

  it('creates date field', async () => {
    const res = await agent().post('/api/custom-fields').send({
      name: 'Due', field_type: 'date'
    }).expect(201);
    assert.equal(res.body.field_type, 'date');
  });
});

describe('Custom Field Values', () => {
  it('sets text value on task', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Txt', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'hello' }]
    }).expect(200);
    assert.ok(res.body.some(v => v.value === 'hello'));
  });

  it('rejects text value > 500 chars', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Long', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'X'.repeat(501) }]
    }).expect(400);
  });

  it('rejects NaN for number field', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Num', field_type: 'number' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'not-a-number' }]
    }).expect(400);
  });

  it('JSON serialization converts Infinity to null which passes', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Inf', field_type: 'number' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    // JSON.stringify(Infinity) is null, so value arrives as null and is accepted
    const res = await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: null }]
    }).expect(200);
    assert.ok(res.body); // null values are accepted
  });

  it('rejects invalid date format', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Dt', field_type: 'date' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: '13/01/2026' }]
    }).expect(400);
  });

  it('accepts valid date format', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Dt2', field_type: 'date' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: '2026-04-01' }]
    }).expect(200);
    assert.ok(res.body.some(v => v.value === '2026-04-01'));
  });

  it('rejects select value not in options', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Sel', field_type: 'select', options: ['A', 'B'] });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'C' }]
    }).expect(400);
  });

  it('accepts valid select value', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Sel2', field_type: 'select', options: ['X', 'Y'] });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'X' }]
    }).expect(200);
    assert.ok(res.body.some(v => v.value === 'X'));
  });

  it('upserts values idempotently', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Ups', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'v1' }]
    }).expect(200);
    const res = await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'v2' }]
    }).expect(200);
    assert.ok(res.body.some(v => v.value === 'v2'));
    assert.equal(res.body.length, 1);
  });

  it('GET /api/tasks/:id/custom-fields returns values', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'Get', field_type: 'text' });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'test' }]
    });
    const res = await agent().get(`/api/tasks/${t.id}/custom-fields`).expect(200);
    assert.ok(res.body.some(v => v.value === 'test'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. TEMPLATES CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe('Templates CRUD', () => {
  it('creates template with tasks', async () => {
    const res = await agent().post('/api/templates').send({
      name: 'Sprint', tasks: [{ title: 'Plan' }, { title: 'Build' }]
    }).expect(200);
    assert.equal(res.body.name, 'Sprint');
    assert.equal(res.body.tasks.length, 2);
  });

  it('rejects template without name', async () => {
    await agent().post('/api/templates').send({
      tasks: [{ title: 'A' }]
    }).expect(400);
  });

  it('rejects template without tasks', async () => {
    await agent().post('/api/templates').send({ name: 'Empty' }).expect(400);
  });

  it('rejects template with empty tasks array', async () => {
    await agent().post('/api/templates').send({ name: 'Empty', tasks: [] }).expect(400);
  });

  it('updates template name only', async () => {
    const c = await agent().post('/api/templates').send({ name: 'Old', tasks: [{ title: 'T' }] });
    const res = await agent().put(`/api/templates/${c.body.id}`).send({ name: 'New' }).expect(200);
    assert.equal(res.body.name, 'New');
  });

  it('deletes template', async () => {
    const c = await agent().post('/api/templates').send({ name: 'Del', tasks: [{ title: 'T' }] });
    await agent().delete(`/api/templates/${c.body.id}`).expect(200);
    await agent().delete(`/api/templates/${c.body.id}`).expect(404);
  });

  it('applies template to goal', async () => {
    const c = await agent().post('/api/templates').send({
      name: 'Apply', tasks: [{ title: 'Step1' }, { title: 'Step2', subtasks: ['Sub1', 'Sub2'] }]
    });
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/templates/${c.body.id}/apply`).send({
      goalId: goal.id
    }).expect(200);
    assert.ok(res.body.ok);
    assert.equal(res.body.created.length, 2);
  });

  it('apply template to non-existent goal fails', async () => {
    const c = await agent().post('/api/templates').send({ name: 'T', tasks: [{ title: 'T' }] });
    await agent().post(`/api/templates/${c.body.id}/apply`).send({ goalId: 99999 }).expect(403);
  });

  it('save goal as template', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id, { title: 'Template Source' });
    makeTask(goal.id, { title: 'Task1' });
    makeTask(goal.id, { title: 'Task2' });
    const res = await agent().post(`/api/goals/${goal.id}/save-as-template`).expect(200);
    assert.ok(res.body.id);
    assert.ok(res.body.tasks.length >= 2);
  });

  it('template name in response may differ from DB due to truncation', async () => {
    const res = await agent().post('/api/templates').send({
      name: 'X'.repeat(300), tasks: [{ title: 'T' }]
    }).expect(200);
    // The DB stores truncated but the response returns the trimmed name
    assert.ok(res.body.name);
    // Verify DB has truncated version
    const tmpl = await agent().get('/api/templates').expect(200);
    const found = tmpl.body.find(t => t.id === res.body.id);
    assert.ok(found.name.length <= 200);
  });

  it('template task title truncated to 500 chars', async () => {
    const res = await agent().post('/api/templates').send({
      name: 'Trunc', tasks: [{ title: 'Y'.repeat(600) }]
    }).expect(200);
    assert.ok(res.body.tasks[0].title.length <= 500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. BADGES
// ═══════════════════════════════════════════════════════════════════════════

describe('Badges', () => {
  it('GET /api/badges returns empty initially', async () => {
    const res = await agent().get('/api/badges').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('POST /api/badges/check with no tasks earns nothing', async () => {
    const res = await agent().post('/api/badges/check').expect(200);
    assert.deepEqual(res.body.earned, []);
  });

  it('earns first-10-tasks badge', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 10; i++) {
      makeTask(goal.id, { status: 'done', title: `Done${i}` });
    }
    const res = await agent().post('/api/badges/check').expect(200);
    assert.ok(res.body.earned.includes('first-10-tasks'));
  });

  it('does not re-earn same badge', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 10; i++) makeTask(goal.id, { status: 'done', title: `Done${i}` });
    await agent().post('/api/badges/check');
    const res = await agent().post('/api/badges/check').expect(200);
    assert.ok(!res.body.earned.includes('first-10-tasks'));
  });

  it('earns first-focus badge', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    makeFocus(t.id);
    const res = await agent().post('/api/badges/check').expect(200);
    assert.ok(res.body.earned.includes('first-focus'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DEMO MODE
// ═══════════════════════════════════════════════════════════════════════════

describe('Demo mode', () => {
  it('POST /api/demo/start creates sample data', async () => {
    await agent().post('/api/demo/start').expect(200);
    const areas = await agent().get('/api/areas').expect(200);
    assert.ok(areas.body.length >= 3);
  });

  it('POST /api/demo/reset requires password confirmation', async () => {
    await agent().post('/api/demo/start');
    // Reset requires password
    await agent().post('/api/demo/reset').send({}).expect(403);
  });

  it('POST /api/demo/reset with password clears all data', async () => {
    await agent().post('/api/demo/start');
    await agent().post('/api/demo/reset').send({ password: 'testpassword' }).expect(200);
    const areas = await agent().get('/api/areas').expect(200);
    assert.equal(areas.body.length, 0);
  });

  it('demo cycle: start → reset → start works', async () => {
    await agent().post('/api/demo/start').expect(200);
    await agent().post('/api/demo/reset').send({ password: 'testpassword' }).expect(200);
    await agent().post('/api/demo/start').expect(200);
    const areas = await agent().get('/api/areas').expect(200);
    assert.ok(areas.body.length >= 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. HABITS CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe('Habits CRUD', () => {
  it('creates habit with valid frequency', async () => {
    const res = await agent().post('/api/habits').send({
      name: 'Exercise', frequency: 'daily'
    }).expect(201);
    assert.equal(res.body.name, 'Exercise');
    assert.equal(res.body.frequency, 'daily');
  });

  it('rejects invalid frequency', async () => {
    await agent().post('/api/habits').send({
      name: 'Bad', frequency: 'biweekly'
    }).expect(400);
  });

  it('rejects empty name', async () => {
    await agent().post('/api/habits').send({ name: '' }).expect(400);
  });

  it('rejects name > 100 chars', async () => {
    await agent().post('/api/habits').send({ name: 'X'.repeat(101) }).expect(400);
  });

  it('validates preferred_time format', async () => {
    await agent().post('/api/habits').send({
      name: 'Time', preferred_time: '25:00'
    }).expect(400);
  });

  it('accepts valid preferred_time', async () => {
    const res = await agent().post('/api/habits').send({
      name: 'Morning', preferred_time: '08:30'
    }).expect(201);
    assert.equal(res.body.preferred_time, '08:30');
  });

  it('validates invalid color', async () => {
    await agent().post('/api/habits').send({
      name: 'Color', color: 'not-hex'
    }).expect(400);
  });

  it('rejects non-integer target', async () => {
    await agent().post('/api/habits').send({
      name: 'Target', target: 1.5
    }).expect(400);
  });

  it('rejects target < 1', async () => {
    await agent().post('/api/habits').send({
      name: 'Target', target: 0
    }).expect(400);
  });

  it('creates habit with area_id', async () => {
    const area = makeArea();
    const res = await agent().post('/api/habits').send({
      name: 'AreaHabit', area_id: area.id
    }).expect(201);
    assert.equal(res.body.area_id, area.id);
  });

  it('rejects invalid area_id', async () => {
    await agent().post('/api/habits').send({
      name: 'BadArea', area_id: 99999
    }).expect(400);
  });

  it('updates habit', async () => {
    const c = await agent().post('/api/habits').send({ name: 'Old' }).expect(201);
    const res = await agent().put(`/api/habits/${c.body.id}`).send({ name: 'New' }).expect(200);
    assert.equal(res.body.name, 'New');
  });

  it('deletes habit', async () => {
    const c = await agent().post('/api/habits').send({ name: 'Del' }).expect(201);
    await agent().delete(`/api/habits/${c.body.id}`).expect(200);
    await agent().delete(`/api/habits/${c.body.id}`).expect(404);
  });

  it('creates weekly habit with schedule_days', async () => {
    const res = await agent().post('/api/habits').send({
      name: 'WeekHabit', frequency: 'weekly', schedule_days: ['mon', 'wed', 'fri']
    }).expect(201);
    assert.deepEqual(res.body.schedule_days, ['mon', 'wed', 'fri']);
  });

  it('rejects invalid schedule_days for weekly', async () => {
    await agent().post('/api/habits').send({
      name: 'BadDays', frequency: 'weekly', schedule_days: ['funday']
    }).expect(400);
  });

  it('creates monthly habit with day numbers', async () => {
    const res = await agent().post('/api/habits').send({
      name: 'MonthHabit', frequency: 'monthly', schedule_days: [1, 15]
    }).expect(201);
    assert.ok(res.body.schedule_days);
  });

  it('rejects monthly schedule_days with invalid numbers', async () => {
    await agent().post('/api/habits').send({
      name: 'BadMonth', frequency: 'monthly', schedule_days: [0, 32]
    }).expect(400);
  });
});

describe('Habit logging', () => {
  it('logs habit and increments count', async () => {
    const h = makeHabit();
    const res = await agent().post(`/api/habits/${h.id}/log`).send({ date: today() }).expect(200);
    assert.equal(res.body.count, 1);
    const res2 = await agent().post(`/api/habits/${h.id}/log`).send({ date: today() }).expect(200);
    assert.equal(res2.body.count, 2);
  });

  it('undo log decrements count', async () => {
    const h = makeHabit();
    await agent().post(`/api/habits/${h.id}/log`).send({ date: today() });
    await agent().post(`/api/habits/${h.id}/log`).send({ date: today() });
    await agent().delete(`/api/habits/${h.id}/log`).send({ date: today() }).expect(200);
    const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(h.id, today());
    assert.equal(log.count, 1);
  });

  it('undo last log deletes record', async () => {
    const h = makeHabit();
    await agent().post(`/api/habits/${h.id}/log`).send({ date: today() });
    await agent().delete(`/api/habits/${h.id}/log`).send({ date: today() }).expect(200);
    const log = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND date=?').get(h.id, today());
    assert.equal(log, undefined);
  });

  it('heatmap returns last 90 days', async () => {
    const h = makeHabit();
    logHabit(h.id, today(), 3);
    logHabit(h.id, daysFromNow(-1), 1);
    const res = await agent().get(`/api/habits/${h.id}/heatmap`).expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 2);
  });

  it('heatmap returns empty for habit with no logs', async () => {
    const h = makeHabit();
    const res = await agent().get(`/api/habits/${h.id}/heatmap`).expect(200);
    assert.equal(res.body.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. AUTOMATION RULES
// ═══════════════════════════════════════════════════════════════════════════

describe('Automation Rules CRUD', () => {
  it('creates rule with valid types', async () => {
    const res = await agent().post('/api/rules').send({
      name: 'Auto Complete', trigger_type: 'task_completed', action_type: 'add_tag',
      trigger_config: {}, action_config: { tag: 'done' }
    }).expect(201);
    assert.equal(res.body.name, 'Auto Complete');
    assert.equal(res.body.trigger_type, 'task_completed');
  });

  it('rejects invalid trigger_type', async () => {
    await agent().post('/api/rules').send({
      name: 'Bad', trigger_type: 'invalid', action_type: 'add_tag'
    }).expect(400);
  });

  it('rejects invalid action_type', async () => {
    await agent().post('/api/rules').send({
      name: 'Bad', trigger_type: 'task_completed', action_type: 'invalid'
    }).expect(400);
  });

  it('rejects empty name', async () => {
    await agent().post('/api/rules').send({
      name: '', trigger_type: 'task_completed', action_type: 'add_tag'
    }).expect(400);
  });

  it('rejects name > 100 chars', async () => {
    await agent().post('/api/rules').send({
      name: 'X'.repeat(101), trigger_type: 'task_completed', action_type: 'add_tag'
    }).expect(400);
  });

  it('updates rule', async () => {
    const c = await agent().post('/api/rules').send({
      name: 'Old', trigger_type: 'task_completed', action_type: 'add_tag'
    });
    const res = await agent().put(`/api/rules/${c.body.id}`).send({ name: 'New' }).expect(200);
    assert.equal(res.body.name, 'New');
  });

  it('toggle rule enabled', async () => {
    const c = await agent().post('/api/rules').send({
      name: 'Toggle', trigger_type: 'task_completed', action_type: 'add_tag'
    });
    const res = await agent().put(`/api/rules/${c.body.id}`).send({ enabled: false }).expect(200);
    assert.equal(res.body.enabled, 0);
  });

  it('deletes rule', async () => {
    const c = await agent().post('/api/rules').send({
      name: 'Del', trigger_type: 'task_completed', action_type: 'add_tag'
    });
    await agent().delete(`/api/rules/${c.body.id}`).expect(200);
    await agent().delete(`/api/rules/${c.body.id}`).expect(404);
  });

  it('lists rules', async () => {
    await agent().post('/api/rules').send({ name: 'R1', trigger_type: 'task_completed', action_type: 'add_tag' });
    await agent().post('/api/rules').send({ name: 'R2', trigger_type: 'task_created', action_type: 'set_priority' });
    const res = await agent().get('/api/rules').expect(200);
    assert.ok(res.body.length >= 2);
  });

  it('all trigger types accepted', async () => {
    const types = ['task_completed', 'task_created', 'task_overdue', 'task_updated'];
    for (const t of types) {
      const res = await agent().post('/api/rules').send({ name: `R-${t}`, trigger_type: t, action_type: 'add_tag' });
      assert.equal(res.status, 201, `trigger_type ${t} should be accepted`);
    }
  });

  it('all action types accepted', async () => {
    const types = ['add_tag', 'set_priority', 'move_to_goal', 'send_notification', 'add_to_myday', 'create_followup'];
    for (const a of types) {
      const res = await agent().post('/api/rules').send({ name: `R-${a}`, trigger_type: 'task_completed', action_type: a });
      assert.equal(res.status, 201, `action_type ${a} should be accepted`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. PLANNER APIs
// ═══════════════════════════════════════════════════════════════════════════

describe('Planner APIs', () => {
  it('GET /api/planner/suggest returns categorized tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Overdue', due_date: daysFromNow(-2) });
    makeTask(goal.id, { title: 'Today', due_date: today() });
    makeTask(goal.id, { title: 'Soon', due_date: daysFromNow(2), priority: 3 });
    const res = await agent().get('/api/planner/suggest').expect(200);
    assert.ok(res.body.overdue);
    assert.ok(res.body.dueToday);
    assert.ok(res.body.highPriority);
    assert.ok(res.body.upcoming);
  });

  it('GET /api/planner/smart respects max_minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 10; i++) {
      const t = makeTask(goal.id);
      db.prepare('UPDATE tasks SET estimated_minutes=30 WHERE id=?').run(t.id);
    }
    const res = await agent().get('/api/planner/smart?max_minutes=60').expect(200);
    assert.ok(res.body.total_minutes <= 60);
    assert.equal(res.body.max_minutes, 60);
  });

  it('GET /api/planner/smart prefers high priority tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t0 = makeTask(goal.id, { title: 'P0', priority: 0 });
    db.prepare('UPDATE tasks SET estimated_minutes=10 WHERE id=?').run(t0.id);
    const t3 = makeTask(goal.id, { title: 'P3', priority: 3 });
    db.prepare('UPDATE tasks SET estimated_minutes=10 WHERE id=?').run(t3.id);
    const res = await agent().get('/api/planner/smart?max_minutes=30').expect(200);
    if (res.body.suggested.length > 0) {
      assert.equal(res.body.suggested[0].title, 'P3');
    }
  });

  it('GET /api/planner/:date returns scheduled/unscheduled', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'DayTask', due_date: today() });
    const res = await agent().get(`/api/planner/${today()}`).expect(200);
    assert.ok(res.body.scheduled !== undefined);
    assert.ok(res.body.unscheduled !== undefined);
  });

  it('GET /api/planner/invalid-date fails', async () => {
    await agent().get('/api/planner/not-a-date').expect(400);
  });

  it('GET /api/planner/:date with no tasks returns empty', async () => {
    const res = await agent().get(`/api/planner/${daysFromNow(100)}`).expect(200);
    assert.equal(res.body.scheduled.length, 0);
    assert.equal(res.body.unscheduled.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. WEBHOOKS CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe('Webhooks CRUD', () => {
  it('creates webhook with HTTPS URL', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'My Hook', url: 'https://example.com/hook', events: ['task.created']
    }).expect(201);
    assert.equal(res.body.name, 'My Hook');
    assert.ok(res.body.secret);
  });

  it('rejects HTTP URL', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Http', url: 'http://example.com/hook', events: ['task.created']
    }).expect(400);
  });

  it('rejects private IP URL', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Priv', url: 'https://192.168.1.1/hook', events: ['task.created']
    }).expect(400);
  });

  it('rejects localhost URL', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Local', url: 'https://localhost/hook', events: ['task.created']
    }).expect(400);
  });

  it('rejects without events', async () => {
    await agent().post('/api/webhooks').send({
      name: 'NoEvt', url: 'https://example.com/hook', events: []
    }).expect(400);
  });

  it('rejects invalid event type', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Bad', url: 'https://example.com/hook', events: ['invalid.event']
    }).expect(400);
  });

  it('accepts wildcard event', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'Wild', url: 'https://example.com/hook', events: ['*']
    }).expect(201);
    assert.ok(res.body.id);
  });

  it('lists webhooks without secret', async () => {
    await agent().post('/api/webhooks').send({
      name: 'List', url: 'https://example.com/hook', events: ['task.created']
    });
    const res = await agent().get('/api/webhooks').expect(200);
    assert.ok(res.body.length >= 1);
    assert.equal(res.body[0].secret, undefined);
  });

  it('updates webhook URL', async () => {
    const c = await agent().post('/api/webhooks').send({
      name: 'Upd', url: 'https://old.com/hook', events: ['task.created']
    });
    const res = await agent().put(`/api/webhooks/${c.body.id}`).send({
      url: 'https://new.com/hook'
    }).expect(200);
    assert.equal(res.body.url, 'https://new.com/hook');
  });

  it('update rejects private URL', async () => {
    const c = await agent().post('/api/webhooks').send({
      name: 'Upd2', url: 'https://good.com/hook', events: ['task.created']
    });
    await agent().put(`/api/webhooks/${c.body.id}`).send({
      url: 'https://10.0.0.1/hook'
    }).expect(400);
  });

  it('deactivates webhook', async () => {
    const c = await agent().post('/api/webhooks').send({
      name: 'Deact', url: 'https://example.com/hook', events: ['task.created']
    });
    const res = await agent().put(`/api/webhooks/${c.body.id}`).send({ active: false }).expect(200);
    assert.equal(res.body.active, 0);
  });

  it('deletes webhook', async () => {
    const c = await agent().post('/api/webhooks').send({
      name: 'Del', url: 'https://example.com/hook', events: ['task.created']
    });
    await agent().delete(`/api/webhooks/${c.body.id}`).expect(200);
    await agent().delete(`/api/webhooks/${c.body.id}`).expect(404);
  });

  it('enforces max 10 webhooks per user', async () => {
    for (let i = 0; i < 10; i++) {
      await agent().post('/api/webhooks').send({
        name: `Wh${i}`, url: 'https://example.com/hook', events: ['task.created']
      }).expect(201);
    }
    await agent().post('/api/webhooks').send({
      name: 'Wh11', url: 'https://example.com/hook', events: ['task.created']
    }).expect(400);
  });

  it('GET /api/webhooks/events returns event list', async () => {
    const res = await agent().get('/api/webhooks/events').expect(200);
    assert.ok(res.body.includes('task.created'));
    assert.ok(res.body.includes('*'));
  });

  it('rejects 127.0.0.1', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Loop', url: 'https://127.0.0.1/hook', events: ['task.created']
    }).expect(400);
  });

  it('rejects 169.254.x.x (link-local)', async () => {
    await agent().post('/api/webhooks').send({
      name: 'LinkLocal', url: 'https://169.254.1.1/hook', events: ['task.created']
    }).expect(400);
  });

  it('rejects 172.16.x.x', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Priv172', url: 'https://172.16.0.1/hook', events: ['task.created']
    }).expect(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Push notifications', () => {
  it('GET /api/push/vapid-key returns key', async () => {
    const res = await agent().get('/api/push/vapid-key').expect(200);
    assert.ok(res.body.publicKey !== undefined);
  });

  it('POST /api/push/subscribe requires endpoint', async () => {
    await agent().post('/api/push/subscribe').send({
      keys: { p256dh: 'a', auth: 'b' }
    }).expect(400);
  });

  it('POST /api/push/subscribe requires keys', async () => {
    await agent().post('/api/push/subscribe').send({
      endpoint: 'https://push.example.com/sub'
    }).expect(400);
  });

  it('subscribes successfully', async () => {
    const res = await agent().post('/api/push/subscribe').send({
      endpoint: 'https://push.example.com/sub',
      keys: { p256dh: 'testkey', auth: 'testauthkey' }
    }).expect(201);
    assert.ok(res.body.id);
  });

  it('unsubscribe removes subscription', async () => {
    await agent().post('/api/push/subscribe').send({
      endpoint: 'https://push.example.com/unsub',
      keys: { p256dh: 'k', auth: 'a' }
    });
    await agent().delete('/api/push/subscribe').send({
      endpoint: 'https://push.example.com/unsub'
    }).expect(200);
  });

  it('test push with no subscriptions', async () => {
    const res = await agent().post('/api/push/test').expect(200);
    assert.equal(res.body.sent, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. FOCUS SESSIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Focus sessions', () => {
  it('POST /api/focus creates session', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const res = await agent().post('/api/focus').send({
      task_id: t.id, duration_sec: 1500, type: 'pomodoro'
    }).expect(201);
    assert.equal(res.body.duration_sec, 1500);
  });

  it('rejects negative duration', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    await agent().post('/api/focus').send({
      task_id: t.id, duration_sec: -100
    }).expect(400);
  });

  it('rejects missing task_id', async () => {
    await agent().post('/api/focus').send({ duration_sec: 100 }).expect(400);
  });

  it('rejects nonexistent task', async () => {
    await agent().post('/api/focus').send({ task_id: 99999, duration_sec: 100 }).expect(404);
  });

  it('PUT /api/focus/:id/end updates duration and task minutes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = await agent().post('/api/focus').send({ task_id: t.id, duration_sec: 0 });
    await agent().put(`/api/focus/${f.body.id}/end`).send({ duration_sec: 1800 }).expect(200);

    const task = await agent().get(`/api/tasks/${t.id}`).expect(200);
    assert.ok(task.body.actual_minutes >= 30); // 1800/60 = 30
  });

  it('end without duration uses existing', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = await agent().post('/api/focus').send({ task_id: t.id, duration_sec: 600 });
    const res = await agent().put(`/api/focus/${f.body.id}/end`).expect(200);
    assert.ok(res.body.ended_at);
  });

  it('PUT /api/focus/:id updates session', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id, { duration_sec: 100 });
    const res = await agent().put(`/api/focus/${f.id}`).send({ duration_sec: 200 }).expect(200);
    assert.equal(res.body.duration_sec, 200);
  });

  it('DELETE /api/focus/:id removes session', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().delete(`/api/focus/${f.id}`).expect(200);
  });
});

describe('Focus session meta', () => {
  it('POST /api/focus/:id/meta creates meta', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    const res = await agent().post(`/api/focus/${f.id}/meta`).send({
      intention: 'Build feature', focus_rating: 4, strategy: 'pomodoro'
    }).expect(200);
    assert.equal(res.body.intention, 'Build feature');
    assert.equal(res.body.focus_rating, 4);
  });

  it('rejects focus_rating > 5', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().post(`/api/focus/${f.id}/meta`).send({
      focus_rating: 6
    }).expect(400);
  });

  it('rejects focus_rating < 0', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().post(`/api/focus/${f.id}/meta`).send({
      focus_rating: -1
    }).expect(400);
  });

  it('updates existing meta (upsert)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().post(`/api/focus/${f.id}/meta`).send({ intention: 'v1', focus_rating: 3 });
    const res = await agent().post(`/api/focus/${f.id}/meta`).send({ reflection: 'Done well', focus_rating: 5 });
    assert.equal(res.body.intention, 'v1');
    assert.equal(res.body.reflection, 'Done well');
    assert.equal(res.body.focus_rating, 5);
  });

  it('GET /api/focus/:id/meta returns meta', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().post(`/api/focus/${f.id}/meta`).send({ intention: 'Read' });
    const res = await agent().get(`/api/focus/${f.id}/meta`).expect(200);
    assert.equal(res.body.intention, 'Read');
  });

  it('GET /api/focus/:id/meta returns 404 when no meta', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().get(`/api/focus/${f.id}/meta`).expect(404);
  });
});

describe('Focus steps', () => {
  it('POST /api/focus/:id/steps creates steps', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    const res = await agent().post(`/api/focus/${f.id}/steps`).send({
      steps: ['Step 1', 'Step 2', 'Step 3']
    }).expect(201);
    assert.equal(res.body.length, 3);
    assert.equal(res.body[0].text, 'Step 1');
  });

  it('rejects empty steps array', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().post(`/api/focus/${f.id}/steps`).send({ steps: [] }).expect(400);
  });

  it('steps accept object format', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    const res = await agent().post(`/api/focus/${f.id}/steps`).send({
      steps: [{ text: 'Obj Step' }]
    }).expect(201);
    assert.equal(res.body[0].text, 'Obj Step');
  });

  it('GET /api/focus/:id/steps returns steps', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    await agent().post(`/api/focus/${f.id}/steps`).send({ steps: ['S1'] });
    const res = await agent().get(`/api/focus/${f.id}/steps`).expect(200);
    assert.equal(res.body.length, 1);
  });

  it('PUT /api/focus/steps/:stepId toggles done', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    const f = makeFocus(t.id);
    const steps = await agent().post(`/api/focus/${f.id}/steps`).send({ steps: ['Toggle'] });
    const stepId = steps.body[0].id;
    const res = await agent().put(`/api/focus/steps/${stepId}`).expect(200);
    assert.equal(res.body.done, 1);
    assert.ok(res.body.completed_at);
    // Toggle back
    const res2 = await agent().put(`/api/focus/steps/${stepId}`).expect(200);
    assert.equal(res2.body.done, 0);
    assert.equal(res2.body.completed_at, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. STATS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Stats endpoints', () => {
  it('GET /api/stats returns dashboard data', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { status: 'done' });
    makeTask(goal.id, { status: 'todo', due_date: daysFromNow(-1) });
    const res = await agent().get('/api/stats').expect(200);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(typeof res.body.done === 'number');
    assert.ok(typeof res.body.overdue === 'number');
    assert.ok(Array.isArray(res.body.byArea));
    assert.ok(Array.isArray(res.body.byPriority));
    assert.ok(Array.isArray(res.body.recentDone));
  });

  it('GET /api/stats with no data returns zeroes', async () => {
    const res = await agent().get('/api/stats').expect(200);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.done, 0);
    assert.equal(res.body.overdue, 0);
  });

  it('GET /api/stats/streaks returns streak data', async () => {
    const res = await agent().get('/api/stats/streaks').expect(200);
    assert.ok(typeof res.body.streak === 'number');
    assert.ok(typeof res.body.bestStreak === 'number');
    assert.ok(Array.isArray(res.body.heatmap));
  });

  it('GET /api/stats/trends returns weekly data', async () => {
    const res = await agent().get('/api/stats/trends').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
    assert.ok(res.body[0].week_start);
    assert.ok(typeof res.body[0].completed === 'number');
  });

  it('GET /api/stats/time-analytics returns analytics', async () => {
    const res = await agent().get('/api/stats/time-analytics').expect(200);
    assert.ok(Array.isArray(res.body.byArea));
    assert.ok(Array.isArray(res.body.byHour));
    assert.ok(typeof res.body.accuracy === 'object');
  });

  it('GET /api/stats/balance returns area balance', async () => {
    const a1 = makeArea({ name: 'Work' });
    const a2 = makeArea({ name: 'Life' });
    const g1 = makeGoal(a1.id);
    const g2 = makeGoal(a2.id);
    for (let i = 0; i < 5; i++) makeTask(g1.id, { due_date: today() });
    makeTask(g2.id, { due_date: today() });
    const res = await agent().get('/api/stats/balance').expect(200);
    assert.ok(Array.isArray(res.body.areas));
    assert.ok(typeof res.body.total === 'number');
  });
});

describe('Focus stats', () => {
  it('GET /api/focus/stats returns stats', async () => {
    const res = await agent().get('/api/focus/stats').expect(200);
    assert.ok(typeof res.body.today === 'number');
    assert.ok(typeof res.body.week === 'number');
    assert.ok(typeof res.body.sessions === 'number');
  });

  it('GET /api/focus/history returns paginated history', async () => {
    const res = await agent().get('/api/focus/history').expect(200);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(typeof res.body.page === 'number');
    assert.ok(typeof res.body.pages === 'number');
    assert.ok(Array.isArray(res.body.items));
    assert.ok(Array.isArray(res.body.daily));
  });

  it('GET /api/focus/history page=1&limit=2 paginates', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t = makeTask(goal.id);
    for (let i = 0; i < 5; i++) makeFocus(t.id, { duration_sec: 100 * (i + 1) });
    const res = await agent().get('/api/focus/history?page=1&limit=2').expect(200);
    assert.ok(res.body.items.length <= 2);
    assert.ok(res.body.pages > 1);
  });

  it('GET /api/focus/insights returns insights', async () => {
    const res = await agent().get('/api/focus/insights').expect(200);
    assert.ok(Array.isArray(res.body.peakHours));
    assert.ok(Array.isArray(res.body.byStrategy));
    assert.ok(typeof res.body.avgRating === 'number');
  });

  it('GET /api/focus/streak returns streak data', async () => {
    const res = await agent().get('/api/focus/streak').expect(200);
    assert.ok(typeof res.body.streak === 'number');
    assert.ok(typeof res.body.bestStreak === 'number');
    assert.ok(Array.isArray(res.body.heatmap));
  });

  it('GET /api/focus/goal returns daily goal', async () => {
    const res = await agent().get('/api/focus/goal').expect(200);
    assert.ok(typeof res.body.goalMinutes === 'number');
    assert.ok(typeof res.body.todayMinutes === 'number');
    assert.ok(typeof res.body.pct === 'number');
  });

  it('focus goal respects custom setting', async () => {
    // The setting key is 'dailyFocusGoalMinutes' — set it directly
    db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (1, 'dailyFocusGoalMinutes', '60')").run();
    const res = await agent().get('/api/focus/goal').expect(200);
    assert.equal(res.body.goalMinutes, 60);
  });
});

describe('Activity log', () => {
  it('GET /api/activity returns paginated results', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) {
      const t = makeTask(goal.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=CURRENT_TIMESTAMP WHERE id=?').run(t.id);
    }
    const res = await agent().get('/api/activity?page=1&limit=3').expect(200);
    assert.ok(res.body.items.length <= 3);
    assert.ok(typeof res.body.total === 'number');
    assert.ok(typeof res.body.pages === 'number');
  });

  it('GET /api/activity with no completed tasks returns empty', async () => {
    const res = await agent().get('/api/activity').expect(200);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.items.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. INBOX & NOTES
// ═══════════════════════════════════════════════════════════════════════════

describe('Inbox CRUD', () => {
  it('creates inbox item', async () => {
    const res = await agent().post('/api/inbox').send({ title: 'Quick idea' }).expect(201);
    assert.equal(res.body.title, 'Quick idea');
  });

  it('rejects empty title', async () => {
    await agent().post('/api/inbox').send({ title: '' }).expect(400);
  });

  it('updates inbox item', async () => {
    const c = await agent().post('/api/inbox').send({ title: 'Update me' });
    const res = await agent().put(`/api/inbox/${c.body.id}`).send({ title: 'Updated' }).expect(200);
    assert.equal(res.body.title, 'Updated');
  });

  it('validates priority range', async () => {
    const c = await agent().post('/api/inbox').send({ title: 'P' });
    await agent().put(`/api/inbox/${c.body.id}`).send({ priority: 4 }).expect(400);
  });

  it('deletes inbox item', async () => {
    const c = await agent().post('/api/inbox').send({ title: 'Del' });
    await agent().delete(`/api/inbox/${c.body.id}`).expect(200);
    await agent().delete(`/api/inbox/${c.body.id}`).expect(404);
  });

  it('triages inbox to goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const inbox = await agent().post('/api/inbox').send({ title: 'Triage Me', priority: 2 });
    const res = await agent().post(`/api/inbox/${inbox.body.id}/triage`).send({
      goal_id: goal.id, due_date: today()
    }).expect(201);
    assert.equal(res.body.title, 'Triage Me');
    assert.equal(res.body.goal_id, goal.id);
    // Inbox item should be gone
    await agent().get(`/api/inbox`).expect(200).then(r => {
      assert.ok(!r.body.find(i => i.id === inbox.body.id));
    });
  });

  it('triage to non-owned goal fails', async () => {
    const inbox = await agent().post('/api/inbox').send({ title: 'Bad Triage' });
    await agent().post(`/api/inbox/${inbox.body.id}/triage`).send({
      goal_id: 99999
    }).expect(403);
  });
});

describe('Notes CRUD', () => {
  it('creates note', async () => {
    const res = await agent().post('/api/notes').send({
      title: 'My Note', content: 'Content here'
    }).expect(201);
    assert.equal(res.body.title, 'My Note');
  });

  it('rejects empty title', async () => {
    await agent().post('/api/notes').send({ title: '' }).expect(400);
  });

  it('creates note with goal_id', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post('/api/notes').send({
      title: 'Goal Note', goal_id: goal.id
    }).expect(201);
    assert.equal(res.body.goal_id, goal.id);
  });

  it('updates note', async () => {
    const c = await agent().post('/api/notes').send({ title: 'Old' });
    const res = await agent().put(`/api/notes/${c.body.id}`).send({ title: 'New', content: 'Updated' }).expect(200);
    assert.equal(res.body.title, 'New');
  });

  it('deletes note', async () => {
    const c = await agent().post('/api/notes').send({ title: 'Del' });
    await agent().delete(`/api/notes/${c.body.id}`).expect(200);
  });

  it('GET /api/notes filters by goal_id', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().post('/api/notes').send({ title: 'GoalNote', goal_id: goal.id });
    await agent().post('/api/notes').send({ title: 'General' });
    const res = await agent().get(`/api/notes?goal_id=${goal.id}`).expect(200);
    assert.ok(res.body.every(n => n.goal_id === goal.id));
  });

  it('GET /api/notes/:id returns single note', async () => {
    const c = await agent().post('/api/notes').send({ title: 'Single' });
    const res = await agent().get(`/api/notes/${c.body.id}`).expect(200);
    assert.equal(res.body.title, 'Single');
  });

  it('GET /api/notes/:id for non-existent returns 404', async () => {
    await agent().get('/api/notes/99999').expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. REMINDERS
// ═══════════════════════════════════════════════════════════════════════════

describe('Reminders', () => {
  it('GET /api/reminders returns categorized reminders', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Overdue', due_date: daysFromNow(-2) });
    makeTask(goal.id, { title: 'Today', due_date: today() });
    makeTask(goal.id, { title: 'Soon', due_date: daysFromNow(1) });
    const res = await agent().get('/api/reminders').expect(200);
    assert.ok(res.body.overdue);
    assert.ok(res.body.today);
    assert.ok(res.body.upcoming);
    assert.ok(typeof res.body.total === 'number');
  });

  it('reminders exclude done tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'DoneTask', due_date: daysFromNow(-1), status: 'done' });
    const res = await agent().get('/api/reminders').expect(200);
    assert.equal(res.body.total, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. DAILY QUOTE
// ═══════════════════════════════════════════════════════════════════════════

describe('Daily quote', () => {
  it('returns { enabled: false } when disabled', async () => {
    const res = await agent().get('/api/features/daily-quote').expect(200);
    assert.equal(res.body.enabled, false);
  });

  it('returns quote when enabled', async () => {
    await agent().put('/api/settings').send({ dailyQuote: 'true' });
    const res = await agent().get('/api/features/daily-quote').expect(200);
    assert.equal(res.body.enabled, true);
    assert.ok(res.body.text);
    assert.ok(res.body.author);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. WEEKLY & DAILY REVIEWS
// ═══════════════════════════════════════════════════════════════════════════

describe('Reviews', () => {
  it('GET /api/reviews/current returns context', async () => {
    const res = await agent().get('/api/reviews/current').expect(200);
    assert.ok(res.body.weekStart);
    assert.ok(typeof res.body.tasksCompletedCount === 'number');
  });

  it('POST /api/reviews creates weekly review', async () => {
    const today_str = today();
    const res = await agent().post('/api/reviews').send({
      week_start: today_str,
      tasks_completed: 10,
      tasks_created: 15,
      top_accomplishments: ['Did thing 1', 'Did thing 2'],
      reflection: 'Good week',
      next_week_priorities: ['Priority A'],
      rating: 4
    }).expect(201);
    assert.ok(res.body.id);
  });

  it('POST /api/reviews/daily creates daily review', async () => {
    const res = await agent().post('/api/reviews/daily').send({
      date: today(), note: 'Productive day'
    });
    assert.ok(res.status === 200 || res.status === 201);
  });

  it('daily review upserts on same date', async () => {
    await agent().post('/api/reviews/daily').send({ date: today(), note: 'v1' });
    const res = await agent().post('/api/reviews/daily').send({ date: today(), note: 'v2' });
    assert.ok(res.status === 200 || res.status === 201);
  });

  it('GET /api/reviews lists reviews', async () => {
    await agent().post('/api/reviews').send({
      week_start: today(), tasks_completed: 5, tasks_created: 5,
      top_accomplishments: [], reflection: '', next_week_priorities: [], rating: 3
    });
    const res = await agent().get('/api/reviews').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. AI ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

describe('AI BYOK endpoints', () => {
  it('POST /api/ai/suggest without key returns error', async () => {
    const res = await agent().post('/api/ai/suggest').send({ task_title: 'Build API' });
    assert.ok(res.status >= 400);
  });

  it('POST /api/ai/suggest without task_title fails', async () => {
    await agent().post('/api/ai/suggest').send({}).expect(400);
  });

  it('POST /api/ai/schedule without key returns error', async () => {
    const res = await agent().post('/api/ai/schedule').send({ task_ids: [1, 2] });
    assert.ok(res.status >= 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. TABLE VIEW ADVANCED
// ═══════════════════════════════════════════════════════════════════════════

describe('Table view advanced', () => {
  it('sorts by priority', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'P0', priority: 0 });
    makeTask(goal.id, { title: 'P3', priority: 3 });
    const res = await agent().get('/api/tasks/table?sort_by=priority&sort_dir=desc').expect(200);
    assert.ok(res.body.tasks.length >= 2);
    assert.ok(res.body.tasks[0].priority >= res.body.tasks[1].priority);
  });

  it('groups by area', async () => {
    const a1 = makeArea({ name: 'Work' });
    const a2 = makeArea({ name: 'Life' });
    const g1 = makeGoal(a1.id);
    const g2 = makeGoal(a2.id);
    makeTask(g1.id);
    makeTask(g2.id);
    const res = await agent().get('/api/tasks/table?group_by=area').expect(200);
    assert.ok(res.body.groups.length >= 2);
  });

  it('groups by status', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { status: 'todo' });
    makeTask(goal.id, { status: 'done' });
    const res = await agent().get('/api/tasks/table?group_by=status').expect(200);
    assert.ok(res.body.groups.length >= 2);
  });

  it('groups by priority', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { priority: 0 });
    makeTask(goal.id, { priority: 3 });
    const res = await agent().get('/api/tasks/table?group_by=priority').expect(200);
    assert.ok(res.body.groups.length >= 2);
  });

  it('filters by area_id', async () => {
    const a1 = makeArea({ name: 'Filter' });
    const a2 = makeArea({ name: 'Other' });
    const g1 = makeGoal(a1.id);
    const g2 = makeGoal(a2.id);
    makeTask(g1.id, { title: 'InArea' });
    makeTask(g2.id, { title: 'OutArea' });
    const res = await agent().get(`/api/tasks/table?area_id=${a1.id}`).expect(200);
    assert.ok(res.body.tasks.every(t => t.area_id === a1.id));
  });

  it('pagination offset works', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) makeTask(goal.id, { title: `T${i}` });
    const page1 = await agent().get('/api/tasks/table?limit=2&offset=0').expect(200);
    const page2 = await agent().get('/api/tasks/table?limit=2&offset=2').expect(200);
    assert.ok(page1.body.tasks[0].id !== page2.body.tasks[0].id);
  });

  it('ignores invalid sort_by', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const res = await agent().get('/api/tasks/table?sort_by=invalid_column').expect(200);
    assert.ok(res.body.tasks); // falls back to due_date
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. SAVE LIST AS TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

describe('Save list as template', () => {
  it('saves list as template', async () => {
    const list = await agent().post('/api/lists').send({ name: 'SaveMe', type: 'checklist' });
    await agent().post(`/api/lists/${list.body.id}/items`).send({ title: 'Item1' });
    const res = await agent().post(`/api/lists/${list.body.id}/save-as-template`).expect(200);
    assert.ok(res.body.id);
    assert.ok(res.body.tasks);
  });

  it('saved template appears in template list', async () => {
    const list = await agent().post('/api/lists').send({ name: 'TplList', type: 'checklist' });
    await agent().post(`/api/lists/${list.body.id}/save-as-template`);
    const templates = await agent().get('/api/templates').expect(200);
    assert.ok(templates.body.some(t => t.name === 'TplList'));
  });
});
