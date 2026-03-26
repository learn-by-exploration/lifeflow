const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown } = require('./helpers');
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, '..', 'public', 'styles.css');
const JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js');

let css, js, html, sw;

before(() => {
  setup();
  css = fs.readFileSync(CSS_PATH, 'utf8');
  js = fs.readFileSync(JS_PATH, 'utf8');
  html = fs.readFileSync(HTML_PATH, 'utf8');
  sw = fs.readFileSync(SW_PATH, 'utf8');
});
beforeEach(() => cleanDb());
after(() => teardown());

// ═══════════════════════════════════════════════════════════
// #1 — Touch drag-and-drop polyfill
// ═══════════════════════════════════════════════════════════
describe('#1: Touch drag-and-drop', () => {
  it('app.js defines touchDnD object', () => {
    assert.ok(js.includes('const touchDnD='), 'Should have touchDnD polyfill object');
  });

  it('touchDnD has attach method', () => {
    assert.ok(js.includes('attach(containerSel,itemSel,onDropFn)'), 'Should have attach method');
  });

  it('touchDnD handles touchstart, touchmove, touchend', () => {
    assert.ok(js.includes("'touchstart'"), 'Should listen for touchstart');
    assert.ok(js.includes("'touchmove'"), 'Should listen for touchmove');
    assert.ok(js.includes("'touchend'"), 'Should listen for touchend');
  });

  it('touchDnD uses long-press to start drag (not instant)', () => {
    assert.ok(js.includes('setTimeout('), 'Should use timeout for long-press detection');
    // Check for reasonable long-press duration (150-500ms)
    assert.ok(js.includes('},200)') || js.includes('},300)'), 'Long press should be ~200-300ms');
  });

  it('touchDnD creates ghost element for visual feedback', () => {
    assert.ok(js.includes('cloneNode(true)'), 'Should clone dragged element as ghost');
    assert.ok(js.includes("'position:fixed"), 'Ghost should be position:fixed');
  });

  it('touchDnD provides haptic feedback', () => {
    assert.ok(js.includes('navigator.vibrate'), 'Should use vibration API for haptic feedback');
  });

  it('touchDnD prevents scroll during drag', () => {
    assert.ok(js.includes('e.preventDefault()'), 'Should prevent default during touchmove');
  });

  it('attachTouchDragReorder function exists', () => {
    assert.ok(js.includes('function attachTouchDragReorder()'), 'Should have touch reorder function');
  });

  it('attachTouchWeeklyDnD function exists', () => {
    assert.ok(js.includes('function attachTouchWeeklyDnD()'), 'Should have touch weekly DnD function');
  });

  it('touch DnD is attached in attachDragReorder', () => {
    // After HTML5 drag setup, touch should also be set up
    const dragReorderIdx = js.indexOf('function attachDragReorder()');
    const touchCallIdx = js.indexOf('attachTouchDragReorder()', dragReorderIdx);
    assert.ok(touchCallIdx > dragReorderIdx, 'attachDragReorder should call attachTouchDragReorder');
  });

  it('touch DnD is attached in weekly planner', () => {
    assert.ok(js.includes('attachTouchWeeklyDnD()'), 'Weekly planner should call attachTouchWeeklyDnD');
  });

  it('touch DnD handles board view columns', () => {
    assert.ok(js.includes("'.bcb'"), 'Touch DnD should support board column drops');
  });

  it('touch DnD handles weekly day columns', () => {
    assert.ok(js.includes("'.wp-day,.wp-un'"), 'Touch DnD should support weekly day drops');
  });

  it('touch DnD handles timeline hour slots', () => {
    assert.ok(js.includes("'.planner-hour-tasks'"), 'Touch DnD should support timeline hour drops');
  });

  it('CSS has dragging styles for touch ghost', () => {
    assert.ok(css.includes('.tc.dragging'), 'Should have .tc.dragging style');
    assert.ok(css.includes('.wp-tc.dragging'), 'Should have .wp-tc.dragging style');
  });

  it('touch check: only activates on touch devices', () => {
    assert.ok(js.includes("'ontouchstart' in window"), 'Should feature-detect touch support');
  });
});

