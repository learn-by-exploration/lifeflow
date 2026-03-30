# LifeFlow Testing Excellence — 25-Iteration Plan (v0.7.26 → v0.7.50)

> **Version:** v0.7.26 → v0.7.50
> **Base:** v0.7.25 (2,591 tests | 117 test files | 143 routes | 35 tables)
> **Scope:** Testing improvements ONLY — NO new features
> **Date:** 30 March 2026
> **TDD:** Write tests first, fix code to pass, commit with tag

---

## Executive Summary

The first 25 iterations (v0.7.1–v0.7.25) focused on security hardening: IDOR, XSS, CSRF,
timing attacks, session management, input validation, and SQL safety. This second phase
shifts to **systematic coverage gaps** — boundary values, state machines, API contracts,
frontend unit tests, performance baselines, and integration workflows that span multiple
entities. The goal is to reach **~4,000 tests** across **~142 test files** with measurable
quality gates.

### Target End State (v0.7.50)

| Metric | Current (v0.7.25) | Target (v0.7.50) |
|--------|-------------------|-------------------|
| Tests | 2,591 | ~4,100+ |
| Test files | 117 | ~142 |
| Security findings open | ~15 (low/info) | <5 |
| Route coverage | ~75% | 100% (every route tested) |
| Boundary tests | Ad-hoc | Systematic (all CRUD) |
| State machine tests | None | Complete (task, goal lifecycle) |
| Frontend unit tests | Static only | esc/fmtDue/renderMd/NLP unit tested |
| Performance baselines | None | Response time assertions on critical paths |
| API contract tests | None | Response shape validation on all endpoints |
| Import/Export coverage | Basic | Full roundtrip fidelity |

---

## Expert Panel Analysis

### 1. Security Expert — Remaining OWASP Gaps

**What's been addressed (v0.7.1–v0.7.25):**
- A1 Injection: SQL parameterized, input validation, Zod schemas
- A2 Broken Auth: Timing attacks, lockout, password policy, 2FA, session hardening
- A3 Sensitive Data: XSS prevention, CSP, output encoding
- A5 Broken Access: Systematic IDOR across all route modules
- A7 XSS: esc()/escA()/renderMd() verified, CSP headers tested
- A8 CSRF: Double-submit cookie integration tested

**What remains:**
1. **Content-Type enforcement** — No tests verify rejection of non-JSON Content-Type on POST/PUT/DELETE
2. **Request size limits** — `express.json({ limit })` exists but untested; no test for 413 Payload Too Large
3. **Cookie security exhaustive** — SameSite/HttpOnly/Path tested but Secure flag in HTTPS proxy scenarios needs more edge cases
4. **CORS exhaustive** — CORS middleware exists but only basic test; no tests for preflight, credentials, wildcard origin rejection
5. **Rate limiting under load** — Rate limiter skipped in test mode; need non-test-mode integration
6. **Dependency security** — `npm audit` in CI but no test asserting zero critical/high vulnerabilities
7. **API versioning headers** — No deprecation or version headers tested; future-proofing
8. **SSRF in webhook URLs** — Tested but DNS rebinding and IPv6 edge cases not covered
9. **Shared list token security** — Rate limiting exists but token entropy and brute-force resistance untested
10. **Audit log completeness** — Audit service exists but no test verifies all sensitive actions are logged

### 2. QA Lead — Systematic Coverage Gaps

**Boundary Value Analysis (BVA) gaps:**
- Title fields: 0, 1, max, max+1 characters
- Priority: -1, 0, 3, 4, null, boolean, float
- Position: negative, 0, MAX_INT, float
- Dates: leap year, month boundaries, far future (year 9999), epoch
- IDs: 0, negative, float, MAX_INT, string
- Pagination: page=0, limit=0, limit=501, offset=-1

**State transition gaps:**
- Task: todo→doing→done, todo→done, done→todo (reopen), doing→todo
- Goal: active→completed, active→archived
- Habit: daily logging boundary (midnight rollover)
- Focus session: start→end with various durations

**Negative testing gaps:**
- Missing required fields on every POST endpoint
- Wrong types (string where number expected, etc.)
- Extra/unknown fields (should be ignored, not error)
- Empty arrays vs. null vs. undefined
- Concurrent modifications (optimistic locking)

### 3. UI/UX Tester — Frontend Gaps

**Frontend JS unit tests (currently zero):**
- `esc(s)` — HTML entity escaping correctness
- `escA(s)` — Attribute escaping (quotes, ampersands)
- `fmtDue(d)` — Relative date formatting (today, tomorrow, overdue, in N days)
- `renderMd(text)` — Markdown → HTML conversion (bold, italic, links, code, XSS)
- `isValidHexColor(c)` — Color validation
- NLP parser output verification (edge cases)
- `touchDnD` — Touch drag-and-drop state machine

**Accessibility gaps:**
- ARIA attributes on dynamic content (modals, toasts, dropdowns)
- Focus management on view transitions
- Keyboard navigation through all views
- Screen reader announcements on state changes
- Color contrast ratios in all 8 themes

**Service worker gaps:**
- Network-first caching behavior verification
- Offline mutation queue serialization/deserialization
- Cache invalidation on version update
- Error handling for failed cache operations

### 4. Architect — Structural Test Improvements

