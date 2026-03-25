const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, '..', 'public', 'styles.css');
const JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const css = fs.readFileSync(CSS_PATH, 'utf8');
const js = fs.readFileSync(JS_PATH, 'utf8');
const html = fs.readFileSync(HTML_PATH, 'utf8');

function assertCSSProps(selector, props, description) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[;\\n}])\\s*' + escaped + '\\s*\\{([^}]+)\\}', 'g');
  const blocks = [];
  let m;
  while ((m = re.exec(css)) !== null) blocks.push(m[1]);
  assert.ok(blocks.length > 0, `${description}: selector "${selector}" not found in CSS`);
  const match = blocks.find(block => props.every(p => block.includes(p)));
  assert.ok(match, `${description}: no "${selector}" rule contains all of [${props.join(', ')}]`);
}

describe('UI/UX Review Fixes', () => {

  // ─── BATCH 1: CSS CONSISTENCY ───

  describe('CSS consistency', () => {
    it('ctx-menu uses var(--shd) not hardcoded shadow', () => {
      assertCSSProps('.ctx-menu', ['box-shadow:var(--shd)'], 'context menu shadow');
    });

    it('triage-modal uses .6 backdrop like standard modals', () => {
      assert.ok(css.includes('.triage-modal{') && css.includes('rgba(0,0,0,.6)'), 'triage backdrop should be .6');
    });

    it('qc-ov uses .6 backdrop', () => {
      const match = css.match(/\.qc-ov\{[^}]*background:rgba\(0,0,0,\.6\)/);
      assert.ok(match, 'quick capture backdrop should be .6');
    });

    it('sr-ov uses .6 backdrop', () => {
      const match = css.match(/\.sr-ov\{[^}]*background:rgba\(0,0,0,\.6\)/);
      assert.ok(match, 'search overlay backdrop should be .6');
    });

    it('dr-box uses max-width:92vw', () => {
      assertCSSProps('.dr-box', ['max-width:92vw'], 'daily review box max-width');
    });

    it('modal open animation exists', () => {
      assert.ok(css.includes('@keyframes modalIn'), 'modalIn keyframes should exist');
      assert.ok(css.includes('.mo .md{animation:modalIn'), 'modal box should use modalIn animation');
    });
  });

  // ─── BATCH 1: MOBILE TOUCH TARGETS ───

  describe('mobile touch targets', () => {
    it('snz-opt has at least 44px height on mobile', () => {
      // Check within a @media(max-width:768px) block
      const mobileBlock = css.match(/@media\(max-width:768px\)\{[\s\S]*?\n\}/g);
      assert.ok(mobileBlock, 'mobile media query exists');
      const combined = mobileBlock.join('');
      assert.ok(combined.includes('.snz-opt'), 'snooze option has mobile override');
      assert.ok(combined.includes('min-height:44px'), 'touch target meets 44px minimum');
    });

    it('ctx-item has mobile override', () => {
      const mobileBlock = css.match(/@media\(max-width:768px\)\{[\s\S]*?\n\}/g);
      const combined = mobileBlock.join('');
      assert.ok(combined.includes('.ctx-item'), 'context menu item has mobile override');
    });

    it('dr-steps scrolls on mobile', () => {
      const mobileBlock = css.match(/@media\(max-width:768px\)\{[\s\S]*?\n\}/g);
      const combined = mobileBlock.join('');
      assert.ok(combined.includes('.dr-steps'), 'daily review steps has mobile override');
      assert.ok(combined.includes('overflow-x:auto'), 'daily review steps scrolls horizontally');
    });
  });

  // ─── BATCH 2: MODAL LIFECYCLE ───

  describe('modal lifecycle', () => {
    it('has overlay lifecycle helpers (_lockBody, _unlockBody, _pushFocus, _popFocus)', () => {
      assert.ok(js.includes('function _lockBody'), '_lockBody helper exists');
      assert.ok(js.includes('function _unlockBody'), '_unlockBody helper exists');
      assert.ok(js.includes('function _pushFocus'), '_pushFocus helper exists');
      assert.ok(js.includes('function _popFocus'), '_popFocus helper exists');
    });

    it('sets body overflow hidden when overlay opens', () => {
      assert.ok(js.includes("document.body.style.overflow='hidden'"), 'scroll lock sets overflow hidden');
    });

    it('escape handler closes triage modals', () => {
      assert.ok(js.includes("document.querySelector('.triage-modal')"), 'escape handler checks for triage modal');
    });

    it('escape handler closes area/goal/list modals', () => {
      assert.ok(
        js.includes("$('am').classList.contains('active')") &&
        js.includes("$('gm').classList.contains('active')") &&
        js.includes("$('lm').classList.contains('active')"),
        'escape handler checks area, goal, and list modals'
      );
    });

    it('focus trap fires for triage modals via mutation observer', () => {
      assert.ok(
        js.includes(".querySelectorAll('.triage-modal').forEach(tm=>{"),
        'modal observer traps focus on dynamic triage modals'
      );
    });
  });

  // ─── BATCH 3: ARIA ───

  describe('ARIA attributes', () => {
    it('dp has aria-modal="true"', () => {
      assert.ok(html.includes('id="dp" role="dialog" aria-modal="true"'), 'detail panel has aria-modal');
    });

    it('sr-ov has aria-modal="true"', () => {
      assert.ok(html.includes('id="sr-ov" role="dialog" aria-modal="true"'), 'search overlay has aria-modal');
    });

    it('triage modals get role="dialog" and aria-modal', () => {
      assert.ok(js.includes("m.setAttribute('role','dialog')"), 'triage modals set role=dialog');
      assert.ok(js.includes("m.setAttribute('aria-modal','true')"), 'triage modals set aria-modal');
    });

    it('context menus have role="menu"', () => {
      assert.ok(js.includes("menu.setAttribute('role','menu')"), 'context menus have role=menu');
    });

    it('dropdown items have role="menuitem"', () => {
      assert.ok(js.includes('role="menuitem"'), 'dropdown items have menuitem role');
    });

    it('snooze dropdown has role="menu"', () => {
      assert.ok(js.includes("dd.setAttribute('role','menu')"), 'snooze dropdown has role=menu');
    });
  });

  // ─── BATCH 4: KEYBOARD NAV ───

  describe('keyboard navigation', () => {
    it('snooze dropdown has arrow key navigation', () => {
      assert.ok(js.includes("'ArrowDown'") && js.includes("'ArrowUp'"), 'arrow keys handled');
      assert.ok(js.includes('snzItems') || js.includes('qaItems'), 'dropdown item arrays for keyboard nav');
    });

    it('date picker dropdown has keyboard navigation', () => {
      assert.ok(js.includes('qaIdx'), 'date picker has keyboard nav index');
    });

    it('bell dropdown has keyboard shortcut (b key)', () => {
      assert.ok(js.includes("e.key==='b'") && js.includes('bell-dd'), 'b key toggles bell dropdown');
    });

    it('keyboard shortcuts help includes B for notifications', () => {
      assert.ok(html.includes('Notifications') && html.includes('>B<'), 'B shortcut listed in help');
    });
  });

  // ─── BATCH 5: UX HINTS & VALIDATION ───

  describe('UX hints and form validation', () => {
    it('area modal shows inline validation', () => {
      assert.ok(js.includes("validateField('am-name'"), 'area modal uses inline validation');
    });

    it('goal modal shows inline validation', () => {
      assert.ok(js.includes("validateField('gm-title'"), 'goal modal uses inline validation');
    });

    it('list modal shows inline validation', () => {
      assert.ok(js.includes("validateField('lm-name'"), 'list modal uses inline validation');
    });

    it('quick capture has NLP syntax hint', () => {
      assert.ok(html.includes('priority') && html.includes('p1') && html.includes('#tag'), 'NLP syntax hint exists');
    });

    it('triage modal has guidance text', () => {
      assert.ok(js.includes('Move this inbox item to a goal'), 'triage modal guidance text');
    });

    it('color swatches have title and aria-label', () => {
      assert.ok(js.includes('title="${cl}" aria-label="Color ${cl}"'), 'swatches have title and aria-label');
    });
  });

  // ─── BATCH 6: CONTEXT MENU VIEWPORT CLAMPING ───

  describe('context menu viewport clamping', () => {
    it('uses Math.min for left position clamping', () => {
      assert.ok(js.includes('Math.min(rect.right,window.innerWidth'), 'left position clamped to viewport');
    });

    it('uses Math.min for top position clamping', () => {
      assert.ok(js.includes('Math.min(rect.bottom,window.innerHeight'), 'top position clamped to viewport');
    });

    it('appends menu to body before measuring dimensions', () => {
      // The pattern: appendChild(menu) then menu.offsetWidth
      const appendIdx = js.indexOf('document.body.appendChild(menu);\n    const mw=menu.offsetWidth');
      assert.ok(appendIdx > 0, 'menu appended before measuring width');
    });
  });
});
