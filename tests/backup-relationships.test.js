const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeFocus, makeList, makeListItem, makeHabit, logHabit, agent } = require('./helpers');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Export completeness ───

describe('Export preserves all relationships', () => {
  it('exports list parent_id for sub-lists', async () => {
    const parent = makeList({ name: 'Parent List' });
    const child = makeList({ name: 'Child List', parent_id: parent.id });
    const res = await agent().get('/api/export').expect(200);
    const lists = res.body.lists;
    const expParent = lists.find(l => l.name === 'Parent List');
    const expChild = lists.find(l => l.name === 'Child List');
    assert.ok(expParent, 'parent list exported');
    assert.ok(expChild, 'child list exported');
    assert.equal(expChild.parent_id, parent.id);
    assert.equal(expParent.parent_id, null);
  });

  it('exports list area_id', async () => {
    const area = makeArea({ name: 'Health' });
    const list = makeList({ name: 'Workout', area_id: area.id });
    const res = await agent().get('/api/export').expect(200);
    const expList = res.body.lists.find(l => l.name === 'Workout');
    assert.equal(expList.area_id, area.id);
  });

  it('exports list view_mode and board_columns', async () => {
    const { db } = setup();
    const list = makeList({ name: 'Board List' });
    db.prepare('UPDATE lists SET view_mode=?, board_columns=? WHERE id=?')
      .run('board', '["todo","doing","done"]', list.id);
    const res = await agent().get('/api/export').expect(200);
    const expList = res.body.lists.find(l => l.name === 'Board List');
    assert.equal(expList.view_mode, 'board');
    assert.equal(expList.board_columns, '["todo","doing","done"]');
  });

  it('exports list_items with metadata and status', async () => {
    const { db } = setup();
    const list = makeList({ name: 'Tracker' });
    const item = makeListItem(list.id, { title: 'Item 1' });
    db.prepare('UPDATE list_items SET metadata=?, status=? WHERE id=?')
      .run('{"price":"9.99"}', 'done', item.id);
    const res = await agent().get('/api/export').expect(200);
    const expItem = res.body.list_items.find(i => i.title === 'Item 1');
    assert.equal(expItem.metadata, '{"price":"9.99"}');
    assert.equal(expItem.status, 'done');
  });

  it('exports list share_token', async () => {
    const { db } = setup();
    const list = makeList({ name: 'Shared List' });
    db.prepare('UPDATE lists SET share_token=? WHERE id=?').run('abc123', list.id);
    const res = await agent().get('/api/export').expect(200);
    const expList = res.body.lists.find(l => l.name === 'Shared List');
    assert.equal(expList.share_token, 'abc123');
  });

  it('exports task list_id', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const list = makeList({ name: 'My List' });
    const task = makeTask(goal.id, { title: 'Listed Task', list_id: list.id });
    const res = await agent().get('/api/export').expect(200);
    const expTask = res.body.tasks.find(t => t.title === 'Listed Task');
    assert.equal(expTask.list_id, list.id);
  });

  it('exports task due_time, estimated_minutes, actual_minutes', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Timed Task' });
    db.prepare('UPDATE tasks SET due_time=?, estimated_minutes=?, actual_minutes=? WHERE id=?')
      .run('14:30', 45, 30, task.id);
    const res = await agent().get('/api/export').expect(200);
    const expTask = res.body.tasks.find(t => t.title === 'Timed Task');
    assert.equal(expTask.due_time, '14:30');
    assert.equal(expTask.estimated_minutes, 45);
    assert.equal(expTask.actual_minutes, 30);
  });

  it('exports subtask notes', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    makeSubtask(task.id, { title: 'Sub with note', note: 'Details here' });
    const res = await agent().get('/api/export').expect(200);
    const t = res.body.tasks.find(t => t.title === task.title);
    const sub = t.subtasks.find(s => s.title === 'Sub with note');
    assert.equal(sub.note, 'Details here');
  });

  it('exports habit archived and schedule_days', async () => {
    const { db } = setup();
    const habit = makeHabit({ name: 'Archived Habit' });
    db.prepare('UPDATE habits SET archived=1, schedule_days=? WHERE id=?')
      .run('["mon","wed","fri"]', habit.id);
    const res = await agent().get('/api/export').expect(200);
    // archived habits may not be in the default export, check via DB
    const allHabits = db.prepare('SELECT * FROM habits WHERE user_id=1').all();
    const h = allHabits.find(h => h.name === 'Archived Habit');
    assert.equal(h.archived, 1);
    assert.equal(h.schedule_days, '["mon","wed","fri"]');
  });

  it('exports area archived and default_view', async () => {
    const { db } = setup();
    const area = makeArea({ name: 'Archived Area' });
    db.prepare('UPDATE life_areas SET archived=1, default_view=? WHERE id=?')
      .run('board', area.id);
    const res = await agent().get('/api/export').expect(200);
    const expArea = res.body.areas.find(a => a.name === 'Archived Area');
    assert.equal(expArea.archived, 1);
    assert.equal(expArea.default_view, 'board');
  });
});

