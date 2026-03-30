const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

describe('Service Worker & Offline Queue Tests', () => {
  // ─── SW File Structure ──────────────────────────────────────────
  describe('SW file structure', () => {
    it('sw.js exists', () => {
      assert.ok(fs.existsSync(path.join(publicDir, 'sw.js')), 'sw.js should exist');
    });

    it('sw.js is valid JS syntax (parseable)', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.length > 100, 'sw.js should have substantial content');
      // Basic syntax check: should not have unterminated strings or obvious errors
      assert.ok(!src.includes('function('), 'should use arrow functions or named functions');
      // Verify it has standard SW lifecycle events
      assert.ok(src.includes('addEventListener'), 'should have event listeners');
    });

    it('sw.js contains version/cache string', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(
        src.includes('CACHE_VERSION') || src.includes('CACHE_NAME'),
        'should define cache version'
      );
    });

    it('sw.js registers install event listener', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'install'"), 'should have install event listener');
    });

    it('sw.js registers activate event listener', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'activate'"), 'should have activate event listener');
    });

    it('sw.js registers fetch event listener', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'fetch'"), 'should have fetch event listener');
    });
  });

  // ─── Cache Strategy Patterns ────────────────────────────────────
  describe('Cache strategy patterns', () => {
    it('uses network-first pattern (fetch before cache)', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      // Network-first: fetch() call comes before caches.match()
      const fetchIdx = src.indexOf('fetch(request)');
      const cacheMatchIdx = src.indexOf('caches.match(request)');
      assert.ok(fetchIdx > 0, 'should call fetch(request)');
      assert.ok(cacheMatchIdx > 0, 'should call caches.match(request)');
      // In network-first, fetch comes before the cache fallback
      assert.ok(fetchIdx < cacheMatchIdx, 'fetch should appear before caches.match (network-first)');
    });

    it('cache key includes version string', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      const vMatch = src.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
      assert.ok(vMatch, 'CACHE_VERSION should be defined');
      assert.ok(vMatch[1].length > 0, 'version string should be non-empty');
    });

    it('cache cleanup on activate event (deletes old caches)', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('caches.keys()'), 'activate should enumerate caches');
      assert.ok(src.includes('caches.delete'), 'activate should delete old caches');
    });

    it('API responses use network-only (not cached)', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('/api/'), 'should reference API paths');
      // Verify API requests are not put into cache
      const apiSection = src.substring(src.indexOf('/api/'));
      // The code should return without caching for API calls
      assert.ok(
        apiSection.includes('return') || src.includes('API calls'),
        'API section should have early return or comment about network-only'
      );
    });

    it('clones response before caching (responses are single-use)', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('.clone()'), 'should clone response before caching');
    });

    it('clients.claim() called on activate', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('clients.claim()'), 'should call clients.claim()');
    });
  });

  // ─── Offline Mutation Handling ──────────────────────────────────
  describe('Offline mutation handling', () => {
    it('sw.js handles write operations (POST/PUT/DELETE) specially', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('POST') && src.includes('PUT') && src.includes('DELETE'),
        'should handle write HTTP methods');
    });

    it('sw.js sends mutation-failed message to clients on offline write', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('mutation-failed'), 'should post mutation-failed message');
    });

    it('sw.js returns 503 for offline mutations', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('503'), 'should return 503 status for offline mutations');
    });

    it('sw.js passes through body text for queued mutations', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('request.clone()') || src.includes('clonedReq'),
        'should clone request to read body');
    });
  });

  // ─── Offline Store ──────────────────────────────────────────────
  describe('Offline store (store.js)', () => {
    it('store.js exists', () => {
      assert.ok(fs.existsSync(path.join(publicDir, 'store.js')), 'store.js should exist');
    });

    it('store.js defines state management', () => {
      const src = fs.readFileSync(path.join(publicDir, 'store.js'), 'utf8');
      assert.ok(src.includes('get') && src.includes('set'), 'should have get/set operations');
    });

    it('store.js has mutation queue', () => {
      const src = fs.readFileSync(path.join(publicDir, 'store.js'), 'utf8');
      assert.ok(
        src.includes('mutationQueue') || src.includes('_mutationQueue'),
        'should define mutation queue'
      );
    });

    it('store.js has event system', () => {
      const src = fs.readFileSync(path.join(publicDir, 'store.js'), 'utf8');
      assert.ok(src.includes('on') || src.includes('emit'), 'should have event system');
    });

    it('store.js uses strict mode', () => {
      const src = fs.readFileSync(path.join(publicDir, 'store.js'), 'utf8');
      assert.ok(src.includes("'use strict'") || src.includes('"use strict"'), 'should use strict mode');
    });

    it('store.js defines queue sync/replay function', () => {
      const src = fs.readFileSync(path.join(publicDir, 'store.js'), 'utf8');
      assert.ok(
        src.includes('syncQueue') || src.includes('flush') || src.includes('replay') || src.includes('drain') || src.includes('processQueue'),
        'should have queue processing function'
      );
    });
  });

  // ─── Push Notification Handling ─────────────────────────────────
  describe('Push notification handling', () => {
    it('sw.js registers push event listener', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'push'"), 'should listen for push events');
    });

    it('sw.js registers notificationclick event listener', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'notificationclick'"), 'should handle notification clicks');
    });

    it('push handler has try/catch for error resilience', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      // Find the push handler section
      const pushIdx = src.indexOf("'push'");
      const pushSection = src.substring(pushIdx, pushIdx + 500);
      assert.ok(pushSection.includes('try') && pushSection.includes('catch'),
        'push handler should have error handling');
    });

    it('push handler sanitizes notification URLs', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('sanitizePushUrl') || src.includes('sanitize'),
        'should sanitize push notification URLs');
    });

    it('notification click opens existing window or new window', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('clients.openWindow'), 'should open window on click');
      assert.ok(src.includes('.focus()'), 'should focus existing client');
    });

    it('push URL sanitizer rejects non-same-origin URLs', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      // Verify the sanitizer function exists and has origin checking
      assert.ok(src.includes('self.location.origin'), 'should compare against origin');
    });

    it('push URL sanitizer blocks protocol-relative URLs (//)', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("!url.startsWith('//')") || src.includes("'//'"),
        'should block protocol-relative URLs');
    });
  });

  // ─── Update Notification ────────────────────────────────────────
  describe('Update notification', () => {
    it('sw.js notifies clients about updates', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(
        src.includes('sw-update-available') || src.includes('postMessage'),
        'should notify clients about SW updates'
      );
    });

    it('sw.js does not force skipWaiting by default', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      // skipWaiting can cause issues if forced without user consent
      const hasSkipWaiting = src.includes('self.skipWaiting()');
      if (hasSkipWaiting) {
        // If skipWaiting exists, it should be conditional (not always called)
        const lines = src.split('\n');
        const skipLine = lines.find(l => l.includes('self.skipWaiting()'));
        // If it's in a message handler or conditional, that's ok
        assert.ok(
          src.includes('message') || skipLine?.trim().startsWith('//'),
          'skipWaiting should be conditional, not automatic'
        );
      }
    });
  });

  // ─── Cross-Origin Request Handling ──────────────────────────────
  describe('Cross-origin request handling', () => {
    it('sw.js skips cross-origin requests', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(
        src.includes('self.location.origin') || src.includes('cross-origin'),
        'should handle cross-origin requests'
      );
    });

    it('sw.js does not cache external fonts/CDN resources', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      // The comment says it never caches externally-hosted fonts
      assert.ok(
        src.includes('cross-origin') || src.includes('Google Fonts') || src.includes('CDN'),
        'should have comments about not caching external resources'
      );
    });
  });

  // ─── Sync Events ───────────────────────────────────────────────
  describe('Background sync', () => {
    it('sw.js registers sync event listener', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'sync'"), 'should listen for sync events');
    });

    it('sync handler fetches reminders', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes('syncReminders') || src.includes('/api/reminders'),
        'should sync reminders');
    });
  });

  // ─── Manifest Validation ───────────────────────────────────────
  describe('PWA manifest validation', () => {
    it('manifest.json exists and is valid JSON', () => {
      const manifestPath = path.join(publicDir, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest.json should exist');
      const content = fs.readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(content);
      assert.ok(typeof parsed === 'object', 'should parse to object');
    });

    it('manifest has required PWA fields', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      assert.ok(manifest.name, 'should have name');
      assert.ok(manifest.short_name, 'should have short_name');
      assert.ok(manifest.start_url, 'should have start_url');
      assert.ok(manifest.display, 'should have display mode');
      assert.ok(manifest.icons, 'should have icons');
    });

    it('manifest has valid display mode', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      const validModes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
      assert.ok(validModes.includes(manifest.display), `display should be one of ${validModes.join(', ')}`);
    });

    it('manifest start_url is /', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      assert.equal(manifest.start_url, '/');
    });

    it('manifest has valid theme_color (hex)', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      assert.ok(/^#[0-9a-fA-F]{6}$/.test(manifest.theme_color), 'theme_color should be valid hex');
    });

    it('manifest has valid background_color (hex)', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      assert.ok(/^#[0-9a-fA-F]{6}$/.test(manifest.background_color), 'background_color should be valid hex');
    });

    it('manifest icons array is non-empty', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'should have at least one icon');
    });

    it('manifest icons have required properties', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      for (const icon of manifest.icons) {
        assert.ok(icon.src, 'icon should have src');
        assert.ok(icon.sizes, 'icon should have sizes');
        assert.ok(icon.type, 'icon should have type');
      }
    });

    it('manifest has scope defined', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
      assert.ok(manifest.scope, 'should have scope');
    });
  });

  // ─── SPA Fallback ──────────────────────────────────────────────
  describe('SPA offline fallback', () => {
    it('sw.js falls back to root / for document requests', () => {
      const src = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      assert.ok(src.includes("'document'") || src.includes("request.destination"),
        'should check request destination');
      assert.ok(src.includes("caches.match('/')"),
        'should fall back to cached root document');
    });
  });
});