**API contract testing:**
- Every endpoint should have a response shape assertion (JSON schema or manual)
- Status codes must be consistent (201 on create, 204 on delete with no body, 404 on not found)
- Error response format: always `{ error: "message" }`, never stack traces
- Pagination response: always `{ items, total, hasMore }` or `{ items, page, pages }`

**Test infrastructure:**
- Test helper coverage — verify all factory functions work correctly
- Test isolation — ensure no test depends on another test's side effects
- Test performance — identify and fix slow tests (>500ms)
- Error message quality — verify all 400/404 errors have descriptive messages

**Code coverage measurement:**
- Integrate c8 or istanbul for line/branch coverage
- Set minimum thresholds (80% lines, 70% branches)
- Identify untested code paths

### 5. PM — Iteration Prioritization

**Tiers:**
1. **Critical** (v0.7.26–v0.7.30): Boundary values, state machines, API contracts — these catch the most bugs
2. **High** (v0.7.31–v0.7.37): Frontend units, import/export, recurring tasks, multi-user — data integrity
3. **Medium** (v0.7.38–v0.7.44): Performance, content-type, CORS, rate limiting, error recovery — production hardening
4. **Polish** (v0.7.45–v0.7.50): Coverage measurement, slow test optimization, docs, final verification

### 6. Competitor Analyst — Industry Testing Practices

**Todoist testing patterns:**
- API contract tests with OpenAPI schema validation
- Property-based testing for date/recurring calculations
- Load testing for sync operations (100K tasks)
- Offline-first testing (conflict resolution)

**TickTick testing patterns:**
- Calendar view boundary tests (DST transitions, timezone offsets)
- Habit streak calculation edge cases (timezone-aware)
- Natural language date parsing with locale-aware tests

**Things 3 testing patterns:**
- State machine tests for task lifecycle (inbox→project→today→done→logbook)
- Drag-and-drop ordering consistency tests
- Quick entry parser exhaustive tests

---

## Iteration Plan

### v0.7.26 — Task CRUD Boundary Values

**File:** `tests/task-boundaries.test.js`
**Tests:** ~45

| Test Category | Count | Description |
|--------------|-------|-------------|
| Title boundaries | 8 | empty, whitespace, 1 char, 499/500/501 chars, unicode, emoji |
| Note boundaries | 6 | null, empty, 4999/5000/5001 chars, markdown content |
| Priority boundaries | 8 | -1, 0, 1, 2, 3, 4, null, boolean false, float 1.5, string "2" |
| Due date boundaries | 8 | null, today, yesterday, far future (9999-12-31), Feb 29 leap, Feb 29 non-leap, invalid month (2026-13-01), epoch |
| Status transitions | 6 | todo→doing, doing→done, done→todo (reopen), invalid "cancelled", null, empty string |
| Position boundaries | 4 | 0, negative, MAX_SAFE_INTEGER, float |
| estimated_minutes | 5 | 0, negative, float, null, very large (99999) |

**Code fixes expected:** 
- May need to cap `estimated_minutes` at a reasonable max
- May need to reject positions > some max

**Rationale:** Boundary values are where most bugs hide. Every field on the most-used entity (tasks) needs systematic edge case coverage.

---

### v0.7.27 — Area & Goal Boundary Values

**File:** `tests/area-goal-boundaries.test.js`
**Tests:** ~35

