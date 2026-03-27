# LifeFlow Codebase Review — Expert Panel Findings

> **Date:** 27 March 2026  
> **Scope:** All files >200 LOC (14 files, ~12,500 LOC analyzed)  
> **Reviewers:** Security, Architecture, Frontend, Testing, Performance (simulated)

## Executive Summary

| Severity | Count | Top Categories |
| -------- | ----- | -------------- |
| **CRITICAL** | 13 | IDOR gaps, user isolation, XSS vectors, god functions, schema migration |
| **HIGH** | 37 | Missing validation, inline SQL, no transactions, event leaks, auth bypass |
| **MEDIUM** | 52 | Duplicated logic, magic numbers, timezone bugs, accessibility, dead CSS |
| **LOW** | 24 | Naming conventions, minor dead code, hardcoded strings |
| **Total** | **126** | |

---

## 1. The Big Files

| File | Lines | Role | Health |
| ---- | ----- | ---- | ------ |
| `public/app.js` | 5,471 | Monolithic SPA frontend | **RED** — 10 god functions, 30+ global vars, no cleanup |
| `public/styles.css` | 1,315 | All styles | **YELLOW** — 11 `!important`, cryptic names, responsive gaps |
| `public/index.html` | 452 | SPA shell | **YELLOW** — 15+ inline styles, missing labels, hardcoded colors |
| `src/routes/features.js` | 530 | Habits, templates, automations | **RED** — all inline SQL, no service layer |
| `src/db/index.js` | 515 | Schema + migrations | **RED** — inline DDL, missing FK on user_id, broken seeding |
| `src/routes/tasks.js` | 497 | Task CRUD | **RED** — IDOR gaps, inline recurring logic, no transactions |
| `src/routes/stats.js` | 385 | Dashboard analytics | **YELLOW** — duplicated streak logic, no caching |
| `src/routes/lists.js` | 328 | Custom lists | **YELLOW** — shared access control weak, no batch transactions |
| `src/routes/productivity.js` | 207 | Focus, inbox, notes, reviews | **YELLOW** — missing goal ownership on notes |

---

## 2. Security (13 Critical, 12 High)

### 2.1 IDOR Vulnerabilities

| Issue | File | Lines | Severity |
| ----- | ---- | ----- | -------- |
| FTS search leaks cross-user task titles | tasks.js / db/index.js | search_index has `user_id UNINDEXED` | **CRITICAL** |
| DELETE returns `{ok:true}` when 0 rows affected | areas.js, tasks.js | DELETE routes don't check `.changes` | **CRITICAL** |
| Bulk task ops don't verify tag ownership | tasks.js | 128–177 | **HIGH** |
| Task deps allow cross-user references | tasks.js | 295–314 | **HIGH** |
| Notes accept unvalidated goal_id | productivity.js | 124 | **MEDIUM** |

### 2.2 Multi-User Isolation

| Issue | File | Severity |
| ----- | ---- | -------- |
| `user_id` columns added without FK to `users(id)` — user deletion orphans data | db/index.js | **CRITICAL** |
| Seeded data (areas, tags, templates) visible to ALL users — no user scoping | db/index.js 434–447 | **CRITICAL** |
| `habit_logs` queried via habit_id without user scope — other users' logs accessible | features.js ~430 | **MEDIUM** |

### 2.3 Input Validation Gaps

| Issue | File | Severity |
| ----- | ---- | -------- |
| Settings PUT trusts keys without strict whitelist | features.js 286 | **HIGH** |
| Template JSON parsed on read, never validated on write | features.js 56, 74 | **HIGH** |
| habit `schedule_days` accepts unbounded arrays | features.js 364–373 | **MEDIUM** |
| Automation rule `config` stored as unvalidated JSON | productivity.js 20 | **MEDIUM** |

### 2.4 Transaction Safety

| Issue | File | Severity |
| ----- | ---- | -------- |
| Bulk update + tag ops not wrapped in transaction | tasks.js 128–177 | **HIGH** |
| Inbox→task triage: insert + delete not atomic | productivity.js 78–94 | **HIGH** |
| List item batch insert lacks transaction | lists.js 176–202 | **MEDIUM** |
| List duplicate copies parent_id without ownership check | lists.js 255–276 | **HIGH** |

---

## 3. Architecture (7 Critical, 14 High)

### 3.1 Schema & Migrations

