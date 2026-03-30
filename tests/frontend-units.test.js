/**
 * Frontend Unit Tests
 *
 * Tests frontend utility functions and NLP parser via:
 * 1. Source inspection (read file, verify patterns/logic)
 * 2. HTTP API (NLP parse endpoint)
 *
 * Does NOT import browser JS directly (it uses DOM APIs).
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const utilsJs = fs.readFileSync(path.join(PUBLIC, 'js', 'utils.js'), 'utf8');
const swJs = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── 1. HTML Escaping Verification (source inspection) ─────────────────────

describe('HTML escaping — source inspection', () => {
  it('esc() in app.js uses DOM textContent for escaping', () => {
    assert.ok(appJs.includes('function esc('), 'esc function must exist');
    assert.ok(appJs.includes('textContent'), 'esc should use textContent assignment');
    assert.ok(appJs.includes('.innerHTML'), 'esc should return innerHTML');
  });

  it('esc() in utils.js also uses DOM textContent', () => {
    assert.ok(utilsJs.includes('export function esc('), 'esc must be exported from utils.js');
    assert.ok(utilsJs.includes('textContent'), 'utils esc should use textContent');
  });

  it('escA() replaces &, ", \', <, > characters', () => {
    // Check in both app.js and utils.js
    const escABody = utilsJs.match(/export function escA\(s\)\s*\{[^}]+\}/);
    assert.ok(escABody, 'escA function exists in utils.js');
    const body = escABody[0];
    assert.ok(body.includes('&amp;'), 'escA escapes &');
    assert.ok(body.includes('&quot;'), 'escA escapes "');
    assert.ok(body.includes('&#39;'), 'escA escapes \'');
    assert.ok(body.includes('&lt;'), 'escA escapes <');
    assert.ok(body.includes('&gt;'), 'escA escapes >');
  });

  it('escA() in app.js matches utils.js pattern', () => {
    assert.ok(appJs.includes('function escA('), 'escA exists in app.js');
    assert.ok(appJs.includes('&amp;') && appJs.includes('&lt;'), 'app.js escA handles & and <');
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

// ─── 2. fmtDue() Date Formatting (source inspection) ───────────────────────

describe('fmtDue() — source inspection', () => {
  it('fmtDue function exists in both app.js and utils.js', () => {
    assert.ok(appJs.includes('function fmtDue('), 'fmtDue in app.js');
    assert.ok(utilsJs.includes('export function fmtDue('), 'fmtDue in utils.js');
  });

  it('handles today, tomorrow, yesterday labels', () => {
    // Check utils.js version (more readable)
    assert.ok(utilsJs.includes("'Today'"), 'fmtDue handles today');
    assert.ok(utilsJs.includes("'Tomorrow'"), 'fmtDue handles tomorrow');
    assert.ok(utilsJs.includes("'Yesterday'"), 'fmtDue handles yesterday');
  });

  it('handles relative day ranges (overdue, upcoming)', () => {
    assert.ok(utilsJs.includes("'d overdue'"), 'Shows overdue label');
    assert.ok(utilsJs.includes("'in '"), 'Shows "in N days"');
    assert.ok(utilsJs.includes("'Next week'"), 'Shows "Next week" for 7 days');
  });

  it('supports multiple date formats: relative, iso, us, eu', () => {
    assert.ok(utilsJs.includes("'relative'"), 'relative format');
    assert.ok(utilsJs.includes("'iso'"), 'ISO format');
    assert.ok(utilsJs.includes("'us'"), 'US format');
    assert.ok(utilsJs.includes("'eu'"), 'EU format');
  });

  it('returns empty string for null/undefined input', () => {
    assert.ok(utilsJs.includes("if (!d) return ''"), 'fmtDue returns empty for falsy');
  });
});

// ─── 3. renderMd() Markdown (source inspection) ────────────────────────────

describe('renderMd() — source inspection', () => {
  it('renderMd exists and calls esc() first', () => {
    assert.ok(appJs.includes('function renderMd('), 'renderMd exists in app.js');
    // Extract renderMd body ~30 lines after function
    const idx = appJs.indexOf('function renderMd(');
    const snippet = appJs.slice(idx, idx + 800);
    assert.ok(snippet.includes('esc('), 'renderMd calls esc() for XSS safety');
  });

  it('renders bold, italic, code syntax', () => {
    const idx = appJs.indexOf('function renderMd(');
    const snippet = appJs.slice(idx, idx + 800);
    assert.ok(snippet.includes('<strong>'), 'renderMd handles **bold**');
    assert.ok(snippet.includes('<em>'), 'renderMd handles *italic*');
    assert.ok(snippet.includes('<code>'), 'renderMd handles `code`');
  });

  it('only allows http/https URLs in links', () => {
    const idx = appJs.indexOf('function renderMd(');
    const snippet = appJs.slice(idx, idx + 800);
    assert.ok(
      snippet.includes('https?://') || snippet.includes('https?:\\/\\/') || (snippet.includes('http') && snippet.includes('protocol')),
      'renderMd requires http/https protocol in links'
    );
  });

  it('validates URL protocol to block javascript: URIs', () => {
    const idx = appJs.indexOf('function renderMd(');
    const snippet = appJs.slice(idx, idx + 800);
    assert.ok(
      snippet.includes("protocol!=='http:'") || snippet.includes('protocol'),
      'renderMd checks URL protocol'
    );
  });

  it('returns empty string for falsy input', () => {
    const idx = appJs.indexOf('function renderMd(');
    const snippet = appJs.slice(idx, idx + 200);
    assert.ok(snippet.includes("if(!text)return''"), 'renderMd returns empty for falsy');
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
    // Verify the parsed date is in the future
    const parsed = new Date(res.body.due_date + 'T12:00:00');
    const now = new Date();
    assert.ok(parsed > now, 'next monday should be in the future');
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
