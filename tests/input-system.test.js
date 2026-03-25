const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const STYLES_PATH = path.join(__dirname, '..', 'public', 'styles.css');
const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const css = fs.readFileSync(STYLES_PATH, 'utf8');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Helper: check a CSS selector contains all expected properties
function assertCSSProps(selector, props, description) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[;\\n}])\\s*' + escaped + '\\s*\\{([^}]+)\\}', 'g');
  const blocks = [];
  let m;
  while ((m = re.exec(css)) !== null) blocks.push(m[1]);
  assert.ok(blocks.length > 0, `${description}: selector "${selector}" not found in CSS`);
  const match = blocks.find(block => props.every(p => block.includes(p)));
  assert.ok(
    match,
    `${description}: no "${selector}" rule contains all of [${props.join(', ')}] — found blocks: ${blocks.map(b => b.trim()).join(' | ')}`
  );
}

// ─── SPRINT 1: CSS Design System ───

describe('Input Design System — base classes', () => {

  describe('.inp (base input class)', () => {
    it('has border', () => assertCSSProps('.inp', ['border:1px solid var(--brd)'], 'base input'));
    it('has padding', () => assertCSSProps('.inp', ['padding:9px 11px'], 'base input'));
    it('has border-radius', () => assertCSSProps('.inp', ['border-radius:var(--rs)'], 'base input'));
    it('has background', () => assertCSSProps('.inp', ['background:var(--bg-c)'], 'base input'));
    it('has font-size', () => assertCSSProps('.inp', ['font-size:13px'], 'base input'));
    it('has outline:none', () => assertCSSProps('.inp', ['outline:none'], 'base input'));
    it('has transition', () => assertCSSProps('.inp', ['transition:border-color'], 'base input'));
  });

  describe('.inp:focus', () => {
    it('has brand border on focus', () => assertCSSProps('.inp:focus', ['border-color:var(--brand)'], 'input focus'));
    it('has box-shadow focus ring', () => assertCSSProps('.inp:focus', ['box-shadow:0 0 0 3px'], 'input focus'));
  });

  describe('.inp::placeholder', () => {
    it('has subdued color', () => assertCSSProps('.inp::placeholder', ['color:var(--txd)'], 'input placeholder'));
  });

  describe('.inp-sm (small input)', () => {
    it('has smaller padding', () => assertCSSProps('.inp-sm', ['padding:6px 10px'], 'small input'));
    it('has smaller font', () => assertCSSProps('.inp-sm', ['font-size:12px'], 'small input'));
  });

  describe('.inp-lg (large input)', () => {
    it('has larger padding', () => assertCSSProps('.inp-lg', ['padding:14px 16px'], 'large input'));
    it('has larger font', () => assertCSSProps('.inp-lg', ['font-size:15px'], 'large input'));
  });

  describe('.sel (base select class)', () => {
    it('has border', () => assertCSSProps('.sel', ['border:1px solid var(--brd)'], 'base select'));
    it('has padding', () => assertCSSProps('.sel', ['padding:9px 11px'], 'base select'));
    it('has cursor pointer', () => assertCSSProps('.sel', ['cursor:pointer'], 'base select'));
    it('has transition', () => assertCSSProps('.sel', ['transition:border-color'], 'base select'));
  });

  describe('.sel:focus', () => {
    it('has brand border', () => assertCSSProps('.sel:focus', ['border-color:var(--brand)'], 'select focus'));
    it('has box-shadow', () => assertCSSProps('.sel:focus', ['box-shadow:0 0 0 3px'], 'select focus'));
  });

  describe('.ta-inp (base textarea class)', () => {
    it('has border', () => assertCSSProps('.ta-inp', ['border:1px solid var(--brd)'], 'base textarea'));
    it('has min-height', () => assertCSSProps('.ta-inp', ['min-height:50px'], 'base textarea'));
    it('has resize:vertical', () => assertCSSProps('.ta-inp', ['resize:vertical'], 'base textarea'));
    it('has transition', () => assertCSSProps('.ta-inp', ['transition:border-color'], 'base textarea'));
  });

  describe('.ta-inp:focus', () => {
    it('has focus ring', () => assertCSSProps('.ta-inp:focus', ['box-shadow:0 0 0 3px'], 'textarea focus'));
  });
});

describe('Input Design System — error states', () => {
  it('.inp-err has red border', () => {
    assert.ok(css.includes('.inp-err'), '.inp-err class must exist');
    assert.ok(css.includes('border-color:var(--err)'), 'error state must use --err color');
  });

  it('.field-err message element exists', () => {
    assertCSSProps('.field-err', ['display:none'], 'error message hidden by default');
    assertCSSProps('.field-err', ['font-size:11px'], 'error message size');
    assertCSSProps('.field-err', ['color:var(--err)'], 'error message color');
  });

  it('.field-err.visible shows the message', () => {
    assertCSSProps('.field-err.visible', ['display:flex'], 'visible error message');
  });
});

describe('Input Design System — field wrapper', () => {
  it('.field has margin-bottom', () => assertCSSProps('.field', ['margin-bottom:10px'], 'field wrapper'));
  it('.field>.lbl has correct styling', () => {
    assert.ok(css.includes('.field>.lbl'), '.field>.lbl must exist');
  });
});

describe('Focus visible — keyboard navigation', () => {
  it(':focus-visible has outline for all elements', () => {
    assertCSSProps(':focus-visible', ['outline:2px solid var(--brand)'], 'global focus-visible');
  });

  it('input:focus-visible has outline', () => {
    assert.ok(
      css.includes('input:focus-visible'),
      'input:focus-visible selector must exist in CSS'
    );
  });

  it('textarea:focus-visible has outline', () => {
    assert.ok(
      css.includes('textarea:focus-visible'),
      'textarea:focus-visible selector must exist in CSS'
    );
  });

  it('select:focus-visible has outline', () => {
    assert.ok(
      css.includes('select:focus-visible'),
      'select:focus-visible selector must exist in CSS'
    );
  });

  it('focus-visible rule includes outline styling', () => {
    // The grouped selector input:focus-visible,textarea:focus-visible,select:focus-visible
    // must be followed by a rule containing outline
    const re = /input:focus-visible[^{]*\{([^}]+)\}/;
    const m = css.match(re);
    assert.ok(m, 'input:focus-visible rule block must exist');
    assert.ok(m[1].includes('outline:2px solid var(--brand)'), 'must have brand outline');
  });

  it('button:focus-visible has outline', () => {
    assert.ok(
      css.includes('button:focus-visible'),
      'button:focus-visible selector must exist in CSS'
    );
  });
});
