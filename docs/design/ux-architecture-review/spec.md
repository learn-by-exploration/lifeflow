# LifeFlow — UX & Architecture Review

> **Reviewer:** UX Designer + Software Architect  
> **Date:** 2026-03-18  
> **Scope:** Frontend SPA (`public/index.html` ~999 LOC), Backend API (`src/server.js` ~414 LOC)  
> **Status:** REVIEW COMPLETE

---

## 1. UX Audit — What Feels Wrong

### 1.1 Navigation & Flow

| Issue | Severity | Detail |
|-------|----------|--------|
| **No back button / undo** | High | Deleting a task, goal, or area is immediate and permanent — no confirmation on tasks, no undo anywhere. Area deletion has a `confirm()` but goals and tasks do not. One misclick = data loss. |
| **Breadcrumb is cosmetic, not functional beyond 2 levels** | Medium | Breadcrumb only renders for `area` and `goal` views. "Home" always sends you to My Day, not the previous location. There's no browser history integration (`pushState`) — the back button is useless. |
| **Sidebar area items have a hidden delete button that's too easy to hit** | High | The delete button (`.da`) replaces the count badge on hover. The hit target overlaps the click-to-navigate area. On fast mouseover, you could click delete instead of navigating. |
| **Goal-level view switching is invisible if you arrive from a different context** | Medium | The list/board tab strip (`#vt`) only shows on the `goal` view. A user on "All Tasks" or "Board" has no way to discover they can toggle views inside goals. |
| **No way to get to a goal from the global Board/All Tasks views** | Medium | Task cards in global views show goal/area labels but they're not clickable. Dead-end metadata — you see where a task belongs but can't navigate there. |
| **Calendar events are not interactive enough** | Medium | Clicking a calendar task pill (`.ctd`) does nothing. No click handler attached. You can see tasks but can't open, edit, or drag them. |

### 1.2 Missing Feedback

| Gap | Impact |
|-----|--------|
| **No loading states** | Every view does `await api.get(...)` then `.innerHTML = ...`. During the fetch, stale content sits on screen. On slow connections, the app feels frozen. No skeleton screens, no spinners, no optimistic updates. |
| **No success/error toasts** | Saving a task, adding a tag, deleting a subtask — zero feedback. The detail panel just closes. Did it save? The user has to visually scan the list to confirm. |
| **No empty state for search with zero results that guides action** | The search shows "No results for X" but doesn't suggest creating a task, checking spelling, or broadening the query. |
| **No indication of drag-and-drop capability** | Board columns accept drops and tasks are `draggable="true"` but there's no visual affordance — no grip handle, no cursor change, no "drag me" hint. |
| **No feedback when toggling "My Day"** | In the detail panel, checking "Add to My Day" triggers no indication that the task will appear in My Day. |

### 1.3 Accessibility Gaps

| Issue | WCAG Level |
|-------|------------|
| **No ARIA roles or landmarks** | The sidebar has no `role="navigation"`, the main area has no `role="main"`, modals have no `role="dialog"` or `aria-modal`. Screen readers see an undifferentiated div soup. |
| **Custom checkbox (`.tk`, `.stk`) not keyboard accessible** | These are `<div>` elements with click handlers. No `tabindex`, no `role="checkbox"`, no `aria-checked`, no keyboard event (`Space`/`Enter`). Completely invisible to keyboard and screen reader users. |
| **No focus trap in modals/overlays** | Search, Quick Capture, Area Modal, Goal Modal — all open as overlays but Tab key can escape behind them to the main content. |
| **No `aria-live` regions** | Dynamic content updates (task counts, badges, board columns) happen silently. Screen readers are never notified. |
| **Color is the only priority indicator** | Priority levels are distinguished by border color only (red, yellow, blue). The text labels exist in metadata but could be missed. Fails WCAG 1.4.1 (Use of Color). |
| **Contrast issues in some themes** | The "forest" theme uses `#81C784` text on `#0C1B0F` background for secondary text — likely passes, but `#4CAF50` as `--txd` on dark green backgrounds is borderline (~3.8:1). Needs audit per theme. |
| **No skip-to-content link** | |
| **No visible focus indicators beyond browser defaults** | Custom `:focus` styles only on inputs (border-color change). Buttons, nav items, cards have no focus ring. |