| Test Category | Count | Description |
|--------------|-------|-------------|
| Area name boundaries | 6 | empty, 1 char, max length, unicode, HTML entities, duplicate name |
| Area icon boundaries | 4 | null, empty, multi-byte emoji (👨‍👩‍👧‍👦), very long string |
| Area color boundaries | 5 | null, valid hex (#FF0000), invalid hex (#GGG), rgb(), 3-char hex (#F00) |
| Goal title boundaries | 6 | empty, max length, unicode, XSS attempt, leading/trailing whitespace |
| Goal description | 4 | null, empty, max length, markdown |
| Goal status transitions | 4 | active→completed, completed→active, invalid status, null |
| Goal due_date | 4 | null, past date, far future, invalid format |
| Milestone boundaries | 4 | empty title, max length, done toggle, position |

**Code fixes expected:**
- Icon field may need length validation
- Area name might need uniqueness check or trim

**Rationale:** Areas and goals are the organizational backbone. Invalid data here cascades to all child tasks.

---

### v0.7.28 — Subtask & Tag Boundary Values

**File:** `tests/subtask-tag-boundaries.test.js`
**Tests:** ~35

| Test Category | Count | Description |
|--------------|-------|-------------|
| Subtask title | 5 | empty, very long, unicode, whitespace-only, HTML |
| Subtask note | 3 | null, empty, very long |
| Subtask done toggle | 4 | 0→1, 1→0, null, invalid value |
| Subtask position | 3 | reorder to negative, duplicate positions, gaps |
| Tag name | 6 | empty, duplicate, unicode, special chars, max length, case sensitivity |
| Tag color | 4 | valid hex, invalid, null, empty |
| Task-tag association | 6 | add duplicate tag, add tag from other user, remove non-existent, max tags per task, set empty array, set with invalid IDs |
| Subtask on non-existent task | 4 | create/read/update/delete on deleted task |

**Code fixes expected:**
- May need max subtasks per task limit
- May need max tags per task limit

**Rationale:** Subtasks and tags are high-interaction entities with many edge cases around ownership and association.

---

### v0.7.29 — Task Status State Machine

**File:** `tests/task-state-machine.test.js`
**Tests:** ~40

| Test Category | Count | Description |
|--------------|-------|-------------|
| Valid transitions | 6 | todo→doing, doing→done, todo→done, done→todo, done→doing, doing→todo |
| completed_at lifecycle | 6 | set on done, cleared on reopen, not changed on update without status, set to ISO string, timezone handling |
| Recurring spawn on complete | 8 | daily/weekly/monthly/yearly spawn, spawn copies tags, spawn copies subtasks, spawn resets done, spawn next due_date calculation |
| Bulk status change | 4 | bulk complete, bulk reopen, mixed statuses, empty array |
| Status + stats integration | 6 | complete → stats increment, reopen → stats decrement, complete → activity log, reopen → removed from activity |
| Automation triggers | 5 | task_completed fires rules, task_updated fires rules, done→todo does NOT fire completed rule |
| My-day interaction | 5 | complete removes from my-day, reopen preserves my-day, schedule clears my-day |

**Code fixes expected:**
- completed_at may not be cleared properly on reopen (done→todo)
- Stats endpoints may not handle reopen correctly

**Rationale:** Task status is the core state machine. Incorrect transitions cause data inconsistency across stats, activity logs, automation rules, and recurring spawns.

---

### v0.7.30 — API Contract Tests (Response Shapes)

**File:** `tests/api-contracts.test.js`
**Tests:** ~55

| Test Category | Count | Description |
|--------------|-------|-------------|
| Task response shape | 8 | GET single, GET list, POST create, PUT update — verify all fields present, types correct |
| Area/Goal response shape | 6 | GET areas, POST area, GET goals, POST goal — field validation |
| Tag/Filter response shape | 4 | GET tags, POST tag, GET filters — consistent structure |
| List/Item response shape | 4 | GET lists, POST list, GET items — field validation |
| Auth response shape | 4 | Login response, register response, me response, token response |
| Stats response shape | 6 | /stats, /stats/streaks, /stats/trends, /stats/time-analytics, /stats/balance |
| Focus response shape | 4 | POST focus, GET stats, GET history, GET insights |
| Error response shape | 8 | 400 always has `{ error }`, 404 always has `{ error }`, 401 format, 403 format, 409 format, 429 format, 500 never has stack trace |
| Pagination contract | 6 | /tasks/all, /activity, /focus/history — verify `total`, `page`/`offset`, `hasMore`/`pages` |
| Status code consistency | 5 | 201 on all creates, 200 on updates, 200 or 204 on deletes, 400 on validation error, 404 on not found |
| Content-Type headers | 4 | All JSON responses have application/json, iCal has text/calendar, export has Content-Disposition |

**Code fixes expected:**
- Some endpoints may return 200 instead of 201 on create
- Some delete endpoints may return `{ ok: true }` vs `{ deleted: true }` inconsistently

**Rationale:** API consumers (frontend, potential mobile app, integrations) depend on consistent response shapes. Contract tests prevent silent regressions.

---

### v0.7.31 — Content-Type & Request Body Enforcement

**File:** `tests/content-type-enforcement.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| POST without Content-Type | 4 | Should reject or parse correctly |
| POST with text/plain | 3 | Should reject with 415 or 400 |
| POST with form-urlencoded | 3 | Should reject or parse |
| POST with multipart/form-data | 3 | Should reject (no file upload support) |
| PUT with wrong Content-Type | 3 | Verify behavior |
| Request size limits | 6 | 1KB, 100KB, 1MB, 10MB body — verify 413 at limit |
| Empty body on POST | 4 | endpoints that require body should 400 |
| Array body where object expected | 2 | Should 400 with descriptive error |
| Nested JSON depth | 2 | Very deep nesting — verify no crash |

**Code fixes expected:**
- May need explicit Content-Type checking middleware
- May need to configure `express.json({ limit: '1mb' })` explicitly

**Rationale:** Content-Type confusion is OWASP A1 (Injection). Attackers may send unexpected formats to bypass validation.

---

### v0.7.32 — CORS Exhaustive Scenarios

**File:** `tests/cors-exhaustive.test.js`
**Tests:** ~25

| Test Category | Count | Description |
|--------------|-------|-------------|
| Preflight OPTIONS | 4 | Valid origin, invalid origin, no origin, wildcard |
| Access-Control headers | 5 | Allow-Origin, Allow-Methods, Allow-Headers, Allow-Credentials, Max-Age |
| Credentials with wildcard | 3 | Cannot use `*` with credentials — verify rejection |
| ALLOWED_ORIGINS env var | 4 | Single origin, multiple origins, empty, malformed |
| Cross-origin cookie handling | 3 | SameSite interaction with CORS |
| Public endpoints CORS | 3 | /health, /shared/* — should allow broader access |
| Non-API routes | 3 | Static files, SPA fallback — verify correct CORS |

**Code fixes expected:**
- May need to restrict CORS on specific routes
- Shared endpoints may need separate CORS config

**Rationale:** CORS misconfiguration is a common vulnerability that allows unauthorized cross-origin requests.

---

### v0.7.33 — Import/Export Roundtrip Fidelity

**File:** `tests/import-export-roundtrip.test.js`
**Tests:** ~40

| Test Category | Count | Description |
|--------------|-------|-------------|
| Full roundtrip | 4 | Create data → export → wipe → import → compare every field |
| Entity roundtrip | 10 | Areas, goals, tasks, tags, subtasks, habits, habit_logs, notes, lists, list_items — each individually |
| Tag remapping | 3 | Tags get new IDs on import; task_tags must use remapped IDs |
| Custom field roundtrip | 3 | Custom field defs + task values survive roundtrip |
| Focus session roundtrip | 2 | Focus sessions + meta survive roundtrip |
| Automation rules roundtrip | 2 | Rules with JSON configs survive roundtrip |
| Corrupt import | 5 | Missing areas, orphan tasks, invalid JSON, huge payload, empty arrays |
| Todoist import | 4 | Valid Todoist JSON, empty items, no projects, priority mapping |
| Trello import | 3 | Valid Trello JSON, empty cards, list→goal mapping |
| iCal export | 4 | Valid VCALENDAR format, RRULE for recurring, special chars in titles, PRIORITY mapping |

**Code fixes expected:**
- Custom fields may not be included in export/import
- Task dependencies may not survive roundtrip
- Weekly reviews may not round-trip correctly

**Rationale:** Data portability is critical. Users must be able to export and re-import without any data loss.

---

### v0.7.34 — Recurring Task Spawn Edge Cases

**File:** `tests/recurring-spawn-edges.test.js`
**Tests:** ~35

| Test Category | Count | Description |
|--------------|-------|-------------|
| Spawn with all relations | 5 | Task with tags + subtasks + custom fields + comments → verify what copies |
| Next due date calculation | 8 | daily, weekly, monthly (31st → Feb), yearly (leap), every-N-days, weekdays, month-end rollover, year-end rollover |
| Skip + spawn | 3 | Skip marks done + spawns next without changing stats |
| Spawn idempotency | 3 | Completing already-done task doesn't double-spawn |
| Recurring with dependencies | 3 | Dependencies should NOT copy to spawned task |
| Recurring JSON validation | 5 | `"daily"`, `{"type":"every","interval":3,"unit":"days"}`, invalid JSON, missing fields, negative interval |
| Spawn with list_id | 2 | list_id should copy to spawned task |
| Concurrent spawn guard | 3 | Two concurrent completes → only one spawn |
| Scheduler spawn | 3 | Cron-style scheduled spawn for overdue recurring tasks |

**Code fixes expected:**
- Custom field values likely NOT copied on spawn (data loss bug)
- Comments likely NOT copied on spawn (by design, but should verify)
- list_id may not copy on spawn

**Rationale:** Recurring tasks are the most complex logic. Edge cases in date calculation affect daily usage.

---

### v0.7.35 — Frontend JS Unit Tests (esc, fmtDue, renderMd)

**File:** `tests/frontend-units.test.js`
**Tests:** ~45

| Test Category | Count | Description |
|--------------|-------|-------------|
| esc() | 8 | `<script>`, `"quotes"`, `&amp;`, null, undefined, number, empty string, nested HTML |
| escA() | 5 | Double quotes, single quotes, ampersand, null, backticks |
| fmtDue() | 10 | today, tomorrow, yesterday, "in 3 days", "2d overdue", null, empty, invalid date, far future, same day |
| renderMd() | 10 | bold, italic, links, code blocks, inline code, lists, XSS via markdown, empty, null, nested formatting |
| isValidHexColor() | 5 | #FFF, #FFFFFF, #fff, invalid (#GGG), empty, no hash |
| NLP parser edge cases | 7 | "buy milk tomorrow p1 #groceries", "meeting next monday", ambiguous dates, no extractable data, only tags, overlapping patterns, emoji in title |

**Implementation note:** These test the _logic_ by extracting functions from `public/app.js` and `public/js/utils.js` into testable modules. No browser needed — pure string transformation tests using `node:test`.

**Code fixes expected:**
- renderMd may have XSS via javascript: URLs in links
- fmtDue may not handle timezone edge cases

**Rationale:** Frontend functions process user input for display. Bugs here cause XSS or incorrect rendering for every user.

---

### v0.7.36 — Tag/Filter/Custom-Field Interactions

**File:** `tests/tag-filter-field-interactions.test.js`
**Tests:** ~35

| Test Category | Count | Description |
|--------------|-------|-------------|
| Filter by tag | 5 | Filter with tag_id, multiple tags (AND vs OR), tag deletion cascades filter results, tag rename doesn't break filter |
| Filter by custom field | 4 | Filter by select field value, number range, date range, text contains |
| Smart filters | 5 | stale (correct cutoff), quickwins (estimated_minutes + not blocked), blocked (deps check), filter counts accuracy |
| Custom field on task lifecycle | 4 | Set → update → delete field def → values orphaned?, re-create field → old values? |
| Tag stats accuracy | 4 | Tag usage count after create/delete tasks, tag stats with 0 usage, stats after bulk operations |
| Filter execution | 5 | Complex multi-field filter, empty result set, filter with invalid params, pagination in filter results |
| Custom field types | 4 | text, number, date, select — each with valid/invalid values |
| Cross-entity filters | 4 | Filter by area + priority + tag + status simultaneously |

**Code fixes expected:**
- filter/counts endpoint may have bugs with complex multi-field filters
- Custom field deletion may not clean up task_custom_values

**Rationale:** Filters and custom fields are power-user features. Interaction bugs are hard to catch without combinatorial testing.

---

### v0.7.37 — Multi-User Isolation Exhaustive

**File:** `tests/multi-user-exhaustive.test.js`
**Tests:** ~40

| Test Category | Count | Description |
|--------------|-------|-------------|
| Data isolation per entity | 14 | areas, goals, tasks, subtasks, tags, habits, habit_logs, notes, lists, list_items, focus_sessions, custom_fields, templates, automations — user A cannot see user B's data |
| Search isolation | 3 | FTS search, task search, global search — results scoped to user |
| Stats isolation | 4 | /stats, /stats/streaks, /activity, /focus/stats — user A's completions don't appear in user B's stats |
| Export isolation | 2 | Export only contains requesting user's data |
| Import isolation | 2 | Import replaces only requesting user's data, not other users' |
| Shared list access | 3 | Token-based access works without auth, but can't access non-shared lists |
| Demo mode isolation | 2 | Demo start/reset only affects requesting user |
| Inbox/triage isolation | 3 | Inbox items, triage to other user's goal → should fail |
| Badge isolation | 2 | Badges earned by user A don't appear for user B |
| Settings isolation | 2 | Theme/settings changes scoped per user |
| Assignment vs ownership | 3 | assigned_to_user_id doesn't grant access to other user's task |

**Code fixes expected:**
- Some endpoints may leak data through JOINs without user_id filter
- Badge check may count all users' tasks

**Rationale:** Multi-user isolation is the foundation of multi-tenancy. Exhaustive testing prevents privilege escalation.

---

### v0.7.38 — Habit System Edge Cases

**File:** `tests/habit-edges.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| Streak calculation | 6 | Start from today, start from yesterday (if not logged today), gap resets streak, best streak tracking, timezone midnight boundary, 365-day heatmap |
| Multi-target habits | 4 | target=3, log 1/2/3 times, completion flag, undo decrement |
| Frequency types | 4 | daily, weekly (schedule_days), monthly, yearly validation |
| Habit log boundaries | 5 | double-log same day, undo when count=1 (delete), undo when no log (graceful), log future date, log very old date |
| Archived habits | 3 | Archived habit excluded from GET, logs still accessible, unarchive restores |
| Habit area association | 3 | Link to area, area deletion effect, area stats include habits |
| Heatmap data | 3 | 90-day window, empty heatmap, many logs |
| preferred_time validation | 2 | Valid HH:MM, invalid formats |

**Code fixes expected:**
- Streak may break at midnight boundary
- Undo when no log may throw instead of graceful response

**Rationale:** Habits are a daily-use feature. Streak calculation bugs destroy user trust.

---

### v0.7.39 — Focus System Edge Cases

**File:** `tests/focus-edges.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| Focus session lifecycle | 5 | Create → update duration → end → verify actual_minutes on task → delete |
| Focus meta boundaries | 5 | focus_rating 0/5/negative/6/null, intention/reflection max length, strategy enum |
| Focus steps lifecycle | 4 | Create steps → toggle done → verify completed_at → duplicate steps |
| Focus streak | 4 | Consecutive days, gap resets, best streak, heatmap data shape |
| Focus insights | 3 | Peak hours with no data, by-strategy aggregation, completion rate |
| Focus daily goal | 3 | Default 120min, custom goal, progress percentage capping at 100 |
| Focus stats accuracy | 3 | Today/week aggregation, by-task breakdown, sessions count |
| Focus with task deletion | 3 | Delete task → focus sessions orphaned?, stats still count? |

**Code fixes expected:**
- Focus session deletion may not cascade to meta/steps
- actual_minutes auto-update may have rounding issues

**Rationale:** Focus timer is a premium feature. Edge cases in time tracking destroy data accuracy.

---

### v0.7.40 — List System Exhaustive

**File:** `tests/list-exhaustive.test.js`
**Tests:** ~35

| Test Category | Count | Description |
|--------------|-------|-------------|
| List CRUD boundaries | 6 | Name max length, 100 list limit, duplicate names, type validation, icon/color |
| List item boundaries | 6 | 500 item limit, title max length, category/quantity fields, checked toggle, position reorder |
| Sublist nesting | 4 | Create sublist, prevent 2-level nesting, parent deletion cascades sublists, move to different parent |
| List operations | 5 | Duplicate (with/without checked), clear checked, uncheck all, share/unshare |
| Shared list access | 4 | Token format validation, rate limiting, add items via token, toggle items via token |
| Grocery categories | 3 | Default categories, configured categories from settings, invalid categories |
| List templates | 3 | Create from template, template not found, template items |
| Save-as-template | 2 | Save list as template, save goal as template |
| Search index rebuild | 2 | List changes trigger search index rebuild |

**Code fixes expected:**
- Sublist deletion may not cascade list_items
- Search index rebuild may miss edge cases

**Rationale:** Lists are the most used non-task feature. Boundary testing prevents data corruption.

---

### v0.7.41 — Notes, Inbox, Reviews Edge Cases

**File:** `tests/productivity-edges.test.js`
**Tests:** ~35

| Test Category | Count | Description |
|--------------|-------|-------------|
| Inbox CRUD | 5 | Empty title, priority boundaries, triage to goal (ownership check), update fields, delete |
| Inbox triage workflow | 4 | Triage creates task, deletes inbox item, triage with due_date, triage to non-owned goal → 403 |
| Notes CRUD | 5 | Empty title, content update, goal association, goal_id filter, delete |
| Notes goal link | 3 | Note linked to goal, goal deletion effect, re-link to different goal |
| Weekly review | 5 | Create review, upsert (same week), rating boundaries (1-5), week_start validation, delete |
| Weekly review data | 3 | Current week data accuracy, completed/created counts, area stats |
| Daily review | 4 | Create, upsert same date, completed_count accuracy, date validation |
| Automation rules | 6 | Create/update/delete, valid trigger types, valid action types, name boundaries, enable/disable toggle |

**Code fixes expected:**
- Triage may not validate goal ownership properly
- Weekly review upsert may not update stats correctly

**Rationale:** Productivity features are used daily. Edge cases in reviews and triage affect workflow reliability.

---

### v0.7.42 — Database Migration Safety

**File:** `tests/migration-safety.test.js`
**Tests:** ~25

| Test Category | Count | Description |
|--------------|-------|-------------|
| Migration runner | 5 | Apply new migration, skip already-applied, ordering, idempotency, _migrations table state |
| Migration failure | 3 | Invalid SQL → error thrown, partial migration rollback, corrupted migration file |
| Schema integrity | 5 | All tables exist, foreign keys ON, WAL mode, indexes exist, UNIQUE constraints |
| Schema evolution | 4 | Add column migration, add table migration, add index migration, backward compatibility |
| Fresh database | 3 | Clean install creates all tables, all indexes, triggers |
| Backup before migration | 2 | Verify backup created before migration runs |
| Migration SQL validation | 3 | No DROP TABLE without safeguard, no data-deleting migrations without review |

**Code fixes expected:**
- Migration runner may not handle partial failures well
- Some indexes may be missing from migration files

**Rationale:** Database migrations are the highest-risk operation. A failed migration can corrupt or destroy data.

---

### v0.7.43 — Performance Baseline Tests

**File:** `tests/performance-baselines.test.js`
**Tests:** ~25

| Test Category | Count | Description |
|--------------|-------|-------------|
| Response time assertions | 8 | GET /api/tasks/all, GET /api/stats, GET /api/tasks/board, GET /api/search — must respond in <200ms with 100 tasks |
| Bulk operation performance | 4 | POST 100 tasks, bulk update 100, bulk delete 100 — must complete in <2s |
| Large dataset handling | 4 | 1000 tasks, 100 areas, 500 tags — verify no N+1 queries (response time check) |
| Pagination performance | 3 | First page vs last page of 1000 items — similar response time |
| Search performance | 3 | FTS5 search, LIKE fallback, empty result — response time |
| Export performance | 3 | Export with 1000 tasks — memory usage, response time |

**Code fixes expected:**
- Some endpoints may have N+1 query patterns with enrichTasks()
- Large exports may cause memory spikes

**Rationale:** Performance regressions are silent. Baseline tests catch them before users notice.

---

### v0.7.44 — Error Recovery & Graceful Degradation

**File:** `tests/error-recovery.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| Malformed JSON recovery | 4 | 400 response, no crash, descriptive error, correct Content-Type |
| Database constraint violations | 4 | Duplicate unique key → 409, foreign key violation → descriptive error, check constraint |
| Express error handler chain | 4 | AppError subclasses, NotFoundError, ValidationError, generic Error → 500 |
| No stack traces in responses | 3 | 400/404/500 responses never contain file paths, line numbers, or module names |
| Graceful shutdown | 4 | SIGTERM → drain connections → close DB → exit, SIGINT → same, in-flight requests complete |
| Database corruption handling | 3 | WAL corruption recovery, locked database, read-only filesystem |
| Middleware error handling | 4 | Auth middleware failure, CSRF middleware failure, validation middleware failure — all return JSON |
| Health endpoint resilience | 2 | Health check when DB is down, health check timing |
| Concurrent error handling | 2 | Multiple simultaneous errors don't crash server |

**Code fixes expected:**
- Some error paths may leak stack traces
- DB corruption may cause unhandled exceptions

**Rationale:** Production servers must degrade gracefully. Unhandled errors cause downtime.

---

### v0.7.45 — Cookie & Session Security Exhaustive

**File:** `tests/cookie-session-exhaustive.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| Cookie flags | 6 | HttpOnly, SameSite=Strict, Path=/, Secure on HTTPS, Max-Age, no Domain attribute |
| Session lifecycle | 5 | Create on login, delete on logout, expire after TTL, remember-me extends TTL, concurrent sessions |
| Session hijacking prevention | 4 | Different session per login, expired session → 401, malformed session cookie → 401, UUID format check |
| Password change → sessions | 3 | All sessions invalidated, cookie cleared, must re-login |
| CSRF cookie correlation | 3 | CSRF token rotates, mismatched token/cookie → 403, token present on GET responses |
| API token vs session | 4 | API token works without session, session works without API token, both present → session wins, expired token → 401 |
| Session cleanup | 3 | Scheduler cleanup removes expired sessions, cleanup doesn't remove valid sessions, cleanup frequency |
| Trust proxy | 2 | X-Forwarded-For respected, Secure cookie behind proxy |

**Code fixes expected:**
- Session cleanup may not run on schedule
- Trust proxy may not be correctly configured

**Rationale:** Session management is the primary auth mechanism. Exhaustive testing prevents auth bypass.

---

### v0.7.46 — Webhook & Push Notification Testing

**File:** `tests/webhook-push-exhaustive.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| Webhook CRUD | 5 | Create, list (no secret), update, delete, 10 webhook limit |
| Webhook URL validation | 6 | HTTPS required, SSRF blocked (localhost, 127.x, 10.x, 172.16.x, 192.168.x, 169.254.x), IPv6 mapped, DNS rebinding |
| Webhook event types | 4 | Valid events, invalid event → error, wildcard `*`, duplicate events deduplicated |
| Webhook HMAC signing | 3 | Signature header present, correct HMAC-SHA256, payload matches |
| Push subscription | 4 | Subscribe, duplicate endpoint → upsert, unsubscribe, list subscriptions |
| Push test notification | 2 | Send test, no subscriptions → graceful |
| VAPID key | 2 | Public key endpoint, key format |
| Webhook deactivation | 2 | Disable webhook, re-enable |
| Push assignment notification | 2 | Task assignment triggers push, dedup within 24h |

**Code fixes expected:**
- IPv6 SSRF checks may be incomplete
- Webhook HMAC may not be signed correctly on all event types

**Rationale:** Webhooks are an integration surface. Security and delivery guarantees are critical.

---

### v0.7.47 — Search & NLP Parser Exhaustive

**File:** `tests/search-nlp-exhaustive.test.js`
**Tests:** ~30

| Test Category | Count | Description |
|--------------|-------|-------------|
| FTS5 search | 6 | Single word, multi-word, partial match (prefix), special characters, empty query, result limit |
| LIKE fallback | 3 | FTS5 failure → LIKE fallback, case insensitive, wildcard handling |
| Search scoping | 4 | Filter by area_id, goal_id, status, combined filters |
| Search ranking | 2 | Title match ranked higher than note match, snippet generation |
| NLP parser dates | 6 | today, tomorrow, day after tomorrow, next monday, in 5 days, YYYY-MM-DD, MM/DD |
| NLP parser priorities | 3 | p1, P2, !3, multiple priorities (last wins) |
| NLP parser tags | 3 | #tag, multiple tags, camelCase tag |
| NLP parser edge cases | 3 | Input with only metadata (no title left), max length, empty input |

**Code fixes expected:**
- FTS5 MATCH may fail on certain special characters
- NLP may not handle "day after tomorrow" correctly

**Rationale:** Search and NLP are user-facing intelligence features. Edge cases cause confusion and frustration.

---

### v0.7.48 — Service Worker & Offline Queue Tests

**File:** `tests/service-worker.test.js`
**Tests:** ~20

| Test Category | Count | Description |
|--------------|-------|-------------|
| SW file structure | 3 | sw.js exists, valid JS syntax, version string present |
| Cache strategy | 3 | Network-first pattern, cache key naming, cache cleanup on version update |
| Offline store | 4 | store.js queue operations (add, get, clear), queue serialization, queue dedup |
| Static asset caching | 3 | app.js, styles.css, index.html cached, API responses network-first |
| Update notification | 2 | Version detection, update prompt pattern |
| Error handling | 3 | Cache storage full → graceful, network error → cache fallback, corrupt cache → recovery |
| Manifest validation | 2 | manifest.json valid, icons referenced exist |

**Implementation note:** These are static analysis + node.js evaluation tests (parse the JS, verify patterns). No browser environment needed.

**Code fixes expected:**
- Cache cleanup may not remove old versions
- Store.js may not handle queue overflow

**Rationale:** Service worker bugs cause stale content or broken offline experience.

---

### v0.7.49 — Code Coverage & Slow Test Optimization

**File:** `tests/coverage-audit.test.js`
**Tests:** ~20

| Test Category | Count | Description |
|--------------|-------|-------------|
| Route coverage audit | 8 | Every route file × every HTTP method = tested (verify via grep + test file analysis) |
| Untested route detection | 4 | Static analysis: find routes without corresponding test assertions |
| Test file conventions | 3 | Every test file uses describe(), uses cleanDb(), uses test helpers |
| Test performance | 3 | No individual test takes >2s, full suite completes in <3 minutes |
| Test isolation | 2 | Run tests in random order — all still pass |

**Associated work:**
- Add `c8` for code coverage measurement
- Add `npm run test:coverage` script
- Set baseline coverage thresholds in CI

**Code fixes expected:**
- May discover untested routes requiring new tests
- May find slow tests that need optimization

**Rationale:** Without coverage measurement, coverage claims are aspirational. This iteration makes them concrete.

---

### v0.7.50 — Final Verification & Release Gate

**File:** `tests/release-gate.test.js`
**Tests:** ~20

| Test Category | Count | Description |
|--------------|-------|-------------|
| Version consistency | 3 | package.json, CLAUDE.md, CHANGELOG.md, openapi.yaml all match |
| Documentation completeness | 3 | README exists, openapi.yaml is valid YAML, CHANGELOG has entry for current version |
| CI pipeline validation | 3 | ci.yml is valid, lint job exists, test job exists, audit job exists |
| Security baseline | 4 | `npm audit` has 0 critical/high, no console.log in src/, no hardcoded secrets, no TODO/FIXME in security-critical code |
| Test suite health | 4 | All tests pass, 0 skipped tests, test count matches CLAUDE.md, no duplicate test descriptions |
| Dependency hygiene | 3 | No unused dependencies, all deps have compatible licenses, lockfile in sync |

**Code fixes expected:**
- May need to update documentation
- May find unused dependencies

**Rationale:** The final iteration is a release gate. Everything must be green, documented, and auditable.

---

## Summary Table

| Iteration | Title | File | New Tests | Cumulative |
|-----------|-------|------|-----------|------------|
| v0.7.26 | Task CRUD Boundary Values | task-boundaries.test.js | ~45 | ~2,636 |
| v0.7.27 | Area & Goal Boundary Values | area-goal-boundaries.test.js | ~35 | ~2,671 |
| v0.7.28 | Subtask & Tag Boundary Values | subtask-tag-boundaries.test.js | ~35 | ~2,706 |
| v0.7.29 | Task Status State Machine | task-state-machine.test.js | ~40 | ~2,746 |
| v0.7.30 | API Contract Tests | api-contracts.test.js | ~55 | ~2,801 |
| v0.7.31 | Content-Type & Request Enforcement | content-type-enforcement.test.js | ~30 | ~2,831 |
| v0.7.32 | CORS Exhaustive | cors-exhaustive.test.js | ~25 | ~2,856 |
| v0.7.33 | Import/Export Roundtrip | import-export-roundtrip.test.js | ~40 | ~2,896 |
| v0.7.34 | Recurring Task Spawn Edges | recurring-spawn-edges.test.js | ~35 | ~2,931 |
| v0.7.35 | Frontend JS Unit Tests | frontend-units.test.js | ~45 | ~2,976 |
| v0.7.36 | Tag/Filter/Custom-Field Interactions | tag-filter-field-interactions.test.js | ~35 | ~3,011 |
| v0.7.37 | Multi-User Isolation Exhaustive | multi-user-exhaustive.test.js | ~40 | ~3,051 |
| v0.7.38 | Habit System Edge Cases | habit-edges.test.js | ~30 | ~3,081 |
| v0.7.39 | Focus System Edge Cases | focus-edges.test.js | ~30 | ~3,111 |
| v0.7.40 | List System Exhaustive | list-exhaustive.test.js | ~35 | ~3,146 |
| v0.7.41 | Notes, Inbox, Reviews Edges | productivity-edges.test.js | ~35 | ~3,181 |
| v0.7.42 | Database Migration Safety | migration-safety.test.js | ~25 | ~3,206 |
| v0.7.43 | Performance Baseline Tests | performance-baselines.test.js | ~25 | ~3,231 |
| v0.7.44 | Error Recovery & Degradation | error-recovery.test.js | ~30 | ~3,261 |
| v0.7.45 | Cookie & Session Exhaustive | cookie-session-exhaustive.test.js | ~30 | ~3,291 |
| v0.7.46 | Webhook & Push Exhaustive | webhook-push-exhaustive.test.js | ~30 | ~3,321 |
| v0.7.47 | Search & NLP Exhaustive | search-nlp-exhaustive.test.js | ~30 | ~3,351 |
| v0.7.48 | Service Worker & Offline | service-worker.test.js | ~20 | ~3,371 |
| v0.7.49 | Coverage Audit & Optimization | coverage-audit.test.js | ~20 | ~3,391 |
| v0.7.50 | Final Verification & Release Gate | release-gate.test.js | ~20 | ~3,411 |

**Total new tests: ~810**
**Projected final count: ~3,400+** (may exceed with bugfix-driven additional tests)

---

## Cross-Cutting Concerns

### Documentation Updates Per Iteration

Every commit must update:
1. `CHANGELOG.md` — New entry with test file name and count
2. `CLAUDE.md` — Update test count in header, add test file to Testing section
3. `package.json` — Bump version to `0.7.XX`
4. `docs/openapi.yaml` — Version field (if API behavior changes)

### CI/CD Requirements

All iterations must:
1. Pass `npm run lint` with 0 errors
2. Pass `npm test` with 0 failures
3. Pass `npm audit --audit-level=critical` with 0 critical vulnerabilities
4. Tag the commit with `v0.7.XX`

### Test Infrastructure Rules

1. Every test file must use `const { setup, cleanDb, teardown, agent } = require('./helpers')`
2. Every test must clean up in `beforeEach` via `cleanDb()`
3. No test may depend on another test's side effects
4. Factory functions (`makeArea`, `makeGoal`, `makeTask`, etc.) must be used for data creation
5. Multi-user tests must use `makeUser2()` + `agentAs()` pattern
6. No `console.log` in test files (use `assert` instead)
7. All assertions must use `node:assert/strict`

---

## Review Checkpoint

Before beginning implementation, verify:

- [ ] All 117 existing test files still pass (`npm test`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Current version is v0.7.25 in package.json
- [ ] CLAUDE.md metrics match reality
- [ ] No uncommitted changes in git

**Approved for implementation:** ___________________ (Date: ___)
