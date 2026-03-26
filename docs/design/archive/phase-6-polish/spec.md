---
status: Implemented
baseline: Phase 6
---

# Phase 6: Polish & UX Refinement — Spec

**Status:** Draft  
**Author:** Brainstorm Agent  
**Date:** 2026-03-21  
**Scope:** 5 improvements focused on making existing features feel cohesive, reducing friction, and adding visual delight.

---

## 1. Unified Task Counts & Progress Everywhere

### What it does
Show consistent task progress indicators (done/total + micro progress bar) on **every** container throughout the app: sidebar area items, goal cards, board column headers, calendar day cells, and the Eisenhower matrix quadrants. Currently, area items show `pending_tasks` as a badge and goal cards show task stats, but there's no visual consistency — some show counts, some show bars, some show nothing.

### Why
Users scan the sidebar and views to find "where should I focus?" Right now they have to click into an area, then a goal, to see progress. A glanceable progress ring or bar next to every container answers "how done is this?" at every level without navigating. This is the single biggest thing separating "functional" from "polished" — apps like Things 3 and Todoist nail this.

### Backend changes
- **`GET /api/areas`**: Already returns `goal_count` and `pending_tasks`. Add `total_tasks` and `done_tasks` to the existing query so frontend can compute percentage.
- **`GET /api/tasks/board`**: Add a summary object `{ columnCounts: { todo: N, doing: N, done: N } }` to the response.
- No new tables or endpoints needed.

### Frontend changes
- Sidebar `.ni` area items: Replace the plain badge with a mini progress ring (SVG, 18×18px) showing done/total percentage, with the count as a tooltip.
- Goal cards in area view: Add a thin progress bar under the title (reuse the `.st-track`/`.st-fill` pattern already used for subtasks).
- Board column headers: Show `(N)` count in the column header.
- Calendar day cells: Show a small dot or pill with task count.
- Matrix quadrants: Show count badge in each quadrant header.

### Estimated scope
~40 lines backend, ~80 lines frontend.

---

## 2. Persistent View Filters & "Remember Where I Was"

### What it does
When the user applies filters (area, priority, tag) on the Board view, or selects a sort order on the All Tasks view, then navigates away and comes back — the filters are **remembered**. Also, restore the last-visited view on page load (area + goal + view), so refreshing the browser puts you right back where you were.

### Why
This is the #1 "paper-cut" in the current UX. Every navigation or refresh resets to My Day with no active filters. Power users who work from the Board view filtered to "Work" area with "High" priority spend seconds re-applying filters every time. The settings table already exists and `saveSetting()`/`loadSettings()` are wired up — this is leveraging existing infrastructure.

### Backend changes
- None. Use the existing `settings` key-value table. Store `lastView`, `lastAreaId`, `lastGoalId`, `boardFilters`, `allTasksSort` as JSON in settings.

### Frontend changes
- On `go(view)` / area click / goal click: call `saveSetting('lastNav', JSON.stringify({view, areaId, goalId}))`.
- On Board filter change / sort change: `saveSetting('viewFilters', JSON.stringify({board: {...}, allTasks: {...}}))`.
- On app init (after `loadSettings()`): read `lastNav` and call `go()` + set `activeAreaId`/`activeGoalId` accordingly, then restore filters.
- Add a "Clear Filters" button to the Board toolbar (an × icon next to the active filter chips) so it's easy to reset.

### Estimated scope
~0 lines backend, ~50 lines frontend.

---

## 3. Inline Task Editing (Click-to-Edit Title + Note)

### What it does
Clicking a task title in any list view makes it **instantly editable inline** (contentEditable or an input swap), with Enter to save and Escape to cancel. Same for the task note — click the note area in the detail panel to get a textarea that auto-saves on blur. Currently, every edit requires opening the full detail panel, which is a heavy interaction for a simple title tweak.

### Why
Renaming a task is the most frequent edit operation. The current flow is: click task → detail panel slides open → click title field → edit → save → close panel. That's 4 interactions for a 1-second rename. Inline editing makes it 1 interaction (click, type, Enter). This matches the UX of Todoist, Things, and every modern task app. The detail panel remains for complex edits (tags, deps, time tracking), but the quick stuff should be instant.

### Backend changes
- None. `PUT /api/tasks/:id` already accepts partial updates.

### Frontend changes
- In `tcHtml()`: Make `.tt` (title div) respond to **double-click** with a `contentEditable=true` swap (single-click still opens detail panel, preventing conflict).
- On Enter in the editable title: `PUT /api/tasks/:id {title}`, exit edit mode.
- On Escape: revert text, exit edit mode.
- On blur: save if changed, revert if empty.
- In the detail panel: make the note textarea auto-save on blur (debounced 500ms) instead of requiring the Save button.
- Visual cue: subtle pencil icon on hover next to the title, border highlight on the editable field.

### Estimated scope
~0 lines backend, ~60 lines frontend.

---

## 4. Smooth Transitions & Loading States

