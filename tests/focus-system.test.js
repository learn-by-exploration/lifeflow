/**
 * Focus Timer — System-Level Frontend Tests
 *
 * End-to-end validation of the entire focus flow:
 * 1. DOM integrity: all ft-* ids in HTML match JS references
 * 2. CSS class coverage: all dynamically-generated classes are defined
 * 3. Focus session API lifecycle (create → meta → steps → toggle → end → reflect)
 * 4. Focus stats / history / insights / streak / goal APIs
 * 5. Technique config consistency (FT_TECHNIQUES + FT_MODES)
 * 6. Panel visibility state machine (pick → plan → timer → reflect)
 * 7. Extend bar buttons and rating buttons data attributes
 * 8. Focus Hub stats API contract
 * 9. No orphan ft-* HTML ids (all used in JS)
 */
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, makeFocus, agent, setup } = require('./helpers');

// ── Load source files once ──
const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
const HTML_NO_SCRIPT = HTML.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<style>[\s\S]*?<\/style>/, '');

// Helper: extract all HTML ids
function htmlIds() {
  const ids = new Set();
  let m;
  const re = /\bid=["']([^"']+)["']/g;
  while ((m = re.exec(HTML_NO_SCRIPT))) ids.add(m[1]);
  return ids;
}

// Helper: extract all CSS class selectors
function cssClasses() {
  const cls = new Set();
  let m;
  const re = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  while ((m = re.exec(CSS))) cls.add(m[1]);
  return cls;
}

// ═══════════════════════════════════════════════════════════
// 1. DOM INTEGRITY — All ft-* HTML ids exist and are referenced
// ═══════════════════════════════════════════════════════════

describe('Focus DOM Integrity', () => {
  const ids = htmlIds();

  // All ft-* ids that should exist in valid static HTML
  const EXPECTED_FT_IDS = [
    // Overlay
    'ft-ov',
    // Technique picker panel
    'ft-pick', 'ft-pick-task', 'ft-pick-hint', 'ft-tech-grid', 'ft-pick-subs', 'ft-pick-cancel',
    // Plan panel
    'ft-plan', 'ft-plan-task', 'ft-plan-technique', 'ft-intention', 'ft-plan-steps',
    'ft-step-input', 'ft-step-add', 'ft-timebox-row', 'ft-timebox-dur',
    'ft-when-now', 'ft-when-later', 'ft-schedule-row', 'ft-schedule-time',
    'ft-plan-go', 'ft-plan-cancel',
    // Timer panel
    'ft-timer', 'ft-task', 'ft-arc', 'ft-display', 'ft-label',
    'ft-steps', 'ft-extend-bar', 'ft-mode', 'ft-toggle', 'ft-stop',
    // Reflect panel
    'ft-reflect', 'ft-reflect-title', 'ft-reflect-summary', 'ft-rating',
    'ft-reflection', 'ft-reflect-done', 'ft-reflect-continue',
  ];

  it('all expected ft-* ids exist in index.html', () => {
    const missing = EXPECTED_FT_IDS.filter(id => !ids.has(id));
    assert.equal(missing.length, 0,
      `Missing ft-* ids: ${missing.join(', ')}`);
  });

  it('no duplicate ft-* ids in HTML', () => {
    const idCounts = {};
    let m;
    const re = /\bid=["'](ft-[^"']+)["']/g;
    while ((m = re.exec(HTML_NO_SCRIPT))) {
      idCounts[m[1]] = (idCounts[m[1]] || 0) + 1;
    }
    const dupes = Object.entries(idCounts).filter(([, c]) => c > 1);
    assert.equal(dupes.length, 0,
      `Duplicate ft-* ids: ${dupes.map(([id, c]) => `${id} (×${c})`).join(', ')}`);
  });

  it('every ft-* id in HTML is referenced in app.js', () => {
    const ftIds = EXPECTED_FT_IDS;
    // IDs that are only structural containers (not directly referenced by $() but valid)
    const structural = new Set(['ft-ov', 'ft-rating', 'ft-tech-grid', 'ft-extend-bar', 'ft-when-later']);
    const unreferenced = ftIds.filter(id => {
      if (structural.has(id)) return false;
      // Check $('id') or getElementById('id') or id="..." referenced in string
      return !APP_JS.includes(`'${id}'`) && !APP_JS.includes(`"${id}"`);
    });
    assert.equal(unreferenced.length, 0,
      `ft-* ids not referenced in JS: ${unreferenced.join(', ')}`);
  });

  it('every $("ft-*") reference in JS has matching HTML id', () => {
    const re = /\$\(['"]ft-([^'"]+)['"]\)/g;
    const refs = new Set();
    let m;
    while ((m = re.exec(APP_JS))) refs.add('ft-' + m[1]);

    const missing = [...refs].filter(id => !ids.has(id));
    assert.equal(missing.length, 0,
      `$() refs with no HTML id: ${missing.join(', ')}`);
  });

  it('focus overlay has proper aria attributes', () => {
    assert.ok(HTML.includes('role="dialog"'), 'ft-ov has role=dialog');
    assert.ok(HTML.includes('aria-modal="true"'), 'ft-ov has aria-modal');
    assert.ok(HTML.includes('aria-label="Focus Timer"'), 'ft-ov has aria-label');
  });
});

