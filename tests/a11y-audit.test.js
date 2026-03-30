const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ─── Accessibility Audit Tests ──────────────────────────────────────────────
// Uses jsdom + axe-core to audit static HTML for WCAG 2.1 violations.
// Validates HTML structure, ARIA attributes, and basic accessibility patterns.

const publicDir = path.join(__dirname, '..', 'public');

function loadHtml(filename) {
  return fs.readFileSync(path.join(publicDir, filename), 'utf8');
}

describe('Accessibility Audit (axe-core)', () => {
  let JSDOM, axe;

  before(() => {
    const jsdomMod = require('jsdom');
    JSDOM = jsdomMod.JSDOM;
    axe = require('axe-core');
  });

  async function runAxe(html) {
    const dom = new JSDOM(html, {
      url: 'http://localhost:3456',
      pretendToBeVisual: true,
      runScripts: 'dangerously'
    });

    // Inject axe-core into the JSDOM window
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = axe.source;
    dom.window.document.head.appendChild(scriptEl);

    const results = await dom.window.eval(`
      (async () => {
        return await axe.run(document, {
          rules: {
            'color-contrast': { enabled: false },
            'meta-viewport': { enabled: false }
          }
        });
      })()
    `);

    dom.window.close();
    return results;
  }

  // ─── index.html ─────────────────────────────────────────────────────────

  describe('index.html', () => {
    let html;
    before(() => { html = loadHtml('index.html'); });

    it('has lang attribute on <html>', () => {
      assert.ok(html.includes('lang="en"'), '<html> should have lang="en"');
    });

    it('has skip-to-content link', () => {
      assert.ok(html.includes('skip-link'), 'should have a skip navigation link');
    });

    it('has navigation landmark with aria-label', () => {
      assert.ok(html.includes('role="navigation"'), 'sidebar should have navigation role');
      assert.ok(html.includes('aria-label="Sidebar navigation"'), 'sidebar should have aria-label');
    });

    it('has main content landmark', () => {
      assert.ok(html.includes('role="main"'), 'should have main content role');
    });

    it('has aria-labels on icon buttons', () => {
      assert.ok(html.includes('aria-label="Open navigation menu"'), 'hamburger needs aria-label');
      assert.ok(html.includes('aria-label="Quick add task"'), 'FAB needs aria-label');
    });

    it('has no inline scripts', () => {
      const inlineScripts = html.match(/<script>[\s\S]*?<\/script>/g) || [];
      assert.equal(inlineScripts.length, 0, 'should have no inline script blocks');
    });

    it('passes axe-core audit (no critical/serious violations)', async () => {
      const results = await runAxe(html);
      const critical = results.violations.filter(v => v.impact === 'critical');
      const serious = results.violations.filter(v => v.impact === 'serious');
      if (critical.length > 0 || serious.length > 0) {
        const msgs = [...critical, ...serious].map(v =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`
        );
        assert.fail('Accessibility violations:\n' + msgs.join('\n'));
      }
    });
  });

  // ─── login.html ─────────────────────────────────────────────────────────

  describe('login.html', () => {
    let html;
    before(() => { html = loadHtml('login.html'); });

    it('has lang attribute on <html>', () => {
      assert.ok(html.includes('lang="en"'), '<html> should have lang="en"');
    });

    it('has no inline scripts (extracted to js/login.js)', () => {
      const inlineScripts = html.match(/<script>[\s\S]*?<\/script>/g) || [];
      assert.equal(inlineScripts.length, 0, 'should have no inline script blocks');
      assert.ok(html.includes('src="js/login.js"'), 'should reference external login.js');
    });

    it('has form with labeled inputs', () => {
      const inputIds = (html.match(/id="(login-email|login-password|reg-email|reg-password|reg-name)"/g) || []);
      assert.ok(inputIds.length >= 3, 'should have at least 3 form inputs');
    });

    it('passes axe-core audit (no critical/serious violations)', async () => {
      const results = await runAxe(html);
      const critical = results.violations.filter(v => v.impact === 'critical');
      const serious = results.violations.filter(v => v.impact === 'serious');
      if (critical.length > 0 || serious.length > 0) {
        const msgs = [...critical, ...serious].map(v =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`
        );
        assert.fail('Accessibility violations:\n' + msgs.join('\n'));
      }
    });
  });

  // ─── share.html ─────────────────────────────────────────────────────────

  describe('share.html', () => {
    let html;
    before(() => { html = loadHtml('share.html'); });

    it('has lang attribute on <html>', () => {
      assert.ok(html.includes('lang="en"'), '<html> should have lang="en"');
    });

    it('has no inline scripts (extracted to js/share.js)', () => {
      const inlineScripts = html.match(/<script>[\s\S]*?<\/script>/g) || [];
      assert.equal(inlineScripts.length, 0, 'should have no inline script blocks');
      assert.ok(html.includes('src="js/share.js"'), 'should reference external share.js');
    });

    it('passes axe-core audit (no critical/serious violations)', async () => {
      const results = await runAxe(html);
      const critical = results.violations.filter(v => v.impact === 'critical');
      const serious = results.violations.filter(v => v.impact === 'serious');
      if (critical.length > 0 || serious.length > 0) {
        const msgs = [...critical, ...serious].map(v =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instances)`
        );
        assert.fail('Accessibility violations:\n' + msgs.join('\n'));
      }
    });
  });

  // ─── CSS Accessibility ──────────────────────────────────────────────────

  describe('CSS accessibility patterns', () => {
    let css;
    before(() => { css = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8'); });

    it('has prefers-reduced-motion media query', () => {
      assert.ok(css.includes('prefers-reduced-motion'), 'should respect reduced motion');
    });

    it('has focus styles', () => {
      assert.ok(css.includes(':focus') || css.includes(':focus-visible'), 'should define focus styles');
    });

    it('has skip-link styles', () => {
      assert.ok(css.includes('.skip-link'), 'should style skip-to-content link');
    });

    it('has minimum touch target sizing (44px)', () => {
      assert.ok(css.includes('44px') || css.includes('2.75rem'), 'touch targets should be ≥44px');
    });
  });

  // ─── Frontend output encoding ──────────────────────────────────────────

  describe('Frontend output encoding functions', () => {
    let appJs;
    before(() => { appJs = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8'); });

    it('has esc() for HTML escaping', () => {
      assert.ok(appJs.includes('function esc('), 'should define esc()');
    });

    it('has escA() for attribute escaping', () => {
      assert.ok(appJs.includes('function escA('), 'should define escA()');
    });
  });
});