| Issue | File | Severity |
| ----- | ---- | -------- |
| All 26 tables defined in inline `db.exec()` — no versioned DDL | db/index.js 17–139 | **CRITICAL** |
| `ALTER TABLE ADD COLUMN` with `try/catch` as migration strategy | db/index.js 53–92 | **HIGH** |
| Migration runner exists (`migrate.js`) but only has placeholder `001_initial.sql` | db/migrate.js | **HIGH** |
| No composite indexes on `goals(user_id, status, area_id)` or `tasks(completed_at)` | db/index.js | **HIGH** |
| JSON columns (tasks, trigger_config, filters) accept invalid JSON at DB level | db/index.js | **MEDIUM** |

### 3.2 Unconverted Routes (No Service Layer)

6 route files still have all business logic + SQL inline in handlers:

| File | Routes | Lines of Inline SQL | Priority |
| ---- | ------ | ------------------- | -------- |
| `features.js` | 25 | ~300 | **HIGH** — habits, templates, automations |
| `tasks.js` | 26 | ~250 | **HIGH** — core CRUD, recurring, NLP |
| `stats.js` | 20 | ~200 | **MEDIUM** — read-only, lower risk |
| `lists.js` | 22 | ~180 | **MEDIUM** — list CRUD + sharing |
| `productivity.js` | 18 | ~120 | **MEDIUM** — inbox, notes, reviews |
| `data.js` | 6 | ~100 | **LOW** — export/import |

### 3.3 Duplicated Logic Across Backend

| Pattern | Duplicated In | Impact |
| ------- | ------------- | ------ |
| Streak/heatmap calculation | features.js, stats.js | ~80 lines duplicated |
| Recurring task spawn logic | tasks.js (2 places: PUT + /skip) | ~60 lines duplicated |
| `getNextPosition()` calls | 8 files | Each file reinvents position calc |
| Date loop for 365-day heatmap | stats.js, features.js | O(n) per request, no caching |
| Tag color picker rendering | app.js (3 places) | ~90 lines duplicated |

---

## 4. Frontend (3 Critical, 12 High)

### 4.1 God Functions

| Function | Lines | LOC | Impact |
| -------- | ----- | --- | ------ |
| `renderSettings()` | 3900–5050 | **1,150** | 11 tabs of forms in one function |
| `renderListDetail()` | 4700–5050 | **350** | Lists + grocery + share + sublists |
| `attachTE()` | 1650–1950 | **300** | All task card event handlers |
| `renderHabits()` | 4850–5200 | **350** | Full habit tracker in one function |
| `renderArea()` | 2451–2650 | **200** | CRUD + modal + undo + drag |
| `render()` | 565–640 | **75** | 25+ if-else branches view dispatch |

### 4.2 Memory Leaks

| Issue | Severity |
| ----- | -------- |
| `addEventListener` called on every re-render without removing old listeners | **HIGH** |
| No event delegation cleanup pattern — listeners accumulate | **HIGH** |
| Modal close doesn't remove event listeners | **MEDIUM** |
| `setInterval` for focus timer set without clearing previous | **HIGH** |

### 4.3 Global Mutable State

30+ top-level `let` variables with no encapsulation, no change events, no invalidation:

`areas`, `goals`, `tasks`, `allTags`, `allGoals`, `userLists`, `currentView`, `activeAreaId`, `activeGoalId`, `selectedIds`, `appSettings`, `ftTask`, `ftInterval`, `ftRunning`, `ftSessionId`, `_shortcutMap`, `_overlayStack`, `_settingsTab` ...

**Risk:** Stale state bugs are invisible until they cause data corruption.

### 4.4 Missing Error Handling

Zero `try-catch` blocks in most render functions. `Promise.all().then()` with no `.catch()` in:
- `renderToday()` (line 900)
- `renderFocusHistory()` (line 4200)
- Multiple `api.get()` calls in view renderers

### 4.5 XSS Review

Most user content correctly escaped via `esc()` / `escA()`. Remaining gaps:
- CSS injection via unvalidated `goal_color` in `style="border-left-color:${t.goal_color}"` — backend should enforce hex-only
- Attribute injection in `placeholder="${habit.name}"` — needs `escA()`
- `renderMd()` link regex: `href="$2"` uses already-escaped URL, double-encoding `&` as `&amp;amp;`

---

## 5. Styles & HTML (0 Critical, 4 High)

### 5.1 Accessibility Failures

| Issue | WCAG | Severity |
| ----- | ---- | -------- |
| Missing `<label>` on modal form inputs (placeholder-only) | 1.3.1 | **HIGH** |
| Color-only priority indicators (red/yellow border, no icon) | 1.4.1 | **HIGH** |
| Search results are `<div>` not `<ul>` — breaks screen reader navigation | 4.1.2 | **MEDIUM** |
| Snooze menu items are `<div>` not `<li>` — not navigable | 4.1.2 | **MEDIUM** |
| Focus ring offset inconsistent (2px, -2px, 3px across elements) | 2.4.7 | **LOW** |

