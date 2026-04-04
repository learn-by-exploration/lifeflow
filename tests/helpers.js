const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');
const path = require('path');
const request = require('supertest');
const crypto = require('crypto');

let _app, _db, _dir, _testSessionId, _testUserId;

function setup() {
  if (!_app) {
    process.env.NODE_ENV = 'test';
    _dir = mkdtempSync(path.join(tmpdir(), 'lifeflow-test-'));
    process.env.DB_DIR = _dir;
    const server = require('../src/server');
    _app = server.app;
    _db = server.db;
    // Create a default test user + session for auth
    _ensureTestAuth();
  }
  return { app: _app, db: _db, dir: _dir };
}

function _ensureTestAuth() {
  _testUserId = 1; // The default auto-created user
  const bcrypt = require('bcryptjs');
  const user = _db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!user) {
    const hash = bcrypt.hashSync('testpassword', 4); // low rounds for speed in tests
    _db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
      'test@test.com', hash, 'Test User'
    );
  } else {
    // Ensure password is 'testpassword' (DB init may have set 'changeme')
    const hash = bcrypt.hashSync('testpassword', 4);
    _db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(hash);
  }
  // Create a long-lived test session
  _testSessionId = 'test-session-' + crypto.randomUUID();
  _db.prepare(
    "INSERT OR REPLACE INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
  ).run(_testSessionId, _testUserId);
}

function cleanDb() {
  const { db } = setup();
  db.exec('DELETE FROM focus_steps');
  db.exec('DELETE FROM focus_session_meta');
  db.exec('DELETE FROM focus_sessions');
  db.exec('DELETE FROM task_comments');
  db.exec('DELETE FROM goal_milestones');
  db.exec('DELETE FROM inbox');
  db.exec('DELETE FROM notes');
  db.exec('DELETE FROM weekly_reviews');
  db.exec('DELETE FROM automation_rules');
  db.exec('DELETE FROM task_custom_values');
  db.exec('DELETE FROM custom_field_defs');
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
  db.exec('DELETE FROM list_items');
  db.exec('DELETE FROM lists');
  try { db.exec('DELETE FROM badges'); } catch(e) {}
  try { db.exec('DELETE FROM api_tokens'); } catch(e) {}
  try { db.exec('DELETE FROM push_subscriptions'); } catch(e) {}
  try { db.exec('DELETE FROM push_notification_log'); } catch(e) {}
  try { db.exec('DELETE FROM webhooks'); } catch(e) {}
  try { db.exec('DELETE FROM daily_reviews'); } catch(e) {}
  try { db.exec('DELETE FROM login_attempts'); } catch(e) {}
  try { db.exec('DELETE FROM search_index'); } catch(e) {}
}

function teardown() {
  if (_db) { try { _db.close(); } catch {} }
  if (_dir) { try { rmSync(_dir, { recursive: true, force: true }); } catch {} }
}

function makeArea(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Area', icon: '🧪', color: '#FF0000', position: 0, user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO life_areas (name,icon,color,position,user_id) VALUES (?,?,?,?,?)').run(o.name, o.icon, o.color, o.position, o.user_id);
  return db.prepare('SELECT * FROM life_areas WHERE id=?').get(r.lastInsertRowid);
}

function makeGoal(areaId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Goal', description: '', color: '#6C63FF', status: 'active', due_date: null, position: 0, user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO goals (area_id,title,description,color,status,due_date,position,user_id) VALUES (?,?,?,?,?,?,?,?)').run(areaId, o.title, o.description, o.color, o.status, o.due_date, o.position, o.user_id);
  return db.prepare('SELECT * FROM goals WHERE id=?').get(r.lastInsertRowid);
}

function makeTask(goalId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Task', note: '', status: 'todo', priority: 0, due_date: null, recurring: null, assigned_to: '', my_day: 0, position: 0, list_id: null, user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO tasks (goal_id,title,note,status,priority,due_date,recurring,assigned_to,my_day,position,list_id,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
    goalId, o.title, o.note, o.status, o.priority, o.due_date, o.recurring, o.assigned_to, o.my_day, o.position, o.list_id, o.user_id
  );
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid);
}

function makeSubtask(taskId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Subtask', done: 0, position: 0, note: '', ...overrides };
  const r = db.prepare('INSERT INTO subtasks (task_id,title,done,position,note) VALUES (?,?,?,?,?)').run(taskId, o.title, o.done, o.position, o.note);
  return db.prepare('SELECT * FROM subtasks WHERE id=?').get(r.lastInsertRowid);
}

