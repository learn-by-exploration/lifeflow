# Multi-Expert Improvement — Implementation Plan

> **Source:** [spec.md](spec.md) (9-expert analysis, 45 recommendations)
> **Baseline:** v0.5.1 | 1,885 tests | 76 test files | 185 routes | 32 tables | ~14,000 LOC
> **Final:** v0.6.0 | 1,931 tests | 78 test files | 190 routes | 33 tables | ~14,500 LOC
> **Status:** ✅ ALL PHASES COMPLETE (27 March 2026)
> **Date:** 27 March 2026

---

## Scope

This plan covers the spec's **Tier 1** (Do Now) and **Tier 2** (Do Next) items — 14 recommendations that are high-impact and achievable without architectural overhaul. Tiers 3–4 (WebSocket, calendar integration, mobile app, sync, cloud offering) are deferred to a future plan.

Organized into 6 phases. Each phase is independently shippable.

---

## Phase 0 — Critical Data Integrity

**Why first:** Export silently drops 16+ tables of data. Users who backup and restore lose custom fields, focus sessions, habits, comments, automation rules, and more. This is a data loss bug that must be fixed before any feature work.

### Task 0.1: Export All User Data Tables

**Type:** Bug fix + tests
**Spec ref:** Security 9.4, PM workflow gaps
**File:** `src/routes/data.js`

**Problem:** `GET /api/export` currently exports 16 tables but still misses several: `task_templates`, `weekly_reviews`, `inbox`, `badges`, `settings` (user preferences), `goal_milestones`. A full roundtrip (export → wipe → import) silently discards this data.

**Current state (from code inspection):** Export includes areas, goals, tasks, tags, habits, habit_logs, focus_sessions, task_comments, task_deps, notes, lists, list_items, custom_field_defs, task_custom_values, automation_rules, saved_filters. Missing: task_templates, weekly_reviews, inbox, badges, settings, goal_milestones, api_tokens (hashed, debatable), push_subscriptions, webhooks.

**Changes:**
- `src/routes/data.js` — Add missing tables to export: `task_templates`, `weekly_reviews`, `inbox`, `badges`, `settings`, `goal_milestones`
- `src/routes/data.js` — Add corresponding import logic for each new table (within the existing transaction)
- Skip security tables: `api_tokens` (hashed tokens are useless to export), `push_subscriptions` (device-specific), `webhooks` (contain secrets), `sessions`

**Tests:** 6 new (in existing `tests/data-integrity.test.js`)
```
1. Export includes task_templates
2. Export includes weekly_reviews
3. Export includes inbox items
4. Export includes goal_milestones
5. Export includes user settings
6. Full roundtrip: export → wipe → import → all record counts match for all exported tables
```

### Task 0.2: Docker Compose Hardening

**Type:** Security fix
**Spec ref:** Security 9.3
**File:** `docker-compose.yml`

**Problem:** Current volume mount `.:/app/data` exposes the entire project directory to the container. The container can write to source files, Dockerfile, tests, etc.

**Changes:**
- `docker-compose.yml` — Replace bind mount with named volume, add security options:
  ```yaml
  services:
    lifeflow:
      build: .
      ports:
        - "3456:3456"
      volumes:
        - lifeflow-data:/app/data
      restart: unless-stopped
      read_only: true
      tmpfs:
        - /tmp
      security_opt:
        - no-new-privileges:true
      deploy:
        resources:
          limits:
            memory: 512M
            cpus: '1.0'
  volumes:
    lifeflow-data:
  ```

**Tests:** None (infrastructure change). Verify with `docker compose up -d && docker compose exec lifeflow touch /app/test 2>&1` → should fail.

### Phase 0 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 0.1 Export completeness | Bug fix | 6 | data.js, data-integrity.test.js |
| 0.2 Docker hardening | Security | 0 | docker-compose.yml |
| **Total** | | **6** | |

---

## Phase 1 — Goal Progress & Intelligence

**Why second:** The spec's dominant insight: goals are "glorified folders." Making goal progress visible transforms LifeFlow from a task manager into a goal achievement system. This is the highest-value, lowest-effort improvement identified by PM, Life Coach, and Power User panels.

### Task 1.1: Goal Progress Visualization

