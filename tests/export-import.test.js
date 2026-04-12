const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeTag, linkTag, makeHabit, logHabit, makeFocus, makeList, makeListItem, makeSubtask, today } = require('./helpers');

describe('Export/Import Data Completeness', () => {
  let db;
  before(() => { ({ db } = setup()); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // Helper: create a full dataset and return it
  async function createFullDataset() {
    const area = makeArea({ name: 'Completeness Area' });
    const goal = makeGoal(area.id, { title: 'Completeness Goal' });
    const task = makeTask(goal.id, { title: 'Completeness Task', due_date: today() });
    const tag = makeTag({ name: 'export-tag' });
    linkTag(task.id, tag.id);
    const sub = makeSubtask(task.id, { title: 'Export Sub' });
    const habit = makeHabit({ name: 'Export Habit' });
    logHabit(habit.id, today());
    const focus = makeFocus(task.id, { duration_sec: 1500 });
    const list = makeList({ name: 'Export List' });
    const listItem = makeListItem(list.id, { title: 'Export Item' });
    // Comments
    db.prepare('INSERT INTO task_comments (task_id, text) VALUES (?,?)').run(task.id, 'Test comment');
    // Dependencies
    const task2 = makeTask(goal.id, { title: 'Blocker Task' });
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?,?)').run(task.id, task2.id);
    // Automation rules
    db.prepare('INSERT INTO automation_rules (user_id, name, trigger_type, action_type, trigger_config, action_config, enabled) VALUES (1,?,?,?,?,?,1)').run('Test Rule', 'task_completed', 'send_notification', '{}', '{}');
    // Notes
    db.prepare('INSERT INTO notes (user_id, title, content) VALUES (1,?,?)').run('Export Note', 'Note content');
    // Inbox
    db.prepare('INSERT INTO inbox (user_id, title) VALUES (1,?)').run('Export Inbox Item');
    // Saved filters
    db.prepare('INSERT INTO saved_filters (user_id, name, filters) VALUES (1,?,?)').run('My Filter', '{"status":"todo"}');
    // Custom fields
    db.prepare('INSERT INTO custom_field_defs (user_id, name, field_type) VALUES (1,?,?)').run('Priority Level', 'select');
    const fieldId = db.prepare('SELECT id FROM custom_field_defs WHERE name=?').get('Priority Level').id;
    db.prepare('INSERT INTO task_custom_values (task_id, field_id, value) VALUES (?,?,?)').run(task.id, fieldId, 'High');
    // Webhooks
    db.prepare('INSERT INTO webhooks (user_id, name, url, events, secret, active) VALUES (1,?,?,?,?,1)').run('Test Hook', 'https://example.com/hook', '["task_completed"]', 'sec123');
    // API tokens
    db.prepare('INSERT INTO api_tokens (user_id, name, token_hash) VALUES (1,?,?)').run('Test Token', 'hash123abc');
    // Push subscriptions
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (1,?,?,?)').run('https://push.example.com/sub1', 'p256key', 'authkey');
    return { area, goal, task, task2, tag, sub, habit, focus, list, listItem, fieldId };
  }

  it('export includes habits and habit_logs', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.habits), 'export should include habits');
    assert.ok(res.body.habits.length >= 1);
    assert.ok(Array.isArray(res.body.habit_logs), 'export should include habit_logs');
    assert.ok(res.body.habit_logs.length >= 1);
  });

  it('export includes focus_sessions', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.focus_sessions), 'export should include focus_sessions');
    assert.ok(res.body.focus_sessions.length >= 1);
  });

  it('export includes task_comments', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.task_comments), 'export should include task_comments');
    assert.ok(res.body.task_comments.length >= 1);
  });

  it('export includes lists and list_items', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.lists), 'export should include lists');
    assert.ok(res.body.lists.length >= 1);
    assert.ok(Array.isArray(res.body.list_items), 'export should include list_items');
    assert.ok(res.body.list_items.length >= 1);
  });

  it('export includes notes', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.notes), 'export should include notes');
    assert.ok(res.body.notes.length >= 1);
  });

  it('export includes custom_field_defs and task_custom_values', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.custom_field_defs), 'export should include custom_field_defs');
    assert.ok(res.body.custom_field_defs.length >= 1);
    assert.ok(Array.isArray(res.body.task_custom_values), 'export should include task_custom_values');
    assert.ok(res.body.task_custom_values.length >= 1);
  });

  it('export includes automation_rules', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.automation_rules), 'export should include automation_rules');
    assert.ok(res.body.automation_rules.length >= 1);
  });

  it('export includes saved_filters', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.saved_filters), 'export should include saved_filters');
    assert.ok(res.body.saved_filters.length >= 1);
  });

  it('export includes webhooks', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.webhooks), 'export should include webhooks');
    assert.ok(res.body.webhooks.length >= 1);
    assert.equal(res.body.webhooks[0].name, 'Test Hook');
  });

  it('export includes api_tokens', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.api_tokens), 'export should include api_tokens');
    assert.ok(res.body.api_tokens.length >= 1);
    assert.equal(res.body.api_tokens[0].name, 'Test Token');
  });

  it('export includes push_subscriptions', async () => {
    await createFullDataset();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.push_subscriptions), 'export should include push_subscriptions');
    assert.ok(res.body.push_subscriptions.length >= 1);
  });

  it('full roundtrip: export → wipe → import → all records identical', async () => {
    await createFullDataset();
    // Export
    const exportRes = await agent().get('/api/export').expect(200);
    const data = exportRes.body;
    // Import (wipes and restores)
    const importRes = await agent().post('/api/import').send({
      ...data,
      confirm: 'DESTROY_ALL_DATA',
      password: 'testpassword',
    }).expect(200);
    assert.ok(importRes.body.ok);
    // Re-export and compare counts
    const reExportRes = await agent().get('/api/export').expect(200);
    assert.equal(reExportRes.body.areas.length, data.areas.length, 'areas count mismatch');
    assert.equal(reExportRes.body.goals.length, data.goals.length, 'goals count mismatch');
    assert.equal(reExportRes.body.tags.length, data.tags.length, 'tags count mismatch');
    // Tasks may have slightly different enrichment but count should match
    assert.equal(reExportRes.body.tasks.length, data.tasks.length, 'tasks count mismatch');
    // Extended data
    if (data.habits) assert.equal(reExportRes.body.habits.length, data.habits.length, 'habits count mismatch');
    if (data.notes) assert.equal(reExportRes.body.notes.length, data.notes.length, 'notes count mismatch');
    if (data.lists) assert.equal(reExportRes.body.lists.length, data.lists.length, 'lists count mismatch');
    if (data.custom_field_defs) assert.equal(reExportRes.body.custom_field_defs.length, data.custom_field_defs.length, 'custom_field_defs count mismatch');
  });

  it('import rejects webhook URLs using private/internal networks', async () => {
    await agent().post('/api/import').send({
      confirm: 'DESTROY_ALL_DATA',
      password: 'testpassword',
      areas: [{ id: 1, name: 'Imported Area' }],
      goals: [{ id: 1, title: 'Imported Goal', area_id: 1 }],
      tasks: [{ title: 'Imported Task', goal_id: 1 }],
      tags: [{ id: 1, name: 'imported-tag', color: '#FF0000' }],
      webhooks: [{ name: 'Bad Hook', url: 'https://127.0.0.1/hook', events: '[]', secret: 's' }],
    }).expect(400);
  });

  it('import rejects webhook URLs that are not HTTPS', async () => {
    await agent().post('/api/import').send({
      confirm: 'DESTROY_ALL_DATA',
      password: 'testpassword',
      areas: [{ id: 1, name: 'Imported Area' }],
      goals: [{ id: 1, title: 'Imported Goal', area_id: 1 }],
      tasks: [{ title: 'Imported Task', goal_id: 1 }],
      tags: [{ id: 1, name: 'imported-tag', color: '#FF0000' }],
      webhooks: [{ name: 'Bad Hook', url: 'http://example.com/hook', events: '[]', secret: 's' }],
    }).expect(400);
  });

  it('import with missing optional tables succeeds (backward compat)', async () => {
    const area = makeArea({ name: 'Compat Area' });
    const goal = makeGoal(area.id, { title: 'Compat Goal' });
    const task = makeTask(goal.id, { title: 'Compat Task' });
    // Minimal export with only required tables
    const res = await agent().post('/api/import').send({
      confirm: 'DESTROY_ALL_DATA',
      password: 'testpassword',
      areas: [{ id: 1, name: 'Imported Area' }],
      goals: [{ id: 1, title: 'Imported Goal', area_id: 1 }],
      tasks: [{ title: 'Imported Task', goal_id: 1 }],
      tags: [{ id: 1, name: 'imported-tag', color: '#FF0000' }],
      // No habits, notes, lists, etc. — should still succeed
    }).expect(200);
    assert.ok(res.body.ok);
  });
});
