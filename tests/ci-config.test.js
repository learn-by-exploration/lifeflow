'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

describe('CI/CD Pipeline Configuration', () => {
  const ciPath = path.join(ROOT, '.github', 'workflows', 'ci.yml');

  // ── File existence ──

  it('.github/workflows/ci.yml exists', () => {
    assert.ok(fs.existsSync(ciPath), 'CI workflow file should exist');
  });

  // ── Trigger configuration ──

  it('CI runs on push to main', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('push'), 'CI should trigger on push');
    assert.match(content, /push[\s\S]*?branches[\s\S]*?main/, 'push should target main branch');
  });

  it('CI runs on pull_request to main', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('pull_request'), 'CI should trigger on pull_request');
    assert.match(content, /pull_request[\s\S]*?branches[\s\S]*?main/, 'pull_request should target main branch');
  });

  // ── Node version matrix ──

  it('CI tests Node 22', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('22'), 'CI should test Node 22');
  });

  // ── Job structure ──

  it('CI has lint job before test', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(/lint:/m.test(content), 'CI should have a lint job');
    // test job should depend on lint (needs: lint)
    assert.match(content, /needs:\s*\[?\s*lint/, 'test job should need lint job');
  });

  it('CI has npm audit step', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(content.includes('npm audit'), 'CI should include npm audit step');
  });

  it('CI has audit job or step with --audit-level', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.match(content, /audit-level/, 'npm audit should specify --audit-level');
  });

  // ── YAML validity ──

  it('.github/workflows/ci.yml is valid YAML (basic structure)', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    // Verify essential YAML keys are present
    assert.ok(content.includes('name:'), 'YAML should have name key');
    assert.ok(/^on:/m.test(content), 'YAML should have on: trigger key');
    assert.ok(content.includes('jobs:'), 'YAML should have jobs key');
    assert.ok(content.includes('runs-on:'), 'YAML should have runs-on key');
    assert.ok(content.includes('steps:'), 'YAML should have steps key');
    // No tabs (YAML requires spaces)
    assert.ok(!content.includes('\t'), 'YAML should use spaces, not tabs');
  });

  it('CI audit job uses continue-on-error or allows failure', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.ok(
      content.includes('continue-on-error') || content.includes('|| true'),
      'audit should allow failure (continue-on-error or || true)'
    );
  });

  it('CI has dedicated audit job', () => {
    const content = fs.readFileSync(ciPath, 'utf8');
    assert.match(content, /audit:/m, 'CI should have a dedicated audit job');
  });
});
