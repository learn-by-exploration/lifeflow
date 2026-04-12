I now have comprehensive understanding of all 14 areas. Let me produce the plan.

---

# Implementation Plan: LifeFlow 14-Feature Improvement Roadmap

## Overview

14 user-requested improvements to LifeFlow, spanning backend data integrity, habit management, UI/UX polish, drag-and-drop interactions, and focus timer reliability. Organized into 4 release phases prioritized by impact, effort, and dependency order.

---

## Priority Matrix

| # | Feature | Impact | Effort | Phase |
|---|---------|--------|--------|-------|
| 5 | Delete habit | High | Quick | 1 |
| 6 | View and edit habits | High | Quick | 1 |
| 10 | Edit list items | High | Quick | 1 |
| 11 | Clear notifications | Medium | Quick | 1 |
| 1 | Automation rules backup | High | Medium | 1 |
| 12 | Background focus timer | High | Medium | 2 |
| 3 | Better daily reflection UI | Medium | Medium | 2 |
| 9 | Improved task edit UI | Medium | Medium | 2 |
| 14 | Better calendar view styling | Medium | Medium | 2 |
| 2 | Pin life areas/favorites | Medium | Medium | 3 |
| 8 | Habit review/analytics | Medium | Medium | 3 |
| 13 | Direct task creation in life area | Medium | Quick | 3 |
| 4 | Task/subtask planner | High | Major | 4 |
| 7 | Drag-drop tasks in timeline | Medium | Major | 4 |

---

## Phase 1: Quick Wins & Data Integrity

**Goal:** Fix obvious gaps, unblock daily workflows, ensure data safety.

**Experts needed:**
- Backend architect (backup/export data model)
- Security reviewer (backup data includes sensitive fields like tokens)
- Testers (comprehensive backup round-trip tests)

---

### 1.1 Delete Habit (Feature #5)

