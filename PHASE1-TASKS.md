# Phase 1: Quick Wins & Data Integrity — Parallel Task Cards

**Created**: 12 April 2026  
**Goal**: Fix obvious gaps, unblock daily workflows, ensure data safety  
**Streams**: 5 independent work streams for parallel execution  
**Estimated Duration**: 1–2 weeks

---

## File Ownership Matrix

| File | Stream 1 (Habit Delete) | Stream 2 (Habit Modal) | Stream 3 (List Items) | Stream 4 (Notifications) | Stream 5 (Backup) |
|------|:-:|:-:|:-:|:-:|:-:|
| `public/app.js` — `renderHabits()` (L5677–5820) | — | ✅ OWNS | — | — | — |
| `public/app.js` — habit delete handler (L5826–5829) | ✅ OWNS | — | — | — | — |
| `public/app.js` — `renderListDetail()` (L5196–5530) | — | — | ✅ OWNS | — | — |
| `public/app.js` — `loadBellReminders()` + `bellItem()` (L3158–3185) | — | — | — | ✅ OWNS | — |
| `public/app.js` — `showToast()` (L2649–2668) | READ ONLY | — | — | — | — |
| `public/styles.css` — new `.habit-detail-modal` rules | — | ✅ OWNS | — | — | — |
| `public/styles.css` — new `.bell-dismiss` rules | — | — | — | ✅ OWNS | — |
| `src/routes/features.js` — `DELETE /api/habits/:id` (L699–705) | ✅ OWNS | — | — | — | — |
| `src/routes/features.js` — `PUT /api/habits/:id` (L690–698) | — | READ ONLY | — | — | — |
| `src/routes/lists.js` — `PUT /api/lists/:id/items/:itemId` (L222+) | — | — | READ ONLY | — | — |
| `src/routes/data.js` — import handler (L230–500) | — | — | — | — | ✅ OWNS |
| `src/db/index.js` | READ ONLY | — | — | — | READ ONLY |
| `tests/habits-delete.test.js` (NEW) | ✅ OWNS | — | — | — | — |
| `tests/habits-detail-modal.test.js` (NEW) | — | ✅ OWNS | — | — | — |
| `tests/list-items-edit.test.js` (NEW) | — | — | ✅ OWNS | — | — |
| `tests/notifications-clear.test.js` (NEW) | — | — | — | ✅ OWNS | — |
| `tests/backup-completeness.test.js` (NEW) | — | — | — | — | ✅ OWNS |

**Rule**: No file may have two owners. Shared files (e.g., `app.js`) are partitioned by function/line range. If integration is needed, the lead applies changes sequentially.

---

## Shared Dependencies & Integration Points

### Shared Utilities (READ-ONLY for all streams)
- `showToast(msg, undoFn, duration)` at `public/app.js:2649` — Streams 1 & 4 use this; do NOT modify
- `esc(s)` / `escA(s)` — HTML escaping helpers; do NOT modify
- `api.get()` / `api.put()` / `api.del()` — API client at `public/js/api.js`; do NOT modify
- `fmtDue(d)` — Date formatter; do NOT modify

### API Contracts (no conflicts)
| Endpoint | Used By | Status |
|----------|---------|--------|
| `DELETE /api/habits/:id` | Stream 1 | Already exists (L699) |
| `PUT /api/habits/:id` | Stream 2 | Already exists (L690) |
| `GET /api/habits` | Stream 2 | Already exists |
| `PUT /api/lists/:id/items/:itemId` | Stream 3 | Already exists (L222) |
| `GET /api/reminders` | Stream 4 | Already exists |
| `POST /api/import` | Stream 5 | Already exists (L195) |
| `GET /api/export` | Stream 5 | Already exists |

### Database Tables (READ-ONLY schema — no migrations needed)
- `habits` — FK: `user_id → users ON DELETE CASCADE`
- `habit_logs` — FK: `habit_id → habits ON DELETE CASCADE` ✅ (verified at db/index.js:205)
- `list_items` — FK: `list_id → lists` (cascade via lists)
- `automation_rules` — 15 columns total, import currently only writes 6

---

## Stream 1: Delete Habit — Undo Toast + Cascade Tests