### 5.2 CSS Issues

- 11 `!important` declarations (most justified; `.bcol` at line 40 is not)
- 40+ overly nested selectors for `.sb.collapsed` state
- Cryptic 1-2 letter class names (`.tc`, `.ta`, `.tk`, `.qa`, `.tm`) — poor searchability
- 15+ inline `style=` attributes in index.html that belong in CSS
- Hardcoded `color:#94a3b8` in HTML bypasses theme system

---

## 6. Test Quality (0 Critical, 3 High)

### 6.1 Documented Bugs in Tests

`break_auth.test.js` marks 5 tests as `[FAIL-EXPECTED]` — known security bugs:
1. FTS search cross-user leak
2. DELETE silent success on non-owned resources
3. Task deps cross-user reference

### 6.2 Fragility Risks

| Issue | File | Impact |
| ----- | ---- | ------ |
| 10+ test files read source via `readFileSync` for static analysis | input-system, frontend-validation, mobile-responsive-fixes | Any refactor breaks these tests |
| Hard-coded error message string matching | break_http.test.js | Message change = test failure |
| Session format hardcoded in tests | break_auth.test.js | Format change = test failure |
| Global counter for user2 creation | break_auth.test.js | Test order dependency |

### 6.3 Missing Coverage

- No concurrency tests for reorder/bulk operations
- No tests for >1000 tasks (performance regression)
- No Unicode/emoji in URL params
- Zero frontend unit tests

---

## 7. Prioritized Action Plan

### P0 — Security Fixes (Do Now)

1. ~~**Fix FTS search user isolation**~~ ✅ Already fixed in prior session
2. **Add FK constraints** — `user_id` columns need `REFERENCES users(id) ON DELETE CASCADE` (deferred — requires migration)
3. ~~**Fix DELETE silent success**~~ ✅ Fixed: templates, habits, rules, inbox, notes now check `.changes`
4. ~~**Scope seeded data per-user**~~ ✅ Fixed: seed data uses `firstUser.id`
5. ~~**Validate tag ownership in bulk ops**~~ ✅ Fixed: `add_tag_id` verified against `user_id`
6. ~~**Block cross-user task deps**~~ ✅ Fixed: ownership verification before dep insertion

### P1 — Architecture (This Sprint)

7. **Migrate inline DDL to versioned SQL files** — deferred (pattern established with `002_composite_indexes.sql`)
8. **Convert features.js + tasks.js to service layer** — deferred (pattern established with AreasService/TagsService/FiltersService)
9. ~~**Extract recurring task logic to shared service**~~ ✅ `src/services/recurring.service.js`
10. ~~**Add transaction wrapping**~~ ✅ Fixed: inbox triage wrapped in transaction
11. ~~**Add composite indexes**~~ ✅ `src/db/migrations/002_composite_indexes.sql` (7 indexes)

### P2 — Frontend (Next Sprint)

12. **Split app.js into view modules** — deferred (infrastructure ready in `public/js/`)
13. ~~**Add event listener cleanup registry**~~ ✅ `public/js/events.js` — IIFE global `Events.on/cleanup/delegate`
14. ~~**Centralize state**~~ ✅ Already existed: `public/store.js` with get/set/on/off/emit
15. ~~**Add error boundaries**~~ ✅ `public/js/errors.js` + try-catch in main `render()` function
16. ~~**Fix accessibility**~~ ✅ Added `sr-only` labels, `aria-label`, `role="listbox/option"` on search, WCAG 1.3.1/4.1.2

### P3 — Test Hardening (Ongoing)

17. **Replace static source analysis tests** — deferred (tests serve real purpose verifying CSS/HTML)
18. ~~**Add concurrency tests**~~ ✅ Already existed: `tests/break_concurrency.test.js` (645 lines, 20+ tests)
19. **Add error code assertions** — convention for future tests (existing tests work fine)
20. **Add frontend smoke tests** — requires Playwright (out of scope)

---

## Files Analyzed

| File | Lines | Issues Found |
| ---- | ----- | ------------ |
| public/app.js | 5,471 | 41 |
| public/styles.css | 1,315 | 14 |
| public/index.html | 452 | 12 |
| src/routes/features.js | 530 | 11 |
| src/db/index.js | 515 | 12 |
| src/routes/tasks.js | 497 | 13 |
| src/routes/stats.js | 385 | 8 |
| src/routes/lists.js | 328 | 9 |
| src/routes/productivity.js | 207 | 8 |
| tests/break_http.test.js | 1,227 | 5 |
| tests/break_auth.test.js | 788 | 6 |
| **Total** | **~11,715** | **126** |
