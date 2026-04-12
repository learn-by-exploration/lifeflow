const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeFocus, makeList, makeListItem, makeHabit, logHabit, agent } = require('./helpers');

let db;
before(() => { const s = setup(); db = s.db; });
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Backup Round-Trip Completeness ───

describe('Backup round-trip completeness', () => {

  it('round-trips all entity types without data loss', async () => {
    // ── Arrange: create one of every entity type ──
    const area = makeArea({ name: 'RT Area', icon: '🎯', color: '#FF0000' });
    const goal = makeGoal(area.id, { title: 'RT Goal', description: 'desc', color: '#00FF00' });
    const task = makeTask(goal.id, { title: 'RT Task', note: 'note', priority: 2, status: 'doing' });
    const subtask = makeSubtask(task.id, { title: 'RT Sub', done: 1 });
    const tag = makeTag({ name: 'rt-tag', color: '#0000FF' });
    linkTag(task.id, tag.id);
    const habit = makeHabit({ name: 'RT Habit', icon: '🏃', color: '#33FF33' });
    logHabit(habit.id, '2026-04-10');
    const focus = makeFocus(task.id, { duration_sec: 1200 });
    const list = makeList({ name: 'RT List', type: 'checklist', icon: '📋' });
    const listItem = makeListItem(list.id, { title: 'RT Item', checked: 1 });

    // Template
    db.prepare('INSERT INTO task_templates (name,description,icon,tasks,user_created,source_type,user_id) VALUES (?,?,?,?,?,?,?)')
      .run('RT Template', 'template desc', '📋', '[]', 1, 'task', 1);

    // Filter
    db.prepare('INSERT INTO saved_filters (name,icon,color,filters,position,user_id) VALUES (?,?,?,?,?,?)')
      .run('RT Filter', '🔍', '#2563EB', '{"status":"todo"}', 0, 1);

    // Automation rule
    db.prepare('INSERT INTO automation_rules (name,trigger_type,trigger_config,action_type,action_config,conditions,actions,description,template_id,enabled,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('RT Rule', 'task_completed', '{}', 'send_notification', '{}', null, null, 'test rule', null, 1, 1);

    // Custom field def
    const fieldRes = db.prepare('INSERT INTO custom_field_defs (name,field_type,options,position,required,show_in_card,user_id) VALUES (?,?,?,?,?,?,?)')
      .run('Priority Level', 'select', '["Low","Mid","High"]', 0, 0, 1, 1);

    // Custom status
    db.prepare('INSERT INTO custom_statuses (goal_id,name,color,position,is_done) VALUES (?,?,?,?,?)')
      .run(goal.id, 'In Review', '#FFA500', 0, 0);

    // Daily review
    db.prepare('INSERT INTO daily_reviews (user_id,date,note,completed_count) VALUES (?,?,?,?)')
      .run(1, '2026-04-10', 'Good day', 5);

    // User XP
    db.prepare('INSERT INTO user_xp (user_id,amount,reason,created_at) VALUES (?,?,?,?)')
      .run(1, 10, 'task_complete', '2026-04-10T12:00:00Z');

    // Badge
    db.prepare('INSERT INTO badges (user_id,type,earned_at) VALUES (?,?,?)')
      .run(1, 'first_task', '2026-04-10T12:00:00Z');

    // Inbox
    db.prepare('INSERT INTO inbox (user_id,title,note,priority) VALUES (?,?,?,?)')
      .run(1, 'RT Inbox Item', 'inbox note', 1);

    // Note
    db.prepare('INSERT INTO notes (title,content,goal_id,user_id) VALUES (?,?,?,?)')
      .run('RT Note', 'note content', goal.id, 1);

    // Weekly review
    db.prepare('INSERT INTO weekly_reviews (week_start,tasks_completed,tasks_created,top_accomplishments,reflection,next_week_priorities,rating,user_id) VALUES (?,?,?,?,?,?,?,?)')
      .run('2026-04-06', 10, 5, '[]', 'reflection', '[]', 4, 1);

    // Goal milestone
    db.prepare('INSERT INTO goal_milestones (goal_id,title,done,position) VALUES (?,?,?,?)')
      .run(goal.id, 'RT Milestone', 0, 0);

    // Task comment
    db.prepare('INSERT INTO task_comments (task_id,text) VALUES (?,?)')
      .run(task.id, 'RT Comment');

    // ── Act: export ──
    const exportRes = await agent().get('/api/export').expect(200);
    const exportData = exportRes.body;

    // Verify export includes all entity types
    assert.ok(exportData.areas.length >= 1, 'areas exported');
    assert.ok(exportData.goals.length >= 1, 'goals exported');
    assert.ok(exportData.tasks.length >= 1, 'tasks exported');
    assert.ok(exportData.tags.length >= 1, 'tags exported');
    assert.ok(exportData.habits.length >= 1, 'habits exported');
    assert.ok(exportData.habit_logs.length >= 1, 'habit_logs exported');
    assert.ok(exportData.focus_sessions.length >= 1, 'focus_sessions exported');
    assert.ok(exportData.notes.length >= 1, 'notes exported');
    assert.ok(exportData.lists.length >= 1, 'lists exported');
    assert.ok(exportData.list_items.length >= 1, 'list_items exported');
    assert.ok(exportData.custom_field_defs.length >= 1, 'custom_field_defs exported');
    assert.ok(exportData.automation_rules.length >= 1, 'automation_rules exported');
    assert.ok(exportData.saved_filters.length >= 1, 'saved_filters exported');
    assert.ok(exportData.task_templates.length >= 1, 'task_templates exported');
    assert.ok(exportData.weekly_reviews.length >= 1, 'weekly_reviews exported');
    assert.ok(exportData.daily_reviews.length >= 1, 'daily_reviews exported');
    assert.ok(exportData.inbox.length >= 1, 'inbox exported');
    assert.ok(exportData.badges.length >= 1, 'badges exported');
    assert.ok(exportData.user_xp.length >= 1, 'user_xp exported');
    assert.ok(exportData.custom_statuses.length >= 1, 'custom_statuses exported');
    assert.ok(exportData.goal_milestones.length >= 1, 'goal_milestones exported');
    assert.ok(exportData.task_comments.length >= 1, 'task_comments exported');

    // Record pre-import counts
    const preCounts = {
      areas: exportData.areas.length,
      goals: exportData.goals.length,
      tasks: exportData.tasks.length,
      tags: exportData.tags.length,
      habits: exportData.habits.length,
      habit_logs: exportData.habit_logs.length,
      focus_sessions: exportData.focus_sessions.length,
      notes: exportData.notes.length,
      lists: exportData.lists.length,
      list_items: exportData.list_items.length,
      custom_field_defs: exportData.custom_field_defs.length,
      automation_rules: exportData.automation_rules.length,
      saved_filters: exportData.saved_filters.length,
      task_templates: exportData.task_templates.length,
      weekly_reviews: exportData.weekly_reviews.length,
      daily_reviews: exportData.daily_reviews.length,
      inbox: exportData.inbox.length,
      badges: exportData.badges.length,
      user_xp: exportData.user_xp.length,
      custom_statuses: exportData.custom_statuses.length,
      goal_milestones: exportData.goal_milestones.length,
      task_comments: exportData.task_comments.length,
    };

    // ── Act: import the exported data (this clears + re-inserts) ──
    const importRes = await agent().post('/api/import')
      .send({...exportData, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'})
      .expect(200);
    assert.equal(importRes.body.ok, true);

    // ── Act: export again ──
    const reExportRes = await agent().get('/api/export').expect(200);
    const reExportData = reExportRes.body;

    // ── Assert: counts must match ──
    assert.equal(reExportData.areas.length, preCounts.areas, 'areas count matches after round-trip');
    assert.equal(reExportData.goals.length, preCounts.goals, 'goals count matches after round-trip');
    assert.equal(reExportData.tasks.length, preCounts.tasks, 'tasks count matches after round-trip');
    assert.equal(reExportData.tags.length, preCounts.tags, 'tags count matches after round-trip');
    assert.equal(reExportData.habits.length, preCounts.habits, 'habits count matches after round-trip');
    assert.equal(reExportData.habit_logs.length, preCounts.habit_logs, 'habit_logs count matches after round-trip');
    assert.equal(reExportData.focus_sessions.length, preCounts.focus_sessions, 'focus_sessions count matches after round-trip');
    assert.equal(reExportData.notes.length, preCounts.notes, 'notes count matches after round-trip');
    assert.equal(reExportData.lists.length, preCounts.lists, 'lists count matches after round-trip');
    assert.equal(reExportData.list_items.length, preCounts.list_items, 'list_items count matches after round-trip');
    assert.equal(reExportData.custom_field_defs.length, preCounts.custom_field_defs, 'custom_field_defs count matches after round-trip');
    assert.equal(reExportData.automation_rules.length, preCounts.automation_rules, 'automation_rules count matches after round-trip');
    assert.equal(reExportData.saved_filters.length, preCounts.saved_filters, 'saved_filters count matches after round-trip');
    assert.equal(reExportData.task_templates.length, preCounts.task_templates, 'task_templates count matches after round-trip');
    assert.equal(reExportData.weekly_reviews.length, preCounts.weekly_reviews, 'weekly_reviews count matches after round-trip');
    assert.equal(reExportData.daily_reviews.length, preCounts.daily_reviews, 'daily_reviews count matches after round-trip');
    assert.equal(reExportData.inbox.length, preCounts.inbox, 'inbox count matches after round-trip');
    assert.equal(reExportData.badges.length, preCounts.badges, 'badges count matches after round-trip');
    assert.equal(reExportData.user_xp.length, preCounts.user_xp, 'user_xp count matches after round-trip');
    assert.equal(reExportData.custom_statuses.length, preCounts.custom_statuses, 'custom_statuses count matches after round-trip');
    assert.equal(reExportData.goal_milestones.length, preCounts.goal_milestones, 'goal_milestones count matches after round-trip');
    assert.equal(reExportData.task_comments.length, preCounts.task_comments, 'task_comments count matches after round-trip');
  });

  it('automation_rules import preserves all fields', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    db.prepare('INSERT INTO automation_rules (name,trigger_type,trigger_config,action_type,action_config,conditions,actions,description,template_id,enabled,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('Full Rule', 'task_completed', '{"goal_id":1}', 'send_notification', '{"message":"done"}', '{"field":"priority","op":"eq","value":2}', '[{"type":"tag","value":"done"}]', 'A description', 'tpl-1', 1, 1);

    const exportRes = await agent().get('/api/export').expect(200);
    const rule = exportRes.body.automation_rules[0];

    // Verify export has all fields
    assert.equal(rule.name, 'Full Rule');
    assert.equal(rule.description, 'A description');
    assert.equal(rule.template_id, 'tpl-1');

    // Import
    await agent().post('/api/import').send({...exportRes.body, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);

    // Re-export
    const reExportRes = await agent().get('/api/export').expect(200);
    const reimported = reExportRes.body.automation_rules[0];
    assert.equal(reimported.name, 'Full Rule');
    assert.equal(reimported.trigger_type, 'task_completed');
    assert.equal(reimported.description, 'A description');
    assert.equal(reimported.template_id, 'tpl-1');
    assert.equal(reimported.enabled, 1);
  });

  it('daily_reviews survive round-trip', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    db.prepare('INSERT INTO daily_reviews (user_id,date,note,completed_count) VALUES (?,?,?,?)')
      .run(1, '2026-04-01', 'review note', 7);

    const exportRes = await agent().get('/api/export').expect(200);
    assert.equal(exportRes.body.daily_reviews.length, 1);

    await agent().post('/api/import').send({...exportRes.body, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);

    const reExportRes = await agent().get('/api/export').expect(200);
    assert.equal(reExportRes.body.daily_reviews.length, 1);
    assert.equal(reExportRes.body.daily_reviews[0].date, '2026-04-01');
    assert.equal(reExportRes.body.daily_reviews[0].note, 'review note');
    assert.equal(reExportRes.body.daily_reviews[0].completed_count, 7);
  });

  it('user_xp survives round-trip', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    db.prepare('INSERT INTO user_xp (user_id,amount,reason,created_at) VALUES (?,?,?,?)')
      .run(1, 25, 'habit_streak', '2026-04-05T08:00:00Z');

    const exportRes = await agent().get('/api/export').expect(200);
    assert.equal(exportRes.body.user_xp.length, 1);

    await agent().post('/api/import').send({...exportRes.body, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);

    const reExportRes = await agent().get('/api/export').expect(200);
    assert.equal(reExportRes.body.user_xp.length, 1);
    assert.equal(reExportRes.body.user_xp[0].amount, 25);
    assert.equal(reExportRes.body.user_xp[0].reason, 'habit_streak');
  });

  it('badges survive round-trip', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    db.prepare('INSERT INTO badges (user_id,type,earned_at) VALUES (?,?,?)')
      .run(1, 'streak_7', '2026-04-05T10:00:00Z');

    const exportRes = await agent().get('/api/export').expect(200);
    assert.equal(exportRes.body.badges.length, 1);

    await agent().post('/api/import').send({...exportRes.body, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);

    const reExportRes = await agent().get('/api/export').expect(200);
    assert.equal(reExportRes.body.badges.length, 1);
    assert.equal(reExportRes.body.badges[0].type, 'streak_7');
  });

  it('inbox survives round-trip', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    db.prepare('INSERT INTO inbox (user_id,title,note,priority) VALUES (?,?,?,?)')
      .run(1, 'Quick thought', 'capture this', 2);

    const exportRes = await agent().get('/api/export').expect(200);
    assert.equal(exportRes.body.inbox.length, 1);

    await agent().post('/api/import').send({...exportRes.body, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);

    const reExportRes = await agent().get('/api/export').expect(200);
    assert.equal(reExportRes.body.inbox.length, 1);
    assert.equal(reExportRes.body.inbox[0].title, 'Quick thought');
    assert.equal(reExportRes.body.inbox[0].priority, 2);
  });

  it('custom_statuses survive round-trip', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    db.prepare('INSERT INTO custom_statuses (goal_id,name,color,position,is_done) VALUES (?,?,?,?,?)')
      .run(goal.id, 'QA Review', '#FF8800', 1, 0);

    const exportRes = await agent().get('/api/export').expect(200);
    assert.equal(exportRes.body.custom_statuses.length, 1);

    await agent().post('/api/import').send({...exportRes.body, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);

    const reExportRes = await agent().get('/api/export').expect(200);
    assert.equal(reExportRes.body.custom_statuses.length, 1);
    assert.equal(reExportRes.body.custom_statuses[0].name, 'QA Review');
    assert.equal(reExportRes.body.custom_statuses[0].is_done, 0);
  });
});

// ─── Edge Cases ───

describe('Backup import edge cases', () => {

  it('handles empty optional arrays gracefully', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    const exportRes = await agent().get('/api/export').expect(200);
    // Override all optional arrays to empty
    const data = {
      ...exportRes.body,
      automation_rules: [],
      daily_reviews: [],
      user_xp: [],
      badges: [],
      inbox: [],
      custom_statuses: [],
      habits: [],
      habit_logs: [],
      focus_sessions: [],
      notes: [],
      saved_filters: [],
      task_templates: [],
      weekly_reviews: [],
      webhooks: [],
    };

    const importRes = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);
    assert.equal(importRes.body.ok, true);
  });

  it('handles missing optional arrays gracefully', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    const exportRes = await agent().get('/api/export').expect(200);
    // Remove optional arrays entirely
    const data = { areas: exportRes.body.areas, goals: exportRes.body.goals, tasks: exportRes.body.tasks };

    const importRes = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);
    assert.equal(importRes.body.ok, true);
  });

  it('skips custom_statuses with orphaned goal references', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      custom_statuses: [{ goal_id: 99999, name: 'Orphan', color: '#000', position: 0, is_done: 0 }],
    };

    const importRes = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);
    assert.equal(importRes.body.ok, true);

    // Orphaned status should not be imported
    const reExport = await agent().get('/api/export').expect(200);
    assert.equal(reExport.body.custom_statuses.length, 0);
  });
});

