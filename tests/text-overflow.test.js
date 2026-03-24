const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const STYLES_PATH = path.join(__dirname, '..', 'public', 'styles.css');
const css = fs.readFileSync(STYLES_PATH, 'utf8');

// Helper: check a CSS selector contains all expected properties
// Finds ALL matching rule blocks and passes if ANY block contains all props
function assertCSSProps(selector, props, description) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the selector (not preceded by another word-char or selector fragment)
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

describe('Text overflow protection', () => {

  describe('.tb2 (task card body)', () => {
    it('has min-width:0 to allow flex shrink', () => {
      assertCSSProps('.tb2', ['min-width:0'], 'task card body');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.tb2', ['overflow:hidden'], 'task card body');
    });
  });

  describe('.tt (task title)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.tt', ['overflow:hidden'], 'task title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.tt', ['text-overflow:ellipsis'], 'task title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.tt', ['white-space:nowrap'], 'task title');
    });
  });

  describe('.ni (sidebar nav item)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.ni', ['overflow:hidden'], 'sidebar nav');
    });
  });

  describe('.ai .an (area name)', () => {
    it('has min-width:0 for flex shrink', () => {
      assertCSSProps('.ai .an', ['min-width:0'], 'area name');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.ai .an', ['overflow:hidden'], 'area name');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.ai .an', ['text-overflow:ellipsis'], 'area name');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.ai .an', ['white-space:nowrap'], 'area name');
    });
  });

  describe('.gc .gt (goal card title)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.gc .gt', ['overflow:hidden'], 'goal title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.gc .gt', ['text-overflow:ellipsis'], 'goal title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.gc .gt', ['white-space:nowrap'], 'goal title');
    });
  });

  describe('.sr-ti (search result title)', () => {
    it('has min-width:0 for flex shrink', () => {
      assertCSSProps('.sr-ti', ['min-width:0'], 'search result title');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.sr-ti', ['overflow:hidden'], 'search result title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.sr-ti', ['text-overflow:ellipsis'], 'search result title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.sr-ti', ['white-space:nowrap'], 'search result title');
    });
  });

  describe('.inbox-title (inbox item title)', () => {
    it('has min-width:0 for flex shrink', () => {
      assertCSSProps('.inbox-title', ['min-width:0'], 'inbox title');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.inbox-title', ['overflow:hidden'], 'inbox title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.inbox-title', ['text-overflow:ellipsis'], 'inbox title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.inbox-title', ['white-space:nowrap'], 'inbox title');
    });
  });

  describe('.bc (breadcrumbs)', () => {
    it('has min-width:0 for flex shrink', () => {
      assertCSSProps('.bc', ['min-width:0'], 'breadcrumbs');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.bc', ['overflow:hidden'], 'breadcrumbs');
    });
  });

  describe('.bell-dd .bell-item (notification item)', () => {
    it('has overflow:hidden on the item', () => {
      assertCSSProps('.bell-dd .bell-item', ['overflow:hidden'], 'bell item');
    });
  });

  describe('.bell-dd .bell-item title span (notification title text)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.bell-dd .bell-item span:first-child+span', ['overflow:hidden'], 'bell title span');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.bell-dd .bell-item span:first-child+span', ['text-overflow:ellipsis'], 'bell title span');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.bell-dd .bell-item span:first-child+span', ['white-space:nowrap'], 'bell title span');
    });
    it('has min-width:0', () => {
      assertCSSProps('.bell-dd .bell-item span:first-child+span', ['min-width:0'], 'bell title span');
    });
  });

  describe('.rule-card .rule-name (automation rule name)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.rule-card .rule-name', ['min-width:0'], 'rule name');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.rule-card .rule-name', ['overflow:hidden'], 'rule name');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.rule-card .rule-name', ['text-overflow:ellipsis'], 'rule name');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.rule-card .rule-name', ['white-space:nowrap'], 'rule name');
    });
  });

  describe('.tb h2 (page title)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.tb h2', ['min-width:0'], 'page title');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.tb h2', ['overflow:hidden'], 'page title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.tb h2', ['text-overflow:ellipsis'], 'page title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.tb h2', ['white-space:nowrap'], 'page title');
    });
  });

  describe('.dp-head h3 (detail panel title)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.dp-head h3', ['min-width:0'], 'detail panel title');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.dp-head h3', ['overflow:hidden'], 'detail panel title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.dp-head h3', ['text-overflow:ellipsis'], 'detail panel title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.dp-head h3', ['white-space:nowrap'], 'detail panel title');
    });
  });

  describe('.sti .stx (subtask text)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.sti .stx', ['min-width:0'], 'subtask text');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.sti .stx', ['overflow:hidden'], 'subtask text');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.sti .stx', ['text-overflow:ellipsis'], 'subtask text');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.sti .stx', ['white-space:nowrap'], 'subtask text');
    });
  });

  describe('.habit-card .hc-name (habit name)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.habit-card .hc-name', ['min-width:0'], 'habit name');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.habit-card .hc-name', ['overflow:hidden'], 'habit name');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.habit-card .hc-name', ['text-overflow:ellipsis'], 'habit name');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.habit-card .hc-name', ['white-space:nowrap'], 'habit name');
    });
  });

  describe('.al-item .al-t (activity log text)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.al-item .al-t', ['min-width:0'], 'activity log text');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.al-item .al-t', ['overflow:hidden'], 'activity log text');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.al-item .al-t', ['text-overflow:ellipsis'], 'activity log text');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.al-item .al-t', ['white-space:nowrap'], 'activity log text');
    });
  });

  describe('.habit-card .hc-head (habit header row)', () => {
    it('has min-width:0', () => {
      assertCSSProps('.habit-card .hc-head', ['min-width:0'], 'habit header');
    });
    it('has overflow:hidden', () => {
      assertCSSProps('.habit-card .hc-head', ['overflow:hidden'], 'habit header');
    });
  });

  describe('.habit-card .hc-streak (habit streak badge)', () => {
    it('has white-space:nowrap', () => {
      assertCSSProps('.habit-card .hc-streak', ['white-space:nowrap'], 'habit streak');
    });
    it('has overflow:hidden and max-width to prevent card blowout', () => {
      assertCSSProps('.habit-card .hc-streak', ['overflow:hidden', 'max-width:50%'], 'habit streak');
    });
  });

  describe('.habit-check (habit check button)', () => {
    it('has flex-shrink:0', () => {
      assertCSSProps('.habit-check', ['flex-shrink:0'], 'habit check button');
    });
  });

  describe('habit name uses hc-name class (not inline style)', () => {
    it('habit card template uses class="hc-name"', () => {
      const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      assert.ok(
        appJS.includes('class=\\"hc-name\\"') || appJS.includes("class=\"hc-name\""),
        'habit name should use class="hc-name" not inline styles'
      );
    });
  });

  describe('.planner-task (planner task row)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.planner-task', ['overflow:hidden'], 'planner task');
    });
  });

  describe('.dp-comment (comment row)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.dp-comment', ['overflow:hidden'], 'comment row');
    });
  });

  describe('.review-list li (review list item)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.review-list li', ['overflow:hidden'], 'review list item');
    });
  });

  describe('.sa-row (settings area row)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.sa-row', ['overflow:hidden'], 'settings area row');
    });
  });

  describe('no unprotected flex:1 text spans in app.js', () => {
    it('every flex:1 span with esc() text has overflow protection', () => {
      const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      // Find all flex:1 inline styles that render esc() text
      const re = /style="flex:1[^"]*">\$\{esc/g;
      let match;
      const unprotected = [];
      while ((match = re.exec(appJS)) !== null) {
        const snippet = match[0];
        if (!snippet.includes('overflow:hidden') && !snippet.includes('text-overflow')) {
          const line = appJS.substring(0, match.index).split('\n').length;
          unprotected.push(`line ${line}: ${snippet}`);
        }
      }
      assert.equal(
        unprotected.length, 0,
        `Found ${unprotected.length} unprotected flex:1 text span(s):\n${unprotected.join('\n')}`
      );
    });
  });

  describe('bell item uses CSS class not inline style', () => {
    it('bell item title span has no inline flex:1;font-weight:500', () => {
      const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      assert.ok(
        !appJS.includes('style="flex:1;font-weight:500">${esc(t.title)}'),
        'bell item should use CSS class for title span, not inline style'
      );
    });
  });

  // ─── NEW: additional CSS selector tests ───

  describe('.toast .t-msg (toast message text)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.toast .t-msg', ['overflow:hidden'], 'toast message');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.toast .t-msg', ['text-overflow:ellipsis'], 'toast message');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.toast .t-msg', ['white-space:nowrap'], 'toast message');
    });
  });

  describe('.tmpl-card .tmpl-name (template name)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.tmpl-card .tmpl-name', ['overflow:hidden'], 'template name');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.tmpl-card .tmpl-name', ['text-overflow:ellipsis'], 'template name');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.tmpl-card .tmpl-name', ['white-space:nowrap'], 'template name');
    });
  });

  describe('.list-detail-head h2 (list detail title)', () => {
    it('has overflow:hidden', () => {
      assertCSSProps('.list-detail-head h2', ['overflow:hidden'], 'list detail title');
    });
    it('has text-overflow:ellipsis', () => {
      assertCSSProps('.list-detail-head h2', ['text-overflow:ellipsis'], 'list detail title');
    });
    it('has white-space:nowrap', () => {
      assertCSSProps('.list-detail-head h2', ['white-space:nowrap'], 'list detail title');
    });
  });

  // ─── REGRESSION GUARD: CSS flex:1 text audit ───

  describe('CSS flex:1 text elements must have overflow protection', () => {
    it('every CSS flex:1 rule on a text element has overflow:hidden', () => {
      // Extract all CSS rules that have flex:1
      const ruleRe = /([^{}]+)\{([^}]*flex:1[^}]*)\}/g;
      let m;
      const unprotected = [];
      // Selectors that are structural containers (not text elements) — safe to skip
      const skipPatterns = [
        /input|button|textarea|select/i,     // form elements
        /body|\.mn|\.ct|\.dp-body/i,         // layout containers
        /track|bar|\.bcol|\.dp-row/i,        // structural/non-text containers
        /\.ft-btn|\.trend-col|\.sb-bot/i,    // buttons, charts, icons
        /\.dr-stat-card|\.streak-card/i,     // card containers (have fixed width)
        /\.ds-ainfo|\.planner-hour/i,        // column containers
        /\.set-row label/i,                  // fixed labels (not user text)
        /\.dr-step/i,                        // nav steps (fixed text)
        /\.ms-bar .ms-cnt/i,                 // programmatic count text
        /\.qa input|\.sta input|\.tgi input/i, // input elements
        />\*/i,                              // wildcard children (.dp-row>*)
      ];
      while ((m = ruleRe.exec(css)) !== null) {
        const selector = m[1].trim();
        const body = m[2];
        // Skip non-text structural selectors
        if (skipPatterns.some(p => p.test(selector))) continue;
        // If it has flex:1 but no overflow protection, flag it
        if (!body.includes('overflow:hidden') && !body.includes('overflow:auto') && !body.includes('overflow-y:auto')) {
          unprotected.push(selector);
        }
      }
      assert.equal(
        unprotected.length, 0,
        `CSS flex:1 text elements without overflow protection:\n${unprotected.map(s => `  - ${s}`).join('\n')}\nAdd overflow:hidden;text-overflow:ellipsis;white-space:nowrap to each.`
      );
    });
  });

  // ─── REGRESSION GUARD: inline styled user text audit ───

  describe('no unprotected inline-styled title text in app.js', () => {
    it('inline font-weight spans rendering esc() have overflow or a class', () => {
      const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      // Only flag elements with font-weight (title/name styling) that render user text
      // These are the patterns that have caused real overflow bugs
      const re = /(?:class="([^"]*)")?\s*style="([^"]*font-weight[^"]*)">\$\{esc\(/g;
      let match;
      const unprotected = [];
      while ((match = re.exec(appJS)) !== null) {
        const cls = match[1] || '';
        const style = match[2];
        // Has a CSS class → overflow protection comes from the class, OK
        if (cls) continue;
        // Has inline overflow protection → OK
        if (style.includes('overflow:hidden') || style.includes('text-overflow')) continue;
        // Has flex:1 → the other flex:1 guard covers it
        if (style.includes('flex:1')) continue;
        const line = appJS.substring(0, match.index).split('\n').length;
        unprotected.push(`line ${line}: style="${style}">\${esc(...`);
      }
      assert.equal(
        unprotected.length, 0,
        `Found ${unprotected.length} inline font-weight title span(s) without overflow or class:\n${unprotected.join('\n')}`
      );
    });
  });

  // ─── REGRESSION GUARD: focus history user text overflow ───

  describe('focus history session items have overflow protection', () => {
    it('task title span in focus history has overflow:hidden', () => {
      const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      // Find the focus history section — looks for task_title in a font-weight span
      const histBlock = /font-weight:500[^"]*">\$\{esc\(s\.task_title\)/;
      const match = histBlock.exec(appJS);
      assert.ok(match, 'focus history task title span found');
      // Check surrounding context has overflow protection
      const start = Math.max(0, match.index - 100);
      const ctx = appJS.substring(start, match.index + match[0].length);
      assert.ok(
        ctx.includes('overflow:hidden'),
        'focus history task title container must have overflow:hidden'
      );
    });
  });
});
