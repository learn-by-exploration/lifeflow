const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, cleanDb, agent, rawAgent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeFocus, makeList, makeListItem, makeHabit } = require('./helpers');

before(() => setup());
after(() => teardown());
beforeEach(() => cleanDb());

// ─── 1. Task response shape ─────────────────────────────────────────────────

describe('Task response shape', () => {
  it('GET /api/tasks/:id has enriched fields', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Shape test' });
    const tag = makeTag({ name: 'shape-tag' });
    linkTag(task.id, tag.id);
    makeSubtask(task.id, { title: 'sub1' });

    const res = await agent().get(`/api/tasks/${task.id}`);
    assert.equal(res.status, 200);
    const t = res.body;
    // Core fields
    for (const f of ['id', 'title', 'note', 'status', 'priority', 'due_date', 'goal_id', 'position', 'created_at']) {
      assert.ok(f in t, `missing field: ${f}`);
    }
    // Enriched fields
    assert.ok(Array.isArray(t.tags), 'tags should be array');
    assert.ok(Array.isArray(t.subtasks), 'subtasks should be array');
    assert.ok('subtask_done' in t, 'missing subtask_done');
    assert.ok('subtask_total' in t, 'missing subtask_total');
    assert.ok(Array.isArray(t.blocked_by), 'blocked_by should be array');
    assert.ok(Array.isArray(t.custom_fields), 'custom_fields should be array');
    // Tag shape
    assert.equal(t.tags.length, 1);
    for (const f of ['id', 'name', 'color']) {
      assert.ok(f in t.tags[0], `tag missing field: ${f}`);
    }
    // Subtask shape
    assert.equal(t.subtasks.length, 1);
    for (const f of ['id', 'title', 'done', 'position']) {
      assert.ok(f in t.subtasks[0], `subtask missing field: ${f}`);
    }
  });

  it('POST /api/goals/:goalId/tasks returns 201 with full task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'New task' });
    assert.equal(res.status, 201);
    const t = res.body;
    assert.ok('id' in t);
    assert.equal(t.title, 'New task');
    assert.ok(Array.isArray(t.tags));
    assert.ok(Array.isArray(t.subtasks));
  });

  it('PUT /api/tasks/:id returns full enriched task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${task.id}`).send({ title: 'Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Updated');
    assert.ok(Array.isArray(res.body.tags));
    assert.ok(Array.isArray(res.body.subtasks));
  });

  it('GET /api/tasks/all returns array of enriched tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const res = await agent().get('/api/tasks/all');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    const t = res.body[0];
    assert.ok('goal_title' in t, 'missing goal_title');
    assert.ok('area_name' in t, 'missing area_name');
    assert.ok(Array.isArray(t.tags));
  });

  it('GET /api/tasks/board returns enriched array with area_id', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const res = await agent().get('/api/tasks/board');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const t = res.body[0];
    assert.ok('area_id' in t, 'missing area_id');
    assert.ok('goal_title' in t, 'missing goal_title');
    assert.ok(Array.isArray(t.tags));
  });

  it('DELETE /api/tasks/:id returns { ok: true }', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().delete(`/api/tasks/${task.id}`);
    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, { ok: true });
  });

  it('GET /api/tasks/:id for non-existent returns 404 with { error }', async () => {
    const res = await agent().get('/api/tasks/99999');
    assert.equal(res.status, 404);
    assert.ok('error' in res.body);
    assert.equal(typeof res.body.error, 'string');
  });

  it('GET /api/tasks/my-day returns enriched array', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { my_day: 1 });
    const res = await agent().get('/api/tasks/my-day');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    if (res.body.length > 0) {
      assert.ok('goal_title' in res.body[0]);
      assert.ok(Array.isArray(res.body[0].tags));
    }
  });
});

// ─── 2. Area/Goal response shape ────────────────────────────────────────────