**Owner**: Implementer 1  
**Effort**: Quick (2–4 hours)  
**Priority**: High  

### Context
Backend `DELETE /api/habits/:id` exists at `src/routes/features.js:699`. Frontend handler at `public/app.js:5826` calls `api.del()` with a basic `confirm()` dialog. The cascade from `habit_logs` to `habits` is handled by SQLite FK (`ON DELETE CASCADE`). What's missing: undo toast (matching the goal deletion UX pattern) and comprehensive tests.

### Subtasks

#### 1.1 Add undo toast to habit deletion
**File**: `public/app.js` — lines 5826–5829 (habit delete handler)  
**Action**: Replace the basic `confirm()` + immediate delete with a soft-delete + undo toast pattern:
```
1. On delete click, hide the habit card visually
2. Call showToast('Habit deleted', undoFn) where undoFn restores the card
3. After toast timeout (5s), actually call api.del('/api/habits/' + id)
4. On undo, unhide the card and cancel the delete
```
**Reference pattern**: Search for existing undo usage — `showToast` already supports `undoFn` param (L2649).  
**Acceptance criteria**:
- [x] Clicking delete shows undo toast instead of browser confirm
- [x] Undo restores the habit without API call
- [x] After 5s timeout, the DELETE fires
- [x] Habit logs cascade automatically (no extra cleanup needed)

#### 1.2 Write habit deletion tests
**File**: `tests/habits-delete.test.js` (NEW)  
**Action**: Create test file covering:
```
- DELETE /api/habits/:id returns 200 + { ok: true }
- Cascade: habit_logs are deleted when habit is deleted
- 404 for non-existent habit ID
- IDOR: user A cannot delete user B's habit
- Invalid ID (non-integer) returns 400
- Deleting habit doesn't affect other user's habits
- Verify habit count decrements after delete
```
**Test pattern**: Use existing test helpers — see `tests/habits.test.js` for `makeHabit()` factory.  
**Acceptance criteria**:
- [x] All 7+ test cases pass
- [x] Tests use temp DB isolation (`DB_DIR` env var)
- [x] Uses `beforeEach` cleanup

### Dependencies
- None — fully independent

### Ready to Implement Checklist
- [x] Backend endpoint exists and works
- [x] `showToast` supports undo callback
- [x] `habit_logs` FK cascade confirmed (`ON DELETE CASCADE`)
- [x] Test factory `makeHabit()` exists in test helpers
- [x] No schema changes needed
- [x] No shared file conflicts with other streams

---

## Stream 2: Habit Detail Modal — 90-Day Heatmap + Edit UI

**Owner**: Implementer 2  
**Effort**: Quick–Medium (4–8 hours)  
**Priority**: High  

### Context
Backend `PUT /api/habits/:id` and `GET /api/habits` exist. Frontend has inline edit via a toggle that reuses the creation form (L5833–5858). This is awkward UX — clicking a habit should open a rich detail modal showing heatmap, streaks, and edit fields. The `renderHabits()` function (L5677–5820) handles all habit rendering.

### Subtasks

#### 2.1 Create habit detail modal
**File**: `public/app.js` — add new function `openHabitDetail(habitId)` after `renderHabits()` (after L5870)  
**Action**: Build a modal overlay with:
```
1. Header: habit icon + name + color indicator + close button
2. Stats row: current streak, longest streak, total completions, completion rate
3. 90-day heatmap: grid of 90 cells colored by completion count (similar to GitHub contribution graph)
4. Edit section: inline fields for name, icon, color, frequency, target, area, preferred_time
5. Log history: scrollable list of recent log entries (last 30 days)
6. Footer: Save button + Delete button (delegates to Stream 1's handler)
```
**Data source**: `GET /api/habits` returns habit with logs. For heatmap, use `GET /api/habits/:id/heatmap` if it exists, or compute from habit_logs client-side.  
**Acceptance criteria**:
- [x] Clicking a habit card opens the detail modal
- [x] 90-day heatmap renders with color intensity based on completion count
- [x] Edit fields pre-populate with current values
- [x] Save calls `PUT /api/habits/:id` and closes modal
- [x] Escape key closes modal
- [x] Modal is accessible (ARIA labels, focus trap)

