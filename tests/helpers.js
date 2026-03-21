const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');
const path = require('path');
const request = require('supertest');

let _app, _db, _dir;

function setup() {
  if (!_app) {
    _dir = mkdtempSync(path.join(tmpdir(), 'lifeflow-test-'));
    process.env.DB_DIR = _dir;
    const server = require('../src/server');
    _app = server.app;
    _db = server.db;
  }
  return { app: _app, db: _db, dir: _dir };
}

function cleanDb() {
  const { db } = setup();
  db.exec('DELETE FROM focus_sessions');
  db.exec('DELETE FROM task_comments');
  db.exec('DELETE FROM goal_milestones');
  db.exec('DELETE FROM inbox');
  db.exec('DELETE FROM notes');
  db.exec('DELETE FROM weekly_reviews');
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_deps');
  db.exec('DELETE FROM subtasks');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM goals');
  db.exec('DELETE FROM life_areas');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM task_templates');
  db.exec('DELETE FROM settings');
  db.exec('DELETE FROM habit_logs');
  db.exec('DELETE FROM habits');
  db.exec('DELETE FROM saved_filters');
}

function teardown() {
  if (_db) { try { _db.close(); } catch {} }
  if (_dir) { try { rmSync(_dir, { recursive: true, force: true }); } catch {} }
}

function makeArea(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Area', icon: '🧪', color: '#FF0000', position: 0, ...overrides };
  const r = db.prepare('INSERT INTO life_areas (name,icon,color,position) VALUES (?,?,?,?)').run(o.name, o.icon, o.color, o.position);
  return db.prepare('SELECT * FROM life_areas WHERE id=?').get(r.lastInsertRowid);
}

function makeGoal(areaId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Goal', description: '', color: '#6C63FF', status: 'active', due_date: null, position: 0, ...overrides };
  const r = db.prepare('INSERT INTO goals (area_id,title,description,color,status,due_date,position) VALUES (?,?,?,?,?,?,?)').run(areaId, o.title, o.description, o.color, o.status, o.due_date, o.position);
  return db.prepare('SELECT * FROM goals WHERE id=?').get(r.lastInsertRowid);
}

function makeTask(goalId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Task', note: '', status: 'todo', priority: 0, due_date: null, recurring: null, assigned_to: '', my_day: 0, position: 0, ...overrides };
  const r = db.prepare('INSERT INTO tasks (goal_id,title,note,status,priority,due_date,recurring,assigned_to,my_day,position) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    goalId, o.title, o.note, o.status, o.priority, o.due_date, o.recurring, o.assigned_to, o.my_day, o.position
  );
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid);
}

function makeSubtask(taskId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Subtask', done: 0, position: 0, ...overrides };
  const r = db.prepare('INSERT INTO subtasks (task_id,title,done,position) VALUES (?,?,?,?)').run(taskId, o.title, o.done, o.position);
  return db.prepare('SELECT * FROM subtasks WHERE id=?').get(r.lastInsertRowid);
}

function makeTag(overrides = {}) {
  const { db } = setup();
  const o = { name: 'test-tag', color: '#64748B', ...overrides };
  const r = db.prepare('INSERT INTO tags (name,color) VALUES (?,?)').run(o.name, o.color);
  return db.prepare('SELECT * FROM tags WHERE id=?').get(r.lastInsertRowid);
}

function linkTag(taskId, tagId) {
  const { db } = setup();
  db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)').run(taskId, tagId);
}

function makeFocus(taskId, overrides = {}) {
  const { db } = setup();
  const o = { duration_sec: 1500, type: 'pomodoro', ...overrides };
  const r = db.prepare('INSERT INTO focus_sessions (task_id, duration_sec, type) VALUES (?,?,?)').run(taskId, o.duration_sec, o.type);
  return db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(r.lastInsertRowid);
}

function agent() {
  const { app } = setup();
  return request(app);
}

// Use UTC dates to match SQLite's date('now')
function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Match server's local-midnight-to-UTC date calculation (used by streak code)
function serverLocalDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

module.exports = { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeFocus, agent, today, daysFromNow, serverLocalDate };
