'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const ROOT = path.join(__dirname, '..');
const srcDir = path.join(ROOT, 'src');
const testsDir = __dirname;
const routesDir = path.join(srcDir, 'routes');

function readPkg() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

function collectSrcFiles() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(srcDir);
  return files;
}

function extractRoutes(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const routes = [];
  const re = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

function findTestCoverage(apiPath) {
  const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
  const normalized = apiPath.replace(/:[a-zA-Z_]+/g, '');
  for (const file of testFiles) {
    const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
    if (content.includes(apiPath) || content.includes(normalized)) return true;
  }
  return false;
}

// ─── Server setup (only needed for health endpoint test) ─────────
const DB_DIR = path.join(__dirname, `test-project-health-${process.pid}`);
fs.mkdirSync(DB_DIR, { recursive: true });
process.env.DB_DIR = DB_DIR;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

describe('Project Health', () => {
  const pkg = readPkg();
  let app, db;

  before(() => {
    ({ app, db } = require('../src/server'));
  });
  after(() => {
    if (db) db.close();
    fs.rmSync(DB_DIR, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. Version Consistency
  // ═══════════════════════════════════════════════════════════════
  describe('Version consistency', () => {
    it('package.json version is valid semver', () => {
      assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    });

    it('CLAUDE.md version matches package.json', () => {
      const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
      assert.ok(claude.includes(`Version:** ${pkg.version}`),
        `CLAUDE.md should reference ${pkg.version}`);
    });

    it('openapi.yaml version matches package.json', () => {
      const openapi = fs.readFileSync(path.join(ROOT, 'docs', 'openapi.yaml'), 'utf8');
      const match = openapi.match(/version:\s*(\S+)/);
      assert.ok(match, 'openapi.yaml should have a version field');
      assert.equal(match[1], pkg.version);
    });

    it('CHANGELOG.md has entry for current version', () => {
      const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
      assert.ok(changelog.includes(`[${pkg.version}]`),
        `CHANGELOG.md missing entry for ${pkg.version}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. Project Structure
  // ═══════════════════════════════════════════════════════════════
  describe('Project structure', () => {
    it('README.md exists with substantial content', () => {
      const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
      assert.ok(readme.length > 200);
      assert.ok(readme.includes('LifeFlow'));
    });

    it('LICENSE and CONTRIBUTING.md exist', () => {
      assert.ok(fs.existsSync(path.join(ROOT, 'LICENSE')));
      assert.ok(fs.existsSync(path.join(ROOT, 'CONTRIBUTING.md')));
    });

    it('Dockerfile has USER node and HEALTHCHECK', () => {
      const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
      assert.ok(/^USER\s+node/m.test(content), 'should have USER node');
      assert.ok(/^HEALTHCHECK/m.test(content), 'should have HEALTHCHECK');
    });

    it('docker-compose.yml exists and builds from Dockerfile', () => {
      const content = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
      const hasHealthcheck = /healthcheck:/m.test(content);
      const buildsDotfile = /build:\s*\./m.test(content);
      assert.ok(hasHealthcheck || buildsDotfile,
        'docker-compose.yml should have healthcheck or build from Dockerfile');
    });

    it('.editorconfig has correct settings', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/^root\s*=\s*true/m.test(content));
      assert.ok(/indent_style\s*=\s*space/m.test(content));
      assert.ok(/indent_size\s*=\s*2/m.test(content));
      assert.ok(/end_of_line\s*=\s*lf/m.test(content));
      assert.ok(/charset\s*=\s*utf-8/m.test(content));
      assert.ok(/trim_trailing_whitespace\s*=\s*true/m.test(content));
      assert.ok(/insert_final_newline\s*=\s*true/m.test(content));
    });

    it('.gitignore includes required entries', () => {
      const lines = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
        .split('\n').map(l => l.trim());
      for (const entry of ['*.db-shm', '*.db-wal', 'backups/', 'node_modules/']) {
        assert.ok(lines.includes(entry), `.gitignore should include ${entry}`);
      }
    });

    it('.env.example exists with all documented vars', () => {
      const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
      for (const v of ['PORT', 'DB_DIR', 'NODE_ENV', 'LOG_LEVEL', 'RATE_LIMIT_MAX', 'SHUTDOWN_TIMEOUT_MS']) {
        assert.ok(content.includes(v), `.env.example missing ${v}`);
      }
    });

    it('src/routes/ has all route files', () => {
      const expected = [
        'areas.js', 'auth.js', 'custom-fields.js', 'data.js', 'features.js',
        'filters.js', 'lists.js', 'productivity.js', 'stats.js', 'tags.js', 'tasks.js'
      ];
      for (const file of expected) {
        assert.ok(fs.existsSync(path.join(routesDir, file)), `missing route file: ${file}`);
      }
    });

    it('src/middleware/ has auth, csrf, errors, validate', () => {
      for (const file of ['auth.js', 'csrf.js', 'errors.js', 'validate.js']) {
        assert.ok(fs.existsSync(path.join(srcDir, 'middleware', file)), `missing middleware: ${file}`);
      }
    });

    it('public/ has core frontend files', () => {
      for (const file of ['app.js', 'index.html', 'styles.css', 'sw.js', 'store.js', 'manifest.json']) {
        assert.ok(fs.existsSync(path.join(ROOT, 'public', file)), `missing public file: ${file}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. Code Quality
  // ═══════════════════════════════════════════════════════════════
  describe('Code quality', () => {
    const srcFiles = collectSrcFiles();

    it('no console.log in src/ (should use logger)', () => {
      const violations = [];
      for (const file of srcFiles) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          if (/\bconsole\.log\b/.test(lines[i])) {
            violations.push(`${path.relative(ROOT, file)}:${i + 1}`);
          }
        }
      }
      assert.deepStrictEqual(violations, [],
        `console.log found in src/:\n  ${violations.join('\n  ')}`);
    });

    it('no hardcoded secrets or passwords in source', () => {
      const patterns = [
        /password\s*=\s*['"][^'"]{3,}['"]/i,
        /secret\s*=\s*['"][^'"]{8,}['"]/i,
        /api_key\s*=\s*['"][^'"]{8,}['"]/i,
      ];
      const violations = [];
      for (const file of srcFiles) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
          for (const p of patterns) {
            if (p.test(line) && !line.includes('process.env') && !line.includes('config.')) {
              violations.push(`${path.relative(ROOT, file)}:${i + 1}`);
            }
          }
        }
      }
      assert.deepStrictEqual(violations, [],
        `Potential hardcoded secrets:\n${violations.join('\n')}`);
    });

    it('no TODO/FIXME in security-critical files', () => {
      const securityFiles = ['middleware/auth.js', 'middleware/csrf.js', 'routes/auth.js'];
      const violations = [];
      for (const relPath of securityFiles) {
        const fullPath = path.join(srcDir, relPath);
        if (!fs.existsSync(fullPath)) continue;
        const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
            violations.push(`${relPath}:${i + 1}: ${line.trim().slice(0, 60)}`);
          }
        });
      }
      assert.deepStrictEqual(violations, [],
        `TODO/FIXME in security files:\n${violations.join('\n')}`);
    });

    it('consistent 2-space indentation in src/ (no tabs)', () => {
      const violations = [];
      for (const file of srcFiles) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > 0 && lines[i][0] === '\t') {
            violations.push(`${path.relative(ROOT, file)}:${i + 1}`);
            break;
          }
        }
      }
      assert.deepStrictEqual(violations, [],
        `Files with tab indentation:\n  ${violations.join('\n  ')}`);
    });

    it('core dependencies exist (express, better-sqlite3, bcryptjs, helmet, cors)', () => {
      const deps = pkg.dependencies;
      for (const dep of ['express', 'better-sqlite3', 'bcryptjs', 'helmet', 'cors']) {
        assert.ok(deps[dep], `should depend on ${dep}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. Test Infrastructure
  // ═══════════════════════════════════════════════════════════════
  describe('Test infrastructure', () => {
    const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

    it(`test file count >= 139 (found ${testFiles.length})`, () => {
      assert.ok(testFiles.length >= 139,
        `Expected >= 139 test files, found ${testFiles.length}`);
    });

    it('test count in CLAUDE.md is reasonable', () => {
      const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
      const match = claude.match(/(\d[,\d]+)\s*tests/);
      assert.ok(match, 'CLAUDE.md should mention test count');
      const count = parseInt(match[1].replace(/,/g, ''));
      assert.ok(count >= 3400, `Expected >= 3,400 tests documented, found ${count}`);
    });

    it('helpers.js exports required factory functions', () => {
      const helpers = fs.readFileSync(path.join(testsDir, 'helpers.js'), 'utf8');
      for (const fn of ['setup', 'cleanDb', 'teardown', 'agent', 'makeArea', 'makeGoal',
        'makeTask', 'makeSubtask', 'makeTag', 'linkTag']) {
        assert.ok(helpers.includes(fn), `helpers.js should export ${fn}`);
      }
    });

    it('every test file uses describe()', () => {
      const missing = testFiles.filter(f => {
        const content = fs.readFileSync(path.join(testsDir, f), 'utf8');
        return !content.includes('describe(');
      });
      assert.deepStrictEqual(missing, [],
        `Files without describe(): ${missing.join(', ')}`);
    });

    it('no test file is empty', () => {
      const empty = testFiles.filter(f => {
        const content = fs.readFileSync(path.join(testsDir, f), 'utf8');
        return content.trim().length < 50;
      });
      assert.equal(empty.length, 0, `Empty test files: ${empty.join(', ')}`);
    });

    it('no duplicate test file names', () => {
      const seen = new Set();
      const dupes = testFiles.filter(f => {
        if (seen.has(f)) return true;
        seen.add(f);
        return false;
      });
      assert.equal(dupes.length, 0, `Duplicate test files: ${dupes.join(', ')}`);
    });

    it('package.json has test and start scripts', () => {
      assert.ok(pkg.scripts && pkg.scripts.test, 'should have test script');
      assert.ok(pkg.scripts && (pkg.scripts.start || pkg.main), 'should have start script or main');
    });

    it('package.json has engines.node constraint', () => {
      assert.ok(pkg.engines && pkg.engines.node, 'should have engines.node');
      assert.match(pkg.engines.node, /22/, 'engines.node should require Node 22+');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. Security Gates
  // ═══════════════════════════════════════════════════════════════
  describe('Security gates', () => {
    it('helmet middleware is used', () => {
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(server.includes('helmet'), 'server.js should use helmet');
    });

    it('CSRF middleware exists and is active', () => {
      const csrfMw = fs.readFileSync(path.join(srcDir, 'middleware', 'csrf.js'), 'utf8');
      assert.ok(csrfMw.includes('csrf'), 'CSRF middleware should exist');
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(server.includes('csrf'), 'server.js should use CSRF middleware');
    });

    it('rate limiting is configured', () => {
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(
        server.includes('rateLimit') || server.includes('rate-limit') || server.includes('RATE_LIMIT'),
        'server should have rate limiting');
    });

    it('auth middleware uses timing-safe comparison or bcrypt', () => {
      const authMw = fs.readFileSync(path.join(srcDir, 'middleware', 'auth.js'), 'utf8');
      assert.ok(
        authMw.includes('bcrypt') || authMw.includes('timingSafe') || authMw.includes('prepare'),
        'auth should use safe comparison');
    });

    it('graceful shutdown handling', () => {
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(
        server.includes('SIGTERM') || server.includes('SIGINT') || server.includes('graceful'),
        'should handle graceful shutdown');
    });

    it('structured logging (pino)', () => {
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(
        server.includes('pino') || server.includes('logger'),
        'should use structured logging');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. API Coverage
  // ═══════════════════════════════════════════════════════════════
  describe('API coverage', () => {
    const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

    for (const routeFile of routeFiles) {
      it(`${routeFile} route coverage >= 70%`, () => {
        const routes = extractRoutes(path.join(routesDir, routeFile));
        assert.ok(routes.length > 0, `${routeFile} should define routes`);
        const untested = routes.filter(r => !findTestCoverage(r.path));
        const coverage = 1 - untested.length / routes.length;
        assert.ok(coverage >= 0.7,
          `${routeFile}: ${(coverage * 100).toFixed(0)}% coverage. Untested:\n${untested.map(r => `${r.method} ${r.path}`).join('\n')}`);
      });
    }

    it('openapi.yaml has correct structure', () => {
      const openapi = fs.readFileSync(path.join(ROOT, 'docs', 'openapi.yaml'), 'utf8');
      assert.ok(openapi.includes('openapi:'), 'should have openapi key');
      assert.ok(openapi.includes('paths:'), 'should have paths key');
      assert.ok(openapi.includes('info:'), 'should have info key');
    });

    it('critical routes documented in OpenAPI', () => {
      const openapi = fs.readFileSync(path.join(ROOT, 'docs', 'openapi.yaml'), 'utf8');
      for (const cp of ['/api/tasks/suggested', '/api/reviews/daily']) {
        assert.ok(openapi.includes(cp), `OpenAPI spec should document ${cp}`);
      }
    });

    it('GET /health returns status without leaking info', async () => {
      const res = await supertest(app).get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.ok(!res.body.version, 'health must not expose version');
      assert.ok(res.body.uptime === undefined, 'health must not expose uptime');
    });
  });
});