### What it does
Add CSS transitions when switching views (crossfade, ~150ms), skeleton loading placeholders while data loads, and optimistic UI updates for common actions (toggle status, change priority, toggle My Day). Currently, view switches cause a flash of empty content, and every action waits for the API round-trip before updating the UI.

### Why
The app **works** but doesn't **feel** fast. A 200ms API call feels instant when the UI updates immediately and reconciles later. Skeleton screens during load prevent the "flash of empty" that makes every view switch feel janky. These are the micro-interactions that distinguish a native-feeling app from a web page. Zero functional change, pure perceived performance.

### Backend changes
- None.

### Frontend changes
- **View transitions**: Wrap the `#ct` content area swap in a CSS opacity transition (`.ct{transition:opacity .15s}`, set opacity 0 before render, 1 after).
- **Skeleton screens**: Add a `skeleton()` function that returns placeholder HTML (3-4 gray pulsing bars matching task card shape). Show skeleton in `render()` before `await` completes.
- **Optimistic updates for toggles**: On checkbox click / priority cycle / My Day toggle — immediately update the DOM element's classes/text, fire the API call in background, revert on failure. The `tcHtml()` function already generates complete HTML from task data; keep a local task cache and mutate it immediately.
- **Subtask toggle**: Same pattern — toggle the `.tc-sub-done` class immediately, API in background.
- **Toast on failure**: If an optimistic update fails, show an error toast and revert.

### Estimated scope
~0 lines backend, ~100 lines frontend (mostly CSS + skeleton template).

---

## 5. Contextual Empty States & Onboarding Hints

### What it does
Replace every "No tasks" empty list with **contextual, actionable empty states** that tell the user exactly what to do next based on where they are. Add first-use hints for power features (command palette, keyboard shortcuts, quick capture, Day Planner) that appear once and can be dismissed.

### Why
The app has an `emptyS()` helper that generates empty states, but it's used with generic messages. A user seeing "No tasks here" on the Board view doesn't know they need to create tasks in a Goal first. A user on the Day Planner who hasn't time-blocked anything doesn't know about drag-and-drop. The onboarding wizard covers initial setup, but the 15+ views each need their own "here's how to use this" moment. This is the difference between "I can figure it out" and "the app teaches me."

### Backend changes
- Add a `dismissed_hints` setting (JSON array of hint IDs) to the settings table. `GET /api/settings` already returns all settings.

### Frontend changes
- Create a `hints` map: `{ 'command-palette': {text, view, position}, 'day-planner-drag': {...}, ... }` — ~8 hints for power features.
- On view render, check if the hint for that view is in `dismissed_hints`. If not, show a subtle floating tip card (below the toolbar, 1 line + dismiss ×). On dismiss, persist to settings.
- Upgrade `emptyS()` calls throughout the codebase with view-specific messages:
  - **My Day** (empty): "Your day is clear! Use ☀️ on any task or press `Q` for Quick Capture."
  - **Board** (empty column): "Drag tasks here or use + to create directly."
  - **Calendar** (empty day): "Click to add a task due this day."
  - **Day Planner** (empty): "Drag tasks from the suggestion panel into time slots to plan your day."
  - **Inbox** (empty): "Inbox zero! Use `Q` to capture thoughts without interrupting your flow."
  - **Smart Lists** (empty): "No stale/blocked/quick-win tasks — that's a good sign."
  - **Habits** (empty): "Track daily habits with streaks. Add your first one above."
  - **Templates** (empty): "Save common task patterns as templates. Create checklists you reuse."
- Each empty state includes a primary action button (e.g., "Add Task" on My Day, "Open Quick Capture" on Inbox).

### Estimated scope
~5 lines backend (dismissed_hints setting), ~80 lines frontend.

---

## Summary Table

| # | Improvement | Type | Backend | Frontend | User Impact |
|---|-------------|------|---------|----------|-------------|
| 1 | Unified Progress Everywhere | Data visibility | ~40 LOC | ~80 LOC | Glanceable progress at a glance |
| 2 | Persistent Filters & Last View | Friction reduction | 0 | ~50 LOC | Never re-apply filters again |
| 3 | Inline Task Editing | Workflow speed | 0 | ~60 LOC | 4 clicks → 1 click for renames |
| 4 | Smooth Transitions & Optimistic UI | Visual delight | 0 | ~100 LOC | App *feels* 5× faster |
| 5 | Contextual Empty States & Hints | Discoverability | ~5 LOC | ~80 LOC | Features teach themselves |

**Total estimate:** ~45 lines backend, ~370 lines frontend. All additive — no schema migrations, no new tables, no breaking changes.

---

## Implementation Order (Recommended)

1. **#2 Persistent Filters** — smallest change, biggest daily-use win
2. **#4 Transitions & Optimistic UI** — makes everything that follows feel better
3. **#1 Unified Progress** — visible improvement across every view
4. **#3 Inline Editing** — workflow improvement users will use hourly
5. **#5 Empty States & Hints** — finishing touch, polishes the whole experience