// ═══════════════════════════════════════════════════════════
// #2 — iOS virtual keyboard + fixed positioning
// ═══════════════════════════════════════════════════════════
describe('#2: iOS keyboard layout fix', () => {
  it('app.js uses visualViewport to detect keyboard', () => {
    assert.ok(js.includes('visualViewport'), 'Should use visualViewport API');
  });

  it('app.js toggles keyboard-open class on body', () => {
    assert.ok(js.includes('keyboard-open'), 'Should toggle keyboard-open class');
  });

  it('CSS has keyboard-open rules for FAB', () => {
    assert.ok(css.includes('body.keyboard-open .fab'), 'Should move FAB when keyboard open');
  });

  it('CSS has keyboard-open rules for bottom bar', () => {
    assert.ok(css.includes('body.keyboard-open .mobile-bottom-bar'), 'Should hide bottom bar when keyboard open');
  });

  it('CSS uses -webkit-touch-callout for iOS detection', () => {
    assert.ok(css.includes('-webkit-touch-callout'), 'Should use iOS-specific @supports');
  });

  it('detects iOS devices via user agent or touch', () => {
    assert.ok(js.includes('iPad|iPhone|iPod'), 'Should detect iOS devices');
  });
});

// ═══════════════════════════════════════════════════════════
// #3 — Service Worker error handling
// ═══════════════════════════════════════════════════════════
describe('#3: Service Worker error handling', () => {
  it('initServiceWorker warns when SW not supported', () => {
    assert.ok(js.includes("console.warn('Service Worker not supported"), 'Should log warning when SW unavailable');
  });

  it('initServiceWorker shows toast on registration failure', () => {
    assert.ok(js.includes("showToast('⚠️ Offline mode unavailable"), 'Should show toast on SW failure');
  });

  it('initServiceWorker monitors installing SW state', () => {
    assert.ok(js.includes("reg.installing"), 'Should check for installing SW');
    assert.ok(js.includes("'statechange'"), 'Should listen for SW state changes');
    assert.ok(js.includes("'redundant'"), 'Should detect redundant (failed) SW');
  });

  it('initServiceWorker handles sw-update-available message', () => {
    assert.ok(js.includes("'sw-update-available'"), 'Should handle update-available message');
    assert.ok(js.includes("App update available"), 'Should show update toast');
  });

  it('SW sends update-available message on install', () => {
    assert.ok(sw.includes("'sw-update-available'"), 'SW should post update-available message');
  });
});

// ═══════════════════════════════════════════════════════════
// #4 — 375px overflow (iPhone SE/6/7/8)
// ═══════════════════════════════════════════════════════════
describe('#4: 375px overflow breakpoint', () => {
  it('CSS has max-width:375px media query', () => {
    assert.ok(css.includes('@media(max-width:375px)'), 'Should have 375px breakpoint');
  });

  it('modals are full-width at 375px', () => {
    const idx375 = css.indexOf('@media(max-width:375px)');
    const block = css.slice(idx375, css.indexOf('}', css.indexOf('}', idx375) + 100) + 1);
    assert.ok(block.includes('.md{'), 'Modal should have rules at 375px');
    assert.ok(block.includes('width:100%'), 'Modal should be full width');
  });

  it('search box is full-width at 375px', () => {
    const idx375 = css.indexOf('@media(max-width:375px)');
    const block = css.slice(idx375, idx375 + 2000);
    assert.ok(block.includes('.sr-box'), 'Search box should have rules at 375px');
  });

  it('detail panel is 100vw at 375px', () => {
    const idx375 = css.indexOf('@media(max-width:375px)');
    const block = css.slice(idx375, idx375 + 2000);
    assert.ok(block.includes('.dp{width:100vw'), 'Detail panel should be 100vw at 375px');
  });

  it('quick-add stacks vertically at 375px', () => {
    const idx375 = css.indexOf('@media(max-width:375px)');
    const block = css.slice(idx375, idx375 + 2000);
    assert.ok(block.includes('.qa{flex-direction:column'), 'Quick add should stack at 375px');
  });
});