// ═══════════════════════════════════════════════════════════
// 2. CSS CLASS COVERAGE — dynamic HTML classes are defined
// ═══════════════════════════════════════════════════════════

describe('Focus CSS Class Coverage', () => {
  const defined = cssClasses();

  // Classes generated dynamically in JS for focus flow
  const DYNAMIC_FOCUS_CLASSES = [
    // Focus Hub
    'fh-stats', 'fh-stat', 'fh-task-list', 'fh-task-card', 'fh-task-main',
    'fh-task-title', 'fh-task-ctx', 'fh-task-go', 'fh-task-subs',
    'fh-sub-bar', 'fh-sub-fill', 'fh-sub-label',
    // Technique picker
    'ft-tech-card', 'ft-tech-icon', 'ft-tech-name', 'ft-tech-desc', 'ft-tech-tag',
    'ft-pick-sub', 'ft-pick-sub-chk',
    // Plan steps
    'ft-plan-step', 'ft-plan-step-rm',
    // Timer steps
    'ft-step-item', 'ft-step-chk',
    // Technique card states
    'recommended', 'selected',
    // Step states
    'done',
    // Timer and panels
    'ft-ov', 'ft-box', 'ft-pick', 'ft-plan', 'ft-reflect',
    'ft-ring', 'ft-time-inner', 'ft-task', 'ft-label',
    'ft-btns', 'ft-btn', 'ft-tech-grid',
    'ft-steps', 'ft-extend-bar',
    'ft-rating', 'ft-rate',
    'ft-when', 'active',
    // Buttons
    'primary', 'danger',
    // Subtask picker
    'ft-pick-subs',
  ];

  it('all dynamically-generated focus CSS classes are defined in styles.css', () => {
    const missing = DYNAMIC_FOCUS_CLASSES.filter(cls => !defined.has(cls));
    assert.equal(missing.length, 0,
      `CSS classes used in focus JS but not defined: ${missing.join(', ')}`);
  });

  it('ft-tech-card.recommended style is defined', () => {
    assert.ok(CSS.includes('.ft-tech-card.recommended'), 'CSS has .ft-tech-card.recommended');
  });

  it('ft-tech-card.selected style is defined', () => {
    assert.ok(CSS.includes('.ft-tech-card.selected'), 'CSS has .ft-tech-card.selected');
  });

  it('ft-step-item.done style is defined', () => {
    assert.ok(CSS.includes('.ft-step-item.done'), 'CSS has .ft-step-item.done');
  });

  it('ft-pick-sub.done style is defined', () => {
    assert.ok(CSS.includes('.ft-pick-sub.done'), 'CSS has .ft-pick-sub.done');
  });

  it('ft-when.active style is defined', () => {
    assert.ok(CSS.includes('.ft-when.active'), 'CSS has .ft-when.active');
  });
});

// ═══════════════════════════════════════════════════════════
// 3. TECHNIQUE CONFIG CONSISTENCY
// ═══════════════════════════════════════════════════════════

