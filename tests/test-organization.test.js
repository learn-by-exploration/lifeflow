const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname);

function getTestFiles() {
  return fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .sort();
}

describe('Test Organization', () => {

  describe('Naming conventions', () => {
    it('no test files with "phase" prefix', () => {
      const violations = getTestFiles().filter(f => /^phase\d/.test(f));
      assert.deepStrictEqual(violations, [],
        `Files with "phase" prefix found: ${violations.join(', ')}`);
    });

    it('no test files with "batch" prefix', () => {
      const violations = getTestFiles().filter(f => /^batch\d/.test(f));
      assert.deepStrictEqual(violations, [],
        `Files with "batch" prefix found: ${violations.join(', ')}`);
    });

    it('no test files with underscore in name (break_*)', () => {
      const violations = getTestFiles().filter(f => f.includes('_'));
      assert.deepStrictEqual(violations, [],
        `Files with underscore found: ${violations.join(', ')}`);
    });

    it('no test files with nav-phase prefix', () => {
      const violations = getTestFiles().filter(f => /^nav-phase/.test(f));
      assert.deepStrictEqual(violations, [],
        `Files with "nav-phase" prefix found: ${violations.join(', ')}`);
    });
  });

  describe('Structure', () => {
    it('all test files have top-level describe()', () => {
      const files = getTestFiles();
      const missing = [];
      for (const f of files) {
        const content = fs.readFileSync(path.join(testsDir, f), 'utf8');
        if (!content.includes('describe(')) {
          missing.push(f);
        }
      }
      assert.deepStrictEqual(missing, [],
        `Files missing describe(): ${missing.join(', ')}`);
    });

    it('tests/README.md exists', () => {
      const readmePath = path.join(testsDir, 'README.md');
      assert.ok(fs.existsSync(readmePath), 'tests/README.md should exist');
    });
  });
});
