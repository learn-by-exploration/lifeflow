# Changelog

All notable changes to LifeFlow are documented in this file.

## [0.8.3] - 2026-04-04

### Added
- **Advanced Automation Engine** — Complete event-driven rule execution system with:
  - 19 trigger types: task (completed, created, updated, overdue, due_today, due_soon, stale), goal (progress, all_tasks_done), habit (logged, streak, missed), focus (completed, streak), schedule (daily, weekly, monthly), review (daily_review_saved, weekly_review_saved)
  - 19 action types: task (add_to_myday, remove_from_myday, set_priority, set_status, set_due_date, add_tag, move_to_goal, create_followup, add_subtasks, apply_template), habit (log_habit, create_habit_task), notification (send_notification, send_toast), organization (move_to_inbox, archive_goal, create_review_prompt)
  - AND/OR condition system with 10 operators (eq, neq, gt, lt, gte, lte, contains, not_contains, in, not_in)
  - Multi-action chains (up to 10 actions per rule)
  - Template variable interpolation (`{{task.title}}`, `{{percentage}}`, etc.)
  - Rate limiting (50 actions/min per user) and chain depth limiting (max 3)
- **14 built-in automation templates** — Pre-built rules: Auto-triage Overdue, Follow-up on Completion, Quick Win Radar, Morning Focus Setup, Evening Wind-Down, Monday Weekly Review, Streak Celebration, Missed Habit Recovery, Post-Focus Follow-up, Habit-Task Bridge, Celebrate Milestone, Stale Task Alert, Goal Sprint Finisher, Focus Session Streak
- **Automation execution log** — Paginated history of all rule executions with status, trigger context, and error details
- **Rule builder UI** — Full frontend rule editor with:
  - Grouped trigger selector (Task/Goal/Habit/Focus/Schedule/Review)
  - Trigger config with area/goal/priority/tag/habit filters
  - AND/OR condition builder with inline editing
  - Multi-action builder with per-action configuration
  - Natural language preview showing complete rule summary
- **Template gallery** — Browse and one-click install automation templates organized by category
- **Rule testing** — Dry-run endpoint to preview which tasks would match a rule's conditions
- **Rule editing** — Click any rule card to edit its full configuration
- **Automation toasts** — Toast notification queue for automation feedback
- **Automation suggestions** — System for smart rule recommendations (backend)
- **Scheduler jobs** for automations:
  - Overdue task detection (hourly)
  - Due today/soon checks (hourly)
  - Schedule-based trigger execution (every 15 min)
  - Stale task detection (every 6 hours)
  - Missed habit detection (daily)
  - Automation log cleanup (daily, prunes >30 days)
- **New API endpoints**: `GET /api/rules/constants`, `GET /api/rules/log`, `GET /api/rules/templates`, `POST /api/rules/templates/:id/install`, `POST /api/rules/:id/test`, `GET /api/rules/suggestions`, `POST /api/rules/suggestions/:id/dismiss`, `GET /api/rules/toasts`
- **New DB tables**: `automation_log`, `automation_templates`, `automation_suggestions`
- **Migration 004**: Advanced automations schema changes

### Fixed
- **create_followup automation** — Missing user_id on created follow-up tasks (now properly set)
- **task_created trigger** — Was never dispatched; now emits on task creation
- **goal_progress / goal_all_tasks_done triggers** — Now emitted when tasks are completed

## [0.8.2] - 2026-04-03

### Fixed
- **Critical: WAL checkpoint after auto-restore** — Restored data was only in WAL and lost on container restart. Now runs `wal_checkpoint(TRUNCATE)` immediately after auto-restore
- **Critical: Startup integrity** — Compares current DB against richest backup file directly (areas+tasks score), no longer depends on watermark which could itself be lost in WAL
- **Data watermark ratchet** — Watermark now only moves upward via `Math.max(current, prev)` per field, preventing corrupt data from lowering the alarm threshold
- **Auto-restore picks richest backup** — Scores all backup files by `areas + tasks + habits + tags`, selects highest instead of newest
- **Backup skips seed-only DBs** — `runBackup()` skips when `tasks === 0 && goals === 0` to avoid overwriting real backups with empty data
- **Custom Fields settings tab crash** — `wireSettingsTabs()` was out of scope in `renderCustomFieldsSettings()`; now passed as parameter
- **Collapsed sidebar section icons** — When sidebar is collapsed and a section is toggled closed, parent section icon (bolt, event_note, etc.) now shows in icon-rail mode
- **Missing CSS variable aliases** — Added `--bg2`, `--bd`, `--crd`, `--dn`, `--tx-s` (used 31 times in app.js for Gantt, table, tag manager, settings, changelog views)
- **`area_color` missing from task queries** — Added `a.color as area_color` to 14 SQL queries across tasks.js, stats.js, and features.js

### Added
- **Comprehensive backup** — `queryAllUserData()` now exports all 25 user data tables (was ~8)
- **Data watermark system** — `_data_watermark` setting tracks peak data counts per entity type
- **Startup integrity check** — On boot, compares DB against all backup files; auto-restores if backup has >2× current data
- **Migration safety tests** — 32 new tests for data watermark and integrity scenarios
- Settings UI polish: sidebar edge pill button, iOS-style toggles

## [0.8.1] - 2026-04-02

### Fixed
- **Critical: Data loss prevention** — WAL checkpoint on startup, safe seeding guards, backup integrity checks
- Auto-restore triggers on >50% data loss, not just total wipeout
- Include habits + habit_logs in backup and auto-restore

## [0.8.0] - 2026-04-02

### Added
- **List templates v2:** 27 templates across 9 categories (was 4)
  - New categories: Work & Productivity, Finance, Education & Learning, Seasonal & Situational
  - 12 new templates: meeting-agenda, project-launch, onboarding-checklist, monthly-bills, subscription-tracker, savings-goals, study-plan, course-progress, language-learning, spring-cleaning, holiday-prep, new-apartment
- **Deadline notification scheduler job:** Server-side push notifications for overdue/due-today tasks
  - Runs every 30 min, 24h dedup via push_notification_log, grouped per user
  - Only fires when VAPID keys configured; no-op otherwise