### 1.4 Mobile / Responsive

| Issue | Detail |
|-------|--------|
| **Sidebar has no collapse/toggle** | Fixed 256px sidebar with no hamburger menu, no media query breakpoint. On screens < 768px, the sidebar consumes ~40% of the viewport. |
| **`overflow: hidden` on body prevents mobile scroll recovery** | If the main content area's scrollable region gets stuck, the user has no escape hatch. |
| **Board columns don't stack on mobile** | The `.board` uses `overflow-x: auto` with `min-width: 260px` columns — fine on desktop, but on mobile you get tiny columns with horizontal scroll. Should stack vertically. |
| **FAB overlaps content** | `position: fixed; bottom: 28px; right: 28px` — on mobile this covers the last task card. No scroll padding to compensate. |
| **Touch targets too small** | Custom checkboxes are 18×18px, subtask checks are 14×14px. iOS Human Interface Guidelines require 44×44pt. Android Material suggests 48dp. These are untappable on mobile. |
| **No touch gestures** | No swipe-to-complete, no swipe-to-delete, no pull-to-refresh. Every interaction requires precise tapping. |

### 1.5 Information Density

| Issue | Detail |
|-------|--------|
| **Dashboard has no actionable items** | Stats show numbers but there's no "click to see these 5 overdue tasks" or "click to see Health area" — it's a read-only report with no drill-down. |
| **"All Tasks" is a flat dump** | No grouping options (by area, by goal, by priority, by due date). At 50+ tasks this becomes an infinite scroll wall. |
| **Tag colors are random** | Tags get assigned colors from `COLORS[allTags.length % COLORS.length]` — the Nth tag repeats the first's color. No semantic consistency. |

---

## 2. Architecture Review

### 2.1 Code Organization

| Problem | Impact |
|---------|--------|
| **Entire SPA in a single HTML file** | 999 lines mixing CSS, HTML, and JS with zero separation. Every change requires scrolling through a monolith. No component isolation, no module boundaries. |
| **CSS class names are cryptic abbreviations** | `.sb`, `.ni`, `.tk`, `.dp`, `.tc`, `.gb`, `.qa` — unreadable without a glossary. Will cause confusion for any new developer. |
| **Global mutable state everywhere** | `areas`, `goals`, `tasks`, `allTags`, `currentView`, `activeAreaId`, `activeGoalId`, `dpTask`, `dpTags`, `dpSubtasks`, `gbFilters`, `calY`, `calM`, `editingId`, `expandedTasks` — all top-level `let` variables. Any function can mutate anything. |
| **String-template HTML construction** | All rendering is `innerHTML = ` with template literals. This forces full re-renders on every interaction, destroys DOM state (scroll position, focus, expanded states), and is fragile to maintain. |
| **No event delegation** | After every render, dozens of `querySelectorAll(...).forEach(el => el.addEventListener(...))` calls are made. These listeners are re-created on every render, creating potential memory leaks if old DOM references linger. |

### 2.2 Performance Concerns

