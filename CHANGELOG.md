# Changelog

All notable changes to LifeFlow are documented in this file.

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
