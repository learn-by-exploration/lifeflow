const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  setup, cleanDb, makeArea, makeGoal, makeTask, makeSubtask,
  makeTag, linkTag, makeFocus, makeList, makeListItem, makeHabit,
  agent, rawAgent, today, daysFromNow, makeUser2, agentAs
} = require('./helpers');

describe('Test helpers infrastructure', () => {
  beforeEach(() => cleanDb());

  // ── setup() ──────────────────────────────────────────────────────────────

  describe('setup()', () => {
    it('returns app, db, dir', () => {
      const result = setup();
      assert.ok(result.app, 'should return app');
      assert.ok(result.db, 'should return db');
      assert.ok(result.dir, 'should return dir');
    });

    it('is idempotent (calling twice returns same instance)', () => {
      const first = setup();
      const second = setup();
      assert.strictEqual(first.app, second.app);
      assert.strictEqual(first.db, second.db);
      assert.strictEqual(first.dir, second.dir);
    });
  });

  // ── cleanDb() ────────────────────────────────────────────────────────────

  describe('cleanDb()', () => {
    it('empties data tables', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);
      makeTag();

      cleanDb();

      assert.equal(db.prepare('SELECT count(*) AS c FROM life_areas').get().c, 0);
      assert.equal(db.prepare('SELECT count(*) AS c FROM goals').get().c, 0);
      assert.equal(db.prepare('SELECT count(*) AS c FROM tasks').get().c, 0);
      assert.equal(db.prepare('SELECT count(*) AS c FROM tags').get().c, 0);
    });

    it('preserves users and sessions', () => {
      const { db } = setup();
      const usersBefore = db.prepare('SELECT count(*) AS c FROM users').get().c;
      const sessionsBefore = db.prepare('SELECT count(*) AS c FROM sessions').get().c;

      cleanDb();

      const usersAfter = db.prepare('SELECT count(*) AS c FROM users').get().c;
      const sessionsAfter = db.prepare('SELECT count(*) AS c FROM sessions').get().c;
      assert.ok(usersAfter >= 1, 'users table should have at least the test user');
      assert.equal(usersAfter, usersBefore, 'users count should be unchanged');
      assert.ok(sessionsAfter >= 1, 'sessions table should have at least one session');
      assert.equal(sessionsAfter, sessionsBefore, 'sessions count should be unchanged');
    });
  });

  // ── Factory functions ────────────────────────────────────────────────────

  describe('makeArea()', () => {
    it('returns area with valid id, name, color', () => {
      const area = makeArea();
      assert.ok(typeof area.id === 'number' && area.id > 0, 'id should be a positive number');
      assert.ok(area.name, 'name should be non-empty');
      assert.ok(area.color, 'color should be non-empty');
    });

    it('accepts overrides', () => {
      const area = makeArea({ name: 'Custom Area', color: '#00FF00' });
      assert.equal(area.name, 'Custom Area');
      assert.equal(area.color, '#00FF00');
    });
  });

  describe('makeGoal()', () => {
    it('associates with area', () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      assert.ok(goal.id > 0);
      assert.equal(goal.area_id, area.id);
    });
  });

  describe('makeTask()', () => {
    it('associates with goal', () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      assert.ok(task.id > 0);
      assert.equal(task.goal_id, goal.id);
    });
  });

  describe('makeSubtask()', () => {
    it('associates with task', () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id);
      assert.ok(sub.id > 0);
      assert.equal(sub.task_id, task.id);
    });
  });

  describe('makeTag()', () => {
    it('returns tag with id and name', () => {
      const tag = makeTag({ name: 'unique-tag-1' });
      assert.ok(tag.id > 0);
      assert.equal(tag.name, 'unique-tag-1');
    });
  });

  describe('linkTag()', () => {
    it('creates task_tags row', () => {
      const { db } = setup();
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const tag = makeTag({ name: 'link-tag-test' });

      linkTag(task.id, tag.id);

      const row = db.prepare('SELECT * FROM task_tags WHERE task_id=? AND tag_id=?').get(task.id, tag.id);
      assert.ok(row, 'task_tags row should exist');
    });
  });

  describe('makeFocus()', () => {
    it('creates focus session', () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const focus = makeFocus(task.id);
      assert.ok(focus.id > 0);
      assert.equal(focus.task_id, task.id);
    });
  });

  describe('makeList()', () => {
    it('creates list with defaults', () => {
      const list = makeList();
      assert.ok(list.id > 0);
      assert.equal(list.name, 'Test List');
    });
  });

  describe('makeListItem()', () => {
    it('creates item in list', () => {
      const list = makeList();
      const item = makeListItem(list.id);
      assert.ok(item.id > 0);
      assert.equal(item.list_id, list.id);
    });
  });

  describe('makeHabit()', () => {
    it('creates habit with defaults', () => {
      const habit = makeHabit();
      assert.ok(habit.id > 0);
      assert.equal(habit.name, 'Test Habit');
    });
  });

  // ── Agent helpers ────────────────────────────────────────────────────────

  describe('agent()', () => {
    it('returns authenticated supertest agent', async () => {
      // agent() should be able to hit an authenticated endpoint
      const res = await agent().get('/api/areas');
      assert.equal(res.status, 200);
    });
  });

  describe('rawAgent()', () => {
    it('returns unauthenticated supertest agent', async () => {
      const res = await rawAgent().get('/api/areas');
      assert.equal(res.status, 401);
    });
  });

  // ── Date helpers ─────────────────────────────────────────────────────────

  describe('today()', () => {
    it('returns YYYY-MM-DD format', () => {
      const d = today();
      assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('daysFromNow()', () => {
    it('daysFromNow(1) returns tomorrow', () => {
      const tomorrow = daysFromNow(1);
      assert.match(tomorrow, /^\d{4}-\d{2}-\d{2}$/);
      // Tomorrow should be 1 day after today
      const todayDate = new Date(today() + 'T00:00:00Z');
      const tomorrowDate = new Date(tomorrow + 'T00:00:00Z');
      const diffMs = tomorrowDate - todayDate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      assert.equal(diffDays, 1);
    });
  });

  // ── Multi-user helpers (NEW) ─────────────────────────────────────────────

  describe('makeUser2()', () => {
    it('creates second user with separate session', () => {
      const user2 = makeUser2();
      assert.ok(user2.userId > 0, 'should return a positive userId');
      assert.ok(user2.agent, 'should return an agent');
      // userId should be different from the default test user (id=1)
      assert.notEqual(user2.userId, 1, 'user2 should have different id from default user');
    });

    it('user2 agent is authenticated', async () => {
      const user2 = makeUser2();
      const res = await user2.agent.get('/api/areas');
      assert.equal(res.status, 200);
    });

    it('user2 is isolated from user1 data', async () => {
      // Create data as user1
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id);

      // user2 should see no areas
      const user2 = makeUser2();
      const res = await user2.agent.get('/api/areas');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0, 'user2 should not see user1 areas');
    });

    it('multiple calls create distinct users', () => {
      const u2 = makeUser2();
      const u3 = makeUser2();
      assert.notEqual(u2.userId, u3.userId);
    });
  });

  describe('agentAs()', () => {
    it('creates authenticated agent for a given session id', async () => {
      const user2 = makeUser2();
      // agentAs with user2's session should also be authenticated
      const { db } = setup();
      const session = db.prepare('SELECT sid FROM sessions WHERE user_id=?').get(user2.userId);
      const a = agentAs(session.sid);
      const res = await a.get('/api/areas');
      assert.equal(res.status, 200);
    });
  });
});