#### 2.2 Add habit detail CSS
**File**: `public/styles.css` — append new rules at end of file  
**Action**: Add styles for:
```css
.habit-detail-modal { /* overlay matching existing modal patterns */ }
.habit-heatmap { /* 90-cell grid, ~13 cols × 7 rows */ }
.habit-heatmap-cell { /* colored squares with hover tooltip */ }
.habit-stat-card { /* stats row cards */ }
.habit-log-entry { /* log history items */ }
```
**Reference**: Match existing `.modal` and `.ov` styling patterns.  
**Acceptance criteria**:
- [x] Modal is centered, scrollable, responsive
- [x] Heatmap cells are 14–16px squares with 2px gap
- [x] Dark mode compatible (uses CSS variables)

#### 2.3 Wire habit card click to modal
**File**: `public/app.js` — within `renderHabits()` event wiring (L5820–5870)  
**Action**: Add click handler to `.hab-card` elements that calls `openHabitDetail(habitId)`.  
**Acceptance criteria**:
- [x] Clicking habit card (not the checkbox or buttons) opens detail modal
- [x] Existing log/edit/delete buttons still work independently

#### 2.4 Write habit detail tests
**File**: `tests/habits-detail-modal.test.js` (NEW)  
**Action**: 
```
- PUT /api/habits/:id validates name, frequency values
- PUT /api/habits/:id allows partial updates
- IDOR: user A cannot edit user B's habit
- GET /api/habits returns all habits with log data
- Frontend: validate modal HTML contains required ARIA attributes (static test)
```
**Acceptance criteria**:
- [x] All test cases pass
- [x] Tests cover both API validation and static frontend checks

### Dependencies
- Stream 1 owns the delete handler — if user clicks "Delete" in the modal, it should call the same handler from Stream 1. **Integration point**: Stream 2 should call the same `api.del()` + toast pattern. Coordinate after both are done.

### Ready to Implement Checklist
- [x] `PUT /api/habits/:id` exists and handles partial updates
- [x] `GET /api/habits` returns habit list
- [x] Modal patterns exist in codebase (see `openDP()` for task detail)
- [x] CSS variable system exists for theming
- [x] No schema changes needed
- [x] Owned line ranges don't overlap with other streams

---

## Stream 3: Edit List Items — Inline Edits + Metadata

**Owner**: Implementer 3  
**Effort**: Quick (3–5 hours)  
**Priority**: High  

### Context
Backend `PUT /api/lists/:id/items/:itemId` exists at `src/routes/lists.js:222` and supports updating `title`, `checked`, `category`, `quantity`, `note`, `position`, `metadata` (JSON). Frontend `renderListDetail()` at `public/app.js:5196` renders items with check/delete only — no edit UI.

### Subtasks

#### 3.1 Add inline title editing
**File**: `public/app.js` — within `renderListDetail()` event wiring section (after item rendering, ~L5350+)  
**Action**:
```
1. On double-click of .li-title span, replace with <input> pre-filled with current title
2. On Enter or blur: call PUT /api/lists/:listId/items/:itemId with { title: newValue }
3. On Escape: revert to original text, remove input
4. Show subtle border/highlight during edit mode
```
**Acceptance criteria**:
- [x] Double-click on title enters edit mode
- [x] Enter saves, Escape cancels
- [x] Empty title is rejected (show validation error)
- [x] Blur saves (same as Enter)

#### 3.2 Add metadata edit expansion
**File**: `public/app.js` — within `renderListDetail()` (same section)  
**Action**:
```
1. Add a small edit icon (pencil) to each list item row
2. On click, expand an inline form below the item with fields:
   - title (text input)
   - quantity (number input)
   - note (textarea)
   - category (text input)
   - For enhanced lists: price (number), url (url input), rating (1-5 select)
3. Save button calls PUT with all fields
4. Cancel collapses the form
```
**Acceptance criteria**:
- [x] Edit icon visible on hover / always visible on mobile
- [x] Expansion form pre-fills with current values
- [x] Save calls PUT and refreshes the item display
- [x] Only one item can be in edit mode at a time

