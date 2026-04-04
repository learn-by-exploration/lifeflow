/**
 * frontend-concurrency.test.js — Multi-user isolation, IDOR coverage,
 * data integrity, race conditions, and cross-endpoint consistency.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, agent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeHabit, logHabit, makeFocus, makeList, makeListItem, makeUser2, today, daysFromNow, rebuildSearch } = require('./helpers');

const { db } = setup();

beforeEach(() => cleanDb());

// ═══════════════════════════════════════════════════════════════════════════
// 1. MULTI-USER AREA ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user area isolation', () => {
  it('user cannot see other user areas', async () => {
    const a = makeArea({ name: 'User1 Area' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/areas').expect(200);
    assert.ok(!res.body.some(ar => ar.name === 'User1 Area'));
  });

  it('user cannot update other user area', async () => {
    const a = makeArea({ name: 'Protected' });
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/areas/${a.id}`).send({ name: 'Hacked' }).expect(404);
  });

  it('user cannot delete other user area', async () => {
    const a = makeArea({ name: 'NoDelete' });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/areas/${a.id}`).expect(404);
  });

  it('user cannot archive other user area', async () => {
    const a = makeArea({ name: 'NoArchive' });
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/areas/${a.id}/archive`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MULTI-USER GOAL ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user goal isolation', () => {
  it('user cannot see other user goals', async () => {
    const a = makeArea();
    const g = makeGoal(a.id, { title: 'Private Goal' });
    const { agent: agent2 } = makeUser2();
    const a2 = makeArea({ name: 'A2', user_id: 2 });
    const res = await agent2.get(`/api/areas/${a2.id}/goals`);
    assert.ok(!res.body.some(goal => goal.title === 'Private Goal'));
  });

  it('user cannot update other user goal', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/goals/${g.id}`).send({ title: 'Hacked' }).expect(404);
  });

  it('user cannot delete other user goal', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/goals/${g.id}`).expect(404);
  });

  it('user cannot get other user goal progress', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { agent: agent2 } = makeUser2();
    await agent2.get(`/api/goals/${g.id}/progress`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MULTI-USER TASK ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user task isolation', () => {
  it('user cannot see other user tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Secret Task' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/tasks/all').expect(200);
    const tasks = Array.isArray(res.body) ? res.body : res.body.items || [];
    assert.ok(!tasks.some(t => t.title === 'Secret Task'));
  });

  it('user cannot get other user task by id', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    await agent2.get(`/api/tasks/${t.id}`).expect(404);
  });

  it('user cannot update other user task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/tasks/${t.id}`).send({ title: 'Hacked' }).expect(404);
  });

  it('user cannot delete other user task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/tasks/${t.id}`).expect(404);
  });

  it('user cannot add dependency to other user task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t1 = makeTask(g.id);
    const t2 = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    // User 2 should not be able to set deps on user 1's tasks
    await agent2.put(`/api/tasks/${t1.id}/deps`).send({ blockedByIds: [t2.id] }).expect(404);
  });

  it('user cannot add comment to other user task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/tasks/${t.id}/comments`).send({ text: 'Spam' }).expect(404);
  });

  it('user cannot add time to other user task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/tasks/${t.id}/time`).send({ minutes: 30 }).expect(404);
  });

  it('user cannot move other user task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/tasks/${t.id}/move`).send({ goal_id: g.id }).expect(404);
  });

  it('user cannot skip other user recurring task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { recurring: 'daily', due_date: today() });
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/tasks/${t.id}/skip`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MULTI-USER HABIT ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user habit isolation', () => {
  it('user cannot see other user habits', async () => {
    makeHabit({ name: 'Secret Habit' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/habits').expect(200);
    assert.ok(!res.body.some(h => h.name === 'Secret Habit'));
  });

  it('user cannot log other user habit', async () => {
    const h = makeHabit();
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/habits/${h.id}/log`).send({ date: today() }).expect(404);
  });

  it('user cannot delete other user habit', async () => {
    const h = makeHabit();
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/habits/${h.id}`).expect(404);
  });

  it('user cannot view other user habit heatmap', async () => {
    const h = makeHabit();
    const { agent: agent2 } = makeUser2();
    await agent2.get(`/api/habits/${h.id}/heatmap`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. MULTI-USER FOCUS SESSION ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user focus session isolation', () => {
  it('user cannot end other user focus session', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const f = makeFocus(t.id);
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/focus/${f.id}/end`).send({ duration_sec: 100 }).expect(404);
  });

  it('user cannot add meta to other user session', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const f = makeFocus(t.id);
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/focus/${f.id}/meta`).send({ intention: 'Spy' }).expect(404);
  });

  it('user cannot add steps to other user session', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const f = makeFocus(t.id);
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/focus/${f.id}/steps`).send({ steps: ['Spy'] }).expect(404);
  });

  it('user cannot delete other user focus session', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const f = makeFocus(t.id);
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/focus/${f.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. MULTI-USER LIST ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user list isolation', () => {
  it('user cannot see other user lists', async () => {
    makeList({ name: 'Private List' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/lists').expect(200);
    assert.ok(!res.body.some(l => l.name === 'Private List'));
  });

  it('user cannot update other user list', async () => {
    const l = makeList({ name: 'NoTouch' });
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/lists/${l.id}`).send({ name: 'Hacked' }).expect(404);
  });

  it('user cannot delete other user list', async () => {
    const l = makeList();
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/lists/${l.id}`).expect(404);
  });

  it('user cannot add items to other user list', async () => {
    const l = makeList();
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/lists/${l.id}/items`).send({ title: 'Sneak' }).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. MULTI-USER TAG ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user tag isolation', () => {
  it('user cannot see other user tags', async () => {
    makeTag({ name: 'secret-tag' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/tags').expect(200);
    assert.ok(!res.body.some(t => t.name === 'secret-tag'));
  });

  it('user cannot delete other user tag', async () => {
    const tag = makeTag({ name: 'nodelete' });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/tags/${tag.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. MULTI-USER WEBHOOK ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user webhook isolation', () => {
  it('user cannot see other user webhooks', async () => {
    await agent().post('/api/webhooks').send({
      name: 'Private', url: 'https://example.com/hook', events: ['task.created']
    });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/webhooks').expect(200);
    assert.ok(!res.body.some(w => w.name === 'Private'));
  });

  it('user cannot delete other user webhook', async () => {
    const wh = await agent().post('/api/webhooks').send({
      name: 'NoDel', url: 'https://example.com/hook', events: ['task.created']
    });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/webhooks/${wh.body.id}`).expect(404);
  });

  it('user cannot update other user webhook', async () => {
    const wh = await agent().post('/api/webhooks').send({
      name: 'NoUpd', url: 'https://example.com/hook', events: ['task.created']
    });
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/webhooks/${wh.body.id}`).send({ name: 'Hacked' }).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. MULTI-USER CUSTOM FIELD ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user custom field isolation', () => {
  it('user cannot see other user custom fields', async () => {
    await agent().post('/api/custom-fields').send({ name: 'Secret', field_type: 'text' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/custom-fields').expect(200);
    assert.ok(!res.body.some(f => f.name === 'Secret'));
  });

  it('user cannot delete other user custom field', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'NoDel', field_type: 'text' });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/custom-fields/${f.body.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. MULTI-USER TEMPLATE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user template isolation', () => {
  it('user cannot see other user templates', async () => {
    await agent().post('/api/templates').send({ name: 'Private', tasks: [{ title: 'T' }] });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/templates').expect(200);
    assert.ok(!res.body.some(t => t.name === 'Private'));
  });

  it('user cannot apply other user template', async () => {
    const tmpl = await agent().post('/api/templates').send({ name: 'NoApply', tasks: [{ title: 'T' }] });
    const { agent: agent2, userId: u2Id } = makeUser2();
    // User 2 creates their own area/goal
    const a2 = db.prepare("INSERT INTO life_areas (name,icon,color,position,user_id) VALUES ('A','📁','#000',0,?)").run(u2Id);
    const g2 = db.prepare("INSERT INTO goals (area_id,title,status,user_id) VALUES (?,'G','active',?)").run(a2.lastInsertRowid, u2Id);
    await agent2.post(`/api/templates/${tmpl.body.id}/apply`).send({ goalId: Number(g2.lastInsertRowid) }).expect(404);
  });

  it('user cannot delete other user template', async () => {
    const tmpl = await agent().post('/api/templates').send({ name: 'NoDel', tasks: [{ title: 'T' }] });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/templates/${tmpl.body.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. MULTI-USER INBOX/NOTES ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user inbox/notes isolation', () => {
  it('user cannot see other user inbox', async () => {
    await agent().post('/api/inbox').send({ title: 'Private Inbox' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/inbox').expect(200);
    assert.ok(!res.body.some(i => i.title === 'Private Inbox'));
  });

  it('user cannot delete other user inbox item', async () => {
    const inbox = await agent().post('/api/inbox').send({ title: 'NoDel' });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/inbox/${inbox.body.id}`).expect(404);
  });

  it('user cannot see other user notes', async () => {
    await agent().post('/api/notes').send({ title: 'Private Note' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/notes').expect(200);
    assert.ok(!res.body.some(n => n.title === 'Private Note'));
  });

  it('user cannot get other user note by id', async () => {
    const note = await agent().post('/api/notes').send({ title: 'Secret' });
    const { agent: agent2 } = makeUser2();
    await agent2.get(`/api/notes/${note.body.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. MULTI-USER RULE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user automation rule isolation', () => {
  it('user cannot see other user rules', async () => {
    await agent().post('/api/rules').send({
      name: 'Private', trigger_type: 'task_completed', action_type: 'add_tag'
    });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/rules').expect(200);
    assert.ok(!res.body.some(r => r.name === 'Private'));
  });

  it('user cannot update other user rule', async () => {
    const rule = await agent().post('/api/rules').send({
      name: 'NoUpd', trigger_type: 'task_completed', action_type: 'add_tag'
    });
    const { agent: agent2 } = makeUser2();
    await agent2.put(`/api/rules/${rule.body.id}`).send({ name: 'Hacked' }).expect(404);
  });

  it('user cannot delete other user rule', async () => {
    const rule = await agent().post('/api/rules').send({
      name: 'NoDel', trigger_type: 'task_completed', action_type: 'add_tag'
    });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/rules/${rule.body.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. MULTI-USER STATS ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user stats isolation', () => {
  it('stats only reflect own data', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 5; i++) makeTask(g.id, { status: 'done' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/stats').expect(200);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.done, 0);
  });

  it('activity log only shows own tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { status: 'done' });
    db.prepare('UPDATE tasks SET completed_at=CURRENT_TIMESTAMP WHERE id=?').run(t.id);
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/activity').expect(200);
    assert.equal(res.body.total, 0);
  });

  it('focus stats only reflect own sessions', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    makeFocus(t.id, { duration_sec: 3600 });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/focus/stats').expect(200);
    assert.equal(res.body.today, 0);
    assert.equal(res.body.sessions, 0);
  });

  it('streaks only reflect own completions', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { status: 'done' });
    db.prepare('UPDATE tasks SET completed_at=CURRENT_TIMESTAMP WHERE id=?').run(t.id);
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/stats/streaks').expect(200);
    assert.equal(res.body.streak, 0);
    assert.equal(res.body.heatmap.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. DATA INTEGRITY: CASCADE DELETES
// ═══════════════════════════════════════════════════════════════════════════

describe('Cascade delete integrity', () => {
  it('deleting area cascades to goals and tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    makeSubtask(t.id);
    await agent().delete(`/api/areas/${a.id}`).expect(200);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM goals WHERE area_id=?').get(a.id).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM tasks WHERE id=?').get(t.id).c, 0);
  });

  it('deleting goal cascades to tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const sub = makeSubtask(t.id);
    await agent().delete(`/api/goals/${g.id}`).expect(200);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM tasks WHERE goal_id=?').get(g.id).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM subtasks WHERE task_id=?').get(t.id).c, 0);
  });

  it('deleting task cascades subtasks, comments, deps', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t1 = makeTask(g.id);
    const t2 = makeTask(g.id);
    makeSubtask(t1.id);
    await agent().post(`/api/tasks/${t1.id}/comments`).send({ text: 'Hi' });
    await agent().put(`/api/tasks/${t2.id}/deps`).send({ blockedByIds: [t1.id] });
    await agent().delete(`/api/tasks/${t1.id}`).expect(200);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM subtasks WHERE task_id=?').get(t1.id).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM task_comments WHERE task_id=?').get(t1.id).c, 0);
  });

  it('deleting habit cascades habit_logs', async () => {
    const h = makeHabit();
    logHabit(h.id, today());
    await agent().delete(`/api/habits/${h.id}`).expect(200);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM habit_logs WHERE habit_id=?').get(h.id).c, 0);
  });

  it('deleting list cascades list_items', async () => {
    const l = makeList();
    makeListItem(l.id, { title: 'Item' });
    await agent().delete(`/api/lists/${l.id}`).expect(200);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM list_items WHERE list_id=?').get(l.id).c, 0);
  });

  it('deleting custom field cascades task values', async () => {
    const f = await agent().post('/api/custom-fields').send({ name: 'CasDel', field_type: 'text' });
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    await agent().put(`/api/tasks/${t.id}/custom-fields`).send({
      fields: [{ field_id: f.body.id, value: 'test' }]
    });
    await agent().delete(`/api/custom-fields/${f.body.id}`).expect(204);
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM task_custom_values WHERE field_id=?').get(f.body.id).c, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. DATA INTEGRITY: TASK STATUS TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Task status transition integrity', () => {
  it('completing task sets completed_at', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { status: 'todo' });
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'done' }).expect(200);
    const updated = db.prepare('SELECT * FROM tasks WHERE id=?').get(t.id);
    assert.ok(updated.completed_at);
  });

  it('uncompleting task clears completed_at', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { status: 'done' });
    db.prepare('UPDATE tasks SET completed_at=CURRENT_TIMESTAMP WHERE id=?').run(t.id);
    await agent().put(`/api/tasks/${t.id}`).send({ status: 'todo' }).expect(200);
    const updated = db.prepare('SELECT * FROM tasks WHERE id=?').get(t.id);
    assert.ok(!updated.completed_at);
  });

  it('bulk update sets completed_at on done tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t1 = makeTask(g.id);
    const t2 = makeTask(g.id);
    await agent().put('/api/tasks/bulk').send({
      ids: [t1.id, t2.id], changes: { status: 'done' }
    }).expect(200);
    const u1 = db.prepare('SELECT * FROM tasks WHERE id=?').get(t1.id);
    const u2 = db.prepare('SELECT * FROM tasks WHERE id=?').get(t2.id);
    assert.ok(u1.completed_at);
    assert.ok(u2.completed_at);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. DATA INTEGRITY: EXPORT / SEARCH
// ═══════════════════════════════════════════════════════════════════════════

describe('Export and search integrity', () => {
  it('export includes all user data', async () => {
    const a = makeArea({ name: 'Export Area' });
    const g = makeGoal(a.id, { title: 'Export Goal' });
    const t = makeTask(g.id, { title: 'Export Task' });
    makeTag({ name: 'export-tag' });
    const res = await agent().get('/api/export').expect(200);
    assert.ok(res.body.areas.some(ar => ar.name === 'Export Area'));
    assert.ok(res.body.goals.some(g => g.title === 'Export Goal'));
    assert.ok(res.body.tasks.some(t => t.title === 'Export Task'));
    assert.ok(res.body.tags.some(t => t.name === 'export-tag'));
  });

  it('export excludes other user data', async () => {
    const a = makeArea({ name: 'User1Only' });
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'U1Task' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/export').expect(200);
    assert.ok(!res.body.areas.some(ar => ar.name === 'User1Only'));
    assert.ok(!res.body.tasks.some(t => t.title === 'U1Task'));
  });

  it('search only returns own results', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'UniqueSearchTerm12345' });
    rebuildSearch();
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/search?q=UniqueSearchTerm12345').expect(200);
    const results = res.body.results || res.body;
    assert.ok(!results.some(r => r.title === 'UniqueSearchTerm12345'));
  });

  it('iCal export only includes own tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'CalTask', due_date: today() });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/export/ical').expect(200);
    assert.ok(!res.text.includes('CalTask'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. CONCURRENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Concurrent operations', () => {
  it('concurrent task creates get unique IDs', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        agent().post(`/api/goals/${g.id}/tasks`).send({ title: `Concurrent${i}` })
      );
    }
    const results = await Promise.all(promises);
    const ids = results.map(r => r.body.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 10);
  });

  it('concurrent habit logs accumulate correctly', async () => {
    const h = makeHabit();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(agent().post(`/api/habits/${h.id}/log`).send({ date: today() }));
    }
    await Promise.all(promises);
    const log = db.prepare('SELECT count FROM habit_logs WHERE habit_id=? AND date=?').get(h.id, today());
    assert.equal(log.count, 5);
  });

  it('concurrent bulk updates do not corrupt data', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const tasks = [];
    for (let i = 0; i < 5; i++) tasks.push(makeTask(g.id));
    const ids = tasks.map(t => t.id);
    // Two concurrent bulk updates
    await Promise.all([
      agent().put('/api/tasks/bulk').send({ ids: ids.slice(0, 3), changes: { priority: 2 } }),
      agent().put('/api/tasks/bulk').send({ ids: ids.slice(2), changes: { status: 'doing' } }),
    ]);
    // All tasks should still have valid states
    const all = db.prepare(`SELECT * FROM tasks WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    assert.equal(all.length, 5);
    all.forEach(t => {
      assert.ok(['todo', 'doing', 'done'].includes(t.status));
      assert.ok([0, 1, 2, 3].includes(t.priority));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. FILTER ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user filter isolation', () => {
  it('user cannot see other user saved filters', async () => {
    await agent().post('/api/filters').send({
      name: 'My Filter', filters: { status: 'todo' }
    });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/filters').expect(200);
    assert.ok(!res.body.some(f => f.name === 'My Filter'));
  });

  it('user cannot delete other user filter', async () => {
    const f = await agent().post('/api/filters').send({
      name: 'Protected', filters: { status: 'done' }
    });
    const { agent: agent2 } = makeUser2();
    await agent2.delete(`/api/filters/${f.body.id}`).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. REVIEW ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user review isolation', () => {
  it('reviews only show own data', async () => {
    await agent().post('/api/reviews').send({
      week_start: today(), tasks_completed: 10, tasks_created: 5,
      top_accomplishments: ['Done'], reflection: 'Good', next_week_priorities: ['More'], rating: 4
    });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/reviews').expect(200);
    assert.equal(res.body.length, 0);
  });

  it('review current only counts own tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 3; i++) {
      const t = makeTask(g.id, { status: 'done' });
      db.prepare('UPDATE tasks SET completed_at=CURRENT_TIMESTAMP WHERE id=?').run(t.id);
    }
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/reviews/current').expect(200);
    assert.equal(res.body.tasksCompletedCount, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. TRIAGE CROSS-USER PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

describe('Triage cross-user protection', () => {
  it('cannot triage inbox item to other user goal', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { agent: agent2 } = makeUser2();
    const inbox = await agent2.post('/api/inbox').send({ title: 'Triage Attempt' });
    // User2 tries to triage to user1's goal
    await agent2.post(`/api/inbox/${inbox.body.id}/triage`).send({
      goal_id: g.id
    }).expect(403);
  });

  it('cannot create task in other user goal', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const { agent: agent2 } = makeUser2();
    await agent2.post(`/api/goals/${g.id}/tasks`).send({ title: 'Sneak' }).expect(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. MULTI-USER SETTINGS ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user settings isolation', () => {
  it('settings are per-user', async () => {
    await agent().put('/api/settings').send({ theme: 'ocean' });
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/settings').expect(200);
    assert.equal(res.body.theme, 'midnight'); // default, not user1's setting
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. BADGE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-user badge isolation', () => {
  it('badges are per-user', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    for (let i = 0; i < 10; i++) makeTask(g.id, { status: 'done' });
    await agent().post('/api/badges/check');
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/badges').expect(200);
    assert.equal(res.body.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 23. POSITION INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════

describe('Position ordering integrity', () => {
  it('reordered areas maintain positions', async () => {
    const a1 = makeArea({ name: 'First', position: 0 });
    const a2 = makeArea({ name: 'Second', position: 1 });
    const a3 = makeArea({ name: 'Third', position: 2 });
    await agent().put('/api/areas/reorder').send([
      { id: a3.id, position: 0 },
      { id: a1.id, position: 1 },
      { id: a2.id, position: 2 }
    ]).expect(200);
    const res = await agent().get('/api/areas').expect(200);
    assert.equal(res.body[0].id, a3.id);
  });

  it('reordered tasks maintain positions', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t1 = makeTask(g.id, { title: 'T1' });
    const t2 = makeTask(g.id, { title: 'T2' });
    const t3 = makeTask(g.id, { title: 'T3' });
    await agent().put('/api/tasks/reorder').send({
      items: [
        { id: t3.id, position: 0 },
        { id: t1.id, position: 1 },
        { id: t2.id, position: 2 }
      ]
    }).expect(200);
    const p3 = db.prepare('SELECT position FROM tasks WHERE id=?').get(t3.id).position;
    const p1 = db.prepare('SELECT position FROM tasks WHERE id=?').get(t1.id).position;
    assert.ok(p3 < p1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. UNAUTHENTICATED ACCESS REJECTION
// ═══════════════════════════════════════════════════════════════════════════

describe('Unauthenticated access rejection', () => {
  const { rawAgent } = require('./helpers');

  it('GET /api/tasks/all requires auth', async () => {
    await rawAgent().get('/api/tasks/all').expect(401);
  });

  it('GET /api/areas requires auth', async () => {
    await rawAgent().get('/api/areas').expect(401);
  });

  it('GET /api/stats requires auth', async () => {
    await rawAgent().get('/api/stats').expect(401);
  });

  it('GET /api/habits requires auth', async () => {
    await rawAgent().get('/api/habits').expect(401);
  });

  it('GET /api/settings requires auth', async () => {
    await rawAgent().get('/api/settings').expect(401);
  });

  it('GET /api/lists requires auth', async () => {
    await rawAgent().get('/api/lists').expect(401);
  });

  it('GET /api/webhooks requires auth', async () => {
    await rawAgent().get('/api/webhooks').expect(401);
  });

  it('GET /api/export requires auth', async () => {
    await rawAgent().get('/api/export').expect(401);
  });

  it('POST /api/focus requires auth', async () => {
    await rawAgent().post('/api/focus').send({ task_id: 1, duration_sec: 100 }).expect(401);
  });

  it('GET /api/inbox requires auth', async () => {
    await rawAgent().get('/api/inbox').expect(401);
  });
});
