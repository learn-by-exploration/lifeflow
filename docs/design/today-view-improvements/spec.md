# Today View Improvements — Design Spec

> **Status:** Draft  
> **Date:** 2 April 2026  
> **Scope:** Frontend-only changes (`public/app.js`, `public/styles.css`)  
> **No new API endpoints required**

---

## 1. Current Behavior

### Data Sources

The Today view (`renderToday()`, app.js line 468) makes 6 parallel API calls:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/tasks/my-day` | Tasks with `my_day=1 OR due_date=date('now')` — **includes done tasks** |
| `GET /api/tasks/overdue` | Tasks with `due_date < date('now') AND status != 'done'` |
| `GET /api/stats` | Progress metrics (total, done, overdue, focus minutes) |
| `GET /api/stats/streaks` | Current streak count |
| `GET /api/habits` | Habit list for habits strip |
| `GET /api/stats/balance` | Area balance alerts |

### Rendered Sections (List tab, top to bottom)

1. **Greeting + date + task count**
2. **Stats bar** — progress ring, done/total, focus minutes, streak, overdue count
3. **Tab toggle** — List | Timeline
4. **Hint card** — keyboard shortcut tip
5. **Balance alert** — area imbalance warning (once per day)
6. **Overdue section** — tasks past due date (⚠️ header)
7. **To Do section** — pending my-day and due-today tasks
8. **Done section** — completed tasks (controlled by `appSettings.showCompleted`, defaults to showing)
9. **What's Next?** — suggested tasks when <3 pending
10. **Daily review banner** — appears after 6pm
11. **Habits strip** — habit checkboxes

### Task Card (`tcHtml()`)

Each card renders: checkbox, title, due date badge, priority flag, assigned user, recurring icon, blocked indicator, time estimate, tags, list badge, goal+area context, subtask progress bar, expandable subtask list, action buttons (reschedule, focus timer, edit, delete), quick action row (priority cycle, date, my day, skip, edit).

---

## 2. Problems Identified

### Problem A: Done tasks shown by default, confusing criteria

The `/api/tasks/my-day` SQL has no status filter — it returns ALL tasks matching `my_day=1 OR due_date=today`, including completed ones. The frontend splits them:

```javascript
const p = t.filter(x => x.status !== 'done');  // → "To Do"
const d = t.filter(x => x.status === 'done');  // → "Done"
```

The "Done" section renders when `appSettings.showCompleted !== 'false'` — which defaults to showing. Issues:
- Users don't understand why completed tasks reappear in Today
- The setting to hide them is buried in Settings → General, not discoverable
- No middle ground between "show everything" and "hide completely"

### Problem B: No minimal/focused view option

The Today view is information-dense: stats bar, habits strip, balance alerts, hint cards, review banners, suggestion cards, plus full task cards with all metadata badges and action buttons. There is no way to strip the view down to just "what do I need to do right now?"

---

## 3. Multi-Stakeholder Review

### 3.1 Product Manager

**Done tasks default:** Hide by default. The primary purpose of the Today view is _action orientation_ — "what should I work on now?" Completed tasks satisfy a review need, not an action need. They belong behind a disclosure.

**Current criteria (my_day OR due_date=today):** Correct. This serves two user intents: (1) "I explicitly flagged this for today" and (2) "this is due today and I shouldn't forget." No change needed.

**View modes:** Yes, add a Focus mode. This is low-effort, high-differentiation. Today views in Todoist and TickTick are fixed layouts — offering a minimal mode creates a premium, intentional-planning feel.

**KPIs to track:**
- Task completion rate (should increase with focus mode — fewer distractions)
- Time-to-first-completion (should decrease if users aren't overwhelmed on open)
- Focus mode adoption rate (% of sessions using it)
- Toggle frequency (if users switch constantly, the default isn't right)

**Recommendation:** Ship both changes together. Done-task collapsing removes noise; Focus mode provides the escape hatch for users who want even less.

### 3.2 UX/Design Lead

**Information density:** The Today view is doing too much. Eleven sections is closer to a dashboard than a task list. The critical path — "see tasks → pick one → work on it" — competes with stats, habits, suggestions, and balance alerts. The density is a problem, but removing elements outright would break workflows for users who rely on them. A view mode toggle solves this by letting users choose their density level.

**Focus mode design:**
- Show: task title + checkbox + priority color strip (left border). Nothing else.
- Hide: stats bar, habits strip, balance alert, hint card, review banner, What's Next suggestions, all metadata badges (due date, tags, assigned user, recurring icon, time estimate, subtask bar), action buttons, quick action row.
- Keep: greeting/date (one line, provides temporal orientation), overdue section (safety net — you must never accidentally ignore overdue tasks), tab toggle bar (so you can switch back).

**Toggle placement:** Extend the existing tab bar. Currently: `List | Timeline`. New: `List | Focus | Timeline`. This is discoverable, consistent, and requires no new UI chrome. The active tab stores in `todayTab` (already exists).

**Mobile:** Focus mode is _especially_ valuable on mobile where the full Today view requires significant scrolling before reaching the task list. Focus mode puts tasks front and center.

**Done tasks interaction:** Collapse by default — show "Done (N)" header, click to expand. This preserves the motivational "I did stuff" signal without polluting the action list. The collapsed header costs 1 line; expanded done tasks look the same as today.

### 3.3 Life Coach / Productivity Expert

**Done task visibility:** The research is mixed:
- **Pro (showing):** Progress visibility increases motivation (Teresa Amabile's "Progress Principle"). Seeing completed tasks reinforces a sense of accomplishment.
- **Con (showing):** Completed items alongside pending ones create decision fatigue. The Ivy Lee Method advises focusing only on what's ahead, never looking back during work hours.

**Verdict:** Collapse but don't hide. A "Done (5)" header satisfies the progress signal without interleaving completed items with actionable ones. Users who need the dopamine hit can expand.

**Overdue tasks:** Showing them is correct but the framing matters. The current "⚠️ Overdue" with red styling creates anxiety. A better frame: "Carry forward (3)" — implies these are items to reschedule or complete, not evidence of failure. However, this is a naming/styling change beyond the current scope; keep the current overdue section for now.

**Healthy daily view:** The Ivy Lee Method (1918, still effective) recommends exactly 6 tasks, prioritized, worked sequentially. Focus mode aligns with this — a simple list, no distractions, work from top to bottom. The full Today view aligns more with a "daily dashboard" pattern (GTD daily review). Both are valid; the user should choose.

**Focus mode validation:** Strong alignment with "single-tasking" philosophy. Deep Work (Cal Newport), Zen To Done (Leo Babauta), and The ONE Thing (Gary Keller) all advocate reducing visual noise to enable concentration. Focus mode serves this audience directly.

### 3.4 Sales/Marketing

**First impressions:** New users opening the Today view for the first time see an overwhelming amount of information — especially if they've imported from Todoist/Trello and have many tasks. Focus mode as the _default for new users_ (or as an onboarding option) would dramatically improve first-app-open experience.

**Competitive differentiation:**
- **Todoist:** Has "Today" and "Upcoming" — no minimal mode option.
- **TickTick:** Has a clean Today view but still shows all metadata. No toggle.
- **Things 3:** The gold standard of minimal design, but fixed — no user control over density.
- **LifeFlow opportunity:** Adjustable density via tab toggle ("you choose how much you see") is unique. Marketing angle: "The only planner that adapts to your focus style."

**Target audiences:**
- Minimalism/productivity audience (Cal Newport, Ali Abdaal followers) — strong demand for clean interfaces
- ADHD community — reducing visual noise is a genuine accessibility need, not just aesthetic preference
- Executive/professional users — want "what do I do next?" not a data dashboard

**Recommendation:** Highlight Focus mode in marketing materials. Consider making it the default and letting users graduate to full mode when they want more data.

### 3.5 End User (Power User)

**What I want when I open the app:** It depends on the moment:
- **Morning planning:** Full view — I want stats, habits, suggestions, the whole picture.
- **During work:** Just the list. Let me check things off without getting pulled into stats or suggestions.
- **End of day:** Full view again — review what I did, log habits, reflect.

**Metadata noise:** Most metadata is noise _during execution_ but useful _during planning_. Due dates, tags, assigned users — I set those up during planning. When I'm working, I just need the task title and a checkbox.

**Toggle preference:** Tab bar is perfect — I already understand List/Timeline, adding Focus is natural. I want it to persist between renders (don't reset to List every time). I'd also want a keyboard shortcut to toggle between List and Focus quickly.

**Done tasks:** Collapse by default, expand on click. I like seeing "Done (7)" because it tells me I'm making progress, but I don't need to scroll past 7 completed task cards to reach my to-do section.

---

## 4. Design: Change A — Done Tasks Behavior

### Decision

**Collapse by default.** Show a "Done (N)" section header that users can click to expand. This satisfies:
- Product: action-oriented default, review on demand
- UX: 1 line instead of N full cards, reduces scroll
- Productivity: progress signal preserved without decision fatigue
- User: persistent per-render, not a permanent setting change

### Implementation

**Modify the Done section rendering in `renderToday()`** (around line 543):

Current:
```javascript
if(d.length && appSettings.showCompleted !== 'false') {
  h += '<div class="sl" style="color:var(--ok)">Done <span class="c">' + d.length + '</span></div>';
  d.forEach(tk => h += tcHtml(tk, true));
}
```

New:
```javascript
if(d.length && appSettings.showCompleted !== 'false') {
  const doneExpanded = sessionStorage.getItem('today-done-expanded') === '1';
  h += `<div class="sl today-done-toggle" style="color:var(--ok);cursor:pointer;user-select:none">
    <span class="material-icons-round" style="font-size:14px;vertical-align:middle;transition:transform .2s">${doneExpanded ? 'expand_more' : 'chevron_right'}</span>
    Done <span class="c">${d.length}</span></div>`;
  h += `<div class="today-done-list" style="${doneExpanded ? '' : 'display:none'}">`;
  d.forEach(tk => h += tcHtml(tk, true));
  h += '</div>';
}
```

**Wire the toggle** (in the event wiring section after render):
```javascript
c.querySelectorAll('.today-done-toggle').forEach(el => el.addEventListener('click', () => {
  const list = el.nextElementSibling;
  const icon = el.querySelector('.material-icons-round');
  const isOpen = list.style.display !== 'none';
  list.style.display = isOpen ? 'none' : '';
  icon.textContent = isOpen ? 'chevron_right' : 'expand_more';
  sessionStorage.setItem('today-done-expanded', isOpen ? '0' : '1');
}));
```

### State Persistence

- **Session-scoped** via `sessionStorage.getItem('today-done-expanded')` — collapsed by default, expands survive re-renders within a browser session but reset on new session.
- The `appSettings.showCompleted` setting continues to work as the hard hide — if set to `'false'`, the Done section doesn't render at all.

### Behavior Matrix

| `showCompleted` setting | Done tasks exist? | Result |
|:-:|:-:|:--|
| `'true'` (default) | Yes | Collapsed "Done (N)" header, click to expand |
| `'true'` | No | Nothing rendered |
| `'false'` | Any | Nothing rendered (existing behavior) |

---

## 5. Design: Change B — Focus List Mode

### Decision

**Add a "Focus" tab to the existing tab bar.** The Today view tab toggle changes from `List | Timeline` to `List | Focus | Timeline`. Focus mode renders a minimal task list with maximum readability and minimum distraction.

### What Focus Mode Shows

1. **Greeting + date** (single line, compact)
2. **Overdue section** (if any — safety net, cannot be hidden)
3. **Task list** — each item rendered as:
   - Priority color left border (3px, using existing `p1`/`p2`/`p3` colors)
   - Checkbox (click to complete — same handler as full mode)
   - Task title (plain text, no metadata badges)
4. **Done count footer** — small "✓ N completed today" text at the bottom (subtle progress signal)

### What Focus Mode Hides

| Element | Reason |
|---------|--------|
| Stats bar | Planning, not execution |
| Habits strip | Separate concern |
| Balance alert | Planning, not execution |
| Hint card | Noise |
| What's Next suggestions | Distraction from current list |
| Daily review banner | End-of-day activity |
| Due date badge | Already committed to doing it today |
| Tags | Organizational, not actionable |
| Assigned user | Not relevant during solo execution |
| Recurring icon | Not relevant during execution |
| Blocked indicator | Still shows via task not being checkable (existing behavior) |
| Time estimate | Noise during execution |
| Subtask progress bar | Noise (but see note below) |
| Subtask expansion | Noise |
| Action buttons | Reschedule/edit/delete not needed in focus mode |
| Quick action row | Not needed |
| Goal/area context | Not needed |

**Note on subtasks:** If a task has subtasks, focus mode shows only the parent task title. Users who need subtask detail switch to List mode. This is intentional — focus mode is about "what's the next thing to do?" not "what are all the steps?"

### Focus Mode Task Card HTML

A new lightweight render function `tcFocusHtml(t)`:

```javascript
function tcFocusHtml(t) {
  const cls = ['tc-focus'];
  if (t.status === 'done') cls.push('done');
  if (t.priority === 3) cls.push('p3');
  else if (t.priority === 2) cls.push('p2');
  else if (t.priority === 1) cls.push('p1');
  return `<div class="${cls.join(' ')}" data-id="${t.id}">
    <div class="tk" data-id="${t.id}" role="checkbox" tabindex="0" aria-checked="${t.status === 'done'}" aria-label="Complete task"><span class="material-icons-round">check</span></div>
    <span class="tc-focus-title">${esc(t.title)}</span>
  </div>`;
}
```

### Focus Mode Rendering (inside `renderToday()`)

Add a new branch for `todayTab === 'focus'`:

```javascript
} else if (todayTab === 'focus') {
  // Overdue (safety net)
  if (overdue.length) {
    h += `<div class="sl" style="color:var(--err)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">warning</span> Overdue <span class="c">${overdue.length}</span></div>`;
    overdue.forEach(tk => h += tcFocusHtml(tk));
  }
  // Pending tasks
  const p = t.filter(x => x.status !== 'done');
  if (p.length) {
    p.forEach(tk => h += tcFocusHtml(tk));
  }
  // Compact done footer
  const doneCount = t.filter(x => x.status === 'done').length;
  if (doneCount) {
    h += `<div style="text-align:center;padding:12px;color:var(--txd);font-size:12px">✓ ${doneCount} completed today</div>`;
  }
  if (!p.length && !overdue.length) {
    h += `<div class="all-done-card"><span class="material-icons-round" style="font-size:48px;color:var(--ok)">celebration</span><h3 style="margin:8px 0 4px">All done! 🎉</h3></div>`;
  }
}
```

### Tab Bar Update

The tab toggle section in `renderToday()` adds the Focus button:

```javascript
h += `<div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--brd);padding-bottom:8px">
  <button class="btn-c today-tab${todayTab==='list'?' active':''}" data-ttab="list" style="...">
    <span class="material-icons-round" style="...">list</span>List</button>
  <button class="btn-c today-tab${todayTab==='focus'?' active':''}" data-ttab="focus" style="...">
    <span class="material-icons-round" style="...">center_focus_strong</span>Focus</button>
  <button class="btn-c today-tab${todayTab==='timeline'?' active':''}" data-ttab="timeline" style="...">
    <span class="material-icons-round" style="...">schedule</span>Timeline</button>
</div>`;
```

The existing `wireTodayTabs` handler already supports arbitrary tab values — it sets `todayTab = btn.dataset.ttab` and calls `renderToday()`. No wiring changes needed.

### CSS (additions to `styles.css`)

```css
/* Focus mode task card */
.tc-focus {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 2px;
  border-radius: var(--rs);
  border-left: 3px solid transparent;
  transition: background 0.15s;
}
.tc-focus:hover { background: var(--bg-s); }
.tc-focus.p1 { border-left-color: var(--p1-color, #3B82F6); }
.tc-focus.p2 { border-left-color: var(--p2-color, #F59E0B); }
.tc-focus.p3 { border-left-color: var(--p3-color, #EF4444); }
.tc-focus.done { opacity: 0.5; }
.tc-focus.done .tc-focus-title { text-decoration: line-through; }
.tc-focus-title {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### State Persistence

- `todayTab` already persists across re-renders within a session (it's a top-level `let` variable).
- To persist across page reloads, save to `localStorage`:
  ```javascript
  // On tab click:
  todayTab = btn.dataset.ttab;
  localStorage.setItem('todayTab', todayTab);
  renderToday();
  
  // On init:
  let todayTab = localStorage.getItem('todayTab') || 'list';
  ```

### Keyboard Shortcut

Add `F` as a shortcut to toggle between List and Focus modes (the `?` help panel already lists view shortcuts):

```javascript
// In the global keydown handler:
if (key === 'f' && !isInput && currentView === 'myday') {
  todayTab = todayTab === 'focus' ? 'list' : 'focus';
  localStorage.setItem('todayTab', todayTab);
  renderToday();
}
```

---

## 6. Files Changed

| File | Changes |
|------|---------|
| `public/app.js` | `renderToday()`: add Focus tab button, focus mode rendering branch, `tcFocusHtml()` function, done-section collapse logic + toggle wiring, `todayTab` localStorage persistence, `F` keyboard shortcut |
| `public/styles.css` | `.tc-focus`, `.tc-focus-title`, priority border color classes |

No backend changes. No new API endpoints. No database changes.

---

## 7. Testing

### Manual Test Cases

1. **Done collapse — default state:** Open Today with done tasks present. Verify "Done (N)" header shows, task cards are hidden. Click header → cards expand. Click again → collapse.
2. **Done collapse — session persistence:** Expand done section. Navigate away, come back. Verify it remains expanded within same browser session.
3. **Done collapse — showCompleted=false:** Set `showCompleted` to `'false'` in settings. Verify Done section doesn't render at all (no header, no cards).
4. **Focus mode — rendering:** Click Focus tab. Verify only greeting, overdue section, and minimal task cards appear. No stats bar, habits, badges, etc.
5. **Focus mode — task completion:** In Focus mode, click a task checkbox. Verify it completes with animation and toast. Verify undo works.
6. **Focus mode — overdue safety net:** Have overdue tasks. Switch to Focus mode. Verify overdue section appears.
7. **Focus mode — all done:** Complete all tasks in Focus mode. Verify "All done!" celebration appears.
8. **Focus mode — persistence:** Select Focus tab, reload page. Verify Focus mode is still selected.
9. **Focus mode — keyboard shortcut:** Press `F` while in Today view. Verify toggle between List and Focus.
10. **Tab bar — three tabs:** Verify List, Focus, Timeline tabs all render correctly, active state highlights properly.
11. **Mobile — focus mode:** Test on mobile viewport. Verify Focus mode renders cleanly, tasks are tappable, no horizontal overflow.

### Automated Tests

Existing `frontend-units.test.js` covers rendered HTML structure — add cases for:
- Focus tab button presence in Today view HTML
- `tcFocusHtml()` output structure (priority class, title escaping, checkbox)
- Done section collapsed state by default (`.today-done-list` has `display:none`)
- Done toggle interaction (expand/collapse)

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `F` shortcut conflicts with text input | Low — guard ensures `!isInput` check | Existing pattern used by other shortcuts |
| Focus mode confuses users unfamiliar with it | Low — tab bar makes it discoverable, not forced | Tab label + icon are self-explanatory |
| Done collapse breaks undo flow | Medium — if user completes a task, it moves to collapsed Done section | Undo via toast still works regardless of visibility |
| `tcFocusHtml` doesn't call `attachTE()` properly | Medium — completion handlers must bind to `.tk` elements | `attachTE()` uses `document.querySelectorAll('.tk')` which covers all task checkboxes |

---

## 9. Out of Scope

- Renaming "Overdue" to "Carry Forward" (separate design decision)
- Making Focus mode the default for new users (needs onboarding flow changes)
- Drag-and-drop reorder in Focus mode (keeps scope minimal)
- Focus mode for non-Today views
- New API endpoints or backend changes
