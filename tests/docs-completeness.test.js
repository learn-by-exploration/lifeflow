const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Documentation completeness', () => {
  it('docs/deployment.md exists and contains nginx configuration', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'deployment.md');
    assert.ok(fs.existsSync(filePath), 'docs/deployment.md should exist');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('nginx') || content.includes('Nginx'), 'should contain nginx config');
    assert.ok(content.includes('proxy_pass'), 'should contain proxy_pass directive');
  });

  it('docs/deployment.md contains caddy configuration', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'docs', 'deployment.md'), 'utf8');
    assert.ok(content.includes('caddy') || content.includes('Caddy'), 'should contain caddy config');
    assert.ok(content.includes('reverse_proxy'), 'should contain reverse_proxy directive');
  });

  it('CONTRIBUTING.md references current test command and node version', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'CONTRIBUTING.md'), 'utf8');
    assert.ok(content.includes('npm test'), 'should reference npm test');
    assert.ok(content.includes('node:test'), 'should reference node:test runner');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const engines = pkg.engines?.node || '';
    assert.ok(engines.includes('22'), 'package.json should require node 22+');
  });
});