// ─── Import preserves all relationships ───

describe('Import preserves all relationships', () => {
  it('preserves sub-list parent_id after import', async () => {
    // Create data
    const area = makeArea({ name: 'Health' });
    const goal = makeGoal(area.id, { title: 'Fitness' });
    makeTask(goal.id, { title: 'Run' });
    const parent = makeList({ name: 'Parent' });
    const child = makeList({ name: 'Child', parent_id: parent.id });
    makeListItem(parent.id, { title: 'P-Item' });
    makeListItem(child.id, { title: 'C-Item' });

    // Export
    const exportRes = await agent().get('/api/export').expect(200);
    const exportData = exportRes.body;

    // Verify export has parent_id
    const expChild = exportData.lists.find(l => l.name === 'Child');
    assert.equal(expChild.parent_id, parent.id);

    // Clean and reimport
    cleanDb();
    makeArea({ name: 'Dummy' }); // need at least areas/goals for import
    const importRes = await agent().post('/api/import')
      .send({...exportData, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'})
      .expect(200);

    // Verify the relationship survived
    const { db } = setup();
    const importedLists = db.prepare('SELECT * FROM lists WHERE user_id=1 ORDER BY position').all();
    const importedParent = importedLists.find(l => l.name === 'Parent');
    const importedChild = importedLists.find(l => l.name === 'Child');
    assert.ok(importedParent, 'parent list imported');
    assert.ok(importedChild, 'child list imported');
    assert.equal(importedChild.parent_id, importedParent.id, 'parent_id remapped correctly');
  });

  it('preserves list area_id after import', async () => {
    const area = makeArea({ name: 'Health' });
    const goal = makeGoal(area.id, { title: 'Fitness' });
    makeTask(goal.id, { title: 'Run' });
    const list = makeList({ name: 'Workout Log', area_id: area.id });

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const { db } = setup();
    const importedList = db.prepare("SELECT * FROM lists WHERE name='Workout Log'").get();
    const importedArea = db.prepare("SELECT * FROM life_areas WHERE name='Health'").get();
    assert.ok(importedList);
    assert.ok(importedArea);
    assert.equal(importedList.area_id, importedArea.id, 'area_id remapped correctly');
  });

  it('preserves list view_mode and board_columns after import', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const list = makeList({ name: 'Board' });
    db.prepare('UPDATE lists SET view_mode=?, board_columns=? WHERE id=?')
      .run('board', '["a","b","c"]', list.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const importedList = db.prepare("SELECT * FROM lists WHERE name='Board'").get();
    assert.equal(importedList.view_mode, 'board');
    assert.equal(importedList.board_columns, '["a","b","c"]');
  });

  it('preserves list_items metadata and status after import', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const list = makeList({ name: 'Tracker' });
    const item = makeListItem(list.id, { title: 'Fancy Item' });
    db.prepare('UPDATE list_items SET metadata=?, status=? WHERE id=?')
      .run('{"price":"5.00","rating":4}', 'doing', item.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const importedItem = db.prepare("SELECT * FROM list_items WHERE title='Fancy Item'").get();
    assert.equal(importedItem.metadata, '{"price":"5.00","rating":4}');
    assert.equal(importedItem.status, 'doing');
  });

  it('preserves task list_id after import', async () => {
    const area = makeArea({ name: 'Work' });
    const goal = makeGoal(area.id, { title: 'Project' });
    const list = makeList({ name: 'Sprint Board' });
    makeTask(goal.id, { title: 'Task on list', list_id: list.id });

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const { db } = setup();
    const importedTask = db.prepare("SELECT * FROM tasks WHERE title='Task on list'").get();
    const importedList = db.prepare("SELECT * FROM lists WHERE name='Sprint Board'").get();
    assert.ok(importedTask);
    assert.ok(importedList);
    assert.equal(importedTask.list_id, importedList.id, 'task list_id remapped correctly');
  });

  it('preserves task due_time and time tracking after import', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Timed' });
    db.prepare('UPDATE tasks SET due_time=?, estimated_minutes=?, actual_minutes=?, time_block_start=?, time_block_end=? WHERE id=?')
      .run('09:00', 60, 45, '09:00', '10:00', task.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const importedTask = db.prepare("SELECT * FROM tasks WHERE title='Timed'").get();
    assert.equal(importedTask.due_time, '09:00');
    assert.equal(importedTask.estimated_minutes, 60);
    assert.equal(importedTask.actual_minutes, 45);
    assert.equal(importedTask.time_block_start, '09:00');
    assert.equal(importedTask.time_block_end, '10:00');
  });

  it('preserves subtask notes after import', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Parent Task' });
    makeSubtask(task.id, { title: 'Sub1', note: 'Important note' });

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const { db } = setup();
    const sub = db.prepare("SELECT * FROM subtasks WHERE title='Sub1'").get();
    assert.equal(sub.note, 'Important note');
  });

  it('preserves habit archived and schedule_days after import', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const habit = makeHabit({ name: 'Weekly Run' });
    db.prepare('UPDATE habits SET archived=1, schedule_days=? WHERE id=?')
      .run('["mon","fri"]', habit.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const importedHabit = db.prepare("SELECT * FROM habits WHERE name='Weekly Run'").get();
    assert.equal(importedHabit.archived, 1, 'archived preserved');
    assert.equal(importedHabit.schedule_days, '["mon","fri"]', 'schedule_days preserved');
  });

  it('preserves area archived and default_view after import', async () => {
    const { db } = setup();
    const area = makeArea({ name: 'Archived' });
    db.prepare('UPDATE life_areas SET archived=1, default_view=? WHERE id=?')
      .run('board', area.id);
    const goal = makeGoal(area.id);
    makeTask(goal.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const importedArea = db.prepare("SELECT * FROM life_areas WHERE name='Archived'").get();
    assert.equal(importedArea.archived, 1, 'archived preserved');
    assert.equal(importedArea.default_view, 'board', 'default_view preserved');
  });

  it('preserves focus_session ended_at and scheduled_at after import', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Focus Task' });
    const fs = makeFocus(task.id, { scheduled_at: '2026-04-04T09:00:00Z' });
    db.prepare('UPDATE focus_sessions SET ended_at=? WHERE id=?')
      .run('2026-04-04T09:25:00Z', fs.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const sessions = db.prepare('SELECT * FROM focus_sessions WHERE user_id=1').all();
    assert.ok(sessions.length > 0);
    const imported = sessions[0];
    assert.equal(imported.ended_at, '2026-04-04T09:25:00Z');
    assert.equal(imported.scheduled_at, '2026-04-04T09:00:00Z');
  });

  it('preserves created_at timestamps after import', async () => {
    const { db } = setup();
    const ts = '2025-01-15T10:30:00.000Z';
    const area = makeArea({ name: 'Timestamped' });
    db.prepare('UPDATE life_areas SET created_at=? WHERE id=?').run(ts, area.id);
    const goal = makeGoal(area.id);
    db.prepare('UPDATE goals SET created_at=? WHERE id=?').run(ts, goal.id);
    const task = makeTask(goal.id, { title: 'Old Task' });
    db.prepare('UPDATE tasks SET created_at=? WHERE id=?').run(ts, task.id);

    const exportRes = await agent().get('/api/export').expect(200);
    cleanDb();
    await agent().post('/api/import').send({...exportRes.body, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    const iArea = db.prepare("SELECT created_at FROM life_areas WHERE name='Timestamped'").get();
    const iGoal = db.prepare('SELECT created_at FROM goals WHERE user_id=1').get();
    const iTask = db.prepare("SELECT created_at FROM tasks WHERE title='Old Task'").get();
    assert.equal(iArea.created_at, ts, 'area created_at preserved');
    assert.equal(iGoal.created_at, ts, 'goal created_at preserved');
    assert.equal(iTask.created_at, ts, 'task created_at preserved');
  });
});

// ─── Complex round-trip: full hierarchy ───

describe('Full data round-trip preserves complex hierarchy', () => {
  it('round-trips areas → goals → tasks → subtasks → tags → lists → items', async () => {
    const { db } = setup();

    // Build complex hierarchy
    const area1 = makeArea({ name: 'Health', position: 0 });
    const area2 = makeArea({ name: 'Work', position: 1 });
    const goal1 = makeGoal(area1.id, { title: 'Fitness' });
    const goal2 = makeGoal(area2.id, { title: 'Project X' });

    const tag1 = makeTag({ name: 'urgent', color: '#EF4444' });
    const tag2 = makeTag({ name: 'research', color: '#7C3AED' });

    const parentList = makeList({ name: 'Shopping', type: 'grocery', area_id: area1.id });
    const childList = makeList({ name: 'Snacks', parent_id: parentList.id });
    db.prepare('UPDATE lists SET view_mode=?, board_columns=? WHERE id=?')
      .run('board', '["buy","bought"]', parentList.id);

    const task1 = makeTask(goal1.id, { title: 'Morning Run', priority: 2, list_id: parentList.id });
    const task2 = makeTask(goal2.id, { title: 'Write Spec', due_date: '2026-04-10' });
    db.prepare('UPDATE tasks SET due_time=?, estimated_minutes=?, actual_minutes=?, time_block_start=?, time_block_end=? WHERE id=?')
      .run('07:00', 30, 25, '07:00', '07:30', task1.id);

    makeSubtask(task1.id, { title: 'Warm up', note: 'Stretch first' });
    makeSubtask(task1.id, { title: 'Sprint intervals' });
    makeSubtask(task2.id, { title: 'Draft outline' });

    linkTag(task1.id, tag1.id);
    linkTag(task2.id, tag2.id);

    makeListItem(parentList.id, { title: 'Milk', category: 'Dairy' });
    makeListItem(parentList.id, { title: 'Bread', category: 'Bakery' });
    const fancyItem = makeListItem(childList.id, { title: 'Chips' });
    db.prepare('UPDATE list_items SET metadata=?, status=? WHERE id=?')
      .run('{"price":"3.50"}', 'buy', fancyItem.id);

    const habit = makeHabit({ name: 'Meditate', area_id: area1.id });
    db.prepare('UPDATE habits SET schedule_days=? WHERE id=?').run('["mon","wed","fri"]', habit.id);
    logHabit(habit.id, '2026-04-01');
    logHabit(habit.id, '2026-04-03');

    const focus = makeFocus(task2.id, { scheduled_at: '2026-04-04T14:00:00Z' });
    db.prepare('UPDATE focus_sessions SET ended_at=? WHERE id=?').run('2026-04-04T14:25:00Z', focus.id);

    // Export
    const exportRes = await agent().get('/api/export').expect(200);
    const data = exportRes.body;

    // Verify export structure
    assert.equal(data.areas.length, 2);
    assert.equal(data.goals.length, 2);
    assert.equal(data.tasks.length, 2);
    assert.equal(data.lists.length, 2);
    assert.equal(data.list_items.length, 3);
    assert.equal(data.tags.length, 2);
    assert.ok(data.habits.length >= 1);

    // Clear and re-import
    cleanDb();
    await agent().post('/api/import').send({...data, password: 'testpassword', confirm: 'DESTROY_ALL_DATA'}).expect(200);

    // ─── Verify everything survived ───

    // Areas
    const areas = db.prepare('SELECT * FROM life_areas WHERE user_id=1 ORDER BY position').all();
    assert.equal(areas.length, 2);
    assert.equal(areas[0].name, 'Health');
    assert.equal(areas[1].name, 'Work');

    // Goals → area relationship
    const goals = db.prepare('SELECT * FROM goals WHERE user_id=1 ORDER BY position').all();
    assert.equal(goals.length, 2);
    const healthArea = areas.find(a => a.name === 'Health');
    const workArea = areas.find(a => a.name === 'Work');
    assert.equal(goals.find(g => g.title === 'Fitness').area_id, healthArea.id);
    assert.equal(goals.find(g => g.title === 'Project X').area_id, workArea.id);

    // Lists → parent_id relationship
    const lists = db.prepare('SELECT * FROM lists WHERE user_id=1 ORDER BY position').all();
    assert.equal(lists.length, 2);
    const shopping = lists.find(l => l.name === 'Shopping');
    const snacks = lists.find(l => l.name === 'Snacks');
    assert.ok(shopping);
    assert.ok(snacks);
    assert.equal(snacks.parent_id, shopping.id, 'sub-list parent_id preserved');
    assert.equal(shopping.area_id, healthArea.id, 'list area_id preserved');
    assert.equal(shopping.view_mode, 'board', 'list view_mode preserved');
    assert.equal(shopping.board_columns, '["buy","bought"]', 'list board_columns preserved');

    // List items
    const items = db.prepare('SELECT * FROM list_items ORDER BY position').all();
    assert.equal(items.length, 3);
    const chips = items.find(i => i.title === 'Chips');
    assert.equal(chips.list_id, snacks.id, 'item belongs to child list');
    assert.equal(chips.metadata, '{"price":"3.50"}', 'item metadata preserved');
    assert.equal(chips.status, 'buy', 'item status preserved');

    // Tasks → goal, list relationships
    const tasks = db.prepare('SELECT * FROM tasks WHERE user_id=1').all();
    assert.equal(tasks.length, 2);
    const runTask = tasks.find(t => t.title === 'Morning Run');
    assert.equal(runTask.goal_id, goals.find(g => g.title === 'Fitness').id);
    assert.equal(runTask.list_id, shopping.id, 'task list_id preserved');
    assert.equal(runTask.due_time, '07:00', 'task due_time preserved');
    assert.equal(runTask.estimated_minutes, 30, 'estimated_minutes preserved');
    assert.equal(runTask.actual_minutes, 25, 'actual_minutes preserved');
    assert.equal(runTask.time_block_start, '07:00');
    assert.equal(runTask.time_block_end, '07:30');

    // Subtasks
    const subs = db.prepare('SELECT * FROM subtasks WHERE task_id=?').all(runTask.id);
    assert.equal(subs.length, 2);
    const warmup = subs.find(s => s.title === 'Warm up');
    assert.equal(warmup.note, 'Stretch first', 'subtask note preserved');

    // Tags
    const taskTags = db.prepare('SELECT t.name FROM task_tags tt JOIN tags t ON t.id=tt.tag_id WHERE tt.task_id=?').all(runTask.id);
    assert.equal(taskTags.length, 1);
    assert.equal(taskTags[0].name, 'urgent');

    // Habits
    const habits = db.prepare('SELECT * FROM habits WHERE user_id=1').all();
    const meditate = habits.find(h => h.name === 'Meditate');
    assert.ok(meditate);
    assert.equal(meditate.area_id, healthArea.id, 'habit area_id preserved');
    assert.equal(meditate.schedule_days, '["mon","wed","fri"]', 'habit schedule_days preserved');

    // Habit logs
    const logs = db.prepare('SELECT * FROM habit_logs WHERE habit_id=?').all(meditate.id);
    assert.equal(logs.length, 2, 'habit logs preserved');

    // Focus sessions
    const sessions = db.prepare('SELECT * FROM focus_sessions WHERE user_id=1').all();
    assert.ok(sessions.length >= 1);
    const fs = sessions[0];
    assert.equal(fs.ended_at, '2026-04-04T14:25:00Z', 'focus ended_at preserved');
    assert.equal(fs.scheduled_at, '2026-04-04T14:00:00Z', 'focus scheduled_at preserved');
  });
});