#### 3.3 Write list item edit tests
**File**: `tests/list-items-edit.test.js` (NEW)  
**Action**:
```
- PUT /api/lists/:id/items/:itemId updates title successfully
- PUT updates quantity, note, category, metadata
- PUT rejects empty title
- IDOR: user A cannot edit user B's list items
- 404 for non-existent item
- Verify metadata JSON round-trip (save + read back)
```
**Reference**: See `tests/lists.test.js` and `tests/list-exhaustive.test.js` for existing patterns.  
**Acceptance criteria**:
- [x] All 6+ test cases pass
- [x] Tests verify ownership chain (item → list → user)

### Dependencies
- None — fully independent  
- No shared files with other streams

### Ready to Implement Checklist
- [x] `PUT /api/lists/:id/items/:itemId` exists and works
- [x] Backend supports all fields (title, quantity, note, category, metadata)
- [x] Existing test infrastructure covers lists (`tests/lists.test.js`)
- [x] No schema changes needed
- [x] `renderListDetail()` line range doesn't overlap with other streams

---

## Stream 4: Clear Notifications — Dismiss UI + localStorage

**Owner**: Implementer 4  
**Effort**: Quick (2–4 hours)  
**Priority**: Medium  

### Context
Notification bell at `public/app.js:3158` (`loadBellReminders()`) fetches computed reminders from `GET /api/reminders`. Items are overdue/today/upcoming tasks — NOT persistent notifications. There is no dismiss mechanism. Since these are computed (not stored), dismissal should use `localStorage` on the client side. No backend changes needed.

### Subtasks

#### 4.1 Add "Clear all" button to bell dropdown
**File**: `public/app.js` — within `loadBellReminders()` (L3158–3175)  
**Action**:
```
1. Add a header bar at the top of the bell dropdown:
   <div class="bell-header">
     <span>Notifications</span>
     <button id="bell-clear-all">Clear all</button>
   </div>
2. On click, store all current task IDs in localStorage key 'lf-dismissed-notifs'
3. Re-render the bell dropdown (filter out dismissed IDs)
4. Update badge count to reflect only non-dismissed items
5. Reset dismissed set daily (store date alongside IDs, clear if date changes)
```
**localStorage schema**:
```json
{
  "date": "2026-04-12",
  "ids": [42, 67, 103]
}
```
**Acceptance criteria**:
- [x] "Clear all" button visible in bell dropdown header
- [x] Clicking clears all items and updates badge to 0
- [x] Dismissed notifications don't re-appear on next bell open
- [x] Dismissed set resets the next day

#### 4.2 Add per-item dismiss button
**File**: `public/app.js` — within `bellItem()` function (L3176–3180)  
**Action**:
```
1. Add a small × button to each bell-item:
   <span class="bell-dismiss" data-dismiss="${t.id}">×</span>
2. On click (stopPropagation to avoid opening task detail):
   - Add task ID to dismissed set in localStorage
   - Remove the DOM element
   - Update badge count
```
**Acceptance criteria**:
- [x] × button visible on each notification item
- [x] Clicking × removes that item only
- [x] Badge count decrements by 1
- [x] Dismissed item stays dismissed until daily reset

#### 4.3 Add bell dismiss CSS
**File**: `public/styles.css` — append new rules  
**Action**:
```css
.bell-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--brd); }
.bell-header button { font-size: 11px; color: var(--brand); background: none; border: none; cursor: pointer; }
.bell-dismiss { opacity: 0.4; cursor: pointer; margin-left: auto; font-size: 14px; }
.bell-dismiss:hover { opacity: 1; color: var(--err); }
```

#### 4.4 Write notification clear tests
**File**: `tests/notifications-clear.test.js` (NEW)  
**Action**:
```
- GET /api/reminders returns expected structure (overdue, today, upcoming arrays)
- Static validation: bell dropdown HTML contains clear-all button
- Static validation: bellItem HTML contains dismiss button
- localStorage round-trip: store dismissed IDs, verify filtering works
```
**Note**: These are mostly frontend validation tests since no backend changes are made.  
**Acceptance criteria**:
- [x] All test cases pass
- [x] Tests validate DOM structure (static)
- [x] Tests verify localStorage schema

### Dependencies
- None — fully independent  
- No backend changes, no shared files

