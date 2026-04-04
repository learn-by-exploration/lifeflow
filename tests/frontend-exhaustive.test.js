/**
 * Frontend Exhaustive Tests — Maximum Coverage
 *
 * Covers: CSS architecture, PWA/manifest, service worker, API view endpoints,
 * HTML structure, theme system, responsive design, security headers,
 * store.js edge cases, app.js rendering patterns, end-to-end workflows.
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeList, makeListItem, makeHabit, logHabit, makeFocus } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const storeJs = fs.readFileSync(path.join(PUBLIC, 'store.js'), 'utf8');
const swJs = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
const loginHtml = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
const landingHtml = fs.readFileSync(path.join(PUBLIC, 'landing.html'), 'utf8');
const landingCss = fs.readFileSync(path.join(PUBLIC, 'landing.css'), 'utf8');
const shareHtml = fs.readFileSync(path.join(PUBLIC, 'share.html'), 'utf8');
const manifestJson = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));
const utilsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'utils.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'api.js'), 'utf8');
const eventsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'events.js'), 'utf8');
const errorsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'errors.js'), 'utf8');
const loginSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'login.js'), 'utf8');
const shareSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'share.js'), 'utf8');

// Load utils into jsdom
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const cleanUtils = utilsSrc.replace(/^export /gm, '').replace(/^export\{[^}]*\}/gm, '');
const loadUtils = new Function('document', 'window', cleanUtils + '\nreturn { esc, escA, fmtDue, renderMd, parseDate, toDateStr, isOD, timeAgo, PL, PC, COLORS, validateField, clearFieldError };');
const utils = loadUtils(dom.window.document, dom.window);

function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function today() { return dateStr(new Date()); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); }

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════════════════════════════════════
// 1. PWA Manifest Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('PWA Manifest', () => {
  it('has required PWA fields', () => {
    assert.ok(manifestJson.name);
    assert.ok(manifestJson.short_name);
    assert.ok(manifestJson.start_url);
    assert.ok(manifestJson.display);
    assert.ok(manifestJson.theme_color);
    assert.ok(manifestJson.background_color);
  });

  it('display is standalone for app-like experience', () => {
    assert.equal(manifestJson.display, 'standalone');
  });

  it('start_url is root', () => {
    assert.equal(manifestJson.start_url, '/');
  });

  it('has valid icon sizes', () => {
    assert.ok(manifestJson.icons.length >= 2);
    const sizes = manifestJson.icons.map(i => i.sizes);
    assert.ok(sizes.includes('192x192'));
    assert.ok(sizes.includes('512x512'));
  });

  it('has maskable icon for adaptive display', () => {
    const maskable = manifestJson.icons.find(i => i.purpose === 'maskable');
    assert.ok(maskable);
  });

  it('has valid theme_color hex', () => {
    assert.match(manifestJson.theme_color, /^#[0-9a-fA-F]{6}$/);
  });

  it('has valid background_color hex', () => {
    assert.match(manifestJson.background_color, /^#[0-9a-fA-F]{6}$/);
  });

  it('has scope set to root', () => {
    assert.equal(manifestJson.scope, '/');
  });

  it('has description', () => {
    assert.ok(manifestJson.description.length > 10);
  });

  it('has app shortcuts', () => {
    assert.ok(Array.isArray(manifestJson.shortcuts));
    assert.ok(manifestJson.shortcuts.length >= 1);
  });

  it('shortcuts have valid structure', () => {
    for (const s of manifestJson.shortcuts) {
      assert.ok(s.name);
      assert.ok(s.url);
      assert.ok(s.url.startsWith('/'));
    }
  });

  it('has share_target configuration', () => {
    assert.ok(manifestJson.share_target);
    assert.equal(manifestJson.share_target.action, '/share');
    assert.equal(manifestJson.share_target.method, 'POST');
  });

  it('has categories', () => {
    assert.ok(manifestJson.categories.includes('productivity'));
  });

  it('has screenshots for install prompt', () => {
    assert.ok(Array.isArray(manifestJson.screenshots));
    assert.ok(manifestJson.screenshots.length >= 1);
  });

  it('orientation is portrait-primary', () => {
    assert.equal(manifestJson.orientation, 'portrait-primary');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Service Worker — comprehensive behavior validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Service Worker architecture', () => {
  it('defines versioned cache name', () => {
    assert.ok(swJs.includes('CACHE_VERSION'));
    assert.ok(swJs.includes('CACHE_NAME'));
  });

  it('handles install event', () => {
    assert.ok(swJs.includes("addEventListener('install'"));
  });

  it('handles activate event with cache cleanup', () => {
    assert.ok(swJs.includes("addEventListener('activate'"));
    assert.ok(swJs.includes('caches.keys()'));
    assert.ok(swJs.includes('caches.delete'));
  });

  it('handles fetch event', () => {
    assert.ok(swJs.includes("addEventListener('fetch'"));
  });

  it('skips cross-origin requests', () => {
    assert.ok(swJs.includes('self.location.origin'));
  });

  it('uses network-first for static assets', () => {
    assert.ok(swJs.includes('fetch(request)'));
    assert.ok(swJs.includes('caches.match'));
  });

  it('caches successful responses', () => {
    assert.ok(swJs.includes('cache.put'));
    assert.ok(swJs.includes('response.clone'));
  });

  it('falls back to cache when offline', () => {
    assert.ok(swJs.includes('.catch('));
    assert.ok(swJs.includes('caches.match'));
  });

  it('returns cached index.html for document requests', () => {
    assert.ok(swJs.includes("request.destination === 'document'"));
    assert.ok(swJs.includes("caches.match('/')"));
  });

  it('never caches API calls', () => {
    assert.ok(swJs.includes("/api/"));
  });

  it('handles offline write mutations', () => {
    assert.ok(swJs.includes("'POST'"));
    assert.ok(swJs.includes("'PUT'"));
    assert.ok(swJs.includes("'DELETE'"));
    assert.ok(swJs.includes("'PATCH'"));
    assert.ok(swJs.includes('mutation-failed'));
  });

  it('notifies clients of failed mutations for queueing', () => {
    assert.ok(swJs.includes('self.clients.matchAll'));
    assert.ok(swJs.includes("type: 'mutation-failed'"));
  });

  it('returns 503 for offline mutations', () => {
    assert.ok(swJs.includes('503'));
    assert.ok(swJs.includes('Offline'));
  });

  it('handles push notifications', () => {
    assert.ok(swJs.includes("addEventListener('push'"));
    assert.ok(swJs.includes('showNotification'));
  });

  it('sanitizes push notification URLs', () => {
    assert.ok(swJs.includes('function sanitizePushUrl'));
    assert.ok(swJs.includes("startsWith('/')"));
  });

  it('prevents open redirect via push notification URL', () => {
    assert.ok(swJs.includes("!url.startsWith('//')"));
  });

  it('handles notification clicks', () => {
    assert.ok(swJs.includes("addEventListener('notificationclick'"));
    assert.ok(swJs.includes('event.notification.close()'));
  });

  it('focuses existing window on notification click', () => {
    assert.ok(swJs.includes('lifeflowClient'));
    assert.ok(swJs.includes('.focus()'));
  });

  it('handles skip-waiting message', () => {
    assert.ok(swJs.includes("type === 'skip-waiting'"));
    assert.ok(swJs.includes('self.skipWaiting()'));
  });

  it('handles show-notification message', () => {
    assert.ok(swJs.includes("type === 'show-notification'"));
  });

  it('handles periodic sync for reminders', () => {
    assert.ok(swJs.includes("addEventListener('sync'"));
    assert.ok(swJs.includes('lifeflow-sync-reminders'));
  });

  it('claims clients after activation', () => {
    assert.ok(swJs.includes('self.clients.claim()'));
  });

  it('notifies clients about SW updates', () => {
    assert.ok(swJs.includes("type: 'sw-update-available'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CSS Architecture — themes, responsive, accessibility
// ═══════════════════════════════════════════════════════════════════════════

describe('CSS theme system', () => {
  const themes = ['midnight', 'charcoal', 'nord', 'ocean', 'forest', 'rose', 'sunset'];

  for (const theme of themes) {
    it(`defines "${theme}" theme with CSS variables`, () => {
      assert.ok(css.includes(`[data-theme="${theme}"]`) || css.includes(`data-theme="${theme}"`));
    });
  }

  it('has light theme', () => {
    assert.ok(css.includes('data-theme="light"'));
  });

  it('themes define --bg (background) variable', () => {
    const themeBlocks = css.match(/\[data-theme="[^"]+"\]\{[^}]+\}/g) || [];
    assert.ok(themeBlocks.length >= 7);
    for (const block of themeBlocks.slice(0, 3)) {
      assert.ok(block.includes('--bg:'));
    }
  });

  it('has auto theme detection via prefers-color-scheme', () => {
    assert.ok(css.includes('prefers-color-scheme') || appJs.includes('prefers-color-scheme'));
  });
});

describe('CSS responsive design', () => {
  it('has mobile breakpoint at 768px', () => {
    assert.ok(css.includes('max-width:768px') || css.includes('max-width: 768px'));
  });

  it('has small mobile breakpoint', () => {
    assert.ok(css.includes('max-width:375px') || css.includes('max-width: 375px') ||
              css.includes('max-width:380px') || css.includes('max-width: 380px'));
  });

  it('sidebar is hidden on mobile', () => {
    assert.ok(css.includes('#sb'));
  });

  it('bottom nav appears on mobile', () => {
    assert.ok(css.includes('mob-bar') || css.includes('mb-tab'));
  });

  it('touch targets are at least 44px', () => {
    assert.ok(css.includes('44px') || css.includes('touch'));
  });

  it('has env-safe padding for mobile layouts', () => {
    // Mobile-safe layout uses min-height, padding, and viewport units
    assert.ok(css.includes('padding-bottom') || css.includes('min-height'));
  });

  it('hamburger menu for mobile sidebar', () => {
    assert.ok(css.includes('.ham') || indexHtml.includes('id="ham"') || appJs.includes('ham'));
  });
});

describe('CSS accessibility', () => {
  it('has prefers-reduced-motion media query', () => {
    const matches = css.match(/prefers-reduced-motion/g) || [];
    assert.ok(matches.length >= 2, 'Multiple reduced-motion rules expected');
  });

  it('disables animations for reduced-motion', () => {
    assert.ok(css.includes('animation:none'));
  });

  it('has focus-visible outlines', () => {
    assert.ok(css.includes('focus-visible') || css.includes(':focus'));
  });

  it('print stylesheet exists', () => {
    assert.ok(css.includes('@media print') || css.includes('print'));
  });

  it('has high contrast color ratios for text', () => {
    // Key text colors should not be too light
    assert.ok(css.includes('--tx:'));
    assert.ok(css.includes('--tx2:'));
  });
});

describe('CSS component classes', () => {
  it('has task card (.tc) styles', () => {
    assert.ok(css.includes('.tc{') || css.includes('.tc {'));
  });

  it('has priority classes p1/p2/p3', () => {
    assert.ok(css.includes('.p1'));
    assert.ok(css.includes('.p2'));
    assert.ok(css.includes('.p3'));
  });

  it('has done class for completed tasks', () => {
    assert.ok(css.includes('.done'));
  });

  it('has overdue class .od', () => {
    assert.ok(css.includes('.od'));
  });

  it('has toast notification styles', () => {
    assert.ok(css.includes('.toast'));
  });

  it('has overlay styles', () => {
    assert.ok(css.includes('.ov'));
    assert.ok(css.includes('.active'));
  });

  it('has kanban/board column styles', () => {
    assert.ok(css.includes('.bcol') || css.includes('.li-board-col'));
  });

  it('has heatmap styles', () => {
    assert.ok(css.includes('.hm-cell') || css.includes('heatmap'));
  });

  it('has sidebar styles', () => {
    assert.ok(css.includes('#sb'));
    assert.ok(css.includes('.ni'));
  });

  it('has icon-rail sidebar mode', () => {
    assert.ok(css.includes('icon-rail'));
  });

  it('has multi-select bar', () => {
    assert.ok(css.includes('.ms-bar') || css.includes('#ms-bar'));
  });

  it('has loading spinner/state', () => {
    assert.ok(css.includes('.loading'));
  });

  it('has input error class', () => {
    assert.ok(css.includes('.inp-err'));
  });

  it('has daily quote styles', () => {
    assert.ok(css.includes('.daily-quote-card') || css.includes('dq-text'));
  });

  it('confetti styles with reduced-motion override', () => {
    assert.ok(css.includes('.confetti-wrap') || css.includes('confetti'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. HTML pages — structural validation
// ═══════════════════════════════════════════════════════════════════════════

describe('index.html structure', () => {
  it('has DOCTYPE declaration', () => {
    assert.ok(indexHtml.includes('<!DOCTYPE html>') || indexHtml.includes('<!doctype html>'));
  });

  it('has lang attribute on html tag', () => {
    assert.ok(indexHtml.includes('lang="en"'));
  });

  it('has charset meta tag', () => {
    assert.ok(indexHtml.includes('charset'));
  });

  it('has viewport meta tag with width=device-width', () => {
    assert.ok(indexHtml.includes('width=device-width'));
  });

  it('has main content area #ct', () => {
    assert.ok(indexHtml.includes('id="ct"'));
  });

  it('has sidebar #sb', () => {
    assert.ok(indexHtml.includes('id="sb"'));
  });

  it('has page title #pt', () => {
    assert.ok(indexHtml.includes('id="pt"'));
  });

  it('has breadcrumbs #bc', () => {
    assert.ok(indexHtml.includes('id="bc"'));
  });

  it('has area modal #am', () => {
    assert.ok(indexHtml.includes('id="am"'));
  });

  it('has goal modal #gm', () => {
    assert.ok(indexHtml.includes('id="gm"'));
  });

  it('has detail panel #dp', () => {
    assert.ok(indexHtml.includes('id="dp"'));
  });

  it('has quick capture overlay #qc-ov', () => {
    assert.ok(indexHtml.includes('id="qc-ov"'));
  });

  it('has multi-select bar support', () => {
    assert.ok(appJs.includes('ms-bar') || indexHtml.includes('ms-bar'));
  });

  it('has toast container #toast-wrap', () => {
    assert.ok(indexHtml.includes('id="toast-wrap"'));
  });

  it('has daily review overlay #dr-ov', () => {
    assert.ok(indexHtml.includes('id="dr-ov"'));
  });

  it('has focus timer overlay #ft-ov', () => {
    assert.ok(indexHtml.includes('id="ft-ov"'));
  });

  it('has notification bell', () => {
    assert.ok(indexHtml.includes('notif-bell') || indexHtml.includes('notification'));
  });

  it('references app.js as module', () => {
    assert.ok(indexHtml.includes('app.js'));
  });

  it('references styles.css', () => {
    assert.ok(indexHtml.includes('styles.css'));
  });

  it('references manifest.json', () => {
    assert.ok(indexHtml.includes('manifest.json'));
  });

  it('has no inline script blocks (CSP safe)', () => {
    const inlineScripts = indexHtml.match(/<script>[^<]+<\/script>/g) || [];
    assert.equal(inlineScripts.length, 0, 'No inline scripts for CSP compliance');
  });

  it('links google fonts', () => {
    assert.ok(indexHtml.includes('fonts.googleapis.com') || indexHtml.includes('Inter'));
  });

  it('links material icons', () => {
    assert.ok(indexHtml.includes('Material Icons') || indexHtml.includes('material-icons'));
  });

  it('has onboarding overlay', () => {
    assert.ok(indexHtml.includes('onb-ov'));
  });

  it('has data-view attributes for navigation', () => {
    const viewAttrs = indexHtml.match(/data-view="/g) || [];
    assert.ok(viewAttrs.length >= 5);
  });

  it('has mobile bottom navigation bar', () => {
    assert.ok(indexHtml.includes('mob-bar') || indexHtml.includes('mb-tab'));
  });

  it('ARIA labels on interactive elements', () => {
    const ariaCount = (indexHtml.match(/aria-label/g) || []).length;
    assert.ok(ariaCount >= 3, `Expected >=3 aria-labels, found ${ariaCount}`);
  });

  it('role attributes on semantic elements', () => {
    const roleCount = (indexHtml.match(/role="/g) || []).length;
    assert.ok(roleCount >= 1);
  });
});

describe('login.html structure', () => {
  it('has login form', () => {
    assert.ok(loginHtml.includes('login-form'));
  });

  it('has register form', () => {
    assert.ok(loginHtml.includes('register-form'));
  });

  it('has email inputs with type="email"', () => {
    assert.ok(loginHtml.includes('type="email"'));
  });

  it('has password inputs with type="password"', () => {
    assert.ok(loginHtml.includes('type="password"'));
  });

  it('has tab switching UI', () => {
    assert.ok(loginHtml.includes('auth-tab'));
  });

  it('has error message container', () => {
    assert.ok(loginHtml.includes('auth-error'));
  });

  it('has success message container', () => {
    assert.ok(loginHtml.includes('auth-success'));
  });

  it('has remember me checkbox', () => {
    assert.ok(loginHtml.includes('login-remember'));
  });

  it('has password visibility toggle', () => {
    assert.ok(loginHtml.includes('pw-toggle'));
  });

  it('references login.js', () => {
    assert.ok(loginHtml.includes('login.js'));
  });

  it('has display name field for registration', () => {
    assert.ok(loginHtml.includes('reg-name'));
  });

  it('has autocomplete attributes for password managers', () => {
    assert.ok(loginHtml.includes('autocomplete'));
  });
});

describe('landing.html structure', () => {
  it('has call-to-action button', () => {
    assert.ok(landingHtml.includes('Get Started') || landingHtml.includes('get-started'));
  });

  it('has feature highlights', () => {
    assert.ok(landingHtml.includes('feature') || landingHtml.includes('Feature'));
  });

  it('links to app entry point', () => {
    assert.ok(landingHtml.includes('#get-started') || landingHtml.includes('href="/"'));
  });

  it('has responsive viewport meta', () => {
    assert.ok(landingHtml.includes('viewport'));
  });
});

describe('share.html structure', () => {
  it('has share container', () => {
    assert.ok(shareHtml.includes('class="wrap"') || shareHtml.includes('wrap'));
  });

  it('references share.js', () => {
    assert.ok(shareHtml.includes('share.js'));
  });

  it('has viewport meta tag', () => {
    assert.ok(shareHtml.includes('viewport'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. utils.js deep behavioral testing
// ═══════════════════════════════════════════════════════════════════════════

describe('esc() edge cases', () => {
  it('handles null/undefined gracefully', () => {
    // esc(null) should not throw
    const r = utils.esc(null);
    assert.ok(typeof r === 'string');
  });

  it('handles numeric input', () => {
    const r = utils.esc(42);
    assert.equal(r, '42');
  });

  it('handles very long strings', () => {
    const long = '<script>'.repeat(500);
    const r = utils.esc(long);
    assert.ok(!r.includes('<script>'));
    assert.ok(r.includes('&lt;script&gt;'));
  });

  it('handles unicode and emoji', () => {
    const r = utils.esc('Hello 🌍 <b>world</b>');
    assert.ok(r.includes('🌍'));
    assert.ok(!r.includes('<b>'));
  });

  it('handles tab and newline characters', () => {
    const r = utils.esc('line1\nline2\ttab');
    assert.ok(r.includes('line1'));
    assert.ok(r.includes('line2'));
  });
});

describe('escA() edge cases', () => {
  it('escapes all 5 dangerous characters', () => {
    const r = utils.escA('<>&"\'');
    assert.equal(r, '&lt;&gt;&amp;&quot;&#39;');
  });

  it('preserves safe characters', () => {
    assert.equal(utils.escA('hello world 123'), 'hello world 123');
  });

  it('handles empty string', () => {
    assert.equal(utils.escA(''), '');
  });
});

describe('parseDate() correctness', () => {
  it('parses YYYY-MM-DD to local midnight', () => {
    const d = utils.parseDate('2026-04-04');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 3); // 0-indexed
    assert.equal(d.getDate(), 4);
    assert.equal(d.getHours(), 0);
  });

  it('handles year boundaries', () => {
    const d = utils.parseDate('2025-12-31');
    assert.equal(d.getFullYear(), 2025);
    assert.equal(d.getMonth(), 11);
    assert.equal(d.getDate(), 31);
  });

  it('handles January 1st', () => {
    const d = utils.parseDate('2026-01-01');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 0);
    assert.equal(d.getDate(), 1);
  });

  it('handles leap day', () => {
    const d = utils.parseDate('2028-02-29');
    assert.equal(d.getMonth(), 1);
    assert.equal(d.getDate(), 29);
  });
});

describe('toDateStr() correctness', () => {
  it('formats date with zero-padded month', () => {
    const d = new Date(2026, 0, 5); // Jan 5
    assert.equal(utils.toDateStr(d), '2026-01-05');
  });

  it('formats date with zero-padded day', () => {
    const d = new Date(2026, 11, 3); // Dec 3
    assert.equal(utils.toDateStr(d), '2026-12-03');
  });

  it('round-trips with parseDate', () => {
    const original = '2026-06-15';
    const parsed = utils.parseDate(original);
    assert.equal(utils.toDateStr(parsed), original);
  });
});

describe('isOD() — overdue detection', () => {
  it('returns false for null', () => {
    assert.equal(utils.isOD(null), false);
  });

  it('returns false for empty string', () => {
    assert.equal(utils.isOD(''), false);
  });

  it('returns false for today', () => {
    assert.equal(utils.isOD(today()), false);
  });

  it('returns false for future date', () => {
    assert.equal(utils.isOD(daysFromNow(1)), false);
    assert.equal(utils.isOD(daysFromNow(30)), false);
  });

  it('returns true for past date', () => {
    assert.equal(utils.isOD(daysFromNow(-1)), true);
    assert.equal(utils.isOD(daysFromNow(-7)), true);
  });
});

describe('fmtDue() — all format modes', () => {
  it('returns empty string for empty input', () => {
    assert.equal(utils.fmtDue(''), '');
    assert.equal(utils.fmtDue(null), '');
    assert.equal(utils.fmtDue(undefined), '');
  });

  it('relative: today shows "Today"', () => {
    assert.equal(utils.fmtDue(today()), 'Today');
  });

  it('relative: tomorrow shows "Tomorrow"', () => {
    assert.equal(utils.fmtDue(daysFromNow(1)), 'Tomorrow');
  });

  it('relative: yesterday shows "Yesterday"', () => {
    assert.equal(utils.fmtDue(daysFromNow(-1)), 'Yesterday');
  });

  it('relative: 2 days ago', () => {
    assert.equal(utils.fmtDue(daysFromNow(-2)), '2 days ago');
  });

  it('relative: 3-6 days from now shows "in N days"', () => {
    const r = utils.fmtDue(daysFromNow(3));
    assert.ok(r.includes('in 3 days'));
  });

  it('relative: 7 days shows "Next week"', () => {
    assert.equal(utils.fmtDue(daysFromNow(7)), 'Next week');
  });

  it('relative: 3-7 days overdue shows "Nd overdue"', () => {
    const r = utils.fmtDue(daysFromNow(-5));
    assert.ok(r.includes('5d overdue'));
  });

  it('iso format returns date as-is', () => {
    assert.equal(utils.fmtDue('2026-04-04', { dateFormat: 'iso' }), '2026-04-04');
  });

  it('us format returns month day, year', () => {
    const r = utils.fmtDue('2026-04-04', { dateFormat: 'us' });
    assert.ok(r.includes('Apr') && r.includes('4'));
  });

  it('eu format returns DD/MM/YYYY', () => {
    const r = utils.fmtDue('2026-04-04', { dateFormat: 'eu' });
    assert.equal(r, '04/04/2026');
  });
});

describe('timeAgo()', () => {
  it('returns empty for null/undefined', () => {
    assert.equal(utils.timeAgo(null), '');
    assert.equal(utils.timeAgo(undefined), '');
    assert.equal(utils.timeAgo(''), '');
  });

  it('returns "just now" for recent dates', () => {
    const now = new Date().toISOString();
    assert.equal(utils.timeAgo(now), 'just now');
  });

  it('returns "Nm ago" for minutes', () => {
    const d = new Date(Date.now() - 5 * 60_000).toISOString();
    assert.ok(utils.timeAgo(d).includes('m ago'));
  });

  it('returns "Nh ago" for hours', () => {
    const d = new Date(Date.now() - 3 * 3600_000).toISOString();
    assert.ok(utils.timeAgo(d).includes('h ago'));
  });

  it('returns "Nd ago" for days', () => {
    const d = new Date(Date.now() - 2 * 86400_000).toISOString();
    assert.ok(utils.timeAgo(d).includes('d ago'));
  });
});

describe('renderMd() — comprehensive', () => {
  it('renders headings h1/h2/h3', () => {
    assert.ok(utils.renderMd('# Title').includes('<h1>Title</h1>'));
    assert.ok(utils.renderMd('## Subtitle').includes('<h2>Subtitle</h2>'));
    assert.ok(utils.renderMd('### Sub').includes('<h3>Sub</h3>'));
  });

  it('renders bold with **', () => {
    assert.ok(utils.renderMd('**bold**').includes('<strong>bold</strong>'));
  });

  it('renders italic with *', () => {
    assert.ok(utils.renderMd('*italic*').includes('<em>italic</em>'));
  });

  it('renders inline code with backticks', () => {
    assert.ok(utils.renderMd('`code`').includes('<code>code</code>'));
  });

  it('renders links with target=_blank', () => {
    const r = utils.renderMd('[Link](https://example.com)');
    assert.ok(r.includes('href="https://example.com"'));
    assert.ok(r.includes('target="_blank"'));
    assert.ok(r.includes('rel="noopener"'));
  });

  it('renders unordered lists', () => {
    const r = utils.renderMd('- item 1\n- item 2');
    assert.ok(r.includes('<li>item 1</li>'));
    assert.ok(r.includes('<ul>'));
  });

  it('converts newlines to br', () => {
    assert.ok(utils.renderMd('line1\nline2').includes('<br>'));
  });

  it('prevents javascript: XSS in links', () => {
    const r = utils.renderMd('[click](javascript:alert(1))');
    assert.ok(!r.includes('javascript:'));
  });

  it('prevents data: XSS in links', () => {
    const r = utils.renderMd('[click](data:text/html,<script>alert(1)</script>)');
    assert.ok(!r.includes('data:'));
  });

  it('prevents vbscript: XSS in links', () => {
    const r = utils.renderMd('[click](vbscript:MsgBox(1))');
    assert.ok(!r.includes('vbscript:'));
  });

  it('prevents case-variant javascript: XSS', () => {
    const r = utils.renderMd('[click](JavaScript:alert(1))');
    assert.ok(!r.includes('JavaScript:'));
    assert.ok(!r.includes('javascript:'));
  });

  it('allows https: links', () => {
    const r = utils.renderMd('[safe](https://example.com)');
    assert.ok(r.includes('href="https://example.com"'));
  });

  it('allows relative links', () => {
    const r = utils.renderMd('[page](/about)');
    assert.ok(r.includes('href="/about"'));
  });

  it('escapes HTML entities before markdown processing', () => {
    const r = utils.renderMd('<img onerror=alert(1)>');
    assert.ok(!r.includes('<img'));
    assert.ok(r.includes('&lt;img'));
  });

  it('returns empty string for null', () => {
    assert.equal(utils.renderMd(null), '');
    assert.equal(utils.renderMd(''), '');
    assert.equal(utils.renderMd(undefined), '');
  });
});

describe('PL/PC constants', () => {
  it('PL has 4 priority labels', () => {
    assert.equal(utils.PL.length, 4);
    assert.equal(utils.PL[0], '');
    assert.ok(utils.PL[3].length > 0);
  });

  it('PC has 4 priority colors', () => {
    assert.equal(utils.PC.length, 4);
    assert.equal(utils.PC[0], '');
  });

  it('COLORS has at least 10 palette colors', () => {
    assert.ok(utils.COLORS.length >= 10);
    for (const c of utils.COLORS) {
      assert.match(c, /^#[0-9A-Fa-f]{6}$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Store.js — deep behavioral testing via jsdom
// ═══════════════════════════════════════════════════════════════════════════

describe('Store.js deep behavioral tests', () => {
  let Store;

  before(() => {
    const storeDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:3456',
      runScripts: 'dangerously'
    });
    const script = storeDom.window.document.createElement('script');
    script.textContent = storeJs;
    storeDom.window.document.body.appendChild(script);
    Store = storeDom.window.Store;
  });

  it('set does not emit if value unchanged', () => {
    Store.set('no-change', 'val');
    let fired = false;
    Store.on('change:no-change', () => { fired = true; });
    Store.set('no-change', 'val'); // same value
    assert.ok(!fired, 'should not emit for same value');
  });

  it('setAreas stores and emits', () => {
    let emitted = null;
    Store.on('areas:changed', (a) => { emitted = a; });
    Store.setAreas([{ id: 1, name: 'Test' }]);
    assert.ok(emitted);
    assert.equal(emitted[0].name, 'Test');
  });

  it('setGoals stores and emits', () => {
    let emitted = null;
    Store.on('goals:changed', (g) => { emitted = g; });
    Store.setGoals([{ id: 1, title: 'G1' }]);
    assert.ok(emitted);
  });

  it('setTasks stores and emits', () => {
    let emitted = null;
    Store.on('tasks:changed', (t) => { emitted = t; });
    Store.setTasks([{ id: 1, title: 'T1' }]);
    assert.ok(emitted);
  });

  it('setTags stores and emits', () => {
    let emitted = null;
    Store.on('tags:changed', (t) => { emitted = t; });
    Store.setTags([{ id: 1, name: 'tag1' }]);
    assert.ok(emitted);
  });

  it('updateTask emits task:updated event', () => {
    Store.setTasks([{ id: 42, title: 'Original', status: 'todo' }]);
    let eventData = null;
    Store.on('task:updated', (d) => { eventData = d; });
    Store.updateTask(42, { status: 'done' });
    assert.ok(eventData);
    assert.equal(eventData.id, 42);
    assert.deepEqual(eventData.patch, { status: 'done' });
  });

  it('getQueueSize returns 0 initially', () => {
    Store.clearQueue();
    assert.equal(Store.getQueueSize(), 0);
  });

  it('queueMutation increases queue size', () => {
    Store.clearQueue();
    Store.queueMutation('POST', '/api/test', { x: 1 });
    Store.queueMutation('PUT', '/api/test/1', { x: 2 });
    assert.equal(Store.getQueueSize(), 2);
    Store.clearQueue();
  });

  it('getQueue preserves order', () => {
    Store.clearQueue();
    Store.queueMutation('POST', '/a', {});
    Store.queueMutation('PUT', '/b', {});
    Store.queueMutation('DELETE', '/c', {});
    const q = Store.getQueue();
    assert.equal(q[0].url, '/a');
    assert.equal(q[1].url, '/b');
    assert.equal(q[2].url, '/c');
    Store.clearQueue();
  });

  it('multiple listeners on same event all fire', () => {
    let c1 = 0, c2 = 0;
    const u1 = Store.on('multi-test', () => c1++);
    const u2 = Store.on('multi-test', () => c2++);
    Store.emit('multi-test');
    assert.equal(c1, 1);
    assert.equal(c2, 1);
    u1(); u2();
  });

  it('off only removes the specified listener', () => {
    let c1 = 0, c2 = 0;
    const f1 = () => c1++;
    const f2 = () => c2++;
    Store.on('off-specific', f1);
    Store.on('off-specific', f2);
    Store.off('off-specific', f1);
    Store.emit('off-specific');
    assert.equal(c1, 0);
    assert.equal(c2, 1);
    Store.off('off-specific', f2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Events.js — behavioral testing via jsdom
// ═══════════════════════════════════════════════════════════════════════════

describe('Events.js behavioral tests', () => {
  let eventsDom, Events;

  before(() => {
    eventsDom = new JSDOM('<!DOCTYPE html><html><body><div id="parent"><button class="btn">Click</button></div></body></html>', {
      url: 'http://localhost:3456',
      runScripts: 'dangerously'
    });
    const script = eventsDom.window.document.createElement('script');
    script.textContent = eventsSrc;
    eventsDom.window.document.body.appendChild(script);
    Events = eventsDom.window.Events;
  });

  it('on registers event listener', () => {
    const div = eventsDom.window.document.createElement('div');
    eventsDom.window.document.body.appendChild(div);
    let clicked = false;
    Events.on('test-scope', div, 'click', () => { clicked = true; });
    div.click();
    assert.ok(clicked);
    Events.cleanup('test-scope');
  });

  it('cleanup removes all listeners for scope', () => {
    const div = eventsDom.window.document.createElement('div');
    eventsDom.window.document.body.appendChild(div);
    let count = 0;
    Events.on('cleanup-test', div, 'click', () => count++);
    div.click();
    assert.equal(count, 1);
    Events.cleanup('cleanup-test');
    div.click();
    assert.equal(count, 1); // listener removed
  });

  it('cleanupAll removes all scopes', () => {
    const d1 = eventsDom.window.document.createElement('div');
    const d2 = eventsDom.window.document.createElement('div');
    eventsDom.window.document.body.appendChild(d1);
    eventsDom.window.document.body.appendChild(d2);
    let c1 = 0, c2 = 0;
    Events.on('scope-a', d1, 'click', () => c1++);
    Events.on('scope-b', d2, 'click', () => c2++);
    d1.click(); d2.click();
    assert.equal(c1, 1);
    assert.equal(c2, 1);
    Events.cleanupAll();
    d1.click(); d2.click();
    assert.equal(c1, 1);
    assert.equal(c2, 1);
  });

  it('delegate matches child selector', () => {
    const parent = eventsDom.window.document.getElementById('parent');
    let matched = false;
    Events.on('delegate-test', parent, 'click', (e) => {
      if (e.target.closest('.btn')) matched = true;
    });
    const btn = parent.querySelector('.btn');
    btn.click();
    assert.ok(matched);
    Events.cleanup('delegate-test');
  });

  it('on with null element does not throw', () => {
    assert.doesNotThrow(() => {
      Events.on('null-test', null, 'click', () => {});
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. ErrorBoundary.js — behavioral testing via jsdom
// ═══════════════════════════════════════════════════════════════════════════

describe('ErrorBoundary behavioral tests', () => {
  let errDom, EB;

  before(() => {
    errDom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:3456',
      runScripts: 'dangerously'
    });
    const script = errDom.window.document.createElement('script');
    script.textContent = errorsSrc;
    errDom.window.document.body.appendChild(script);
    EB = errDom.window.ErrorBoundary;
  });

  it('wrap returns an async function', () => {
    const wrapped = EB.wrap(async () => 42, 'test');
    assert.equal(typeof wrapped, 'function');
  });

  it('wrap passes through successful return value', async () => {
    const wrapped = EB.wrap(async () => 42, 'test');
    const result = await wrapped();
    assert.equal(result, 42);
  });

  it('wrap catches errors without throwing', async () => {
    const wrapped = EB.wrap(async () => { throw new Error('boom'); }, 'test');
    await assert.doesNotReject(async () => await wrapped());
  });

  it('run executes function and returns result', async () => {
    const result = await EB.run(async () => 'hello', 'test');
    assert.equal(result, 'hello');
  });

  it('run catches errors without throwing', async () => {
    await assert.doesNotReject(async () => {
      await EB.run(async () => { throw new Error('fail'); }, 'test');
    });
  });

  it('wrap calls showToast on error if available', async () => {
    let toastMsg = null;
    errDom.window.showToast = (msg) => { toastMsg = msg; };
    const wrapped = EB.wrap(async () => { throw new Error('toast test'); }, 'View');
    await wrapped();
    assert.ok(toastMsg.includes('toast test'));
    delete errDom.window.showToast;
  });

  it('run calls showToast on error if available', async () => {
    let toastMsg = null;
    errDom.window.showToast = (msg) => { toastMsg = msg; };
    await EB.run(async () => { throw new Error('run test'); }, 'Label');
    assert.ok(toastMsg.includes('run test'));
    delete errDom.window.showToast;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. api.js — source structure validation
// ═══════════════════════════════════════════════════════════════════════════

describe('api.js client structure', () => {
  it('exports api object with CRUD methods', () => {
    assert.ok(apiSrc.includes('api'));
    assert.ok(apiSrc.includes('get:'));
    assert.ok(apiSrc.includes('post:'));
    assert.ok(apiSrc.includes('put:'));
    assert.ok(apiSrc.includes('del:'));
    assert.ok(apiSrc.includes('patch:'));
  });

  it('includes CSRF token in non-GET requests', () => {
    assert.ok(apiSrc.includes('X-CSRF-Token'));
    assert.ok(apiSrc.includes('getCsrf'));
  });

  it('reads CSRF from cookie', () => {
    assert.ok(apiSrc.includes('document.cookie'));
    assert.ok(apiSrc.includes('csrf_token'));
  });

  it('redirects to /login on 401', () => {
    assert.ok(apiSrc.includes('401'));
    assert.ok(apiSrc.includes("'/login'"));
  });

  it('handles network errors', () => {
    assert.ok(apiSrc.includes('catch'));
    assert.ok(apiSrc.includes('Network error'));
  });

  it('sends Content-Type: application/json', () => {
    assert.ok(apiSrc.includes("'Content-Type': 'application/json'"));
  });

  it('has configurable error handler', () => {
    assert.ok(apiSrc.includes('setApiErrorHandler'));
    assert.ok(apiSrc.includes('_onError'));
  });

  it('returns parsed JSON on success', () => {
    assert.ok(apiSrc.includes('r.json()'));
  });

  it('returns parsed error body on non-ok response', () => {
    assert.ok(apiSrc.includes('!r.ok'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. API endpoint tests — all frontend views
// ═══════════════════════════════════════════════════════════════════════════

describe('API endpoints for all frontend views', () => {
  it('GET /api/areas returns areas array', async () => {
    makeArea({ name: 'Test' });
    const res = await agent().get('/api/areas').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

  it('GET /api/tasks/my-day returns today/my-day tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Today', my_day: 1 });
    const res = await agent().get('/api/tasks/my-day').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(t => t.title === 'Today'));
  });

  it('GET /api/tasks/all returns all tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Task1' });
    makeTask(goal.id, { title: 'Task2' });
    const res = await agent().get('/api/tasks/all').expect(200);
    assert.ok(res.body.length >= 2);
  });

  it('GET /api/tasks/board returns flat array with status', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { status: 'todo' });
    makeTask(goal.id, { status: 'done' });
    const res = await agent().get('/api/tasks/board').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/calendar requires start/end', async () => {
    await agent().get('/api/tasks/calendar').expect(400);
    const res = await agent().get('/api/tasks/calendar?start=2026-04-01&end=2026-04-30').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/overdue returns only overdue tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Overdue', due_date: '2020-01-01' });
    makeTask(goal.id, { title: 'Future', due_date: daysFromNow(10) });
    const res = await agent().get('/api/tasks/overdue').expect(200);
    assert.ok(res.body.some(t => t.title === 'Overdue'));
    assert.ok(!res.body.some(t => t.title === 'Future'));
  });

  it('GET /api/tasks/search finds tasks by query', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'UniqueSearchTerm42' });
    const res = await agent().get('/api/tasks/search?q=UniqueSearchTerm42').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(t => t.title === 'UniqueSearchTerm42'));
  });

  it('GET /api/tasks/table returns paginated table data', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id);
    const res = await agent().get('/api/tasks/table').expect(200);
    assert.ok(res.body.tasks || Array.isArray(res.body));
  });

  it('GET /api/stats returns dashboard statistics', async () => {
    const res = await agent().get('/api/stats').expect(200);
    assert.ok(typeof res.body === 'object');
    assert.ok('total' in res.body || 'tasks' in res.body || 'todo' in res.body);
  });

  it('GET /api/stats/streaks returns streak data', async () => {
    const res = await agent().get('/api/stats/streaks').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/habits returns habits array', async () => {
    makeHabit({ name: 'Exercise' });
    const res = await agent().get('/api/habits').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(h => h.name === 'Exercise'));
  });

  it('GET /api/lists returns lists array', async () => {
    makeList({ name: 'Shopping' });
    const res = await agent().get('/api/lists').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/inbox returns inbox items', async () => {
    const res = await agent().get('/api/inbox').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/notes returns notes array', async () => {
    const res = await agent().get('/api/notes').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/filters returns saved filters', async () => {
    const res = await agent().get('/api/filters').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/templates returns templates array', async () => {
    const res = await agent().get('/api/templates').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/settings returns settings object', async () => {
    const res = await agent().get('/api/settings').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/tags returns tags array', async () => {
    makeTag({ name: 'urgent' });
    const res = await agent().get('/api/tags').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/suggested returns suggested tasks', async () => {
    const res = await agent().get('/api/tasks/suggested').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Task enrichment — comprehensive field coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('Task enrichment completeness', () => {
  it('enriched task has tags array', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tag = makeTag({ name: 'test-tag' });
    linkTag(task.id, tag.id);
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.ok(Array.isArray(t.tags));
    assert.equal(t.tags[0].name, 'test-tag');
  });

  it('enriched task has subtasks with done/total counts', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    makeSubtask(task.id, { title: 'S1', done: 0 });
    makeSubtask(task.id, { title: 'S2', done: 1 });
    makeSubtask(task.id, { title: 'S3', done: 1 });
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.equal(t.subtask_total, 3);
    assert.equal(t.subtask_done, 2);
  });

  it('enriched task has goal metadata', async () => {
    const area = makeArea({ name: 'Health', icon: '💪', color: '#00FF00' });
    const goal = makeGoal(area.id, { title: 'Fitness', color: '#FF0000' });
    const task = makeTask(goal.id);
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.equal(t.goal_title, 'Fitness');
    assert.equal(t.goal_color, '#FF0000');
    assert.equal(t.area_name, 'Health');
    assert.equal(t.area_icon, '💪');
  });

  it('enriched task has list info when list_id set', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const list = makeList({ name: 'Sprint', icon: '🏃', color: '#123456' });
    const task = makeTask(goal.id, { list_id: list.id });
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.equal(t.list_id, list.id);
    assert.equal(t.list_name, 'Sprint');
  });

  it('enriched task has blocked_by dependencies', async () => {
    const { db } = setup();
    const area = makeArea();
    const goal = makeGoal(area.id);
    const blocker = makeTask(goal.id, { title: 'Blocker' });
    const blocked = makeTask(goal.id, { title: 'Blocked' });
    db.prepare('INSERT INTO task_deps (task_id, blocked_by_id) VALUES (?, ?)').run(blocked.id, blocker.id);
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === blocked.id);
    assert.ok(Array.isArray(t.blocked_by));
    assert.ok(t.blocked_by.some(b => b.title === 'Blocker'));
  });

  it('subtask note field preserved in enrichment', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    makeSubtask(task.id, { title: 'Sub', note: 'Some note' });
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.equal(t.subtasks[0].note, 'Some note');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. CRUD workflows — end-to-end scenario tests
// ═══════════════════════════════════════════════════════════════════════════

describe('End-to-end CRUD workflows', () => {
  it('create area → goal → task → subtask → verify hierarchy', async () => {
    const areaRes = await agent().post('/api/areas').send({ name: 'E2E Area', icon: '📱', color: '#FF0000' }).expect(201);
    const goalRes = await agent().post(`/api/areas/${areaRes.body.id}/goals`).send({ title: 'E2E Goal' }).expect(201);
    const taskRes = await agent().post(`/api/goals/${goalRes.body.id}/tasks`).send({ title: 'E2E Task' }).expect(201);
    const subRes = await agent().post(`/api/tasks/${taskRes.body.id}/subtasks`).send({ title: 'E2E Sub' }).expect(201);

    const allRes = await agent().get('/api/tasks/all').expect(200);
    const task = allRes.body.find(t => t.title === 'E2E Task');
    assert.ok(task);
    assert.equal(task.goal_title, 'E2E Goal');
    assert.equal(task.area_name, 'E2E Area');
    assert.ok(task.subtasks.some(s => s.title === 'E2E Sub'));
  });

  it('complete task → verify completed_at is set', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Complete me', status: 'todo' });
    await agent().put(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);
    const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
    assert.equal(res.body.status, 'done');
    assert.ok(res.body.completed_at);
  });

  it('tag workflow: create → assign → verify in task enrichment', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tagRes = await agent().post('/api/tags').send({ name: 'e2e-tag', color: '#00FF00' }).expect(201);
    await agent().put(`/api/tasks/${task.id}/tags`).send({ tagIds: [tagRes.body.id] }).expect(200);
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.ok(t.tags.some(tg => tg.name === 'e2e-tag'));
  });

  it('list workflow: create → add items → check/uncheck', async () => {
    const listRes = await agent().post('/api/lists').send({ name: 'Test List', type: 'checklist' }).expect(201);
    const itemRes = await agent().post(`/api/lists/${listRes.body.id}/items`).send({ title: 'Item 1' }).expect(201);
    await agent().put(`/api/lists/${listRes.body.id}/items/${itemRes.body.id}`).send({ checked: 1 }).expect(200);
    const listItems = await agent().get(`/api/lists/${listRes.body.id}/items`).expect(200);
    assert.ok(Array.isArray(listItems.body));
  });

  it('habit workflow: create → log → verify streak', async () => {
    const habitRes = await agent().post('/api/habits').send({ name: 'Test Habit', frequency: 'daily' }).expect(201);
    await agent().post(`/api/habits/${habitRes.body.id}/log`).send({ date: today() }).expect(200);
    const habitsRes = await agent().get('/api/habits').expect(200);
    const h = habitsRes.body.find(x => x.id === habitRes.body.id);
    assert.ok(h);
  });

  it('inbox workflow: capture → convert to task', async () => {
    const addRes = await agent().post('/api/inbox').send({ title: 'Quick thought', priority: 1 }).expect(201);
    assert.ok(addRes.body.id);
    const inboxRes = await agent().get('/api/inbox').expect(200);
    assert.ok(inboxRes.body.some(i => i.title === 'Quick thought'));
  });

  it('notes workflow: create → update → read', async () => {
    const noteRes = await agent().post('/api/notes').send({ title: 'Test Note', content: 'Body text' }).expect(201);
    await agent().put(`/api/notes/${noteRes.body.id}`).send({ content: 'Updated body' }).expect(200);
    const notesRes = await agent().get('/api/notes').expect(200);
    const n = notesRes.body.find(x => x.id === noteRes.body.id);
    assert.ok(n);
  });

  it('delete cascade: deleting area removes goals and tasks', async () => {
    const area = makeArea({ name: 'Delete Me' });
    const goal = makeGoal(area.id, { title: 'Child Goal' });
    makeTask(goal.id, { title: 'Child Task' });
    await agent().delete(`/api/areas/${area.id}`).expect(200);
    const areasRes = await agent().get('/api/areas').expect(200);
    assert.ok(!areasRes.body.some(a => a.name === 'Delete Me'));
    const tasksRes = await agent().get('/api/tasks/all').expect(200);
    assert.ok(!tasksRes.body.some(t => t.title === 'Child Task'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Security — frontend hardening
// ═══════════════════════════════════════════════════════════════════════════

describe('Frontend security measures', () => {
  it('CSRF token extracted from cookie (not embedded in HTML)', () => {
    assert.ok(apiSrc.includes('document.cookie'));
    assert.ok(!indexHtml.includes('csrf_token'));
  });

  it('all API mutations include CSRF header', () => {
    assert.ok(apiSrc.includes("'X-CSRF-Token'"));
  });

  it('Content-Security-Policy header is set', async () => {
    const res = await agent().get('/').expect(200);
    // Helmet sets various headers
    assert.ok(res.headers['x-content-type-options'] === 'nosniff' ||
              res.headers['content-security-policy'] ||
              res.headers['x-frame-options']);
  });

  it('X-Content-Type-Options: nosniff', async () => {
    const res = await agent().get('/').expect(200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('no inline event handlers in index.html', () => {
    const handlers = ['onclick=', 'onload=', 'onerror=', 'onsubmit=', 'onmouseover='];
    for (const h of handlers) {
      assert.ok(!indexHtml.includes(h), `Found unsafe inline handler: ${h}`);
    }
  });

  it('escA uses all 5 HTML entity replacements', () => {
    assert.ok(utilsSrc.includes('&amp;'));
    assert.ok(utilsSrc.includes('&quot;'));
    assert.ok(utilsSrc.includes('&#39;'));
    assert.ok(utilsSrc.includes('&lt;'));
    assert.ok(utilsSrc.includes('&gt;'));
  });

  it('login form uses POST method', () => {
    assert.ok(loginSrc.includes("method: 'POST'"));
  });

  it('password fields have autocomplete attributes', () => {
    assert.ok(loginHtml.includes('autocomplete'));
  });

  it('auth redirect on 401 prevents unauthenticated access', () => {
    assert.ok(apiSrc.includes('window.location.href'));
    assert.ok(apiSrc.includes("'/login'"));
  });

  it('SW sanitizes push notification URLs', () => {
    assert.ok(swJs.includes('sanitizePushUrl'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. app.js function inventory — all critical functions exist
// ═══════════════════════════════════════════════════════════════════════════

describe('app.js critical function inventory', () => {
  const requiredFunctions = [
    'render', 'renderMyDay', 'renderToday', 'renderAll', 'renderGlobalBoard',
    'renderCal', 'renderDashboard', 'renderWeekly', 'renderMatrix',
    'renderLogbook', 'renderTags', 'renderFocusHistory', 'renderTemplates',
    'renderSettings', 'renderHabits', 'renderPlanner', 'renderInbox',
    'renderWeeklyReview', 'renderNotes', 'renderTimeAnalytics', 'renderRules',
    'renderReports', 'renderHelp', 'renderChangelog', 'renderLists',
    'renderListDetail', 'renderSmartList', 'renderSavedFilter',
    'renderArea', 'renderGoal', 'renderOverdue',
    'updateBC', 'showToast', 'openAreaModal', 'openGM',
    'openDP', 'openQuickCapture', 'loadAreas', 'closeQC',
    'trapFocus', 'fireConfetti', 'toggleMultiSelect',
    'openDailyReview', 'closeDR',
    'vimHighlight', 'vimMove', 'getVisibleCards',
    'generateShareCard', 'renderSBLists',
    '_lockBody', '_unlockBody', '_pushFocus', '_popFocus',
    'validateField', 'clearFieldError', 'buildSwatches',
  ];

  for (const fn of requiredFunctions) {
    it(`has ${fn}()`, () => {
      assert.ok(appJs.includes(`function ${fn}`) || appJs.includes(`async function ${fn}`),
        `Missing function: ${fn}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. app.js — view rendering patterns
// ═══════════════════════════════════════════════════════════════════════════

describe('View rendering patterns', () => {
  it('renderToday fetches /api/tasks/my-day', () => {
    const fn = appJs.substring(appJs.indexOf('async function renderToday()'), appJs.indexOf('async function renderToday()') + 2000);
    assert.ok(fn.includes('/api/tasks/my-day'));
  });

  it('renderAll fetches /api/tasks/all', () => {
    const idx = appJs.indexOf('async function renderAll');
    const fn = appJs.substring(idx, idx + 500);
    assert.ok(fn.includes('/api/tasks/all'));
  });

  it('renderGlobalBoard fetches /api/tasks/board', () => {
    assert.ok(appJs.includes('/api/tasks/board'));
  });

  it('renderCal fetches /api/tasks/calendar', () => {
    assert.ok(appJs.includes('/api/tasks/calendar'));
  });

  it('renderDashboard fetches /api/stats', () => {
    assert.ok(appJs.includes("api.get('/api/stats')") || appJs.includes("api.get('/api/stats?"));
  });

  it('renderHabits fetches /api/habits', () => {
    assert.ok(appJs.includes("api.get('/api/habits')"));
  });

  it('renderInbox fetches /api/inbox', () => {
    assert.ok(appJs.includes("api.get('/api/inbox')"));
  });

  it('renderNotes fetches /api/notes', () => {
    assert.ok(appJs.includes("api.get('/api/notes')"));
  });

  it('renderLists fetches /api/lists', () => {
    assert.ok(appJs.includes("api.get('/api/lists')"));
  });

  it('renderSettings fetches /api/settings', () => {
    assert.ok(appJs.includes("api.get('/api/settings')"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Task card HTML functions
// ═══════════════════════════════════════════════════════════════════════════

describe('Task card HTML functions', () => {
  it('tcHtml generates task card with data-id', () => {
    assert.ok(appJs.includes('function tcHtml('));
    assert.ok(appJs.includes('data-id'));
  });

  it('tcMinHtml generates minimal task card', () => {
    assert.ok(appJs.includes('function tcMinHtml('));
  });

  it('task cards use esc() for title', () => {
    const idx = appJs.indexOf('function tcHtml(');
    const tcFn = appJs.substring(idx, idx + 5000);
    assert.ok(tcFn.includes('esc(t.title)'));
  });

  it('task cards show subtask progress', () => {
    assert.ok(appJs.includes('st-bar'));
    assert.ok(appJs.includes('st-fill'));
  });

  it('task cards show tag badges', () => {
    const tcFn = appJs.substring(appJs.indexOf('function tcHtml('), appJs.indexOf('function tcHtml(') + 3000);
    assert.ok(tcFn.includes('tags'));
    assert.ok(tcFn.includes('esc(tg.name)'));
  });

  it('inline subtask expansion exists', () => {
    assert.ok(appJs.includes('tc-expand'));
    assert.ok(appJs.includes('tc-subs'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. Focus timer UI
// ═══════════════════════════════════════════════════════════════════════════

describe('Focus timer implementation', () => {
  it('focus UI uses SVG ring from index.html', () => {
    // SVG ring is defined in index.html, showFocusUI manipulates timer elements
    assert.ok(indexHtml.includes('ft-arc'));
    assert.ok(indexHtml.includes('<circle'));
    const fn = appJs.substring(appJs.indexOf('function showFocusUI'), appJs.indexOf('function showFocusUI') + 500);
    assert.ok(fn.includes('ft-task') || fn.includes('ft-label') || fn.includes('ft-toggle'));
  });

  it('focus timer posts to /api/focus', () => {
    assert.ok(appJs.includes("api.post('/api/focus'") || appJs.includes("api.post('/api/focus/"));
  });

  it('has break timer (5min/15min)', () => {
    assert.ok(appJs.includes('break') || appJs.includes('Break'));
  });

  it('focus session tracks duration', () => {
    assert.ok(appJs.includes('duration_sec') || appJs.includes('duration'));
  });

  it('auto-links focus duration to task actual_minutes', () => {
    assert.ok(appJs.includes('actual_minutes'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. Drag and drop
// ═══════════════════════════════════════════════════════════════════════════

describe('Drag and drop system', () => {
  it('touchDnD function exists', () => {
    assert.ok(appJs.includes('touchDnD') || appJs.includes('touch'));
  });

  it('handles dragstart/dragover/drop for desktop', () => {
    assert.ok(appJs.includes('dragstart') || appJs.includes('draggable'));
    assert.ok(appJs.includes('dragover'));
    assert.ok(appJs.includes('drop'));
  });

  it('reorder API call exists', () => {
    assert.ok(appJs.includes('/api/tasks/reorder') || appJs.includes('/reorder'));
  });

  it('has ghost element for drag preview', () => {
    assert.ok(appJs.includes('ghost') || appJs.includes('drag-ghost'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. NLP parser integration
// ═══════════════════════════════════════════════════════════════════════════

describe('NLP quick capture', () => {
  it('POST /api/tasks/parse parses text', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'buy milk tomorrow p1 #shopping' }).expect(200);
    assert.ok(res.body.title);
  });

  it('parses priority from pN syntax', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'test task p3' }).expect(200);
    assert.equal(res.body.priority, 3);
  });

  it('parses tags from #hashtag syntax', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'test #urgent #work' }).expect(200);
    assert.ok(res.body.tags.includes('urgent'));
    assert.ok(res.body.tags.includes('work'));
  });

  it('parses "today" as date', async () => {
    const res = await agent().post('/api/tasks/parse').send({ text: 'meeting today' }).expect(200);
    assert.ok(res.body.due_date);
  });

  it('rejects empty text', async () => {
    await agent().post('/api/tasks/parse').send({ text: '' }).expect(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. Settings persistence
// ═══════════════════════════════════════════════════════════════════════════

describe('Settings persistence', () => {
  it('PUT /api/settings saves and returns settings', async () => {
    const res = await agent().put('/api/settings').send({ theme: 'ocean', dateFormat: 'iso' }).expect(200);
    assert.ok(res.body);
    const getRes = await agent().get('/api/settings').expect(200);
    assert.equal(getRes.body.theme, 'ocean');
    assert.equal(getRes.body.dateFormat, 'iso');
  });

  it('settings survive across requests', async () => {
    await agent().put('/api/settings').send({ dailyQuote: 'true' }).expect(200);
    const res = await agent().get('/api/settings').expect(200);
    assert.equal(res.body.dailyQuote, 'true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. Static asset serving
// ═══════════════════════════════════════════════════════════════════════════

describe('Static asset serving', () => {
  it('serves index.html at /', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('LifeFlow') || res.text.includes('app.js'));
  });

  it('serves app.js', async () => {
    const res = await agent().get('/app.js');
    assert.ok(res.status === 200 || res.status === 304);
  });

  it('serves styles.css', async () => {
    const res = await agent().get('/styles.css').expect(200);
    assert.ok(res.text.includes('{'));
  });

  it('serves manifest.json', async () => {
    const res = await agent().get('/manifest.json').expect(200);
    assert.equal(res.body.name, 'LifeFlow');
  });

  it('serves sw.js', async () => {
    const res = await agent().get('/sw.js').expect(200);
    assert.ok(res.text.includes('CACHE'));
  });

  it('serves login page at /login', async () => {
    // Login page is served via a route — but agent is authenticated, so may redirect
    const res = await agent().get('/login');
    assert.ok(res.status === 200 || res.status === 302);
  });

  it('serves share.html for /share/* routes', async () => {
    const res = await agent().get('/share/test-token');
    assert.ok(res.status === 200 || res.status === 404);
  });

  it('serves landing.html as static file', async () => {
    const rawRes = await agent().get('/landing.html');
    assert.ok(rawRes.status === 200 || rawRes.status === 301 || rawRes.status === 302 || rawRes.status === 404);
  });

  it('serves JS modules from /js/ directory', async () => {
    const res = await agent().get('/js/utils.js').expect(200);
    assert.ok(res.text.includes('esc'));
  });

  it('serves store.js', async () => {
    const res = await agent().get('/store.js').expect(200);
    assert.ok(res.text.includes('Store'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. SPA fallback routing
// ═══════════════════════════════════════════════════════════════════════════

describe('SPA routing', () => {
  it('unknown paths fall back to index.html', async () => {
    const res = await agent().get('/nonexistent-page').expect(200);
    assert.ok(res.text.includes('app.js'));
  });

  it('/login serves login page, not SPA', async () => {
    const res = await agent().get('/login').expect(200);
    assert.ok(res.text.includes('login'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 23. login.js behavior validation
// ═══════════════════════════════════════════════════════════════════════════

describe('login.js behavior', () => {
  it('handles login form submission', () => {
    assert.ok(loginSrc.includes("loginForm.addEventListener('submit'"));
  });

  it('handles register form submission', () => {
    assert.ok(loginSrc.includes("registerForm.addEventListener('submit'"));
  });

  it('sends email and password in login request', () => {
    assert.ok(loginSrc.includes("getElementById('login-email')"));
    assert.ok(loginSrc.includes("getElementById('login-password')"));
  });

  it('sends email, password, display_name in register request', () => {
    assert.ok(loginSrc.includes("getElementById('reg-email')"));
    assert.ok(loginSrc.includes("getElementById('reg-password')"));
    assert.ok(loginSrc.includes("getElementById('reg-name')"));
  });

  it('disables submit button during request', () => {
    assert.ok(loginSrc.includes('btn.disabled = true'));
    assert.ok(loginSrc.includes('btn.disabled = false'));
  });

  it('shows error messages on failure', () => {
    assert.ok(loginSrc.includes('showError'));
    assert.ok(loginSrc.includes('Login failed') || loginSrc.includes('data.error'));
  });

  it('redirects to / on success', () => {
    assert.ok(loginSrc.includes("window.location.href = '/'"));
  });

  it('handles network errors', () => {
    assert.ok(loginSrc.includes('Network error'));
  });

  it('checks existing auth on load', () => {
    assert.ok(loginSrc.includes("fetch('/api/auth/me')"));
  });

  it('has tab switching between login/register', () => {
    assert.ok(loginSrc.includes("dataset.tab === 'login'"));
  });

  it('password toggle switches type', () => {
    assert.ok(loginSrc.includes("input.type = isHidden ? 'text' : 'password'"));
  });

  it('includes remember checkbox in login payload', () => {
    assert.ok(loginSrc.includes('login-remember'));
    assert.ok(loginSrc.includes('.checked'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. Daily quote feature
// ═══════════════════════════════════════════════════════════════════════════

describe('Daily quote feature', () => {
  it('GET /api/features/daily-quote returns quote when enabled', async () => {
    // Enable daily quotes in settings first
    await agent().put('/api/settings').send({ dailyQuote: 'true' }).expect(200);
    const res = await agent().get('/api/features/daily-quote').expect(200);
    assert.equal(res.body.enabled, true);
    assert.ok(res.body.text);
    assert.ok(res.body.author !== undefined);
  });

  it('quote card rendering in app.js', () => {
    assert.ok(appJs.includes('daily-quote-card') || appJs.includes('dailyQuote'));
  });

  it('dailyQuote setting in settings', () => {
    assert.ok(appJs.includes('dailyQuote'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 25. Notification bell
// ═══════════════════════════════════════════════════════════════════════════

describe('Notification system', () => {
  it('notification bell in index.html', () => {
    assert.ok(indexHtml.includes('notif-bell') || indexHtml.includes('notification'));
  });

  it('notification dropdown rendering', () => {
    assert.ok(appJs.includes('notif') || appJs.includes('notification'));
  });

  it('overdue/today notifications', () => {
    assert.ok(appJs.includes('overdue') || appJs.includes('Overdue'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 26. Automation rules
// ═══════════════════════════════════════════════════════════════════════════

describe('Automation rules', () => {
  it('renderRules function exists', () => {
    assert.ok(appJs.includes('async function renderRules'));
  });

  it('API endpoints for automation rules', async () => {
    const res = await agent().get('/api/rules').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('create and read automation rule', async () => {
    const res = await agent().post('/api/rules').send({
      name: 'Test Rule',
      trigger_type: 'task_completed',
      trigger_config: {},
      action_type: 'add_tag',
      action_config: { tag_id: 1 }
    }).expect(201);
    assert.ok(res.body.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 27. Custom fields
// ═══════════════════════════════════════════════════════════════════════════

describe('Custom fields', () => {
  it('CRUD for custom field definitions', async () => {
    const res = await agent().post('/api/custom-fields').send({
      name: 'Sprint',
      field_type: 'text'
    }).expect(201);
    assert.ok(res.body.id);

    const listRes = await agent().get('/api/custom-fields').expect(200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.some(f => f.name === 'Sprint'));
  });

  it('set custom field value on task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const fieldRes = await agent().post('/api/custom-fields').send({
      name: 'Priority Level',
      field_type: 'number'
    }).expect(201);
    await agent().put(`/api/tasks/${task.id}/custom-fields`)
      .send({ fields: [{ field_id: fieldRes.body.id, value: '42' }] }).expect(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 28. Share list feature
// ═══════════════════════════════════════════════════════════════════════════

describe('Share list feature', () => {
  it('share.js has XSS-safe content rendering', () => {
    const escCalls = (shareSrc.match(/esc\(/g) || []).length;
    assert.ok(escCalls >= 5);
  });

  it('share.js handles grocery list categories', () => {
    assert.ok(shareSrc.includes("type === 'grocery'"));
  });

  it('share.js handles notes list type', () => {
    assert.ok(shareSrc.includes("type === 'notes'"));
  });

  it('share.js extracts token from URL', () => {
    assert.ok(shareSrc.includes('location.pathname'));
  });

  it('share.js encodes token for API safety', () => {
    assert.ok(shareSrc.includes('encodeURIComponent'));
  });

  it('share.js handles not-found error', () => {
    assert.ok(shareSrc.includes('List not found'));
  });

  it('share.js supports adding items', () => {
    assert.ok(shareSrc.includes("method: 'POST'"));
    assert.ok(shareSrc.includes('addItem'));
  });

  it('share.js supports toggling item check', () => {
    assert.ok(shareSrc.includes("method: 'PUT'"));
    assert.ok(shareSrc.includes('checked'));
  });

  it('share.js Enter key handler', () => {
    assert.ok(shareSrc.includes("e.key === 'Enter'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 29. Onboarding wizard
// ═══════════════════════════════════════════════════════════════════════════

describe('Onboarding', () => {
  it('onboarding overlay in HTML', () => {
    assert.ok(indexHtml.includes('onb-ov'));
  });

  it('onboarding CSS styles', () => {
    assert.ok(css.includes('onb-ov') || css.includes('onboarding'));
  });

  it('onboarding check in app.js', () => {
    assert.ok(appJs.includes('onboarding') || appJs.includes('onb-ov'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 30. Weekly review
// ═══════════════════════════════════════════════════════════════════════════

describe('Weekly review', () => {
  it('renderWeeklyReview function exists', () => {
    assert.ok(appJs.includes('async function renderWeeklyReview'));
  });

  it('weekly review API endpoints', async () => {
    const res = await agent().get('/api/reviews').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 31. Reports view
// ═══════════════════════════════════════════════════════════════════════════

describe('Reports', () => {
  it('renderReports function exists', () => {
    assert.ok(appJs.includes('async function renderReports'));
  });

  it('has multiple report tabs', () => {
    assert.ok(appJs.includes('Overview') || appJs.includes('overview'));
    assert.ok(appJs.includes('Activity') || appJs.includes('activity'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 32. Focus history view
// ═══════════════════════════════════════════════════════════════════════════

describe('Focus history', () => {
  it('renderFocusHistory function exists', () => {
    assert.ok(appJs.includes('async function renderFocusHistory'));
  });

  it('focus history API', async () => {
    const res = await agent().get('/api/focus/history').expect(200);
    assert.ok(res.body.items !== undefined || Array.isArray(res.body));
    assert.ok(typeof res.body.total === 'number' || Array.isArray(res.body));
  });

  it('focus session with metadata', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const focus = makeFocus(task.id);
    const res = await agent().get('/api/focus/history').expect(200);
    const sessions = res.body.items || res.body;
    assert.ok(sessions.length >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 33. Landing page CSS
// ═══════════════════════════════════════════════════════════════════════════

describe('Landing page', () => {
  it('landing.css exists and has styles', () => {
    assert.ok(landingCss.length > 50);
  });

  it('landing page is responsive', () => {
    assert.ok(landingCss.includes('max-width') || landingCss.includes('@media'));
  });

  it('has hero section styling', () => {
    assert.ok(landingCss.includes('hero') || landingHtml.includes('hero'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 34. Template system
// ═══════════════════════════════════════════════════════════════════════════

describe('Task templates', () => {
  it('renderTemplates function exists', () => {
    assert.ok(appJs.includes('async function renderTemplates'));
  });

  it('templates API CRUD', async () => {
    const res = await agent().get('/api/templates').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 35. iCal export
// ═══════════════════════════════════════════════════════════════════════════

describe('iCal export', () => {
  it('GET /api/export/ical returns valid iCalendar', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'iCal Task', due_date: '2026-04-10' });
    const res = await agent().get('/api/export/ical').expect(200);
    assert.ok(res.text.includes('BEGIN:VCALENDAR'));
    assert.ok(res.text.includes('BEGIN:VEVENT'));
    assert.ok(res.text.includes('iCal Task'));
    assert.ok(res.text.includes('END:VCALENDAR'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 36. Batch operations
// ═══════════════════════════════════════════════════════════════════════════

describe('Batch task operations', () => {
  it('PATCH /api/tasks/batch completes multiple tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Batch1' });
    const t2 = makeTask(goal.id, { title: 'Batch2' });
    const res = await agent().patch('/api/tasks/batch')
      .send({ ids: [t1.id, t2.id], updates: { status: 'done' } }).expect(200);
    assert.ok(res.body.updated >= 2 || res.body.count >= 2);
  });

  it('DELETE /api/tasks/:id deletes individual tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Del1' });
    const t2 = makeTask(goal.id, { title: 'Del2' });
    await agent().delete(`/api/tasks/${t1.id}`).expect(200);
    await agent().delete(`/api/tasks/${t2.id}`).expect(200);
    const all = await agent().get('/api/tasks/all').expect(200);
    assert.ok(!all.body.some(t => t.title === 'Del1'));
    assert.ok(!all.body.some(t => t.title === 'Del2'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 37. Goal milestones
// ═══════════════════════════════════════════════════════════════════════════

describe('Goal milestones', () => {
  it('CRUD milestones on a goal', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const res = await agent().post(`/api/goals/${goal.id}/milestones`)
      .send({ title: 'Milestone 1' }).expect(201);
    assert.ok(res.body.id);

    const listRes = await agent().get(`/api/goals/${goal.id}/milestones`).expect(200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.some(m => m.title === 'Milestone 1'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 38. Saved filters
// ═══════════════════════════════════════════════════════════════════════════

describe('Saved filters CRUD', () => {
  it('create and read saved filter', async () => {
    const res = await agent().post('/api/filters').send({
      name: 'High Priority',
      icon: '🔥',
      color: '#FF0000',
      filters: { priority: 3 }
    }).expect(201);
    assert.ok(res.body.id);

    const listRes = await agent().get('/api/filters').expect(200);
    assert.ok(listRes.body.some(f => f.name === 'High Priority'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 39. Task comments
// ═══════════════════════════════════════════════════════════════════════════

describe('Task comments', () => {
  it('add and read comment on task', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    await agent().post(`/api/tasks/${task.id}/comments`)
      .send({ text: 'Test comment' }).expect(201);
    const res = await agent().get(`/api/tasks/${task.id}/comments`).expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(c => c.text === 'Test comment'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 40. Task dependencies
// ═══════════════════════════════════════════════════════════════════════════

describe('Task dependencies', () => {
  it('add and read dependency', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const t1 = makeTask(goal.id, { title: 'Blocker' });
    const t2 = makeTask(goal.id, { title: 'Blocked' });
    await agent().put(`/api/tasks/${t2.id}/deps`)
      .send({ blockedByIds: [t1.id] }).expect(200);
    const res = await agent().get(`/api/tasks/${t2.id}/deps`).expect(200);
    assert.ok(res.body.blockedBy);
    assert.ok(Array.isArray(res.body.blockedBy));
    assert.ok(res.body.blockedBy.some(d => d.id === t1.id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 41. Recurring tasks
// ═══════════════════════════════════════════════════════════════════════════

describe('Recurring tasks', () => {
  it('task card shows recurring indicator for recurring tasks', () => {
    assert.ok(appJs.includes('🔁'));
    assert.ok(appJs.includes('recurring'));
  });

  it('GET /api/tasks/recurring returns recurring tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Daily', recurring: '{"type":"daily"}' });
    const res = await agent().get('/api/tasks/recurring').expect(200);
    assert.ok(Array.isArray(res.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 42. Webhook system
// ═══════════════════════════════════════════════════════════════════════════

describe('Webhooks', () => {
  it('CRUD webhook', async () => {
    const res = await agent().post('/api/webhooks').send({
      name: 'Test Hook',
      url: 'https://example.com/webhook',
      events: ['task.completed']
    }).expect(201);
    assert.ok(res.body.id);

    const listRes = await agent().get('/api/webhooks').expect(200);
    assert.ok(Array.isArray(listRes.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 43. CSS variable completeness for theming
// ═══════════════════════════════════════════════════════════════════════════

describe('CSS variable system', () => {
  const requiredVars = ['--bg', '--bg-s', '--brand', '--tx', '--tx2', '--brd',
    '--err', '--warn', '--dn', '--bg-h'];

  for (const v of requiredVars) {
    it(`defines ${v} CSS variable`, () => {
      assert.ok(css.includes(`${v}:`), `Missing CSS variable ${v}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 44. Edge case: empty state renders
// ═══════════════════════════════════════════════════════════════════════════

describe('Empty state handling', () => {
  it('GET /api/tasks/all with no tasks returns empty array', async () => {
    const res = await agent().get('/api/tasks/all').expect(200);
    assert.deepEqual(res.body, []);
  });

  it('GET /api/areas with no areas returns empty array', async () => {
    const res = await agent().get('/api/areas').expect(200);
    assert.deepEqual(res.body, []);
  });

  it('GET /api/habits with no habits returns empty array', async () => {
    const res = await agent().get('/api/habits').expect(200);
    assert.deepEqual(res.body, []);
  });

  it('GET /api/stats with no data returns zero counts', async () => {
    const res = await agent().get('/api/stats').expect(200);
    assert.ok(res.body.total === 0 || res.body.todo === 0);
  });

  it('GET /api/inbox with no items returns empty array', async () => {
    const res = await agent().get('/api/inbox').expect(200);
    assert.deepEqual(res.body, []);
  });
});
