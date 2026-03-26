---
status: Implemented
baseline: Pre-v2.0
---

# LifeFlow UX Redesign — Implementation Plan

**Date:** 21 March 2026  
**Source:** 12-expert multi-perspective review (2 Architects, 3 UI Experts, 5 Life Coaches, 2 Product Managers)  
**Problem Statement:** 23+ sidebar items organized by database schema, not user workflow. Users face decision paralysis. Features are good individually but the information architecture makes the product feel overwhelming.

---

## Current State (Bugs to Fix First)

| Bug | Location | Fix |
|-----|----------|-----|
| `renderSettings()` renders to `$('cp-body')` — element doesn't exist | `index.html:3059` | Change to `$('ct')` |
| `renderHabits()` renders to `$('mc')` — element doesn't exist | `index.html:3145` | Change to `$('ct')` |
| `renderSavedFilter()` renders to `$('mc')` — element doesn't exist | `index.html:3241` | Change to `$('ct')` |
| `renderPlanner()` renders to `$('mc')` — element doesn't exist | `index.html:3317` | Change to `$('ct')` |

All four should render to `$('ct')` which is the actual content area (`<main class="ct" id="ct">`).

---

## Phase A: Sidebar Redesign

**Goal:** Collapse from 23+ visible items to 5 primary + 2 collapsible groups + 2 bottom icons.  
**Impact:** Highest — directly solves "too much information" complaint.  
**Files:** `public/index.html` (sidebar HTML ~lines 768–856, CSS ~lines 100–180)

### Current Sidebar Structure (23+ items)
```
Core (always visible):
  Inbox, My Day, All Tasks, Board, Overdue, Dashboard     → 6 items

Plan (collapsible):
  Calendar, Weekly Plan, Day Planner, Matrix, Weekly Review → 5 items

Manage (collapsible):
  Activity Log, Tag Manager, Templates, Habits,
  Focus History, Notes, Time Analytics, Automations, Settings → 9 items

Smart Lists:
  Stale Tasks, Quick Wins, Blocked                         → 3 items

Other (always visible):
  Saved Filters section, Daily Review button,
  Life Areas tree, New Area, Export, Import,
  Shortcuts, Theme picker (8 dots)                         → 8+ items
```

### Target Sidebar Structure
```
Primary (always visible — 5 items):
  📥 Inbox (with badge)
  ☀️ Today              ← renamed from "My Day", absorbs Day Planner + Dashboard stats
  📋 All Tasks
  📅 Calendar
  🌳 Life Areas          ← expandable tree (already exists, just promoted)

Plan (collapsible — 3 items):
  📊 Board
  🗓️ Weekly Plan
  📐 Matrix

Filters (collapsible — dynamic):
  ⏳ Stale Tasks
  ⚡ Quick Wins
  🔒 Blocked
  + any user-created saved filters

Bottom (2 icons only):
  ⚙️ Settings            ← opens super-modal (Phase C)
  📈 Reports             ← navigates to reports view (Phase D)
```

### What Moves OUT of Sidebar

| Item | Current Location | New Location | Reason |
|------|-----------------|-------------|--------|
| **Overdue** | Core section | Badge on Inbox + filter in All Tasks | Not a view — it's a filter state |
| **Dashboard** | Core section | Stats bar merged into "Today" view | Redundant with My Day |
| **Day Planner** | Plan section | Merged into "Today" view as toggle | Same data as My Day + time blocks |
| **Weekly Review** | Plan section | Reports view (Phase D) | Weekly cadence, not daily nav |
| **Activity Log** | Manage section | Reports view (Phase D) | Historical reference |
| **Tag Manager** | Manage section | Settings super-modal (Phase C) | Configuration, not daily use |
| **Templates** | Manage section | Settings super-modal (Phase C) | Configuration |
| **Habits** | Manage section | Section inside "Today" view | Daily activity, not its own nav |
| **Focus History** | Manage section | Reports view (Phase D) | Historical reference |
| **Notes** | Manage section | Inline in goal detail or Reports | Rarely accessed |
| **Time Analytics** | Manage section | Reports view (Phase D) | Historical reference |
| **Automations** | Manage section | Settings super-modal (Phase C) | Configuration |
| **Settings** | Manage section | Bottom icon → super-modal (Phase C) | Configuration |
| **Daily Review btn** | Standalone button | Reports view or keyboard shortcut R | Not daily-nav-level |
| **Export Data** | Bottom section | Settings super-modal (Phase C) | Configuration |
| **Import Data** | Bottom section | Settings super-modal (Phase C) | Configuration |
| **Shortcuts** | Bottom section | Settings super-modal (Phase C) | Reference |
| **Theme picker** | Bottom section | Settings super-modal (Phase C) | Configuration |
| **New Life Area** | Bottom section | "+" icon next to Life Areas label | Cleaner placement |

