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

// ─── SPRINT 2: HTML Accessibility ───

describe('Label-input association (for= attributes)', () => {
  const labelForPairs = [
    ['am-name', 'Area name'],
    ['am-icon', 'Area icon'],
    ['gm-title', 'Goal title'],
    ['gm-desc', 'Goal description'],
    ['gm-due', 'Goal due date'],
    ['lm-name', 'List name'],
    ['lm-icon', 'List icon'],
    ['lm-area', 'List area'],
    ['qc-goal', 'Quick capture goal'],
    ['qc-pri', 'Quick capture priority'],
    ['qc-due', 'Quick capture due'],
    ['qc-list', 'Quick capture list'],
  ];
  for (const [id, desc] of labelForPairs) {
    it(`label for="${id}" (${desc})`, () => {
      assert.ok(
        html.includes(`for="${id}"`),
        `label for="${id}" must exist in HTML for ${desc}`
      );
    });
  }
});

describe('Required attributes on critical inputs', () => {
  const requiredIds = [
    ['am-name', 'Area name'],
    ['gm-title', 'Goal title'],
    ['lm-name', 'List name'],
    ['qc-title', 'Quick capture title'],
  ];
  for (const [id, desc] of requiredIds) {
    it(`#${id} has required attribute (${desc})`, () => {
      // Find the input tag containing this id and check it has required
      const re = new RegExp(`id="${id}"[^>]*required`);
      assert.ok(re.test(html), `#${id} (${desc}) must have required attribute`);
    });
    it(`#${id} has aria-required="true" (${desc})`, () => {
      const re = new RegExp(`id="${id}"[^>]*aria-required="true"`);
      assert.ok(re.test(html), `#${id} (${desc}) must have aria-required="true"`);
    });
  }
});

describe('Maxlength on text inputs', () => {
  const maxlengthInputs = [
    ['am-name', '100', 'Area name'],
    ['gm-title', '200', 'Goal title'],
    ['gm-desc', '2000', 'Goal description'],
    ['lm-name', '100', 'List name'],
    ['qc-title', '200', 'Quick capture title'],
    ['onb-area-input', '100', 'Onboarding area'],
    ['onb-goal-input', '200', 'Onboarding goal'],
    ['onb-task-input', '200', 'Onboarding task'],
  ];
  for (const [id, len, desc] of maxlengthInputs) {
    it(`#${id} has maxlength="${len}" (${desc})`, () => {
      const re = new RegExp(`id="${id}"[^>]*maxlength="${len}"`);
      assert.ok(re.test(html), `#${id} (${desc}) must have maxlength="${len}"`);
    });
  }
});

describe('Autocomplete attributes', () => {
  const offInputs = [
    ['am-name', 'Area name'],
    ['gm-title', 'Goal title'],
    ['lm-name', 'List name'],
    ['qc-title', 'Quick capture title'],
    ['sr-inp', 'Search'],
    ['onb-area-input', 'Onboarding area'],
    ['onb-goal-input', 'Onboarding goal'],
    ['onb-task-input', 'Onboarding task'],
  ];
  for (const [id, desc] of offInputs) {
    it(`#${id} has autocomplete="off" (${desc})`, () => {
      const re = new RegExp(`id="${id}"[^>]*autocomplete="off"`);
      assert.ok(re.test(html), `#${id} (${desc}) must have autocomplete="off"`);
    });
  }
});

describe('ARIA dialog attributes on modals', () => {
  const modals = [
    ['am', 'Area modal'],
    ['gm', 'Goal modal'],
    ['lm', 'List modal'],
    ['sr-ov', 'Search overlay'],
    ['qc-ov', 'Quick capture'],
    ['ft-ov', 'Focus timer'],
    ['kb-ov', 'Keyboard shortcuts'],
    ['onb-ov', 'Onboarding wizard'],
    ['dr-ov', 'Daily review'],
    ['dp', 'Task detail panel'],
  ];
  for (const [id, desc] of modals) {
    it(`#${id} has role="dialog" (${desc})`, () => {
      const re = new RegExp(`id="${id}"[^>]*role="dialog"`);
      assert.ok(re.test(html), `#${id} (${desc}) must have role="dialog"`);
    });
    it(`#${id} has aria-modal="true" (${desc})`, () => {
      const re = new RegExp(`id="${id}"[^>]*aria-modal="true"`);
      assert.ok(re.test(html), `#${id} (${desc}) must have aria-modal="true"`);
    });
    it(`#${id} has aria-label (${desc})`, () => {
      const re = new RegExp(`id="${id}"[^>]*aria-label="`);
      assert.ok(re.test(html), `#${id} (${desc}) must have aria-label`);
    });
  }
});