**Type:** Feature (backend + frontend)
**Spec ref:** PM 3.4, Coach 7.1
**Files:** `src/routes/areas.js`, `public/app.js`

**Problem:** Area view shows goals as simple cards with title and task count. No progress bars, no deadline awareness, no "at risk" indicators.

**Backend changes:**
- `src/routes/areas.js` — Extend `GET /api/areas/:id/goals` (or the existing goal query) to include computed fields:
  - `total_tasks` — count of tasks in goal
  - `done_tasks` — count of tasks with status='done'
  - `progress_pct` — `Math.round(100 * done_tasks / total_tasks)` or 0 if no tasks
  - `overdue_count` — count of tasks with due_date < today and status != 'done'
  - `days_until_due` — `goal.due_date ? daysDiff(goal.due_date, today) : null`

**Frontend changes:**
- `public/app.js` — In the goal card rendering (Area view), add:
  - Progress bar div: `<div class="goal-prog"><div class="goal-prog-fill" style="width:${pct}%"></div></div>`
  - Text: `${done}/${total} tasks · ${pct}%`
  - Due date badge: `Due in N days` or `Overdue by N days` with color coding
  - "At risk" indicator if overdue_count > 0 and days_until_due < 7
- `public/styles.css` — Add `.goal-prog`, `.goal-prog-fill`, `.goal-at-risk` styles

**Tests:** 4 new
```
1. GET goals with progress — includes total_tasks, done_tasks, progress_pct
2. Goal with 0 tasks → progress_pct = 0
3. Goal with all done → progress_pct = 100
4. Goal with overdue tasks → overdue_count > 0
```

### Task 1.2: "What's Next?" Suggestions in Today View

**Type:** Feature (backend + frontend)
**Spec ref:** PM 3.2
**Files:** `src/routes/tasks.js` or `src/routes/stats.js`, `public/app.js`

**Problem:** When users complete all today's tasks (or open the app with nothing in My Day), there's no guidance on what to work on next.

**Backend changes:**
- `src/routes/tasks.js` — Add `GET /api/tasks/suggested` endpoint:
  - Returns top 5 tasks ranked by: overdue (+50), due within 3 days (+30), high priority (+20), stale >14 days (+10), quick win estimated_minutes ≤ 15 (+5)
  - Excludes tasks already in My Day
  - Filters by `user_id` and `status != 'done'`

**Frontend changes:**
- `public/app.js` — In `renderToday()`, after the main task sections, add a collapsible "What's Next?" section:
  - Only shows when My Day has <3 pending tasks or all are done
  - Each suggestion has a one-click "Add to My Day" button
  - Collapsed by default if My Day has ≥3 pending tasks

**Tests:** 4 new
```
1. GET /api/tasks/suggested returns up to 5 tasks
2. Overdue tasks ranked higher than non-overdue
3. Tasks already in My Day excluded from suggestions
4. No suggestions when all tasks are done → empty array
```

### Phase 1 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 1.1 Goal progress | Feature | 4 | areas.js, app.js, styles.css |
| 1.2 What's Next | Feature | 4 | tasks.js, app.js |
| **Total** | | **8** | |

---

## Phase 2 — Interaction Speed

**Why third:** The Power User and UI/UX Designer panels both identified excessive clicks for common operations. Context menus and bulk operations are the fastest way to reduce friction. The context menu pattern already exists for areas and lists — extending to tasks reuses existing infrastructure.

### Task 2.1: Task Context Menu

**Type:** Feature (frontend only)
**Spec ref:** Power User 8.2, Designer 4.2
**File:** `public/app.js`, `public/styles.css`

**Problem:** Editing a task's due date, priority, or My Day status requires opening the full detail panel (3 clicks). The context menu pattern already exists for areas (line 287) and lists (line 193) in app.js.

**Changes:**
- `public/app.js` — Add right-click handler on `.task-card` elements:
  - Reuse the existing `.ctx-menu` pattern (create div, position at click, close on outside click)
  - Actions:
    - **Due date shortcuts:** Today / Tomorrow / Next Week / Next Month / Pick date (date input)
    - **Priority:** P0 / P1 / P2 / P3 (radio buttons or icons)
    - **Add to My Day** / **Remove from My Day** (toggle)
    - **Duplicate** (POST to create task API with same data)
    - **Delete** (with confirmation)
    - **Start Focus** (navigate to focus timer with task pre-selected)
  - On mobile: trigger via long-press (reuse existing `touchDnD` long-press detection at 200ms threshold, but show menu instead of starting drag)
