# LifeFlow Admin Improvements Roadmap

**Date**: April 12, 2026  
**Source**: Admin user's "List of improvements" (Database)  
**Total Improvements**: 14  
**Estimated Timeline**: 9-12 weeks

---

## Executive Summary

The admin user has requested 14 improvements spanning data integrity, feature completeness, UI/UX polish, and new capabilities. This document prioritizes them into 4 phased releases with expert assignments.

**Key Finding**: 3 features (#5, #6, #12) are already partially implemented in the backend — the work is UX improvement or completing the implementation.

---

## All 14 Improvements (From Database)

| # | Feature | Status | Phase | Effort | Impact |
|---|---------|--------|-------|--------|--------|
| 1 | Automation rules backup | Export done, import missing | 1 | Medium | High |
| 2 | Pin life areas/favorites | Not started | 3 | Medium | Medium |
| 3 | Better daily reflection UI | Basic wizard exists | 2 | Medium | Medium |
| 4 | Task/subtask planner | Not started | 4 | Major | High |
| 5 | Delete habit | Backend done, needs UX | 1 | Quick | High |
| 6 | View/edit habits | Backend done, needs UI | 1 | Quick | High |
| 7 | Drag-drop tasks in timeline | Timeline exists, no drag | 4 | Major | Medium |
| 8 | Habit review/analytics | Not started | 3 | Medium | Medium |
| 9 | Improved task edit UI | UI exists, needs polish | 2 | Medium | Medium |
| 10 | Edit list items | Backend done, no UI | 1 | Quick | High |
| 11 | Clear notifications | No backend needed | 1 | Quick | Medium |
| 12 | Background focus timer | Paused in background tab | 2 | Medium | High |
| 13 | Direct task creation in area | Manual navigation required | 3 | Quick | Medium |
| 14 | Better calendar view styling | Functional but dull | 2 | Medium | Medium |

---

## Phase 1: Quick Wins & Data Integrity (1-2 weeks)

**Goal**: Fix obvious gaps, unblock daily workflows, ensure data safety.

**Features**: #5, #6, #10, #11, #1

### 1.1 Delete Habit (#5)

**Current State**: Backend `DELETE /api/habits/:id` exists. Frontend delete buttons work.

**Work**:
- [ ] Verify cascade behavior (FK on `habit_logs` → `habits`)
- [ ] Add undo toast notification (match goal deletion pattern)
- [ ] Write CRUD tests (authorization, cascade, 404 handling)

**Files**: `src/db/index.js`, `public/app.js`, `tests/habits-delete.test.js`

---

### 1.2 View and Edit Habits (#6)

**Current State**: Backend `PUT /api/habits/:id` exists. Frontend has basic inline edit through toggle.

**Work**:
- [ ] Create dedicated habit detail modal (like task dropdown detail)
- [ ] Display 90-day heatmap, streak counter, total completions
- [ ] Add inline edit fields (name, icon, color, frequency)
- [ ] Show log history with individual entries
- [ ] Add CSS for `.habit-detail-modal`
- [ ] Write tests for modal structure and keyboard navigation

**Files**: `public/app.js`, `public/styles.css`, `tests/habits-edit.test.js`

---

### 1.3 Edit List Items (#10)

**Current State**: Backend `PUT /api/lists/:id/items/:itemId` exists. Frontend only shows check/delete.

**Work**:
- [ ] Make list item title editable on click (replace span with input)
- [ ] Save on Enter/blur via API call
- [ ] Escape cancels edit
- [ ] Add metadata editor for quantity, note, category, price, url, rating
- [ ] Write tests for PUT validation and ownership checks

**Files**: `public/app.js`, `tests/list-items-edit.test.js`

---

### 1.4 Clear Notifications (#11)

**Current State**: Notification bell shows computed reminders. No dismiss mechanism.

**Work**:
- [ ] Add "Clear all" button to bell dropdown
- [ ] Track dismissed task IDs in `localStorage`
- [ ] Filter dismissed items from bell display
- [ ] Add per-item dismiss `×` button
- [ ] Update badge count after clearing
- [ ] Write frontend validation tests

**Files**: `public/app.js`, `tests/frontend-notifications.test.js`

---

### 1.5 Automation Rules Backup (#1)

**Current State**: Export includes `automation_rules`. Import **silently drops them**.

**Work**:
- [ ] Add automation_rules import logic to `/api/import`
- [ ] Validate webhook URLs in action_config (reject private IPs)
- [ ] Add automation_log to export (for auditing)
- [ ] Add daily_reviews, inbox, user_xp, badges to import
- [ ] Create comprehensive backup round-trip test (all 41 tables)
- [ ] Edge case testing (empty arrays, missing fields, orphaned refs)

**Files**: `src/routes/data.js`, `tests/backup-completeness.test.js`

**Security Note**: Use existing `isPrivateUrl()` helper to validate webhook URLs during import.

---

## Phase 2: UI/UX Polish & Reliability (2-3 weeks)

**Goal**: Improve daily-use views and fix focus timer reliability.

**Features**: #12, #3, #9, #14

### 2.1 Background Focus Timer (#12)

**Current State**: `setInterval` pauses when tab backgrounded (browser throttling).

**Work**:
- [ ] Create Web Worker (`public/timer-worker.js`) to run timer independently
- [ ] Replace `setInterval` with worker messages in main thread
- [ ] Implement Notification API for completion alert
- [ ] Add audio chime on completion (AudioContext or <audio>)
- [ ] Handle worker lifecycle, errors, fallback to setInterval
- [ ] Write worker round-trip and accuracy tests

**Files**: `public/timer-worker.js`, `public/app.js`, `tests/focus-timer-worker.test.js`

---

### 2.2 Better Daily Reflection UI (#3)

**Current State**: 3-step wizard overlay exists (basic HTML/inline styles).

**Work**:
- [ ] Redesign step 1 (Yesterday's Review):
  - Visual accomplishment cards with goal colors
  - Mini completion chart (sparkline or bar)
  - Emotional check-in (1-5 scale)
  - Save check-in to `daily_reviews.note`
- [ ] Redesign step 2 (Today's Plan):
  - Goal-grouped task cards with progress
  - Time estimate summary
  - Drag-to-reorder for prioritization
- [ ] Redesign step 3 (Task Picker):
  - Filter by area, tag, priority
  - Search within backlog
  - Show task metadata (due, time estimate, tags)
- [ ] Add CSS for visual cards and layouts
- [ ] Write accessibility tests (ARIA labels, keyboard nav)

**Files**: `public/app.js`, `public/styles.css`, `tests/daily-review-ui.test.js`

---

### 2.3 Improved Task Edit UI (#9)

**Current State**: Slide-out panel with long vertical form (basic layout).

**Work**:
- [ ] Reorganize panel into logical sections:
  - Header: title, priority, status
  - Dates: due_date, due_time, start_date, recurring
  - Hierarchy: goal_id, parent_id (with drag-drop parent selector)
  - Details: tags, assigned_to, estimated_minutes, list_id
  - Advanced: custom_fields, dependencies, color
- [ ] Conditional display: only show fields relevant to current context
- [ ] Add collapse/expand for sections
- [ ] Improve field styling and spacing
- [ ] Better autocomplete for goal, parent, assigned_to

**Files**: `public/app.js`, `public/styles.css`, `tests/task-edit-ui.test.js`

---

### 2.4 Better Calendar View Styling (#14)

**Current State**: Day/week/3-day views are functional but plain.

**Work**:
- [ ] Improve event card styling (better colors, borders, shadows)
- [ ] Add typography improvements (font sizes, weights, spacing)
- [ ] Better grid layout with improved day/week cell spacing
- [ ] Visual hierarchy for multi-day events
- [ ] Hover/focus states for interactive elements
- [ ] Dark mode support

**Files**: `public/styles.css`, `tests/calendar-styling.test.js`

---

## Phase 3: Feature Enhancements (2-3 weeks)

**Goal**: Add new navigation and analytics features.

**Features**: #2, #8, #13

### 3.1 Pin Life Areas/Favorites (#2)

**Current State**: Life areas sidebar is fixed order (alphabetical or creation order).

**Work**:
- [ ] Add `pinned_order` column to `life_areas` table (nullable int)
- [ ] Add pin UI (star icon) on area cards/sidebar
- [ ] Reorder logic: pinned areas first (by pin_order), then unpinned
- [ ] Implement drag-to-reorder for pinned areas
- [ ] Save reorder to database on drop
- [ ] Write drag-drop and reorder tests

**Files**: `src/db/index.js`, `public/app.js`, `tests/pinned-areas.test.js`

---

### 3.2 Habit Review/Analytics (#8)

**Current State**: Habits view only shows logging UI. No performance dashboard.

**Work**:
- [ ] Create dedicated habit analytics view:
  - Performance dashboard (completion %, streaks, trends)
  - 365-day heatmap (like GitHub contribution graph)
  - Comparison mode (habit A vs habit B completion rates)
  - Monthly breakdown chart
  - Best/worst days for habit execution
- [ ] Add filtering and grouping options
- [ ] Export habit data (CSV)

**Files**: `public/app.js`, `public/styles.css`, `tests/habit-analytics.test.js`

---

### 3.3 Direct Task Creation in Life Area (#13)

**Current State**: Must navigate to goal or area, then click "+ Task" button.

**Work**:
- [ ] Add quick-create form to area detail view (appears by default)
- [ ] Pre-fill goal_id from current area context
- [ ] Allow rapid creation (create → clear → ready for next)
- [ ] Show created task confirmed with toast

**Files**: `public/app.js`, `tests/quick-task-create.test.js`

---

## Phase 4: Major Features (3-4 weeks)

**Goal**: Implement significant new capabilities.

**Features**: #4, #7

### 4.1 Task/Subtask Planner (#4)

**Current State**: No dedicated planning view. Task hierarchy exists but no visual planner.

**Work**:
- [ ] Create planner interface with:
  - Main task input at top
  - Hierarchical breakdown editor (drag subtasks to group them)
  - Time estimation (per-task estimate, auto-sum parent)
  - Dependency mapping (visual lines between tasks)
  - Time-box visualization (timeline showing estimated vs actual)
- [ ] Save planning session (create task + all auto-generated subtasks in transaction)
- [ ] Templates for common planning patterns (GTD, Agile story breakdown)

**Files**: `public/app.js`, `public/styles.css`, `src/routes/tasks.js`, `tests/planner.test.js`

---

### 4.2 Drag-Drop Tasks in Timeline (#7)

**Current State**: Gantt/timeline view exists. No drag-to-reschedule.

**Work**:
- [ ] Implement drag handler on task bars
- [ ] Visual feedback while dragging (highlight drop zone)
- [ ] Validate drop (check date conflicts, dependencies)
- [ ] Save new date via `PUT /api/tasks/:id` (update due_date)
- [ ] Show conflict warnings if dragging violates dependencies
- [ ] Write drag-drop and conflict detection tests

**Files**: `public/app.js`, `tests/timeline-drag-drop.test.js`

---

## Expert & Team Assignments

### Phase 1: Quick Wins (5 features, 1-2 weeks)

**Experts**:
- `backend-architect` — Review automation backup security
- `security-auditor` — Webhook URL validation
- `test-automator` — Backup round-trip test design

**Team Lead**: `team-lead` (coordinate 5-person parallel effort)

**Implementers**: `team-implementer` (5 independent streams)
1. Delete habit + undo toast
2. Habit detail modal
3. List item editing
4. Notification dismissal
5. Automation backup + validation

---

### Phase 2: UI/UX (4 features, 2-3 weeks)

**Experts**:
- `frontend-architect` — Redesign strategy for modals and panels
- `ui-designer` — Visual polish and component design
- `performance-engineer` — Web Worker optimization
- `accessibility-expert` — WCAG compliance (ARIA, keyboard nav)

**Team Lead**: `frontend-developer`

**Implementers**: `team-implementer` (4 parallel streams)
1. Focus timer + Web Worker
2. Daily reflection UI redesign
3. Task edit panel reorganization
4. Calendar styling improvements

---

### Phase 3: Features (3 features, 2-3 weeks)

**Experts**:
- `backend-architect` — Database schema changes (pinned_order)
- `database-optimizer` — Query optimization for heatmap/analytics
- `ui-designer` — Analytics dashboard design

**Team Lead**: `team-lead`

**Implementers**: `team-implementer` (3 parallel streams)
1. Pin life areas + reorder UI
2. Habit analytics dashboard
3. Quick task creation in area

---

### Phase 4: Major Features (2 features, 3-4 weeks)

**Experts**:
- `architect` — System design for planner and drag-drop
- `frontend-architect` — Complex UI coordination
- `performance-engineer` — Drag-drop performance optimization

**Team Lead**: `architect` + `frontend-developer` (coordinated leadership)

**Implementers**: `team-implementer` (2 major streams)
1. Task/subtask planner (hierarchical UI, templating)
2. Timeline drag-drop scheduling (conflict detection)

---

## Testing Strategy

### Unit Tests
- Input validation (habit name length, frequency values)
- API contract tests (status codes, response shapes)
- Database cascade behavior (FK deletions)
- Utility functions (Web Worker messages, calendar formatting)

### Integration Tests
- Full CRUD cycles for each feature
- Authorization/IDOR checks (user isolation)
- Data consistency (export/import round-trips)
- Backup completeness (all 41 tables)

### E2E Tests
- User workflows (create habit → log → view analytics)
- Drag-drop interactions (timeline rescheduling)
- Modal open/close/scroll behaviors
- Keyboard navigation (focus trap, escape close)

### Visual Regression Tests
- Calendar styling changes
- Daily review card layouts
- Habit analytics dashboard
- Task edit panel reorganization

### Accessibility Tests
- Screen reader compatibility (all new modals)
- Keyboard navigation (tab order, focus visibility)
- Color contrast (text on backgrounds)
- ARIA labels (buttons, form fields)

### Performance Tests
- Web Worker memory usage
- Calendar rendering with 100+ events
- Heatmap rendering (365 days of data)
- Drag-drop smoothness (60 FPS target)

---

## Implementation Order & Dependencies

```
Phase 1 (Week 1-2): 5 Quick Wins
├─ Delete habit (no blockers)
├─ Habit detail modal (depends on delete stability)
├─ List item editing (no blockers)
├─ Notification dismissal (no blockers)
└─ Automation backup (must complete + test before Phase 2)

Phase 2 (Week 3-5): UI/UX Polish
├─ Focus timer Web Worker (can run parallel)
├─ Daily reflection redesign (no blockers)
├─ Task edit panel (no blockers)
└─ Calendar styling (can run parallel)

Phase 3 (Week 4-6): Features (can overlap Phase 2)
├─ Pin life areas (simple DB change)
├─ Habit analytics (depends on habit view)
└─ Quick task create (no blockers)

Phase 4 (Week 7-10): Major Features (start after Phase 2)
├─ Task planner (depends on stable task editing)
└─ Timeline drag-drop (depends on stable Gantt view)
```

---

## Success Criteria

- [ ] All 14 improvements delivered and tested
- [ ] Backup roundtrip test passes (all 41 tables)
- [ ] Accessibility audit passes (WCAG 2.2 AA)
- [ ] Performance: Web Worker timer accurate to ±500ms
- [ ] Performance: Drag-drop timeline maintains 60 FPS
- [ ] User adoption: All features documented in help/tooltips
- [ ] No regression: Existing tests pass (6,300+ tests)

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Web Worker compatibility | Low | Medium | Fallback to setInterval; test in all browsers |
| Drag-drop conflicts | Medium | High | Implement server-side validation; client-side preview |
| Analytics heatmap performance | Medium | Medium | Lazy-load heatmap; debounce zoom |
| Accessibility compliance | Low | High | Test with screen readers; involve accessibility expert |
| Data loss (backup import) | Low | Critical | Write comprehensive round-trip test; run pre-release validation |

---

## Questions for Planning Discussion

1. **Priority**: Should Phase 1 all ship together or stagger releases?
2. **Analytics**: For #8 (habit analytics), any preference for charting library (Chart.js, Recharts)?
3. **Planner**: For #4, should planner create tasks immediately or save as draft?
4. **Timeline**: Any hard deadline or is 9-12 week estimate acceptable?
5. **Collaboration**: Should pinned areas (#2) support team-level pinning or just personal?