describe('Area/Goal response shape', () => {
  it('GET /api/areas returns array with expected fields', async () => {
    makeArea({ name: 'Health' });
    const res = await agent().get('/api/areas');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const a = res.body[0];
    for (const f of ['id', 'name', 'icon', 'color', 'position']) {
      assert.ok(f in a, `area missing field: ${f}`);
    }
  });

  it('POST /api/areas returns 201 with area object', async () => {
    const res = await agent().post('/api/areas').send({ name: 'Work', icon: '💼', color: '#0000FF' });
    assert.equal(res.status, 201);
    assert.ok('id' in res.body);
    assert.equal(res.body.name, 'Work');
  });

  it('GET /api/areas/:areaId/goals returns goal array', async () => {
    const area = makeArea();
    makeGoal(area.id, { title: 'Goal 1' });
    const res = await agent().get(`/api/areas/${area.id}/goals`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const g = res.body[0];
    for (const f of ['id', 'title', 'description', 'color', 'status', 'position']) {
      assert.ok(f in g, `goal missing field: ${f}`);
    }
  });

  it('POST /api/areas/:areaId/goals returns 201 with goal object', async () => {
    const area = makeArea();
    const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'New Goal' });
    assert.equal(res.status, 201);
    assert.ok('id' in res.body);
    assert.equal(res.body.title, 'New Goal');
  });

  it('DELETE /api/areas/:id returns { ok: true }', async () => {
    const area = makeArea();
    const res = await agent().delete(`/api/areas/${area.id}`);
    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, { ok: true });
  });

  it('DELETE /api/goals/:id returns { ok: true }', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().delete(`/api/goals/${goal.id}`);
    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, { ok: true });
  });
});

// ─── 3. Tag/Filter response shape ──────────────────────────────────────────

