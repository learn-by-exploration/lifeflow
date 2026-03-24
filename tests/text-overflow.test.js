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
    it('has flex-shrink:0', () => {
      assertCSSProps('.habit-card .hc-streak', ['flex-shrink:0'], 'habit streak');
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
});
