---
status: Implemented
baseline: Phase 7
---

# Phase 7 — Search, Scheduling & Data Portability

> **Status:** Draft  
> **Created:** 2026-03-21  
> **Phase:** 7 of N  
> **Current state:** 1790 LOC server, 4040 LOC frontend, 326 tests, ~90 API routes, 19 tables

---

## Problem Statement

After six phases, LifeFlow has deep task management (hierarchy, views, automation, habits, notes, reviews). The friction points that remain are **finding things** (search only covers task titles/notes, not comments or notes), **deciding what to work on next** (planner suggests but doesn't learn), **moving data in/out** (JSON export exists but no standard format), and **physical reordering** (drag works in weekly view but not in My Day or All Tasks). These are the gaps between "feature-complete" and "daily-driver."

---

## Feature 1: Global Unified Search (Impact: ★★★★★)

### What

A single search index across tasks, notes, comments, subtasks, tags, and goals. Accessed via the existing `Ctrl+K` command palette or a dedicated `/` shortcut.

### Why

Current search (`GET /api/tasks/search`) only hits `tasks.title`, `tasks.note`, and `subtasks.title` with LIKE queries. Users can't find a comment they left, a note they wrote, or a goal by description. As the database grows past hundreds of tasks, this becomes the #1 daily friction point.

### Technical Approach

**Backend:**
- Add SQLite FTS5 virtual table: `search_index(entity_type, entity_id, parent_id, title, body)`
- Populate on startup via a rebuild trigger from existing tables
- Keep in sync via `AFTER INSERT/UPDATE/DELETE` triggers on `tasks`, `notes`, `task_comments`, `subtasks`, `goals`
- New endpoint: `GET /api/search?q=term&type=all|task|note|comment|goal` — returns ranked results with snippets via `highlight()` and `snippet()` FTS5 functions
- Supports prefix queries (`plan*`), phrase queries (`"sprint planning"`), and boolean (`sprint NOT retro`)
- Results include `entity_type`, `entity_id`, `parent_id` (for navigation), `title`, `snippet`, `rank`

**Frontend:**
- Extend command palette overlay: when in search mode, show results grouped by type (Tasks, Notes, Goals, Comments)
- Each result is clickable → navigates to the entity (task detail panel, note editor, goal view)
- Debounced input (200ms), results appear incrementally
- `/` keyboard shortcut opens search (in addition to existing `Ctrl+K`)

**Schema:**
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type,    -- 'task', 'note', 'comment', 'subtask', 'goal'
  entity_id,      -- the row's actual ID
  parent_id,      -- task_id for subtask/comment, goal_id for task, area_id for goal
  title,
  body,
  content=''      -- external content mode, we manage sync
);
```

**Test plan:** ~12 tests — FTS rebuild, insert/update/delete sync, multi-type search, snippet output, prefix/phrase queries, type filter, empty results, special characters.

**Estimated scope:** ~80 LOC server, ~60 LOC frontend, ~80 LOC tests

---

## Feature 2: Smart Day Planning Assistant (Impact: ★★★★☆)

### What

Upgrade the existing planner suggest endpoint from a static query into an intelligent daily planning flow that considers workload balance, recent completion velocity, energy patterns, and focus session history.

### Why

The current `GET /api/planner/suggest` returns four pre-canned buckets (overdue, due today, high priority, upcoming). It doesn't consider how much the user actually gets done in a day, whether tasks are blocked by dependencies, or what time of day they're most productive. A smarter suggestion engine turns the Day Planner from a "list of stuff" into an actual planning partner.

### Technical Approach

**Backend — new endpoint: `GET /api/planner/smart-suggest`**

Scoring algorithm for each candidate task (not done, not blocked):
```
score = base_priority_weight              -- P3=40, P2=30, P1=20, P0=10
      + overdue_penalty(days_overdue * 15) -- escalates daily
      + due_pressure(days_until_due)       -- exponential as deadline approaches
      + streak_bonus(goal_completion_%)    -- favor goals near completion (>75%)  
      + staleness_bonus(days_since_create) -- old tasks get nudged up
      - my_day_already                     -- skip if already in My Day