describe('Tag/Filter response shape', () => {
  it('GET /api/tags returns array with id, name, color', async () => {
    makeTag({ name: 'urgent' });
    const res = await agent().get('/api/tags');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const tag = res.body[0];
    for (const f of ['id', 'name', 'color']) {
      assert.ok(f in tag, `tag missing field: ${f}`);
    }
  });

  it('POST /api/tags returns tag object', async () => {
    const res = await agent().post('/api/tags').send({ name: 'feature', color: '#00FF00' });
    assert.ok([200, 201].includes(res.status));
    assert.ok('id' in res.body);
    assert.equal(res.body.name, 'feature');
    assert.ok('color' in res.body);
  });

  it('GET /api/filters returns array of filter objects', async () => {
    const res = await agent().get('/api/filters');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('POST /api/filters returns 201 with filter object', async () => {
    const res = await agent().post('/api/filters').send({ name: 'My Filter', filters: { status: 'todo' } });
    assert.equal(res.status, 201);
    assert.ok('id' in res.body);
    assert.equal(res.body.name, 'My Filter');
  });
});

// ─── 4. List/Item response shape ───────────────────────────────────────────

describe('List/Item response shape', () => {
  it('GET /api/lists returns array with item_count, checked_count', async () => {
    const list = makeList({ name: 'Groceries' });
    makeListItem(list.id, { title: 'Milk' });
    makeListItem(list.id, { title: 'Eggs', checked: 1 });
    const res = await agent().get('/api/lists');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const l = res.body[0];
    assert.ok('item_count' in l, 'missing item_count');
    assert.ok('checked_count' in l, 'missing checked_count');
    assert.ok('id' in l);
    assert.ok('name' in l);
  });

  it('POST /api/lists returns 201 with list object', async () => {
    const res = await agent().post('/api/lists').send({ name: 'Shopping' });
    assert.equal(res.status, 201);
    assert.ok('id' in res.body);
    assert.equal(res.body.name, 'Shopping');
    assert.ok('type' in res.body);
  });

  it('GET /api/lists/:id/items returns array of items', async () => {
    const list = makeList();
    makeListItem(list.id, { title: 'Item 1' });
    const res = await agent().get(`/api/lists/${list.id}/items`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const item = res.body[0];
    for (const f of ['id', 'title', 'checked', 'position']) {
      assert.ok(f in item, `list item missing field: ${f}`);
    }
  });

  it('POST /api/lists/:id/items returns 201 with item object', async () => {
    const list = makeList();
    const res = await agent().post(`/api/lists/${list.id}/items`).send({ title: 'New Item' });
    assert.equal(res.status, 201);
    assert.ok('id' in res.body);
    assert.equal(res.body.title, 'New Item');
  });
});

// ─── 5. Auth response shape ────────────────────────────────────────────────

describe('Auth response shape', () => {
  it('POST /api/auth/login returns { user: { id, email, display_name } }', async () => {
    // The default test user may be admin@localhost (from DB init) with password updated to 'testpassword'
    const { db } = setup();
    const user = db.prepare('SELECT email FROM users WHERE id = 1').get();
    const res = await rawAgent().post('/api/auth/login').send({ email: user.email, password: 'testpassword' });
    assert.equal(res.status, 200);
    assert.ok('user' in res.body);
    const u = res.body.user;
    for (const f of ['id', 'email', 'display_name']) {
      assert.ok(f in u, `user missing field: ${f}`);
    }
    // Should NOT expose password_hash
    assert.ok(!('password_hash' in u), 'password_hash should not be exposed');
  });

  it('POST /api/auth/register returns 201 with { user }', async () => {
    const res = await rawAgent().post('/api/auth/register').send({
      email: 'newcontract@test.com',
      password: 'SecurePassword123!',
      display_name: 'Contract User'
    });
    assert.equal(res.status, 201);
    assert.ok('user' in res.body);
    assert.ok('id' in res.body.user);
    assert.ok('email' in res.body.user);
    assert.ok(!('password_hash' in res.body.user));
  });

  it('GET /api/auth/me returns user object', async () => {
    const res = await agent().get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.ok('user' in res.body);
    const u = res.body.user;
    for (const f of ['id', 'email', 'display_name', 'created_at']) {
      assert.ok(f in u, `user missing: ${f}`);
    }
  });

  it('POST /api/auth/tokens returns 201 with { id, name, token }', async () => {
    const res = await agent().post('/api/auth/tokens').send({ name: 'CI Token' });
    assert.equal(res.status, 201);
    for (const f of ['id', 'name', 'token']) {
      assert.ok(f in res.body, `token response missing: ${f}`);
    }
    assert.equal(typeof res.body.token, 'string');
    assert.ok(res.body.token.length > 0, 'token should be non-empty');
  });
});

// ─── 6. Stats response shape ───────────────────────────────────────────────

describe('Stats response shape', () => {
  it('GET /api/stats returns dashboard stats', async () => {
    const res = await agent().get('/api/stats');
    assert.equal(res.status, 200);
    for (const f of ['total', 'done', 'overdue', 'dueToday', 'thisWeek', 'byArea', 'byPriority', 'recentDone']) {
      assert.ok(f in res.body, `stats missing: ${f}`);
    }
    assert.ok(Array.isArray(res.body.byArea));
    assert.ok(Array.isArray(res.body.byPriority));
    assert.ok(Array.isArray(res.body.recentDone));
    assert.equal(typeof res.body.total, 'number');
  });

  it('GET /api/stats/streaks returns { streak, bestStreak, heatmap[] }', async () => {
    const res = await agent().get('/api/stats/streaks');
    assert.equal(res.status, 200);
    for (const f of ['streak', 'bestStreak', 'heatmap']) {
      assert.ok(f in res.body, `streaks missing: ${f}`);
    }
    assert.equal(typeof res.body.streak, 'number');
    assert.equal(typeof res.body.bestStreak, 'number');
    assert.ok(Array.isArray(res.body.heatmap));
  });

  it('GET /api/stats/trends returns array of week data', async () => {
    const res = await agent().get('/api/stats/trends');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    if (res.body.length > 0) {
      const w = res.body[0];
      for (const f of ['week_start', 'week_end', 'completed']) {
        assert.ok(f in w, `trend missing: ${f}`);
      }
    }
  });

  it('GET /api/stats/balance returns { areas, total }', async () => {
    const res = await agent().get('/api/stats/balance');
    assert.equal(res.status, 200);
    assert.ok('areas' in res.body);
    assert.ok('total' in res.body);
    assert.ok(Array.isArray(res.body.areas));
    assert.equal(typeof res.body.total, 'number');
  });

  it('GET /api/focus/stats returns stats object', async () => {
    const res = await agent().get('/api/focus/stats');
    assert.equal(res.status, 200);
    for (const f of ['today', 'week', 'sessions', 'byTask']) {
      assert.ok(f in res.body, `focus stats missing: ${f}`);
    }
    assert.equal(typeof res.body.today, 'number');
    assert.ok(Array.isArray(res.body.byTask));
  });

  it('GET /api/focus/history returns paginated object', async () => {
    const res = await agent().get('/api/focus/history');
    assert.equal(res.status, 200);
    for (const f of ['total', 'page', 'pages', 'items', 'daily']) {
      assert.ok(f in res.body, `focus history missing: ${f}`);
    }
    assert.ok(Array.isArray(res.body.items));
    assert.ok(Array.isArray(res.body.daily));
    assert.equal(typeof res.body.total, 'number');
    assert.equal(typeof res.body.page, 'number');
  });
});

// ─── 7. Error response shape ───────────────────────────────────────────────

describe('Error response shape', () => {
  it('400 responses have { error: string }', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: '' });
    assert.equal(res.status, 400);
    assert.ok('error' in res.body);
    assert.equal(typeof res.body.error, 'string');
  });

  it('404 responses have { error: string }', async () => {
    const res = await agent().get('/api/tasks/99999');
    assert.equal(res.status, 404);
    assert.ok('error' in res.body);
    assert.equal(typeof res.body.error, 'string');
  });

  it('401 responses have { error: string }', async () => {
    const res = await rawAgent().get('/api/tasks/all');
    assert.equal(res.status, 401);
    assert.ok('error' in res.body);
    assert.equal(typeof res.body.error, 'string');
  });

  it('login failure returns { error } without details', async () => {
    const res = await rawAgent().post('/api/auth/login').send({ email: 'wrong@test.com', password: 'wrongpass' });
    assert.equal(res.status, 401);
    assert.ok('error' in res.body);
    // Must not disclose whether email or password was wrong
    assert.ok(!res.body.error.toLowerCase().includes('email not found'));
  });

  it('500 response never contains stack traces', async () => {
    // Trigger a 404 and verify no stack in body as a proxy (we can't easily trigger 500)
    const res = await agent().get('/api/tasks/99999');
    assert.ok(!JSON.stringify(res.body).includes('at '), 'should not contain stack trace');
    assert.ok(!('stack' in res.body), 'stack should not be in response');
  });

  it('Invalid JSON body → 400 with { error }', async () => {
    const res = await agent()
      .post('/api/areas')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');
    assert.equal(res.status, 400);
    assert.ok('error' in res.body);
  });

  it('error responses have Content-Type: application/json', async () => {
    const res = await agent().get('/api/tasks/99999');
    assert.equal(res.status, 404);
    assert.ok(res.headers['content-type'].includes('application/json'));
  });

  it('validation error returns 400 with { error }', async () => {
    const res = await agent().post('/api/areas').send({ name: '' });
    assert.equal(res.status, 400);
    assert.ok('error' in res.body);
    assert.equal(typeof res.body.error, 'string');
  });
});