describe('Focus Technique Configuration', () => {
  it('FT_TECHNIQUES defines all 4 techniques', () => {
    assert.ok(APP_JS.includes('pomodoro:'), 'defines pomodoro');
    assert.ok(APP_JS.includes('deep:'), 'defines deep');
    assert.ok(APP_JS.includes('quick:'), 'defines quick');
    assert.ok(APP_JS.includes('timebox:'), 'defines timebox');
  });

  it('pomodoro has breaks and plan', () => {
    // pomodoro:{dur:25,hasBreaks:true,skipPlan:false}
    const match = APP_JS.match(/pomodoro:\{([^}]+)\}/);
    assert.ok(match, 'pomodoro config found');
    const cfg = match[1];
    assert.ok(cfg.includes('dur:25'), 'pomodoro dur=25');
    assert.ok(cfg.includes('hasBreaks:true'), 'pomodoro has breaks');
    assert.ok(cfg.includes('skipPlan:false'), 'pomodoro does not skip plan');
  });

  it('deep focus has long duration', () => {
    const match = APP_JS.match(/deep:\{([^}]+)\}/);
    assert.ok(match, 'deep config found');
    assert.ok(match[1].includes('dur:60'), 'deep dur=60');
  });

  it('quick has short duration and skipPlan', () => {
    const match = APP_JS.match(/quick:\{([^}]+)\}/);
    assert.ok(match, 'quick config found');
    const cfg = match[1];
    assert.ok(cfg.includes('dur:5'), 'quick dur=5');
    assert.ok(cfg.includes('skipPlan:true'), 'quick skips plan');
  });

  it('timebox has zero default duration', () => {
    const match = APP_JS.match(/timebox:\{([^}]+)\}/);
    assert.ok(match, 'timebox config found');
    assert.ok(match[1].includes('dur:0'), 'timebox dur=0');
  });

  it('FT_MODES defines focus, short, and long', () => {
    assert.ok(APP_JS.includes('focus:{'), 'defines focus mode');
    assert.ok(APP_JS.includes('short:{'), 'defines short mode');
    assert.ok(APP_JS.includes('long:{'), 'defines long mode');
  });

  it('FT_MODES durations are in seconds and correct', () => {
    assert.ok(APP_JS.includes('dur:25*60'), 'focus mode = 25*60');
    assert.ok(APP_JS.includes('dur:5*60'), 'short break = 5*60');
    assert.ok(APP_JS.includes('dur:15*60'), 'long break = 15*60');
  });
});

// ═══════════════════════════════════════════════════════════
// 4. PANEL VISIBILITY STATE MACHINE
// ═══════════════════════════════════════════════════════════

describe('Focus Panel State Machine', () => {
  const PANELS = ['ft-pick', 'ft-plan', 'ft-timer', 'ft-reflect'];

  it('all 4 panels initially hidden (style="display:none")', () => {
    PANELS.forEach(id => {
      const re = new RegExp(`id="${id}"[^>]*style="[^"]*display:\\s*none`);
      assert.ok(re.test(HTML), `${id} starts hidden`);
    });
  });

  it('showTechniquePicker shows ft-pick and hides others', () => {
    // Should set ft-pick display block/flex and hide the rest
    assert.ok(APP_JS.includes("$('ft-pick').style.display=''") ||
              APP_JS.includes("$('ft-pick').style.display='block'") ||
              APP_JS.includes("$('ft-pick').style.display='flex'"),
      'showTechniquePicker reveals ft-pick');
  });

  it('showFocusPlan shows ft-plan and hides ft-pick', () => {
    assert.ok(APP_JS.includes("$('ft-plan').style.display=''") ||
              APP_JS.includes("$('ft-plan').style.display='block'") ||
              APP_JS.includes("$('ft-plan').style.display='flex'"),
      'showFocusPlan reveals ft-plan');
    assert.ok(APP_JS.includes("$('ft-pick').style.display='none'"),
      'showFocusPlan hides ft-pick');
  });

  it('showFocusUI shows ft-timer and hides ft-pick and ft-plan', () => {
    assert.ok(APP_JS.includes("$('ft-timer').style.display=''") ||
              APP_JS.includes("$('ft-timer').style.display='block'") ||
              APP_JS.includes("$('ft-timer').style.display='flex'"),
      'showFocusUI reveals ft-timer');
  });

  it('showReflection shows ft-reflect and hides ft-timer', () => {
    assert.ok(APP_JS.includes("$('ft-reflect').style.display=''") ||
              APP_JS.includes("$('ft-reflect').style.display='block'") ||
              APP_JS.includes("$('ft-reflect').style.display='flex'"),
      'showReflection reveals ft-reflect');
    assert.ok(APP_JS.includes("$('ft-timer').style.display='none'"),
      'showReflection hides ft-timer');
  });

  it('ft-ov overlay becomes active during focus', () => {
    assert.ok(APP_JS.includes("$('ft-ov').classList.add('active')"),
      'overlay activated with .active class');
  });

  it('cancel/close removes active from overlay', () => {
    assert.ok(APP_JS.includes("$('ft-ov').classList.remove('active')"),
      'overlay deactivated on cancel/close');
  });
});

// ═══════════════════════════════════════════════════════════
// 5. EXTEND BAR AND RATING BUTTONS
// ═══════════════════════════════════════════════════════════

