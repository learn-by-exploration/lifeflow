'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

describe('ESLint Configuration', () => {
  // ── Config file presence & structure ──

  it('.eslintrc.json exists', () => {
    const exists = fs.existsSync(path.join(ROOT, '.eslintrc.json'));
    assert.ok(exists, '.eslintrc.json should exist at project root');
  });

  it('.eslintrc.json is valid JSON', () => {
    const raw = fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), '.eslintrc.json should be valid JSON');
  });

  it('config extends eslint:recommended', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.ok(Array.isArray(config.extends), 'extends should be an array');
    assert.ok(config.extends.includes('eslint:recommended'), 'should extend eslint:recommended');
  });

  it('config sets node environment', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.ok(config.env, 'env should be defined');
    assert.equal(config.env.node, true, 'env.node should be true');
  });

  it('config sets es2022 environment', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.equal(config.env.es2022, true, 'env.es2022 should be true');
  });

  it('config sets ecmaVersion 2022', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.ok(config.parserOptions, 'parserOptions should be defined');
    assert.equal(config.parserOptions.ecmaVersion, 2022, 'ecmaVersion should be 2022');
  });

  // ── Rule checks ──

  it('enforces eqeqeq rule', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.ok(config.rules.eqeqeq, 'eqeqeq rule should be defined');
  });

  it('enforces no-var rule', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.equal(config.rules['no-var'], 'error', 'no-var should be error');
  });

  it('has prefer-const rule', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.ok(config.rules['prefer-const'], 'prefer-const rule should be defined');
  });

  it('has no-unused-vars with argsIgnorePattern', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    const rule = config.rules['no-unused-vars'];
    assert.ok(Array.isArray(rule), 'no-unused-vars should be an array');
    const opts = rule.find(r => typeof r === 'object');
    assert.ok(opts, 'no-unused-vars should have options object');
    assert.ok(opts.argsIgnorePattern, 'should have argsIgnorePattern');
    assert.match(opts.argsIgnorePattern, /\^_/, 'argsIgnorePattern should ignore _ prefixed args');
  });

  it('has test file overrides', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.eslintrc.json'), 'utf8'));
    assert.ok(Array.isArray(config.overrides), 'overrides should be an array');
    const testOverride = config.overrides.find(o =>
      Array.isArray(o.files) && o.files.some(f => f.includes('tests'))
    );
    assert.ok(testOverride, 'should have an override for test files');
  });

  // ── Package.json scripts ──

  it('package.json has lint script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.lint, 'lint script should exist');
  });

  it('package.json has lint:fix script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts['lint:fix'], 'lint:fix script should exist');
  });

  it('lint script targets src/ and tests/', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const lint = pkg.scripts.lint;
    assert.ok(lint.includes('src/'), 'lint script should target src/');
    assert.ok(lint.includes('tests/'), 'lint script should target tests/');
  });

  // ── Live lint execution ──

  it('no ESLint errors in src/', () => {
    const result = execSync('npx eslint src/ --format json', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    const report = JSON.parse(result);
    const errorCount = report.reduce((sum, f) => sum + f.errorCount, 0);
    assert.equal(errorCount, 0, `src/ should have 0 ESLint errors but has ${errorCount}`);
  });

  it('no ESLint errors in tests/', () => {
    const result = execSync('npx eslint tests/ --format json', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000,
    });
    const report = JSON.parse(result);
    const errorCount = report.reduce((sum, f) => sum + f.errorCount, 0);
    assert.equal(errorCount, 0, `tests/ should have 0 ESLint errors but has ${errorCount}`);
  });
});