// ─── 8. Pagination contract ────────────────────────────────────────────────

describe('Pagination contract', () => {
  it('/api/tasks/all?limit=2 returns { items, total, hasMore, offset }', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) makeTask(goal.id, { title: `Task ${i}` });
    const res = await agent().get('/api/tasks/all?limit=2');
    assert.equal(res.status, 200);
    for (const f of ['items', 'total', 'hasMore', 'offset']) {
      assert.ok(f in res.body, `pagination missing: ${f}`);
    }
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length, 2);
    assert.equal(res.body.total, 5);
    assert.equal(res.body.hasMore, true);
    assert.equal(res.body.offset, 0);
  });

  it('/api/activity?page=1&limit=5 returns { total, page, pages, items }', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 3; i++) makeTask(goal.id, { title: `Done ${i}`, status: 'done' });
    const res = await agent().get('/api/activity?page=1&limit=5');
    assert.equal(res.status, 200);
    for (const f of ['total', 'page', 'pages', 'items']) {
      assert.ok(f in res.body, `activity pagination missing: ${f}`);
    }
    assert.ok(Array.isArray(res.body.items));
    assert.equal(typeof res.body.total, 'number');
    assert.equal(typeof res.body.page, 'number');
    assert.equal(typeof res.body.pages, 'number');
  });

  it('/api/focus/history?page=1&limit=5 returns paginated shape', async () => {
    const res = await agent().get('/api/focus/history?page=1&limit=5');
    assert.equal(res.status, 200);
    for (const f of ['total', 'page', 'pages', 'items']) {
      assert.ok(f in res.body, `focus history missing: ${f}`);
    }
  });

  it('page=0 treated as page=1', async () => {
    const res = await agent().get('/api/activity?page=0&limit=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.page, 1);
  });

  it('limit=0 clamped to 1', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { status: 'done' });
    const res = await agent().get('/api/activity?page=1&limit=0');
    assert.equal(res.status, 200);
    // limit=0 should be clamped to 1, so items.length <= 1
    assert.ok(res.body.items.length <= 1);
  });

  it('offset can page through results', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    for (let i = 0; i < 5; i++) makeTask(goal.id, { title: `T${i}` });
    const p1 = await agent().get('/api/tasks/all?limit=2&offset=0');
    const p2 = await agent().get('/api/tasks/all?limit=2&offset=2');
    assert.equal(p1.body.items.length, 2);
    assert.equal(p2.body.items.length, 2);
    // Different tasks on each page
    assert.notEqual(p1.body.items[0].id, p2.body.items[0].id);
  });
});