- **Today view Focus mode:** Minimal task list (checkbox + title + priority border only)
  - New "Focus" tab in List | Focus | Timeline tab bar
  - Hides stats bar, habits strip, balance alerts, metadata badges, action buttons
  - `F` keyboard shortcut to toggle between List and Focus
  - Tab preference persists to localStorage
- **Done tasks collapse:** Done section in Today view collapsed by default
  - Click "Done (N)" header to expand; sessionStorage persistence
  - `showCompleted='false'` setting still hides completely

### Fixed
- OpenAPI spec: `templateId` → `template_id` field name correction

## [0.7.52] - 2026-03-30

### Fixed
- **Critical:** Fix hex color regex to reject invalid 4/5-char values (#FFFF, #FFFFF)
  - Updated in `validate.js`, `auth.js`, `common.schema.js`

### Changed
- Add `user_id` to all test factory functions (makeArea, makeGoal, makeTask, makeTag, makeFocus, makeList, makeHabit)
- Tighten performance test thresholds (2000ms→500ms, 1000ms→200ms, 5000ms→2000ms)
- Convert frontend-units.test.js from source-inspection to jsdom behavioral tests

### Removed
- Consolidate duplicate IDOR tests across 4 files (−23 tests)
- Merge 4 meta/hygiene test files into project-health.test.js (−3 files)
  - Deleted: release-hygiene, dev-workflow, coverage-audit, release-gate

## [0.7.51] - 2026-03-30

### Added
- `tests/e2e-smoke.test.js` — End-to-end smoke tests (9 tests): full user lifecycle (register → login → area → goal → task → complete → dashboard → logout), security header verification, CSP validation
- `tests/a11y-audit.test.js` — Accessibility audit with axe-core (20 tests): WCAG compliance, ARIA landmarks, form labels, skip links, reduced-motion, touch targets, encoding safety
- `scripts/bump-version.sh` — Automated version bump script for package.json, openapi.yaml, CLAUDE.md, CHANGELOG.md
- `RELEASING.md` — Release checklist document
- `public/js/login.js` — Login page script extracted from inline
- `public/js/share.js` — Share page script extracted from inline
- `test:smoke` and `test:e2e` npm scripts

### Security
- Remove `'unsafe-inline'` from CSP `script-src` directive — extracted inline scripts from `login.html` and `share.html` to external JS files
- Added `aria-label` attributes to 5 `<select>` elements in `index.html` for accessibility compliance

### Fixed
- FTS5 search index now properly cleaned and rebuilt in test setup (`tests/helpers.js`)
- Export `rebuildSearchIndex` from `src/server.js` for test consumption
- Updated `tests/xss-prevention.test.js` to read share.js (external file) instead of expecting inline script in share.html

## [0.7.50] - 2026-03-30

### Added
- `tests/release-gate.test.js` — Final release gate verification tests
  - Version consistency: package.json ↔ CLAUDE.md ↔ CHANGELOG ↔ openapi.yaml, all v0.7.26-v0.7.50 entries
  - Documentation: README, CONTRIBUTING, LICENSE, Dockerfile presence
  - Security baseline: no console.log, no hardcoded secrets, helmet, CSRF, rate limiting
  - Test suite health: ≥142 test files, ≥3,400 tests documented, no empty files, no duplicate descriptions
  - Dependency hygiene: core deps, security deps, lock file, scripts
  - File structure: routes, middleware, public assets, database setup
  - Express config: JSON parser, static files, graceful shutdown, structured logging

### Summary — v0.7.26 to v0.7.50 Testing Campaign
- **25 iterations** of systematic test improvements
- **Total test files:** 144 (from ~117)
- **Total tests:** ~3,500+ (from ~2,189)
- **Coverage:** All 11 route files ≥70% tested, security audit, performance baselines

## [0.7.49] - 2026-03-30

### Added
- `tests/coverage-audit.test.js` — 40 code coverage & test audit tests
  - Route coverage audit: all 11 route files verified ≥70% test coverage
  - Test file conventions: describe() usage, helpers import, cleanDb patterns
  - Source code quality: no console.log in src/, no hardcoded secrets, no TODO in security files
  - Version consistency: package.json ↔ CLAUDE.md ↔ CHANGELOG.md ↔ openapi.yaml
  - Test suite structure: helper exports, no duplicate test files
  - Documentation completeness: README, CLAUDE.md, openapi.yaml, CONTRIBUTING.md

### Fixed
- Fixed package.json and openapi.yaml version (was stuck at 0.7.40, now properly 0.7.49)

## [0.7.48] - 2026-03-30

### Added
- `tests/service-worker.test.js` — 34 service worker & offline queue tests
  - SW file structure: lifecycle events, cache version, event listeners
  - Cache strategy: network-first pattern, cache cleanup, API exclusion, response cloning
  - Offline mutation handling: POST/PUT/DELETE interception, 503 response, client messaging
  - Store.js: mutation queue, event system, syncQueue, strict mode
  - Push notifications: push/notificationclick handlers, URL sanitization, same-origin check
  - PWA manifest: required fields, display mode, icons, theme/background colors
  - SPA offline fallback to cached root document

## [0.7.47] - 2026-03-30

### Added
- `tests/search-nlp-exhaustive.test.js` — 62 search & NLP parser tests
  - FTS5 global search: empty/whitespace queries, special character handling, limit enforcement, result structure
  - Task search scoping: keyword, note, area/goal/status filters, combined filters, ordering
  - NLP parser dates: today, tomorrow, day-after-tomorrow, in N days, next weekday, ISO/MM-DD dates
  - NLP parser priorities: p1-p3, !1-!3, case insensitive, boundary validation
  - NLP parser tags: single/multiple, camelCase, hyphenated, underscore
  - NLP parser edge cases: input limits, my_day flag, unicode, whitespace collapse

## [0.7.46] - 2026-03-30

### Added
- `tests/webhook-push-exhaustive.test.js` — 21 webhook & push edge case tests
  - Webhook activation toggle, update edge cases, secret security
  - SSRF prevention edge cases, push subscription lifecycle
  - Events endpoint, auth requirements

## [0.7.45] - 2026-03-30

### Added
- `tests/cookie-session-exhaustive.test.js` — 21 cookie & session security tests
  - Cookie flags (HttpOnly, SameSite, Path, Max-Age, remember-me)
  - Session lifecycle, hijacking prevention, password invalidation
  - Account lockout, logout cleanup

## [0.7.44] - 2026-03-30

### Added
- `tests/error-recovery.test.js` — 23 error recovery & graceful degradation tests
  - Malformed JSON recovery, constraint violations, error handler chain
  - No sensitive info leakage, middleware error handling
  - Health endpoint resilience, concurrent error handling

## [0.7.43] - 2026-03-30

### Added
- `tests/performance-baselines.test.js` — 15 performance baseline tests
  - Response time assertions for bulk endpoints
  - Bulk operation and concurrent request handling
  - Search and export performance verification

## [0.7.42] - 2026-03-30

### Added
- `tests/migration-safety.test.js` — 44 database migration & schema safety tests
  - Migration runner failure handling, SQL safety checks
  - Schema integrity, cascade deletion, constraint enforcement
  - Backup mechanics via API

## [0.7.41] - 2026-03-30

### Added
- `tests/productivity-edges.test.js` — 35 productivity edge case tests
  - Inbox CRUD, triage workflow, notes CRUD with goal filtering
  - Weekly reviews, daily reviews, automation rules

## [0.7.40] - 2026-03-30

### Added
- `tests/list-exhaustive.test.js` — 36 list system exhaustive tests
  - CRUD boundaries, item boundaries, batch create, reorder
  - Duplicate, clear-checked, uncheck-all operations
  - Sublist nesting, sharing, deletion cascade

## [0.7.39] - 2026-03-30

### Added
- `tests/focus-edges.test.js` — 31 focus system edge case tests
  - Session lifecycle, meta boundaries, steps, streak, insights
  - Stats accuracy, daily goal, task deletion orphan handling

## [0.7.38] - 2026-03-30

### Added
- `tests/habit-edges.test.js` — 37 habit system edge case tests
  - Streak calculation, multi-target habits, frequency types
  - Log boundaries, archived habits, area association, heatmap data

## [0.7.37] - 2026-03-30

### Added
- `tests/multi-user-exhaustive.test.js` — 33 multi-user isolation tests
  - Data isolation per entity (areas, goals, tasks, subtasks, tags, habits, notes, lists, focus, custom fields)
  - Search isolation (results scoped to user)
  - Stats isolation (counts scoped to user)
  - Export/import isolation (user data boundaries)
  - Cross-user operation prevention (reorder, move, set tags)
  - Session isolation (expire, invalid, concurrent)

## [0.7.36] - 2026-03-30

### Added
- `tests/tag-filter-field-interactions.test.js` — 30 tag/filter/custom-field interaction tests
  - Filter by tag, multi-tag, tag+status combined
  - Smart filters (stale, quickwins, blocked)
  - Custom field lifecycle with type constraints
  - Tag stats accuracy and usage counts
  - Saved filter CRUD and execution
  - Cross-entity multi-field filtering with pagination

## [0.7.35] - 2026-03-30

### Added
- `tests/frontend-units.test.js` — 36 frontend JS unit tests
  - HTML escaping (esc/escA) source verification
  - fmtDue() date formatting patterns
  - renderMd() markdown rendering with XSS prevention
  - NLP parser via POST /api/tasks/parse (11 endpoint tests)
  - isValidHexColor regex validation
  - Service Worker structure verification

## [0.7.34] - 2026-03-30

### Added
- `tests/recurring-spawn-edges.test.js` — 40 recurring task spawn edge case tests
  - Next due date calculation (yearly, every-N-days/weeks, weekdays, month rollover)
  - Spawn relation copying (tags, subtasks, custom fields, but not comments/deps)
  - Skip endpoint (skip+spawn, non-recurring, tags preserved)
  - Spawn idempotency (no double-spawn, rapid status cycling)
  - Recurring JSON validation (strings, objects, invalid values)
  - Spawned task field preservation (status=todo, my_day=0, endAfter tracking)

## [0.7.33] - 2026-03-30

### Added
- `tests/import-export-roundtrip.test.js` — 33 import/export roundtrip fidelity tests
  - Full roundtrip: export → wipe → import → verify field-by-field
  - Per-entity preservation (areas, goals, tasks, tags, subtasks, habits, lists)
  - ID remapping verification (tags→task_tags, areas→goals, goals→tasks)
  - Corrupt import handling and edge cases
  - Todoist/Trello import format tests
  - iCal export (VCALENDAR, RRULE, priority mapping)

## [0.7.32] - 2026-03-30

### Added
- `tests/cors-exhaustive.test.js` — 22 CORS exhaustive scenario tests
  - Preflight OPTIONS requests and headers
  - Access-Control header verification
  - Credentials behavior and cookie handling  
  - ALLOWED_ORIGINS config parsing
  - Public endpoint CORS behavior

## [0.7.31] - 2026-03-30

### Added
- `tests/content-type-enforcement.test.js` — 24 content-type & request body enforcement tests
  - Wrong/missing Content-Type handling (text/plain, form-encoded, multipart)
  - Request size limits and large body behavior
  - Empty/malformed body handling (null, array, deeply nested)
  - Non-JSON content (XML, binary, empty string)

## [0.7.30] - 2026-03-30

### Added
- `tests/api-contracts.test.js` — 54 API contract tests verifying response shapes
  - Task, Area/Goal, Tag/Filter, List/Item, Auth, Stats response shapes
  - Error response consistency (400/401/403/404 all have { error: string })
  - Pagination contracts (total, hasMore, offset, page, pages)
  - Status code consistency (201 create, 200 update, 200 delete)
  - Content-Type headers (JSON, iCal, export attachment)

## [0.7.29] - 2026-03-30

### Added
- `tests/task-state-machine.test.js` — 38 task status state machine tests
  - Valid transitions (todo↔doing↔done, reopen)
  - completed_at lifecycle (set/clear/preserve)
  - Recurring spawn on complete (daily/weekly/monthly, tag/subtask copying)
  - Bulk status change, automation triggers, my_day interaction

## [0.7.28] - 2026-03-30

### Added
- `tests/subtask-tag-boundaries.test.js` — 37 subtask & tag boundary tests
  - Subtask title/note/done/position edge cases
  - Tag name/color validation boundaries
  - Task-tag association: duplicates, non-existent IDs, stress (20 tags)
  - Subtask operations on deleted tasks

### Fixed
- Fix FK constraint crash when setting non-existent tag IDs on tasks (was 500, now gracefully ignored)
- Update `http-edge-cases.test.js` to reflect fixed behavior

## [0.7.27] - 2026-03-30

### Added
- `tests/area-goal-boundaries.test.js` — 48 area & goal boundary tests
  - Area name, icon, color validation
  - Goal title, description, status, due_date, color boundaries
  - Milestone CRUD boundaries

### Fixed
- Add Zod validation middleware to `PUT /api/goals/:id` (was missing)

## [0.7.26] - 2026-03-30

### Added
- `tests/task-boundaries.test.js` — 54 task CRUD boundary value tests
  - Title boundaries (empty, whitespace, max length, unicode, emoji, XSS)
  - Note boundaries (null, empty, max length, markdown)
  - Priority boundaries (-1 to 4, null, boolean, float, string)
  - Due date boundaries (null, past, future, leap year, invalid)
  - Status transitions (todo↔doing↔done, invalid, reopen)
  - Position and estimated_minutes boundaries

## [0.7.25] - 2026-03-30

### Added
- `tests/test-suite-health.test.js` — 18 test suite health & coverage audit tests
  - Test infrastructure validation (strict assertions, describe blocks, helper exports)
  - Route coverage audit (all route files loaded, critical endpoints verified)
  - Security baseline (auth required on all routes, security headers, CORS)
  - Database integrity (schema audit, WAL mode, foreign keys)
  - Code quality (no console.log, package.json completeness, version consistency)
  - Error handling (404 for unknown routes, invalid JSON 400 not 500)

### Summary (v0.7.1 – v0.7.25)
- 25 iterations of security hardening and test improvements
- From ~2,031 tests to 2,571+ tests across 117 test files
- Zero new features — pure quality, coverage, and security focus

## [0.7.24] - 2026-03-30

### Added
- `tests/security-regression.test.js` — 13 security regression tests
  - Auth endpoint security (logout, password change, rate limiting)
  - Data isolation (inbox, notes, focus sessions, templates)
  - Input boundary tests (max length, unicode, empty/null)
  - Session security (expired, malformed cookies)

## [0.7.23] - 2026-03-30

### Added
- `tests/concurrency-safety.test.js` — 8 concurrency safety tests
  - Concurrent task creation, rapid sequential updates
  - Parallel reads during writes (WAL mode verification)
  - Concurrent area/goal/task creation with position conflicts
  - Transaction isolation and rollback safety

## [0.7.22] - 2026-03-30

### Added
- `tests/e2e-task-lifecycle.test.js` — 10 E2E task lifecycle tests
  - Full CRUD lifecycle (create, subtask, update, complete, delete)
  - Reorder, my_day toggle, calendar view, board view
  - Overdue tasks, habits, lists, goals, areas CRUD workflows

## [0.7.21] - 2026-03-30

### Added
- `tests/e2e-security-workflows.test.js` — 16 E2E security workflow tests
  - Multi-user isolation (area, goal, task, tag, habit, list, search, export)
  - Auth + token combined flows (expired session + valid token)
  - Full lifecycle: create → complete → verify stats
  - CASCADE deletion verification (area → goal → task → subtask)
  - Tag persistence through task updates

## [0.7.20] - 2026-03-30

### Added
- `tests/schema-integrity.test.js` — 20 tests for database schema integrity
  - Index existence verification (8 critical indexes)
  - Foreign key enforcement, WAL mode
  - Table structure: CHECK constraints on tasks/goals
  - CASCADE deletion chain (area→goal→task→subtask)
  - Query performance validation (EXPLAIN QUERY PLAN)
  - Schema idempotency verification
  - Transaction safety checks

## [0.7.19] - 2026-03-30

### Added
- `tests/webhook-security.test.js` — 23 tests for webhook security
  - URL validation: reject http://, localhost, private IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x)
  - SSRF prevention: cloud metadata endpoint blocked
  - HMAC-SHA256 signing verification, AbortController timeout
  - Event validation: invalid events rejected, duplicates deduplicated
  - Max 10 webhooks per user enforced
  - IDOR: cross-user read/update/delete protection
  - List endpoint excludes secret from response
  - Update endpoint enforces HTTPS and SSRF checks

### Security
- Webhook URL must use HTTPS (http:// rejected)
- Max 10 webhooks per user limit
- Duplicate events deduplicated on creation
- At least one event required for webhook creation

## [0.7.18] - 2026-03-30

### Added
- `tests/api-token-security.test.js` — 13 tests for API token security
  - Token creation returns value once, stored as SHA-256 hash
  - Bearer token auth: valid access, invalid → 401, expired → 401
  - Token revocation: deleted token rejected on subsequent use
  - List endpoint excludes token value and hash from response
  - Token limit: max 10 tokens per user enforced
  - Cross-user isolation: cannot access or delete other user's tokens
  - `last_used_at` tracking on bearer auth usage
  - Token name validation (required, non-empty)

### Security
- Add max 10 API tokens per user limit to prevent abuse
- Security finding: API token exhaustion vector addressed

## [0.7.17] - 2026-03-30

### Added
- `tests/error-handling.test.js` — 17 tests for error handler & information leakage
  - Error response shape validation (400, 404 return `{ error: "message" }`)
  - Malformed JSON → 400 (not 500), wrong Content-Type → 400
  - API 404 catch-all: unknown `/api/*` routes return 404 JSON (not SPA HTML)
  - No stack traces, file paths, or SQL leaked in error responses
  - Health endpoint stripped of version/uptime (security finding #18)
  - Static analysis: error handler source verified safe

### Fixed
- Health endpoint no longer exposes `version` or `uptime` fields
- Unknown `/api/*` GET routes now correctly return 404 instead of SPA fallback HTML
- API 404 catch-all route added before SPA wildcard

### Security
- Security findings #18 (health version leak), #152, #153 addressed

## [0.7.16] - 2026-03-30

### Added
- `tests/csrf-integration.test.js` — 17 tests for CSRF integration verification
  - Middleware structure: factory function, server loading, /api mount
  - Cookie attributes: SameSite=Strict, Path=/, NOT HttpOnly, 64-char hex token
  - Token management: persists across requests, ensureTokenCookie guards regeneration
  - Source code analysis: header-vs-cookie validation, GET/HEAD/OPTIONS exemption
  - Bearer auth bypass: API token auth sets authMethod='bearer'
  - Frontend api.js: getCsrf(), X-CSRF-Token header, document.cookie parsing
  - Test mode short-circuit verified via config.isTest guard

### Security
- Security findings #4, #80 addressed (CSRF integration testing)

## [0.7.15] - 2026-03-30

### Added
- `tests/recurrence-safety.test.js` — 23 tests for recurrence & business logic safety
  - Month-end clamping: Jan 31 → Feb 28/29, Mar 31 → Apr 30, bi-monthly
  - Infinite loop protection: empty days array, all 7 days, invalid day numbers
  - Null due date guard: null due_date, null recurrence, end date reached
  - Field preservation on spawn: tags, subtasks, priority, estimated_minutes, time_block, assigned_to_user_id
  - Transaction safety: atomic spawn with tags + subtasks

### Fixed
- Recurring spawn now copies `assigned_to_user_id` to next occurrence (was lost)

### Security
- Security findings #117, #120, #121, #50, #53 addressed (recurrence safety)

## [0.7.14] - 2026-03-30

### Added
- `tests/sql-safety.test.js` — 14 tests for SQL injection resistance and query safety
  - SQL injection in task title, area name, tag name, note content, comment text
  - Union-based and boolean-based injection attempts
  - Search query injection resistance
  - Query boundary tests (bulk operations, search limits)
  - Static analysis: no string concatenation in SQL, all queries use ? placeholders

### Fixed
- Bulk PUT `/api/tasks/bulk`: max 100 IDs per request (was unbounded)
- Bulk PATCH `/api/tasks/batch`: max 100 IDs per request (was unbounded)
- POST `/api/tasks/bulk-myday`: max 100 IDs per request (was unbounded)
- POST `/api/tasks/reschedule`: max 100 IDs per request (was unbounded)

### Security
- Security findings #46, #47 addressed (unbounded query protection)
- All SQL queries verified as parameterized via static analysis tests

## [0.7.13] - 2026-03-30

### Added
- `tests/input-validation-comprehensive.test.js` — 31 tests for input validation boundaries
  - Task title, note, priority, status, due_date, recurring, time_block, estimated_minutes
  - Focus session duration_sec (negative and zero)
  - Area, goal, tag, list, habit, note name/title validation
  - ID parameter validation (non-integer, negative, float, zero)
  - Body size limit (413 for oversized payloads)
- `isValidDate()` helper for calendar-aware date validation (rejects 2024-13-01, 2024-02-30)
- `isPositiveInt()` helper for ID parameter validation

### Fixed
- Task creation/update: due_date now validated as real calendar date (was regex-only)
- Task creation: time_block_start/time_block_end now validated with HH:MM format
- Focus session: duration_sec=0 now correctly rejected (must be positive)
- Task GET/PUT/DELETE :id routes now reject negative and zero IDs with 400

### Security
- Input validation gaps closed across task, focus, and ID parameter routes

## [0.7.12] - 2026-03-30

### Added
- `tests/xss-prevention.test.js` — 29 tests for XSS prevention & output encoding
  - Server-side hex color validation on areas, goals, tags, habits, lists (create + update)
  - Verifies `<script>` in task titles stored verbatim (no server-side transformation)
  - API returns JSON Content-Type, not text/html
  - Frontend static analysis: esc(), escA(), renderMd() safety
  - CSP header verification (default-src, object-src, frame-ancestors)

### Fixed
- Goals creation route now validates color field (was accepting arbitrary strings)
- Habits creation/update routes now validate color field
- Lists creation/update routes now validate color field
- Added `isValidHexColor()` to frontend for client-side color validation

### Security
- Security findings #76, #77, #78, #81 addressed (XSS prevention)
- CSS injection via color fields blocked on all routes

## [0.7.11] - 2026-03-30

### Added
- `tests/idor-comprehensive.test.js` — 56 tests for systematic IDOR protection
  - Area ownership: update, delete, archive blocked for non-owners
  - Goal ownership: create, update, delete, milestones, progress, save-as-template blocked
  - Task ownership: read, update, delete, comments, subtasks, tags, deps, custom-fields, time
  - Tag ownership: update, delete verified
  - List ownership: update, delete, items, save-as-template blocked
  - Habit ownership: update, delete, log, heatmap blocked
  - Filter ownership: update, delete verified
  - Note ownership: read, update, delete blocked
  - Focus session ownership: update, end, delete, meta, steps blocked
  - Custom field ownership: update, delete blocked
  - Inbox ownership: update, delete, triage blocked
  - Template ownership: update, delete, apply blocked
  - Automation rule ownership: update, delete blocked

### Security
- Fix IDOR in `GET /api/tasks/:id/deps` — add task ownership check (Finding #40)
- Fix IDOR in `DELETE /api/tags/:id` — verify tag exists and belongs to user before deletion
- Fix IDOR in `DELETE /api/filters/:id` — verify filter exists and belongs to user before deletion

## [0.7.10] - 2026-03-30

### Added
- `tests/2fa-security.test.js` — 16 tests for 2FA security hardening
  - Status endpoint doesn't leak TOTP secret
  - Secret not exposed in GET /me or /users
  - Disable 2FA now requires current password
  - Source code verified to use `crypto.timingSafeEqual` for TOTP
  - API token auth bypasses 2FA (pre-authenticated)
  - Login 2FA flow (403 requires_2fa, correct/wrong TOTP)
  - Cross-user 2FA isolation
  - Token input validation (format, empty, missing)
  - All 2FA endpoints require authentication

### Security
- TOTP comparison uses `crypto.timingSafeEqual` (constant-time) instead of `!==` — timing attack prevention (Finding #4)
- Disable 2FA requires current password verification — prevents unauthorized 2FA removal
- Updated existing `2fa-extensive.test.js` to pass password on disable

## [0.7.9] - 2026-03-30

### Added
- `src/utils/password-policy.js` — Centralized password validation module
- `tests/password-policy.test.js` — 15 tests for password policy enforcement
  - Min 12 chars, max 128 chars, uppercase + lowercase + digit + special required
  - Common password blocklist (top 25 patterns)
  - Structured error responses with all unmet requirements
  - Unicode password support
  - Applied to both register and change-password routes

### Security
- Password strength enforcement with common password blocklist (Finding #8)
- Max password length of 128 chars prevents bcrypt DoS

## [0.7.8] - 2026-03-30

### Added
- `tests/account-lockout.test.js` — 19 tests for account lockout & rate limiting
  - Login attempt tracking: per-email failure counting in `login_attempts` table
  - Account locks after 5 failed attempts within 15-minute window
  - Locked account returns same error as wrong password (no enumeration)
  - Correct password rejected while account is locked
  - Lockout expires after 15 minutes, counter resets
  - Different emails are isolated (one lockout doesn't affect others)
  - Successful login resets failure counter
  - Rate limiter and auth limiter verified via source code checks

### Security
- Per-email account lockout after 5 failed login attempts (Finding #7)
  - Lockout duration: 15 minutes
  - Lockout response identical to wrong-password response (prevents account enumeration)
  - Timing-safe: runs bcrypt even during lockout to prevent timing-based detection
- `login_attempts` table stores lockout state in database (survives restarts)

### Changed
- Login handler now tracks failed attempts and enforces lockout before password check
- Successful login clears `login_attempts` record for that email

## [0.7.7] - 2026-03-30

### Added
- `tests/session-security.test.js` — 19 tests for session security hardening
  - Cookie security flags: HttpOnly, SameSite=Strict, Path=/ (register + login)
  - Cookie-based session lifecycle (valid, invalid, missing cookies)
  - Multiple concurrent sessions per user verified
  - Logout invalidates only current session, not all sessions
  - Session expiry enforcement (expired sessions return 401)

### Security
- Password change now invalidates ALL sessions (Finding #9)
  - All sessions deleted on password change, user must re-login
  - Cookie cleared with Max-Age=0 in password change response
  - Other users' sessions not affected
- Session cookie security flags verified via tests (Finding #12)

### Changed
- `POST /api/auth/change-password` no longer creates a new session after password change
  - Response clears session cookie; user must re-authenticate

## [0.7.6] - 2026-03-30

### Added
- `tests/auth-timing.test.js` — 16 tests validating timing attack prevention
  - Login returns identical response for valid-email-wrong-pass vs non-existent-email
  - Error messages are generic — no user existence leakage
  - Response headers identical shape for both failure cases
  - Source code static analysis: DUMMY_HASH constant, bcrypt always called
  - `requirePassword` middleware timing safety verified
  - Register returns 201 for existing email (no 409 enumeration leak)
  - Register response shape identical for new vs existing email

### Security
- Verified timing attack prevention in login handler (Finding #2)
- Verified timing attack prevention in requirePassword middleware (Finding #3)
- Verified account enumeration prevention in register handler (Finding #1)
- Security findings #1, #2, #3 confirmed resolved with test coverage

## [0.7.5] - 2026-03-30

### Added
- `tests/dev-workflow.test.js` — 22 tests validating developer workflow standards
  - `.editorconfig` settings, `.gitignore` completeness, `.env.example` coverage
  - No `console.log` in `src/` (must use logger)
  - Dockerfile security (USER node, HEALTHCHECK)
  - Consistent 2-space indentation in `src/`
  - Version consistency across package.json, CLAUDE.md, openapi.yaml, CHANGELOG.md
- Docker Compose healthcheck configuration

### Changed
- Version bump to 0.7.5 in package.json, CLAUDE.md, openapi.yaml

## [0.7.4] - 2026-03-30

### Changed
- Renamed 20 test files from chaotic `phase*`/`batch*`/`break_*` naming to descriptive names
  - `phase0-gaps` → `gaps-coverage`, `phase2` → `settings-reviews`, `phase3` → `transactions`
  - `phase3-makeyours` → `customization`, `phase4` → `accessibility`, `phase4-a11y-mobile` → `a11y-mobile`
  - `phase5` → `smart-filters`, `phase5-advanced` → `smart-filters-advanced`
  - `phase6` → `launch-readiness`, `phase6-launch` → `launch-checks`
  - `phase7` → `search-ical-planner`, `phase7-auth` → `auth-registration`
  - `batch4` → `import-api`, `batch5` → `integration-batch`
  - `nav-phase2` → `settings-advanced`
  - `break_auth` → `idor-auth`, `break_input` → `input-fuzzing`
  - `break_http` → `http-edge-cases`, `break_logic` → `logic-edge-cases`
  - `break_concurrency` → `concurrency`
- Updated `tests/README.md` with full test catalog and category documentation

### Added
- `tests/test-organization.test.js` — validates naming conventions (no phase/batch/break_ prefixes)
- `npm run test:security` — run security & auth tests only
- `npm run test:crud` — run core CRUD tests only
- `npm run test:integration` — run integration & edge-case tests only

## [0.7.3] - 2026-03-30

### Added
- `tests/helpers.test.js` — 24 tests validating test infrastructure (factories, agents, date helpers)
- `makeUser2()` in test helpers — standardized second-user creation with isolated session
- `agentAs(sessionId)` in test helpers — create authenticated agent for any session

### Changed
- Test helpers now export `makeUser2` and `agentAs` for multi-user testing

## [0.7.2] - 2026-03-30

### Added
- CI/CD audit job: `npm audit --audit-level=high` (allow-fail, reports vulnerabilities)
- `tests/ci-config.test.js` — 10 tests validating CI/CD pipeline configuration
- CI lint → test dependency chain verified by tests

### Changed
- `.github/workflows/ci.yml` enhanced with dedicated audit job

## [0.7.1] - 2026-03-30

### Added
- ESLint integration with `eslint:recommended` rules and Node.js environment
- `npm run lint` and `npm run lint:fix` scripts
- CI lint job (runs before tests, fast-fail gate)
- `tests/lint-config.test.js` — 16 tests validating ESLint configuration

### Fixed
- Strict equality (`!==`) replaces loose equality (`!=`) in 4 files
- `no-constant-condition` fix: `while(true)` → `for(;;)` in habit streak calc
- `no-inner-declarations` fix: function expression for shutdown handler
- `no-useless-escape` fix in frontend-validation test regex
- Auto-fixed `prefer-const` warnings across src/ and tests/

## [0.6.1] - 2026-03-29

### New Features
- Web Push delivery: VAPID keys, push.service.js, assignment triggers
- Multi-user assignment UI: user picker dropdown, assignee badges
- Push notification deduplication with 24h window per user

### Bug Fixes
- Push dedup query now filters by user_id (prevented cross-user notifications)
- Hoisted logger require to fix startup crash in non-test mode
- Webhook IDOR test now verifies real cross-user isolation

### Documentation
- Push endpoints documented in OpenAPI spec (vapid-key, subscribe, test)
- Updated CONTRIBUTING.md with TDD methodology and current metrics

### Testing
- Test hardening for 8 existing features (custom fields, API tokens, webhooks,
  2FA, import/export, Gantt, offline queue, push subscriptions)
- 2,045 tests across 86 test files

## [0.6.0] - 2026-03-27

### Multi-Expert Improvement (6 Phases)
- Export completeness: all 33 tables exported/imported
- Docker compose hardening: healthcheck, tmpfs, non-root user
- Goal progress visualization: progress bars, percentage badges
- What's Next suggestions: GET /api/tasks/suggested with scoring
- Task context menu: right-click with edit, delete, priority, complete
- Bulk operations expansion: batch priority, due date, move-to-goal
- Command palette: Ctrl+K fuzzy search across tasks, views, actions
- Background scheduler: session cleanup, recurring task spawn, overdue checks
- Request logging middleware: structured HTTP request logging
- Daily micro-review: POST/GET /api/reviews/daily
- Today view module extraction
- Expanded offline state store

### Testing
- 1,918 tests across 78+ test files

## [0.5.1] - 2026-03-27

### Security Remediation
- 115 security findings addressed across 22 files
- Audit logging service (create/update/delete events)
- CSRF token hardening
- Rate limiting on auth endpoints
- Input validation tightening

## [0.5.0] - 2026-03-27

### New Features
- API token authentication (SHA-256 hashed, Bearer tokens)
- TOTP 2FA (RFC 6238, setup/verify/disable, recovery)
- Outbound webhooks (HMAC-SHA256 signed, configurable events)
- Web Push subscription endpoints (subscribe/unsubscribe/test)
- Offline mutation queue (service worker queuing)
- Multi-user assignment backend (assigned_to_user_id FK)
- GET /api/users endpoint
- AI BYOK endpoints (suggest, schedule with encrypted API key)

### Database
- Added: api_tokens, push_subscriptions, webhooks, automation_rules tables
- Added: assigned_to_user_id column on tasks

## [0.4.0] - 2026-03-26

### New Features
- Table view with sortable columns, grouping, filtering, pagination
- Custom fields (text, number, date, select) with per-task values
- Gantt Chart V1 (SVG timeline, task bars, today marker)
- Todoist JSON import (projects → goals, items → tasks)
- Trello JSON import (lists → goals, cards → tasks)
- iCal export (VCALENDAR with RRULE for recurring tasks)
- Saved filters and smart lists

### Database
- Added: custom_field_defs, task_custom_values, saved_filters tables

## [0.3.0] - 2026-03-27

### Collapsible Sidebar with Icon Rail
- Sidebar collapses to 56px icon rail (click chevron or `Ctrl/Cmd+B`)
- Logo/brand click navigates to Today view (home navigation)
- CSS tooltips on hover for all icons in collapsed mode
- Badges become 8px dot indicators when collapsed
- Smooth 200ms width transition with `will-change`
- Collapse state persisted in localStorage
- Desktop-only — mobile hamburger behavior unchanged
- Life Areas, Filters, Lists sections hidden in collapsed mode
- Section group labels become thin dividers when collapsed
- Default 📋 icon for lists without custom icon

### Settings Panel Improvements (P0–P3)
- Fixed toggle class mismatch (`set-slider` → `slider`)
- Scrollable tab bar with `overflow-x:auto`
- Touch-visible area/grocery reorder buttons (`@media(pointer:coarse)`)
- ARIA roles (`tablist`, `tab`, `tabpanel`) on settings tabs
- Auto-save debounce (800ms) for status/priority labels
- Visual group separators between tab groups
- Settings search filter input
- Badge check throttled to 60s

### UI Bug Fixes
- Home button in settings breadcrumb
- Error banner fix for area/goal/list modals (hidden by default, `.show` class)
- Toggle switch left-shift fix (`display:inline-block` + `position:absolute`)
- Tour updated for new sidebar groups (Execution/Planning/Reflection)
- Day Planner chevron icons fixed (wrapped in `<span class="material-icons-round">`)

## [0.2.6] - 2026-03-26

### Mobile & Responsive UX Overhaul
- Touch drag-and-drop polyfill (long-press 200ms, ghost element, haptic feedback)
- iOS virtual keyboard detection via visualViewport API
- Service Worker error handling with user-facing toasts
- 375px overflow fix (full-width modals, panels on iPhone SE/6/7/8)
- FAB z-index fix (45) positioned above bottom nav bar
- Calendar grid compact breakpoints (380px, 320px)
- Detail panel tablet sizing (min(380px, 45vw) at 769–1200px)
- Input font 16px on iOS (prevents auto-zoom)
- Touch targets ≥44px on coarse pointer devices
- Detail panel smooth scroll (-webkit-overflow-scrolling:touch)
- Z-index scale normalized (10→9999 with documentation)
- Search overlay uses dvh for keyboard visibility
- :focus-visible on all interactive elements
- Print stylesheet (@media print)
- prefers-color-scheme auto-detection with data-theme-auto
- Weekly planner responsive grid (920px, 600px breakpoints)
- Confetti animation respects prefers-reduced-motion
- Loading spinner on render

### Documentation
- Full CLAUDE.md rewrite (accurate architecture, schema, metrics)
- Documentation audit report (docs/DOCUMENTATION-AUDIT.md)

### Testing
- 105 new tests for mobile/responsive fixes (tests/mobile-responsive-fixes.test.js)
- Total: 1,692 tests across 60 files

---

## [0.2.5] - 2026-03-25

### CSS Input Design System
- Sprint 1: CSS input design system + :focus-visible on all inputs
- Sprint 2: HTML accessibility for all form inputs
- Sprint 3: Validation engine + inline error messages
- Sprint 4: Habits form validation + schedule_days display
- Sprint 5: Consistency polish, touch targets, keyboard nav, transitions
- Mobile layout: 100dvh, safe-area insets, touch quick actions

---

## [0.2.1] - 2026-03-25

### Bug Fix
- Timezone date offset bug — calendar, schedule, planner now use local dates

---

## [0.3.3] - 2026-03-25

### Security Hardening
- IDOR 404 responses, FTS user scoping, type safety, tag color validation
- Sprint 1–7: security, stability, performance, validation, headers
- Auth bypasses, validation fixes, accessibility improvements
- Undo state fixes, a11y polish

---

## [0.3.0] - 2026-03-25

### Security & Architecture
- 200-agent security hackathon — 115 findings across 22 files
- S1–S6 security remediation (CSRF, auth, rate limiting, input validation)
- Backend refactoring: server.js split into 10 route modules + middleware + services
- 26 SQLite tables (up from 7)
- Session-based authentication with bcrypt
- Phase 0 + Sprints 1–5: XSS fixes, pagination, validation, UI feedback, skeleton loading, navigation, breadcrumbs, detail panel, priority badges, accessibility

---

## [2.0.0] - 2026-03-22

### UX Redesign

Major interface overhaul based on a 12-expert multi-perspective review (2 architects, 3 UI experts, 5 life coaches, 2 PMs).

#### Sidebar Redesign (Phase A)
- Reduced navigation from 23+ items to 5 primary + 2 collapsible groups
- Primary nav: Inbox, Today, All Tasks, Calendar
- Life Areas promoted to top-level with inline add button
- Plan group: Board, Weekly Plan, Matrix (collapsible)
- Filters group: Smart Lists + Saved Filters merged (collapsible)
- Bottom bar with Settings and Reports icons

#### Today View (Phase B)
- Unified "Today" view merges My Day + Day Planner + Dashboard stats
- Stats bar: tasks done, focus minutes, streak, overdue count
- List / Timeline tab toggle
- Overdue tasks section with count and items
- Habits strip at bottom with quick-toggle buttons
- Renamed "My Day" → "Today" throughout the app

#### Settings Tabs (Phase C)
- Settings view now has 7 tabs: General, Appearance, Tags, Templates, Automations, Data, Shortcuts
- Visual theme picker with color swatches (8 themes)
- Tags, Templates, and Automations content reused from existing views
- Keyboard shortcuts reference integrated
- Import/Export/Reset consolidated under Data tab

#### Reports View (Phase D)
- New tabbed Reports view with 7 tabs: Overview, Activity, Habits, Focus, Analytics, Reviews, Notes
- Delegates to existing render functions with tab bar overlay
- Accessible via sidebar icon and command palette

#### Filters Merge (Phase E)
- Smart Lists (Stale, Quick Wins, Blocked) and Saved Filters unified under one sidebar section
- Removed redundant separate sections

### Bug Fixes
- Fixed 4 broken render targets where `renderSettings`, `renderHabits`, `renderSavedFilter`, and `renderPlanner` rendered into wrong containers (`cp-body`/`mc` → `ct`)

### Testing
- 537 tests across 32 files, all passing

---

## [1.0.0] - 2026-03-21

### Initial Release

Full-featured personal task management app.

#### Core Features
- Life Areas with color-coded organization
- Goals with milestones and progress tracking
- Tasks with priorities, due dates, due times, tags, subtasks, dependencies
- Recurring tasks with multiple frequency patterns
- Habit tracker with daily logging and heatmaps

#### Views
- My Day / All Tasks / Board (Kanban) / Calendar
- Weekly Planner / Eisenhower Matrix / Day Planner
- Dashboard with streaks, trends, heatmap, area breakdown
- Inbox for quick capture
- Activity Log / Focus History / Time Analytics

#### Productivity
- Focus timer (Pomodoro) with customizable durations
- Command palette (Ctrl+K) with search and navigation
- Quick capture with natural language date parsing
- Daily review ritual
- Morning briefing
- Smart filters (Stale, Quick Wins, Blocked)
- Saved custom filters
- Bulk operations with multi-select
- Task templates
- Automation rules

#### Organization
- Tag manager with color coding
- Notes with markdown support
- Weekly review
- iCal export
- Import/Export (JSON)

#### UX
- 8 themes (Midnight, Charcoal, Forest, Ocean, Rose, Light, Nord, Sunset)
- Keyboard shortcuts and vim-style navigation
- Onboarding wizard
- Mobile responsive
- Push notifications via Service Worker
- Drag-and-drop reorder and board management
- Confetti celebrations on completions
- Undo system
- Global FTS5 search
- Accessibility improvements

#### Technical
- Single-file SPA (vanilla JS, no framework)
- Node.js + Express 5 backend
- better-sqlite3 with FTS5
- 537 tests across 32 test files