// ═══════════════════════════════════════════════════════════
// #5 — FAB z-index and positioning
// ═══════════════════════════════════════════════════════════
describe('#5: FAB overlap fix', () => {
  it('FAB z-index is higher than 30 on mobile', () => {
    // Should have z-index:45 on mobile
    assert.ok(css.includes('.fab{z-index:45'), 'FAB should have z-index:45 on mobile media query');
  });

  it('bottom bar z-index is 50', () => {
    assert.ok(css.includes('.mobile-bottom-bar{z-index:50'), 'Bottom bar should have z-index:50');
  });

  it('FAB is above bottom nav on mobile (bottom:76px)', () => {
    assert.ok(css.includes('.fab{z-index:45;bottom:76px') || css.includes('.fab{bottom:70px'), 'FAB should be positioned above bottom nav');
  });
});

// ═══════════════════════════════════════════════════════════
// #6 — Calendar grid at 320px
// ═══════════════════════════════════════════════════════════
describe('#6: Calendar grid 320px', () => {
  it('CSS has max-width:380px breakpoint for calendar', () => {
    assert.ok(css.includes('@media(max-width:380px)'), 'Should have 380px breakpoint');
  });

  it('CSS has max-width:320px breakpoint for tiny screens', () => {
    assert.ok(css.includes('@media(max-width:320px)'), 'Should have 320px breakpoint');
  });

  it('calendar cells have reduced min-height at 380px', () => {
    const idx380 = css.indexOf('@media(max-width:380px)');
    const block = css.slice(idx380, idx380 + 1000);
    assert.ok(block.includes('.cc{'), 'Calendar cell should have rules at 380px');
    assert.ok(block.includes('min-height:48px') || block.includes('min-height:40px'), 'Cells should be smaller');
  });

  it('calendar day numbers shrink at 320px', () => {
    const idx320 = css.indexOf('@media(max-width:320px)');
    const block = css.slice(idx320, idx320 + 1000);
    assert.ok(block.includes('.cc .cd{'), 'Day number should have rules at 320px');
  });

  it('calendar task dots hidden at 320px', () => {
    const idx320 = css.indexOf('@media(max-width:320px)');
    const block = css.slice(idx320, idx320 + 1000);
    assert.ok(block.includes('.ctd{display:none'), 'Task dots should be hidden at 320px');
  });
});