- `public/styles.css` — Extend existing `.ctx-menu` styles with sub-menu support for date/priority pickers

**Tests:** 2 new (static analysis in `tests/frontend-validation.test.js`)
```
1. app.js contains ctx-menu handler for task cards
2. app.js handles contextmenu event on task items
```

### Task 2.2: Bulk Operations Expansion

**Type:** Feature (backend + frontend)
**Spec ref:** Power User 8.1
**Files:** `src/routes/tasks.js`, `public/app.js`

**Problem:** Multi-select mode (`M` key) only supports: bulk complete, bulk delete, bulk set priority. Missing: move to goal, set due date, add/remove tag, set status, add to My Day.

**Backend changes:**
- `src/routes/tasks.js` — Add `PATCH /api/tasks/batch` endpoint:
  ```javascript
  // Body: { ids: [1,2,3], updates: { goal_id: 5 } }
  // or:   { ids: [1,2,3], updates: { due_date: '2026-04-01' } }
  // or:   { ids: [1,2,3], updates: { my_day: 1 } }
  // or:   { ids: [1,2,3], add_tags: [7, 12] }
  ```
  - Validate all task IDs belong to `req.userId`
  - Apply updates in a transaction
  - Return count of updated tasks

**Frontend changes:**
- `public/app.js` — Extend the multi-select action bar with dropdown buttons:
  - "Move to Goal" → dropdown of user's goals
  - "Set Due Date" → date picker popover
  - "Add Tag" → tag dropdown
  - "Set Status" → todo/doing/done buttons
  - "My Day" → add/remove toggle

**Tests:** 5 new
```
1. PATCH /api/tasks/batch with goal_id → all tasks moved
2. PATCH /api/tasks/batch with due_date → all tasks reschedule
3. PATCH /api/tasks/batch with my_day → all tasks flagged
4. PATCH /api/tasks/batch with add_tags → tags added to all
5. PATCH /api/tasks/batch with invalid task ID → 400
```

### Task 2.3: Command Palette

**Type:** Feature (frontend)
**Spec ref:** PM 3.5
**File:** `public/app.js`

**Problem:** The search overlay (Ctrl+K) shows "Type > for commands" (index.html line 183) but entering `>` does nothing. This is a broken promise in the UI.

**Current state:** The search overlay exists with keyboard navigation (↑↓ Enter Esc). The `>` prefix detection needs to be added.

**Changes:**
- `public/app.js` — In the search overlay input handler:
  1. Detect `>` prefix → switch to command mode (change placeholder to "Run a command...")
  2. Implement command registry:
     ```javascript
     const commands = [
       { name: 'Go to Today', action: () => showView('myday') },
       { name: 'Go to Board', action: () => showView('board') },
       { name: 'Go to Calendar', action: () => showView('cal') },
       { name: 'Go to Dashboard', action: () => showView('dashboard') },
       // ... all views
       { name: 'Create Task', action: () => openQuickCapture() },
       { name: 'Create Area', action: () => showCreateAreaDialog() },
       { name: 'Toggle Theme', action: () => cycleTheme() },
       { name: 'Start Focus Timer', action: () => showView('focus') },
     ];
     ```
  3. Fuzzy-match typed text against command names
  4. Show matching commands as selectable list items
  5. Enter/click → execute command action, close overlay
- Without `>` prefix → existing search behavior (unchanged)

**Tests:** 2 new (static analysis)
```
1. app.js handles > prefix in search input
2. app.js contains command registry with view navigation entries
```

### Phase 2 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 2.1 Task context menu | Frontend | 2 | app.js, styles.css |
| 2.2 Bulk operations | Full stack | 5 | tasks.js, app.js |
| 2.3 Command palette | Frontend | 2 | app.js |
| **Total** | | **9** | |

---

## Phase 3 — Backend Reliability