| Issue | Severity |
|-------|----------|
| **N+1 query pattern in `enrichTasks()`** | Every call to `enrichTask()` runs 2 SQL queries (tags + subtasks) per task. Loading "All Tasks" with 100 tasks = 200 extra queries. Should batch with JOINs and GROUP_CONCAT or a single query with post-processing. |
| **Full re-render on every state change** | Toggling a single checkbox re-fetches the entire task list from the API, re-renders the entire DOM, then re-attaches all event listeners. For a list of 50 tasks, this is ~50ms of DOM thrashing per click. |
| **No debounce on filter changes** | Board filter dropdowns trigger `renderGlobalBoard()` immediately on every `change` event. Each triggers a full API fetch + DOM rebuild. |
| **Search calls `api.get('/api/tasks/all')` as a fallback in `attachTE()`** | When clicking a checkbox on a task not in the local `tasks` array, it fetches ALL tasks just to find one. Should use a direct `/api/tasks/:id` endpoint (which doesn't exist). |
| **No API response caching** | Navigating from My Day → All Tasks → My Day fetches `/api/tasks/my-day` twice. No stale-while-revalidate, no in-memory cache. |

### 2.3 Security Gaps

| Issue | Risk |
|-------|------|
| **No CSRF protection** | The API has no CSRF tokens, no `SameSite` cookie attributes. Any page on localhost can make mutating requests. |
| **XSS via `escA()` used inconsistently** | The `esc()` function creates a text node (safe), and `escA()` does manual entity replacement. But there are places where `escA()` is used inside HTML attributes that could be exploited if a style attribute contained a crafted payload (e.g., `background:${escA(t.goal_color)}` — if `goal_color` contained `red;} .evil{background:url(evil)` it wouldn't break out of the style, but it's a fragile pattern). |
| **SQL LIKE injection edge case** | The search endpoint does `'%' + q.trim() + '%'` — the `%` and `_` SQL wildcards in user input are not escaped. Searching for `%` returns all tasks. Not a data breach but a functional bug. |
| **No rate limiting** | All endpoints are unprotected. A script could hammer `/api/tasks/all` or `/api/export` without throttling. |
| **No input length limits on server** | Task titles, notes, descriptions have no `maxlength` validation server-side. A POST with a 10MB title would be accepted. Only `express.json()` default limit (100kb) provides implicit protection. |
| **Export endpoint leaks all data to any client** | `/api/export` dumps the entire database as JSON with no authentication. |

### 2.4 State Management Anti-Patterns

| Pattern | Problem |
|---------|---------|
| **View state and data state are entangled** | `currentView`, `activeAreaId`, `activeGoalId` control both what's rendered and what data is fetched. Changing view triggers fetch + render in one atomic call. No separation of "what should I show" vs "what data do I have." |
| **`editingId` serves double duty** | Used as the editing target for both Area modals and Goal modals. If both could be open (they can't currently, but refactoring could break this assumption), state would collide. |
| **`dpSubtasks` is a disconnected copy** | When the detail panel opens, subtasks are copied into `dpSubtasks`. Edits to subtasks mutate this array but the list view doesn't know. On panel close + save, the entire view re-renders from API to reconcile. |
| **`expandedTasks` Set survives re-renders but DOM doesn't** | The `expandedTasks` Set tracks which tasks have expanded subtask sections, but the DOM is rebuilt from scratch on each render, so it relies on re-checking the set during HTML generation. |

### 2.5 API Design Issues

| Issue | Recommendation |
|-------|---------------|
| **No single-task GET endpoint** | `/api/tasks/:id` for GET doesn't exist. The code works around this by fetching ALL tasks and filtering client-side. |
| **Inconsistent resource nesting** | Tasks are created under `/api/goals/:goalId/tasks` but updated at `/api/tasks/:id`. Subtasks are under `/api/tasks/:taskId/subtasks` but updated at `/api/subtasks/:id`. This mixed nesting is confusing. |
| **No pagination** | `/api/tasks/all` returns everything. At 1000+ tasks this becomes a multi-MB payload. |
| **No PATCH semantics** | PUT endpoints use `COALESCE(?, existing)` to simulate partial updates, but the HTTP method semantics are wrong. Should be PATCH for partial updates. |
| **Board endpoint constructs SQL from query params** | While parameterized, the dynamic WHERE clause construction in `/api/tasks/board` is a maintenance liability and increases SQL injection surface area. |

---

## 3. UX Feature Proposals

### F01: Toast Notification System
**One-line:** Ephemeral feedback toasts for create/update/delete actions with undo support.  
**Problem:** Users get zero feedback after mutations. "Did my save work?" requires scanning the list.  
**Priority:** P0 | **Complexity:** S

### F02: Skeleton Loading States
**One-line:** Animated placeholder shapes during data fetches, matching the layout of the incoming content.  
**Problem:** Views show stale content during loading, creating a jarring flash when new content replaces old.  
**Priority:** P0 | **Complexity:** S

### F03: Inline Undo on Destructive Actions
**One-line:** Replace `confirm()` dialogs with a 5-second undo toast. Soft-delete on the backend with TTL.  
**Problem:** `confirm("Delete this?")` interrupts flow and trains users to click "OK" reflexively. Delete-then-undo is faster and safer.  
**Priority:** P0 | **Complexity:** M

### F04: Collapsible Sidebar with Mobile Drawer
**One-line:** Sidebar collapses to icons on medium screens, becomes an off-canvas drawer on mobile with hamburger toggle.  
**Problem:** Fixed 256px sidebar steals 30-40% of mobile viewport. App is unusable on phones.  
**Priority:** P0 | **Complexity:** M

### F05: First-Run Onboarding Coach
**One-line:** A 4-step guided overlay on first visit: create an area → create a goal → add a task → try quick capture.  
**Problem:** New users land on an empty My Day with no guidance. They don't know the hierarchy (Area → Goal → Task) or that Quick Capture exists.  
**Priority:** P1 | **Complexity:** M

### F06: Contextual Empty States with CTAs
**One-line:** Every empty view gets an illustration, explanation, and a primary action button specific to that view.  
**Problem:** Current empty states say "No tasks yet" with tiny gray text. They should say "You're on My Day — star a task or set one due today" with a button.  
**Priority:** P1 | **Complexity:** S

### F07: Keyboard-First Task Creation (Inline Add)
**One-line:** Pressing `Enter` at the end of a task list inserts a new inline editable row without opening a modal.  
**Problem:** Quick Add input at top requires mouse targeting. Power users want to add tasks as fast as typing a text file — linear, continuous, keyboard-only.  
**Priority:** P1 | **Complexity:** M

### F08: Drag-and-Drop with Visual Affordances
**One-line:** Grip handle icon on task cards, drop zone highlighting with insertion indicator (not just column border), and reorder within columns.  
**Problem:** Drag is silently supported on Board but has no visual language. Users don't know they can drag. Can't reorder within a column.  
**Priority:** P1 | **Complexity:** M

### F09: Swipe Gestures on Mobile
**One-line:** Swipe right to complete, swipe left to reveal delete/snooze actions. Spring-loaded physics animation.  
**Problem:** Every interaction on mobile requires opening a panel or hitting a 14px checkbox. Native mobile apps set the expectation of swipe actions.  
**Priority:** P1 | **Complexity:** L

### F10: Task Quick-Edit Popover
**One-line:** Right-click or long-press a task card to get a compact popover with status, priority, due date, and tags — without opening the full detail panel.  
**Problem:** Changing a task's priority currently requires: click card → detail panel slides in → scroll to priority dropdown → change → click save → panel closes. That's 5 steps for a 1-field change.  
**Priority:** P1 | **Complexity:** M

### F11: Animated View Transitions
**One-line:** Crossfade between views, slide-in for detail panel, scale-up for modals, and stagger-in for card lists.  
**Problem:** Every view change is an instant `innerHTML` swap — jarring, disorienting, and makes the app feel like plain HTML refresh. The detail panel has a CSS transition but nothing else does.  
**Priority:** P1 | **Complexity:** M

### F12: URL Routing with History API
**One-line:** Each view/area/goal gets a URL (`/board`, `/area/3`, `/area/3/goal/7`). Browser back/forward works. Deep links shareable.  
**Problem:** The app is a single URL (`/`). Refreshing always resets to My Day. Can't share a link to a specific goal. Browser back button does nothing.  
**Priority:** P1 | **Complexity:** M

### F13: Progressive Subtask Disclosure
**One-line:** Subtasks collapsed by default with a count chip. Expanding animates open with a spring curve. Inline add on expand.  
**Problem:** Currently subtasks are hidden behind a click but the expand/collapse has no animation — it pops in/out via `display: none/block`. Feels broken.  
**Priority:** P2 | **Complexity:** S

### F14: Due Date Smart Suggestions
**One-line:** When setting a due date, offer "Today", "Tomorrow", "Next Monday", "Next Week", "In 2 Weeks" quick chips before the date picker.  
**Problem:** Opening a date picker and navigating a calendar just to set "tomorrow" is heavyweight. Most task due dates are relative and predictable.  
**Priority:** P2 | **Complexity:** S

### F15: Compact/Comfortable Density Toggle
**One-line:** A density control (compact/default/comfortable) that adjusts card padding, font size, and spacing globally via CSS custom properties.  
**Problem:** Information density is fixed. Power users with 100+ tasks want dense lists. New users with 5 tasks want breathable cards.  
**Priority:** P2 | **Complexity:** S

### F16: Focus Mode / Zen View
**One-line:** A distraction-free mode showing only "In Progress" tasks with a centered single-column layout, large type, and no sidebar.  
**Problem:** Users doing deep work don't need to see their entire life management system. They need to see the 1-3 things they're doing RIGHT NOW.  
**Priority:** P2 | **Complexity:** S

### F17: Natural Language Task Input
**One-line:** Parse "Buy groceries tomorrow #shopping !high" into title, due date, tag, and priority automatically from the quick add input.  
**Problem:** Creating a task with metadata requires opening Quick Capture and filling 4 fields. Power users expect to express intent in a single text string (Todoist-style).  
**Priority:** P2 | **Complexity:** M

### F18: Recurring Task Visual Indicator + Next Occurrence
**One-line:** Recurring tasks show a cycle icon with "Repeats weekly" and auto-generate the next occurrence when completed.  
**Problem:** Recurring tasks have a database field but completing one doesn't spawn the next occurrence. The recurrence is stored but non-functional.  
**Priority:** P1 | **Complexity:** M

### F19: Notification / Reminder System
**One-line:** Browser notification permission request + scheduled reminders for tasks due today and overdue. Configurable per-task snooze.  
**Problem:** Due dates exist but there's no reminder mechanism. The user has to open the app and check. Defeats the purpose of due dates.  
**Priority:** P2 | **Complexity:** L

### F20: Drag-to-Calendar Scheduling
**One-line:** Drag a task from the sidebar or a list view onto a calendar date to set its due date visually.  
**Problem:** Calendar view is read-only. You can see tasks on dates but can't schedule from it. The visual metaphor (calendar) doesn't let you do the calendar thing (schedule).  
**Priority:** P2 | **Complexity:** L

---

## 4. Design System Recommendations

### 4.1 Missing CSS Variables / Tokens

Currently defined tokens are background layers (`--bg`, `--bg-s`, `--bg-c`, `--bg-h`), text colors (`--tx`, `--tx2`, `--txd`), semantic colors (`--brand`, `--ok`, `--err`, `--warn`), and two radius values (`--r`, `--rs`).

**Missing tokens that should be added:**

```css
/* Spacing scale */
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;

/* Typography */
--font-size-xs: 10px;
--font-size-sm: 12px;
--font-size-md: 13px;
--font-size-lg: 15px;
--font-size-xl: 17px;
--font-size-2xl: 20px;
--font-size-display: 28px;

--line-height-tight: 1.2;
--line-height-normal: 1.5;
--line-height-relaxed: 1.7;

--font-weight-light: 300;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Shadows (layered for elevation) */
--shadow-sm: 0 1px 2px rgba(0,0,0,.1);
--shadow-md: 0 4px 12px rgba(0,0,0,.15);
--shadow-lg: 0 8px 32px rgba(0,0,0,.25);
--shadow-xl: 0 16px 48px rgba(0,0,0,.35);

/* Animation */
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 350ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);

/* Z-index scale */
--z-dropdown: 10;
--z-sticky: 20;
--z-fab: 30;
--z-panel: 50;
--z-overlay: 100;
--z-modal: 200;
--z-toast: 300;

/* Focus ring */
--focus-ring: 0 0 0 2px var(--bg), 0 0 0 4px var(--brand);

/* Sidebar */
--sidebar-width: 256px;
--sidebar-collapsed-width: 60px;

/* Touch target minimum */
--touch-target-min: 44px;
```

### 4.2 Typography Scale Improvements

Current state: Font sizes are hardcoded throughout — `10px`, `11px`, `12px`, `13px`, `15px`, `17px`, `20px`, `28px`. There's no rhythm.

**Recommended type scale** (based on 1.2 minor third ratio from 13px base):

| Token | Size | Use |
|-------|------|-----|
| `--text-xs` | 10px | Badges, timestamps, meta labels |
| `--text-sm` | 12px | Body small, form labels, secondary info |
| `--text-md` | 13px | Body default, task titles, input text |
| `--text-lg` | 15px | Panel headings, modal titles |
| `--text-xl` | 17px | Brand name, section headers |
| `--text-2xl` | 20px | Page titles |
| `--text-display` | 28px | Dashboard stats numbers |

All 8 themes use the same type scale — only colors change. This is correct and should be preserved.

### 4.3 Component Patterns to Extract

The following repeating patterns should become named, consistent CSS classes or web components:

| Component | Occurrences | Notes |
|-----------|-------------|-------|
| **Icon Button** | ~15+ instances | Inconsistent: some use `<button class="material-icons-round">`, others `<button><span class="material-icons-round">`. Need a `.btn-icon` class with consistent size, padding, hover state, and focus ring. |
| **Badge / Chip** | Tags, counts, priority labels | `.badge` exists for nav counts. `.tag` exists for task tags. Priority labels are inline spans. Unify into `.chip` with variants. |
| **Card** | Task card, goal card, dashboard stat, area stat | Each has its own CSS (`.tc`, `.gc`, `.ds-card`, `.ds-area`). Extract `.card` base with `--card-pad`, `--card-radius` tokens. |
| **Form Field** | Repeated in modal, detail panel, quick capture | Same `label + input` pattern with identical styling duplicated in `.md input`, `.dp-body input`, `.qc-box input`. Extract `.field` group. |
| **Overlay / Backdrop** | Modal, search, quick capture, keyboard help | Four different overlay classes (`.mo`, `.sr-ov`, `.qc-ov`, `.kb-ov`) with near-identical styles. Extract `.overlay` base. |
| **Progress Bar** | Goal progress, dashboard overall, area progress, subtask progress | Four different implementations. Extract `.progress` with `--progress-height`, `--progress-color` variants. |
| **Section Label** | `.sl` used everywhere | Already extracted but the count badge inside it (`.c`) has inconsistent spacing. |
| **Empty State** | Generated by `emptyS()` function | Already a pattern — promote to a documented component. |

### 4.4 Animation / Transition Standards

**Current state:** The only animated element is the detail panel slide-in (`right .25s`). Everything else is instant.

**Recommended animation standards:**

```css
/* Standard transitions */
.transition-colors { transition: color var(--duration-fast), background var(--duration-fast), border-color var(--duration-fast); }
.transition-transform { transition: transform var(--duration-normal) var(--ease-out); }
.transition-all { transition: all var(--duration-normal) var(--ease-out); }

/* Entry animations */
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes slide-in-right { from { transform: translateX(100%); } to { transform: none; } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: none; } }
@keyframes stagger-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* Usage rules:
   - Overlays: fade-in 200ms
   - Modals: scale-in 250ms ease-out  
   - Side panels: slide-in-right 250ms ease-out
   - Card lists: stagger-in 150ms ease-out, stagger children by 30ms
   - Toasts: slide-up 200ms ease-spring
   - Checkboxes: scale 100ms + color 150ms
   - View transitions: crossfade 200ms
*/
```

**Checkbox completion micro-interaction spec:**
1. Circle border animates from gray to green (150ms)
2. Fill floods in from center (100ms, ease-out)
3. Checkmark draws in with a stroke animation (200ms)
4. Task title gets `text-decoration: line-through` with a left-to-right wipe (300ms)
5. After 800ms delay, completed task fades down to 60% opacity and slides down in the list

---

## 5. Priority Summary

### Immediate (P0) — Ship-blocking UX gaps
1. **F01** Toast notifications (S)
2. **F02** Skeleton loading states (S)
3. **F03** Undo on destructive actions (M)
4. **F04** Responsive sidebar (M)

### Near-term (P1) — Significant experience improvements
5. **F05** Onboarding coach (M)
6. **F06** Contextual empty states (S)
7. **F07** Inline keyboard task creation (M)
8. **F08** Drag-and-drop affordances (M)
9. **F09** Mobile swipe gestures (L)
10. **F10** Quick-edit popover (M)
11. **F11** View transition animations (M)
12. **F12** URL routing + history (M)
13. **F18** Functional recurring tasks (M)

### Future (P2) — Polish and power-user features
14. **F13** Subtask progressive disclosure animation (S)
15. **F14** Due date smart suggestions (S)
16. **F15** Density toggle (S)
17. **F16** Focus mode (S)
18. **F17** Natural language input (M)
19. **F19** Browser notifications (L)
20. **F20** Drag-to-calendar scheduling (L)

### Architecture — Do alongside features
- Add `GET /api/tasks/:id` endpoint
- Batch N+1 queries in `enrichTasks()` 
- Add pagination to list endpoints
- Implement soft deletes
- Add ARIA roles, keyboard navigation, focus traps
- Split monolithic HTML into modules (consider Lit, Svelte, or even vanilla ES modules)
