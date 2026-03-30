const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, agent, makeArea } = require('./helpers');
const fs = require('fs');
const path = require('path');

describe('XSS Prevention & Output Encoding', () => {
  beforeEach(() => cleanDb());

  // ═══════════════════════════════════════════════════════════════════════════
  // Server-side color validation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Server-side color validation', () => {
    it('POST /api/areas with color "#FF0000" → accepted', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Red Area', color: '#FF0000' });
      assert.equal(res.status, 201);
      assert.equal(res.body.color, '#FF0000');
    });

    it('POST /api/areas with color "#FFF" → accepted (3-char hex)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Short Hex', color: '#FFF' });
      assert.equal(res.status, 201);
      assert.equal(res.body.color, '#FFF');
    });

    it('POST /api/areas with color "red" → rejected (400)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Named Color', color: 'red' });
      assert.equal(res.status, 400);
    });

    it('POST /api/areas with color "#FF0000; display:none" → rejected (400)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'CSS Inject', color: '#FF0000; display:none' });
      assert.equal(res.status, 400);
    });

    it('POST /api/areas with color "<script>" → rejected (400)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Script', color: '<script>' });
      assert.equal(res.status, 400);
    });

    it('POST /api/goals with invalid color → rejected (400)', async () => {
      const area = makeArea();
      const res = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'Goal', color: 'javascript:alert(1)' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/areas/:id with CSS injection color → rejected (400)', async () => {
      const area = makeArea();
      const res = await agent().put(`/api/areas/${area.id}`).send({ color: '#000;background:url(evil)' });
      assert.equal(res.status, 400);
    });

    it('POST /api/tags with invalid color → rejected (400)', async () => {
      const res = await agent().post('/api/tags').send({ name: 'xss-tag', color: 'notacolor' });
      assert.equal(res.status, 400);
    });

    it('POST /api/habits with invalid color → rejected (400)', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Habit', color: 'rgb(0,0,0)' });
      assert.equal(res.status, 400);
    });

    it('POST /api/habits with valid hex color → accepted', async () => {
      const res = await agent().post('/api/habits').send({ name: 'Good Habit', color: '#22C55E' });
      assert.equal(res.status, 201);
      assert.equal(res.body.color, '#22C55E');
    });

    it('POST /api/lists with invalid color → rejected (400)', async () => {
      const res = await agent().post('/api/lists').send({ name: 'List', color: '<img onerror=alert(1)>' });
      assert.equal(res.status, 400);
    });

    it('POST /api/lists with valid hex color → accepted', async () => {
      const res = await agent().post('/api/lists').send({ name: 'Good List', color: '#AABBCC' });
      assert.equal(res.status, 201);
      assert.equal(res.body.color, '#AABBCC');
    });

    it('PUT /api/habits/:id with CSS injection color → rejected (400)', async () => {
      const createRes = await agent().post('/api/habits').send({ name: 'h1', color: '#123456' });
      assert.equal(createRes.status, 201);
      const res = await agent().put(`/api/habits/${createRes.body.id}`).send({ color: '#000;position:fixed' });
      assert.equal(res.status, 400);
    });

    it('PUT /api/lists/:id with invalid color → rejected (400)', async () => {
      const createRes = await agent().post('/api/lists').send({ name: 'l1', color: '#123456' });
      assert.equal(createRes.status, 201);
      const res = await agent().put(`/api/lists/${createRes.body.id}`).send({ color: 'hsla(0,100%,50%,1)' });
      assert.equal(res.status, 400);
    });

    it('POST /api/areas with color "#FFFF" → rejected (4-char hex invalid)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Four Char', color: '#FFFF' });
      assert.equal(res.status, 400);
    });

    it('POST /api/areas with color "#FFFFF" → rejected (5-char hex invalid)', async () => {
      const res = await agent().post('/api/areas').send({ name: 'Five Char', color: '#FFFFF' });
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Server-side string handling
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Server-side string handling', () => {
    it('Task title with <script> stored verbatim (no transformation)', async () => {
      const areaRes = await agent().post('/api/areas').send({ name: 'A1' });
      const goalRes = await agent().post(`/api/areas/${areaRes.body.id}/goals`).send({ title: 'G1' });
      const title = '<script>alert("xss")</script>';
      const res = await agent().post(`/api/goals/${goalRes.body.id}/tasks`).send({ title });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, title);
    });

    it('Task note with <img onerror=...> stored verbatim', async () => {
      const areaRes = await agent().post('/api/areas').send({ name: 'A2' });
      const goalRes = await agent().post(`/api/areas/${areaRes.body.id}/goals`).send({ title: 'G2' });
      const note = '<img onerror="alert(1)" src="x">';
      const res = await agent().post(`/api/goals/${goalRes.body.id}/tasks`).send({ title: 'test', note });
      assert.equal(res.status, 201);
      // Verify via GET too
      const getRes = await agent().get(`/api/tasks/${res.body.id}`);
      assert.equal(getRes.body.note, note);
    });

    it('API returns JSON Content-Type (not text/html)', async () => {
      const res = await agent().get('/api/areas');
      assert.ok(res.headers['content-type'].includes('application/json'));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Frontend static analysis
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Frontend static analysis', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const shareHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'share.html'), 'utf8');
    const shareJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'share.js'), 'utf8');

    it('app.js: esc() handles null/undefined - uses textContent setter', () => {
      // esc() uses document.createElement + textContent which handles null/undefined safely
      assert.ok(appJs.includes('function esc('), 'esc function should exist');
      assert.ok(appJs.includes('textContent'), 'esc should use textContent for safe escaping');
    });

    it('app.js: esc() escapes via textContent (handles &, <, >, ", \')', () => {
      // textContent-based escaping is the gold standard - it escapes all HTML entities
      assert.ok(appJs.includes('.textContent='), 'esc should assign to textContent');
      assert.ok(appJs.includes('.innerHTML'), 'esc should read from innerHTML');
    });

    it('app.js: escA() escapes attribute-context characters', () => {
      assert.ok(appJs.includes('function escA('), 'escA function should exist');
      assert.ok(appJs.includes('&amp;'), 'escA should escape &');
      assert.ok(appJs.includes('&quot;'), 'escA should escape "');
      assert.ok(appJs.includes('&#39;'), "escA should escape '");
      assert.ok(appJs.includes('&lt;'), 'escA should escape <');
      assert.ok(appJs.includes('&gt;'), 'escA should escape >');
    });

    it('app.js: renderMd() escapes input before processing', () => {
      // renderMd should call esc() first before doing markdown transforms
      const renderMdMatch = appJs.match(/function renderMd\(text\)\{[\s\S]*?(?=\nfunction |\n\/\/)/);
      assert.ok(renderMdMatch, 'renderMd function should exist');
      const body = renderMdMatch[0];
      assert.ok(body.includes('esc('), 'renderMd should call esc() to escape input');
    });

    it('app.js: renderMd() rejects javascript: URIs in links', () => {
      const renderMdMatch = appJs.match(/function renderMd\(text\)\{[\s\S]*?(?=\nfunction |\n\/\/)/);
      assert.ok(renderMdMatch, 'renderMd function should exist');
      const body = renderMdMatch[0];
      // Should only allow http: and https: protocols
      assert.ok(body.includes('http') && body.includes('https'), 'renderMd should validate URL protocols');
      // Check protocol validation exists
      assert.ok(body.includes('protocol') || body.includes("https?:"), 'renderMd should check protocol');
    });

    it('share.html: user content appears in escaped context', () => {
      const shareCode = shareHtml + shareJs;
      const escCount = (shareCode.match(/esc\(/g) || []).length;
      // share.html/share.js should use esc() for all user-provided data
      assert.ok(escCount >= 5, `Expected at least 5 esc() calls in share code, found ${escCount}`);
      // Verify esc function exists in share.js
      assert.ok(shareJs.includes('function esc') || shareJs.includes('const esc'), 'share.js should define esc');
    });

    it('app.js: color values validated with hex regex before style injection', () => {
      // Check that the codebase validates colors before injecting into style attributes
      assert.ok(
        appJs.includes('isValidHexColor') || appJs.includes('/^#[0-9'),
        'Frontend should have hex color validation function'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CSP headers
  // ═══════════════════════════════════════════════════════════════════════════
  describe('CSP headers', () => {
    it('Response includes Content-Security-Policy header', async () => {
      const res = await agent().get('/api/areas');
      assert.ok(res.headers['content-security-policy'], 'CSP header should be present');
    });

    it('CSP default-src includes self', async () => {
      const res = await agent().get('/api/areas');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes("default-src 'self'"), `CSP default-src should be 'self', got: ${csp}`);
    });

    it('CSP object-src is none', async () => {
      const res = await agent().get('/api/areas');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes("object-src 'none'"), `CSP object-src should be 'none', got: ${csp}`);
    });

    it('CSP frame-ancestors is none', async () => {
      const res = await agent().get('/api/areas');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes("frame-ancestors 'none'"), `CSP frame-ancestors should be 'none', got: ${csp}`);
    });

    it('CSP img-src includes data: and blob:', async () => {
      const res = await agent().get('/api/areas');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes('data:'), 'CSP img-src should include data:');
      assert.ok(csp.includes('blob:'), 'CSP img-src should include blob:');
    });
  });
});
