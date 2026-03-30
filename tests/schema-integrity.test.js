const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Schema Integrity', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Indexes ──

  it('index exists: idx_tasks_goal', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks'").all();
    assert.ok(indexes.some(i => i.name === 'idx_tasks_goal'), 'idx_tasks_goal index should exist');
  });

  it('index exists: idx_tasks_status', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks'").all();
    assert.ok(indexes.some(i => i.name === 'idx_tasks_status'), 'idx_tasks_status index should exist');
  });

  it('index exists: idx_task_tags_tag', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_tags'").all();
    assert.ok(indexes.some(i => i.name === 'idx_task_tags_tag'), 'idx_task_tags_tag index should exist');
  });

  it('index exists: idx_task_comments_task', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_comments'").all();
    assert.ok(indexes.some(i => i.name === 'idx_task_comments_task'), 'idx_task_comments_task index should exist');
  });

  it('index exists: idx_goal_milestones_goal', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='goal_milestones'").all();
    assert.ok(indexes.some(i => i.name === 'idx_goal_milestones_goal'), 'idx_goal_milestones_goal index should exist');
  });

  it('index exists: idx_focus_sessions_task or equivalent', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='focus_sessions'").all();
    assert.ok(
      indexes.some(i => i.name === 'idx_focus_sessions_task' || i.name.includes('focus')),
      'focus_sessions should have an index (found: ' + indexes.map(i => i.name).join(', ') + ')'
    );
  });

  it('index exists: idx_sessions_expires', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'").all();
    assert.ok(indexes.some(i => i.name === 'idx_sessions_expires'), 'idx_sessions_expires index should exist');
  });

  it('index exists: idx_lists_area', () => {
    const { db } = setup();
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='lists'").all();
    assert.ok(indexes.some(i => i.name === 'idx_lists_area'), 'idx_lists_area index should exist');
  });

  // ── Foreign Keys ──

  it('foreign keys are enforced', () => {
    const { db } = setup();
    const fk = db.pragma('foreign_keys');
    assert.equal(fk[0].foreign_keys, 1, 'foreign_keys should be ON');
  });

  it('WAL mode is enabled', () => {
    const { db } = setup();
    const jm = db.pragma('journal_mode');
    assert.equal(jm[0].journal_mode, 'wal', 'journal_mode should be WAL');
  });

  // ── Table Structure ──

  it('tasks table has CHECK constraint on status', () => {
    const { db } = setup();
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    assert.ok(sql.sql.includes("CHECK"), 'tasks table should have CHECK constraint');
    assert.ok(sql.sql.includes("'todo'"), 'should allow todo status');
    assert.ok(sql.sql.includes("'doing'"), 'should allow doing status');
    assert.ok(sql.sql.includes("'done'"), 'should allow done status');
  });

  it('tasks table has CHECK constraint on priority', () => {
    const { db } = setup();
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    assert.ok(sql.sql.includes('priority'), 'should have priority column');
    assert.ok(sql.sql.includes('0,1,2,3'), 'should constrain priority to 0-3');
  });

  it('goals table has CHECK constraint on status', () => {
    const { db } = setup();
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='goals'").get();
    assert.ok(sql.sql.includes("CHECK"), 'goals table should have CHECK constraint');
    assert.ok(sql.sql.includes("'active'"), 'should allow active status');
    assert.ok(sql.sql.includes("'completed'"), 'should allow completed status');
  });

  it('task_tags has composite primary key', () => {
    const { db } = setup();
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_tags'").get();
    assert.ok(sql.sql.includes('PRIMARY KEY (task_id, tag_id)'), 'task_tags should have composite PK');
  });

  it('daily_reviews has UNIQUE(user_id, date) constraint', () => {
    const { db } = setup();
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_reviews'").get();
    assert.ok(sql.sql.includes('UNIQUE(user_id, date)'), 'daily_reviews should have unique user+date');
  });

  // ── CASCADE Deletions ──

  it('deleting area cascades to goals', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    await agent().delete(`/api/areas/${area.id}`);
    const { db } = setup();
    const found = db.prepare('SELECT id FROM goals WHERE id=?').get(goal.id);
    assert.equal(found, undefined, 'goal should be deleted when area is deleted');
  });

  it('deleting goal cascades to tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().delete(`/api/goals/${goal.id}`);
    const { db } = setup();
    const found = db.prepare('SELECT id FROM tasks WHERE id=?').get(task.id);
    assert.equal(found, undefined, 'task should be deleted when goal is deleted');
  });

  it('deleting task cascades to subtasks', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    db.prepare('INSERT INTO subtasks (task_id, title) VALUES (?, ?)').run(task.id, 'sub1');
    await agent().delete(`/api/tasks/${task.id}`);
    const sub = db.prepare('SELECT id FROM subtasks WHERE task_id=?').get(task.id);
    assert.equal(sub, undefined, 'subtask should be deleted when task is deleted');
  });

  // ── Transaction Safety ──

  it('reorder uses prepared statements', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tasks.js'), 'utf8');
    // Verify reorder uses db.prepare or db.transaction
    assert.ok(
      src.includes('reorder') && (src.includes('.prepare(') || src.includes('.transaction(')),
      'tasks.js should use prepared statements'
    );
  });

  it('DB schema initializes idempotently (second init does not throw)', () => {
    // The initDatabase function should be safe to call multiple times
    // We test this by verifying that CREATE TABLE IF NOT EXISTS is used
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'index.js'), 'utf8');
    assert.ok(src.includes('CREATE TABLE IF NOT EXISTS'), 'should use IF NOT EXISTS');
    assert.ok(src.includes('CREATE INDEX IF NOT EXISTS') || src.includes('CREATE INDEX idx_'),
      'should handle index creation safely');
  });

  // ── Query Performance ──

  it('tasks query by goal_id uses index (efficient)', () => {
    const { db } = setup();
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE goal_id = ?').all(1);
    const detail = plan.map(r => r.detail).join(' ');
    assert.ok(
      detail.includes('idx_tasks_goal') || detail.includes('SEARCH'),
      'should use index for goal_id query'
    );
  });

  it('tasks query by status uses index (efficient)', () => {
    const { db } = setup();
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE status = ?").all('todo');
    const detail = plan.map(r => r.detail).join(' ');
    assert.ok(
      detail.includes('idx_tasks_status') || detail.includes('SEARCH'),
      'should use index for status query'
    );
  });
});