describe('Skip-to-content link exists', () => {
  it('skip link is present', () => {
    assert.ok(html.includes('class="skip-link"'), 'skip-link must exist');
  });
  it('skip link targets #ct', () => {
    assert.ok(html.includes('href="#ct"'), 'skip link must target #ct');
  });
});

// ─── SPRINT 3: Validation Engine ───

describe('validateField() helper exists in app.js', () => {
  const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  it('defines validateField function', () => {
    assert.ok(appJS.includes('function validateField('), 'validateField must be defined');
  });

  it('defines clearFieldError function', () => {
    assert.ok(appJS.includes('function clearFieldError('), 'clearFieldError must be defined');
  });

  it('validateField adds inp-err class on error', () => {
    assert.ok(appJS.includes("classList.add('inp-err')"), 'should add inp-err on invalid');
  });

  it('validateField removes inp-err class on success', () => {
    assert.ok(appJS.includes("classList.remove('inp-err')"), 'should remove inp-err on valid');
  });

  it('validateField checks required', () => {
    assert.ok(appJS.includes('rules.required'), 'must check required rule');
  });

  it('validateField checks maxlength', () => {
    assert.ok(appJS.includes('rules.maxlength'), 'must check maxlength rule');
  });

  it('validateField checks pattern', () => {
    assert.ok(appJS.includes('rules.pattern'), 'must check pattern rule');
  });

  it('validateField shows error message', () => {
    assert.ok(appJS.includes("classList.add('visible')"), 'must show .field-err.visible');
  });
});

describe('Save handlers use validateField', () => {
  const appJS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  it('area save validates am-name', () => {
    assert.ok(appJS.includes("validateField('am-name'"), 'area save must call validateField for am-name');
  });

  it('goal save validates gm-title', () => {
    assert.ok(appJS.includes("validateField('gm-title'"), 'goal save must call validateField for gm-title');
  });

  it('list save validates lm-name', () => {
    assert.ok(appJS.includes("validateField('lm-name'"), 'list save must call validateField for lm-name');
  });

  it('quick capture save validates qc-title', () => {
    assert.ok(appJS.includes("validateField('qc-title'"), 'QC save must call validateField for qc-title');
  });

  it('detail panel save validates title', () => {
    assert.ok(
      appJS.includes("dp-ttl") && appJS.includes("Task title cannot be empty"),
      'DP save must validate title not empty'
    );
  });
});

describe('Inline error spans exist in HTML', () => {
  const errSpans = [
    ['am-name-err', 'Area name error'],
    ['gm-title-err', 'Goal title error'],
    ['lm-name-err', 'List name error'],
    ['qc-title-err', 'Quick capture title error'],
  ];
  for (const [id, desc] of errSpans) {
    it(`#${id} error span exists (${desc})`, () => {
      assert.ok(html.includes(`id="${id}"`), `Error span #${id} must exist for ${desc}`);
    });
    it(`#${id} has role="alert" (${desc})`, () => {
      assert.ok(
        html.includes(`id="${id}" role="alert"`),
        `Error span #${id} must have role="alert" for screen readers`
      );
    });
    it(`#${id} has field-err class (${desc})`, () => {
      const re = new RegExp(`class="field-err"[^>]*id="${id}"`);
      assert.ok(re.test(html), `#${id} must have class="field-err"`);
    });
  }
});

describe('Backend maxlength validation', () => {
  const tasksJS = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tasks.js'), 'utf8');
  const areasJS = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'areas.js'), 'utf8');

  it('tasks route validates title maxlength', () => {
    assert.ok(tasksJS.includes('Title too long'), 'tasks.js must validate title maxlength');
  });

  it('tasks route validates note maxlength', () => {
    assert.ok(tasksJS.includes('Note too long'), 'tasks.js must validate note maxlength');
  });

  it('goals route validates title maxlength', () => {
    assert.ok(areasJS.includes('Title too long'), 'areas.js must validate goal title maxlength');
  });

  it('goals route validates description maxlength', () => {
    assert.ok(areasJS.includes('Description too long'), 'areas.js must validate description maxlength');
  });

  it('areas route validates area name maxlength', () => {
    assert.ok(areasJS.includes('Name too long'), 'areas.js must validate area name maxlength');
  });
});
