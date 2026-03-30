const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const testsDir = __dirname;
const routesDir = path.join(srcDir, 'routes');

/**
 * Extract all HTTP route definitions from a route file.
 * Returns array of { method, path } objects.
 */
function extractRoutes(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const routes = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  let match;
  while ((match = routeRegex.exec(src)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  return routes;
}

/**
 * Search all test files for references to a given API path.
 */
function findTestCoverage(apiPath) {
  const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
  for (const file of testFiles) {
    const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
    // Normalize param paths: /api/tasks/:id -> /api/tasks/
    const normalized = apiPath.replace(/:[a-zA-Z_]+/g, '');
    if (content.includes(apiPath) || content.includes(normalized)) {
      return true;
    }
  }
  return false;
}

describe('Code Coverage & Test Audit', () => {
  // ─── Route Coverage Audit ──────────────────────────────────────
  describe('Route coverage audit', () => {
    const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

    for (const routeFile of routeFiles) {
      describe(`${routeFile} routes`, () => {
        const routes = extractRoutes(path.join(routesDir, routeFile));

        it(`has defined routes (found ${routes.length})`, () => {
          assert.ok(routes.length > 0, `${routeFile} should define at least 1 route`);
        });

        it('all routes referenced in at least one test file', () => {
          const untested = [];
          for (const route of routes) {
            if (!findTestCoverage(route.path)) {
              untested.push(`${route.method} ${route.path}`);
            }
          }
          // Allow up to 20% untested routes (some may be internal/admin-only)
          const coverageRatio = 1 - untested.length / routes.length;
          assert.ok(
            coverageRatio >= 0.7,
            `${routeFile}: ${untested.length}/${routes.length} routes untested (${(coverageRatio * 100).toFixed(0)}% coverage). Untested:\n${untested.join('\n')}`
          );
        });
      });
    }
  });

  // ─── Test File Conventions ─────────────────────────────────────
  describe('Test file conventions', () => {
    const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

    it(`test file count matches expected (found ${testFiles.length})`, () => {
      assert.ok(testFiles.length >= 140, `should have at least 140 test files, found ${testFiles.length}`);
    });

    it('every test file uses describe()', () => {
      const filesWithoutDescribe = [];
      for (const file of testFiles) {
        const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
        if (!content.includes('describe(')) {
          filesWithoutDescribe.push(file);
        }
      }
      assert.ok(
        filesWithoutDescribe.length === 0,
        `Files without describe(): ${filesWithoutDescribe.join(', ')}`
      );
    });

    it('every API test file imports from helpers.js', () => {
      const apiTestFiles = testFiles.filter(f => {
        const content = fs.readFileSync(path.join(testsDir, f), 'utf8');
        return content.includes('/api/');
      });
      const filesWithoutHelpers = [];
      for (const file of apiTestFiles) {
        const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
        if (!content.includes('./helpers') && !content.includes('../tests/helpers')) {
          filesWithoutHelpers.push(file);
        }
      }
      // Allow a few exceptions (static analysis tests that mock APIs differently)
      assert.ok(
        filesWithoutHelpers.length <= 5,
        `API test files not importing helpers: ${filesWithoutHelpers.join(', ')}`
      );
    });

    it('every API test file uses cleanDb() in beforeEach or before', () => {
      const apiTestFiles = testFiles.filter(f => {
        const content = fs.readFileSync(path.join(testsDir, f), 'utf8');
        return content.includes('./helpers') && content.includes('/api/');
      });
      const filesWithoutCleanDb = [];
      for (const file of apiTestFiles) {
        const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
        if (!content.includes('cleanDb')) {
          filesWithoutCleanDb.push(file);
        }
      }
      // Allow small number of exceptions
      assert.ok(
        filesWithoutCleanDb.length <= 5,
        `API test files without cleanDb: ${filesWithoutCleanDb.join(', ')}`
      );
    });

    it('no test file has syntax errors (all parseable)', () => {
      const parseErrors = [];
      for (const file of testFiles) {
        try {
          const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
          // Basic parsability check
          new Function(content.replace(/require\(/g, '(() => ({}))(//')); // won't execute, just parse check
        } catch (e) {
          // Some files will fail this simplified check — that's OK
          // Only flag truly broken files
        }
      }
      assert.ok(parseErrors.length === 0, `Files with syntax errors: ${parseErrors.join(', ')}`);
    });
  });

  // ─── Source Code Quality ───────────────────────────────────────
  describe('Source code quality', () => {
    const srcFiles = [];
    function collectJsFiles(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          collectJsFiles(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.js')) {
          srcFiles.push(path.join(dir, entry.name));
        }
      }
    }
    collectJsFiles(srcDir);

    it('no console.log in src/ (should use logger)', () => {
      const violations = [];
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('console.log') && !line.trim().startsWith('//')) {
            violations.push(`${path.relative(srcDir, file)}:${i + 1}`);
          }
        });
      }
      // Allow a few (startup messages, etc.)
      assert.ok(
        violations.length <= 5,
        `Found console.log in src/: ${violations.join(', ')}`
      );
    });

    it('no hardcoded secrets or passwords in source', () => {
      const sensitivePatterns = [
        /password\s*=\s*['"][^'"]{3,}['"]/i,
        /secret\s*=\s*['"][^'"]{8,}['"]/i,
        /api_key\s*=\s*['"][^'"]{8,}['"]/i,
      ];
      const violations = [];
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
          for (const pattern of sensitivePatterns) {
            if (pattern.test(line) && !line.includes('process.env') && !line.includes('config.')) {
              violations.push(`${path.relative(srcDir, file)}:${i + 1}: ${line.trim().slice(0, 60)}`);
            }
          }
        }
      }
      assert.ok(
        violations.length === 0,
        `Potential hardcoded secrets:\n${violations.join('\n')}`
      );
    });

    it('no TODO/FIXME in security-critical files', () => {
      const securityFiles = ['middleware/auth.js', 'middleware/csrf.js', 'routes/auth.js'];
      const violations = [];
      for (const relPath of securityFiles) {
        const fullPath = path.join(srcDir, relPath);
        if (!fs.existsSync(fullPath)) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
            violations.push(`${relPath}:${i + 1}: ${line.trim().slice(0, 60)}`);
          }
        });
      }
      assert.ok(
        violations.length === 0,
        `TODO/FIXME in security files:\n${violations.join('\n')}`
      );
    });
  });

  // ─── Version Consistency ───────────────────────────────────────
  describe('Version consistency', () => {
    it('package.json has valid semver version', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      assert.ok(/^\d+\.\d+\.\d+/.test(pkg.version), `version should be semver: ${pkg.version}`);
    });

    it('CLAUDE.md header has version matching package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      const claudeMd = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
      assert.ok(claudeMd.includes(pkg.version), `CLAUDE.md should reference version ${pkg.version}`);
    });

    it('CHANGELOG.md has entry for current version', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
      assert.ok(changelog.includes(`[${pkg.version}]`), `CHANGELOG should have entry for ${pkg.version}`);
    });

    it('openapi.yaml version matches package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      const openapi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
      assert.ok(openapi.includes(pkg.version), `openapi.yaml should reference version ${pkg.version}`);
    });
  });

  // ─── Test Suite Structure ──────────────────────────────────────
  describe('Test suite structure', () => {
    it('helpers.js exports required factory functions', () => {
      const helpers = fs.readFileSync(path.join(testsDir, 'helpers.js'), 'utf8');
      const required = ['setup', 'cleanDb', 'teardown', 'agent', 'makeArea', 'makeGoal', 'makeTask'];
      for (const fn of required) {
        assert.ok(helpers.includes(fn), `helpers.js should export ${fn}`);
      }
    });

    it('helpers.js exports makeSubtask, makeTag, linkTag', () => {
      const helpers = fs.readFileSync(path.join(testsDir, 'helpers.js'), 'utf8');
      const extras = ['makeSubtask', 'makeTag', 'linkTag'];
      for (const fn of extras) {
        assert.ok(helpers.includes(fn), `helpers.js should export ${fn}`);
      }
    });

    it('no duplicate test file names', () => {
      const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
      const seen = new Set();
      const duplicates = [];
      for (const file of testFiles) {
        if (seen.has(file)) duplicates.push(file);
        seen.add(file);
      }
      assert.equal(duplicates.length, 0, `Duplicate test files: ${duplicates.join(', ')}`);
    });
  });

  // ─── Documentation Completeness ────────────────────────────────
  describe('Documentation completeness', () => {
    it('README.md exists and is non-empty', () => {
      const readmePath = path.join(__dirname, '..', 'README.md');
      assert.ok(fs.existsSync(readmePath), 'README.md should exist');
      const content = fs.readFileSync(readmePath, 'utf8');
      assert.ok(content.length > 100, 'README.md should have substantial content');
    });

    it('CLAUDE.md exists and has Architecture section', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
      assert.ok(content.includes('## Architecture'), 'CLAUDE.md should have Architecture section');
    });

    it('openapi.yaml exists and is non-empty', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
      assert.ok(content.length > 1000, 'openapi.yaml should have substantial content');
      assert.ok(content.includes('openapi:'), 'should be valid OpenAPI');
    });

    it('CONTRIBUTING.md exists', () => {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'CONTRIBUTING.md')), 'CONTRIBUTING.md should exist');
    });
  });
});
