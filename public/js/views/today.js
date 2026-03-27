/**
 * Today View Module — extracted from app.js renderToday().
 *
 * This module provides the Today view rendering logic as an ES module export.
 * It accepts all dependencies as parameters to avoid global variable access.
 *
 * Usage in app.js:
 *   import { renderToday } from './js/views/today.js';
 *   // In the view router:
 *   case 'myday': await renderToday($('ct'), deps); break;
 *
 * Progressive migration: The main renderToday() in app.js currently delegates
 * to the global function. As more views are extracted, app.js will shrink and
 * this module will contain the full implementation.
 */

/**
 * Build the "stats bar" HTML for the Today view header.
 * @param {object} stats - Dashboard stats { done, total, focusMinutes }
 * @param {object} streakData - Streak data { streak }
 * @param {number} overdueCount - Number of overdue tasks
 * @param {Function} progressRingSvg - SVG ring generator
 * @param {Function} streakEmoji - Streak emoji function
 * @returns {string} HTML string
 */
export function buildStatsBar(stats, streakData, overdueCount, progressRingSvg, streakEmoji) {
  const pct = stats.total ? Math.round(stats.done / stats.total * 100) : 0;
  const sEmoji = streakEmoji(streakData.streak || 0);
  let h = `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
    <div class="today-stat">${progressRingSvg(pct)}</div>
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--ok)">check_circle</span>${stats.done || 0}/${stats.total || 0} done</div>
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--brand)">timer</span>${stats.focusMinutes || 0}min focus</div>
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--warn)">local_fire_department</span>${sEmoji ? sEmoji + ' ' : ''}${streakData.streak || 0} streak</div>
    ${overdueCount ? `<div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--err)">warning</span>${overdueCount} overdue</div>` : ''}
  </div>`;
  return h;
}

/**
 * Build the greeting header for Today view.
 * @param {Function} getGreeting - Greeting function
 * @param {string} dateStr - Formatted date string
 * @param {number} pendingCount - Number of pending tasks
 * @returns {string} HTML string
 */
export function buildGreeting(getGreeting, dateStr, pendingCount) {
  return `<div style="font-size:15px;font-weight:600;margin-bottom:4px">${getGreeting()}</div>
    <div style="font-size:13px;color:var(--tx2);margin-bottom:10px">${dateStr} · ${pendingCount} tasks today</div>`;
}

/**
 * Placeholder for the full renderToday extraction.
 * Currently, app.js still owns the main renderToday function.
 * This export allows progressive migration.
 */
export async function renderToday(container, deps) {
  // Progressive migration: this will contain the full renderToday logic
  // once all dependencies are passed via the deps object.
  // For now, call the global renderToday if available.
  if (typeof deps.renderTodayGlobal === 'function') {
    return deps.renderTodayGlobal();
  }
}
