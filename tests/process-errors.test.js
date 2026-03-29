const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

describe('Process Error Handlers', () => {
  const serverPath = path.join(__dirname, '..', 'src', 'server.js');

  it('server.js contains uncaughtException handler', () => {
    const source = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      source.includes("process.on('uncaughtException'"),
      'server.js must register an uncaughtException handler'
    );
  });

  it('server.js contains unhandledRejection handler', () => {
    const source = fs.readFileSync(serverPath, 'utf8');
    assert.ok(
      source.includes("process.on('unhandledRejection'"),
      'server.js must register an unhandledRejection handler'
    );
  });

  it('uncaughtException handler logs and exits', () => {
    const source = fs.readFileSync(serverPath, 'utf8');
    // Find the uncaughtException handler block and verify it calls process.exit
    const handlerMatch = source.match(/process\.on\('uncaughtException'[\s\S]*?process\.exit\(1\)/);
    assert.ok(handlerMatch, 'uncaughtException handler must call process.exit(1)');
    assert.ok(handlerMatch[0].includes('logger.error'), 'uncaughtException handler must log the error');
  });

  it('unhandledRejection handler logs and exits', () => {
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerMatch = source.match(/process\.on\('unhandledRejection'[\s\S]*?process\.exit\(1\)/);
    assert.ok(handlerMatch, 'unhandledRejection handler must call process.exit(1)');
    assert.ok(handlerMatch[0].includes('logger.error'), 'unhandledRejection handler must log the error');
  });
});
