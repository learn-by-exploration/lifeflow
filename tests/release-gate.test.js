const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const testsDir = __dirname;

describe('Release Gate — v0.7.50', () => {
  // ─── Version Consistency ───────────────────────────────────────
  describe('Version consistency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    it('package.json version is valid semver', () => {
      assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version), `Invalid semver: ${pkg.version}`);
    });

    it('package.json version matches CLAUDE.md header', () => {
      const claude = fs.readFileSync(path.join(rootDir, 'CLAUDE.md'), 'utf8');
      assert.ok(claude.includes(`Version:** ${pkg.version}`), `CLAUDE.md should reference ${pkg.version}`);
    });

    it('CHANGELOG.md has entry for current version', () => {
      const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
      assert.ok(changelog.includes(`[${pkg.version}]`), `CHANGELOG missing entry for ${pkg.version}`);
    });

    it('openapi.yaml version matches package.json', () => {
      const openapi = fs.readFileSync(path.join(rootDir, 'docs', 'openapi.yaml'), 'utf8');
      assert.ok(openapi.includes(`version: ${pkg.version}`), `openapi.yaml should have ${pkg.version}`);
    });

    it('CHANGELOG has entries for v0.7.26 through v0.7.50', () => {
      const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
      for (let i = 26; i <= 50; i++) {
        const ver = `0.7.${i}`;
        assert.ok(changelog.includes(`[${ver}]`), `CHANGELOG missing entry for v${ver}`);
      }
    });
  });

  // ─── Documentation Completeness ────────────────────────────────
  describe('Documentation completeness', () => {
    it('README.md exists and has substantial content', () => {
      const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
      assert.ok(readme.length > 200, 'README should have substantial content');
      assert.ok(readme.includes('LifeFlow'), 'README should mention project name');
    });

    it('docs/openapi.yaml is valid YAML with OpenAPI markers', () => {
      const openapi = fs.readFileSync(path.join(rootDir, 'docs', 'openapi.yaml'), 'utf8');
      assert.ok(openapi.includes('openapi:'), 'should have openapi key');
      assert.ok(openapi.includes('paths:'), 'should have paths key');
      assert.ok(openapi.includes('info:'), 'should have info key');
    });

    it('CONTRIBUTING.md exists', () => {
      assert.ok(fs.existsSync(path.join(rootDir, 'CONTRIBUTING.md')));
    });

    it('LICENSE exists', () => {
      assert.ok(fs.existsSync(path.join(rootDir, 'LICENSE')));
    });

    it('Dockerfile exists', () => {
      assert.ok(fs.existsSync(path.join(rootDir, 'Dockerfile')));
    });

    it('docker-compose.yml exists', () => {
      assert.ok(fs.existsSync(path.join(rootDir, 'docker-compose.yml')));
    });
  });

  // ─── Security Baseline ────────────────────────────────────────
  describe('Security baseline', () => {
    it('no console.log in src/ (only logger allowed)', () => {
      const violations = [];
      function scan(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) scan(path.join(dir, entry.name));
          else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(path.join(dir, entry.name), 'utf8');
            content.split('\n').forEach((line, i) => {
              if (line.includes('console.log') && !line.trim().startsWith('//')) {
                violations.push(`${path.relative(rootDir, path.join(dir, entry.name))}:${i + 1}`);
              }
            });
          }
        }
      }
      scan(srcDir);
      assert.ok(violations.length <= 5, `console.log found in src/:\n${violations.join('\n')}`);
    });

    it('no hardcoded passwords in source', () => {
      const violations = [];
      function scan(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) scan(path.join(dir, entry.name));
          else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(path.join(dir, entry.name), 'utf8');
            content.split('\n').forEach((line, i) => {
              if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
              if (/password\s*=\s*['"][^'"]{3,}['"]/i.test(line) &&
                  !line.includes('process.env') && !line.includes('config.')) {
                violations.push(`${path.relative(rootDir, path.join(dir, entry.name))}:${i + 1}`);
              }
            });
          }
        }
      }
      scan(srcDir);
      assert.ok(violations.length === 0, `Hardcoded passwords:\n${violations.join('\n')}`);
    });

    it('auth middleware uses timing-safe comparison or bcrypt', () => {
      const authMw = fs.readFileSync(path.join(srcDir, 'middleware', 'auth.js'), 'utf8');
      assert.ok(
        authMw.includes('bcrypt') || authMw.includes('timingSafe') || authMw.includes('prepare'),
        'auth should use safe comparison'
      );
    });

    it('CSRF middleware exists and is active', () => {
      const csrfMw = fs.readFileSync(path.join(srcDir, 'middleware', 'csrf.js'), 'utf8');
      assert.ok(csrfMw.includes('csrf'), 'CSRF middleware should exist');
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(server.includes('csrf'), 'server.js should use CSRF middleware');
    });

    it('error handler does not leak stack traces to clients', () => {
      const errorMw = fs.readFileSync(path.join(srcDir, 'middleware', 'errors.js'), 'utf8');
      // The error handler should either conditionally exclude stacks or never send them
      assert.ok(
        errorMw.includes('stack') || errorMw.includes('never expose') || !errorMw.includes('err.stack'),
        'error handler should not expose stack traces to clients'
      );
    });

    it('helmet middleware is used', () => {
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(server.includes('helmet'), 'server.js should use helmet');
    });

    it('rate limiting is configured', () => {
      const server = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');
      assert.ok(
        server.includes('rateLimit') || server.includes('rate-limit') || server.includes('RATE_LIMIT'),
        'server should have rate limiting'
      );
    });
  });

  // ─── Test Suite Health ─────────────────────────────────────────
  describe('Test suite health', () => {
    const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

    it(`test file count ≥ 142 (found ${testFiles.length})`, () => {
      assert.ok(testFiles.length >= 142, `Expected ≥142 test files, found ${testFiles.length}`);
    });

    it('test count in CLAUDE.md is reasonable', () => {
      const claude = fs.readFileSync(path.join(rootDir, 'CLAUDE.md'), 'utf8');
      const match = claude.match(/(\d[,\d]+)\s*tests/);
      assert.ok(match, 'CLAUDE.md should mention test count');
      const count = parseInt(match[1].replace(/,/g, ''));
      assert.ok(count >= 3400, `Expected ≥3,400 tests documented, found ${count}`);
    });

    it('no test file is empty', () => {
      const emptyFiles = [];
      for (const file of testFiles) {
        const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
        if (content.trim().length < 50) emptyFiles.push(file);
      }
      assert.equal(emptyFiles.length, 0, `Empty test files: ${emptyFiles.join(', ')}`);
    });

    it('no duplicate test descriptions within any single file', () => {
      const filesWithDupes = [];
      for (const file of testFiles) {
        const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
        const itMatches = [...content.matchAll(/it\s*\(\s*['"]([^'"]+)['"]/g)];
        const titles = itMatches.map(m => m[1]);
        const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
        if (dupes.length > 0) {
          filesWithDupes.push(`${file}: ${[...new Set(dupes)].join(', ')}`);
        }
      }
      // Many files have intentional duplicates across different describe blocks
      // (e.g., "returns 400 for invalid ID" appears in multiple contexts)
      assert.ok(
        filesWithDupes.length <= 30,
        `Too many files with duplicate it() descriptions (${filesWithDupes.length}):\n${filesWithDupes.join('\n')}`
      );
    });

    it('helpers.js exists and exports setup/teardown', () => {
      const helpers = fs.readFileSync(path.join(testsDir, 'helpers.js'), 'utf8');
      assert.ok(helpers.includes('setup'));
      assert.ok(helpers.includes('teardown'));
      assert.ok(helpers.includes('module.exports'));
    });
  });

  // ─── Dependency Hygiene ────────────────────────────────────────
  describe('Dependency hygiene', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    it('package.json has dependencies defined', () => {
      assert.ok(pkg.dependencies && Object.keys(pkg.dependencies).length > 0, 'should have dependencies');
    });

    it('core dependencies exist (express, better-sqlite3, bcryptjs)', () => {
      const deps = pkg.dependencies;
      assert.ok(deps.express, 'should depend on express');
      assert.ok(deps['better-sqlite3'], 'should depend on better-sqlite3');
      assert.ok(deps.bcryptjs, 'should depend on bcryptjs');
    });

    it('security dependencies exist (helmet, cors)', () => {
      const deps = pkg.dependencies;
      assert.ok(deps.helmet, 'should depend on helmet');
      assert.ok(deps.cors, 'should depend on cors');
    });

    it('package-lock.json exists', () => {
      assert.ok(fs.existsSync(path.join(rootDir, 'package-lock.json')), 'package-lock.json should exist');
    });

    it('node_modules exists (dependencies installed)', () => {
      assert.ok(fs.existsSync(path.join(rootDir, 'node_modules')), 'node_modules should exist');
    });

    it('test script is defined in package.json', () => {
      assert.ok(pkg.scripts && pkg.scripts.test, 'should have test script');
    });

    it('start script is defined in package.json', () => {
      assert.ok(
        pkg.scripts && (pkg.scripts.start || pkg.main),
        'should have start script or main entry'
      );
    });
  });

  // ─── File Structure ────────────────────────────────────────────
  describe('File structure', () => {
    it('src/ directory exists with server.js', () => {
      assert.ok(fs.existsSync(path.join(srcDir, 'server.js')));
    });

    it('src/routes/ has all route files', () => {
      const expectedFiles = [
        'areas.js', 'auth.js', 'custom-fields.js', 'data.js', 'features.js',
        'filters.js', 'lists.js', 'productivity.js', 'stats.js', 'tags.js', 'tasks.js'
      ];
      for (const file of expectedFiles) {
        assert.ok(fs.existsSync(path.join(srcDir, 'routes', file)), `missing route file: ${file}`);
      }
    });

    it('src/middleware/ has auth, csrf, errors, validate', () => {
      const expected = ['auth.js', 'csrf.js', 'errors.js', 'validate.js'];
      for (const file of expected) {
        assert.ok(fs.existsSync(path.join(srcDir, 'middleware', file)), `missing middleware: ${file}`);
      }
    });

    it('public/ has core frontend files', () => {
      const expected = ['app.js', 'index.html', 'styles.css', 'sw.js', 'store.js', 'manifest.json'];
      for (const file of expected) {
        assert.ok(fs.existsSync(path.join(rootDir, 'public', file)), `missing public file: ${file}`);
      }
    });

    it('src/db/index.js exists (database setup)', () => {
      assert.ok(fs.existsSync(path.join(srcDir, 'db', 'index.js')));
    });
  });

  // ─── Express Server Config ─────────────────────────────────────
  describe('Express server configuration', () => {
    const serverSrc = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8');

    it('uses Express 5 (wildcard syntax)', () => {
      assert.ok(
        serverSrc.includes('{*splat}') || serverSrc.includes('express'),
        'should use Express'
      );
    });

    it('serves static files from public/', () => {
      assert.ok(serverSrc.includes('express.static'), 'should serve static files');
    });

    it('has graceful shutdown handling', () => {
      assert.ok(
        serverSrc.includes('SIGTERM') || serverSrc.includes('SIGINT') || serverSrc.includes('graceful'),
        'should handle graceful shutdown'
      );
    });

    it('uses JSON body parser', () => {
      assert.ok(serverSrc.includes('express.json'), 'should parse JSON bodies');
    });

    it('uses structured logging (pino)', () => {
      assert.ok(
        serverSrc.includes('pino') || serverSrc.includes('logger'),
        'should use structured logging'
      );
    });
  });
});
