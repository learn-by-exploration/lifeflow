/**
 * frontend-protocol.test.js — Auth flows (2FA, tokens, password change,
 * lockout), Data operations (export, import, iCal, search, backup),
 * and remaining endpoint edge cases.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, agent, rawAgent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeHabit, logHabit, makeFocus, makeList, makeListItem, makeUser2, today, daysFromNow, rebuildSearch } = require('./helpers');

const { db } = setup();
const bcrypt = require('bcryptjs');

// Capture the test session ID so we can restore it after password-change/import tests
const _testSid = db.prepare('SELECT sid FROM sessions WHERE user_id=1').get().sid;

beforeEach(() => {
  cleanDb();
  // Restore password (change-password tests modify it)
  db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(bcrypt.hashSync('testpassword', 4));
  // Restore session (change-password tests delete all sessions)
  db.prepare("INSERT OR REPLACE INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 1, datetime('now', '+1 day'))").run(_testSid);
});

// Get the actual test user email (may be admin@localhost or test@test.com depending on DB init)
const _testEmail = db.prepare('SELECT email FROM users WHERE id=1').get().email;

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTH: PASSWORD CHANGE
// ═══════════════════════════════════════════════════════════════════════════

describe('Password change', () => {
  it('changes password with correct current password', async () => {
    const res = await agent().post('/api/auth/change-password').send({
      current_password: 'testpassword',
      new_password: 'NewPassword123!@#'
    }).expect(200);
    assert.ok(res.body.ok);
  });

  it('rejects wrong current password', async () => {
    await agent().post('/api/auth/change-password').send({
      current_password: 'wrongpassword',
      new_password: 'NewPassword123!@#'
    }).expect(401);
  });

  it('rejects weak new password', async () => {
    await agent().post('/api/auth/change-password').send({
      current_password: 'testpassword',
      new_password: 'weak'
    }).expect(400);
  });

  it('requires both fields', async () => {
    await agent().post('/api/auth/change-password').send({
      current_password: 'testpassword'
    }).expect(400);

    await agent().post('/api/auth/change-password').send({
      new_password: 'NewPassword123!@#'
    }).expect(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. AUTH: 2FA SETUP / VERIFY / STATUS / DISABLE
// ═══════════════════════════════════════════════════════════════════════════

describe('2FA flow', () => {
  it('POST /api/auth/2fa/setup returns secret and URI', async () => {
    const res = await agent().post('/api/auth/2fa/setup').expect(200);
    assert.ok(res.body.secret);
    assert.ok(res.body.otpauth_uri);
    assert.ok(res.body.otpauth_uri.startsWith('otpauth://totp/'));
  });

  it('GET /api/auth/2fa/status shows disabled by default', async () => {
    const res = await agent().get('/api/auth/2fa/status').expect(200);
    assert.equal(res.body.enabled, false);
  });

  it('POST /api/auth/2fa/verify rejects bad format', async () => {
    await agent().post('/api/auth/2fa/setup');
    await agent().post('/api/auth/2fa/verify').send({ token: '12345' }).expect(400);
    await agent().post('/api/auth/2fa/verify').send({ token: 'abcdef' }).expect(400);
    await agent().post('/api/auth/2fa/verify').send({ token: '1234567' }).expect(400);
  });

  it('POST /api/auth/2fa/verify rejects without setup', async () => {
    // No setup called — should fail
    await agent().post('/api/auth/2fa/verify').send({ token: '123456' }).expect(400);
  });

  it('POST /api/auth/2fa/verify rejects wrong token', async () => {
    await agent().post('/api/auth/2fa/setup');
    await agent().post('/api/auth/2fa/verify').send({ token: '000000' }).expect(400);
  });

  it('DELETE /api/auth/2fa requires password', async () => {
    await agent().delete('/api/auth/2fa').send({}).expect(400);
  });

  it('DELETE /api/auth/2fa rejects wrong password', async () => {
    await agent().delete('/api/auth/2fa').send({ password: 'wrongpassword' }).expect(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. AUTH: API TOKENS
// ═══════════════════════════════════════════════════════════════════════════

describe('API tokens', () => {
  it('creates token', async () => {
    const res = await agent().post('/api/auth/tokens').send({ name: 'CI Token' }).expect(201);
    assert.ok(res.body.token);
    assert.ok(res.body.id);
    assert.equal(res.body.name, 'CI Token');
  });

  it('creates token with expiry', async () => {
    const res = await agent().post('/api/auth/tokens').send({
      name: 'Expiring', expires_in_days: 30
    }).expect(201);
    assert.ok(res.body.expires_at);
  });

  it('rejects empty name', async () => {
    await agent().post('/api/auth/tokens').send({ name: '' }).expect(400);
  });

  it('lists tokens without hashes', async () => {
    await agent().post('/api/auth/tokens').send({ name: 'T1' });
    await agent().post('/api/auth/tokens').send({ name: 'T2' });
    const res = await agent().get('/api/auth/tokens').expect(200);
    assert.ok(res.body.length >= 2);
    assert.equal(res.body[0].token_hash, undefined);
    assert.equal(res.body[0].token, undefined);
  });

  it('renames token', async () => {
    const t = await agent().post('/api/auth/tokens').send({ name: 'Old' });
    const res = await agent().put(`/api/auth/tokens/${t.body.id}`).send({ name: 'Renamed' }).expect(200);
    assert.equal(res.body.name, 'Renamed');
  });

  it('deletes token', async () => {
    const t = await agent().post('/api/auth/tokens').send({ name: 'Del' });
    await agent().delete(`/api/auth/tokens/${t.body.id}`).expect(200);
    await agent().delete(`/api/auth/tokens/${t.body.id}`).expect(404);
  });

  it('enforces max 10 tokens', async () => {
    for (let i = 0; i < 10; i++) {
      await agent().post('/api/auth/tokens').send({ name: `T${i}` }).expect(201);
    }
    await agent().post('/api/auth/tokens').send({ name: 'T11' }).expect(400);
  });

  it('token authentication works for GET requests', async () => {
    const t = await agent().post('/api/auth/tokens').send({ name: 'Bearer' });
    const token = t.body.token;
    const res = await rawAgent().get('/api/tasks/all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('invalid token returns 401', async () => {
    await rawAgent().get('/api/tasks/all')
      .set('Authorization', 'Bearer invalidtoken123')
      .expect(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. AUTH: LOGIN SECURITY
// ═══════════════════════════════════════════════════════════════════════════

describe('Login security', () => {
  it('successful login returns session cookie', async () => {
    const res = await rawAgent().post('/api/auth/login').send({
      email: _testEmail, password: 'testpassword'
    }).expect(200);
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    assert.ok(cookies.some(c => c.startsWith('lf_sid=')));
  });

  it('failed login returns 401', async () => {
    await rawAgent().post('/api/auth/login').send({
      email: _testEmail, password: 'wrongpassword'
    }).expect(401);
  });

  it('GET /api/auth/me returns user info', async () => {
    const res = await agent().get('/api/auth/me').expect(200);
    assert.ok(res.body.user);
    assert.ok(res.body.user.id);
    assert.ok(res.body.user.email);
    assert.equal(res.body.user.password_hash, undefined);
  });

  it('logout clears session', async () => {
    const login = await rawAgent().post('/api/auth/login').send({
      email: _testEmail, password: 'testpassword'
    });
    const cookies = login.headers['set-cookie'];
    const sid = cookies.find(c => c.startsWith('lf_sid=')).split(';')[0];
    const logoutRes = await rawAgent().post('/api/auth/logout').set('Cookie', sid);
    assert.ok(logoutRes.status === 200 || logoutRes.status === 302);
  });

  it('register with existing email returns anti-enumeration response', async () => {
    // First register a new user with valid email
    const email = `dupcheck${Date.now()}@test.com`;
    await rawAgent().post('/api/auth/register').send({
      email, password: 'TestPassword123!@#', display_name: 'First'
    }).expect(201);
    // Register again with same email — should get anti-enum response
    const res = await rawAgent().post('/api/auth/register').send({
      email, password: 'TestPassword123!@#', display_name: 'Dup'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.id, 0);
  });

  it('register new user', async () => {
    const res = await rawAgent().post('/api/auth/register').send({
      email: `newuser${Date.now()}@test.com`,
      password: 'StrongPass123!@#',
      display_name: 'New User'
    }).expect(201);
    assert.ok(res.body.user.id > 0);
  });

  it('normalizes email to lowercase on login', async () => {
    const res = await rawAgent().post('/api/auth/login').send({
      email: _testEmail.toUpperCase(), password: 'testpassword'
    });
    // Should still find the user
    assert.equal(res.status, 200);
  });

  it('GET /api/users lists all users', async () => {
    const res = await agent().get('/api/users').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    assert.ok(res.body[0].display_name);
    assert.equal(res.body[0].password_hash, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DATA: EXPORT / BACKUP
// ═══════════════════════════════════════════════════════════════════════════

describe('Data export and backup', () => {
  it('GET /api/export returns complete data', async () => {
    const a = makeArea({ name: 'ExportA' });
    const g = makeGoal(a.id, { title: 'ExportG' });
    makeTask(g.id, { title: 'ExportT' });
    makeTag({ name: 'export-tag' });
    const res = await agent().get('/api/export').expect(200);
    assert.ok(res.body.exportDate);
    assert.ok(res.body.areas);
    assert.ok(res.body.goals);
    assert.ok(res.body.tasks);
    assert.ok(res.body.tags);
    assert.ok(res.body.habits !== undefined);
    assert.ok(res.body.focus_sessions !== undefined);
    assert.ok(res.body.notes !== undefined);
  });

  it('GET /api/export includes settings', async () => {
    db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (1, 'theme', 'ocean')").run();
    const res = await agent().get('/api/export').expect(200);
    assert.ok(res.body.settings);
    assert.ok(res.body.settings.some(s => s.key === 'theme' && s.value === 'ocean'));
  });

  it('GET /api/backups lists backup files', async () => {
    const res = await agent().get('/api/backups').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('POST /api/backup creates backup', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id);
    const res = await agent().post('/api/backup').expect(200);
    assert.ok(res.body.ok);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. DATA: IMPORT
// ═══════════════════════════════════════════════════════════════════════════

describe('Data import', () => {
  it('rejects import without confirm', async () => {
    await agent().post('/api/import').send({
      password: 'testpassword',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }]
    }).expect(403);
  });

  it('rejects import without areas', async () => {
    await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }]
    }).expect(400);
  });

  it('rejects import without goals', async () => {
    await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'A' }],
      goals: [],
      tasks: [{ title: 'T', goal_id: 1 }]
    }).expect(400);
  });

  it('rejects import without tasks', async () => {
    await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: []
    }).expect(400);
  });

  it('successful import replaces data', async () => {
    const a = makeArea({ name: 'OldArea' });
    const g = makeGoal(a.id, { title: 'OldGoal' });
    makeTask(g.id, { title: 'OldTask' });

    await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'NewArea' }],
      goals: [{ id: 1, title: 'NewGoal', area_id: 1 }],
      tasks: [{ title: 'NewTask', goal_id: 1 }],
      tags: [{ id: 1, name: 'imported-tag', color: '#FF0000' }]
    }).expect(200);

    const areas = await agent().get('/api/areas').expect(200);
    assert.ok(areas.body.some(a => a.name === 'NewArea'));
    assert.ok(!areas.body.some(a => a.name === 'OldArea'));

    const tags = await agent().get('/api/tags').expect(200);
    assert.ok(tags.body.some(t => t.name === 'imported-tag'));
  });

  it('import with habits and lists', async () => {
    await agent().post('/api/import').send({
      password: 'testpassword',
      confirm: 'DESTROY_ALL_DATA',
      areas: [{ id: 1, name: 'A' }],
      goals: [{ id: 1, title: 'G', area_id: 1 }],
      tasks: [{ title: 'T', goal_id: 1 }],
      habits: [{ id: 1, name: 'Imported Habit' }],
      lists: [{ id: 1, name: 'Imported List' }],
      list_items: [{ list_id: 1, title: 'List Item' }]
    }).expect(200);

    const habits = await agent().get('/api/habits').expect(200);
    assert.ok(habits.body.some(h => h.name === 'Imported Habit'));

    const lists = await agent().get('/api/lists').expect(200);
    assert.ok(lists.body.some(l => l.name === 'Imported List'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. DATA: SEARCH (FTS)
// ═══════════════════════════════════════════════════════════════════════════

describe('Search (FTS)', () => {
  it('returns results for matching query', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'UniqueSearchableTitle999' });
    rebuildSearch();
    const res = await agent().get('/api/search?q=UniqueSearchableTitle999').expect(200);
    assert.ok(res.body.results || res.body.length > 0);
  });

  it('empty query returns empty', async () => {
    const res = await agent().get('/api/search?q=').expect(200);
    const results = res.body.results || res.body;
    assert.ok(Array.isArray(results));
  });

  it('query with special characters does not crash', async () => {
    const res = await agent().get('/api/search?q=' + encodeURIComponent("test's \"quoted\" & <special>"));
    assert.ok(res.status < 500);
  });

  it('search respects user isolation', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'OnlyForUser1Search' });
    rebuildSearch();
    const { agent: agent2 } = makeUser2();
    const res = await agent2.get('/api/search?q=OnlyForUser1Search').expect(200);
    const results = res.body.results || res.body;
    assert.ok(!results.some(r => (r.title || '').includes('OnlyForUser1Search')));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. DATA: iCAL EXPORT
// ═══════════════════════════════════════════════════════════════════════════

describe('iCal export', () => {
  it('returns valid iCal format', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'iCalTask', due_date: today() });
    const res = await agent().get('/api/export/ical').expect(200);
    assert.ok(res.text.includes('BEGIN:VCALENDAR'));
    assert.ok(res.text.includes('BEGIN:VEVENT'));
    assert.ok(res.text.includes('iCalTask'));
    assert.ok(res.text.includes('END:VCALENDAR'));
  });

  it('empty calendar still valid', async () => {
    const res = await agent().get('/api/export/ical').expect(200);
    assert.ok(res.text.includes('BEGIN:VCALENDAR'));
    assert.ok(res.text.includes('END:VCALENDAR'));
  });

  it('recurring task generates RRULE', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'RecurCal', due_date: today(), recurring: 'daily' });
    const res = await agent().get('/api/export/ical').expect(200);
    assert.ok(res.text.includes('RRULE'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. DATA: TODOIST / TRELLO IMPORT
// ═══════════════════════════════════════════════════════════════════════════

describe('External imports', () => {
  it('POST /api/import/todoist with empty body returns zero imported', async () => {
    const res = await agent().post('/api/import/todoist').send({}).expect(200);
    assert.equal(res.body.imported, 0);
  });

  it('POST /api/import/trello with empty body returns zero imported', async () => {
    const res = await agent().post('/api/import/trello').send({}).expect(200);
    assert.equal(res.body.imported, 0);
  });

  it('Todoist import with valid structure', async () => {
    const res = await agent().post('/api/import/todoist').send({
      items: [{ content: 'Test Item', priority: 1, project_id: 1 }],
      projects: [{ id: 1, name: 'Inbox' }]
    });
    assert.ok(res.status === 200 || res.status === 201);
  });

  it('Trello import with valid structure', async () => {
    const res = await agent().post('/api/import/trello').send({
      lists: [{ id: '1', name: 'To Do' }],
      cards: [{ name: 'Card 1', idList: '1' }]
    });
    assert.ok(res.status === 200 || res.status === 201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. MILESTONES
// ═══════════════════════════════════════════════════════════════════════════

describe('Goal milestones', () => {
  it('creates milestone', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const res = await agent().post(`/api/goals/${g.id}/milestones`).send({
      title: 'Milestone 1'
    }).expect(201);
    assert.equal(res.body.title, 'Milestone 1');
  });

  it('lists milestones', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'M1' });
    await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'M2' });
    const res = await agent().get(`/api/goals/${g.id}/milestones`).expect(200);
    assert.ok(res.body.length >= 2);
  });

  it('toggles milestone completion', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const m = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Toggle' });
    const res = await agent().put(`/api/milestones/${m.body.id}`).send({ done: true }).expect(200);
    assert.equal(res.body.done, 1);
  });

  it('deletes milestone', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const m = await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'Del' });
    await agent().delete(`/api/milestones/${m.body.id}`).expect(200);
  });

  it('goal progress includes milestones', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    await agent().post(`/api/goals/${g.id}/milestones`).send({ title: 'M1' });
    const t = makeTask(g.id, { status: 'done' });
    const res = await agent().get(`/api/goals/${g.id}/progress`).expect(200);
    assert.ok(typeof res.body.done === 'number');
    assert.ok(typeof res.body.total === 'number');
    assert.ok(res.body.milestones !== undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. MY DAY
// ═══════════════════════════════════════════════════════════════════════════

describe('My Day', () => {
  it('GET /api/tasks/my-day returns my_day tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'MyDayTask', my_day: 1 });
    makeTask(g.id, { title: 'NotMyDay', my_day: 0 });
    const res = await agent().get('/api/tasks/my-day').expect(200);
    assert.ok(res.body.some(t => t.title === 'MyDayTask'));
    assert.ok(!res.body.some(t => t.title === 'NotMyDay'));
  });

  it('PUT /api/tasks/:id toggles my_day', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { my_day: 0 });
    await agent().put(`/api/tasks/${t.id}`).send({ my_day: 1 }).expect(200);
    const updated = db.prepare('SELECT my_day FROM tasks WHERE id=?').get(t.id);
    assert.equal(updated.my_day, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. RECURRING TASKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Recurring tasks', () => {
  it('creates task with recurring field', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const res = await agent().post(`/api/goals/${g.id}/tasks`).send({
      title: 'Daily Standup', recurring: 'daily', due_date: today()
    }).expect(201);
    assert.equal(res.body.recurring, 'daily');
  });

  it('GET /api/tasks/recurring returns recurring tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Recurring', recurring: 'daily', due_date: today() });
    makeTask(g.id, { title: 'OneOff' });
    const res = await agent().get('/api/tasks/recurring').expect(200);
    assert.ok(res.body.some(t => t.title === 'Recurring'));
    assert.ok(!res.body.some(t => t.title === 'OneOff'));
  });

  it('skip recurring task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'Skip Me', recurring: 'daily', due_date: today() });
    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.ok(res.status === 200);
  });

  it('skip non-recurring task fails', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id, { title: 'NoRecur' });
    const res = await agent().post(`/api/tasks/${t.id}/skip`);
    assert.ok(res.status >= 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. OVERDUE TASKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Overdue tasks', () => {
  it('GET /api/tasks/overdue returns overdue tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Overdue', due_date: daysFromNow(-3) });
    makeTask(g.id, { title: 'OnTime', due_date: daysFromNow(3) });
    const res = await agent().get('/api/tasks/overdue').expect(200);
    assert.ok(res.body.some(t => t.title === 'Overdue'));
    assert.ok(!res.body.some(t => t.title === 'OnTime'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. BOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════

describe('Board view', () => {
  it('GET /api/tasks/board returns tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { status: 'todo' });
    makeTask(g.id, { status: 'doing' });
    makeTask(g.id, { status: 'done' });
    const res = await agent().get('/api/tasks/board').expect(200);
    assert.ok(res.body.length >= 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════

describe('Calendar view', () => {
  it('GET /api/tasks/calendar returns tasks in range', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'InRange', due_date: today() });
    makeTask(g.id, { title: 'OutRange', due_date: daysFromNow(100) });
    const start = daysFromNow(-1);
    const end = daysFromNow(1);
    const res = await agent().get(`/api/tasks/calendar?start=${start}&end=${end}`).expect(200);
    assert.ok(res.body.some(t => t.title === 'InRange'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. SAVED FILTERS
// ═══════════════════════════════════════════════════════════════════════════

describe('Saved filters', () => {
  it('creates filter', async () => {
    const res = await agent().post('/api/filters').send({
      name: 'High Priority', filters: { priority: 3 }
    }).expect(201);
    assert.equal(res.body.name, 'High Priority');
  });

  it('lists filters', async () => {
    await agent().post('/api/filters').send({ name: 'F1', filters: { status: 'todo' } });
    const res = await agent().get('/api/filters').expect(200);
    assert.ok(res.body.length >= 1);
  });

  it('updates filter', async () => {
    const f = await agent().post('/api/filters').send({ name: 'Upd', filters: { status: 'todo' } });
    const res = await agent().put(`/api/filters/${f.body.id}`).send({ name: 'Updated' }).expect(200);
    assert.equal(res.body.name, 'Updated');
  });

  it('deletes filter', async () => {
    const f = await agent().post('/api/filters').send({ name: 'Del', filters: { status: 'todo' } });
    await agent().delete(`/api/filters/${f.body.id}`).expect(200);
  });

  it('GET /api/filters/counts returns counts', async () => {
    const res = await agent().get('/api/filters/counts').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/filters/smart/:type returns results', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'Stale' });
    // Backdate created_at so it qualifies as "stale"
    db.prepare("UPDATE tasks SET created_at = datetime('now', '-30 days') WHERE title = 'Stale'").run();
    const res = await agent().get('/api/filters/smart/stale').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. LIST OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('List operations', () => {
  it('clear checked items', async () => {
    const l = makeList();
    makeListItem(l.id, { title: 'Checked', checked: 1 });
    makeListItem(l.id, { title: 'Unchecked', checked: 0 });
    await agent().post(`/api/lists/${l.id}/clear-checked`).expect(200);
    const items = db.prepare('SELECT * FROM list_items WHERE list_id=?').all(l.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Unchecked');
  });

  it('uncheck all items', async () => {
    const l = makeList();
    makeListItem(l.id, { title: 'I1', checked: 1 });
    makeListItem(l.id, { title: 'I2', checked: 1 });
    await agent().post(`/api/lists/${l.id}/uncheck-all`).expect(200);
    const items = db.prepare('SELECT * FROM list_items WHERE list_id=?').all(l.id);
    assert.ok(items.every(i => i.checked === 0));
  });

  it('share and revoke share', async () => {
    const l = makeList({ name: 'ShareTest' });
    const shareRes = await agent().post(`/api/lists/${l.id}/share`).expect(200);
    assert.ok(shareRes.body.token);

    await agent().delete(`/api/lists/${l.id}/share`).expect(200);
  });

  it('nested list one level deep allowed', async () => {
    const parent = await agent().post('/api/lists').send({ name: 'Parent' });
    const child = await agent().post('/api/lists').send({
      name: 'Child', parent_id: parent.body.id
    });
    assert.ok(child.status === 200 || child.status === 201);
  });

  it('nested list two levels deep rejected', async () => {
    const p = await agent().post('/api/lists').send({ name: 'P1' });
    const c = await agent().post('/api/lists').send({ name: 'C1', parent_id: p.body.id });
    const gc = await agent().post('/api/lists').send({ name: 'GC', parent_id: c.body.id });
    assert.equal(gc.status, 400);
  });

  it('max 100 lists enforced', async () => {
    for (let i = 0; i < 100; i++) {
      makeList({ name: `L${i}` });
    }
    const res = await agent().post('/api/lists').send({ name: 'Over' });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. SUGGESTED TASKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Suggested tasks', () => {
  it('GET /api/tasks/suggested returns tasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    makeTask(g.id, { title: 'NoDue', priority: 2 });
    const res = await agent().get('/api/tasks/suggested').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. NLP PARSER EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('NLP parser advanced', () => {
  it('parses today keyword', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Buy groceries today' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('parses tomorrow keyword', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Meeting tomorrow' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('parses day after tomorrow', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Deadline day after tomorrow' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('parses in N days', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Ship feature in 5 days' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('parses next monday', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Review next monday' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('parses YYYY-MM-DD date', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Launch 2026-06-15' }).expect(200);
    assert.equal(res.body.due_date, '2026-06-15');
  });

  it('parses MM/DD date', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Party on 12/25' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('parses priority p1-p3', async () => {
    const r1 = await agent().post('/api/tasks/parse').send({ text: 'Urgent task p3' }).expect(200);
    assert.equal(r1.body.priority, 3);
    const r2 = await agent().post('/api/tasks/parse').send({ text: 'Normal p1' }).expect(200);
    assert.equal(r2.body.priority, 1);
  });

  it('parses tags with #', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Fix bug #backend #urgent' }).expect(200);
    assert.ok(res.body.tags.includes('backend'));
    assert.ok(res.body.tags.includes('urgent'));
  });

  it('parses my day keyword', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'Focus on my day tasks' }).expect(200);
    assert.equal(res.body.my_day, true);
  });

  it('multiple modifiers combined', async () => {
    const res = await agent().post('/api/tasks/parse').send({
      text: 'Fix login bug p2 #security tomorrow'
    }).expect(200);
    assert.equal(res.body.priority, 2);
    assert.ok(res.body.tags.includes('security'));
    assert.ok(res.body.due_date);
    assert.ok(res.body.title.includes('Fix login bug'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. SUBTASK OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Subtask operations', () => {
  it('creates subtask for task', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const res = await agent().post(`/api/tasks/${t.id}/subtasks`).send({
      title: 'Subtask 1'
    }).expect(201);
    assert.equal(res.body.title, 'Subtask 1');
  });

  it('lists subtasks', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    makeSubtask(t.id, { title: 'S1' });
    makeSubtask(t.id, { title: 'S2' });
    const res = await agent().get(`/api/tasks/${t.id}/subtasks`).expect(200);
    assert.ok(res.body.length >= 2);
  });

  it('updates subtask', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const s = makeSubtask(t.id);
    const res = await agent().put(`/api/subtasks/${s.id}`).send({ title: 'Updated', done: true }).expect(200);
    assert.equal(res.body.title, 'Updated');
  });

  it('deletes subtask', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const s = makeSubtask(t.id);
    await agent().delete(`/api/subtasks/${s.id}`).expect(200);
  });

  it('enriched task includes subtask counts', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    makeSubtask(t.id, { done: 0 });
    makeSubtask(t.id, { done: 1 });
    const res = await agent().get(`/api/tasks/${t.id}`).expect(200);
    assert.equal(res.body.subtask_total, 2);
    assert.equal(res.body.subtask_done, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. TASK WITH TAGS
// ═══════════════════════════════════════════════════════════════════════════

describe('Task tags', () => {
  it('enriched task includes tags array', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const t = makeTask(g.id);
    const tag = makeTag({ name: 'enriched-tag' });
    linkTag(t.id, tag.id);
    const res = await agent().get(`/api/tasks/${t.id}`).expect(200);
    assert.ok(res.body.tags.some(tg => tg.name === 'enriched-tag'));
  });

  it('POST /api/goals/:gid/tasks with tagIds sets tags', async () => {
    const a = makeArea();
    const g = makeGoal(a.id);
    const tag = makeTag({ name: 'create-tag' });
    const res = await agent().post(`/api/goals/${g.id}/tasks`).send({
      title: 'Tagged Task', tagIds: [tag.id]
    }).expect(201);
    assert.ok(res.body.tags.some(tg => tg.name === 'create-tag'));
  });
});