### Ready to Implement Checklist
- [x] `GET /api/reminders` exists and returns structured data
- [x] Bell dropdown UI exists (L3158–3185)
- [x] `localStorage` is available (SPA, no SSR)
- [x] No schema changes needed
- [x] Owned line ranges don't overlap with other streams

---

## Stream 5: Automation Rules Backup — Import Logic + Validation Tests

**Owner**: Implementer 5  
**Effort**: Medium (4–8 hours)  
**Priority**: High  

### Context
Export (`GET /api/export`) includes `automation_rules` with all 15 columns. Import (`POST /api/import`) at `src/routes/data.js:402` **does** import automation_rules but only writes 6 of 15 columns: `name, trigger_type, trigger_config, action_type, action_config, enabled`. Missing columns: `conditions, actions, description, template_id` (4 critical fields for multi-action rules). Also missing from import entirely: `daily_reviews`, `user_xp`, `automation_log`, `custom_statuses`, `focus_session_meta`, `focus_steps`.

### Subtasks

#### 5.1 Fix automation_rules import to include all columns
**File**: `src/routes/data.js` — lines 402–406  
**Action**: Replace the incomplete INSERT with a full-column version:
```javascript
const insRule = db.prepare(`INSERT INTO automation_rules 
  (name, trigger_type, trigger_config, action_type, action_config, 
   conditions, actions, description, template_id, enabled, user_id) 
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
req.body.automation_rules.forEach(r => {
  insRule.run(
    r.name, r.trigger_type, r.trigger_config || '{}',
    r.action_type || '', r.action_config || '{}',
    r.conditions || null, r.actions || null,
    r.description || '', r.template_id || null,
    r.enabled !== undefined ? r.enabled : 1, req.userId
  );
});
```
**Security**: Validate that `action_config` containing webhook URLs doesn't point to private IPs. Use existing `isPrivateUrl()` if available, or add URL validation.  
**Acceptance criteria**:
- [x] All 10 data columns imported (excluding auto-generated: id, created_at, fire_count, last_fired_at, last_schedule_fire)
- [x] Multi-action rules (using `actions` JSON array) survive round-trip
- [x] Condition-based rules (using `conditions` JSON) survive round-trip

#### 5.2 Add missing table imports: daily_reviews, user_xp
**File**: `src/routes/data.js` — after automation_rules import block (~L410)  
**Action**: Add import sections for tables exported but not imported:
```javascript
// Daily reviews
if (Array.isArray(req.body.daily_reviews)) {
  db.prepare('DELETE FROM daily_reviews WHERE user_id=?').run(req.userId);
  const insReview = db.prepare('INSERT INTO daily_reviews (date, note, completed_count, user_id, created_at) VALUES (?,?,?,?,?)');
  req.body.daily_reviews.forEach(r => {
    insReview.run(r.date, r.note || '', r.completed_count || 0, req.userId, r.created_at || new Date().toISOString());
  });
}

// User XP history
if (Array.isArray(req.body.user_xp)) {
  db.prepare('DELETE FROM user_xp WHERE user_id=?').run(req.userId);
  const insXp = db.prepare('INSERT INTO user_xp (amount, reason, user_id, created_at) VALUES (?,?,?,?)');
  req.body.user_xp.forEach(x => {
    insXp.run(x.amount, x.reason || '', req.userId, x.created_at || new Date().toISOString());
  });
}
```
**Acceptance criteria**:
- [x] `daily_reviews` survive export → import round-trip
- [x] `user_xp` survive export → import round-trip

#### 5.3 Write comprehensive backup round-trip test
**File**: `tests/backup-completeness.test.js` (NEW)  
**Action**: Create a test that:
```
1. Register user + create one of every entity type:
   - area, goal, task, subtask, tag, task_tag, habit, habit_log,
     focus_session, note, list, list_item, template, filter,
     automation_rule (with conditions + actions), custom_field_def,
     custom_value, weekly_review, daily_review, inbox item,
     badge, user_xp entry, setting