```

Additional context returned:
- `daily_velocity`: rolling 7-day average of tasks completed per day
- `suggested_count`: min(velocity * 1.1, 8) — suggest a manageable load
- `time_budget`: based on average focus session duration × typical daily sessions
- `blocked_tasks`: tasks the user can't do yet (dependency chain incomplete)

**Frontend — enhanced Day Planner:**
- "Plan My Day" button in Day Planner view
- Shows suggested tasks in a ranked list with reason chips ("overdue 3d", "goal almost done", "high priority")
- One-click "Add to My Day" for individual tasks or "Accept All"
- Shows velocity summary: "You typically finish ~5 tasks/day. Here are 5 suggestions."

**Test plan:** ~10 tests — scoring calculation, velocity averaging, blocked exclusion, suggestion count cap, empty state, overdue escalation.

**Estimated scope:** ~100 LOC server, ~80 LOC frontend, ~70 LOC tests

---

## Feature 3: Drag-and-Drop Everywhere (Impact: ★★★★☆)

### What

Extend the existing drag-and-drop reordering (currently limited to goal task lists and weekly columns) to work in My Day, All Tasks, Board (cross-column), and Matrix views. Also add area and goal reordering in the sidebar.

### Why

Physical task reordering is the #1 tactile interaction in any task manager. My Day — the most-used view — currently has no reorder capability. The user can't manually sequence their day. Area/goal sidebar ordering was called out in the roadmap as a gap.

### Technical Approach

**Backend:**
- `PUT /api/areas/reorder` — `{items: [{id, position}]}` — new endpoint
- `PUT /api/goals/reorder` — `{items: [{id, position}]}` — new endpoint  
- Existing `PUT /api/tasks/reorder` already handles task position updates

**Frontend — unified drag system:**
- Extract current drag logic (in weekly view) into a reusable `initDragList(container, onDrop)` helper
- `onDrop(itemId, newIndex, targetContainer?)` callback handles the API call
- **My Day:** drag handle on each task card, reorder within the list, persists via task `position`
- **All Tasks:** drag within status groups to reorder
- **Board:** drag between todo/doing/done columns (updates status + position in one call)
- **Matrix:** drag between quadrants (updates priority — maps to urgency/importance)
- **Sidebar:** drag areas to reorder, drag goals within an area to reorder
- Use HTML5 native drag (`draggable`, `dragstart`, `dragover`, `drop`) — no library needed, consistent with existing implementation
- Add a subtle drag ghost (semi-transparent card) and drop indicator (blue line)

**Test plan:** ~8 tests — area reorder API, goal reorder API, position persistence, concurrent reorder conflict handling.

**Estimated scope:** ~30 LOC server (2 new endpoints), ~120 LOC frontend (refactored drag system), ~50 LOC tests

---

## Feature 4: iCal Export & Calendar Subscription (Impact: ★★★☆☆)

### What

Export tasks with due dates as a `.ics` file (one-time download) or as a subscribable iCal feed URL that Google Calendar / Apple Calendar can poll.

### Why

Users frequently need their task deadlines visible alongside meetings and events in their primary calendar. Currently, LifeFlow's Calendar view exists in isolation. An iCal feed bridges this — tasks with due dates appear alongside real calendar events. This is the single most impactful integration a self-hosted task app can offer, because it requires zero external dependencies.

### Technical Approach

**Backend:**
- `GET /api/export/ical` — returns `text/calendar` content-type with all tasks that have `due_date` set, formatted as VTODO/VEVENT entries
- Optional query params: `?type=vevent` (default, calendar blocks) or `?type=vtodo` (todo items), `?area_id=N` (filter by area)
- `GET /api/export/ical/feed` — identical output but with `Cache-Control: max-age=3600` and a stable URL for calendar subscription
- Each task mapped to iCal fields:

```
BEGIN:VEVENT
UID:lifeflow-task-{id}@localhost
DTSTART;VALUE=DATE:{due_date}
SUMMARY:{title}
DESCRIPTION:{note (first 500 chars)}
CATEGORIES:{area_name}
PRIORITY:{ical_priority}  -- map P3→1, P2→3, P1→5, P0→9
STATUS:{NEEDS-ACTION|IN-PROCESS|COMPLETED}
END:VEVENT
```

- Recurring tasks: add `RRULE` based on `recurring` field (daily→FREQ=DAILY, weekly→FREQ=WEEKLY, etc.)

**Frontend:**
- "Subscribe to Calendar" button in Settings page → shows the feed URL for copy-paste
- "Download .ics" button in Export section
- Area filter dropdown to export only specific life areas

**Test plan:** ~8 tests — iCal format validity, date mapping, priority mapping, recurring RRULE, area filtering, empty export, special characters in titles.

**Estimated scope:** ~80 LOC server, ~20 LOC frontend, ~60 LOC tests

---

## Feature 5: Keyboard Accessibility & Screen Reader Support (Impact: ★★★☆☆)

### What

Systematic accessibility pass: ARIA landmarks, focus management, keyboard navigation in all views, skip links, announce dynamic changes, respect `prefers-reduced-motion`.

### Why

The app is keyboard-first by philosophy (Ctrl+K, shortcuts 1-9) but isn't keyboard-*accessible*. Tab order is arbitrary, modals don't trap focus, dynamic content isn't announced, task cards aren't `role="listitem"`, and there are no ARIA labels on icon-only buttons. This matters both for accessibility and for the "power keyboard user" identity of the product.

### Technical Approach

**HTML structure:**
- Add `role="navigation"` to sidebar, `role="main"` to content area, `role="dialog"` to modals/detail panel
- Add `aria-label` to all icon-only buttons (e.g., the "+" create buttons, theme toggles, multi-select icons)
- Add `aria-live="polite"` region for toast notifications and search results count
- Add `aria-expanded` to collapsible sections (archived goals, sidebar sections)
- Add skip link: "Skip to main content" as first focusable element

**Focus management:**
- Modal/detail panel open → focus first interactive element, trap focus within (Tab cycles inside panel)
- Modal close → return focus to trigger element
- Task created → focus the new task card
- View switch → focus the view heading

**Keyboard patterns:**
- Task list: `↑`/`↓` to move between tasks, `Enter` to open detail, `Space` to toggle status
- Board columns: `←`/`→` to move between columns, `↑`/`↓` within column
- Detail panel: `Tab` through fields, `Escape` to close

**Motion:**
- Wrap all CSS transitions in `@media (prefers-reduced-motion: no-preference)` — currently transitions are unconditional
- Confetti animation respects this too

**Test plan:** ~6 tests (API-side, testing ARIA attributes in rendered responses isn't applicable to backend tests; this is primarily a frontend change with manual/automated screen reader testing).

**Estimated scope:** ~10 LOC server (ARIA on SPA fallback), ~150 LOC frontend, ~40 LOC tests (focus trap utility, skip link verification)

---

## Priority Ranking

| # | Feature | Daily Impact | Effort | Risk | Ship Order |
|---|---------|-------------|--------|------|------------|
| 1 | Global Unified Search | ★★★★★ | Medium | Low — FTS5 is built into SQLite | First |
| 2 | Smart Day Planning | ★★★★☆ | Medium | Low — pure algorithm, no deps | Second |
| 3 | Drag-and-Drop Everywhere | ★★★★☆ | Medium | Low — extending existing pattern | Third |
| 4 | iCal Export/Feed | ★★★☆☆ | Small | Low — RFC 5545 is well-defined | Fourth |
| 5 | Accessibility Pass | ★★★☆☆ | Medium | Low — progressive enhancement | Fifth |

**Rationale:** Search is the highest-impact daily friction reducer — every power user hits this wall. Smart planning converts LifeFlow from passive tracker to active assistant. Drag reorder is the most tactile missing piece. iCal bridges the biggest integration gap with zero external dependencies. Accessibility is important and relatively independent — can be woven in alongside other features.

---

## Scope Summary

| Metric | Estimate |
|--------|----------|
| New server LOC | ~300 |
| New frontend LOC | ~430 |
| New test LOC | ~300 |
| New API endpoints | 5-6 |
| New DB objects | 1 FTS table, 4-6 triggers |
| New tests | ~44 |
| Expected total tests after | ~370 |

---

## Open Questions

1. **FTS5 availability** — `better-sqlite3` bundles FTS5 by default. Verify with `PRAGMA compile_options` that it's enabled in the Docker image.
2. **iCal auth** — The feed URL is unauthenticated (matches the app's single-user, self-hosted model). If multi-user is ever added, this needs a token parameter.  
3. **Drag on mobile** — HTML5 drag events don't work on touch. Consider `touchstart`/`touchmove`/`touchend` polyfill or a press-and-hold pattern for mobile board reorder. Could be deferred to a subsequent phase.
4. **Smart suggest tuning** — The scoring weights are initial guesses. Consider storing acceptance/rejection data to tune weights over time (feature 7b candidate).

---

## Non-Goals (Phase 7)

- Multi-user / collaboration (requires auth, permissions, conflict resolution — separate phase)
- PWA offline mode (service worker exists but is minimal — separate effort)
- Gantt chart view (complex UI, lower daily-use value than search/planning)
- External API integrations beyond iCal (keep self-hosted philosophy)

---

## Handoff

This spec is ready for the plan agent to decompose into ordered implementation tasks.  
Suggested implementation sequence: Search → Smart Planning → Drag Reorder → iCal → Accessibility (interleaved).
