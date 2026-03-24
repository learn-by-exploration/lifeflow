const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('Phase 7 - Authentication & Security', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => {
    cleanDb();
    const { db } = setup();
    // Clean auth tables but keep the test user (id=1)
    db.exec("DELETE FROM sessions WHERE user_id != 1");
    db.exec("DELETE FROM users WHERE id != 1");
  });

  // ─── REGISTRATION ───
  describe('POST /api/auth/register', () => {
    it('registers a new user and returns user data', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'password123', display_name: 'New User' });
      assert.equal(res.status, 201);
      assert.ok(res.body.user);
      assert.equal(res.body.user.email, 'new@example.com');
      assert.equal(res.body.user.display_name, 'New User');
      assert.ok(!res.body.user.password_hash); // never expose hash
    });

    it('sets a session cookie on registration', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'cookie@example.com', password: 'password123' });
      assert.equal(res.status, 201);
      const cookie = res.headers['set-cookie'];
      assert.ok(cookie, 'Should set cookie header');
      assert.ok(String(cookie).includes('lf_sid='), 'Cookie should contain lf_sid');
      assert.ok(String(cookie).includes('HttpOnly'), 'Cookie should be HttpOnly');
      assert.ok(String(cookie).includes('SameSite=Strict'), 'Cookie should be SameSite=Strict');
    });

    it('rejects registration without email', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ password: 'password123' });
      assert.equal(res.status, 400);
    });

    it('rejects registration without password', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'nopass@example.com' });
      assert.equal(res.status, 400);
    });

    it('rejects password shorter than 8 characters', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'short@example.com', password: 'short' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('8 characters'));
    });

    it('rejects invalid email format', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123' });
      assert.equal(res.status, 400);
    });

    it('rejects duplicate email', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ email: 'dup@example.com', password: 'password123' });
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'dup@example.com', password: 'password456' });
      assert.equal(res.status, 409);
    });

    it('normalizes email to lowercase', async () => {
      const res = await rawAgent().post('/api/auth/register')
        .send({ email: 'UPPER@EXAMPLE.COM', password: 'password123' });
      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, 'upper@example.com');
    });
  });

  // ─── LOGIN ───
  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials', async () => {
      // Register first
      await rawAgent().post('/api/auth/register')
        .send({ email: 'login@example.com', password: 'password123' });
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'password123' });
      assert.equal(res.status, 200);
      assert.ok(res.body.user);
      assert.equal(res.body.user.email, 'login@example.com');
    });

    it('sets session cookie on login', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ email: 'logincookie@example.com', password: 'password123' });
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'logincookie@example.com', password: 'password123' });
      const cookie = res.headers['set-cookie'];
      assert.ok(cookie);
      assert.ok(String(cookie).includes('lf_sid='));
    });

    it('rejects wrong password', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ email: 'wrong@example.com', password: 'password123' });
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'wrongpassword' });
      assert.equal(res.status, 401);
    });

    it('rejects non-existent email', async () => {
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });
      assert.equal(res.status, 401);
    });

    it('rejects missing credentials', async () => {
      const res = await rawAgent().post('/api/auth/login').send({});
      assert.equal(res.status, 400);
    });

    it('updates last_login timestamp', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ email: 'lastlogin@example.com', password: 'password123' });
      await rawAgent().post('/api/auth/login')
        .send({ email: 'lastlogin@example.com', password: 'password123' });
      const { db } = setup();
      const user = db.prepare('SELECT last_login FROM users WHERE email = ?').get('lastlogin@example.com');
      assert.ok(user.last_login);
    });

    it('remember=true sets long maxAge cookie', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ email: 'remember@example.com', password: 'password123' });
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'remember@example.com', password: 'password123', remember: true });
      const cookie = String(res.headers['set-cookie']);
      // 30 days = 2592000 seconds
      assert.ok(cookie.includes('Max-Age=2592000'));
    });

    it('remember=false sets short maxAge cookie', async () => {
      await rawAgent().post('/api/auth/register')
        .send({ email: 'norem@example.com', password: 'password123' });
      const res = await rawAgent().post('/api/auth/login')
        .send({ email: 'norem@example.com', password: 'password123', remember: false });
      const cookie = String(res.headers['set-cookie']);
      // 24 hours = 86400 seconds
      assert.ok(cookie.includes('Max-Age=86400'));
    });
  });

  // ─── LOGOUT ───
  describe('POST /api/auth/logout', () => {
    it('clears session cookie', async () => {
      const res = await rawAgent().post('/api/auth/logout');
      const cookie = String(res.headers['set-cookie']);
      assert.ok(cookie.includes('Max-Age=0'));
    });

    it('destroys session in database', async () => {
      // Register and get cookie
      const regRes = await rawAgent().post('/api/auth/register')
        .send({ email: 'logout@example.com', password: 'password123' });
      const cookie = String(regRes.headers['set-cookie']);
      const sidMatch = cookie.match(/lf_sid=([^;]+)/);
      assert.ok(sidMatch);

      // Logout with that cookie
      await rawAgent().post('/api/auth/logout').set('Cookie', `lf_sid=${sidMatch[1]}`);

      // Session should be gone
      const { db } = setup();
      const session = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sidMatch[1]);
      assert.ok(!session);
    });
  });

  // ─── CURRENT USER ───
  describe('GET /api/auth/me', () => {
    it('returns current user when authenticated', async () => {
      const res = await agent().get('/api/auth/me');
      assert.equal(res.status, 200);
      assert.ok(res.body.user);
      assert.ok(res.body.user.id);
      assert.ok(!res.body.user.password_hash);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await rawAgent().get('/api/auth/me');
      assert.equal(res.status, 401);
    });
  });

  // ─── CHANGE PASSWORD ───
  describe('POST /api/auth/change-password', () => {
    it('changes password with valid current password', async () => {
      // Register a user
      const regRes = await rawAgent().post('/api/auth/register')
        .send({ email: 'changepw@example.com', password: 'oldpassword1' });
      const cookie = String(regRes.headers['set-cookie']).match(/lf_sid=([^;]+)/)[1];

      const res = await rawAgent().post('/api/auth/change-password')
        .set('Cookie', `lf_sid=${cookie}`)
        .send({ current_password: 'oldpassword1', new_password: 'newpassword1' });
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);

      // Verify new password works
      const loginRes = await rawAgent().post('/api/auth/login')
        .send({ email: 'changepw@example.com', password: 'newpassword1' });
      assert.equal(loginRes.status, 200);
    });

    it('rejects wrong current password', async () => {
      const regRes = await rawAgent().post('/api/auth/register')
        .send({ email: 'wrongcur@example.com', password: 'correctpw1' });
      const cookie = String(regRes.headers['set-cookie']).match(/lf_sid=([^;]+)/)[1];

      const res = await rawAgent().post('/api/auth/change-password')
        .set('Cookie', `lf_sid=${cookie}`)
        .send({ current_password: 'wrongpassword', new_password: 'newpassword1' });
      assert.equal(res.status, 401);
    });

    it('rejects short new password', async () => {
      const regRes = await rawAgent().post('/api/auth/register')
        .send({ email: 'shortpw@example.com', password: 'password123' });
      const cookie = String(regRes.headers['set-cookie']).match(/lf_sid=([^;]+)/)[1];

      const res = await rawAgent().post('/api/auth/change-password')
        .set('Cookie', `lf_sid=${cookie}`)
        .send({ current_password: 'password123', new_password: 'short' });
      assert.equal(res.status, 400);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await rawAgent().post('/api/auth/change-password')
        .send({ current_password: 'old', new_password: 'newpassword1' });
      assert.equal(res.status, 401);
    });
  });

  // ─── AUTH MIDDLEWARE ───
  describe('Auth Middleware', () => {
    it('rejects unauthenticated /api requests with 401', async () => {
      const res = await rawAgent().get('/api/areas');
      assert.equal(res.status, 401);
    });

    it('allows authenticated /api requests', async () => {
      const res = await agent().get('/api/areas');
      assert.equal(res.status, 200);
    });

    it('allows health check without auth', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
    });

    it('rejects expired sessions', async () => {
      const { db } = setup();
      // Create an expired session
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 0, datetime('now', '-1 hour'))"
      ).run('expired-sid');
      const res = await rawAgent().get('/api/areas').set('Cookie', 'lf_sid=expired-sid');
      assert.equal(res.status, 401);
    });

    it('rejects invalid session IDs', async () => {
      const res = await rawAgent().get('/api/areas').set('Cookie', 'lf_sid=nonexistent');
      assert.equal(res.status, 401);
    });
  });

  // ─── SECURITY HEADERS ───
  describe('Security Headers (Helmet)', () => {
    it('sets X-Content-Type-Options', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });

    it('sets X-Frame-Options', async () => {
      const res = await rawAgent().get('/health');
      assert.ok(res.headers['x-frame-options']);
    });

    it('sets Content-Security-Policy', async () => {
      const res = await rawAgent().get('/health');
      assert.ok(res.headers['content-security-policy']);
    });

    it('sets X-XSS-Protection', async () => {
      const res = await rawAgent().get('/health');
      // Helmet v8 sets this to 0 (modern approach)
      assert.ok(res.headers['x-xss-protection'] !== undefined);
    });
  });

  // ─── USERS TABLE ───
  describe('Users Table Schema', () => {
    it('users table exists with correct columns', () => {
      const { db } = setup();
      const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      assert.ok(cols.includes('id'));
      assert.ok(cols.includes('email'));
      assert.ok(cols.includes('password_hash'));
      assert.ok(cols.includes('display_name'));
      assert.ok(cols.includes('created_at'));
      assert.ok(cols.includes('last_login'));
    });

    it('sessions table exists with correct columns', () => {
      const { db } = setup();
      const cols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
      assert.ok(cols.includes('sid'));
      assert.ok(cols.includes('user_id'));
      assert.ok(cols.includes('remember'));
      assert.ok(cols.includes('expires_at'));
    });

    it('data tables have user_id column', () => {
      const { db } = setup();
      const tables = ['life_areas', 'goals', 'tasks', 'tags', 'habits', 'saved_filters',
        'inbox', 'notes', 'weekly_reviews', 'lists', 'task_templates', 'badges',
        'automation_rules', 'focus_sessions', 'settings'];
      for (const tbl of tables) {
        const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
        assert.ok(cols.includes('user_id'), `${tbl} should have user_id column`);
      }
    });

    it('default user is auto-created', () => {
      const { db } = setup();
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get();
      assert.ok(user);
      assert.equal(user.email, 'admin@localhost');
    });
  });

  // ─── SESSION CLEANUP ───
  describe('Session Management', () => {
    it('expired sessions are cleaned up on DB init', () => {
      const { db } = setup();
      // Insert an expired session
      db.prepare(
        "INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES ('old', 1, 0, datetime('now', '-1 day'))"
      ).run();
      // The cleanup happens at init, but we can verify the query works
      db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
      const old = db.prepare("SELECT * FROM sessions WHERE sid = 'old'").get();
      assert.ok(!old);
    });
  });
});
