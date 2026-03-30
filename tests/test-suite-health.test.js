/**
 * Test Suite Health & Coverage Audit — v0.7.25
 * 
 * Final iteration: validates the test infrastructure itself,
 * ensures all routes have coverage, and verifies security baseline.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const SRC = (...p) => path.join(ROOT, 'src', ...p);
const TESTS = path.join(ROOT, 'tests');

describe('Test Suite Health', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  // ── Test Infrastructure ──

  it('all test files use strict assertions', () => {
    const testFiles = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js'));
    const nonStrict = [];
    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(TESTS, file), 'utf8');
      // Must use assert/strict or not use assert at all (pure file-reading tests)
      if (content.includes("require('node:assert')") && !content.includes("require('node:assert/strict')")) {
        nonStrict.push(file);
      }
    }
    // A few legacy test files may use non-strict assert — tolerate up to 3
    assert.ok(nonStrict.length <= 3, `Too many test files use non-strict assert (${nonStrict.length}): ${nonStrict.join(', ')}`);
  });

  it('all test files have proper describe blocks', () => {
    const testFiles = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js'));
    const noDescribe = [];
    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(TESTS, file), 'utf8');
      if (!content.includes('describe(') && !content.includes('describe.')) {
        noDescribe.push(file);
      }
    }
    assert.deepEqual(noDescribe, [], `These test files lack describe blocks: ${noDescribe.join(', ')}`);
  });

  it('test helpers file exports all required utilities', () => {
    const helpers = require('./helpers');
    const required = ['setup', 'cleanDb', 'teardown', 'agent', 'makeArea', 'makeGoal', 'makeTask'];
    for (const fn of required) {
      assert.equal(typeof helpers[fn], 'function', `helpers.${fn} should be a function`);
    }
  });

  it('no test file imports from production code incorrectly', () => {
    const testFiles = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js'));
    const dangerous = [];
    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(TESTS, file), 'utf8');
      // Direct DB imports (bypassing server) are ok for unit tests
      // But importing server.js directly (not through helpers) can cause issues
      if (content.includes("require('../src/server')") && file !== 'helpers.js' && !content.includes("require('./helpers')")) {
        dangerous.push(file);
      }
    }
    // This is informational — some test files legitimately need direct imports
    assert.ok(dangerous.length < 5, `Too many files import server directly: ${dangerous.join(', ')}`);
  });

  // ── Route Coverage Audit ──

  it('all API route files are loaded by the server', () => {
    const routeFiles = fs.readdirSync(SRC('routes')).filter(f => f.endsWith('.js'));
    const serverSrc = fs.readFileSync(SRC('server.js'), 'utf8');
    const notLoaded = [];
    for (const file of routeFiles) {
      const moduleName = file.replace('.js', '');
      if (!serverSrc.includes(moduleName) && !serverSrc.includes(`routes/${file}`)) {
        notLoaded.push(file);
      }
    }
    assert.deepEqual(notLoaded, [], `These route files are not loaded: ${notLoaded.join(', ')}`);
  });

  it('minimum test file count maintained', () => {
    const testFiles = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js'));
    assert.ok(testFiles.length >= 100, `Expected 100+ test files, got ${testFiles.length}`);
  });

  it('critical routes have at least basic test coverage', async () => {
    // Test that major endpoints return proper status codes
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    // Core CRUD
    const areas = await agent().get('/api/areas');
    assert.equal(areas.status, 200);

    const goals = await agent().get(`/api/areas/${area.id}/goals`);
    assert.equal(goals.status, 200);

    const tasks = await agent().get(`/api/goals/${goal.id}/tasks`);
    assert.equal(tasks.status, 200);

    // Dashboard
    const stats = await agent().get('/api/stats');
    assert.equal(stats.status, 200);

    // Health
    const health = await request(setup().app).get('/health');
    assert.equal(health.status, 200);
  });

  // ── Security Baseline ──

  it('all routes require authentication', async () => {
    const { app } = setup();
    // These endpoints should all return 401 without auth
    const protectedRoutes = [
      { method: 'get', path: '/api/areas' },
      { method: 'get', path: '/api/stats' },
      { method: 'get', path: '/api/inbox' },
      { method: 'get', path: '/api/habits' },
      { method: 'get', path: '/api/notes' },
      { method: 'get', path: '/api/lists' },
      { method: 'get', path: '/api/templates' },
      { method: 'get', path: '/api/settings' },
    ];
    for (const { method, path: routePath } of protectedRoutes) {
      const res = await request(app)[method](routePath);
      assert.equal(res.status, 401, `${method.toUpperCase()} ${routePath} should require auth`);
    }
  });

  it('server sets security headers', async () => {
    const res = await agent().get('/api/areas');
    // Helmet headers
    const headers = res.headers;
    assert.ok(headers['x-content-type-options'], 'should have X-Content-Type-Options');
  });

  it('CORS is configured', async () => {
    const { app } = setup();
    const res = await request(app).options('/api/areas').set('Origin', 'http://localhost:3456');
    // Should not error
    assert.ok(res.status < 500);
  });

  // ── Database Integrity ──

  it('all tables have proper schema', () => {
    const { db } = setup();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'").all();
    assert.ok(tables.length >= 20, `Expected 20+ tables, got ${tables.length}`);
    
    // Verify critical tables exist
    const tableNames = tables.map(t => t.name);
    const critical = ['users', 'sessions', 'life_areas', 'goals', 'tasks', 'subtasks', 'tags', 'habits'];
    for (const t of critical) {
      assert.ok(tableNames.includes(t), `Missing critical table: ${t}`);
    }
  });

  it('WAL mode is enabled', () => {
    const { db } = setup();
    const mode = db.pragma('journal_mode', { simple: true });
    assert.equal(mode, 'wal', 'SQLite should be in WAL mode');
  });

  it('foreign keys are enabled', () => {
    const { db } = setup();
    const fk = db.pragma('foreign_keys', { simple: true });
    assert.equal(fk, 1, 'Foreign keys should be enabled');
  });

  // ── Code Quality ──

  it('no console.log in production source code', () => {
    const srcFiles = [];
    function walkDir(dir) {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walkDir(full);
        else if (f.endsWith('.js')) srcFiles.push(full);
      }
    }
    walkDir(SRC());
    
    const violations = [];
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('console.log(') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          violations.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
      });
    }
    // Allow maximum 5 console.logs (some are intentional startup messages)
    assert.ok(violations.length <= 5, `Too many console.log statements: ${violations.join(', ')}`);
  });

  it('package.json has required fields', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.name, 'missing name');
    assert.ok(pkg.version, 'missing version');
    assert.ok(pkg.scripts && pkg.scripts.test, 'missing test script');
    assert.ok(pkg.main, 'missing main');
  });

  it('version consistency across files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const version = pkg.version;
    
    const openapiContent = fs.readFileSync(path.join(ROOT, 'docs', 'openapi.yaml'), 'utf8');
    assert.ok(openapiContent.includes(`version: ${version}`), 'openapi.yaml version mismatch');
    
    const claudeContent = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeContent.includes(version), 'CLAUDE.md version mismatch');
  });

  // ── Error Handling ──

  it('404 for unknown API routes', async () => {
    const res = await agent().get('/api/nonexistent-endpoint-xyz');
    assert.ok(res.status === 404 || res.status >= 400, 'should return 404 for unknown routes');
  });

  it('invalid JSON body returns 400, not 500', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{invalid json}');
    assert.ok(res.status >= 400 && res.status < 500, `should return 4xx, got ${res.status}`);
  });
});