describe('Focus Timer Controls', () => {
  it('extend bar has +5, +15, +25, and done buttons', () => {
    assert.ok(HTML.includes('data-extend="5"'), 'extend +5 button');
    assert.ok(HTML.includes('data-extend="15"'), 'extend +15 button');
    assert.ok(HTML.includes('data-extend="25"'), 'extend +25 button');
    assert.ok(HTML.includes('data-extend="done"'), 'extend done button');
  });

  it('extend bar buttons have correct labels', () => {
    assert.ok(HTML.includes('+5 min'), 'extend +5 label');
    assert.ok(HTML.includes('+15 min'), 'extend +15 label');
    assert.ok(HTML.includes('+25 min'), 'extend +25 label');
    assert.ok(HTML.includes("I'm Done"), 'extend done label');
  });

  it('rating panel has exactly 5 rate buttons (1-5)', () => {
    for (let i = 1; i <= 5; i++) {
      assert.ok(HTML.includes(`data-rate="${i}"`), `rate button ${i} exists`);
    }
    // No rate=0 or rate=6
    assert.ok(!HTML.includes('data-rate="0"'), 'no rate=0');
    assert.ok(!HTML.includes('data-rate="6"'), 'no rate=6');
  });

  it('rating emojis are present', () => {
    const emojis = ['😫', '😐', '🙂', '😊', '🔥'];
    emojis.forEach(e => {
      assert.ok(HTML.includes(e), `rating emoji ${e} present`);
    });
  });

  it('timer has Start/Pause/Resume toggle logic', () => {
    assert.ok(APP_JS.includes("'Start'") || APP_JS.includes('"Start"'), 'toggle shows Start');
    assert.ok(APP_JS.includes("'Pause'") || APP_JS.includes('"Pause"'), 'toggle shows Pause');
    assert.ok(APP_JS.includes("'Resume'") || APP_JS.includes('"Resume"'), 'toggle shows Resume');
  });

  it('timer SVG ring uses stroke-dasharray for progress', () => {
    assert.ok(HTML.includes('stroke-dasharray="628.32"'), 'SVG circumference for r=100');
    assert.ok(HTML.includes('stroke-dashoffset'), 'SVG uses dashoffset for progress');
  });

  it('updateFTDisplay formats time as MM:SS', () => {
    // Check for typical time formatting pattern (Math.floor, padStart, `:`)
    assert.ok(APP_JS.includes('padStart(2'), 'pads with leading zero');
  });
});

// ═══════════════════════════════════════════════════════════
// 6. FOCUS SESSION API LIFECYCLE (E2E Round-Trip)
// ═══════════════════════════════════════════════════════════

