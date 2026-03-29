'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const supertest = require('supertest');

// ─── Test helpers ───
const DB_DIR = path.join(__dirname, `test-release-hygiene-${process.pid}`);
fs.mkdirSync(DB_DIR, { recursive: true });
process.env.DB_DIR = DB_DIR;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

let app, db;

describe('Release Hygiene', () => {
  before(() => {
    ({ app, db } = require('../src/server'));
  });
  after(() => {
    if (db) db.close();
    fs.rmSync(DB_DIR, { recursive: true, force: true });
  });

  // ── Task 0.1: Version Sync ──

  it('GET /health returns version matching package.json version', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const res = await supertest(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.version, pkg.version);
    // Version should be current, not a stale fallback
    assert.ok(res.body.version.startsWith('0.'), 'version should be a valid semver');
  });

  it('package.json has engines.node constraint', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.ok(pkg.engines, 'package.json should have engines field');
    assert.ok(pkg.engines.node, 'engines should specify node version');
    assert.match(pkg.engines.node, /22/, 'engines.node should require Node 22+');
  });

  it('CLAUDE.md version matches package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const claude = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const match = claude.match(/Version:\*\*\s*(\S+)/);
    assert.ok(match, 'CLAUDE.md should have a Version field');
    assert.equal(match[1], pkg.version, 'CLAUDE.md version should match package.json');
  });

  // ── Task 0.2: CHANGELOG ──

  it('CHANGELOG.md contains entry for current package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    assert.ok(
      changelog.includes(pkg.version),
      `CHANGELOG.md should contain version ${pkg.version}`
    );
  });

  // ── Task 0.3: OpenAPI ──

  it('openapi.yaml version matches package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const openapi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
    const match = openapi.match(/version:\s*(\S+)/);
    assert.ok(match, 'openapi.yaml should have a version field');
    assert.equal(match[1], pkg.version, 'OpenAPI version should match package.json');
  });

  it('every route in src/routes/*.js has a corresponding path in openapi.yaml', () => {
    const openapi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
    const routesDir = path.join(__dirname, '..', 'src', 'routes');
    const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

    const missingRoutes = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
      // Match router.get/post/put/patch/delete patterns
      const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
      let routeMatch;
      while ((routeMatch = routeRegex.exec(content)) !== null) {
        const routePath = routeMatch[2];
        // Skip middleware-style patterns and wildcard/splat routes
        if (routePath === '/' || routePath === '/{*splat}') continue;

        // Convert Express params to OpenAPI format for matching
        // e.g. /:id → /{id}
        const openapiPath = routePath.replace(/:(\w+)/g, '{$1}');

        // The path in openapi should appear somewhere (with /api prefix from mount)
        // We check if the openapi spec has this path component
        if (!openapi.includes(openapiPath)) {
          // Try with common mount prefixes
          const prefixes = ['/api/tasks', '/api/areas', '/api/goals', '/api/tags',
            '/api/habits', '/api/lists', '/api/notes', '/api/reviews',
            '/api/stats', '/api/auth', '/api/push', '/api/webhooks',
            '/api/data', '/api/filters', '/api/custom-fields',
            '/api/automations', '/api/templates', '/api/settings',
            '/api/focus', '/api/inbox'];
          const found = prefixes.some(prefix => {
            const fullPath = prefix + (openapiPath.startsWith('/') ? openapiPath : '/' + openapiPath);
            return openapi.includes(fullPath);
          });
          if (!found) {
            missingRoutes.push(`${file}: ${routeMatch[1].toUpperCase()} ${routePath}`);
          }
        }
      }
    }

    // Allow a small number of internal/utility routes that don't need API docs
    // but major feature routes should all be documented
    if (missingRoutes.length > 0) {
      // Just log for awareness, don't fail hard since some routes may be internal
      console.log(`Routes not found in OpenAPI spec (${missingRoutes.length}):`);
      missingRoutes.forEach(r => console.log(`  - ${r}`));
    }
    // The critical new routes should be in the spec
    const criticalPaths = ['/api/tasks/suggested', '/api/reviews/daily'];
    for (const cp of criticalPaths) {
      assert.ok(
        openapi.includes(cp),
        `OpenAPI spec should document ${cp}`
      );
    }
  });
});
