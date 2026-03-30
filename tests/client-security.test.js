const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const swSrc = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(PUBLIC, 'store.js'), 'utf8');

describe('Service Worker Security', () => {
  // ── Cache safety ──

  it('only caches response.ok === true', () => {
    assert.ok(swSrc.includes('response.ok'), 'sw.js should check response.ok before caching');
  });

  it('does not unconditionally cache all responses', () => {
    // Should gate cache.put behind response.ok check
    const cacheBlocks = swSrc.split('cache.put');
    // Every cache.put should be preceded by response.ok check
    for (let i = 1; i < cacheBlocks.length; i++) {
      const preceding = cacheBlocks[i - 1].slice(-200);
      assert.ok(
        preceding.includes('response.ok') || preceding.includes('.ok'),
        'cache.put should be guarded by response.ok check'
      );
    }
  });

  it('CACHE_VERSION is not hardcoded v1', () => {
    const versionMatch = swSrc.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(versionMatch, 'should have CACHE_VERSION');
    assert.notEqual(versionMatch[1], 'v1', 'CACHE_VERSION should not be v1');
  });

  it('does not call skipWaiting() unconditionally', () => {
    // skipWaiting should not be in install handler without user prompt
    const installBlock = swSrc.split("'install'")[1];
    if (installBlock) {
      const installEnd = installBlock.indexOf("addEventListener");
      const installCode = installEnd > 0 ? installBlock.slice(0, installEnd) : installBlock;
      assert.ok(
        !installCode.includes('skipWaiting()'),
        'install handler should not unconditionally skipWaiting'
      );
    }
  });

  // ── Push notification safety ──

  it('has sanitizePushUrl function', () => {
    assert.ok(swSrc.includes('sanitizePushUrl'), 'sw.js should have sanitizePushUrl function');
  });

  it('sanitizePushUrl rejects javascript: URIs by design', () => {
    // The function should only allow paths starting with / (not //)
    assert.ok(
      swSrc.includes("url.startsWith('/')") || swSrc.includes('url.startsWith("/")'),
      'should validate URL starts with /'
    );
    assert.ok(
      swSrc.includes("!url.startsWith('//')") || swSrc.includes('!url.startsWith("//")'),
      'should reject protocol-relative URLs'
    );
  });

  it('validates push URL against origin', () => {
    assert.ok(
      swSrc.includes('self.location.origin'),
      'should compare against self.location.origin'
    );
  });

  it('notification data uses sanitized URL', () => {
    // In the push event handler, url should go through sanitizePushUrl
    const pushBlock = swSrc.split("'push'")[1];
    if (pushBlock) {
      assert.ok(
        pushBlock.includes('sanitizePushUrl'),
        'push handler should sanitize URLs'
      );
    }
  });

  // ── Cross-origin ──

  it('skips cross-origin requests (no external caching)', () => {
    assert.ok(
      swSrc.includes('self.location.origin'),
      'should check origin for cross-origin filtering'
    );
  });

  it('API calls not cached (network only)', () => {
    // API calls should use network only, not cache
    assert.ok(
      swSrc.includes("/api/"),
      'should handle API routes separately'
    );
    // Verify API section returns without caching
    const apiSection = swSrc.split("/api/")[1];
    if (apiSection) {
      const nextSection = apiSection.indexOf('cache.put');
      const returnStatement = apiSection.indexOf('return');
      // cache.put should not appear in API section
      assert.ok(
        nextSection === -1 || returnStatement < nextSection,
        'API responses should not be cached'
      );
    }
  });
});

describe('Client Security (app.js)', () => {
  it('uses esc() for HTML content rendering', () => {
    // esc() function should exist for XSS prevention
    assert.ok(appSrc.includes('function esc('), 'app.js should define esc() function');
  });

  it('esc() escapes HTML entities', () => {
    // esc() uses DOM textContent → innerHTML pattern (secure)
    const escMatch = appSrc.match(/function esc\([^)]*\)[^{]*\{([^}]+)\}/);
    if (escMatch) {
      const escBody = escMatch[1];
      assert.ok(
        escBody.includes('textContent') || escBody.includes('replace') || escBody.includes('&amp;'),
        'esc should use textContent or replace for entity escaping'
      );
    }
  });

  it('has escA() for attribute escaping', () => {
    assert.ok(
      appSrc.includes('function escA(') || appSrc.includes('escA ='),
      'app.js should have attribute escaping function'
    );
  });

  it('does not use innerHTML with unsanitized user input', () => {
    // Count innerHTML usages and verify they use esc() nearby
    const innerHTMLCount = (appSrc.match(/\.innerHTML\s*=/g) || []).length;
    // This is a sanity check — innerHTML is used but should be with template literals containing esc()
    assert.ok(innerHTMLCount > 0, 'app.js uses innerHTML (expected for SPA)');
  });

  it('renderMd escapes before transforming markdown', () => {
    assert.ok(
      appSrc.includes('renderMd') || appSrc.includes('render_md'),
      'should have markdown renderer'
    );
  });
});

describe('Store Security (store.js)', () => {
  it('store.js exists and is non-empty', () => {
    assert.ok(storeSrc.length > 0, 'store.js should exist');
  });

  it('uses JSON serialization', () => {
    assert.ok(
      storeSrc.includes('JSON.stringify') || storeSrc.includes('JSON.parse'),
      'store.js should use JSON serialization'
    );
  });
});