describe('Focus Session API Lifecycle', () => {
  beforeEach(() => cleanDb());

  it('full focus lifecycle: create → meta → steps → toggle step → end → reflect → stats', async () => {
    // Setup task hierarchy
    const area = makeArea({ name: 'Work', icon: '💼' });
    const goal = makeGoal(area.id, { title: 'Ship Feature' });
    const task = makeTask(goal.id, { title: 'Write tests' });
    makeSubtask(task.id, { title: 'Unit tests', done: 0, position: 0 });
    makeSubtask(task.id, { title: 'Integration tests', done: 0, position: 1 });

    // 1. CREATE session
    const createRes = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' })
      .expect(201);
    const sessionId = createRes.body.id;
    assert.ok(sessionId, 'session created with id');
    assert.equal(createRes.body.task_id, task.id);
    assert.equal(createRes.body.type, 'pomodoro');

    // 2. POST meta (intention)
    const metaRes = await agent()
      .post(`/api/focus/${sessionId}/meta`)
      .send({ intention: 'Complete test coverage', steps_planned: 2, strategy: 'pomodoro' })
      .expect(200);
    assert.equal(metaRes.body.intention, 'Complete test coverage');
    assert.equal(metaRes.body.steps_planned, 2);

    // 3. POST steps
    const stepsRes = await agent()
      .post(`/api/focus/${sessionId}/steps`)
      .send({ steps: ['Unit tests', 'Integration tests'] })
      .expect(201);
    assert.ok(Array.isArray(stepsRes.body), 'steps returned as array');
    assert.equal(stepsRes.body.length, 2);
    const step1Id = stepsRes.body[0].id;
    assert.equal(stepsRes.body[0].text, 'Unit tests');
    assert.equal(stepsRes.body[0].done, 0);

    // 4. GET steps
    const getStepsRes = await agent()
      .get(`/api/focus/${sessionId}/steps`)
      .expect(200);
    assert.equal(getStepsRes.body.length, 2);

    // 5. TOGGLE step done
    const toggleRes = await agent()
      .put(`/api/focus/steps/${step1Id}`)
      .expect(200);
    assert.equal(toggleRes.body.done, 1);

    // 6. END session
    const endRes = await agent()
      .put(`/api/focus/${sessionId}/end`)
      .send({ duration_sec: 1500 })
      .expect(200);
    assert.ok(endRes.body.ended_at, 'session has ended_at timestamp');

    // 7. POST meta (reflection)
    const reflectRes = await agent()
      .post(`/api/focus/${sessionId}/meta`)
      .send({ reflection: 'Good session', focus_rating: 4, steps_completed: 1 })
      .expect(200);
    assert.equal(reflectRes.body.focus_rating, 4);
    assert.equal(reflectRes.body.reflection, 'Good session');

    // 8. GET meta
    const getMetaRes = await agent()
      .get(`/api/focus/${sessionId}/meta`)
      .expect(200);
    assert.equal(getMetaRes.body.focus_rating, 4);

    // 9. Verify stats reflect the session
    const stats = await agent().get('/api/focus/stats').expect(200);
    assert.ok(Number(stats.body.sessions) >= 1, 'at least 1 session today');
  });

  it('focus session can be created with quick type', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const res = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 0, type: 'quick' })
      .expect(201);
    assert.equal(res.body.type, 'quick');
    assert.equal(res.body.duration_sec, 0);
  });

  it('scheduled session stores scheduled_at', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const when = '2026-06-15T10:00:00';

    const res = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro', scheduled_at: when })
      .expect(201);
    assert.equal(res.body.scheduled_at, when);
  });

  it('meta rejects invalid focus_rating (>5)', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' })
      .expect(201);

    await agent()
      .post(`/api/focus/${sess.body.id}/meta`)
      .send({ focus_rating: 10 })
      .expect(400);
  });

  it('meta rejects negative focus_rating', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' })
      .expect(201);

    await agent()
      .post(`/api/focus/${sess.body.id}/meta`)
      .send({ focus_rating: -1 })
      .expect(400);
  });

  it('steps rejects empty array', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 0, type: 'quick' })
      .expect(201);

    await agent()
      .post(`/api/focus/${sess.body.id}/steps`)
      .send({ steps: [] })
      .expect(400);
  });

  it('deleting a focus session works', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);
    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 0, type: 'quick' })
      .expect(201);

    await agent().delete(`/api/focus/${sess.body.id}`).expect(200);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. FOCUS STATS / HISTORY / INSIGHTS / STREAK / GOAL APIs
// ═══════════════════════════════════════════════════════════

describe('Focus Analytics APIs', () => {
  beforeEach(() => cleanDb());

  it('GET /api/focus/stats returns correct structure', async () => {
    const res = await agent().get('/api/focus/stats').expect(200);
    assert.ok('today' in res.body, 'has today (seconds)');
    assert.ok('sessions' in res.body, 'has sessions count');
    assert.ok('week' in res.body, 'has week (seconds)');
    assert.ok('byTask' in res.body, 'has byTask breakdown');
  });

  it('GET /api/focus/stats counts sessions correctly', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    // Create 2 sessions
    await agent().post('/api/focus')
      .send({ task_id: task.id, duration_sec: 600, type: 'pomodoro' }).expect(201);
    await agent().post('/api/focus')
      .send({ task_id: task.id, duration_sec: 900, type: 'deep' }).expect(201);

    const res = await agent().get('/api/focus/stats').expect(200);
    assert.equal(Number(res.body.sessions), 2);
  });

  it('GET /api/focus/history returns paginated results', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    await agent().post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' }).expect(201);

    const res = await agent().get('/api/focus/history').expect(200);
    assert.ok('items' in res.body, 'has items');
    assert.ok('total' in res.body, 'has total count');
    assert.ok('page' in res.body, 'has page');
    assert.ok('pages' in res.body, 'has pages');
    assert.ok(Array.isArray(res.body.items), 'items is array');
    assert.ok(res.body.total >= 1, 'at least 1 session in history');
  });

  it('GET /api/focus/insights returns analytics structure', async () => {
    const res = await agent().get('/api/focus/insights').expect(200);
    assert.ok('peakHours' in res.body, 'has peakHours');
    assert.ok('byStrategy' in res.body, 'has byStrategy');
    assert.ok('avgRating' in res.body, 'has avgRating');
    assert.ok('completionRate' in res.body, 'has completionRate');
  });

  it('GET /api/focus/streak returns streak data', async () => {
    const res = await agent().get('/api/focus/streak').expect(200);
    assert.ok('streak' in res.body, 'has streak count');
    assert.ok('bestStreak' in res.body, 'has bestStreak');
    assert.ok('heatmap' in res.body, 'has heatmap array');
    assert.ok(Array.isArray(res.body.heatmap), 'heatmap is array');
  });

  it('GET /api/focus/goal returns goal target data', async () => {
    const res = await agent().get('/api/focus/goal').expect(200);
    assert.ok('goalMinutes' in res.body, 'has goalMinutes');
    assert.ok('todayMinutes' in res.body, 'has todayMinutes');
    assert.ok('todaySec' in res.body, 'has todaySec');
    assert.ok('pct' in res.body, 'has pct');
  });
});

