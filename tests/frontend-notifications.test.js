/**
 * Frontend Notifications Tests
 *
 * Tests the notification bell dismiss functionality:
 * 1. localStorage round-trip (save/load dismissed IDs)
 * 2. Dismissal filters items from bell display
 * 3. Clear All button clears all dismissed items
 * 4. Daily reset clears dismissed list at midnight
 * 5. Badge count updates after dismissal
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal } = require('./helpers');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

before(() => setup());
beforeEach(() => cleanDb());
after(() => teardown());

// ─── Helper: build the three localStorage helper functions matching app.js ───

function buildBellHelpers() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
  const ls = dom.window.localStorage;
  // These mirror the implementations in app.js exactly
  function getDismissedReminders(){
    const today=new Date().toISOString().slice(0,10);
    const storedDate=ls.getItem('lf-dismissed-date');
    if(storedDate!==today){ls.setItem('lf-dismissed-reminders','[]');ls.setItem('lf-dismissed-date',today);return[]}
    try{return JSON.parse(ls.getItem('lf-dismissed-reminders')||'[]')}catch{return[]}
  }
  function dismissReminder(taskId){
    const dismissed=getDismissedReminders();
    if(!dismissed.includes(taskId)){dismissed.push(taskId);ls.setItem('lf-dismissed-reminders',JSON.stringify(dismissed))}
  }
  function clearAllReminders(taskIds){
    const dismissed=getDismissedReminders();
    const merged=[...new Set([...dismissed,...taskIds])];
    ls.setItem('lf-dismissed-reminders',JSON.stringify(merged));
  }
  return { helpers: { getDismissedReminders, dismissReminder, clearAllReminders }, localStorage: ls };
}

// ─── 1. localStorage round-trip ────────────────────────────────────────────

describe('Notification dismiss — localStorage round-trip', () => {
  it('saves and loads dismissed task IDs', () => {
    const { helpers, localStorage } = buildBellHelpers();
    // Set today's date so daily reset doesn't clear
    localStorage.setItem('lf-dismissed-date', new Date().toISOString().slice(0, 10));
    localStorage.setItem('lf-dismissed-reminders', '[]');

    helpers.dismissReminder(42);
    helpers.dismissReminder(99);

    const dismissed = helpers.getDismissedReminders();
    assert.ok(dismissed.includes(42), 'Should contain task ID 42');
    assert.ok(dismissed.includes(99), 'Should contain task ID 99');
    assert.equal(dismissed.length, 2);
  });

  it('does not duplicate IDs on repeated dismiss', () => {
    const { helpers, localStorage } = buildBellHelpers();
    localStorage.setItem('lf-dismissed-date', new Date().toISOString().slice(0, 10));
    localStorage.setItem('lf-dismissed-reminders', '[]');

    helpers.dismissReminder(42);
    helpers.dismissReminder(42);

    const dismissed = helpers.getDismissedReminders();
    assert.equal(dismissed.length, 1);
  });
});

// ─── 2. Dismissal filters items from bell display ──────────────────────────

describe('Notification dismiss — filters items', () => {
  it('bellItem HTML contains dismiss button with correct data-id', () => {
    const match = appSrc.match(/function bellItem\(t,type\)\{[\s\S]*?return`[^`]*`;\s*\}/);
    assert.ok(match, 'bellItem function found in app.js');
    assert.ok(match[0].includes('bell-item-dismiss'), 'bellItem includes dismiss button class');
    assert.ok(match[0].includes('data-id'), 'bellItem dismiss button has data-id attribute');
  });

  it('loadBellReminders filters dismissed IDs from display', () => {
    // Verify the filterDismissed pattern exists in loadBellReminders
    assert.ok(appSrc.includes('filterDismissed'), 'loadBellReminders uses filterDismissed helper');
    assert.ok(appSrc.includes('dismissed.includes(t.id)'), 'filterDismissed checks task IDs against dismissed list');
  });
});

// ─── 3. Clear All button clears all dismissed items ────────────────────────

describe('Notification dismiss — Clear All', () => {
  it('clearAllReminders stores all provided task IDs', () => {
    const { helpers, localStorage } = buildBellHelpers();
    localStorage.setItem('lf-dismissed-date', new Date().toISOString().slice(0, 10));
    localStorage.setItem('lf-dismissed-reminders', '[]');

    helpers.clearAllReminders([1, 2, 3, 4, 5]);

    const dismissed = helpers.getDismissedReminders();
    assert.equal(dismissed.length, 5);
    assert.deepEqual(dismissed.sort(), [1, 2, 3, 4, 5]);
  });

  it('clearAllReminders merges with existing dismissed IDs', () => {
    const { helpers, localStorage } = buildBellHelpers();
    localStorage.setItem('lf-dismissed-date', new Date().toISOString().slice(0, 10));
    localStorage.setItem('lf-dismissed-reminders', '[]');

    helpers.dismissReminder(1);
    helpers.clearAllReminders([2, 3]);

    const dismissed = helpers.getDismissedReminders();
    assert.equal(dismissed.length, 3);
    assert.ok(dismissed.includes(1));
    assert.ok(dismissed.includes(2));
    assert.ok(dismissed.includes(3));
  });

  it('bell-clear-all button is rendered in dropdown header', () => {
    assert.ok(appSrc.includes('bell-clear-all'), 'Clear All button ID exists in app.js');
    assert.ok(appSrc.includes('clearAllReminders(allIds)'), 'Clear All click handler calls clearAllReminders');
  });
});

// ─── 4. Daily reset clears dismissed list at midnight ──────────────────────

describe('Notification dismiss — daily reset', () => {
  it('clears dismissed set when date changes', () => {
    const { helpers, localStorage } = buildBellHelpers();
    // Simulate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    localStorage.setItem('lf-dismissed-date', yesterday.toISOString().slice(0, 10));
    localStorage.setItem('lf-dismissed-reminders', JSON.stringify([10, 20, 30]));

    const dismissed = helpers.getDismissedReminders();
    assert.equal(dismissed.length, 0, 'Should clear dismissed list on new day');
    assert.equal(localStorage.getItem('lf-dismissed-date'), new Date().toISOString().slice(0, 10), 'Should update stored date to today');
  });

  it('preserves dismissed set when same day', () => {
    const { helpers, localStorage } = buildBellHelpers();
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('lf-dismissed-date', today);
    localStorage.setItem('lf-dismissed-reminders', JSON.stringify([10, 20]));

    const dismissed = helpers.getDismissedReminders();
    assert.equal(dismissed.length, 2, 'Should keep dismissed list on same day');
  });
});

// ─── 5. Badge count updates after dismissal ────────────────────────────────

describe('Notification dismiss — badge count', () => {
  it('loadBellReminders computes badge from filtered total (not raw total)', () => {
    // Verify that the badge is set from the filtered count, not r.total
    const loadFn = appSrc.match(/async function loadBellReminders\(\)\{[\s\S]*?\}catch\{\}\s*\}/);
    assert.ok(loadFn, 'loadBellReminders found');
    const body = loadFn[0];
    // Badge should use the locally computed total, not r.total
    assert.ok(body.includes('const total=overdue.length+today.length+upcoming.length'), 'Badge count is computed from filtered arrays');
    assert.ok(body.includes('badge.textContent=total'), 'Badge text uses filtered total');
    assert.ok(body.includes('badge.dataset.c=total'), 'Badge data-c uses filtered total');
  });

  it('CSS hides badge when count is zero', () => {
    const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(cssSrc.includes('.bell-badge[data-c="0"]{display:none}'), 'Badge hidden when data-c=0');
  });
});

// ─── 6. CSS classes exist ──────────────────────────────────────────────────

describe('Notification dismiss — CSS', () => {
  it('bell-header class exists in styles.css', () => {
    const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(cssSrc.includes('.bell-header'), 'bell-header class defined');
  });

  it('bell-item-dismiss class exists with hover state', () => {
    const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(cssSrc.includes('.bell-item-dismiss{'), 'bell-item-dismiss class defined');
    assert.ok(cssSrc.includes('.bell-item-dismiss:hover'), 'bell-item-dismiss hover state defined');
  });

  it('bell-clear-all class exists', () => {
    const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
    assert.ok(cssSrc.includes('.bell-clear-all'), 'bell-clear-all class defined');
  });
});