// ─── Webhook URL Security ───

describe('Automation rule webhook URL validation on import', () => {

  function makeMinimalImport() {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
  }

  it('rejects automation rule with HTTP (non-HTTPS) webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'http://example.com/hook' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('HTTPS'));
  });

  it('rejects automation rule with localhost webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://localhost/hook' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('private'));
  });

  it('rejects automation rule with 127.0.0.1 webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://127.0.0.1/hook' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
  });

  it('rejects automation rule with 10.x private IP webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://10.0.0.1/hook' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
  });

  it('rejects automation rule with 172.16.x private IP webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://172.16.0.1/hook' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
  });

  it('rejects automation rule with 192.168.x private IP webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://192.168.1.1/hook' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
  });

  it('rejects automation rule with 169.254.x link-local webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Bad Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://169.254.169.254/metadata' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'});
    assert.equal(res.status, 400);
  });

  it('accepts automation rule with valid HTTPS public webhook URL', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Good Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: JSON.stringify({ webhook_url: 'https://hooks.example.com/notify' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);
    assert.equal(res.body.ok, true);
  });

  it('accepts automation rule without webhook_url in action_config', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'No Webhook Rule',
        trigger_type: 'task_completed',
        action_type: 'send_notification',
        action_config: JSON.stringify({ message: 'Task done!' }),
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);
    assert.equal(res.body.ok, true);
  });

  it('handles action_config as object (not stringified)', async () => {
    makeMinimalImport();
    const exportRes = await agent().get('/api/export').expect(200);
    const data = {
      ...exportRes.body,
      automation_rules: [{
        name: 'Object Config Rule',
        trigger_type: 'task_completed',
        action_type: 'webhook',
        action_config: { webhook_url: 'https://hooks.example.com/ok' },
      }],
    };

    const res = await agent().post('/api/import').send({...data, confirm: 'DESTROY_ALL_DATA', password: 'testpassword'}).expect(200);
    assert.equal(res.body.ok, true);
  });
});
