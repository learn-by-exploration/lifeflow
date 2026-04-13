/**
 * Frontend Unit Tests
 *
 * Tests frontend utility functions and NLP parser via:
 * 1. Behavioral tests using jsdom (esc, escA, fmtDue, renderMd)
 * 2. HTTP API (NLP parse endpoint)
 * 3. Source inspection (isValidHexColor, service worker)
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

// ─── Load utils.js functions into jsdom ─────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const utilsSrc = fs.readFileSync(path.join(PUBLIC, 'js', 'utils.js'), 'utf8');
const cleanSrc = utilsSrc
  .replace(/^export /gm, '')
  .replace(/^export\{[^}]*\}/gm, '');
const loadUtils = new Function('document', 'window', cleanSrc + '\nreturn { esc, escA, fmtDue, renderMd, parseDate, toDateStr, isOD, timeAgo };');
const utils = loadUtils(dom.window.document, dom.window);

// Helper: format a Date as YYYY-MM-DD
function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── 1. esc() — behavioral tests ───────────────────────────────────────────

describe('esc() — behavioral', () => {
  it('escapes HTML tags', () => {
    assert.equal(utils.esc('<script>alert("xss")</script>'), '&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  it('passes through normal text', () => {
    assert.equal(utils.esc('normal text'), 'normal text');
  });

  it('returns empty string for empty input', () => {
    assert.equal(utils.esc(''), '');
  });

  it('double-escapes existing entities', () => {
    assert.equal(utils.esc('&amp;'), '&amp;amp;');
  });

  it('API returns raw user content (escaping is client-side)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const xss = '<script>alert("xss")</script>';
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({
      title: xss
    });
    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}`);
    assert.equal(res.body.title, xss, 'Server stores raw — frontend escapes on display');
  });
});

// ─── 2. escA() — behavioral tests ──────────────────────────────────────────

describe('escA() — behavioral', () => {
  it('escapes angle brackets', () => {
    assert.equal(utils.escA('<img onerror=alert(1)>'), '&lt;img onerror=alert(1)&gt;');
  });

  it('escapes double quotes', () => {
    const result = utils.escA('"onclick="alert(1)"');
    assert.ok(result.includes('&quot;'), 'should escape double quotes');
  });

  it('escapes single quotes', () => {
    const result = utils.escA("it's");
    assert.ok(result.includes('&#39;'), 'should escape single quotes');
  });

  it('escapes ampersand', () => {
    assert.equal(utils.escA('a & b'), 'a &amp; b');
  });
});

// ─── 3. fmtDue() — behavioral tests ────────────────────────────────────────

describe('fmtDue() — behavioral', () => {
  it('returns empty string for null', () => {
    assert.equal(utils.fmtDue(null), '');
  });

  it('returns "Today" for today', () => {
    const today = new Date();
    assert.equal(utils.fmtDue(dateStr(today)), 'Today');
  });

  it('returns "Tomorrow" for tomorrow', () => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    assert.equal(utils.fmtDue(dateStr(tmrw)), 'Tomorrow');
  });

  it('returns "Yesterday" for yesterday', () => {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    assert.equal(utils.fmtDue(dateStr(yest)), 'Yesterday');
  });

  it('returns date as-is for iso format', () => {
    const d = '2026-06-15';
    assert.equal(utils.fmtDue(d, { dateFormat: 'iso' }), d);
  });
});

// ─── 4. renderMd() — behavioral tests ──────────────────────────────────────

describe('renderMd() — behavioral', () => {
  it('renders **bold** as <strong>', () => {
    const result = utils.renderMd('**bold**');
    assert.ok(result.includes('<strong>bold</strong>'), `got: ${result}`);
  });

  it('renders *italic* as <em>', () => {
    const result = utils.renderMd('*italic*');
    assert.ok(result.includes('<em>italic</em>'), `got: ${result}`);
  });

  it('renders `code` as <code>', () => {
    const result = utils.renderMd('`code`');
    assert.ok(result.includes('<code>code</code>'), `got: ${result}`);
  });

  it('returns empty string for null', () => {
    assert.equal(utils.renderMd(null), '');
  });

  it('escapes <script> tags (XSS safety)', () => {
    const result = utils.renderMd('<script>xss</script>');
    assert.ok(!result.includes('<script>'), 'raw <script> should be escaped');
    assert.ok(result.includes('&lt;script&gt;'), 'should contain escaped tag');
  });
});

// ─── 4. NLP Parser via API ─────────────────────────────────────────────────

describe('NLP parser — POST /api/tasks/parse', () => {
  it('extracts title, priority, tags from "buy milk tomorrow p1 #groceries"', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: 'buy milk tomorrow p1 #groceries' })
      .expect(200);
    assert.ok(res.body.title.includes('buy milk'), 'title extracted');
    assert.equal(res.body.priority, 1, 'priority p1 = 1');
    assert.ok(res.body.due_date, 'due_date extracted for tomorrow');
    assert.deepEqual(res.body.tags, ['groceries'], 'tag extracted');
  });

  it('parses "meeting next monday" with correct date', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: 'meeting next monday' })
      .expect(200);
    assert.ok(res.body.title.includes('meeting'), 'title preserved');
    assert.ok(res.body.due_date, 'due_date set');
    // Verify date is valid and resolves to Monday (timezone-safe check)
    const parsed = new Date(res.body.due_date + 'T12:00:00');
    assert.ok(!Number.isNaN(parsed.getTime()), 'parsed date should be valid');
    assert.equal(parsed.getDay(), 1, 'parsed date should be Monday');
  });

  it('parses "p2 review docs" → priority 2', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: 'p2 review docs' })
      .expect(200);
    assert.equal(res.body.priority, 2);
    assert.ok(res.body.title.includes('review docs'));
  });

  it('rejects empty string with 400', async () => {
    await agent().post('/api/tasks/parse')
      .send({ text: '' })
      .expect(400);
  });

  it('rejects whitespace-only with 400', async () => {
    await agent().post('/api/tasks/parse')
      .send({ text: '   ' })
      .expect(400);
  });

  it('preserves unicode text with emoji', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: '完了する 🎉 p1' })
      .expect(200);
    assert.ok(res.body.title.includes('🎉'), 'emoji preserved');
    assert.equal(res.body.priority, 1);
  });

  it('extracts multiple tags "#a #b"', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: 'task with #alpha #beta' })
      .expect(200);
    assert.ok(res.body.tags.includes('alpha'), 'first tag');
    assert.ok(res.body.tags.includes('beta'), 'second tag');
    assert.equal(res.body.tags.length, 2);
  });

  it('"today" → today\'s date', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: 'do laundry today' })
      .expect(200);
    assert.ok(res.body.due_date, 'due_date should be set');
    // NLP parser uses local dates — verify it produces a valid YYYY-MM-DD
    assert.match(res.body.due_date, /^\d{4}-\d{2}-\d{2}$/, 'date format YYYY-MM-DD');
    // Should be today or close (within 1 day due to UTC vs local)
    const diff = Math.abs(new Date(res.body.due_date + 'T12:00:00') - new Date());
    assert.ok(diff < 2 * 864e5, 'should be within 1 day of now');
  });

  it('handles text near 500 char limit', async () => {
    const longText = 'a'.repeat(494) + ' p1';
    const res = await agent().post('/api/tasks/parse')
      .send({ text: longText })
      .expect(200);
    assert.equal(res.body.priority, 1);
  });

  it('rejects text over 500 characters', async () => {
    const tooLong = 'x'.repeat(501);
    const res = await agent().post('/api/tasks/parse')
      .send({ text: tooLong })
      .expect(400);
    assert.ok(res.body.error.includes('too long') || res.body.error.includes('500'));
  });

  it('special characters in title are preserved', async () => {
    const res = await agent().post('/api/tasks/parse')
      .send({ text: 'fix bug & "review" <code>' })
      .expect(200);
    assert.ok(res.body.title.includes('&'), '& preserved');
    assert.ok(res.body.title.includes('"'), '" preserved');
    assert.ok(res.body.title.includes('<'), '< preserved');
  });
});

// ─── 5. isValidHexColor (source inspection) ────────────────────────────────

describe('isValidHexColor — source inspection', () => {
  it('function exists in app.js', () => {
    assert.ok(appJs.includes('isValidHexColor'), 'isValidHexColor defined');
  });

  it('uses regex to match #RGB or #RRGGBB patterns', () => {
    // Extract the full function line
    const line = appJs.split('\n').find(l => l.includes('isValidHexColor'));
    assert.ok(line, 'isValidHexColor line found');
    assert.ok(line.includes('#'), 'regex checks for # prefix');
    assert.ok(line.includes('0-9') || line.includes('A-F') || line.includes('a-f'), 'regex checks hex chars');
  });

  it('accepts 3-digit and 6-digit hex via {3,6} quantifier', () => {
    const line = appJs.split('\n').find(l => l.includes('isValidHexColor'));
    assert.ok(line.includes('{3,6}'), 'regex uses {3,6} quantifier for 3 or 6 hex chars');
  });

  it('uses .test() method for boolean return', () => {
    const line = appJs.split('\n').find(l => l.includes('isValidHexColor'));
    assert.ok(line.includes('.test('), 'uses regex.test() for boolean result');
  });

  it('anchors regex with ^ and $ to prevent partial matches', () => {
    const line = appJs.split('\n').find(l => l.includes('isValidHexColor'));
    assert.ok(line.includes('^#') && line.includes('$'), 'regex is anchored');
  });
});

// ─── 6. Service Worker (source inspection) ──────────────────────────────────

describe('Service Worker — source inspection', () => {
  it('sw.js exists and defines a cache name', () => {
    assert.ok(swJs.length > 100, 'sw.js has non-trivial content');
    assert.ok(swJs.includes('CACHE_NAME'), 'defines CACHE_NAME');
    assert.ok(swJs.includes('CACHE_VERSION'), 'defines CACHE_VERSION');
  });

  it('uses network-first caching for static assets', () => {
    assert.ok(swJs.includes("fetch(request)"), 'fetches from network');
    assert.ok(swJs.includes('caches.open'), 'opens cache storage');
    assert.ok(swJs.includes('cache.put'), 'puts responses in cache');
  });

  it('handles fetch events', () => {
    assert.ok(swJs.includes("addEventListener('fetch'"), 'listens for fetch events');
  });

  it('cleans old caches on activate', () => {
    assert.ok(swJs.includes("addEventListener('activate'"), 'activate handler exists');
    assert.ok(swJs.includes('caches.keys()'), 'enumerates caches');
    assert.ok(swJs.includes('caches.delete'), 'deletes old caches');
  });

  it('has offline fallback logic for mutations', () => {
    assert.ok(swJs.includes('mutation-failed'), 'sends mutation-failed message');
    assert.ok(swJs.includes('503'), 'returns 503 for offline mutations');
    assert.ok(swJs.includes('Offline'), 'includes offline indicator in response');
  });
});