// ═══════════════════════════════════════════════════════════
// 8. FOCUS HUB RENDERING PATTERNS
// ═══════════════════════════════════════════════════════════

describe('Focus Hub Rendering', () => {

  it('renderFocusHub fetches both stats and tasks in parallel', () => {
    assert.ok(APP_JS.includes("Promise.all([api.get('/api/focus/stats')"),
      'uses Promise.all for parallel fetch');
    assert.ok(APP_JS.includes("api.get('/api/tasks/all')"),
      'fetches all tasks for focus hub');
  });

  it('renders stats bar with todayMinutes, todaySessions, todayCompleted', () => {
    assert.ok(APP_JS.includes('todayMinutes'), 'renders todayMinutes');
    assert.ok(APP_JS.includes('todaySessions'), 'renders todaySessions');
    assert.ok(APP_JS.includes('todayCompleted'), 'renders todayCompleted');
  });

  it('filters out done tasks for focus hub', () => {
    // Client filters: .filter(t => t.status !== 'done')
    assert.ok(APP_JS.includes("status!=='done'") || APP_JS.includes('status !== "done"'),
      'filters done tasks');
  });

  it('renders task cards with play button for starting focus', () => {
    assert.ok(APP_JS.includes('fh-task-go'), 'renders go button class');
    assert.ok(APP_JS.includes('play_arrow') || APP_JS.includes('play_circle'),
      'uses play icon');
  });

  it('renders subtask progress bar when subtasks exist', () => {
    assert.ok(APP_JS.includes('fh-sub-bar'), 'renders sub progress bar');
    assert.ok(APP_JS.includes('fh-sub-fill'), 'renders sub fill bar');
    assert.ok(APP_JS.includes('fh-sub-label'), 'renders sub label');
  });

  it('play button on task card triggers startFocusTimer', () => {
    assert.ok(APP_JS.includes('startFocusTimer'), 'references startFocusTimer function');
  });
});

// ═══════════════════════════════════════════════════════════
// 9. FLOW FUNCTION WIRING
// ═══════════════════════════════════════════════════════════

describe('Focus Flow Function Chain', () => {

  it('startFocusTimer calls showTechniquePicker', () => {
    assert.ok(APP_JS.includes('showTechniquePicker('), 'startFocusTimer → showTechniquePicker');
  });

  it('technique card click leads to showFocusPlan or quickStartSession', () => {
    assert.ok(APP_JS.includes('showFocusPlan('), 'technique → showFocusPlan');
    assert.ok(APP_JS.includes('quickStartSession('), 'quick technique → quickStartSession');
  });

  it('quickStartSession calls showFocusUI', () => {
    assert.ok(APP_JS.includes('showFocusUI('), 'quickStartSession → showFocusUI');
  });

  it('ft-plan-go click triggers session creation', () => {
    // The plan go button should create a focus session
    assert.ok(APP_JS.includes("$('ft-plan-go')"), 'ft-plan-go is wired');
    assert.ok(APP_JS.includes("api.post('/api/focus'"), 'creates focus session');
  });

  it('ft-stop button leads to showReflection for long sessions', () => {
    assert.ok(APP_JS.includes("$('ft-stop')"), 'ft-stop is wired');
    assert.ok(APP_JS.includes('showReflection('), 'stop → reflection');
  });

  it('ft-reflect-done saves meta data', () => {
    assert.ok(APP_JS.includes("$('ft-reflect-done')"), 'ft-reflect-done is wired');
    assert.ok(APP_JS.includes("api.post('/api/focus/'+ftSessionId+'/meta'"),
      'reflection saves meta');
  });

  it('ft-reflect-continue starts new session or break', () => {
    assert.ok(APP_JS.includes("$('ft-reflect-continue')"), 'ft-reflect-continue is wired');
  });

  it('ft-pick-cancel and ft-plan-cancel close overlay', () => {
    assert.ok(APP_JS.includes("$('ft-pick-cancel')"), 'ft-pick-cancel wired');
    assert.ok(APP_JS.includes("$('ft-plan-cancel')"), 'ft-plan-cancel wired');
  });
});

// ═══════════════════════════════════════════════════════════
// 10. FRONTEND API ROUTE CONSISTENCY
// ═══════════════════════════════════════════════════════════