### Implementation Steps

1. **Restructure sidebar HTML** (~lines 768–856):
   - Keep only 5 primary `ni` items: inbox, myday (rename to "Today"), all, calendar, life-areas
   - Restructure "Plan" collapsible to: board, weekly, matrix
   - Replace "Manage" section with "Filters" section (smart lists + saved filters merged)
   - Replace bottom bar with 2 icon buttons: Settings gear + Reports chart icon
   - Move "New Life Area" to inline `+` icon next to "Life Areas" label

2. **Update CSS**: Style the new 2-icon bottom bar, remove theme picker row styles

3. **Update `go()` function** (line 4060): Ensure removed views still work if navigated to via URL/shortcut (they just don't have sidebar items)

4. **Update `render()` router** (line 1195): No changes needed — all render functions stay, just sidebar links removed

5. **Update keyboard shortcuts**: Keep existing shortcuts working (users who know shortcuts shouldn't break). The `?` help modal will still list them all.

6. **Update `updateBC()` breadcrumbs** (line 1227): Rename "My Day" → "Today" throughout

---

## Phase B: Merge "Today" View

**Goal:** Combine My Day + Day Planner + Dashboard stats into one unified "Today" view.  
**Impact:** Eliminates 3 views → 1. Users visit 1 view instead of 3 for their morning workflow.  
**Files:** `public/index.html` (renderMyDay ~line 1271, renderDashboard ~line 2576, renderPlanner ~line 3316)

### Current State
- **My Day** (line 1271): Shows today's tasks split into To Do / Done
- **Day Planner** (line 3316): Shows time-block grid (6AM–10PM) + unscheduled tasks sidebar
- **Dashboard** (line 2576): Shows streak cards, stats grid, trends chart, heatmap, area breakdown

### Target "Today" View Layout
```
┌──────────────────────────────────────────────────────┐
│ ☀️ Today — Saturday, March 21, 2026      [🔍] [⏱️]  │
├──────────────────────────────────────────────────────┤
│ STATS BAR (from Dashboard):                          │
│ [3/12 done] [45min focus] [2/4 habits] [🔥 5 streak]│
├──────────────────────────────────────────────────────┤
│ [List] [Timeline] tabs                               │
├──────────────────────────────────────────────────────┤
│ LIST TAB (default — current My Day):                 │
│  ⚠️ OVERDUE (2)                                      │
│    □ Call dentist (3 days late)                       │
│    □ Submit report (1 day late)                       │
│  📋 TO DO (10)                                       │
│    □ Review PR #42                                    │
│    □ Grocery shopping                                 │
│  ✅ DONE (3)                                         │
│    ☑ Morning standup                                  │
│                                                       │
│ TIMELINE TAB (current Day Planner):                  │
│  [6 AM] ─────────────────────                        │
│  [7 AM] ─────────────────────                        │
│  [8 AM] │ Morning standup │                          │
│  ...                                                  │
│                                                       │
│ HABITS STRIP (from Habits view):                     │
│  ✅ Meditate  ✅ Exercise  □ Read  □ Journal          │
└──────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Rename `renderMyDay()` → `renderToday()`** and expand it:
   - Add stats bar at top (fetch `/api/stats` + `/api/stats/streaks`)
   - Add overdue tasks section (fetch `/api/tasks/overdue`, show count + items)
   - Add `[List | Timeline]` tab toggle
   - List tab = current My Day content
   - Timeline tab = current Day Planner content (inline, not separate page)
   - Add habits strip at bottom (fetch `/api/habits`, show today's with check buttons)

2. **Keep `renderDashboard()` and `renderPlanner()` intact** — they still work if someone navigates there via shortcut/URL. Just no sidebar link.

3. **Update `render()` router**: Map `currentView==='myday'` to the new `renderToday()`

4. **Update references**: "My Day" → "Today" in breadcrumbs, page title, badges, keyboard shortcut help

---

## Phase C: Settings Super-Modal

**Goal:** Consolidate all configuration/power-user features into one tabbed Settings modal.  
**Impact:** Removes 7 items from sidebar navigation. Configuration lives in one place.  
**Files:** `public/index.html` (renderSettings ~line 3057, add new modal HTML + JS)

### Current `renderSettings()` (line 3057)
Renders to `$('cp-body')` (BUG — should be `$('ct')`). Shows:
- General (default view, theme, date format, week start)
- Focus Timer (focus/short/long break durations)
- Tasks (default priority, auto my-day, show completed, confirm delete)
- Data (export, reset)

### Target Settings Super-Modal (Tabs)
```
⚙️ Settings
┌─────────────────────────────────────────────┐
│ [General] [Appearance] [Tags] [Templates]   │
│ [Automations] [Data] [Shortcuts]            │
├─────────────────────────────────────────────┤
│                                              │
│ General tab:                                 │
│   Default View, Date Format, Week Start,     │
│   Focus Timer durations, Task defaults       │
│   (current Settings content)                 │
│                                              │
│ Appearance tab:                              │
│   Theme picker (8 themes, visual swatches)   │
│   Font size (future)                         │
│                                              │
│ Tags tab:                                    │
│   Full Tag Manager (current renderTags)      │
│                                              │
│ Templates tab:                               │
│   Full Templates (current renderTemplates)   │
│                                              │
│ Automations tab:                             │
│   Full Rules engine (current renderRules)    │
│                                              │
│ Data tab:                                    │
│   Export JSON, Import JSON, Reset Settings   │
│                                              │
│ Shortcuts tab:                               │
│   Keyboard shortcuts reference               │
│                                              │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Add Settings modal HTML** (after existing modals ~line 870):
   - Full-screen modal overlay with tabbed content area
   - Tab buttons: General, Appearance, Tags, Templates, Automations, Data, Shortcuts

2. **Refactor `renderSettings()`**: Change to render inside the modal, not `$('ct')`

3. **Move content from existing renders**:
   - Tags tab: Reuse `renderTags()` content but render into modal tab panel
   - Templates tab: Reuse `renderTemplates()` content
   - Automations tab: Reuse `renderRules()` content  
   - Shortcuts tab: Move keyboard shortcuts help content from `.kb-box`
   - Appearance tab: Move theme picker from sidebar bottom

4. **Add CSS for settings modal**: Full-screen overlay, tab navigation, scrollable content panels

5. **Wire bottom Settings icon**: Click opens modal instead of navigating to a view

6. **Keep view-based navigation working**: `go('settings')`, `go('tags')`, etc. can still work but now open the modal to the right tab

---

## Phase D: Reports View

**Goal:** Consolidate all historical/analytical/review features into one tabbed view.  
**Impact:** Removes 5+ items from sidebar. All "look back" features in one place.  
**Files:** `public/index.html` (add new renderReports function + sub-tab renders)

### Target Reports View (Tabs)
```
📈 Reports
┌─────────────────────────────────────────────┐
│ [Overview] [Reviews] [Activity] [Focus]     │
│ [Analytics] [Habits] [Notes]                │
├─────────────────────────────────────────────┤
│                                              │
│ Overview tab (default):                      │
│   Dashboard-style stats (from renderDash)    │
│   Streak, heatmap, trends, area breakdown    │
│                                              │
│ Reviews tab:                                 │
│   Daily Review (current Daily Review flow)   │
│   Weekly Review (current renderWeeklyReview) │
│                                              │
│ Activity tab:                                │
│   Activity Log (current renderLogbook)       │
│                                              │
│ Focus tab:                                   │
│   Focus History (current renderFocusHistory) │
│                                              │
│ Analytics tab:                               │
│   Time Analytics (current renderTimeAnalytics│
│                                              │
│ Habits tab:                                  │
│   Full Habits view (current renderHabits)    │
│   Habit heatmaps, streaks, management        │
│                                              │
│ Notes tab:                                   │
│   Notes (current renderNotes)                │
│                                              │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Add `renderReports()` function**: Router for sub-tabs, renders tab bar + delegates to existing functions

2. **Add Reports to `render()` router**: `currentView==='reports'` → `renderReports()`

3. **Wrap existing renders**: Each existing function (renderLogbook, renderFocusHistory, etc.) stays intact but gets called from within Reports tab context

4. **Add CSS for report tabs**: Inline tab bar at top of content area

5. **Wire bottom Reports icon**: Click navigates to `go('reports')`

6. **Default sub-tab**: Overview (dashboard stats) since it's the most useful at-a-glance

---

## Phase E: Smart Views Merge

**Goal:** Merge Smart Lists + Saved Filters into one unified "Filters" sidebar section.  
**Impact:** Simplifies mental model. One concept for "custom task views."  
**Files:** `public/index.html` (sidebar HTML, renderSmartList, renderSavedFilter)

### Current State
- **Smart Lists** (hardcoded): Stale Tasks, Quick Wins, Blocked — always visible in sidebar
- **Saved Filters** (dynamic): User-created, hidden section that appears when filters exist

### Target: Unified "Filters" Section
```
Filters (collapsible):
  ⏳ Stale Tasks        (built-in)
  ⚡ Quick Wins          (built-in)
  🔒 Blocked             (built-in)
  ── separator ──
  🔵 My Custom Filter 1  (user-created)
  🟢 Urgent This Week    (user-created)
  [+ New Filter]
```

### Implementation Steps

1. **Merge sidebar HTML**: Combine `#smart-sec` and `#sf-section` into one `#filters-sec` collapsible section

2. **Update `renderSFList()`** (line 1087): Render both smart lists and saved filters into one container

3. **Add "New Filter" button** inside the section

4. **Remove duplicate section logic**: No more hiding/showing `#sf-section` separately

---

## Implementation Order & Dependencies

```
Fix Bugs (no dependencies)
  ├── Fix renderSettings target: $('cp-body') → $('ct')
  ├── Fix renderHabits target: $('mc') → $('ct')
  ├── Fix renderSavedFilter target: $('mc') → $('ct')
  └── Fix renderPlanner target: $('mc') → $('ct')

Phase A: Sidebar Redesign (no dependencies)
  └── Restructure sidebar HTML
  └── Update CSS
  └── Rename "My Day" → "Today"

Phase B: Today View Merge (depends on Phase A for naming)
  └── Expand renderMyDay → renderToday
  └── Add stats bar, overdue section, habits strip
  └── Add List/Timeline tab toggle

Phase C: Settings Super-Modal (depends on Phase A for sidebar)
  └── Create modal HTML + CSS
  └── Move Tags, Templates, Automations, Shortcuts, Themes, Import/Export
  └── Wire bottom Settings icon

Phase D: Reports View (depends on Phase A for sidebar)
  └── Create renderReports with sub-tabs
  └── Wrap existing analytical renders
  └── Wire bottom Reports icon

Phase E: Smart Views Merge (depends on Phase A for sidebar)
  └── Merge smart lists + saved filters HTML
  └── Unify rendering logic
```

### Recommended execution order:
1. **Fix Bugs** → immediate, 5 minutes
2. **Phase A** → sidebar restructure, largest visual impact
3. **Phase E** → small, natural extension of Phase A
4. **Phase C** → Settings modal catches displaced items
5. **Phase D** → Reports view catches remaining displaced items
6. **Phase B** → Today view merge, most complex, benefits from all above

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Breaking existing keyboard shortcuts | Keep all `go()` view names working; shortcuts still route to correct renders |
| Breaking tests that reference view names | Tests hit API endpoints, not UI — no test changes needed |
| Users losing access to features | Every feature remains accessible, just relocated. No features deleted. |
| Mobile responsiveness | Each phase must be tested on mobile viewport (768px breakpoint) |
| Render target bugs | Fix the 4 known `$('mc')`/`$('cp-body')` bugs before any restructuring |

---

## Success Metrics

- Sidebar visible items: **23+ → 5 primary + 3 plan + dynamic filters** (≤12 visible)
- Views to complete morning workflow: **3 (My Day + Day Planner + Dashboard) → 1 (Today)**
- Configuration scattered across: **7 sidebar items → 1 Settings modal**
- Analytics/review scattered across: **6 sidebar items → 1 Reports view**
- Hick's Law compliance: **7±2 visible choices** at any decision point
