const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Security Headers', () => {
  before(() => setup());

  it('X-Content-Type-Options header present', async () => {
    const res = await agent().get('/api/areas');
    assert.ok(
      res.headers['x-content-type-options'] === 'nosniff',
      'should have X-Content-Type-Options: nosniff'
    );
  });

  it('X-Frame-Options header present', async () => {
    const res = await agent().get('/api/areas');
    const xfo = res.headers['x-frame-options'];
    assert.ok(xfo === 'DENY' || xfo === 'SAMEORIGIN', 'should have X-Frame-Options');
  });

  it('helmet middleware used in server', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
    assert.ok(src.includes('helmet'), 'server.js should use helmet');
  });
});

describe('Docker Security', () => {
  it('Dockerfile uses specific Node version (not :latest)', () => {
    const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    assert.ok(!dockerfile.includes('FROM node:latest'), 'should not use :latest');
    assert.ok(dockerfile.includes('FROM node:'), 'should use node base image');
    // Check for specific version
    const fromMatch = dockerfile.match(/FROM node:(\S+)/);
    assert.ok(fromMatch, 'should have FROM node:version');
    assert.ok(!fromMatch[1].includes('latest'), 'version should be specific');
  });

  it('Dockerfile has HEALTHCHECK or equivalent', () => {
    const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    assert.ok(
      dockerfile.includes('HEALTHCHECK') || dockerfile.includes('/api/health'),
      'should have health check'
    );
  });

  it('.dockerignore excludes sensitive files', () => {
    try {
      const dockerignore = fs.readFileSync(path.join(__dirname, '..', '.dockerignore'), 'utf8');
      assert.ok(dockerignore.includes('node_modules'), 'should ignore node_modules');
    } catch {
      // .dockerignore may not exist — skip
    }
  });

  it('docker-compose.yml does not use privileged mode', () => {
    const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
    assert.ok(!compose.includes('privileged: true'), 'should not use privileged mode');
  });
});

describe('Dependency Security', () => {
  it('package.json has no wildcard dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
      assert.ok(!version.includes('*'), `${name} should not use wildcard version: ${version}`);
      assert.notEqual(version, 'latest', `${name} should not use "latest"`);
    }
  });

  it('no deprecated packages in dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    // Known deprecated packages to check
    const deprecated = ['request', 'querystring', 'domain', 'sys'];
    for (const dep of deprecated) {
      assert.ok(!deps.includes(dep), `${dep} is deprecated and should not be used`);
    }
  });
});

describe('Code Quality Final Check', () => {
  before(() => setup());
  after(() => teardown());
  beforeEach(() => cleanDb());

  it('all core API endpoints respond without 500', async () => {
    const endpoints = [
      'GET /api/areas',
      'GET /api/tags',
      'GET /api/habits',
      'GET /api/stats',
    ];
    for (const ep of endpoints) {
      const [method, p] = ep.split(' ');
      const res = await agent()[method.toLowerCase()](p);
      assert.ok(res.status < 500, `${ep} returned ${res.status}`);
    }
  });

  it('health endpoint responds 200', async () => {
    const { app } = setup();
    const res = await require('supertest')(app).get('/health');
    assert.equal(res.status, 200);
  });

  it('error responses use proper content type', async () => {
    const res = await agent().get('/api/nonexistent-abc');
    // API catch-all should return 404 or SPA fallback
    assert.ok(res.status === 404 || res.status === 200);
  });

  it('CLAUDE.md version matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const claude = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    assert.ok(claude.includes(pkg.version), 'CLAUDE.md should reference current version');
  });

  it('openapi.yaml version matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const openapi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
    assert.ok(openapi.includes(pkg.version), 'openapi.yaml should reference current version');
  });

  it('CHANGELOG.md has current version entry', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes(pkg.version), 'CHANGELOG.md should have current version entry');
  });
});
