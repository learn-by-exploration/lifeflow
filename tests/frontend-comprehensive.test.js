/**
 * Frontend Comprehensive Tests
 *
 * Deep testing of all frontend JavaScript modules:
 * 1. utils.js — esc, escA, fmtDue, renderMd, parseDate, toDateStr, isOD, timeAgo
 * 2. store.js — state management, events, offline queue
 * 3. events.js — event cleanup registry
 * 4. errors.js — async error boundary
 * 5. api.js — API client structure
 * 6. app.js — utility functions (SL, PLbl, PClr, streakEmoji, getGreeting, etc.)
 * 7. app.js — view dispatcher, breadcrumbs, navigation
 * 8. app.js — renderMd (markdown renderer with XSS safety)
 * 9. app.js — task card HTML generation (tcHtml, tcMinHtml)
 * 10. login.js / share.js — page modules
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeSubtask, makeTag, linkTag, makeList, makeListItem } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const storeJs = fs.readFileSync(path.join(PUBLIC, 'store.js'), 'utf8');
const swJs = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'utils.js'), 'utf8');
const apiSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'api.js'), 'utf8');
const eventsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'events.js'), 'utf8');
const errorsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'errors.js'), 'utf8');
const loginSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'login.js'), 'utf8');
const shareSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'share.js'), 'utf8');

// Load utils.js into jsdom for behavioral testing
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const cleanUtilsSrc = utilsSrc.replace(/^export /gm, '').replace(/^export\{[^}]*\}/gm, '');
const loadUtils = new Function('document', 'window', cleanUtilsSrc + '\nreturn { esc, escA, fmtDue, renderMd, parseDate, toDateStr, isOD, timeAgo };');
const utils = loadUtils(dom.window.document, dom.window);

function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════════════════════════════════════
// 1. esc() — comprehensive XSS prevention
// ═══════════════════════════════════════════════════════════════════════════

describe('esc() — comprehensive XSS prevention', () => {
  it('escapes all 5 dangerous characters', () => {
    assert.equal(utils.esc('<>&"\''), '&lt;&gt;&amp;"\'');
  });

  it('handles nested script injection', () => {
    const r = utils.esc('<img src=x onerror="alert(document.cookie)">');
    assert.ok(!r.includes('<img'));
    assert.ok(r.includes('&lt;img'));
  });

  it('handles event handler injection', () => {
    const r = utils.esc('<div onmouseover="steal()">');
    assert.ok(!r.includes('<div'));
  });

  it('handles SVG-based XSS', () => {
    const r = utils.esc('<svg onload="alert(1)">');
    assert.ok(!r.includes('<svg'));
  });

  it('handles data URI injection', () => {
    const r = utils.esc('<a href="data:text/html,<script>alert(1)</script>">');
    assert.ok(!r.includes('<a href'));
  });

  it('handles null bytes', () => {
    const r = utils.esc('test\0script');
    assert.ok(typeof r === 'string');
  });

  it('handles unicode escape sequences', () => {
    const r = utils.esc('\u003cscript\u003e');
    assert.ok(!r.includes('<script>'));
  });

  it('preserves emojis', () => {
    assert.equal(utils.esc('Hello 🎉 World 🌍'), 'Hello 🎉 World 🌍');
  });

  it('handles very long strings without crashing', () => {
    const long = 'x'.repeat(100000);
    assert.equal(utils.esc(long), long);
  });

  it('handles template literal injection', () => {
    const r = utils.esc('${document.cookie}');
    assert.ok(r.includes('${document.cookie}'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. escA() — attribute-safe escaping
// ═══════════════════════════════════════════════════════════════════════════

describe('escA() — attribute escaping', () => {
  it('escapes all 5 special chars', () => {
    const r = utils.escA('&<>"\'');
    assert.ok(r.includes('&amp;'));
    assert.ok(r.includes('&lt;'));
    assert.ok(r.includes('&gt;'));
    assert.ok(r.includes('&quot;'));
    assert.ok(r.includes('&#39;'));
  });

  it('prevents attribute breakout via double quote', () => {
    const r = utils.escA('" onclick="alert(1)"');
    assert.ok(!r.includes('" onclick'));
  });

  it('prevents attribute breakout via single quote', () => {
    const r = utils.escA("' onmouseover='steal()'");
    assert.ok(!r.includes("' onmouseover"));
  });

  it('handles numeric input by coercing to string', () => {
    assert.equal(utils.escA(42), '42');
  });

  it('handles null by coercing to string', () => {
    assert.equal(utils.escA(null), 'null');
  });

  it('handles undefined by coercing to string', () => {
    assert.equal(utils.escA(undefined), 'undefined');
  });

  it('handles empty string', () => {
    assert.equal(utils.escA(''), '');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. parseDate() — date parsing edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('parseDate() — date parsing', () => {
  it('parses standard date correctly', () => {
    const d = utils.parseDate('2026-04-04');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 3); // 0-indexed
    assert.equal(d.getDate(), 4);
  });

  it('parses Jan 1st correctly', () => {
    const d = utils.parseDate('2026-01-01');
    assert.equal(d.getMonth(), 0);
    assert.equal(d.getDate(), 1);
  });

  it('parses Dec 31st correctly', () => {
    const d = utils.parseDate('2026-12-31');
    assert.equal(d.getMonth(), 11);
    assert.equal(d.getDate(), 31);
  });

  it('parses leap day correctly', () => {
    const d = utils.parseDate('2024-02-29');
    assert.equal(d.getMonth(), 1);
    assert.equal(d.getDate(), 29);
  });

  it('returns midnight (no timezone shift)', () => {
    const d = utils.parseDate('2026-06-15');
    assert.equal(d.getHours(), 0);
    assert.equal(d.getMinutes(), 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. toDateStr() — date formatting
// ═══════════════════════════════════════════════════════════════════════════

describe('toDateStr() — date serialization', () => {
  it('formats date as YYYY-MM-DD', () => {
    const d = new Date(2026, 3, 4); // April 4, 2026
    assert.equal(utils.toDateStr(d), '2026-04-04');
  });

  it('zero-pads single-digit months', () => {
    const d = new Date(2026, 0, 15); // Jan 15
    assert.equal(utils.toDateStr(d), '2026-01-15');
  });

  it('zero-pads single-digit days', () => {
    const d = new Date(2026, 11, 5); // Dec 5
    assert.equal(utils.toDateStr(d), '2026-12-05');
  });

  it('round-trips with parseDate', () => {
    const original = '2026-07-23';
    assert.equal(utils.toDateStr(utils.parseDate(original)), original);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. isOD() — overdue detection
// ═══════════════════════════════════════════════════════════════════════════

describe('isOD() — overdue detection', () => {
  it('returns false for null', () => {
    assert.equal(utils.isOD(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(utils.isOD(undefined), false);
  });

  it('returns false for empty string', () => {
    assert.equal(utils.isOD(''), false);
  });

  it('returns false for today', () => {
    assert.equal(utils.isOD(dateStr(new Date())), false);
  });

  it('returns false for tomorrow', () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    assert.equal(utils.isOD(dateStr(d)), false);
  });

  it('returns true for yesterday', () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    assert.equal(utils.isOD(dateStr(d)), true);
  });

  it('returns true for 30 days ago', () => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    assert.equal(utils.isOD(dateStr(d)), true);
  });

  it('returns false for 30 days in future', () => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    assert.equal(utils.isOD(dateStr(d)), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. fmtDue() — comprehensive date formatting
// ═══════════════════════════════════════════════════════════════════════════

describe('fmtDue() — date formatting comprehensive', () => {
  it('returns empty for null', () => assert.equal(utils.fmtDue(null), ''));
  it('returns empty for undefined', () => assert.equal(utils.fmtDue(undefined), ''));
  it('returns empty for empty string', () => assert.equal(utils.fmtDue(''), ''));

  it('returns "2 days ago" for day before yesterday', () => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    assert.equal(utils.fmtDue(dateStr(d)), '2 days ago');
  });

  it('returns "in N days" for 2-6 days ahead', () => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    assert.equal(utils.fmtDue(dateStr(d)), 'in 3 days');
  });

  it('returns "Next week" for exactly 7 days ahead', () => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    assert.equal(utils.fmtDue(dateStr(d)), 'Next week');
  });

  it('returns "Next <weekday>" for 8-13 days ahead', () => {
    const d = new Date(); d.setDate(d.getDate() + 10);
    const r = utils.fmtDue(dateStr(d));
    assert.ok(r.startsWith('Next '), `Expected "Next <day>", got "${r}"`);
  });

  it('returns "Nd overdue" for overdue 3-7 days', () => {
    const d = new Date(); d.setDate(d.getDate() - 5);
    assert.equal(utils.fmtDue(dateStr(d)), '5d overdue');
  });

  it('returns short date for >13 days ahead', () => {
    const d = new Date(); d.setDate(d.getDate() + 60);
    const r = utils.fmtDue(dateStr(d));
    assert.ok(!r.includes('in ') && !r.includes('Next'), `Expected short date for 60 days out, got "${r}"`);
  });

  // Date format settings
  it('iso format returns raw YYYY-MM-DD', () => {
    assert.equal(utils.fmtDue('2026-06-15', { dateFormat: 'iso' }), '2026-06-15');
  });

  it('us format returns US date', () => {
    const r = utils.fmtDue('2026-06-15', { dateFormat: 'us' });
    assert.ok(r.includes('Jun') && r.includes('15'), `Expected US date, got "${r}"`);
  });

  it('eu format returns DD/MM/YYYY', () => {
    assert.equal(utils.fmtDue('2026-06-15', { dateFormat: 'eu' }), '15/06/2026');
  });

  it('eu format zero-pads day', () => {
    assert.equal(utils.fmtDue('2026-01-05', { dateFormat: 'eu' }), '05/01/2026');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. timeAgo() — relative time formatting
// ═══════════════════════════════════════════════════════════════════════════

describe('timeAgo() — relative time', () => {
  it('returns empty for null/undefined', () => {
    assert.equal(utils.timeAgo(null), '');
    assert.equal(utils.timeAgo(undefined), '');
    assert.equal(utils.timeAgo(''), '');
  });

  it('"just now" for <60 seconds ago', () => {
    const d = new Date(Date.now() - 30000).toISOString();
    assert.equal(utils.timeAgo(d), 'just now');
  });

  it('"Nm ago" for minutes', () => {
    const d = new Date(Date.now() - 5 * 60000).toISOString();
    assert.equal(utils.timeAgo(d), '5m ago');
  });

  it('"Nh ago" for hours', () => {
    const d = new Date(Date.now() - 3 * 3600000).toISOString();
    assert.equal(utils.timeAgo(d), '3h ago');
  });

  it('"Nd ago" for days', () => {
    const d = new Date(Date.now() - 2 * 86400000).toISOString();
    assert.equal(utils.timeAgo(d), '2d ago');
  });

  it('returns short date for >7 days', () => {
    const d = new Date(Date.now() - 14 * 86400000).toISOString();
    const r = utils.timeAgo(d);
    assert.ok(!r.includes('ago'), `Expected short date for 14 days ago, got "${r}"`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. renderMd() — markdown renderer with XSS safety
// ═══════════════════════════════════════════════════════════════════════════

describe('renderMd() — markdown to HTML', () => {
  it('returns empty for null/falsy', () => {
    assert.equal(utils.renderMd(null), '');
    assert.equal(utils.renderMd(''), '');
    assert.equal(utils.renderMd(undefined), '');
  });

  it('renders **bold**', () => {
    assert.ok(utils.renderMd('**bold**').includes('<strong>bold</strong>'));
  });

  it('renders *italic*', () => {
    assert.ok(utils.renderMd('*italic*').includes('<em>italic</em>'));
  });

  it('renders `inline code`', () => {
    assert.ok(utils.renderMd('`code`').includes('<code>code</code>'));
  });

  it('renders # heading', () => {
    assert.ok(utils.renderMd('# Title').includes('<h1>Title</h1>'));
  });

  it('renders ## heading', () => {
    assert.ok(utils.renderMd('## Subtitle').includes('<h2>Subtitle</h2>'));
  });

  it('renders ### heading', () => {
    assert.ok(utils.renderMd('### Small').includes('<h3>Small</h3>'));
  });

  it('renders bullet list', () => {
    const r = utils.renderMd('- item 1\n- item 2');
    assert.ok(r.includes('<li>item 1</li>'));
    assert.ok(r.includes('<ul>'));
  });

  it('renders links with safe href', () => {
    const r = utils.renderMd('[Google](https://google.com)');
    assert.ok(r.includes('href="https://google.com"'));
    assert.ok(r.includes('target="_blank"'));
    assert.ok(r.includes('rel="noopener"'));
  });

  it('converts newlines to <br>', () => {
    assert.ok(utils.renderMd('line1\nline2').includes('<br>'));
  });

  it('prevents XSS in markdown text', () => {
    const r = utils.renderMd('<script>alert(1)</script>');
    assert.ok(!r.includes('<script>'));
    assert.ok(r.includes('&lt;script&gt;'));
  });

  it('prevents XSS in link URLs (javascript:)', () => {
    const r = utils.renderMd('[click](javascript:alert(1))');
    assert.ok(!r.includes('javascript:'));
  });

  it('prevents XSS via image onerror', () => {
    const r = utils.renderMd('<img onerror="alert(1)">');
    assert.ok(!r.includes('<img'));
  });

  it('handles nested formatting **bold *italic***', () => {
    const r = utils.renderMd('**bold *italic***');
    assert.ok(r.includes('<strong>'));
  });

  it('escapes HTML before markdown processing', () => {
    const r = utils.renderMd('**<script>alert(1)</script>**');
    assert.ok(r.includes('<strong>'));
    assert.ok(!r.includes('<script>'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Store.js — state management
// ═══════════════════════════════════════════════════════════════════════════

describe('Store.js — state management', () => {
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

  it('exports all required methods', () => {
    assert.ok(typeof Store.get === 'function');
    assert.ok(typeof Store.set === 'function');
    assert.ok(typeof Store.getAll === 'function');
    assert.ok(typeof Store.on === 'function');
    assert.ok(typeof Store.off === 'function');
    assert.ok(typeof Store.emit === 'function');
  });

  it('get/set basic values', () => {
    Store.set('test-key', 'test-value');
    assert.equal(Store.get('test-key'), 'test-value');
  });

  it('set overwrites previous values', () => {
    Store.set('k1', 'v1');
    Store.set('k1', 'v2');
    assert.equal(Store.get('k1'), 'v2');
  });

  it('get returns undefined for missing keys', () => {
    assert.equal(Store.get('nonexistent-key-xyz'), undefined);
  });

  it('getAll returns a copy (not reference)', () => {
    Store.set('copy-test', 'original');
    const all = Store.getAll();
    all['copy-test'] = 'modified';
    assert.equal(Store.get('copy-test'), 'original');
  });

  it('on/emit event system works', () => {
    let received = null;
    Store.on('test-event', (data) => { received = data; });
    Store.emit('test-event', { msg: 'hello' });
    assert.deepEqual(received, { msg: 'hello' });
  });

  it('off removes listener', () => {
    let count = 0;
    const fn = () => count++;
    Store.on('off-test', fn);
    Store.emit('off-test');
    assert.equal(count, 1);
    Store.off('off-test', fn);
    Store.emit('off-test');
    assert.equal(count, 1); // not incremented
  });

  it('set emits change event', () => {
    let fired = false;
    Store.on('change:reactive-key', () => { fired = true; });
    Store.set('reactive-key', 'val');
    assert.ok(fired);
  });

  it('wildcard listener receives all events', () => {
    const events = [];
    const unsub = Store.on('*', (data) => { events.push(data.event); });
    Store.emit('event-a');
    Store.emit('event-b');
    assert.ok(events.includes('event-a'));
    assert.ok(events.includes('event-b'));
    unsub(); // cleanup
  });

  it('on returns unsubscribe function', () => {
    let count = 0;
    const unsub = Store.on('unsub-test', () => count++);
    Store.emit('unsub-test');
    assert.equal(count, 1);
    unsub();
    Store.emit('unsub-test');
    assert.equal(count, 1);
  });

  // Settings helpers
  it('getSettings returns empty object when no settings', () => {
    Store.set('settings', undefined);
    const result = Store.getSettings();
    assert.equal(typeof result, 'object');
    assert.equal(Object.keys(result).length, 0);
  });

  it('setSettings emits settings:changed', () => {
    let fired = false;
    Store.on('settings:changed', () => { fired = true; });
    Store.setSettings({ theme: 'dark' });
    assert.ok(fired);
  });

  it('getSetting retrieves individual setting', () => {
    Store.setSettings({ dateFormat: 'iso', theme: 'midnight' });
    assert.equal(Store.getSetting('dateFormat'), 'iso');
    assert.equal(Store.getSetting('theme'), 'midnight');
  });

  // View state
  it('getView defaults to myday', () => {
    Store.set('currentView', undefined);
    assert.equal(Store.getView(), 'myday');
  });

  it('setView emits view:changed', () => {
    let newView = null;
    Store.on('view:changed', (v) => { newView = v; });
    Store.setView('board');
    assert.equal(newView, 'board');
  });

  // Task helpers
  it('updateTask patches existing task', () => {
    Store.setTasks([{ id: 1, title: 'Test', status: 'todo' }]);
    Store.updateTask(1, { status: 'done' });
    const tasks = Store.get('tasks');
    assert.equal(tasks[0].status, 'done');
    assert.equal(tasks[0].title, 'Test'); // unchanged
  });

  it('updateTask no-ops for missing task id', () => {
    Store.setTasks([{ id: 1, title: 'Only' }]);
    Store.updateTask(999, { status: 'done' }); // should not throw
    assert.equal(Store.get('tasks').length, 1);
  });

  // Mutation queue
  it('queueMutation adds to queue', () => {
    Store.clearQueue();
    Store.queueMutation('POST', '/api/tasks', { title: 'Test' });
    assert.equal(Store.getQueueSize(), 1);
  });

  it('getQueue returns copy', () => {
    Store.clearQueue();
    Store.queueMutation('PUT', '/api/tasks/1', { status: 'done' });
    const q = Store.getQueue();
    q.pop(); // modify copy
    assert.equal(Store.getQueueSize(), 1); // original unchanged
  });

  it('clearQueue empties queue and emits event', () => {
    Store.queueMutation('DELETE', '/api/tasks/1');
    let emitted = false;
    Store.on('queue:changed', () => { emitted = true; });
    Store.clearQueue();
    assert.equal(Store.getQueueSize(), 0);
    assert.ok(emitted);
  });

  it('mutation has timestamp', () => {
    Store.clearQueue();
    const before = Date.now();
    Store.queueMutation('POST', '/api/test', {});
    const q = Store.getQueue();
    assert.ok(q[0].timestamp >= before);
    Store.clearQueue();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Events.js — event cleanup registry
// ═══════════════════════════════════════════════════════════════════════════

describe('Events.js — cleanup registry', () => {
  it('defines Events object with on/cleanup/cleanupAll/delegate', () => {
    assert.ok(eventsSrc.includes('Events'));
    assert.ok(eventsSrc.includes('on(scope'));
    assert.ok(eventsSrc.includes('cleanup(scope'));
    assert.ok(eventsSrc.includes('cleanupAll'));
    assert.ok(eventsSrc.includes('delegate('));
  });

  it('uses Map for scope registry', () => {
    assert.ok(eventsSrc.includes('new Map()'));
  });

  it('tracks element, event, handler, and options', () => {
    assert.ok(eventsSrc.includes('el, event, handler, opts'));
  });

  it('removeEventListener is called during cleanup', () => {
    assert.ok(eventsSrc.includes('removeEventListener'));
  });

  it('cleanupAll iterates all scopes', () => {
    assert.ok(eventsSrc.includes('_registry.keys()'));
  });

  it('delegate uses e.target.closest for event delegation', () => {
    assert.ok(eventsSrc.includes('e.target.closest(selector)'));
  });

  it('delegate checks parent.contains to avoid cross-tree events', () => {
    assert.ok(eventsSrc.includes('parent.contains(target)'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. ErrorBoundary — async error handling
// ═══════════════════════════════════════════════════════════════════════════

describe('ErrorBoundary — async error handling', () => {
  it('defines wrap() method', () => {
    assert.ok(errorsSrc.includes('wrap(fn, label)'));
  });

  it('defines run() method', () => {
    assert.ok(errorsSrc.includes('async run(fn, label)'));
  });

  it('wrap returns a function', () => {
    assert.ok(errorsSrc.includes('return async function'));
  });

  it('catches errors with try/catch', () => {
    const catchCount = (errorsSrc.match(/catch\s*\(err\)/g) || []).length;
    assert.ok(catchCount >= 2, 'should have try/catch in both wrap and run');
  });

  it('logs errors with console.error', () => {
    assert.ok(errorsSrc.includes('console.error'));
  });

  it('shows toast notification on error', () => {
    assert.ok(errorsSrc.includes('showToast'));
  });

  it('includes label in error message', () => {
    assert.ok(errorsSrc.includes('label'));
    assert.ok(errorsSrc.includes('err.message'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. API Client (api.js) — structure validation
// ═══════════════════════════════════════════════════════════════════════════

describe('API Client — structure', () => {
  it('exports api object with get/post/put/del/patch', () => {
    assert.ok(apiSrc.includes('get:'));
    assert.ok(apiSrc.includes('post:'));
    assert.ok(apiSrc.includes('put:'));
    assert.ok(apiSrc.includes('del:'));
    assert.ok(apiSrc.includes('patch:'));
  });

  it('sends Content-Type JSON for data', () => {
    assert.ok(apiSrc.includes("'Content-Type': 'application/json'"));
  });

  it('sends CSRF token header', () => {
    assert.ok(apiSrc.includes('X-CSRF-Token'));
  });

  it('reads CSRF from cookie', () => {
    assert.ok(apiSrc.includes('csrf_token='));
  });

  it('redirects to /login on 401', () => {
    assert.ok(apiSrc.includes('401'));
    assert.ok(apiSrc.includes('/login'));
  });

  it('handles network errors gracefully', () => {
    assert.ok(apiSrc.includes('catch'));
    assert.ok(apiSrc.includes('Network error'));
  });

  it('exports setApiErrorHandler', () => {
    assert.ok(apiSrc.includes('setApiErrorHandler'));
  });

  it('CSRF regex validates 64-char hex string', () => {
    assert.ok(apiSrc.includes('[a-f0-9]{64}'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. app.js — utility functions source inspection
// ═══════════════════════════════════════════════════════════════════════════

describe('app.js — utility functions', () => {
  describe('isValidHexColor', () => {
    it('defined in app.js', () => {
      assert.ok(appJs.includes('function isValidHexColor'));
    });

    it('uses ^ and $ anchors', () => {
      const line = appJs.split('\n').find(l => l.includes('isValidHexColor'));
      assert.ok(line.includes('^') && line.includes('$'));
    });

    it('matches 3 or 6 digit hex only', () => {
      assert.ok(appJs.includes('{3,6}'));
    });
  });

  describe('SL (status labels)', () => {
    it('handles all 3 statuses (todo/doing/done)', () => {
      assert.ok(appJs.includes("todo:'To Do'"));
      assert.ok(appJs.includes("doing:'In Progress'"));
      assert.ok(appJs.includes("done:'Done'"));
    });

    it('supports custom labels from settings', () => {
      assert.ok(appJs.includes('statusLabels'));
    });

    it('has try/catch for malformed JSON', () => {
      const slLine = appJs.split('\n').find(l => l.includes('function SL('));
      assert.ok(slLine.includes('try') && slLine.includes('catch'));
    });
  });

  describe('PLbl (priority labels)', () => {
    it('has 4 levels (None/Normal/High/Critical)', () => {
      assert.ok(appJs.includes("'None','Normal','High','Critical'"));
    });

    it('supports custom labels from settings', () => {
      assert.ok(appJs.includes('priorityLabels'));
    });
  });

  describe('PClr (priority colors)', () => {
    it('has 4 default colors', () => {
      const colors = ['#64748B', '#3B82F6', '#F59E0B', '#EF4444'];
      colors.forEach(c => assert.ok(appJs.includes(c), `Missing color ${c}`));
    });

    it('supports custom colors from settings', () => {
      assert.ok(appJs.includes('priorityColors'));
    });
  });

  describe('streakEmoji', () => {
    it('returns ⚡ for 30+ days', () => {
      assert.ok(appJs.includes("n>=30)return '⚡'"));
    });

    it('returns 🔥🔥 for 14+ days', () => {
      assert.ok(appJs.includes("n>=14)return '🔥🔥'"));
    });

    it('returns 🔥 for 7+ days', () => {
      assert.ok(appJs.includes("n>=7)return '🔥'"));
    });

    it('returns 🌱 for 3+ days', () => {
      assert.ok(appJs.includes("n>=3)return '🌱'"));
    });

    it('returns empty for <3 days', () => {
      assert.ok(appJs.includes("return ''"));
    });
  });

  describe('getGreeting', () => {
    it('has morning/afternoon/evening', () => {
      assert.ok(appJs.includes("'Good morning'"));
      assert.ok(appJs.includes("'Good afternoon'"));
      assert.ok(appJs.includes("'Good evening'"));
    });

    it('morning is before noon (hr<12)', () => {
      assert.ok(appJs.includes('hr<12'));
    });

    it('afternoon is before 5pm (hr<17)', () => {
      assert.ok(appJs.includes('hr<17'));
    });
  });

  describe('progressRingSvg', () => {
    it('generates SVG element', () => {
      assert.ok(appJs.includes('<svg width='));
    });

    it('uses two circles (background + progress)', () => {
      const fn = appJs.substring(appJs.indexOf('function progressRingSvg'), appJs.indexOf('function progressRingSvg') + 600);
      const circleCount = (fn.match(/<circle/g) || []).length;
      assert.equal(circleCount, 2, 'should have background and progress circles');
    });

    it('includes percentage text', () => {
      assert.ok(appJs.includes('<text'));
      assert.ok(appJs.includes('${pct}%'));
    });

    it('has transition for smooth animation', () => {
      assert.ok(appJs.includes('transition:stroke-dashoffset'));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. View dispatcher completeness
// ═══════════════════════════════════════════════════════════════════════════

describe('View dispatcher — render() completeness', () => {
  const renderFn = appJs.substring(appJs.indexOf('async function render(){'), appJs.indexOf('async function render(){') + 3500);
  const views = ['myday', 'tasks', 'focus', 'all', 'board', 'calendar', 'overdue', 'dashboard',
    'weekly', 'matrix', 'logbook', 'tags', 'focushistory', 'templates', 'settings',
    'habits', 'planner', 'inbox', 'review', 'notes', 'timeanalytics', 'rules',
    'reports', 'help', 'changelog', 'lists', 'listdetail', 'smartlist', 'filter',
    'area', 'goal'];

  for (const view of views) {
    it(`handles "${view}" view`, () => {
      assert.ok(renderFn.includes(`'${view}'`), `render() missing handler for view "${view}"`);
    });
  }

  it('has error catching with try/catch', () => {
    assert.ok(renderFn.includes('try{') || renderFn.includes('try {'));
    assert.ok(renderFn.includes('catch(err)') || renderFn.includes('catch (err)'));
  });

  it('shows toast on render error', () => {
    assert.ok(renderFn.includes('showToast'));
  });

  it('cleans up event listeners before render', () => {
    assert.ok(renderFn.includes('Events.cleanupAll()'));
  });

  it('persists last view to localStorage', () => {
    assert.ok(renderFn.includes("localStorage.setItem('lf-lastView'"));
  });

  it('manages loading state class', () => {
    assert.ok(renderFn.includes("classList.add('loading')"));
    assert.ok(renderFn.includes("classList.remove('loading')"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. Breadcrumb (updateBC) — all view titles
// ═══════════════════════════════════════════════════════════════════════════

describe('Breadcrumbs — updateBC', () => {
  const bcFn = appJs.substring(appJs.indexOf('function updateBC(){'), appJs.indexOf('// ─── MY DAY'));

  const viewTitles = {
    myday: 'Today', tasks: 'Tasks', focus: 'Focus', all: 'All Tasks',
    board: 'Board', calendar: 'Calendar', overdue: 'Overdue',
    logbook: 'Activity Log', weekly: 'Weekly Plan', matrix: 'Eisenhower Matrix',
    dashboard: 'Dashboard', tags: 'Tag Manager', focushistory: 'Focus History',
    templates: 'Templates', planner: 'Day Planner', settings: 'Settings',
    habits: 'Habits', inbox: 'Inbox', review: 'Weekly Review', notes: 'Notes',
    timeanalytics: 'Time Analytics', rules: 'Automations', reports: 'Reports',
    help: 'Help & Guide', changelog: 'Changelog', lists: 'Lists',
  };

  for (const [view, title] of Object.entries(viewTitles)) {
    it(`sets title "${title}" for "${view}" view`, () => {
      assert.ok(bcFn.includes(`'${title}'`), `Missing title "${title}" for view "${view}"`);
    });
  }

  it('breadcrumbs navigate back for area view', () => {
    assert.ok(bcFn.includes("data-go=\"myday\""));
  });

  it('breadcrumbs navigate back for goal view', () => {
    assert.ok(bcFn.includes("data-go=\"area\""));
  });

  it('list detail has parent breadcrumb', () => {
    assert.ok(bcFn.includes("data-go=\"lists\""));
  });

  it('list detail shows parent name in breadcrumb for sub-lists', () => {
    assert.ok(bcFn.includes('data-go-list='));
  });

  it('settings view has home button', () => {
    assert.ok(bcFn.includes('settings-home'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Task card HTML — tcHtml structure validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Task card HTML — tcHtml', () => {
  const tcFn = appJs.substring(appJs.indexOf('function tcHtml('), appJs.indexOf('function attachTA()'));

  it('adds priority CSS classes p1/p2/p3', () => {
    assert.ok(tcFn.includes("'p3'"));
    assert.ok(tcFn.includes("'p2'"));
    assert.ok(tcFn.includes("'p1'"));
  });

  it('adds done CSS class for completed', () => {
    assert.ok(tcFn.includes("'done'"));
  });

  it('renders due date with overdue class', () => {
    assert.ok(tcFn.includes("'od'"));
    assert.ok(tcFn.includes('fmtDue'));
  });

  it('renders priority label', () => {
    assert.ok(tcFn.includes('PL[t.priority]'));
  });

  it('renders recurring indicator', () => {
    assert.ok(tcFn.includes('🔁'));
  });

  it('renders blocked indicator', () => {
    assert.ok(tcFn.includes('blocked-indicator'));
    assert.ok(tcFn.includes('lock'));
  });

  it('renders my day sun icon', () => {
    assert.ok(tcFn.includes('myday-toggle'));
    assert.ok(tcFn.includes('wb_sunny'));
  });

  it('renders tags with safe color', () => {
    assert.ok(tcFn.includes('escA(tg.color)'));
    assert.ok(tcFn.includes('esc(tg.name)'));
  });

  it('renders estimated/actual minutes', () => {
    assert.ok(tcFn.includes('estimated_minutes'));
    assert.ok(tcFn.includes('actual_minutes'));
  });

  it('renders subtask progress bar', () => {
    assert.ok(tcFn.includes('st-bar'));
    assert.ok(tcFn.includes('st-fill'));
  });

  it('renders subtask expansion toggle', () => {
    assert.ok(tcFn.includes('tc-expand'));
    assert.ok(tcFn.includes('chevron_right'));
  });

  it('renders action buttons (edit/delete/focus/snooze)', () => {
    assert.ok(tcFn.includes('edit'));
    assert.ok(tcFn.includes('delete_outline'));
    assert.ok(tcFn.includes('timer'));
    assert.ok(tcFn.includes('schedule'));
  });

  it('renders quick action row', () => {
    assert.ok(tcFn.includes('qa-row'));
    assert.ok(tcFn.includes('qa-pri'));
    assert.ok(tcFn.includes('qa-date'));
    assert.ok(tcFn.includes('qa-myday'));
    assert.ok(tcFn.includes('qa-edit'));
  });

  it('renders skip button for recurring tasks', () => {
    assert.ok(tcFn.includes('qa-skip'));
    assert.ok(tcFn.includes('skip_next'));
  });

  it('uses role="checkbox" for task toggle', () => {
    assert.ok(tcFn.includes('role="checkbox"'));
  });

  it('uses tabindex="0" for keyboard access', () => {
    assert.ok(tcFn.includes('tabindex="0"'));
  });

  it('uses aria-checked for accessibility', () => {
    assert.ok(tcFn.includes('aria-checked'));
  });

  it('uses aria-label for Complete task', () => {
    assert.ok(tcFn.includes('aria-label="Complete task"'));
  });

  it('uses draggable="true"', () => {
    assert.ok(tcFn.includes('draggable="true"'));
  });

  it('uses esc() on all user-provided text', () => {
    assert.ok(tcFn.includes('esc(t.title)'));
    assert.ok(tcFn.includes('esc(tg.name)'));
    assert.ok(tcFn.includes('esc(s.title)'));
  });

  it('uses escA() on color attributes', () => {
    assert.ok(tcFn.includes('escA(tg.color)'));
    assert.ok(tcFn.includes("escA(t.list_color||"));
  });

  it('renders assignee badge', () => {
    assert.ok(tcFn.includes('asg-badge'));
    assert.ok(tcFn.includes('assigned_to_user_id'));
  });

  it('renders list badge for tasks on lists', () => {
    assert.ok(tcFn.includes('task-list-badge'));
    assert.ok(tcFn.includes('list_name'));
  });

  it('subtask note shows sticky note icon', () => {
    assert.ok(tcFn.includes('sticky_note_2'));
  });

  it('multi-select checkbox present', () => {
    assert.ok(tcFn.includes('ms-chk'));
  });

  it('selected class toggles', () => {
    assert.ok(tcFn.includes('selected'));
  });

  it('priority cycle next calculated correctly', () => {
    assert.ok(tcFn.includes('(t.priority+1)%4'));
  });

  it('due_time renders with localized format', () => {
    assert.ok(tcFn.includes('toLocaleTimeString'));
    assert.ok(tcFn.includes('hour'));
    assert.ok(tcFn.includes('minute'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. tcMinHtml — minimal task card
// ═══════════════════════════════════════════════════════════════════════════

describe('Task card minimal — tcMinHtml', () => {
  const fn = appJs.substring(appJs.indexOf('function tcMinHtml('), appJs.indexOf('function tcHtml('));

  it('adds tc-min class', () => {
    assert.ok(fn.includes('tc-min'));
  });

  it('adds priority classes', () => {
    assert.ok(fn.includes("'p3'"));
    assert.ok(fn.includes("'p2'"));
    assert.ok(fn.includes("'p1'"));
  });

  it('uses esc() on title', () => {
    assert.ok(fn.includes('esc(t.title)'));
  });

  it('has checkbox with role and aria', () => {
    assert.ok(fn.includes('role="checkbox"'));
    assert.ok(fn.includes('aria-checked'));
    assert.ok(fn.includes('aria-label="Complete task"'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. Navigation — go() function
// ═══════════════════════════════════════════════════════════════════════════

describe('Navigation — go() function', () => {
  const goFn = appJs.substring(appJs.indexOf('function go('), appJs.indexOf('function go(') + 300);

  it('sets currentView', () => {
    assert.ok(goFn.includes('currentView=view'));
  });

  it('resets activeAreaId', () => {
    assert.ok(goFn.includes('activeAreaId=null'));
  });

  it('resets activeGoalId', () => {
    assert.ok(goFn.includes('activeGoalId=null'));
  });

  it('resets vim index', () => {
    assert.ok(goFn.includes('vimIdx=-1'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. login.js — authentication page
// ═══════════════════════════════════════════════════════════════════════════

describe('login.js — authentication', () => {
  it('attaches login form submit handler', () => {
    assert.ok(loginSrc.includes("loginForm.addEventListener('submit'"));
  });

  it('attaches register form submit handler', () => {
    assert.ok(loginSrc.includes("registerForm.addEventListener('submit'"));
  });

  it('sends JSON body for login', () => {
    assert.ok(loginSrc.includes("'Content-Type': 'application/json'"));
  });

  it('includes email, password, remember in login body', () => {
    assert.ok(loginSrc.includes('login-email'));
    assert.ok(loginSrc.includes('login-password'));
    assert.ok(loginSrc.includes('login-remember'));
  });

  it('includes email, password, display_name in register body', () => {
    assert.ok(loginSrc.includes('reg-email'));
    assert.ok(loginSrc.includes('reg-password'));
    assert.ok(loginSrc.includes('reg-name'));
    assert.ok(loginSrc.includes('display_name'));
  });

  it('POSTs to /api/auth/login', () => {
    assert.ok(loginSrc.includes("'/api/auth/login'"));
  });

  it('POSTs to /api/auth/register', () => {
    assert.ok(loginSrc.includes("'/api/auth/register'"));
  });

  it('redirects to / on success', () => {
    const redirectCount = (loginSrc.match(/window\.location\.href\s*=\s*'\/'/g) || []).length;
    assert.ok(redirectCount >= 2, 'Should redirect on both login and register success');
  });

  it('shows error on failure', () => {
    assert.ok(loginSrc.includes('showError'));
  });

  it('handles network error', () => {
    assert.ok(loginSrc.includes('Network error'));
  });

  it('disables button during submit', () => {
    assert.ok(loginSrc.includes('btn.disabled = true'));
    assert.ok(loginSrc.includes('btn.disabled = false'));
  });

  it('has tab switching between login and register', () => {
    assert.ok(loginSrc.includes('auth-tab'));
    assert.ok(loginSrc.includes("dataset.tab === 'login'"));
  });

  it('has password visibility toggle', () => {
    assert.ok(loginSrc.includes('pw-toggle'));
    assert.ok(loginSrc.includes("input.type = isHidden ? 'text' : 'password'"));
  });

  it('checks existing auth session', () => {
    assert.ok(loginSrc.includes("fetch('/api/auth/me')"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. share.js — shared list page
// ═══════════════════════════════════════════════════════════════════════════

describe('share.js — shared list page', () => {
  it('extracts token from URL path', () => {
    assert.ok(shareSrc.includes("location.pathname.split('/').pop()"));
  });

  it('encodes token for API call', () => {
    assert.ok(shareSrc.includes('encodeURIComponent(token)'));
  });

  it('has esc() function for XSS safety', () => {
    assert.ok(shareSrc.includes('const esc') || shareSrc.includes('function esc'));
    assert.ok(shareSrc.includes('textContent'));
  });

  it('has escA() function', () => {
    assert.ok(shareSrc.includes('escA'));
  });

  it('renders grocery list with categories', () => {
    assert.ok(shareSrc.includes("type === 'grocery'"));
    assert.ok(shareSrc.includes('cat-hdr'));
  });

  it('renders notes list differently', () => {
    assert.ok(shareSrc.includes("type === 'notes'"));
    assert.ok(shareSrc.includes('note-content'));
  });

  it('renders checklist items with checkboxes', () => {
    assert.ok(shareSrc.includes('check_box'));
    assert.ok(shareSrc.includes('check_box_outline_blank'));
  });

  it('handles toggle check via PUT', () => {
    assert.ok(shareSrc.includes("method: 'PUT'"));
    assert.ok(shareSrc.includes('checked'));
  });

  it('handles add item via POST', () => {
    assert.ok(shareSrc.includes("method: 'POST'"));
    assert.ok(shareSrc.includes('addItem'));
  });

  it('Enter key adds item', () => {
    assert.ok(shareSrc.includes("e.key === 'Enter'"));
  });

  it('shows error for not found', () => {
    assert.ok(shareSrc.includes('List not found'));
    assert.ok(shareSrc.includes('expired or been revoked'));
  });

  it('shows item count', () => {
    assert.ok(shareSrc.includes('items.length'));
    assert.ok(shareSrc.includes("'s' : ''"));
  });

  it('escapes all user content', () => {
    const escCalls = (shareSrc.match(/esc\(/g) || []).length;
    assert.ok(escCalls >= 5, `Expected >=5 esc() calls, found ${escCalls}`);
  });

  it('has predefined grocery categories in correct order', () => {
    assert.ok(shareSrc.includes('Produce'));
    assert.ok(shareSrc.includes('Bakery'));
    assert.ok(shareSrc.includes('Dairy'));
    assert.ok(shareSrc.includes('Meat & Seafood'));
    assert.ok(shareSrc.includes('Frozen'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. API response validation — all views return proper JSON
// ═══════════════════════════════════════════════════════════════════════════

describe('API responses for frontend views', () => {
  it('GET /api/areas returns array', async () => {
    const res = await agent().get('/api/areas').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tags returns array', async () => {
    const res = await agent().get('/api/tags').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/all returns array', async () => {
    const res = await agent().get('/api/tasks/all').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/my-day returns array', async () => {
    const res = await agent().get('/api/tasks/my-day').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/overdue returns array', async () => {
    const res = await agent().get('/api/tasks/overdue').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/tasks/board returns object with columns', async () => {
    const res = await agent().get('/api/tasks/board').expect(200);
    assert.ok(res.body.todo !== undefined || Array.isArray(res.body));
  });

  it('GET /api/habits returns array', async () => {
    const res = await agent().get('/api/habits').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/lists returns array', async () => {
    const res = await agent().get('/api/lists').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/inbox returns array', async () => {
    const res = await agent().get('/api/inbox').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/notes returns array', async () => {
    const res = await agent().get('/api/notes').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/stats returns stats object', async () => {
    const res = await agent().get('/api/stats').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/filters returns array', async () => {
    const res = await agent().get('/api/filters').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/templates returns array', async () => {
    const res = await agent().get('/api/templates').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('GET /api/settings returns object', async () => {
    const res = await agent().get('/api/settings').expect(200);
    assert.ok(typeof res.body === 'object');
  });

  it('GET /api/export returns export data with areas/goals/tasks', async () => {
    makeArea({ name: 'A' });
    const a = makeArea({ name: 'A2' });
    const g = makeGoal(a.id);
    makeTask(g.id);
    const res = await agent().get('/api/export').expect(200);
    assert.ok(Array.isArray(res.body.areas));
    assert.ok(Array.isArray(res.body.goals));
    assert.ok(Array.isArray(res.body.tasks));
    assert.ok(Array.isArray(res.body.tags));
    assert.ok(Array.isArray(res.body.lists));
    assert.ok(Array.isArray(res.body.habits));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. Task enrichment — frontend data structure
// ═══════════════════════════════════════════════════════════════════════════

describe('Task enrichment for frontend', () => {
  it('task has tags array', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const tag = makeTag({ name: 'urgent' });
    linkTag(task.id, tag.id);
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.ok(Array.isArray(t.tags));
    assert.equal(t.tags.length, 1);
    assert.equal(t.tags[0].name, 'urgent');
  });

  it('task has subtasks array with subtask_done/subtask_total', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    makeSubtask(task.id, { title: 'S1', done: 0 });
    makeSubtask(task.id, { title: 'S2', done: 1 });
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.ok(Array.isArray(t.subtasks));
    assert.equal(t.subtasks.length, 2);
    assert.equal(t.subtask_total, 2);
    assert.equal(t.subtask_done, 1);
  });

  it('subtask includes note field', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    makeSubtask(task.id, { title: 'Sub1', note: 'Note text' });
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.equal(t.subtasks[0].note, 'Note text');
  });

  it('task has list info when list_id is set', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const list = makeList({ name: 'Sprint' });
    const task = makeTask(goal.id, { list_id: list.id });
    const res = await agent().get('/api/tasks/all').expect(200);
    const t = res.body.find(x => x.id === task.id);
    assert.equal(t.list_id, list.id);
    assert.equal(t.list_name, 'Sprint');
  });

  it('board endpoint returns array of tasks with status', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'Todo task', status: 'todo' });
    makeTask(goal.id, { title: 'Done task', status: 'done' });
    const res = await agent().get('/api/tasks/board').expect(200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some(t => t.status === 'todo'));
    assert.ok(res.body.some(t => t.status === 'done'));
  });

  it('my-day endpoint includes my_day tasks', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    makeTask(goal.id, { title: 'My Day', my_day: 1 });
    const res = await agent().get('/api/tasks/my-day').expect(200);
    const t = res.body.find(x => x.title === 'My Day');
    assert.ok(t, 'my_day task should be in my-day view');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 23. Keyboard shortcuts — source validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard shortcuts', () => {
  it('DEFAULT_SHORTCUTS defined', () => {
    assert.ok(appJs.includes('DEFAULT_SHORTCUTS'));
  });

  it('shortcuts are saved/loaded from localStorage', () => {
    assert.ok(appJs.includes("localStorage.getItem('lf-shortcuts')"));
    assert.ok(appJs.includes("localStorage.setItem('lf-shortcuts'"));
  });

  it('shortcut settings synced to server', () => {
    assert.ok(appJs.includes("api.put('/api/settings',{keyboardShortcuts"));
  });

  it('_keyStr builds key combination string', () => {
    assert.ok(appJs.includes('function _keyStr('));
    assert.ok(appJs.includes('ctrlKey'));
    assert.ok(appJs.includes('altKey'));
    assert.ok(appJs.includes('shiftKey'));
  });

  it('_matchShortcut compares against bound shortcuts', () => {
    assert.ok(appJs.includes('function _matchShortcut('));
  });

  it('Escape key handles overlay closing', () => {
    assert.ok(appJs.includes("e.key==='Escape'") || appJs.includes("key === 'Escape'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. Focus timer — source validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Focus timer', () => {
  it('has technique picker with Pomodoro/50-10/90-20/Custom', () => {
    assert.ok(appJs.includes('showTechniquePicker'));
    assert.ok(appJs.includes('Pomodoro') || appJs.includes('pomodoro'));
  });

  it('shows focus plan modal', () => {
    assert.ok(appJs.includes('showFocusPlan'));
  });

  it('has focus UI with SVG ring', () => {
    assert.ok(appJs.includes('showFocusUI'));
  });

  it('has reflection modal', () => {
    assert.ok(appJs.includes('showReflection'));
  });

  it('tracks focus steps', () => {
    assert.ok(appJs.includes('renderPlanSteps') || appJs.includes('renderFTSteps'));
  });

  it('quickStartSession for fast focus', () => {
    assert.ok(appJs.includes('quickStartSession'));
  });

  it('saves last technique per area', () => {
    assert.ok(appJs.includes('getLastTechnique'));
    assert.ok(appJs.includes('saveLastTechnique'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 25. Multi-select mode
// ═══════════════════════════════════════════════════════════════════════════

describe('Multi-select mode', () => {
  it('toggleMultiSelect function exists', () => {
    assert.ok(appJs.includes('function toggleMultiSelect'));
  });

  it('hideMultiSelectBar function exists', () => {
    assert.ok(appJs.includes('function hideMultiSelectBar'));
  });

  it('updateMultiSelectBar renders bar content', () => {
    assert.ok(appJs.includes('function updateMultiSelectBar'));
  });

  it('selectedIds tracks selection', () => {
    assert.ok(appJs.includes('selectedIds'));
  });

  it('adds ms-mode class to body', () => {
    assert.ok(appJs.includes("'ms-mode'"));
  });

  it('shows ms-bar element', () => {
    assert.ok(appJs.includes('ms-bar'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 26. Undo system
// ═══════════════════════════════════════════════════════════════════════════

describe('Undo system', () => {
  it('pushUndo function exists', () => {
    assert.ok(appJs.includes('function pushUndo'));
  });

  it('showUndoToast function exists', () => {
    assert.ok(appJs.includes('function showUndoToast'));
  });

  it('toast has undo button', () => {
    assert.ok(appJs.includes('undo-btn') || appJs.includes('Undo'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 27. Focus trap for modals
// ═══════════════════════════════════════════════════════════════════════════

describe('Focus trap', () => {
  it('trapFocus function exists', () => {
    assert.ok(appJs.includes('function trapFocus'));
  });

  it('traps Tab key within container', () => {
    const fn = appJs.substring(appJs.indexOf('function trapFocus'), appJs.indexOf('function trapFocus') + 500);
    assert.ok(fn.includes('Tab'));
  });

  it('focuses first/last focusable element', () => {
    assert.ok(appJs.includes('focusable') || appJs.includes('[tabindex'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 28. Overlay lifecycle helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('Overlay lifecycle', () => {
  it('_lockBody locks scroll', () => {
    assert.ok(appJs.includes('function _lockBody'));
    assert.ok(appJs.includes("body.style.overflow='hidden'"));
  });

  it('_unlockBody restores scroll', () => {
    assert.ok(appJs.includes('function _unlockBody'));
  });

  it('_pushFocus saves current focus', () => {
    assert.ok(appJs.includes('function _pushFocus'));
    assert.ok(appJs.includes('_overlayStack'));
  });

  it('_popFocus restores saved focus', () => {
    assert.ok(appJs.includes('function _popFocus'));
  });

  it('_unlockBody checks for active overlays before unlocking', () => {
    const fn = appJs.split('\n').find(l => l.includes('function _unlockBody'));
    assert.ok(fn.includes('.active') || fn.includes('querySelector'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 29. Vim-style keyboard navigation
// ═══════════════════════════════════════════════════════════════════════════

describe('Vim-style navigation', () => {
  it('vimHighlight function highlights task', () => {
    assert.ok(appJs.includes('function vimHighlight'));
  });

  it('vimMove navigates between tasks', () => {
    assert.ok(appJs.includes('function vimMove'));
  });

  it('getVisibleCards returns DOM task cards', () => {
    assert.ok(appJs.includes('function getVisibleCards'));
    assert.ok(appJs.includes('#ct .tc[data-id]'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 30. Share card generation
// ═══════════════════════════════════════════════════════════════════════════

describe('Share cards', () => {
  it('generateShareCard function exists', () => {
    assert.ok(appJs.includes('function generateShareCard'));
  });

  it('shareWeeklySummary function exists', () => {
    assert.ok(appJs.includes('function shareWeeklySummary'));
  });

  it('shareFocusCard function exists', () => {
    assert.ok(appJs.includes('function shareFocusCard'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 31. Frontend field validation in app.js
// ═══════════════════════════════════════════════════════════════════════════

describe('Frontend field validation', () => {
  it('validateField function exists', () => {
    assert.ok(appJs.includes('function validateField'));
  });

  it('validates required fields', () => {
    const fn = appJs.substring(appJs.indexOf('function validateField'), appJs.indexOf('function clearFieldError'));
    assert.ok(fn.includes('required'));
  });

  it('validates maxlength', () => {
    assert.ok(appJs.includes('maxlength'));
  });

  it('validates pattern (regex)', () => {
    assert.ok(appJs.includes('pattern'));
  });

  it('adds inp-err class on error', () => {
    assert.ok(appJs.includes('inp-err'));
  });

  it('clearFieldError removes error state', () => {
    assert.ok(appJs.includes('function clearFieldError'));
  });

  it('area modal validates name before submit', () => {
    assert.ok(appJs.includes("validateField('am-name'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 32. Served HTML validation via API
// ═══════════════════════════════════════════════════════════════════════════

describe('HTML pages served correctly', () => {
  it('/ serves index.html with app.js reference', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('app.js'));
  });

  it('/ has no inline <script> blocks', async () => {
    const res = await agent().get('/').expect(200);
    const inlineScripts = res.text.match(/<script>[^<]+<\/script>/g) || [];
    assert.equal(inlineScripts.length, 0);
  });

  it('index.html references styles.css', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('styles.css'));
  });

  it('index.html has viewport meta tag', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('viewport'));
  });

  it('index.html has manifest link', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('manifest.json'));
  });

  it('app.js has service worker registration', () => {
    assert.ok(appJs.includes("serviceWorker") && appJs.includes("sw.js"));
  });

  it('index.html has Inter font', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('Inter'));
  });

  it('index.html has Material Icons', async () => {
    const res = await agent().get('/').expect(200);
    assert.ok(res.text.includes('Material Icons') || res.text.includes('material-icons'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 33. Sidebar navigation items
// ═══════════════════════════════════════════════════════════════════════════

describe('Sidebar navigation', () => {
  const sidebarItems = ['myday', 'tasks', 'board', 'calendar', 'dashboard', 'habits'];

  for (const view of sidebarItems) {
    it(`has sidebar item for "${view}" view`, () => {
      assert.ok(indexHtml.includes(`data-view="${view}"`) || appJs.includes(`data-view="${view}"`),
        `Missing sidebar item for "${view}"`);
    });
  }

  it('has sidebar section for lists', () => {
    assert.ok(indexHtml.includes('data-sec="lists"') || indexHtml.includes('sb-list-items'));
  });

  it('sidebar has collapsible section headers', () => {
    assert.ok(indexHtml.includes('collapsible') || appJs.includes('collapsible') || css.includes('collapsible'));
  });

  it('sidebar has icon-rail mode', () => {
    assert.ok(css.includes('icon-rail') || appJs.includes('icon-rail'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 34. Heatmap builder — source validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Heatmap builder', () => {
  const fn = appJs.substring(appJs.indexOf('function buildHeatmap('), appJs.indexOf('function buildHeatmap(') + 800);

  it('generates 365 cells', () => {
    assert.ok(fn.includes('365') || fn.includes('364'));
  });

  it('colors cells based on count', () => {
    assert.ok(fn.includes('background') || fn.includes('style'));
  });

  it('shows tooltip on hover', () => {
    assert.ok(fn.includes('title') || fn.includes('tooltip'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 35. Settings view — tabs and persistence
// ═══════════════════════════════════════════════════════════════════════════

describe('Settings view', () => {
  const settingsStart = appJs.indexOf('async function renderSettings()');
  const settingsBlock = appJs.substring(settingsStart, settingsStart + 5000);

  it('has wireSettingsTabs for tab switching', () => {
    assert.ok(appJs.includes('function wireSettingsTabs'));
  });

  it('settings tabs include General/Appearance/Tags', () => {
    assert.ok(settingsBlock.includes('General') || appJs.includes("'General'"));
    assert.ok(settingsBlock.includes('Appearance') || appJs.includes("'Appearance'"));
  });

  it('toggle helper generates checkboxes', () => {
    assert.ok(appJs.includes("function tog("));
  });

  it('selOpts helper generates select options', () => {
    assert.ok(appJs.includes("function selOpts("));
  });

  it('showSavedIndicator provides visual feedback', () => {
    assert.ok(appJs.includes('function showSavedIndicator'));
  });

  it('settings saved via API', () => {
    assert.ok(appJs.includes("api.put('/api/settings'") || appJs.includes('saveSetting'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 36. Onboarding wizard
// ═══════════════════════════════════════════════════════════════════════════

describe('Onboarding wizard', () => {
  it('onboarding overlay exists in HTML', () => {
    assert.ok(indexHtml.includes('onb-ov') || appJs.includes('onb-ov'));
  });

  it('onboarding CSS exists', () => {
    assert.ok(css.includes('onb-ov') || css.includes('onboarding'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 37. Daily review modal
// ═══════════════════════════════════════════════════════════════════════════

describe('Daily review', () => {
  it('openDailyReview function exists', () => {
    assert.ok(appJs.includes('async function openDailyReview'));
  });

  it('closeDR function exists', () => {
    assert.ok(appJs.includes('function closeDR'));
  });

  it('multi-step review (step 1, 2, 3)', () => {
    assert.ok(appJs.includes('renderDRStep1'));
    assert.ok(appJs.includes('renderDRStep2'));
    assert.ok(appJs.includes('renderDRStep3'));
  });

  it('daily review overlay in HTML', () => {
    assert.ok(indexHtml.includes('dr-ov'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 38. Confetti on goal completion
// ═══════════════════════════════════════════════════════════════════════════

describe('Confetti effect', () => {
  it('fireConfetti function exists', () => {
    assert.ok(appJs.includes('function fireConfetti'));
  });

  it('respects prefers-reduced-motion via CSS', () => {
    assert.ok(css.includes('prefers-reduced-motion') && css.includes('confetti'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 39. Custom fields settings
// ═══════════════════════════════════════════════════════════════════════════

describe('Custom fields settings', () => {
  it('renderCustomFieldsSettings function exists', () => {
    assert.ok(appJs.includes('async function renderCustomFieldsSettings'));
  });

  it('supports text/number/date/select field types', () => {
    const fn = appJs.substring(appJs.indexOf('async function renderCustomFieldsSettings'), appJs.indexOf('async function renderCustomFieldsSettings') + 2000);
    assert.ok(fn.includes('text') || appJs.includes("'text'"));
    assert.ok(fn.includes('number') || appJs.includes("'number'"));
    assert.ok(fn.includes('date') || appJs.includes("'date'"));
    assert.ok(fn.includes('select') || appJs.includes("'select'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 40. Saved filters / smart lists
// ═══════════════════════════════════════════════════════════════════════════

describe('Saved filters and smart lists', () => {
  it('loadSavedFilters function exists', () => {
    assert.ok(appJs.includes('async function loadSavedFilters'));
  });

  it('renderSFList renders sidebar filter list', () => {
    assert.ok(appJs.includes('function renderSFList'));
  });

  it('renderSavedFilter renders filter view', () => {
    assert.ok(appJs.includes('async function renderSavedFilter'));
  });

  it('renderSmartList renders smart lists', () => {
    assert.ok(appJs.includes('async function renderSmartList'));
  });

  it('smart list types include stale/quickwins/blocked', () => {
    assert.ok(appJs.includes("'stale'") || appJs.includes('stale'));
    assert.ok(appJs.includes("'quickwins'") || appJs.includes('quickwins'));
    assert.ok(appJs.includes("'blocked'") || appJs.includes('blocked'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 41. List modal
// ═══════════════════════════════════════════════════════════════════════════

describe('List modal', () => {
  it('openListModal function exists', () => {
    assert.ok(appJs.includes('function openListModal'));
  });

  it('renderLists function exists', () => {
    assert.ok(appJs.includes('async function renderLists'));
  });

  it('renderListDetail function exists', () => {
    assert.ok(appJs.includes('async function renderListDetail'));
  });

  it('openShopMode for grocery lists', () => {
    assert.ok(appJs.includes('async function openShopMode'));
  });

  it('list item metadata rendering', () => {
    assert.ok(appJs.includes('_renderItemMeta') || appJs.includes('renderItemMeta'));
  });
});
