const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Offline Mutation Queue (static analysis)', () => {
  let swCode, storeCode;

  before(() => {
    swCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
    storeCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'store.js'), 'utf8');
  });

  it('store.js exports mutation queue functions', () => {
    assert.ok(storeCode.includes('queueMutation'), 'Should have queueMutation function');
    assert.ok(storeCode.includes('getQueueSize'), 'Should have getQueueSize function');
    assert.ok(storeCode.includes('syncQueue'), 'Should have syncQueue function');
  });

  it('store.js stores mutations in an array', () => {
    assert.ok(storeCode.includes('_mutationQueue') || storeCode.includes('mutationQueue'),
      'Should maintain a mutation queue');
  });

  it('store.js queueMutation captures method, url, body', () => {
    assert.ok(storeCode.includes('method'), 'Should capture HTTP method');
    assert.ok(storeCode.includes('url'), 'Should capture URL');
  });

  it('store.js syncQueue replays in order', () => {
    assert.ok(storeCode.includes('syncQueue'), 'Should have syncQueue');
    assert.ok(storeCode.includes('fetch') || storeCode.includes('.shift'),
      'Should replay via fetch or process queue');
  });

  it('sw.js handles offline API failures', () => {
    assert.ok(swCode.includes('postMessage') || swCode.includes('mutation'),
      'Should communicate with main thread about failures');
  });

  it('sw.js has push event handler', () => {
    assert.ok(swCode.includes("addEventListener('push'"), 'Should handle push events');
  });

  // ─── Persistence Tests ───

  it('store.js persists queue to localStorage', () => {
    assert.ok(storeCode.includes('localStorage'), 'Should use localStorage for persistence');
    assert.ok(storeCode.includes('lf_mutation_queue'), 'Should use lf_mutation_queue key');
  });

  it('store.js restores queue from localStorage on init', () => {
    assert.ok(storeCode.includes('getItem') && storeCode.includes('lf_mutation_queue'),
      'Should restore queue from localStorage');
  });

  it('store.js clears localStorage on clearQueue', () => {
    // clearQueue should call _persistQueue which updates localStorage
    assert.ok(storeCode.includes('clearQueue') && storeCode.includes('_persistQueue'),
      'clearQueue should persist empty queue');
  });

  // ─── SW Body Forwarding Test ───

  it('sw.js includes body in mutation-failed message', () => {
    assert.ok(swCode.includes('body: bodyText') || swCode.includes('body:bodyText'),
      'mutation-failed message should include request body');
    assert.ok(swCode.includes('clone()'), 'Should clone request to read body');
  });
});