2. Export via GET /api/export
3. Delete all user data
4. Import via POST /api/import (send the exported JSON)
5. Export again via GET /api/export
6. Compare: entity counts in export1 vs export2 must match
7. Verify critical fields: automation_rules.conditions, .actions, .description survive
```
**Edge case tests**:
```
- Import with empty arrays (no crash)
- Import with missing optional fields (defaults applied)
- Import with orphaned references (gracefully skipped)
- Re-import over existing data (idempotent — deletes + recreates)
```
**Acceptance criteria**:
- [x] Round-trip test passes for all imported tables
- [x] Edge cases don't crash
- [x] Test identifies any tables in export but not in import

#### 5.4 Security: validate webhook URLs in imported automation rules
**File**: `src/routes/data.js` — within automation_rules import  
**Action**:
```javascript
// Before inserting, validate webhook URLs in action_config
if (r.action_type === 'webhook' && r.action_config) {
  try {
    const config = typeof r.action_config === 'string' ? JSON.parse(r.action_config) : r.action_config;
    if (config.url) {
      const url = new URL(config.url);
      if (['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(url.hostname) || 
          url.hostname.endsWith('.local') || url.hostname.startsWith('10.') ||
          url.hostname.startsWith('192.168.') || url.hostname.startsWith('172.')) {
        return; // Skip this rule — private IP
      }
    }
  } catch(e) { /* invalid JSON, skip validation */ }
}
```
**Acceptance criteria**:
- [x] Imported webhook rules with private IPs are rejected/skipped
- [x] Valid public webhook URLs are imported normally
- [x] Test covers SSRF prevention

### Dependencies
- None — the only file touched (`src/routes/data.js`) is exclusively owned by this stream

### Ready to Implement Checklist
- [x] Export endpoint works and includes all tables
- [x] Import handler structure is clear (sequential entity imports)
- [x] `automation_rules` table schema has 15 columns (verified)
- [x] Existing import already handles: areas, goals, tasks, subtasks, tags, habits, habit_logs, focus_sessions, notes, lists, list_items, templates, filters, weekly_reviews, inbox, badges, settings, webhooks, api_tokens, push_subscriptions, custom_fields, custom_values, milestones
- [x] Missing imports identified: daily_reviews, user_xp (+ partial automation_rules)
- [x] No schema changes needed
- [x] No shared file conflicts

---

## Blockers & Risks

### No Blockers Found
All 5 streams can start immediately. Every backend endpoint already exists. No database migrations are needed. No external dependencies to install.

### Low Risks
| Risk | Stream | Mitigation |
|------|--------|------------|
| `app.js` is 7400+ lines — merge conflicts possible | 1, 2, 3, 4 | Each stream owns non-overlapping line ranges. Apply changes sequentially if needed. |
| Habit delete undo timing vs. actual API call | 1 | Use `setTimeout` pattern — cancel on undo, fire on expiry |
| 90-day heatmap data may need extra API call | 2 | Can compute from existing `habit_logs` data client-side |
| `localStorage` dismissed IDs could grow | 4 | Daily reset prevents unbounded growth |
| Webhook URL validation edge cases | 5 | Use conservative blocklist (private IPs only), allow everything else |

### Integration Checklist (Post-Implementation)
After all 5 streams complete:
- [ ] Run full test suite: `npm test` (all 6,348+ tests must pass)
- [ ] Verify no merge conflicts in `app.js` or `styles.css`
- [ ] Test habit delete → undo → detail modal interaction (Streams 1 + 2)
- [ ] Test full export → import round-trip with all new test data (Stream 5)
- [ ] Hard-refresh browser (`Ctrl+Shift+R`) and verify all UI changes
- [ ] Update CLAUDE.md test metrics if new test count changes significantly

---

## Execution Order

All 5 streams are independent and can execute in parallel. Suggested ordering within each stream:

1. **Tests first** (TDD) — write failing tests
2. **Backend changes** (if any) — Streams 1 and 5 have backend work
3. **Frontend changes** — Streams 1, 2, 3, 4 have frontend work
4. **CSS changes** — Streams 2 and 4 have styling work
5. **Verify** — run tests, manual smoke test

**Total new test files**: 5  
**Total new CSS rules**: ~20 lines  
**Backend files modified**: 1 (`src/routes/data.js`)  
**Frontend files modified**: 1 (`public/app.js`) — 4 non-overlapping sections  
**Estimated new tests**: 30–50  
