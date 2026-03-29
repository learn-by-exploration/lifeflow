const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeArea, makeGoal, makeTask, agent } = require('./helpers');
const fs = require('fs');
const path = require('path');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Mobile + Accessibility + Demo Mode ───
describe('Mobile bottom bar HTML', () => {
  it('index.html contains mobile-bottom-bar element', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('mobile-bottom-bar'), 'Should have mobile bottom bar');
    assert.ok(html.includes('mb-tab'), 'Should have mobile tab buttons');
  });

  it('mobile bottom bar has 5 tabs', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const tabs = (html.match(/class="mb-tab/g) || []).length;
    assert.ok(tabs >= 5, 'Should have at least 5 mobile tabs');
  });
});

describe('Skip-to-content link', () => {
  it('index.html has skip-link for accessibility', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('skip-link'), 'Should have skip-to-content link');
    assert.ok(html.includes('Skip to content'), 'Skip link should say "Skip to content"');
  });
});

describe('ARIA labels', () => {
  it('icon-only buttons have aria-label attributes', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('aria-label="Open navigation menu"'), 'Hamburger should have aria-label');
    assert.ok(html.includes('aria-label="Quick add task"'), 'FAB should have aria-label');
    assert.ok(html.includes('aria-label="Notifications"'), 'Bell button should have aria-label');
    assert.ok(html.includes('aria-label="Close task details"'), 'Close button should have aria-label');
  });

  it('modal overlays have aria-modal and role attributes', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('role="dialog" aria-modal="true"'), 'Modals should have role and aria-modal');
  });
});

describe('prefers-reduced-motion CSS', () => {
  it('styles.css includes prefers-reduced-motion media query', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('prefers-reduced-motion'), 'Should have reduced motion media query');
  });
});

describe('Focus visible styles', () => {
  it('styles.css includes :focus-visible rule', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes(':focus-visible'), 'Should have focus-visible styles');
  });
});

describe('Demo mode API', () => {
  it('POST /api/demo/start creates sample areas, goals, tasks', async () => {
    const res = await agent().post('/api/demo/start').send({});
    assert.equal(res.status, 200);
    const areas = await agent().get('/api/areas');
    assert.ok(areas.body.length >= 3, 'Should create 3+ areas');
    const tasks = await agent().get('/api/tasks/all');
    assert.ok(tasks.body.length >= 15, 'Should create 15+ tasks');
  });

  it('POST /api/demo/reset removes all data', async () => {
    await agent().post('/api/demo/start').send({});
    await agent().post('/api/demo/reset').send({ password: 'testpassword' });
    const areas = await agent().get('/api/areas');
    assert.equal(areas.body.length, 0, 'Should be empty after reset');
  });

  it('demo mode creates habits', async () => {
    await agent().post('/api/demo/start').send({});
    const habits = await agent().get('/api/habits');
    assert.ok(habits.body.length >= 3, 'Should create 3 habits');
  });
});

describe('Mobile bottom bar CSS', () => {
  it('styles.css has mobile-bottom-bar class', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('.mobile-bottom-bar'), 'Should have mobile bottom bar styles');
  });

  it('styles.css has demo-banner class', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(css.includes('.demo-banner'), 'Should have demo banner styles');
  });
});

describe('Focus trapping in app.js', () => {
  it('app.js includes trapFocus utility', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(js.includes('trapFocus'), 'Should have trapFocus function');
  });

  it('app.js includes modal focus observer', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(js.includes('modalObserver'), 'Should have modal observer for focus trapping');
  });
});

describe('Keyboard accessible context menus', () => {
  it('app.js updates mobile bottom bar on view change', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(js.includes('mb-tab'), 'go() function should update mobile tabs');
  });
});