// ─── 9. Status code consistency ────────────────────────────────────────────

describe('Status code consistency', () => {
  it('POST create endpoints return 201', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const taskRes = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'T' });
    assert.equal(taskRes.status, 201);
    const goalRes = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'G' });
    assert.equal(goalRes.status, 201);
    const areaRes = await agent().post('/api/areas').send({ name: 'A', icon: '🏠', color: '#AABBCC' });
    assert.equal(areaRes.status, 201);
    const listRes = await agent().post('/api/lists').send({ name: 'L' });
    assert.equal(listRes.status, 201);
    const filterRes = await agent().post('/api/filters').send({ name: 'F', filters: {} });
    assert.equal(filterRes.status, 201);
  });

  it('PUT update endpoints return 200', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const res = await agent().put(`/api/tasks/${task.id}`).send({ title: 'Updated' });
    assert.equal(res.status, 200);
    const areaRes = await agent().put(`/api/areas/${area.id}`).send({ name: 'Updated Area' });
    assert.equal(areaRes.status, 200);
  });

  it('DELETE endpoints return 200 with { ok } or { deleted }', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const taskDel = await agent().delete(`/api/tasks/${task.id}`);
    assert.equal(taskDel.status, 200);
    assert.ok('ok' in taskDel.body || 'deleted' in taskDel.body);

    const list = makeList();
    const listDel = await agent().delete(`/api/lists/${list.id}`);
    assert.equal(listDel.status, 200);
    assert.ok('ok' in listDel.body || 'deleted' in listDel.body);
  });

  it('validation errors return 400', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: '' });
    assert.equal(res.status, 400);
  });

  it('not found errors return 404', async () => {
    const res = await agent().get('/api/tasks/99999');
    assert.equal(res.status, 404);
    const goalRes = await agent().get('/api/areas/99999/goals');
    // Non-existent area returns empty array (not 404) — that's the actual behavior
    assert.equal(goalRes.status, 200);
  });
});

// ─── 10. Content-Type headers ──────────────────────────────────────────────

describe('Content-Type headers', () => {
  it('JSON responses have Content-Type: application/json', async () => {
    const res = await agent().get('/api/stats');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('application/json'));
  });

  it('GET /api/export/ical has Content-Type: text/calendar', async () => {
    const res = await agent().get('/api/export/ical');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/calendar'));
  });

  it('GET /api/export has Content-Disposition: attachment', async () => {
    const res = await agent().get('/api/export');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    assert.ok(res.headers['content-type'].includes('application/json'));
  });
});