function makeTag(overrides = {}) {
  const { db } = setup();
  const o = { name: 'test-tag', color: '#64748B', user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO tags (name,color,user_id) VALUES (?,?,?)').run(o.name, o.color, o.user_id);
  return db.prepare('SELECT * FROM tags WHERE id=?').get(r.lastInsertRowid);
}

function linkTag(taskId, tagId) {
  const { db } = setup();
  db.prepare('INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)').run(taskId, tagId);
}

function makeFocus(taskId, overrides = {}) {
  const { db } = setup();
  const o = { duration_sec: 1500, type: 'pomodoro', scheduled_at: null, user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO focus_sessions (task_id, duration_sec, type, scheduled_at, user_id) VALUES (?,?,?,?,?)').run(taskId, o.duration_sec, o.type, o.scheduled_at, o.user_id);
  return db.prepare('SELECT * FROM focus_sessions WHERE id=?').get(r.lastInsertRowid);
}

function makeList(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test List', type: 'checklist', icon: '📋', color: '#2563EB', area_id: null, position: 0, parent_id: null, user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO lists (name,type,icon,color,area_id,position,parent_id,user_id) VALUES (?,?,?,?,?,?,?,?)').run(o.name, o.type, o.icon, o.color, o.area_id, o.position, o.parent_id, o.user_id);
  return db.prepare('SELECT * FROM lists WHERE id=?').get(r.lastInsertRowid);
}

function makeListItem(listId, overrides = {}) {
  const { db } = setup();
  const o = { title: 'Test Item', checked: 0, category: null, quantity: null, note: null, position: 0, ...overrides };
  const r = db.prepare('INSERT INTO list_items (list_id,title,checked,category,quantity,note,position) VALUES (?,?,?,?,?,?,?)').run(listId, o.title, o.checked, o.category, o.quantity, o.note, o.position);
  return db.prepare('SELECT * FROM list_items WHERE id=?').get(r.lastInsertRowid);
}

function makeHabit(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Habit', icon: '💪', color: '#22C55E', frequency: 'daily', target: 1, position: 0, area_id: null, user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO habits (name,icon,color,frequency,target,position,area_id,user_id) VALUES (?,?,?,?,?,?,?,?)').run(o.name, o.icon, o.color, o.frequency, o.target, o.position, o.area_id, o.user_id);
  return db.prepare('SELECT * FROM habits WHERE id=?').get(r.lastInsertRowid);
}

function logHabit(habitId, date) {
  const { db } = setup();
  db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id, date, count) VALUES (?,?,1)').run(habitId, date);
}

function agent() {
  const { app } = setup();
  const base = request(app);
  // Return a proxy that auto-adds auth cookie to every HTTP method call
  return new Proxy(base, {
    get(target, prop) {
      if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(prop)) {
        return (...args) => target[prop](...args).set('Cookie', `lf_sid=${_testSessionId}`);
      }
      return target[prop];
    }
  });
}

// Unauthenticated agent for testing 401 responses
function rawAgent() {
  const { app } = setup();
  return request(app);
}

// ─── Multi-user helpers ────────────────────────────────────────────────────────

let _user2Counter = 0;

/**
 * Create a second (or Nth) user with a separate session.
 * Returns { userId, agent } where agent auto-attaches the new user's session.
 */
function makeUser2(overrides = {}) {
  const { db } = setup();
  const bcrypt = require('bcryptjs');
  _user2Counter++;
  const email = overrides.email || `user${_user2Counter + 1}@test.com`;
  const hash = bcrypt.hashSync(overrides.password || 'testpassword', 4);
  const displayName = overrides.display_name || `Test User ${_user2Counter + 1}`;
  const r = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)')
    .run(email, hash, displayName);
  const userId = r.lastInsertRowid;
  const sid = `test-u${_user2Counter + 1}-session-${crypto.randomUUID()}`;
  db.prepare(
    "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
  ).run(sid, userId);
  return { userId, agent: agentAs(sid) };
}

/**
 * Create an authenticated supertest agent for a given session id.
 */
function agentAs(sessionId) {
  const { app } = setup();
  const base = request(app);
  return new Proxy(base, {
    get(target, prop) {
      if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(prop)) {
        return (...args) => target[prop](...args).set('Cookie', `lf_sid=${sessionId}`);
      }
      return target[prop];
    }
  });
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

function rebuildSearch() {
  setup();
  const server = require('../src/server');
  if (server.rebuildSearchIndex) server.rebuildSearchIndex();
}

module.exports = { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeFocus, makeList, makeListItem, makeHabit, logHabit, agent, rawAgent, makeUser2, agentAs, today, daysFromNow, serverLocalDate, rebuildSearch };