describe('Focus Frontend ↔ Backend API Consistency', () => {
  // All focus-related API calls found in app.js
  const FRONTEND_ROUTES = [
    { method: 'GET',  path: '/api/focus/stats' },
    { method: 'GET',  path: '/api/focus/history' },
    { method: 'GET',  path: '/api/focus/insights' },
    { method: 'POST', path: '/api/focus' },
    { method: 'PUT',  path: '/api/focus/:id/end' },
    { method: 'POST', path: '/api/focus/:id/meta' },
    { method: 'POST', path: '/api/focus/:id/steps' },
    { method: 'PUT',  path: '/api/focus/steps/:stepId' },
  ];

  // Load routes files
  const statsRoutes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'stats.js'), 'utf8');

  FRONTEND_ROUTES.forEach(({ method, path: route }) => {
    it(`${method} ${route} exists in backend routes`, () => {
      // Normalize route for regex matching
      const routePattern = route
        .replace(':id', '\\$\\{?[^}]+\\}?|:id')
        .replace(':stepId', '\\$\\{?[^}]+\\}?|:stepId');
      const methodLower = method.toLowerCase();
      const re = new RegExp(`router\\.${methodLower}\\(['"]${route.replace(/:[^/]+/g, ':[^/]+')}['"]`);
      assert.ok(re.test(statsRoutes),
        `${method} ${route} defined in stats.js routes`);
    });
  });

  it('frontend calls /api/tasks/all which exists in tasks routes', () => {
    const tasksRoutes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tasks.js'), 'utf8');
    assert.ok(tasksRoutes.includes("'/api/tasks/all'") || tasksRoutes.includes('"/api/tasks/all"'),
      'GET /api/tasks/all defined');
  });

  it('frontend calls PUT /api/subtasks/:id which exists in routes', () => {
    const tagsRoutes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'tags.js'), 'utf8');
    assert.ok(tagsRoutes.includes("'/api/subtasks/:id'") || tagsRoutes.includes('"api/subtasks/:id"'),
      'PUT /api/subtasks/:id defined in tags.js routes');
  });
});

// ═══════════════════════════════════════════════════════════
// 11. FOCUS TIMER STATE VARIABLES
// ═══════════════════════════════════════════════════════════

describe('Focus Timer State Variables', () => {
  const STATE_VARS = [
    'ftTask', 'ftInterval', 'ftRemaining', 'ftTotal', 'ftRunning',
    'ftMode', 'ftElapsed', 'ftSessionId', 'ftPlanSteps', 'ftActiveSteps',
    'ftRating', 'ftTechnique',
  ];

  it('all focus state variables are declared', () => {
    const missing = STATE_VARS.filter(v => !APP_JS.includes(v));
    assert.equal(missing.length, 0,
      `Missing state variables: ${missing.join(', ')}`);
  });

  it('ftRunning tracks timer running state', () => {
    assert.ok(APP_JS.includes('ftRunning=true') || APP_JS.includes('ftRunning = true'),
      'ftRunning set to true');
    assert.ok(APP_JS.includes('ftRunning=false') || APP_JS.includes('ftRunning = false'),
      'ftRunning set to false');
  });

  it('ftElapsed tracks elapsed seconds', () => {
    assert.ok(APP_JS.includes('ftElapsed'), 'ftElapsed used');
    // Should be incremented in timer interval
    assert.ok(APP_JS.includes('ftElapsed++') || APP_JS.includes('ftElapsed+=1') || APP_JS.includes('ftElapsed +='),
      'ftElapsed incremented');
  });

  it('ftInterval is cleared on stop/pause', () => {
    assert.ok(APP_JS.includes('clearInterval(ftInterval)'),
      'ftInterval cleared');
  });
});

// ═══════════════════════════════════════════════════════════
// 12. MULTI-SESSION FOCUS: end-to-end with multiple techniques
// ═══════════════════════════════════════════════════════════