**Current state:** Backend `DELETE /api/habits/:id` already exists at [features.js](src/routes/features.js#L699). Frontend already has delete buttons with `data-del` attributes and a handler at [app.js](public/app.js#L5828) that calls `api.del('/api/habits/'+id)`. **This feature already works.**

**Subtasks:**
1. **Verify cascade behavior** ([src/db/index.js](src/db/index.js))
   - Confirm `habit_logs` records are deleted when habit is deleted (FK cascade or explicit delete)
   - Action: Check the `habits` table FK definition — currently `habit_logs.habit_id` references `habits` but need to verify `ON DELETE CASCADE`
   - Risk: Low

2. **Add confirmation dialog improvement** ([public/app.js](public/app.js#L5828))
   - Action: Current `confirm()` is basic; add undo toast like goal deletion has
   - Dependencies: None
   - Risk: Low

3. **Write tests** (File: `test/habits-delete.test.js`)
   - Test: DELETE returns 200, cascades to habit_logs, returns 404 for non-existent, IDOR protection
   - Coverage: Unit + integration

---

### 1.2 View and Edit Habits (Feature #6)

**Current state:** Backend `PUT /api/habits/:id` exists at [features.js](src/routes/features.js#L690). Frontend has inline edit via `data-edit` buttons at [app.js](public/app.js#L5833) that reuses the creation form. **Edit already works — the UX needs improvement.**

**Subtasks:**
1. **Add habit detail modal** ([public/app.js](public/app.js#L5677))
   - Action: Create a dedicated habit detail view (similar to `openDP` for tasks) with:
     - Habit name, icon, color display
     - Heatmap (full 90 days, not just 7)
     - Streak counter and total completions
     - Edit fields inline
     - Log history with undo
   - Why: Current inline form toggle is awkward; clicking a habit card should open a rich view
   - Dependencies: None
   - Risk: Low

2. **Add habit detail CSS** ([public/styles.css](public/styles.css))
   - Action: Add `.habit-detail-modal` overlay styles matching existing modal patterns
   - Risk: Low

3. **Write tests** (File: `test/habits-edit.test.js`)
   - Test: PUT validation (name length, frequency values), partial updates, IDOR
   - Coverage: Unit

---

### 1.3 Edit List Items (Feature #10)

**Current state:** Backend `PUT /api/lists/:id/items/:itemId` already exists at [lists.js](src/routes/lists.js#L222). Frontend renders list items in `renderListDetail()` at [app.js](public/app.js#L5196) but has no edit UI — only check/delete.

**Subtasks:**
1. **Add inline edit on click** ([public/app.js](public/app.js#L5196))
   - Action: Make `.li-title` elements editable on click:
     - Replace `<span>` with `<input>` on click
     - Save on Enter or blur via `PUT /api/lists/:id/items/:itemId`
     - Escape to cancel
   - File scope: ~30 lines added to `renderListDetail()` event wiring section
   - Dependencies: None
   - Risk: Low

2. **Add edit button for note/quantity/metadata** ([public/app.js](public/app.js#L5196))
   - Action: Add a small edit icon next to each list item that opens an inline expansion with fields for:
     - `title`, `quantity`, `note`, `category`
     - For enhanced items: `price`, `url`, `rating` (metadata JSON)
   - Risk: Low — backend already supports all fields

3. **Write tests** (File: `test/list-items-edit.test.js`)
   - Test: PUT updates title, quantity, note, metadata; validates ownership via list→user check
   - Coverage: Unit + integration

---

### 1.4 Clear Notifications (Feature #11)

**Current state:** Notification bell at [app.js](public/app.js#L3157) loads reminders from `/api/reminders` on each click. Items are overdue/today/upcoming tasks — not persistent notifications. There is no dismiss/clear mechanism.

**Subtasks:**
1. **Add "Mark all read" button to bell dropdown** ([public/app.js](public/app.js#L3157))
   - Action: Add a header bar in `loadBellReminders()` with "Clear all" that stores dismissed IDs in `localStorage`
   - Key: `lf-dismissed-reminders` → `Set<taskId>` (reset daily)
   - Filter out dismissed task IDs from bell display
   - Why: No backend change needed — reminders are computed, not stored
   - Dependencies: None
   - Risk: Low

2. **Add per-item dismiss** ([public/app.js](public/app.js#L3175))
   - Action: Add a small `×` to each `bellItem()` that adds the task ID to the dismissed set
   - Risk: Low

3. **Add badge count update** ([public/app.js](public/app.js#L3164))
   - Action: After clearing, update `bell-badge` count to reflect only non-dismissed items
   - Risk: Low

4. **Write tests** (File: `test/frontend-notifications.test.js`)
   - Test: Static validation that dismiss UI elements exist; localStorage round-trip
   - Coverage: Frontend validation

---

### 1.5 Automation Rules Backup (Feature #1)

**Current state:** `queryAllUserData()` already includes `automation_rules` at [data.js](src/routes/data.js#L97). The import handler at [data.js](src/routes/data.js#L243) deletes and clears `automation_rules` but **never restores them**. The export includes the data, the import drops it silently.

**Subtasks:**
1. **Add automation_rules import logic** ([src/routes/data.js](src/routes/data.js#L195))
   - Action: After the habits import block (~line 340+), add:
     ```javascript
     if (Array.isArray(req.body.automation_rules)) {
       const insRule = db.prepare('INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, conditions, actions, description, template_id, enabled, fire_count, last_fired_at, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
       req.body.automation_rules.forEach(r => {
         insRule.run(r.name, r.trigger_type, r.trigger_config||null, r.action_type||null, r.action_config||null, r.conditions||null, r.actions||null, r.description||null, r.template_id||null, r.enabled??1, 0, null, req.userId);
       });
     }
     ```
   - Why: Automation rules are user-created, potentially complex, and currently silently lost on import
   - Risk: Medium — must sanitize `trigger_config`, `action_config`, `conditions`, `actions` (all JSON strings)

2. **Add automation_log to export** ([src/routes/data.js](src/routes/data.js#L45))
   - Action: Add `automation_log` to `queryAllUserData()` — not critical but useful for auditing
   - Risk: Low

3. **Add comprehensive backup round-trip test** (File: `test/backup-completeness.test.js`)
   - Action: Create a test that:
     1. Creates one of every entity type (area, goal, task, subtask, tag, habit, habit_log, focus_session, note, list, list_item, template, filter, automation_rule, custom_field_def, custom status, etc.)
     2. Exports via `GET /api/export`
     3. Imports via `POST /api/import`
     4. Exports again and compares — all entity counts must match
   - Why: Prevents future regressions where new tables are added to export but not import
   - Dependencies: Step 1
   - Risk: Low

4. **Add daily_reviews and inbox import** ([src/routes/data.js](src/routes/data.js#L195))
   - Action: While fixing automation_rules, also add import for `daily_reviews`, `inbox`, `user_xp`, and `badges` which are exported but not imported
   - Risk: Low

5. **Security review** — Ensure imported automation rules can't contain malicious trigger_config or action_config (e.g., webhook URLs that point to internal networks)
   - Action: Validate webhook URLs in action_config using existing `isPrivateUrl()` helper
   - Risk: Medium

**Testing Strategy:**
- Full round-trip export/import test covering all 41 tables
- Edge cases: empty arrays, missing optional fields, orphaned references
- Security: imported webhook URLs validated

---

## Phase 2: UI/UX Polish & Timer Reliability

**Goal:** Improve daily-use views and fix the focus timer reliability issue.

**Experts needed:**
- Frontend architect (UI redesign for task edit, daily review, calendar)
- Accessibility expert (WCAG compliance for new modals)
- Backend architect (focus timer background worker)
- Testers (E2E flows for timer, visual regression)

---

### 2.1 Background Focus Timer (Feature #12)

**Current state:** Focus timer at [app.js](public/app.js#L3624) uses `setInterval` in the main thread. When the tab is backgrounded, browsers throttle intervals to 1/second or pause entirely.

**Subtasks:**
1. **Create Web Worker for timer** (File: `public/timer-worker.js`)
   - Action: New file with:
     ```javascript
     let startTime, duration, interval;
     self.onmessage = (e) => {
       if (e.data.cmd === 'start') {
         startTime = Date.now();
         duration = e.data.duration;
         interval = setInterval(() => {
           const elapsed = Math.floor((Date.now() - startTime) / 1000);
           self.postMessage({ elapsed, remaining: duration - elapsed });
           if (elapsed >= duration) { clearInterval(interval); self.postMessage({ done: true }); }
         }, 1000);
       } else if (e.data.cmd === 'stop') {
         clearInterval(interval);
         self.postMessage({ elapsed: Math.floor((Date.now() - startTime) / 1000) });
       }
     };
     ```
   - Why: Web Workers are not throttled when tab is backgrounded
   - Risk: Medium — must handle worker lifecycle, error recovery

2. **Integrate worker into focus timer** ([public/app.js](public/app.js#L3624))
   - Action: Replace `setInterval`-based countdown with Worker messages:
     - `startFocusTimer` → `worker.postMessage({cmd:'start', duration})`
     - Worker `onmessage` updates the SVG ring and time display
     - Fallback: if Workers unavailable, keep current `setInterval`
   - Dependencies: Step 1
   - Risk: Medium

3. **Add Notification API for completion** ([public/app.js](public/app.js))
   - Action: When timer completes in background, use `Notification.requestPermission()` + `new Notification()` to alert user
   - Risk: Low

4. **Audio alert on completion** ([public/app.js](public/app.js))
   - Action: Play a short audio chime when timer finishes (use `AudioContext` or `<audio>` element)
   - Risk: Low

5. **Write tests** (File: `test/focus-timer-worker.test.js`)
   - Test: Worker message round-trip, elapsed calculation accuracy, stop/start lifecycle
   - Coverage: Unit

---

### 2.2 Better Daily Reflection UI (Feature #3)

**Current state:** Daily review at [app.js](public/app.js#L6038) is a 3-step wizard overlay (`dr-ov`). Step 1 shows yesterday's accomplishments + weekly snapshot. Step 2 shows today's plan. Step 3 is a task picker. UI uses basic divs with inline styles.

**Subtasks:**
1. **Redesign step 1: Yesterday's Review** ([public/app.js](public/app.js#L6073))
   - Action: Replace raw stats with visual cards:
     - Accomplishment cards with goal colors
     - Mini completion chart (bar or sparkline)
     - Emotional check-in (how did yesterday feel? 1-5 scale)
     - Save check-in value to daily_reviews.note
   - Risk: Low

2. **Redesign step 2: Today's Plan** ([public/app.js](public/app.js#L6094))
   - Action:
     - Show tasks in goal-grouped cards with progress indicators
     - Add time estimate summary ("~2h 30m of work planned")
     - Add drag-to-reorder for priority setting
   - Risk: Low

3. **Redesign step 3: Task Picker** ([public/app.js](public/app.js#L6114))
   - Action:
     - Better filtering (by area, tag, priority)
     - Search within backlog
     - Show task metadata (due date, estimated time, tags)
   - Risk: Low

4. **Add daily review CSS** ([public/styles.css](public/styles.css))
   - Action: Add `.dr-card`, `.dr-stat-visual`, `.dr-check-in` styles
   - Risk: Low

5. **Persist daily review data** ([src/routes/productivity.js](src/routes/productivity.js))
   - Action: Ensure the emotional check-in and task selections are saved to `daily_reviews` table
   - Dependencies: Backend route already exists — verify it accepts the new fields
   - Risk: Low

6. **Write tests** (File: `test/daily-review-ui.test.js`)
   - Test: Validate HTML structure, accessibility (ARIA labels), keyboard navigation
   - Coverage: Frontend validation + integration

---

### 2.3 Improved Task Edit UI (Feature #9)

**Current state:** Task edit panel `openDP()` at [app.js](public/app.js#L2229) renders a slide-out panel with a long form. All fields are stacked vertically with basic input styling.

**Subtasks:**
1. **Reorganize panel layout** ([public/app.js](public/app.js#L2239))
   - Action: Group fields into collapsible sections:
     - **Core**: Title, Status, Priority, Star (always visible)
     - **Scheduling**: Start date, Due date, Due time, Recurring
     - **Details**: Notes (with live markdown preview), Tags, Custom fields
     - **Planning**: Estimated/actual minutes, Dependencies, Assigned to
     - **Subtasks**: Full section with inline add/edit/reorder
     - **Activity**: Comments + activity feed (collapsed by default)
     - **Files**: Attachments section
   - Risk: Medium — large section of `renderDPBody()` to restructure

2. **Improve visual hierarchy** ([public/styles.css](public/styles.css))
   - Action: Add section headers with icons, better spacing, colored priority indicator, status pills
   - Risk: Low

3. **Add keyboard shortcuts in panel**
   - Action: `Ctrl+Enter` to save and close, `Escape` to close, tab order for fields
   - Risk: Low

4. **Write tests** (File: `test/task-edit-ui.test.js`)
   - Test: Panel opens with correct data, saves changes, validates required fields
   - Coverage: Integration

---

### 2.4 Better Calendar View Styling (Feature #14)

**Current state:** Day/week/3-day views at [app.js](public/app.js#L1392) use basic timeline layout with hour labels and task blocks. Styling is functional but flat.

**Subtasks:**
1. **Improve timeline task blocks** ([public/app.js](public/app.js#L1510), [public/styles.css](public/styles.css))
   - Action:
     - Rounded corners and subtle shadows on task blocks
     - Goal color left border + light background tint
     - Priority indicator dot
     - Show subtask progress mini-bar
     - Hover effect with task details tooltip
   - Risk: Low

2. **Improve hour grid** ([public/app.js](public/app.js#L1500))
   - Action:
     - Alternating subtle backgrounds for AM/PM
     - Current time indicator (red line — already exists, improve styling)
     - Working hours highlight (9-5 or user-configured)
   - Risk: Low

3. **Improve day column headers** ([public/app.js](public/app.js#L1510))
   - Action:
     - Larger date numbers, day name styling
     - Today column highlight
     - Weekend column dimming
   - Risk: Low

4. **Add calendar CSS** ([public/styles.css](public/styles.css))
   - Action: New `.cal-day-col-header`, `.cal-task-block-enhanced` styles
   - Risk: Low

5. **Write tests** (File: `test/calendar-styling.test.js`)
   - Test: Validate CSS class presence, responsive layout, accessible contrast ratios
   - Coverage: Frontend validation

---

## Phase 3: Feature Enhancements

**Goal:** Add new navigation patterns and analytics.

**Experts needed:**
- Frontend architect (pinning UX, habit analytics charts)
- Database specialist (settings schema for pins)
- Accessibility expert (ARIA for new interactive elements)
- Testers (E2E for new views)

---

### 3.1 Pin Life Areas / Favorites (Feature #2)

**Current state:** Sidebar renders areas from `areas` array. No pinning or favorites mechanism exists.

**Subtasks:**
1. **Add `pinned` column to settings** (No schema change needed)
   - Action: Use existing `settings` table: key = `pinned_areas`, value = JSON array of area IDs
   - Why: Avoids schema migration; settings already handle user preferences
   - Risk: Low

2. **Add pin toggle to sidebar area items** ([public/app.js](public/app.js#L400))
   - Action: Add a pin icon next to each area in the sidebar. Clicking toggles the area ID in/out of `pinned_areas` setting
   - Pinned areas appear at the top of the sidebar list, separated by a divider
   - Risk: Low

3. **Add pinned areas section** ([public/app.js](public/app.js#L400))
   - Action: In sidebar render, sort areas: pinned first (in pin order), then rest (in position order)
   - Add "★ Pinned" section header
   - Risk: Low

4. **Persist pin state** ([public/js/api.js](public/js/api.js))
   - Action: Save via `PUT /api/settings/pinned_areas` with JSON array value
   - Risk: Low

5. **Write tests** (File: `test/pinned-areas.test.js`)
   - Test: Setting round-trip, sidebar rendering with pins, max pins limit
   - Coverage: Integration

---

### 3.2 Habit Review / Analytics (Feature #8)

**Current state:** Per-habit heatmap endpoint exists (`GET /api/habits/:id/heatmap` — 90 days). Reports view at [app.js](public/app.js#L7212) has a `habits` sub-tab that calls `renderHabits()` — it just shows the regular habits view, not analytics.

**Subtasks:**
1. **Add habits analytics API** (File: `src/routes/stats.js`)
   - Action: New endpoint `GET /api/stats/habits` returning:
     - Per-habit: streak, longest streak, completion rate (30d/90d), total logs
     - Overall: total habits, active count, average completion rate
     - Trends: daily completion count for last 90 days
   - Dependencies: None
   - Risk: Low

2. **Create habit analytics view** ([public/app.js](public/app.js#L7212))
   - Action: Replace the `habits` sub-render in Reports with a dedicated analytics view:
     - Overall completion rate cards
     - Per-habit sparkline charts (30 days)
     - Streak leaderboard
     - Best/worst day of week analysis
     - Heatmap grid (365 days, GitHub-style)
   - Dependencies: Step 1
   - Risk: Medium

3. **Add habit analytics CSS** ([public/styles.css](public/styles.css))
   - Action: `.habit-analytics`, `.habit-sparkline`, `.habit-leaderboard` styles
   - Risk: Low

4. **Write tests** (File: `test/stats-habits.test.js`)
   - Test: Analytics endpoint returns correct calculations, handles no data
   - Coverage: Unit + integration

---

### 3.3 Direct Task Creation in Life Area (Feature #13)

**Current state:** Area view at [app.js](public/app.js#L1269) shows goals grid. To create a task, users must: click goal → type in goal view input. No quick-add from area level.

**Subtasks:**
1. **Add quick-add bar to area view** ([public/app.js](public/app.js#L1269))
   - Action: Add a task input below the goal input with a goal selector dropdown:
     ```
     [Goal: ▾ Select goal] [Task title input...] [+ Add]
     ```
   - Pre-select first active goal
   - Uses existing `POST /api/goals/:id/tasks`
   - Dependencies: None
   - Risk: Low

2. **Add "+" button on each goal card** ([public/app.js](public/app.js#L1290))
   - Action: Add a small "+" icon on each goal card that opens the quick-add with that goal pre-selected
   - Risk: Low

3. **Write tests** (File: `test/area-quick-add.test.js`)
   - Test: Task creation from area view, goal pre-selection, validation
   - Coverage: Integration

---

## Phase 4: Advanced Interactions

**Goal:** Complex drag-and-drop and planning features.

**Experts needed:**
- Frontend architect (drag-and-drop system, hierarchical planner)
- Backend architect (bulk update endpoints for drag operations)
- Database specialist (query optimization for timeline)
- Accessibility expert (keyboard alternatives for drag-and-drop)
- Testers (E2E for drag-drop, visual regression)

---

### 4.1 Task/Subtask Planner (Feature #4)

**Current state:** Tasks can be viewed in list/board/table/gantt. Subtasks are inline within each task. No dedicated hierarchical planner exists.

**Subtasks:**
1. **Design planner view** ([public/app.js](public/app.js))
   - Action: New view (`currentView='planner'`) with:
     - Left panel: collapsible tree view (Area → Goal → Task → Subtask)
     - Right panel: selected item detail editor
     - Drag to rearrange hierarchy (move tasks between goals, reorder)
     - Indent/outdent to promote subtasks to tasks or vice versa
   - Risk: High — complex tree rendering and state management

2. **Add planner API endpoint** (File: `src/routes/tasks.js`)
   - Action: `GET /api/tasks/planner` returning full hierarchy:
     ```json
     { areas: [{ ...area, goals: [{ ...goal, tasks: [{ ...task, subtasks: [...] }] }] }] }
     ```
   - Why: Avoid N+1 queries; single hierarchical fetch
   - Risk: Medium

3. **Add batch move endpoint** (File: `src/routes/tasks.js`)
   - Action: `POST /api/tasks/batch-move` accepting `{task_ids: [], target_goal_id: number}` for drag operations
   - Risk: Medium — must validate ownership

4. **Add sidebar navigation item** ([public/app.js](public/app.js#L400))
   - Action: Add "Planner" to navigation with keyboard shortcut
   - Risk: Low

5. **Add planner CSS** ([public/styles.css](public/styles.css))
   - Action: `.planner-tree`, `.planner-node`, indentation, drag indicators
   - Risk: Low

6. **Accessibility**: Add keyboard tree navigation (arrow keys, Enter to expand/collapse, Space to select)
   - Risk: Medium

7. **Write tests** (Files: `test/planner-view.test.js`, `test/tasks-batch-move.test.js`)
   - Test: Hierarchy rendering, batch move validation, IDOR protection, drag operations
   - Coverage: Unit + integration + E2E

---

### 4.2 Drag-Drop Tasks in Timeline/Gantt (Feature #7)

**Current state:** Gantt chart at [app.js](public/app.js#L919) renders SVG bars — click to open task, no drag support. Calendar day views have basic timeline drag-and-drop for time blocks.

**Subtasks:**
1. **Add drag handles to Gantt bars** ([public/app.js](public/app.js#L919))
   - Action: Make SVG `rect` elements draggable:
     - Drag bar horizontally → change `due_date`
     - Drag bar edges → change `start_date` / `due_date` (resize)
     - Visual feedback: ghost bar, snap to day grid
   - Risk: High — SVG drag interactions are non-trivial

2. **Add drag-to-reschedule API** ([src/routes/tasks.js](src/routes/tasks.js))
   - Action: Use existing `PUT /api/tasks/:id` for date updates
   - Batch update: `POST /api/tasks/batch-update` for multi-select drag
   - Risk: Low (backend already supports individual updates)

3. **Add touch support** ([public/app.js](public/app.js#L919))
   - Action: Extend existing `touchDnD` polyfill or implement Gantt-specific touch handlers
   - Risk: Medium

4. **Add keyboard alternative** ([public/app.js](public/app.js))
   - Action: Arrow keys to move selected task date ±1 day, Shift+Arrow for ±1 week
   - Why: WCAG compliance — drag-and-drop must have keyboard alternative
   - Risk: Low

5. **Add undo support** ([public/app.js](public/app.js))
   - Action: Show toast with undo after drag-reschedule (restore previous dates)
   - Risk: Low

6. **Write tests** (Files: `test/gantt-drag.test.js`)
   - Test: Date calculation from pixel offset, snap-to-grid, boundary conditions (past dates, no due_date)
   - Coverage: Unit + E2E

---

## Dependency Graph

```
Phase 1 (no blockers):
  #5 Delete habit ─────────────────────────── independent
  #6 View/edit habits ─────────────────────── independent
  #10 Edit list items ─────────────────────── independent
  #11 Clear notifications ─────────────────── independent
  #1 Automation backup ────────────────────── independent

Phase 2 (can start after Phase 1):
  #12 Background focus timer ──────────────── independent
  #3 Better daily reflection ──────────────── independent
  #9 Improved task edit UI ────────────────── independent
  #14 Better calendar styling ─────────────── independent

Phase 3 (can start after Phase 1):
  #2 Pin life areas ───────────────────────── independent
  #8 Habit analytics ──────→ depends on #6 (habit detail view)
  #13 Direct task creation ────────────────── independent

Phase 4 (after Phase 2):
  #4 Task/subtask planner ──→ depends on #9 (task edit patterns)
  #7 Drag-drop timeline ───→ depends on #14 (calendar styling)
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Backup import silently drops data** | HIGH | Feature #1 adds round-trip test as regression gate |
| **Focus timer Web Worker browser compat** | MEDIUM | Fallback to `setInterval` when Workers unavailable |
| **SVG drag-drop complexity in Gantt** | HIGH | Start with simple horizontal drag only; defer resize to v2 |
| **Large `app.js` (5,966 lines) getting bigger** | MEDIUM | Extract new views into `public/js/` modules progressively |
| **Accessibility regressions** | MEDIUM | Each phase includes a11y review before merge |
| **Task edit panel redesign breaks workflows** | MEDIUM | Ship behind a settings toggle initially; gather feedback |

---

## Testing Strategy Summary

| Phase | New Test Files | Test Types |
|-------|---------------|------------|
| 1 | `backup-completeness.test.js`, `habits-delete.test.js`, `list-items-edit.test.js`, `frontend-notifications.test.js` | Unit, Integration, Security |
| 2 | `focus-timer-worker.test.js`, `daily-review-ui.test.js`, `task-edit-ui.test.js`, `calendar-styling.test.js` | Unit, Integration, Frontend |
| 3 | `pinned-areas.test.js`, `stats-habits.test.js`, `area-quick-add.test.js` | Unit, Integration |
| 4 | `planner-view.test.js`, `tasks-batch-move.test.js`, `gantt-drag.test.js` | Unit, Integration, E2E |

**Coverage target:** 80%+ for all new code.

---

## Success Criteria

- [ ] All 14 features implemented and tested
- [ ] Export/import round-trip covers all 41 DB tables (zero data loss)
- [ ] Focus timer works reliably in background tabs
- [ ] All new UI is keyboard-navigable and screen-reader compatible
- [ ] No regressions in existing 6,348 tests
- [ ] Each phase independently deployable

---

## Implementation Notes

- **File size concern:** [app.js](public/app.js) is 5,966 lines. Phases 3-4 should extract new code into `public/js/` ES modules (planner.js, gantt-drag.js, habit-analytics.js).
- **No build step:** All new files must be vanilla JS. No transpilation or bundling.
- **After backend changes:** Restart server: `pkill -f "node src/server" && node src/server.js &`
- **After frontend changes:** Hard-refresh: `Ctrl+Shift+R`