// ═══════════════════════════════════════════════════════════
// #7 — Detail panel width on tablet
// ═══════════════════════════════════════════════════════════
describe('#7: Detail panel tablet sizing', () => {
  it('CSS has tablet breakpoint for detail panel', () => {
    assert.ok(css.includes('@media(min-width:769px) and (max-width:1200px)'), 'Should have tablet breakpoint');
  });

  it('detail panel uses min() for tablet width', () => {
    const idxTablet = css.indexOf('@media(min-width:769px) and (max-width:1200px)');
    const block = css.slice(idxTablet, idxTablet + 500);
    assert.ok(block.includes('.dp{width:min(380px'), 'Detail panel should use min() on tablet');
  });

  it('detail panel is 460px on desktop', () => {
    const idxDesktop = css.indexOf('@media(min-width:1201px)');
    if (idxDesktop > -1) {
      const block = css.slice(idxDesktop, idxDesktop + 200);
      assert.ok(block.includes('.dp{width:460px'), 'Detail panel should be 460px on desktop');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// #8 — Input font size iOS auto-zoom prevention
// ═══════════════════════════════════════════════════════════
describe('#8: Input font 16px on iOS', () => {
  it('CSS has @supports(-webkit-touch-callout:none) for inputs', () => {
    assert.ok(css.includes('@supports(-webkit-touch-callout:none)'), 'Should have iOS @supports block');
  });

  it('forces 16px font-size on inputs for iOS', () => {
    const firstIdx = css.indexOf('@supports(-webkit-touch-callout:none)');
    const idxSupports = css.indexOf('@supports(-webkit-touch-callout:none)', firstIdx + 1);
    const block = css.slice(idxSupports, idxSupports + 1500);
    assert.ok(block.includes('font-size:16px !important'), 'Should force 16px on iOS inputs');
  });

  it('covers all major input selectors', () => {
    const firstIdx = css.indexOf('@supports(-webkit-touch-callout:none)');
    const idxSupports = css.indexOf('@supports(-webkit-touch-callout:none)', firstIdx + 1);
    const block = css.slice(idxSupports, idxSupports + 1500);
    assert.ok(block.includes('input,textarea,select'), 'Should cover base input, textarea, select');
  });
});

// ═══════════════════════════════════════════════════════════
// #9 — Touch targets minimum 44px
// ═══════════════════════════════════════════════════════════
describe('#9: Touch targets 44px minimum', () => {
  it('CSS has pointer:coarse media query', () => {
    assert.ok(css.includes('@media(pointer:coarse)'), 'Should have coarse pointer media query');
  });

  it('task checkboxes (.tk) are enlarged on touch', () => {
    const idxCoarse = css.indexOf('@media(pointer:coarse)');
    const block = css.slice(idxCoarse, idxCoarse + 2000);
    assert.ok(block.includes('.tk{'), 'Task checkbox should have touch rules');
    // Check that the size is at least 36px
    assert.ok(block.includes('36px') || block.includes('44px'), 'Task checkbox should be at least 36px');
  });

  it('subtask checkboxes (.stk) are enlarged on touch', () => {
    const idxCoarse = css.indexOf('@media(pointer:coarse)');
    const block = css.slice(idxCoarse, idxCoarse + 2000);
    assert.ok(block.includes('.stk{'), 'Subtask checkbox should have touch rules');
  });

  it('nav items (.ni) have min-height 44px on touch', () => {
    const idxCoarse = css.indexOf('@media(pointer:coarse)');
    const block = css.slice(idxCoarse, idxCoarse + 2000);
    assert.ok(block.includes('.ni{'), 'Nav items should have touch rules');
    assert.ok(block.includes('min-height:44px'), 'Nav items should be min 44px');
  });

  it('context menu items have min-height on touch', () => {
    const idxCoarse = css.indexOf('@media(pointer:coarse)');
    const block = css.slice(idxCoarse, idxCoarse + 2000);
    assert.ok(block.includes('.ctx-item{'), 'Context items should have touch rules');
  });

  it('bell button has minimum 44px on touch', () => {
    const idxCoarse = css.indexOf('@media(pointer:coarse)');
    const block = css.slice(idxCoarse, idxCoarse + 2000);
    assert.ok(block.includes('.bell-btn{'), 'Bell button should have touch rules');
  });

  it('base .tk has increased default size', () => {
    // Outside of media query, tk should now be at least 28px
    assert.ok(css.includes('.tk{width:28px;height:28px'), 'Default .tk should be 28px');
  });
});

// ═══════════════════════════════════════════════════════════
// #11 — Detail panel scroll smoothness (iOS)
// ═══════════════════════════════════════════════════════════
describe('#11: Detail panel scroll iOS', () => {
  it('dp-body has -webkit-overflow-scrolling:touch', () => {
    assert.ok(css.includes('.dp-body{-webkit-overflow-scrolling:touch'), 'Detail panel body should have smooth scroll');
  });

  it('dp-body has overscroll-behavior:contain', () => {
    assert.ok(css.includes('overscroll-behavior:contain'), 'Should prevent scroll chaining');
  });

  it('sr-results has -webkit-overflow-scrolling:touch', () => {
    assert.ok(css.includes('.sr-results{-webkit-overflow-scrolling:touch'), 'Search results should have smooth scroll');
  });
});

// ═══════════════════════════════════════════════════════════
// #12 — Z-index scale
// ═══════════════════════════════════════════════════════════
describe('#12: Z-index consistency', () => {
  it('CSS has z-index scale documentation comment', () => {
    assert.ok(css.includes('Z-index scale:'), 'Should document z-index scale');
  });

  it('triage-modal z-index is 100 (not 999)', () => {
    // Check the fixed z-index value
    assert.ok(css.includes('.triage-modal{z-index:100}'), 'Triage modal should be z-index:100');
  });

  it('context menu is highest at 9999', () => {
    assert.ok(css.includes('.ctx-menu{z-index:9999}'), 'Context menu should be z-index:9999');
  });

  it('tour overlay is z-index 400', () => {
    assert.ok(css.includes('.tour-ov{z-index:400}'), 'Tour overlay should be z-index:400');
  });

  it('toast is z-index 400', () => {
    assert.ok(css.includes('.toast-wrap{z-index:400}'), 'Toast should be z-index:400');
  });

  it('modals are z-index 100', () => {
    assert.ok(css.includes('.mo{z-index:100}'), 'Modals should be z-index:100');
  });

  it('search overlay is z-index 200', () => {
    assert.ok(css.includes('.sr-ov{z-index:200}'), 'Search overlay should be z-index:200');
  });

  it('focus timer is z-index 300', () => {
    assert.ok(css.includes('.ft-ov{z-index:300}'), 'Focus timer should be z-index:300');
  });

  it('confetti is z-index 500', () => {
    assert.ok(css.includes('.confetti-wrap{z-index:500}'), 'Confetti should be z-index:500');
  });
});

// ═══════════════════════════════════════════════════════════
// #13 — Search overlay with keyboard
// ═══════════════════════════════════════════════════════════
describe('#13: Search overlay keyboard', () => {
  it('search overlay uses dvh on mobile', () => {
    assert.ok(css.includes('100dvh'), 'Should use dynamic viewport height');
  });

  it('search overlay flexes to fill viewport on mobile', () => {
    assert.ok(css.includes('.sr-ov .sr-box{'), 'Search box should have mobile override');
  });

  it('search results flex:1 on mobile for keyboard', () => {
    // Within the mobile media query block
    assert.ok(css.includes('.sr-results{flex:1'), 'Results should flex to fill available space');
  });
});

// ═══════════════════════════════════════════════════════════
// #14 — Focus indicators
// ═══════════════════════════════════════════════════════════
describe('#14: Focus indicators', () => {
  it('FAB has focus-visible style', () => {
    assert.ok(css.includes('.fab:focus-visible'), 'FAB should have :focus-visible');
  });

  it('nav items have focus-visible style', () => {
    assert.ok(css.includes('.ni:focus-visible'), 'Nav items should have :focus-visible');
  });

  it('mobile tabs have focus-visible', () => {
    assert.ok(css.includes('.mb-tab:focus-visible'), 'Mobile tabs should have :focus-visible');
  });

  it('task cards have focus-visible', () => {
    assert.ok(css.includes('.tc:focus-visible'), 'Task cards should have :focus-visible');
  });

  it('task checkboxes have focus-visible', () => {
    assert.ok(css.includes('.tk:focus-visible'), 'Checkboxes should have :focus-visible');
  });

  it('subtask checkboxes have focus-visible', () => {
    assert.ok(css.includes('.stk:focus-visible'), 'Subtask checkboxes should have :focus-visible');
  });

  it('goal cards have focus-visible', () => {
    assert.ok(css.includes('.gc:focus-visible'), 'Goal cards should have :focus-visible');
  });

  it('habit checks have focus-visible', () => {
    assert.ok(css.includes('.habit-check:focus-visible'), 'Habit checks should have :focus-visible');
  });

  it('settings toggle has focus-visible', () => {
    assert.ok(css.includes('.set-toggle input:focus-visible'), 'Settings toggle should have :focus-visible');
  });
});

// ═══════════════════════════════════════════════════════════
// #15 — Print styles
// ═══════════════════════════════════════════════════════════
describe('#15: Print styles', () => {
  it('CSS has @media print block', () => {
    assert.ok(css.includes('@media print'), 'Should have print media query');
  });

  it('print hides navigation elements', () => {
    const idxPrint = css.indexOf('@media print');
    const block = css.slice(idxPrint, idxPrint + 2000);
    assert.ok(block.includes('.sb'), 'Print should hide sidebar');
    assert.ok(block.includes('.fab'), 'Print should hide FAB');
    assert.ok(block.includes('.mobile-bottom-bar'), 'Print should hide bottom bar');
  });

  it('print sets readable colors', () => {
    const idxPrint = css.indexOf('@media print');
    const block = css.slice(idxPrint, idxPrint + 2000);
    assert.ok(block.includes('color:#000'), 'Print should use black text');
    assert.ok(block.includes('background:white'), 'Print should use white background');
  });

  it('print hides overlays', () => {
    const idxPrint = css.indexOf('@media print');
    const block = css.slice(idxPrint, idxPrint + 2000);
    assert.ok(block.includes('.mo'), 'Print should hide modals');
    assert.ok(block.includes('.sr-ov'), 'Print should hide search');
    assert.ok(block.includes('.ft-ov'), 'Print should hide focus timer');
  });

  it('print prevents page breaks inside tasks', () => {
    const idxPrint = css.indexOf('@media print');
    const block = css.slice(idxPrint, idxPrint + 2000);
    assert.ok(block.includes('break-inside:avoid'), 'Tasks should avoid break-inside');
  });

  it('print has @page margin', () => {
    const idxPrint = css.indexOf('@media print');
    const block = css.slice(idxPrint, idxPrint + 2000);
    assert.ok(block.includes('@page{margin:'), 'Should have page margins');
  });
});

// ═══════════════════════════════════════════════════════════
// #16 — prefers-color-scheme
// ═══════════════════════════════════════════════════════════
describe('#16: prefers-color-scheme', () => {
  it('CSS has prefers-color-scheme:light media query', () => {
    assert.ok(css.includes('prefers-color-scheme:light'), 'Should have light scheme query');
  });

  it('overrides midnight theme with light vars', () => {
    const idxScheme = css.indexOf('prefers-color-scheme:light');
    const block = css.slice(idxScheme, idxScheme + 1000);
    assert.ok(block.includes('data-theme="midnight"'), 'Should override midnight theme');
    assert.ok(block.includes('--bg:#F8FAFC'), 'Should set light background');
  });

  it('overrides charcoal theme with light vars', () => {
    const idxScheme = css.indexOf('prefers-color-scheme:light');
    const block = css.slice(idxScheme, idxScheme + 1000);
    assert.ok(block.includes('data-theme="charcoal"'), 'Should override charcoal theme');
  });

  it('uses data-theme-auto attribute for auto-detection', () => {
    assert.ok(css.includes('data-theme-auto'), 'Should use data-theme-auto attribute');
  });

  it('app.js sets data-theme-auto when no explicit theme', () => {
    assert.ok(js.includes("setAttribute('data-theme-auto'"), 'Should set data-theme-auto');
    assert.ok(js.includes("'lf-theme-explicit'"), 'Should check for explicit theme choice');
  });

  it('app.js removes data-theme-auto on explicit theme choice', () => {
    assert.ok(js.includes("removeAttribute('data-theme-auto')"), 'Should remove auto on explicit set');
    assert.ok(js.includes("localStorage.setItem('lf-theme-explicit','true')"), 'Should store explicit flag');
  });
});

// ═══════════════════════════════════════════════════════════
// Low: Weekly planner responsive
// ═══════════════════════════════════════════════════════════
describe('Low: Weekly planner responsive', () => {
  it('CSS has 920px breakpoint for weekly planner', () => {
    assert.ok(css.includes('@media(max-width:920px)'), 'Should have 920px breakpoint');
  });

  it('weekly planner switches to 4-column grid at 920px', () => {
    const idx920 = css.indexOf('@media(max-width:920px)');
    const block = css.slice(idx920, idx920 + 500);
    assert.ok(block.includes('.wp{'), 'Weekly planner should have rules at 920px');
    assert.ok(block.includes('1fr 1fr 1fr 1fr') || block.includes('grid-template-columns'), 'Should switch to 4 columns');
  });

  it('weekly planner switches to 2-column at 600px', () => {
    const idx600 = css.indexOf('@media(max-width:600px)');
    if (idx600 > -1) {
      const block = css.slice(idx600, idx600 + 500);
      assert.ok(block.includes('.wp{'), 'Weekly planner should have rules at 600px');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Low: Confetti prefers-reduced-motion
// ═══════════════════════════════════════════════════════════
describe('Low: Confetti reduced motion', () => {
  it('confetti respects prefers-reduced-motion', () => {
    assert.ok(css.includes('.confetti-piece{animation:none'), 'Confetti should disable animation for reduced motion');
  });

  it('confetti pieces hidden with reduced motion', () => {
    // Within the prefers-reduced-motion block
    assert.ok(css.includes('.confetti-piece{animation:none !important;display:none'), 'Confetti should be hidden with reduced motion');
  });
});

// ═══════════════════════════════════════════════════════════
// Low: Loading states
// ═══════════════════════════════════════════════════════════
describe('Low: Loading states', () => {
  it('CSS has loading-spinner class', () => {
    assert.ok(css.includes('.loading-spinner'), 'Should have loading spinner class');
  });

  it('CSS has .ct.loading pseudo-element spinner', () => {
    assert.ok(css.includes('.ct.loading::after'), 'Content area should show spinner when loading');
  });

  it('CSS has spin keyframe animation', () => {
    assert.ok(css.includes('@keyframes spin'), 'Should have spin animation');
  });

  it('app.js adds loading class before render', () => {
    assert.ok(js.includes("ct.classList.add('loading')"), 'Should add loading class');
  });

  it('app.js removes loading class after render', () => {
    assert.ok(js.includes("ct.classList.remove('loading')"), 'Should remove loading class');
  });
});

// ═══════════════════════════════════════════════════════════
// Accessibility: ARIA on task cards
// ═══════════════════════════════════════════════════════════
describe('Accessibility: Task card ARIA', () => {
  it('task cards have tabindex for keyboard navigation', () => {
    assert.ok(js.includes('tabindex="0"'), 'Task cards should have tabindex="0"');
  });

  it('task checkboxes have role="checkbox"', () => {
    assert.ok(js.includes('role="checkbox"'), 'Checkboxes should have role="checkbox"');
  });

  it('task checkboxes have aria-checked', () => {
    assert.ok(js.includes('aria-checked='), 'Checkboxes should have aria-checked');
  });

  it('task checkboxes have aria-label', () => {
    assert.ok(js.includes('aria-label="Complete task"'), 'Checkboxes should have aria-label');
  });
});

// ═══════════════════════════════════════════════════════════
// Integration: No JS syntax errors after changes
// ═══════════════════════════════════════════════════════════
describe('Integration: JavaScript validity', () => {
  it('app.js has no syntax errors', () => {
    assert.doesNotThrow(() => new Function(js), 'app.js should parse without errors');
  });

  it('sw.js has no syntax errors', () => {
    assert.doesNotThrow(() => new Function(sw), 'sw.js should parse without errors');
  });
});
