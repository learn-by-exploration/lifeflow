'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

describe('Developer Workflow', () => {

  describe('.editorconfig', () => {
    it('exists at project root', () => {
      assert.ok(fs.existsSync(path.join(ROOT, '.editorconfig')),
        '.editorconfig should exist');
    });

    it('sets root = true', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/^root\s*=\s*true/m.test(content),
        '.editorconfig should have root = true');
    });

    it('uses 2-space indent', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/indent_style\s*=\s*space/m.test(content),
        '.editorconfig should use space indentation');
      assert.ok(/indent_size\s*=\s*2/m.test(content),
        '.editorconfig should use indent_size = 2');
    });

    it('sets end_of_line = lf', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/end_of_line\s*=\s*lf/m.test(content),
        '.editorconfig should set end_of_line = lf');
    });

    it('sets charset = utf-8', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/charset\s*=\s*utf-8/m.test(content),
        '.editorconfig should set charset = utf-8');
    });

    it('trims trailing whitespace', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/trim_trailing_whitespace\s*=\s*true/m.test(content),
        '.editorconfig should trim trailing whitespace');
    });

    it('inserts final newline', () => {
      const content = fs.readFileSync(path.join(ROOT, '.editorconfig'), 'utf8');
      assert.ok(/insert_final_newline\s*=\s*true/m.test(content),
        '.editorconfig should insert final newline');
    });
  });

  describe('No console.log in src/', () => {
    it('src/ files use logger instead of console.log', () => {
      const srcDir = path.join(ROOT, 'src');
      const violations = [];

      function scanDir(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(full);
          } else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(full, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              // Skip comments
              const trimmed = line.trim();
              if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
              if (/\bconsole\.log\b/.test(line)) {
                violations.push(`${path.relative(ROOT, full)}:${i + 1}`);
              }
            }
          }
        }
      }

      scanDir(srcDir);
      assert.deepStrictEqual(violations, [],
        `console.log found in src/ files (use logger instead):\n  ${violations.join('\n  ')}`);
    });
  });

  describe('.gitignore', () => {
    const requiredEntries = ['*.db-shm', '*.db-wal', 'backups/', 'node_modules/'];

    for (const entry of requiredEntries) {
      it(`includes ${entry}`, () => {
        const content = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
        const lines = content.split('\n').map(l => l.trim());
        assert.ok(lines.includes(entry),
          `.gitignore should include ${entry}`);
      });
    }
  });

  describe('.env.example', () => {
    it('exists at project root', () => {
      assert.ok(fs.existsSync(path.join(ROOT, '.env.example')),
        '.env.example should exist');
    });

    it('contains all documented env vars from CLAUDE.md', () => {
      const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
      const requiredVars = [
        'PORT', 'DB_DIR', 'NODE_ENV', 'LOG_LEVEL',
        'RATE_LIMIT_MAX', 'SHUTDOWN_TIMEOUT_MS'
      ];
      const missing = requiredVars.filter(v => !content.includes(v));
      assert.deepStrictEqual(missing, [],
        `Missing env vars in .env.example: ${missing.join(', ')}`);
    });
  });

  describe('Dockerfile', () => {
    it('has USER node directive (no root in final stage)', () => {
      const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
      assert.ok(/^USER\s+node/m.test(content),
        'Dockerfile should have USER node directive');
    });

    it('has HEALTHCHECK directive', () => {
      const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
      assert.ok(/^HEALTHCHECK/m.test(content),
        'Dockerfile should have a HEALTHCHECK');
    });
  });

  describe('Docker Compose', () => {
    it('uses healthcheck or inherits from Dockerfile', () => {
      const content = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
      // Either has explicit healthcheck OR relies on Dockerfile HEALTHCHECK
      // The Dockerfile has HEALTHCHECK, so docker-compose inherits it.
      // Verify docker-compose builds from Dockerfile (which has HEALTHCHECK).
      const hasHealthcheck = /healthcheck:/m.test(content);
      const buildsDotfile = /build:\s*\.$/m.test(content) || /build:\s*\./m.test(content);
      assert.ok(hasHealthcheck || buildsDotfile,
        'docker-compose.yml should have healthcheck or build from Dockerfile with HEALTHCHECK');
    });
  });

  describe('src/ code quality', () => {
    it('all src/ JS files use consistent 2-space indentation', () => {
      const srcDir = path.join(ROOT, 'src');
      const violations = [];

      function scanDir(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(full);
          } else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(full, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              // Check lines that start with whitespace
              if (line.length > 0 && line[0] === '\t') {
                violations.push(`${path.relative(ROOT, full)}:${i + 1} uses tab indentation`);
                break; // One violation per file is enough
              }
            }
          }
        }
      }

      scanDir(srcDir);
      assert.deepStrictEqual(violations, [],
        `Files with tab indentation:\n  ${violations.join('\n  ')}`);
    });
  });

  describe('Version consistency', () => {
    it('package.json version is a valid semver', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'version should be semver');
    });

    it('CLAUDE.md header references current package.json version', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const content = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
      assert.ok(content.includes(pkg.version),
        `CLAUDE.md should reference version ${pkg.version}`);
    });

    it('openapi.yaml version matches package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const content = fs.readFileSync(path.join(ROOT, 'docs/openapi.yaml'), 'utf8');
      const match = content.match(/version:\s*(\S+)/);
      assert.ok(match, 'openapi.yaml should have a version field');
      assert.equal(match[1], pkg.version, 'openapi.yaml version should match package.json');
    });

    it('CHANGELOG.md has current version entry', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const content = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
      assert.ok(content.includes(`[${pkg.version}]`),
        `CHANGELOG.md should have a [${pkg.version}] entry`);
    });
  });
});