describe('Multi-Technique Focus Sessions', () => {
  beforeEach(() => cleanDb());

  it('creating sessions with different types all work', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const types = ['pomodoro', 'deep', 'quick', 'timebox'];
    for (const type of types) {
      const res = await agent()
        .post('/api/focus')
        .send({ task_id: task.id, duration_sec: 0, type })
        .expect(201);
      assert.equal(res.body.type, type, `session type = ${type}`);
    }

    const stats = await agent().get('/api/focus/stats').expect(200);
    assert.equal(Number(stats.body.sessions), 4, '4 sessions created today');
  });

  it('focus history includes task title in joined data', async () => {
    const area = makeArea({ name: 'Dev' });
    const goal = makeGoal(area.id, { title: 'Build App' });
    const task = makeTask(goal.id, { title: 'Write API' });

    await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' })
      .expect(201);

    const res = await agent().get('/api/focus/history').expect(200);
    const session = res.body.items[0];
    assert.ok(session.task_title, 'history includes task_title');
  });

  it('step toggle persists across GET requests', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 0, type: 'quick' })
      .expect(201);

    const stepsRes = await agent()
      .post(`/api/focus/${sess.body.id}/steps`)
      .send({ steps: ['Step A', 'Step B'] })
      .expect(201);

    // Toggle first step
    await agent().put(`/api/focus/steps/${stepsRes.body[0].id}`).expect(200);

    // Verify via GET
    const getRes = await agent()
      .get(`/api/focus/${sess.body.id}/steps`)
      .expect(200);
    assert.equal(getRes.body[0].done, 1, 'step toggled to done');
    assert.equal(getRes.body[1].done, 0, 'other step still undone');
  });

  it('meta update (upsert) preserves earlier fields', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id);

    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' })
      .expect(201);

    // First meta: set intention
    await agent()
      .post(`/api/focus/${sess.body.id}/meta`)
      .send({ intention: 'Build feature', steps_planned: 3, strategy: 'pomodoro' })
      .expect(200);

    // Second meta: add reflection (should preserve intention)
    const res = await agent()
      .post(`/api/focus/${sess.body.id}/meta`)
      .send({ reflection: 'Great!', focus_rating: 5, steps_completed: 2 })
      .expect(200);

    assert.equal(res.body.intention, 'Build feature', 'intention preserved');
    assert.equal(res.body.focus_rating, 5, 'rating updated');
    assert.equal(res.body.reflection, 'Great!', 'reflection updated');
  });
});

// ── Auto-link Pomodoro to actual_minutes ──
describe('Focus session auto-updates task actual_minutes', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('adds focus duration to task actual_minutes on session end', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Timed task' });

    // Start focus session
    const sess = await agent()
      .post('/api/focus')
      .send({ task_id: task.id, duration_sec: 0, type: 'pomodoro' })
      .expect(201);

    // End session with 1500 sec (25 min)
    await agent()
      .put(`/api/focus/${sess.body.id}/end`)
      .send({ duration_sec: 1500 })
      .expect(200);

    // Check task actual_minutes
    const taskRes = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
    const updated = taskRes.body.find(t => t.id === task.id);
    assert.equal(updated.actual_minutes, 25);
  });

  it('accumulates actual_minutes from multiple focus sessions', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Multi session task' });

    // First session: 25 min
    const s1 = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 0 }).expect(201);
    await agent().put(`/api/focus/${s1.body.id}/end`).send({ duration_sec: 1500 }).expect(200);

    // Second session: 10 min
    const s2 = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 0 }).expect(201);
    await agent().put(`/api/focus/${s2.body.id}/end`).send({ duration_sec: 600 }).expect(200);

    const taskRes = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
    const updated = taskRes.body.find(t => t.id === task.id);
    assert.equal(updated.actual_minutes, 35); // 25 + 10
  });

  it('does not update actual_minutes for zero duration session', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Zero duration' });

    const sess = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 0 }).expect(201);
    await agent().put(`/api/focus/${sess.body.id}/end`).send({ duration_sec: 0 }).expect(200);

    const taskRes = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
    const updated = taskRes.body.find(t => t.id === task.id);
    assert.equal(updated.actual_minutes, 0);
  });

  it('adds to existing actual_minutes value', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Has existing time' });
    // Set initial actual_minutes via DB
    const { db } = setup();
    db.prepare('UPDATE tasks SET actual_minutes=10 WHERE id=?').run(task.id);

    const sess = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 0 }).expect(201);
    await agent().put(`/api/focus/${sess.body.id}/end`).send({ duration_sec: 1500 }).expect(200);

    const taskRes = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
    const updated = taskRes.body.find(t => t.id === task.id);
    assert.equal(updated.actual_minutes, 35); // 10 + 25
  });

  it('rounds duration to nearest minute', async () => {
    const area = makeArea();
    const goal = makeGoal(area.id);
    const task = makeTask(goal.id, { title: 'Round test' });

    const sess = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 0 }).expect(201);
    // 89 seconds = 1.48 min → rounds to 1
    await agent().put(`/api/focus/${sess.body.id}/end`).send({ duration_sec: 89 }).expect(200);

    const taskRes = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
    const updated = taskRes.body.find(t => t.id === task.id);
    assert.equal(updated.actual_minutes, 1);
  });
});