**Why fourth:** Background job scheduler fixes the recurring task reliability bug (tasks silently stop spawning if users don't complete them on time). Request logging provides the audit trail needed for debugging production issues. Both are prerequisites for recommending LifeFlow to others.

### Task 3.1: Background Job Scheduler

**Type:** Feature (backend)
**Spec ref:** Architect 5.1
**Files:** `src/scheduler.js` (new), `src/server.js`

**Problem:** Recurring tasks only spawn when a user manually completes the previous instance. If a user forgets to complete Monday's daily task, Tuesday's task never spawns. Also: no automated habit reset, no stale session cleanup.

**Current state:** Two `setInterval` calls exist in server.js (audit purge) and data.js (backup rotation). No centralized scheduler.

**Changes:**
- `src/scheduler.js` (new) — Create a lightweight scheduler:
  ```javascript
  module.exports = function createScheduler(db, logger) {
    const jobs = [];
    
    function register(name, intervalMs, fn) {
      jobs.push({ name, intervalMs, fn, timer: null });
    }
    
    function start() {
      for (const job of jobs) {
        job.fn().catch(err => logger.error({ err, job: job.name }, 'Scheduler job failed'));
        job.timer = setInterval(() => {
          job.fn().catch(err => logger.error({ err, job: job.name }, 'Scheduler job failed'));
        }, job.intervalMs);
      }
    }
    
    function stop() {
      for (const job of jobs) { if (job.timer) clearInterval(job.timer); }
    }
    
    return { register, start, stop };
  };
  ```
- `src/server.js` — Initialize scheduler, register jobs:
  1. **Midnight recurring spawn** (every 60 min, check if any recurring tasks with due_date ≤ today and status='done' need spawning)
  2. **Stale session cleanup** (every 6 hours, delete sessions where `expires_at < now`)
  3. **Move existing backup interval** from data.js into scheduler
  4. **Move existing audit purge** from server.js into scheduler
- `src/server.js` — Call `scheduler.stop()` during graceful shutdown

**Tests:** 5 new (in new `tests/scheduler.test.js`)
```
1. Scheduler runs registered job immediately on start
2. Scheduler handles job failure gracefully (other jobs continue)
3. Scheduler stop clears all intervals
4. Stale session cleanup deletes expired sessions
5. Midnight recurring spawn creates missing recurring tasks
```

### Task 3.2: Request Logging Middleware

**Type:** Feature (backend)
**Spec ref:** Security 9.1
**Files:** `src/middleware/request-logger.js` (new), `src/server.js`

**Problem:** No structured request logging. If a user reports "my task disappeared," there's no audit trail. Pino is already integrated but only used for startup/error logging.

**Changes:**
- `src/middleware/request-logger.js` (new):
  ```javascript
  module.exports = function createRequestLogger(logger) {
    return (req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        logger.info({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
          userId: req.userId || null,
          ip: req.ip
        }, 'request');
      });
      next();
    };
  };
  ```
- `src/server.js` — Mount before routes: `app.use(createRequestLogger(logger))`
- Skip logging for static assets and health checks to reduce noise

**Tests:** 3 new
```
1. Request logger middleware calls next()
2. Request logger emits log with method, path, status
3. Request logger includes userId when authenticated
```

### Phase 3 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 3.1 Scheduler | Feature | 5 | scheduler.js (new), server.js |
| 3.2 Request logging | Feature | 3 | request-logger.js (new), server.js |
| **Total** | | **8** | |

---

## Phase 4 — Frontend Architecture Foundation

**Why fifth:** The 5,369-line `app.js` monolith is the development bottleneck for all future frontend work. Extracting the highest-traffic view (Today) into a module proves the pattern and unblocks parallel frontend development. This phase also introduces the state management layer that enables optimistic UI updates.

### Task 4.1: Extract Today View into ES Module

**Type:** Refactor (frontend)
**Spec ref:** FE Dev 6.1
**Files:** `public/js/views/today.js` (new), `public/app.js`

**Problem:** `renderToday()` is 155 lines (lines 461-616) embedded in a 5,369-line file. It depends on globals (`areas`, `goals`, `tasks`, `todayTab`) and shared functions (`renderTaskCard`, `esc`, `api`).

**Changes:**
- `public/js/views/today.js` (new) — Export `renderToday(container, { api, esc, renderTaskCard, ... })`:
  - Move the 155-line `renderToday()` function
  - Accept dependencies as parameters (no globals)
  - Export the function as ES module default
- `public/app.js` — Import and dispatch:
  ```javascript
  import { renderToday } from './js/views/today.js';
  // In the view router:
  case 'myday': await renderToday($('ct'), deps); break;
  ```
- Update `public/index.html` — Change `<script src="app.js">` to `<script type="module" src="app.js">`

**Risks:**
- ES modules use strict mode (may surface latent bugs with undeclared variables)
- Module scripts are deferred by default (change execution order)
- Need to verify all global variables accessed by `renderToday` are passed as dependencies

**Tests:** 2 new (static analysis)
```
1. public/js/views/today.js exists and exports renderToday
2. app.js imports from ./js/views/today.js
```

### Task 4.2: Expand State Store

**Type:** Refactor (frontend)
**Spec ref:** FE Dev 6.2
**File:** `public/store.js`

**Problem:** `store.js` currently handles settings cache + offline mutation queue. Global state (`areas`, `goals`, `tasks`, `allTags`, `currentView`) lives as top-level `let` variables in `app.js`. Any state change triggers a full `render()` → API refetch → DOM rebuild.

**Changes:**
- `public/store.js` — Extend with application state:
  ```javascript
  // Add to the Store IIFE:
  // Typed state slices
  function setAreas(a) { set('areas', a); }
  function setGoals(g) { set('goals', g); }
  function setTasks(t) { set('tasks', t); }
  function setTags(t) { set('tags', t); }
  function setView(v) { set('currentView', v); emit('view:changed', v); }
  
  // Optimistic update helpers
  function updateTask(id, patch) {
    const tasks = get('tasks') || [];
    const idx = tasks.findIndex(t => t.id === id);
    if (idx >= 0) { Object.assign(tasks[idx], patch); set('tasks', [...tasks]); }
  }
  ```
- `public/app.js` — Migrate `currentView` to use `Store.setView()` / `Store.getView()` (already partially done). Wire up `Store.on('view:changed', render)` instead of calling `render()` directly.
- Don't migrate all state at once — start with `currentView`, verify it works, then migrate `tasks` in a follow-up.

**Tests:** 3 new (static analysis in `tests/offline-queue.test.js`)
```
1. store.js exports setView/getView functions
2. store.js exports updateTask function
3. store.js emits view:changed event on setView
```

### Phase 4 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 4.1 Extract Today view | Refactor | 2 | views/today.js (new), app.js, index.html |
| 4.2 Expand Store | Refactor | 3 | store.js |
| **Total** | | **5** | |

---

## Phase 5 — Recurring Tasks & Daily Review

**Why last:** These are quality-of-life improvements that make LifeFlow stickier for daily users. They depend on Phase 3 (scheduler for recurring task reliability) and leverage Phase 1 (goal progress for review context).

### Task 5.1: Recurring Task Management

**Type:** Feature (backend + frontend)
**Spec ref:** Power User 8.3
**Files:** `src/routes/tasks.js`, `public/app.js`

**Problem:** No overview of recurring tasks. No way to skip an occurrence. No streak tracking. Finding which tasks are recurring requires opening each one individually.

**Backend changes:**
- `src/routes/tasks.js` — Add `GET /api/tasks/recurring`:
  - Returns all tasks where `recurring IS NOT NULL` and `status != 'done'` (or the latest done instance for active recurrences)
  - Include `recurring_pattern` (parsed JSON), `next_due`, `streak` (consecutive on-time completions)
- `src/routes/tasks.js` — Add `POST /api/tasks/:id/skip`:
  - Advances `due_date` to next occurrence without marking complete
  - Resets streak to 0
  - Returns updated task

**Frontend changes:**
- `public/app.js` — Add recurring indicator badge on task cards when `task.recurring` is set
- `public/app.js` — Add "Recurring Tasks" as a filter preset in the sidebar or as a command palette option

**Tests:** 5 new
```
1. GET /api/tasks/recurring returns only recurring tasks
2. POST /api/tasks/:id/skip advances due_date to next occurrence
3. POST /api/tasks/:id/skip on non-recurring task → 400
4. Skip resets streak counter
5. Recurring badge indicator present in task card HTML
```

### Task 5.2: Daily Micro-Review

**Type:** Feature (backend + frontend)
**Spec ref:** PM 3.3
**Files:** `src/routes/productivity.js`, `public/app.js`, `public/styles.css`

**Problem:** Weekly Review exists but is too heavyweight for daily use. Users have no end-of-day reflection ritual. Sunsama charges $20/month for exactly this feature.

**Backend changes:**
- `src/routes/productivity.js` — Add `POST /api/reviews/daily`:
  - Body: `{ note: "Good day...", date: "2026-03-27" }`
  - Stores in `weekly_reviews` table with `week` = date and `type` = 'daily' (add nullable `type` column)
  - Or create separate `daily_reviews` table: `(id, user_id, date, note, completed_count, created_at)`
- `src/routes/productivity.js` — Add `GET /api/reviews/daily/:date`

**Frontend changes:**
- `public/app.js` — After 6pm (or user-configured time), show a dismissible banner at top of Today view:
  - "How was your day? You completed N tasks."
  - Click → modal showing today's completions with optional 1-line note
  - Save → POST /api/reviews/daily
  - Dismiss → don't show again today (localStorage flag)
- Keep it light: 3-click interaction max (banner click → type note → save)

**Tests:** 4 new
```
1. POST /api/reviews/daily creates a daily review entry
2. GET /api/reviews/daily/:date returns the review
3. POST /api/reviews/daily with duplicate date → updates (upsert)
4. Review includes completed_count for the date
```

### Phase 5 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 5.1 Recurring task mgmt | Feature | 5 | tasks.js, app.js |
| 5.2 Daily micro-review | Feature | 4 | productivity.js, app.js, styles.css |
| **Total** | | **9** | |

---

## Execution Summary

```
Phase 0 (Data Integrity)     →  6 tests, ~2 files    — export fix + Docker
Phase 1 (Goal Intelligence)  →  8 tests, ~4 files    — progress bars + suggestions
Phase 2 (Interaction Speed)  →  9 tests, ~3 files    — context menu + bulk ops + command palette
Phase 3 (Backend Reliability)→  8 tests, ~3 files    — scheduler + request logging
Phase 4 (Frontend Architecture)→ 5 tests, ~3 files   — view extraction + store
Phase 5 (Recurring + Review) →  9 tests, ~4 files    — recurring mgmt + daily review
                                ────────────────────
Total:                         45 new tests, 12 tasks
```

All 6 phases target a single version bump. Run `npm test` after each phase.

---

## Documentation Updates Required

After implementation:
- `CLAUDE.md` — Update test count, route count, features inventory, frontend views
- `docs/openapi.yaml` — Document new endpoints (suggested, batch, recurring, skip, daily review, webhooks/events)
- `CHANGELOG.md` — New version entry with all changes
- `docs/design/INDEX.md` — Update spec status to "Partially implemented"

---

## Deferred Items (Tier 3–4)

These remain in the spec as reference for future planning:

| # | Item | Why Deferred |
|---|------|-------------|
| 15 | WebSocket real-time | Requires architectural change; foundation work (scheduler, store) done first |
| 16 | Google Calendar integration | OAuth2 complexity; needs careful scope definition |
| 17 | Auto-scheduler | Depends on calendar integration |
| 18 | Habit ↔ Goal linking | Depends on goal progress (Phase 1) shipping first |
| 19 | Filter query language | Medium effort, lower priority than interaction speed |
| 20 | Quarterly Planning view | Depends on goal intelligence maturity |
| 21 | Native mobile app (Capacitor) | Major commitment; PWA improvements come first |
| 22 | Multi-device sync (CRDTs) | Largest initiative; requires WebSocket foundation |
| 23 | Cloud offering | Business decision, not engineering |
| 24 | Template marketplace | Needs user base first |
| 25 | Obsidian plugin | Integration; needs API stability first |

---

## Review Checkpoint

After Phase 2 is complete (interaction speed), pause for review. Phases 0–2 are the highest-impact set. Phases 3–5 can be reprioritized based on user feedback after the first batch ships.
