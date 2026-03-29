# LifeFlow Security Hardening & Test Excellence — 25-Iteration Plan

> **Version:** v0.7.1 → v0.7.25
> **Base:** v0.7.0 (2,031 tests | 88 test files | 190 routes | 34 tables)
> **Scope:** Security hardening, exhaustive testing, test organization, stability — NO new features
> **Date:** 30 March 2026

---

## Executive Summary

This plan addresses 115 security audit findings (16 critical, 32 high) and transforms
LifeFlow's test suite from comprehensive-but-organic into a production-grade, CI-enforced
quality gate. Each of 25 iterations follows TDD: write tests first, then implement the fix.

### Target End State (v0.7.25)

| Metric | Current (v0.7.0) | Target (v0.7.25) |
|--------|-------------------|-------------------|
| Tests | 2,031 | ~3,200+ |
| Test files | 88 | ~100+ |
| Security findings open | 115 | <15 (low/info only) |
| CI pipeline | Basic (test only) | Full (lint + test + audit + Docker) |
| ESLint | None | Configured + enforced |
| Code coverage | Unknown | Measured, ≥80% backend |
| IDOR protections | Partial | Complete (all routes verified) |
| Input validation | Ad-hoc | Systematic (Zod on all routes) |

---

## Expert Panel Analysis

### Security Architect Assessment

**Critical gaps identified:**
1. **IDOR is the #1 threat.** Findings #40-42, #48 show goal ownership not verified on task move, bulk update, template apply, and inbox triage. Any authenticated user can manipulate another user's data.
2. **CSRF exists but is disabled in test mode.** The double-submit cookie middleware exists in `src/middleware/csrf.js` but `NODE_ENV=test` skips it. No integration tests verify it actually works in production mode.
3. **Rate limiting is untestable.** `express-rate-limit` skips enforcement in test mode. No mechanism exists to test 429 behavior.
4. **Input validation is inconsistent.** Some routes use Zod schemas (`tasks.schema.js`, `tags.schema.js`), others use inline checks. No systematic boundary validation.
5. **Timing attacks remain.** Login and `requirePassword` short-circuit bcrypt when user doesn't exist (#2, #3).
6. **Session management is weak.** No IP/UA binding (#5), no per-user lockout (#7), password change doesn't invalidate all sessions (#9).
7. **Health endpoint leaks version info** (#18) — reconnaissance risk.

**What's already done well:**
- Parameterized SQL everywhere (no SQLi risk)
- bcrypt for password hashing
- CSRF middleware implementation exists
- HSTS header present
- Session cookies use HttpOnly + SameSite=Strict

### QA Lead Assessment

**Test suite strengths:**
- 2,031 tests with real SQLite (no mocking) = high-fidelity integration tests
- Factory pattern (`makeArea`, `makeGoal`, etc.) is clean and reusable
- `agent()` proxy pattern for authenticated requests is elegant
- Good edge-case coverage on core CRUD

**Test suite weaknesses:**
1. **Naming is chaotic.** Files like `phase3.test.js`, `batch4.test.js`, `phase5-advanced.test.js` give no hint of what they test. 88 files with no organizational structure.
2. **No test categorization.** No way to run "just security tests" or "just CRUD tests."
3. **Multi-user testing is limited.** Only `break_auth.test.js` and `multi-user.test.js` test cross-user isolation. Many routes lack IDOR tests.
4. **No code coverage measurement.** Unknown which routes/branches are untested.
5. **Frontend tests are static analysis only.** `frontend.test.js` reads file content, never renders or executes JS.
6. **Performance tests don't assert timing.** `performance.test.js` tests correctness, not speed.
7. **No negative testing for many routes.** Happy path is tested, error paths are spotty.
8. **Test helpers lack `makeUser2()` standardization.** `break_auth.test.js` defines its own; not reusable.

### DevOps Engineer Assessment

**Current CI state:**
- `.github/workflows/ci.yml` exists but is minimal: checkout → install → test on Node 20+22.
- No linting, no security audit, no Docker build, no coverage reporting.
- No branch protection rules implied.

**Missing:**
1. ESLint for code quality enforcement
2. `npm audit` for dependency vulnerability scanning
3. Docker build + security scan in CI
4. Test coverage reporting (c8 or similar)
5. Separate CI jobs for fast-fail (lint→test→build)
6. Test result artifacts and trend tracking
7. Pre-commit hooks (husky + lint-staged)

### UI/UX Security Assessment

**XSS surface:**
- `public/app.js` (5,369 lines) uses extensive `innerHTML` with template literals
- `esc()` and `escA()` exist but audit needed for completeness
- Markdown renderer (`renderMd`) has known issues: code blocks (#77), javascript: URIs (#78)
- CSP allows `unsafe-inline` for both scripts and styles (#11)

**CSRF surface:**
- API client in `public/js/api.js` sends `X-CSRF-Token` header
- But middleware is disabled in tests — no integration verification

### PM Prioritization

**Risk-adjusted iteration ordering:**
1. **Foundation first** (v0.7.1-5): Without CI/CD, linting, and test infra, every subsequent fix risks regressions
2. **Auth & sessions** (v0.7.6-10): Account takeover is highest-impact threat
3. **Input validation** (v0.7.11-15): IDOR and injection are exploitable by any authenticated user
4. **API hardening** (v0.7.16-20): Rate limiting, DoS prevention, error handling
5. **Verification** (v0.7.21-25): Audit closure, stress testing, penetration testing

### Competitor Benchmark

Production task managers (Todoist, Trello, Asana) implement:
- CSP without `unsafe-inline` (nonce-based)
- OAuth 2.0 / SSO alongside password auth
- Per-endpoint rate limiting with sliding windows
- Comprehensive audit logging
- Automated dependency scanning (Dependabot/Snyk)
- SOC 2 compliance testing
- Content-length limits per endpoint
- Request timeout enforcement
- Parameterized error messages (no stack traces)

LifeFlow needs: IDOR elimination, consistent input validation, rate limit enforcement, CSP hardening, audit logging. These 25 iterations close most of the gap.

---

## Phase 1: Foundation (v0.7.1 – v0.7.5)

### v0.7.1 — ESLint & Code Quality Gate

**Focus:** Static analysis to catch errors before they reach tests

**Tests to write first (~15 tests):**
```
tests/lint-config.test.js
  - .eslintrc.json exists and is valid JSON
  - ESLint config extends 'eslint:recommended'
  - ESLint config sets node environment
  - ESLint config enforces strict equality (eqeqeq)
  - ESLint config warns on unused variables (no-unused-vars)
  - ESLint config enforces no-var
  - ESLint config enforces prefer-const
  - No ESLint errors in src/**/*.js (run via child_process)
  - No ESLint errors in tests/**/*.js
  - package.json has "lint" script
  - package.json has "lint:fix" script

tests/release-hygiene.test.js (extend existing)
  - package.json version matches CLAUDE.md version
  - CHANGELOG.md contains current version entry
```

**Implementation:**
- Install `eslint` as devDependency
- Create `.eslintrc.json` with recommended + node rules
- Add `"lint": "eslint src/ tests/"` to package.json scripts
- Fix all lint errors (likely: unused vars, missing strict mode, == vs ===)
- No functional code changes

**CI update:** Add lint step before test step in `ci.yml`

**Expected test count:** 2,031 → ~2,046 (+15)

---

### v0.7.2 — CI/CD Pipeline Hardening

**Focus:** Robust CI pipeline with fast-fail stages, coverage, and security audit

**Tests to write first (~12 tests):**
```
tests/ci-config.test.js
  - .github/workflows/ci.yml exists
  - CI config runs on push to main
  - CI config runs on pull_request to main
  - CI config tests Node 20 and 22
  - CI config has lint job/step before test
  - CI config has npm audit step
  - CI config has coverage step
  - CI config uploads coverage artifact
  - .github/workflows/ci.yml is valid YAML (parse test)

tests/release-hygiene.test.js (extend)
  - .npmrc or similar lockfile config exists
  - package-lock.json exists and is committed
```

**Implementation:**
- Rewrite `.github/workflows/ci.yml`:
  ```yaml
  jobs:
    lint:
      steps: [checkout, setup-node, npm ci, npm run lint]
    test:
      needs: lint
      strategy: { matrix: { node: [20, 22] } }
      steps: [checkout, setup-node, npm ci, npm test, upload coverage]
    audit:
      steps: [checkout, setup-node, npm ci, npm audit --audit-level=high]
    docker:
      steps: [checkout, docker build, docker scout/trivy scan]
  ```
- Install `c8` for coverage: `npx c8 node --test ...`
- Add coverage reporting to test script
- Generate `package-lock.json` if missing

**Expected test count:** 2,046 → ~2,058 (+12)

---

### v0.7.3 — Test Infrastructure Improvements

**Focus:** Standardize test helpers, add `makeUser2()`, improve isolation

**Tests to write first (~20 tests):**
```
tests/helpers.test.js (NEW — test the test infrastructure itself)
  - setup() returns app, db, dir
  - setup() is idempotent (calling twice returns same instance)
  - cleanDb() empties all data tables
  - cleanDb() preserves users and sessions tables
  - makeArea() returns area with valid id, name, color
  - makeArea() accepts overrides
  - makeGoal() associates with area
  - makeTask() associates with goal
  - makeSubtask() associates with task
  - makeTag() returns tag with id and name
  - linkTag() creates task_tags row
  - makeFocus() creates focus session
  - makeList() creates list with defaults
  - makeListItem() creates item in list
  - makeHabit() creates habit with defaults
  - agent() returns authenticated supertest agent
  - rawAgent() returns unauthenticated supertest agent
  - today() returns YYYY-MM-DD format
  - daysFromNow(1) returns tomorrow
  - makeUser2() creates second user with separate session (NEW)
```

**Implementation:**
- Add `makeUser2()` to `tests/helpers.js` (standardize from `break_auth.test.js` pattern)
- Add `makeUser(overrides)` generic factory for N users
- Add `agentAs(userId)` — create authenticated agent for any user
- Add `makeNote()`, `makeReview()`, `makeRule()` factories for untested entities
- Add `cleanAll()` variant that also cleans users (for full isolation tests)
- Export counter-based email generation for unique user creation

**Expected test count:** 2,058 → ~2,078 (+20)

---

### v0.7.4 — Test Reorganization & Naming

**Focus:** Rename chaotic test files, add test categorization via describe blocks

**Tests to write first (~8 tests):**
```
tests/test-organization.test.js
  - All test files follow naming convention: {module}.test.js or {module}-{aspect}.test.js
  - No test files with "phase" prefix (verify migration complete)
  - No test files with "batch" prefix (verify migration complete)
  - All test files have top-level describe() with module name
  - Every test file imports from './helpers'
  - No test file exceeds 500 lines (split if so)
  - All test files use before/beforeEach/after consistently
  - tests/README.md exists documenting test categories
```

**Implementation — File rename mapping:**
```
phase0-gaps.test.js       → gaps-coverage.test.js
phase2.test.js            → settings-reviews.test.js
phase3.test.js            → transactions.test.js
phase3-makeyours.test.js  → customization.test.js
phase4.test.js            → accessibility.test.js
phase4-a11y-mobile.test.js → a11y-mobile.test.js
phase5.test.js            → smart-filters.test.js
phase5-advanced.test.js   → smart-filters-advanced.test.js
phase6.test.js            → launch-readiness.test.js
phase6-launch.test.js     → launch-checks.test.js
phase7.test.js            → search-ical-planner.test.js
phase7-auth.test.js       → auth-registration.test.js
batch4.test.js            → import-api.test.js
batch5.test.js            → integration-batch.test.js
nav-phase2.test.js        → settings-advanced.test.js
break_auth.test.js        → idor-auth.test.js
break_input.test.js       → input-fuzzing.test.js
break_http.test.js        → http-edge-cases.test.js
break_logic.test.js       → logic-edge-cases.test.js
break_concurrency.test.js → concurrency.test.js
```
- Create `tests/README.md` documenting test categories and how to run subsets
- Add npm scripts: `"test:security"`, `"test:crud"`, `"test:integration"`
- Use `--test-name-pattern` for category filtering

**Expected test count:** 2,078 → ~2,086 (+8, mostly structural)

---

### v0.7.5 — Pre-commit Hooks & Developer Workflow

**Focus:** Prevent bad code from being committed

**Tests to write first (~10 tests):**
```
tests/dev-workflow.test.js
  - .husky directory exists (or equivalent)
  - pre-commit hook runs lint
  - .editorconfig exists with consistent settings
  - All JS files use 'use strict' or are modules
  - No console.log in src/ files (use logger instead)
  - No TODO/FIXME/HACK comments without issue reference
  - .gitignore includes *.db-shm, *.db-wal, backups/, node_modules/
  - .env.example exists with all documented env vars
  - Dockerfile has no root user in final stage
  - Docker compose uses health check
```

**Implementation:**
- Install `husky` and `lint-staged` as devDependencies
- Configure pre-commit: `npx lint-staged` (runs ESLint on staged files)
- Create `.editorconfig` with indent_style=space, indent_size=2
- Audit and remove console.log from src/ (replace with logger)
- Verify Dockerfile uses non-root user (`USER node`)

**Expected test count:** 2,086 → ~2,096 (+10)

---

## Phase 2: Auth & Session Security (v0.7.6 – v0.7.10)

### v0.7.6 — Timing Attack Prevention

**Focus:** Fix bcrypt short-circuit timing attack (Findings #2, #3)

**Tests to write first (~18 tests):**
```
tests/auth-timing.test.js
  - Login with valid email: response time ~100-200ms (bcrypt runs)
  - Login with invalid email: response time ~100-200ms (bcrypt STILL runs)
  - Login timing difference < 50ms between valid/invalid email (statistical)
  - Login with valid email + wrong password: 401
  - Login with invalid email + any password: 401
  - Response body identical for valid-email-wrong-pass vs invalid-email
  - requirePassword middleware: timing consistent for existing vs non-existing user
  - DUMMY_HASH constant exists in auth module
  - Login always calls bcrypt.compareSync (no short-circuit)
  - 10 sequential logins with invalid email: all respond within consistent time window
  - Error message is generic ("Invalid credentials") not "User not found"
  - Failed login doesn't leak username existence in headers
  - Failed login response headers are identical for both cases
  - Login response does not include user-specific error codes

tests/auth-enumeration.test.js
  - POST /api/auth/register with existing email: response identical to new email
  - Register response status code same for existing vs new email
  - Register response body shape identical for existing vs new email
  - Register response time similar for existing vs new email
```

**Implementation:**
- Define `DUMMY_HASH = bcrypt.hashSync('x'.repeat(72), 10)` constant
- In login handler: when `!user`, still call `bcrypt.compareSync(password, DUMMY_HASH)`
- In requirePassword middleware: same pattern
- Register: return consistent 201 response regardless of email existence
- Ensure error messages are identical: "Invalid credentials" for all login failures

**Security findings addressed:** #1, #2, #3

**Expected test count:** 2,096 → ~2,114 (+18)

---

### v0.7.7 — Session Security Hardening

**Focus:** Session binding, invalidation, and cookie security (Findings #5, #9, #12)

**Tests to write first (~22 tests):**
```
tests/session-security.test.js
  - Session stores IP hash on creation
  - Session stores User-Agent hash on creation
  - Request with same IP + UA: authenticated (200)
  - Request with different IP: session invalidated (401)
  - Request with different User-Agent: session invalidated (401)
  - Request with missing User-Agent: still works (graceful degradation)
  - Session record contains ip_hash column
  - Session record contains ua_hash column
  - Password change invalidates ALL sessions (including current)
  - Password change returns instruction to re-login
  - After password change: old session cookie returns 401
  - After password change: other device sessions return 401
  - New login after password change creates fresh session
  - Session expiry: expired session returns 401
  - Session expiry: remember-me extends to 30 days
  - Session expiry: non-remember-me expires in 24h
  - Session cookie has HttpOnly flag
  - Session cookie has SameSite=Strict
  - Session cookie has Path=/
  - Multiple concurrent sessions per user allowed
  - Logout invalidates only current session (not all)
  - GET /api/auth/sessions lists active sessions for user
```

**Implementation:**
- Add `ip_hash TEXT`, `ua_hash TEXT` columns to sessions table (migration)
- On session creation: hash IP + UA with SHA-256, store in session row
- In `requireAuth`: validate IP hash + UA hash on each request
- On mismatch: destroy session, return 401
- Password change: `DELETE FROM sessions WHERE user_id = ?` (all sessions)
- Add `GET /api/auth/sessions` endpoint to list user's active sessions

**Security findings addressed:** #5, #9, #12

**Expected test count:** 2,114 → ~2,136 (+22)

---

### v0.7.8 — Account Lockout & Rate Limiting

**Focus:** Per-user login rate limiting and account lockout (Findings #6, #7)

**Tests to write first (~20 tests):**
```
tests/rate-limiting.test.js
  - Rate limiter middleware exists on /api/* routes
  - Auth limiter exists on /api/auth/* routes
  - Rate limiter config: max from env RATE_LIMIT_MAX
  - Rate limiter config: window from env RATE_LIMIT_WINDOW_MS
  - Rate limiter returns 429 with Retry-After header (need test mode override)
  - Rate limiter X-RateLimit-Remaining header decrements

tests/account-lockout.test.js
  - 1 failed login: no lockout
  - 5 failed logins same email: no lockout yet
  - 6th failed login same email: locked (429 or 403)
  - Lockout response identical to wrong-password response (no enumeration)
  - Locked account: correct password still returns locked error
  - Lockout expires after 15 minutes
  - After lockout expires: login succeeds with correct password
  - Different email not affected by other email's lockout
  - Successful login resets failure counter
  - login_attempts table exists
  - login_attempts tracks per-email failures
  - Rate limit on /api/auth/change-password: max 5 per 24h
  - 6th password change in 24h: returns 429
  - Lockout counter persists across requests (not in-memory only)
```

**Implementation:**
- Create `login_attempts` table: `(email TEXT, attempts INT, first_failure_at TEXT, locked_until TEXT)`
- In login handler: track failures per email, lock after 5 in 15 min
- Locked response: same error body as wrong-password ("Invalid credentials")
- Apply authLimiter to `/api/auth/change-password`
- For testing rate limits: add env var `RATE_LIMIT_SKIP=false` override in test
  or create a test-only endpoint that triggers the limiter

**Security findings addressed:** #6, #7

**Expected test count:** 2,136 → ~2,156 (+20)

---

### v0.7.9 — Password Policy & Strength

**Focus:** Enforce strong passwords, block common passwords (Finding #8)

**Tests to write first (~15 tests):**
```
tests/password-policy.test.js
  - Register with 7-char password: rejected (400)
  - Register with 8-char password: rejected (400, need 12+)
  - Register with 11-char password: rejected (400)
  - Register with 12-char all lowercase: rejected (400, need complexity)
  - Register with 12 chars + uppercase + number: rejected (400, need special)
  - Register with 12 chars + upper + number + special: accepted (201)
  - Register with common password "Password123!": rejected (400, common password)
  - Register with "Qwerty12345!": rejected (400, common password)
  - Change password to weak password: rejected (400)
  - Change password to strong password: accepted (200)
  - Error message explains password requirements
  - Password validation error lists all unmet requirements
  - Password max length: 128 chars (prevent bcrypt DoS with long strings)
  - unicode passwords accepted (international chars)
  - Password requirements documented in API response
```

**Implementation:**
- Create `src/utils/password-policy.js`:
  - Min 12 chars, max 128 chars
  - At least 1 uppercase, 1 lowercase, 1 digit, 1 special char
  - Check against top-1000 common passwords list (embedded array)
  - Return structured error: `{ valid: false, errors: ['...'] }`
- Apply to register + change-password routes
- Bcrypt max input is 72 bytes — truncate silently or reject >72

**Security findings addressed:** #8

**Expected test count:** 2,156 → ~2,171 (+15)

---

### v0.7.10 — 2FA Security Hardening

**Focus:** TOTP 2FA edge cases, backup codes, recovery

**Tests to write first (~18 tests):**
```
tests/2fa-security.test.js
  - Setup 2FA: returns secret + QR URI
  - Verify 2FA: correct TOTP code → success
  - Verify 2FA: incorrect code → 401
  - Verify 2FA: expired code (>30s old) → 401
  - Verify 2FA: code reuse within same window → 401 (replay prevention)
  - Login with 2FA enabled: password only → requires TOTP
  - Login with 2FA: correct TOTP → session created
  - Login with 2FA: wrong TOTP → 401
  - Disable 2FA: requires current password + valid TOTP
  - Disable 2FA: wrong password → 403
  - 2FA brute force: 5 wrong codes → temporary lockout
  - 2FA setup: secret not stored until verified
  - 2FA secret not exposed in any GET endpoint
  - 2FA status endpoint: returns enabled/disabled (not secret)
  - API token auth bypasses 2FA (token is pre-authenticated)
  - Change password with 2FA enabled: requires TOTP
  - 2FA code validation is constant-time (no timing leak)
  - 2FA rate-limited separately from password attempts
```

**Implementation:**
- Add TOTP replay prevention: track last-used window per user
- Add 2FA brute-force lockout (5 failed codes → 15 min lockout)
- Ensure 2FA secret not returned in profile/settings endpoints
- Use constant-time comparison for TOTP codes
- Coordinate with account lockout from v0.7.8

**Security findings addressed:** Related to #7 (lockout applies to 2FA too)

**Expected test count:** 2,171 → ~2,189 (+18)

---

## Phase 3: Input Validation & Injection Prevention (v0.7.11 – v0.7.15)

### v0.7.11 — Systematic IDOR Protection

**Focus:** Verify ownership on EVERY route that accesses user data (Findings #40-42, #48)

**Tests to write first (~35 tests):**
```
tests/idor-comprehensive.test.js
  ## Goal ownership (all routes that accept goal_id)
  - POST /api/goals/:id/tasks with User2's goal_id → 403
  - PUT /api/tasks/:id/move to User2's goal → 403
  - PUT /api/tasks/bulk with goal_id of User2 → 403
  - POST /api/templates/:id/apply to User2's goal → 403
  - POST /api/inbox/:id/triage to User2's goal → 403

  ## Area ownership
  - GET /api/areas/:id with User2's area → 404 or 403
  - PUT /api/areas/:id with User2's area → 403
  - DELETE /api/areas/:id of User2 → 403
  - POST /api/areas/:id/goals on User2's area → 403

  ## Task ownership
  - GET /api/tasks/:id of User2's task → 404 or 403
  - PUT /api/tasks/:id of User2's task → 403
  - DELETE /api/tasks/:id of User2's task → 403
  - POST /api/tasks/:id/comments on User2's task → 403
  - GET /api/tasks/:id/comments on User2's task → 403
  - POST /api/tasks/:id/subtasks on User2's task → 403

  ## Tag ownership
  - PUT /api/tags/:id of User2's tag → 403
  - DELETE /api/tags/:id of User2's tag → 403

  ## List ownership
  - GET /api/lists/:id of User2's list → 404 or 403
  - PUT /api/lists/:id of User2's list → 403
  - DELETE /api/lists/:id of User2's list → 403
  - POST /api/lists/:id/items on User2's list → 403

  ## Habit ownership
  - PUT /api/habits/:id of User2's habit → 403
  - DELETE /api/habits/:id of User2's habit → 403
  - POST /api/habits/:id/log on User2's habit → 403

  ## Filter ownership
  - GET /api/filters/:id of User2's filter → 403
  - PUT /api/filters/:id of User2's filter → 403
  - DELETE /api/filters/:id of User2's filter → 403

  ## Focus session ownership
  - POST /api/focus with User2's task_id → 403
  - GET /api/focus/:id of User2's session → 403

  ## Custom fields
  - PUT /api/custom-fields/:id of User2's field → 403
  - DELETE /api/custom-fields/:id of User2's field → 403

  ## Notes
  - GET /api/notes/:id of User2's note → 403
  - PUT /api/notes/:id of User2's note → 403
  - DELETE /api/notes/:id of User2's note → 403
```

**Implementation:**
- Create `verifyOwnership(db, table, id, userId)` helper in `src/helpers.js`
- Audit EVERY route handler in all 11 route modules
- Add ownership check before any mutation or data return
- Pattern: `const row = db.prepare('SELECT * FROM {table} WHERE id=? AND user_id=?').get(id, userId); if (!row) return res.status(404).json({error:'Not found'});`
- For nested ownership (task → goal → area → user): chain verification

**Security findings addressed:** #40, #41, #42, #48, and all implicit IDOR gaps

**Expected test count:** 2,189 → ~2,224 (+35)

---

### v0.7.12 — XSS Prevention & Output Encoding

**Focus:** Fix all innerHTML escaping gaps, markdown XSS, CSS injection (Findings #76-78, #81)

**Tests to write first (~25 tests):**
```
tests/xss-prevention.test.js
  ## Server-side color validation
  - POST /api/areas with color "#FF0000" → accepted
  - POST /api/areas with color "#FFF" → accepted (3-char hex)
  - POST /api/areas with color "red" → rejected (400)
  - POST /api/areas with color "#FF0000; display:none" → rejected (400)
  - POST /api/areas with color "<script>" → rejected (400)
  - POST /api/goals with invalid color → rejected (400)
  - PUT /api/areas/:id with CSS injection color → rejected (400)
  
  ## Server-side string sanitization
  - Task title with <script> tag stored verbatim (not executed, just stored)
  - Task note with <img onerror=...> stored verbatim
  - Area name with HTML entities stored verbatim
  - Goal description with javascript: URI stored verbatim
  
  ## API response escaping (Backend should NOT escape — that's frontend's job)
  - GET /api/tasks returns raw user input (no server-side HTML encoding)
  - API returns JSON Content-Type (not text/html)

tests/frontend-xss.test.js (static analysis)
  - app.js: every innerHTML template uses esc() for user data
  - app.js: escA() used in all attribute contexts
  - app.js: renderMd() escapes code block content before wrapping
  - app.js: renderMd() rejects javascript: URIs in links
  - app.js: no innerHTML assignment with raw API response data
  - app.js: esc() handles null/undefined gracefully
  - app.js: esc() escapes &, <, >, ", '
  - app.js: color values validated with regex before style injection
  - share.html: user content escaped before display
  - login.html: no innerHTML with user input

tests/csp-headers.test.js
  - Response includes Content-Security-Policy header
  - CSP default-src is 'self'
  - CSP script-src does NOT include 'unsafe-inline' (TARGET — may start as aspirational)
  - CSP style-src includes fonts.googleapis.com
  - CSP img-src includes data: and blob:
  - CSP object-src is 'none'
  - CSP frame-ancestors is 'none'
```

**Implementation:**
- Add server-side color validation: `/^#[0-9A-Fa-f]{3,6}$/` on all color fields in areas, goals, habits, lists, tags
- Fix `renderMd()` in `public/app.js`: escape code block content, reject `javascript:` URIs
- Audit every `innerHTML` assignment for missing `esc()`/`escA()` calls
- Add color validation to Zod schemas

**Security findings addressed:** #76, #77, #78, #81

**Expected test count:** 2,224 → ~2,249 (+25)

---

### v0.7.13 — Input Validation Layer (Zod Everywhere)

**Focus:** Systematic Zod validation on all route inputs (Findings #44, #45, #51, #52)

**Tests to write first (~30 tests):**
```
tests/input-validation-comprehensive.test.js
  ## Task fields
  - Title empty string → 400
  - Title > 500 chars → 400
  - Note > 10000 chars → 400
  - Priority not 0-3 → 400
  - Priority floating point → 400
  - Priority negative → 400
  - Status not todo/doing/done → 400
  - due_date invalid format → 400
  - due_date not a real date (2024-13-01) → 400
  - recurring invalid JSON structure → 400
  - recurring valid structure → accepted
  - time_block_start invalid format → 400
  - time_block_start "14:60" (invalid minutes) → 400
  - time_block_end before time_block_start → 400
  - actual_minutes negative → 400
  - actual_minutes zero → accepted
  - estimated_minutes > 9999 → 400
  - position negative → 400

  ## Focus session fields
  - duration_sec negative → 400
  - duration_sec zero → 400
  - duration_sec > 86400 (24h) → 400
  - rating not integer → 400
  - rating < 1 or > 5 → 400
  - steps_completed > steps_planned → 400

  ## Automation rules
  - trigger_config invalid structure → 400
  - action_config invalid structure → 400
  - trigger type not in whitelist → 400

  ## General
  - NLP parse input > 500 chars → 400
  - Import body > 10MB → 413
  - Request with Content-Type not application/json → 400 (on POST)
  - ID parameter: non-integer → 400
  - ID parameter: negative → 400
  - ID parameter: float → 400
```

**Implementation:**
- Create Zod schemas for ALL route inputs (extend existing `src/schemas/`)
- New schemas: `focus.schema.js`, `rules.schema.js`, `productivity.schema.js`
- Apply `validate()` middleware to every POST/PUT/PATCH route
- Add `express.json({ limit: '1mb' })` default, `{ limit: '10mb' }` for import
- Standardize error response format: `{ error: "Validation error", details: [...] }`

**Security findings addressed:** #44, #45, #51, #52, #116, #126, #127

**Expected test count:** 2,249 → ~2,279 (+30)

---

### v0.7.14 — SQL & Query Safety

**Focus:** Verify parameterized queries everywhere, fix LIKE injection, add query limits

**Tests to write first (~20 tests):**
```
tests/sql-safety.test.js
  ## Parameterized queries (verify existing safety)
  - SQL injection in task title: stored as literal string
  - SQL injection in area name: stored as literal string
  - SQL injection in tag name: stored as literal string
  - SQL injection in search query: no data leak
  - SQL injection in filter query: no data leak
  - SQL injection in list item title: stored as literal string
  - SQL injection in note content: stored as literal string
  - SQL injection in comment text: stored as literal string
  - Union-based injection attempt returns normal response
  - Stacked query attempt (';DROP TABLE) has no effect

  ## Query boundaries
  - GET /api/tasks with 10,000 tasks: response contains all (or paginated)
  - GET /api/focus/insights limited to 365 days
  - GET /api/habits/:id/heatmap bounded to 365 days
  - GET /api/stats/heatmap bounded to 365 days
  - GET /api/stats/activity bounded to reasonable limit
  - List duplication: list with 500+ items → rejected or capped
  - Bulk task update: max 100 IDs per request
  - Bulk my-day: max 100 IDs per request
  - Search results: capped at 100 per page
  - Comments per task: paginated or capped
```

**Implementation:**
- Add `LIMIT` clauses to all unbounded queries
- Focus insights: `WHERE started_at >= date('now', '-365 days')`
- Heatmap: hardcode 365-day window
- Bulk operations: validate `ids.length <= 100`
- List duplication: cap at 500 items per list
- Add pagination to comments, activity log

**Security findings addressed:** #46, #47

**Expected test count:** 2,279 → ~2,299 (+20)

---

### v0.7.15 — Recurrence & Business Logic Safety

**Focus:** Fix month-end recurrence, infinite loop, null due date (Findings #117, #120, #121)

**Tests to write first (~20 tests):**
```
tests/recurrence-safety.test.js
  ## Month-end clamping
  - Jan 31 + monthly → Feb 28 (non-leap year)
  - Jan 31 + monthly → Feb 29 (leap year 2028)
  - Mar 31 + monthly → Apr 30
  - Jan 29 + monthly → Feb 28 (non-leap) then Mar 29
  - Monthly from 31st: never skips a month
  - Bi-monthly from 31st: clamped correctly

  ## Infinite loop protection
  - Specific-days recurrence with all 7 days: terminates
  - Specific-days recurrence with empty days array: doesn't hang
  - Specific-days recurrence with invalid day numbers: rejected
  - nextDueDate calculation completes within 100ms

  ## Null due date guard
  - Recurring task that reaches end date: no new task spawned
  - Recurring task with due_date=null: handled gracefully
  - Complete recurring task: spawns next only if nextDueDate is not null

  ## Field preservation on spawn
  - Recurring spawn copies time_block_start/end
  - Recurring spawn copies estimated_minutes
  - Recurring spawn copies tags
  - Recurring spawn copies subtasks
  - Recurring spawn copies priority
  - Recurring spawn copies assigned_to_user_id

  ## Transaction safety
  - Complete recurring task wraps spawn in transaction
  - If spawn fails: original task completion still succeeds
  - If tag copy fails: rolls back spawn
```

**Implementation:**
- Fix `nextDueDate()` in `src/helpers.js`: clamp to last day of month
- Add max-iteration guard (8) in specific-days loop
- Guard on null nextDueDate: skip spawn
- Copy all relevant fields on recurring spawn: time_block, estimated_minutes, tags, subtasks
- Wrap recurring spawn in `db.transaction()`

**Security findings addressed:** #117, #120, #121, #50, #53

**Expected test count:** 2,299 → ~2,319 (+20)

---

## Phase 4: API Security & Rate Limiting (v0.7.16 – v0.7.20)

### v0.7.16 — CSRF Integration Testing

**Focus:** End-to-end CSRF verification with middleware enabled

**Tests to write first (~20 tests):**
```
tests/csrf-integration.test.js
  ## Middleware enforcement (run with CSRF enabled)
  - POST /api/areas without X-CSRF-Token → 403
  - PUT /api/tasks/:id without X-CSRF-Token → 403
  - DELETE /api/areas/:id without X-CSRF-Token → 403
  - PATCH /api/areas/reorder without X-CSRF-Token → 403
  - POST with invalid X-CSRF-Token → 403
  - POST with mismatched cookie/header token → 403
  - POST with valid X-CSRF-Token + matching cookie → 200

  ## Exempt routes
  - POST /api/auth/login without CSRF → allowed
  - POST /api/auth/register without CSRF → allowed
  - POST /api/auth/logout without CSRF → allowed
  - GET /api/tasks without CSRF → allowed (GET exempt)

  ## Token management
  - GET /api/tasks sets csrf_token cookie
  - csrf_token cookie has HttpOnly=false (client needs to read it)
  - csrf_token cookie has SameSite=Strict
  - csrf_token cookie value is 32+ hex chars
  - Token persists across requests (not regenerated every time)
  - Token regenerated after login

  ## API token auth bypass
  - Bearer token request without CSRF → allowed (API tokens are exempt)
  - API token + CSRF token: both valid → allowed
  - API token auth does not require CSRF header
```

**Implementation:**
- Modify CSRF middleware to support test-mode enabling via env var `CSRF_ENABLED=true`
- Or: create dedicated test that constructs Express app with CSRF enabled
- Add CSRF exemption for Bearer token auth (API tokens don't need CSRF)
- Ensure CSRF token cookie is HTTP-only=false (client-readable for double-submit)

**Security findings addressed:** #4, #80

**Expected test count:** 2,319 → ~2,339 (+20)

---

### v0.7.17 — Error Handler & Information Leakage

**Focus:** Ensure errors never leak stack traces, internal paths, or DB structure

**Tests to write first (~18 tests):**
```
tests/error-handling.test.js
  ## Error handler responses
  - 400 error response has { error: "message" } shape
  - 404 error response has { error: "Not found" } shape
  - 409 constraint violation: response has { error: "..." } (no SQL in body)
  - 500 error: response body has no stack trace
  - 500 error: response body has no file paths
  - 500 error: response body has no SQL query text
  - Error response Content-Type is application/json

  ## Malformed request handling
  - Malformed JSON body → 400 (not 500)
  - Empty body on POST → 400
  - Content-Type: text/plain on POST /api/areas → 400
  - Content-Type: multipart/form-data on API → 400
  - Extremely large JSON field (1MB string) → 413 or 400
  - Deeply nested JSON (100 levels) → 400

  ## 404 handling
  - GET /api/nonexistent → 404 (not SPA fallback)
  - GET /api/tasks/99999 → 404
  - DELETE /api/tasks/99999 → 404
  - PUT /api/tasks/99999 → 404

  ## Health endpoint
  - GET /health does not expose version (or is protected)
  - GET /health does not expose uptime
```

**Implementation:**
- Review error handler in `src/middleware/errors.js`: strip stack traces in production
- Sanitize SQLite error messages before returning to client
- Remove version/uptime from health endpoint (or add auth)
- Add max body depth/size checks
- Ensure all error paths return consistent JSON shape

**Security findings addressed:** #18, partial #152, #153

**Expected test count:** 2,339 → ~2,357 (+18)

---

### v0.7.18 — API Token Security

**Focus:** Harden API token auth, verify token hashing, expiry enforcement

**Tests to write first (~16 tests):**
```
tests/api-token-security.test.js
  - Create API token → returns token value (only time it's shown)
  - Token stored as SHA-256 hash (not plaintext)
  - Bearer token auth: valid token → 200
  - Bearer token auth: invalid token → 401
  - Bearer token auth: expired token → 401
  - Bearer token: last_used_at updated on use
  - Revoke token → subsequent use returns 401
  - Token name is unique per user
  - Token creation rate limited (max 10 per user)
  - Token value not in any GET response (hash only)
  - List tokens: returns name, created_at, last_used_at (not hash or value)
  - API token cannot create other API tokens (prevent escalation)
  - API token cannot change password
  - API token cannot disable 2FA
  - API token permissions: read-only vs read-write (if supported)
  - Token with special chars in name: sanitized
```

**Implementation:**
- Verify token hashing uses SHA-256 (not bcrypt — tokens are high-entropy)
- Ensure token value only returned on creation (201 response)
- Add `last_used_at` update on every authenticated request
- Restrict certain endpoints from API token auth (password change, 2FA management)
- Rate limit token creation per user

**Security findings addressed:** Hardening existing API token system

**Expected test count:** 2,357 → ~2,373 (+16)

---

### v0.7.19 — Webhook & Integration Security

**Focus:** Webhook signature verification, URL validation, timeout enforcement

**Tests to write first (~18 tests):**
```
tests/webhook-security.test.js
  - Create webhook: URL must be https:// (reject http://)
  - Create webhook: reject localhost/127.0.0.1 URLs (SSRF prevention)
  - Create webhook: reject private IP ranges (10.x, 172.16-31.x, 192.168.x)
  - Create webhook: URL validated with URL constructor
  - Webhook secret generated on creation
  - Webhook payload signed with HMAC-SHA256
  - Webhook signature in X-Hub-Signature-256 header
  - Webhook timeout: request aborted after 5s
  - Webhook retry: failed delivery logged (not retried infinitely)
  - Webhook events: only valid event types accepted
  - Webhook events: array validated (no duplicate events)
  - Max webhooks per user: 10
  - Webhook fires on task.created event
  - Webhook fires on task.completed event
  - Webhook does not fire for disabled webhook
  - Webhook payload does not include sensitive data (password_hash, session)
  - IDOR: User2 cannot read/modify/delete User1's webhooks
  - Webhook URL not logged in plaintext (security logging)
```

**Implementation:**
- Add URL validation: reject non-HTTPS, private IPs, localhost
- Implement AbortController with 5s timeout on webhook HTTP requests
- Cap webhooks per user at 10
- Verify HMAC signing is implemented correctly
- Ensure webhook payloads exclude sensitive fields
- Add IDOR checks on webhook CRUD endpoints

**Security findings addressed:** Webhook hardening, SSRF prevention

**Expected test count:** 2,373 → ~2,391 (+18)

---

### v0.7.20 — Database Schema Integrity

**Focus:** Fix schema constraints, add indexes, migration safety (Findings #49, #119, #124, #152-164)

**Tests to write first (~22 tests):**
```
tests/schema-integrity.test.js
  ## Constraints
  - Tags UNIQUE(user_id, name) — duplicate tag name per user rejected
  - Tags: different users can have same tag name
  - List self-reference: parent_id = id → rejected
  - List self-reference: parent_id = null → accepted
  - Task position: concurrent inserts get unique positions

  ## Indexes
  - Index exists: idx_goals_status
  - Index exists: idx_tasks_priority
  - Index exists: idx_task_tags_tag
  - Index exists: idx_task_comments_task
  - Index exists: idx_goal_milestones_goal
  - Index exists: idx_focus_sessions_task
  - Index exists: idx_habit_logs_composite
  - Query performance: tasks by priority < 10ms with 1000 tasks
  - Query performance: focus sessions by task_id < 10ms with 1000 sessions

  ## Migration safety
  - Migration failure rolls back (no partial state)
  - ALTER TABLE error handling: only ignores "column already exists"
  - ALTER TABLE with unknown error: throws
  - Migration runs idempotently (safe to run twice)

  ## Transaction wrapping
  - Reorder: failure mid-update leaves positions unchanged
  - Recurring spawn: failure rolls back
  - Bulk update: failure rolls back all changes
  - Import: failure rolls back to pre-import state
```

**Implementation:**
- Fix tag uniqueness: migrate from `UNIQUE(name)` to `UNIQUE(user_id, name)`
- Add CHECK constraint on lists: `CHECK(parent_id IS NULL OR parent_id != id)`
- Add all missing indexes (10 indexes from findings #155-164)
- Fix migration error handling: whitelist expected errors
- Wrap reorder + recurring spawn in `db.transaction()`

**Security findings addressed:** #49, #119, #124, #150-164

**Expected test count:** 2,391 → ~2,413 (+22)

---

## Phase 5: Integration, Stress Testing & Audit Verification (v0.7.21 – v0.7.25)

### v0.7.21 — Service Worker & Client Security

**Focus:** Fix SW cache poisoning, open redirect, prototype pollution (Findings #79, #82-84, #165-168)

**Tests to write first (~18 tests):**
```
tests/service-worker.test.js (static analysis + unit)
  ## Cache safety
  - sw.js: only caches response.ok === true
  - sw.js: does not cache 500 responses
  - sw.js: does not cache 404 responses
  - sw.js: cache has TTL mechanism

  ## Push notification safety
  - sw.js: notification URL validated against origin
  - sw.js: rejects external URLs in push data
  - sw.js: absolute path URLs allowed (/tasks/123)
  - sw.js: javascript: URIs rejected

  ## Version management
  - sw.js: CACHE_VERSION is not hardcoded 'v1'
  - sw.js: does not call skipWaiting() unconditionally

tests/client-security.test.js (static analysis)
  ## Prototype pollution
  - app.js: settings object is frozen after load (Object.freeze)
  - app.js: settings keys validated against whitelist
  - app.js: __proto__ not in settings whitelist

  ## Memory safety
  - app.js: event listeners use AbortController or manual cleanup
  - store.js: getAll() returns deep copy (structuredClone or JSON)
  - store.js: set() serializes properly

  ## Import safety
  - app.js: file import has size limit check (< 10MB)
  - app.js: import file validated as JSON before upload
```

**Implementation:**
- Fix `public/sw.js`: only cache `response.ok`, add TTL, validate push URLs
- Fix `public/app.js`: freeze settings, validate keys, fix memory leaks
- Fix `public/store.js`: return deep copies, add cleanup
- Remove `skipWaiting()` or add user prompt

**Security findings addressed:** #79, #82, #83, #84, #165, #166, #167, #168

**Expected test count:** 2,413 → ~2,431 (+18)

---

### v0.7.22 — End-to-End Security Workflows

**Focus:** Multi-step security flow testing (login→2FA→access→logout, import→export roundtrip)

**Tests to write first (~20 tests):**
```
tests/security-workflows.test.js
  ## Full auth lifecycle
  - Register → login → access API → logout → access denied
  - Register → setup 2FA → login with TOTP → access API → disable 2FA → login without TOTP
  - Register → login → create API token → use token → revoke → token denied
  - Login → change password → old session dies → re-login with new password

  ## Multi-user isolation workflow
  - User1 creates area+goal+task → User2 cannot see/edit/delete any of them
  - User1 creates tag → User2 create same-named tag → both exist independently
  - User1 deletes account → User2 data unaffected
  - User1 exports data → export contains only User1's data

  ## Data integrity workflow
  - Import full dataset → export → compare → identical (roundtrip)
  - Import with corrupt data → rollback → original data intact
  - Backup → modify data → restore → data matches backup

  ## Concurrent access
  - Two sessions same user: both can read
  - Two sessions same user: write + write → no data corruption
  - Rapid create+delete: no orphaned records

  ## Edge cases
  - Request with both session cookie AND Bearer token: session takes precedence
  - Request with expired session + valid API token: API token works
  - Login from multiple IPs simultaneously: all sessions valid
  - Logout from one device: other devices unaffected
```

**Implementation:**
- These are pure test-only additions — no code changes needed if previous iterations are complete
- May reveal bugs from interaction of multiple security features
- Fix any bugs discovered

**Expected test count:** 2,431 → ~2,451 (+20)

---

### v0.7.23 — Stress Testing & DoS Prevention

**Focus:** Verify system stability under load, resource exhaustion prevention

**Tests to write first (~20 tests):**
```
tests/stress-resilience.test.js
  ## Volume tests
  - Create 1000 tasks in a goal: all operations still < 100ms
  - Create 100 areas with 10 goals each: dashboard loads < 200ms
  - Create 500 tags: tag list endpoint responds < 100ms
  - Create 1000 list items: list loads < 100ms
  - 365 days of habit logs: heatmap renders < 100ms
  - 1000 focus sessions: insights endpoint responds < 200ms

  ## Payload size tests
  - POST task with 500-char title → accepted (at limit)
  - POST task with 501-char title → rejected
  - POST note with 10000-char content → accepted
  - POST note with 10001-char content → rejected
  - POST import with 10MB body → accepted
  - POST import with 11MB body → 413

  ## Rate & concurrency
  - 50 rapid sequential requests: all succeed (within rate limit)
  - Concurrent reorder requests: positions remain consistent
  - Concurrent task creates: unique positions assigned

  ## Resource cleanup
  - Delete area with 100 goals: cascade completes < 500ms
  - Delete goal with 500 tasks: cascade completes < 500ms
  - Expired sessions cleaned up by scheduler
  - Old audit logs cleaned up by scheduler

  ## Memory stability
  - 100 sequential API calls: no memory leak (process.memoryUsage stable)
```

**Implementation:**
- Add content-length checks on all routes
- Add response time assertions on critical endpoints
- Add cascade performance tests
- Verify scheduler cleanup functions work
- This iteration may reveal performance regressions to fix

**Expected test count:** 2,451 → ~2,471 (+20)

---

### v0.7.24 — Security Audit Verification

**Focus:** Systematically verify each finding from the security hackathon is addressed

**Tests to write first (~30 tests):**
```
tests/audit-verification.test.js
  ## CRITICAL findings verification (16)
  - #1 Account enumeration: register existing email → generic response ✓
  - #2 Timing attack login: bcrypt always called ✓
  - #3 Timing attack requirePassword: bcrypt always called ✓
  - #4 CSRF: POST without token → 403 ✓
  - #5 Session fixation: IP/UA binding enforced ✓
  - #40 IDOR move task: other user's goal → 403 ✓
  - #41 IDOR bulk update: other user's goal → 403 ✓
  - #42 IDOR template apply: other user's goal → 403 ✓
  - #76 DOM XSS: innerHTML uses esc() ✓ (static analysis)
  - #77 XSS code blocks: content escaped ✓ (static analysis)
  - #78 Markdown javascript: URI rejected ✓ (static analysis)
  - #79 Open redirect: push URL validated ✓ (static analysis)
  - #80 CSRF on all API calls: X-CSRF-Token sent ✓ (static analysis)
  - #116 NLP input limit: >500 chars → 400 ✓
  - #117 Month-end recurrence: Jan 31 → Feb 28 ✓
  - #118 Habit streak timezone: consistent dates ✓

  ## HIGH findings verification (sample of 32)
  - #6 Rate limit change-password ✓
  - #7 Per-user lockout after 5 failures ✓
  - #8 Password 12+ chars with complexity ✓
  - #9 Password change invalidates all sessions ✓
  - #11 CSP no unsafe-inline (or documented exception) ✓
  - #44 Rules engine: validated JSON config ✓
  - #45 Recurring task: validated config ✓
  - #46 Focus insights: 365-day limit ✓
  - #47 List duplication: capped ✓
  - #48 Inbox triage: goal ownership verified ✓
  - #81 CSS injection: color validated ✓
  - #82 SW cache: only caches response.ok ✓
  - #84 Prototype pollution: settings frozen ✓
  - #119 Position race condition: transaction-wrapped ✓
  - #120 Specific-days infinite loop: max iterations ✓
```

**Implementation:**
- This iteration is primarily test-writing to verify all previous fixes
- Create a definitive checklist mapping each finding # to its test
- Fix any findings that were missed in previous iterations
- Update `docs/SECURITY-IMPLEMENTATION-PLAN.md` with completion status

**Security findings addressed:** Verification of all 48 Critical+High findings

**Expected test count:** 2,471 → ~2,501 (+30)

---

### v0.7.25 — Code Coverage & Final Hardening

**Focus:** Achieve ≥80% coverage, close remaining gaps, finalize security posture

**Tests to write first (~25 tests):**
```
tests/coverage-gaps.test.js (based on c8 report from v0.7.2)
  ## Routes with <60% coverage (fill gaps)
  - Coverage gap tests will be determined by c8 report
  - Expected: productivity.js, data.js, auth.js need most attention
  - Target: every route handler has at least 1 happy path + 1 error path test

tests/security-headers.test.js
  - X-Content-Type-Options: nosniff present
  - X-Frame-Options: DENY present
  - X-Download-Options: noopen present
  - Referrer-Policy: no-referrer present
  - Permissions-Policy: restrictive set
  - Cache-Control: no-store on API responses
  - HSTS: max-age >= 31536000

tests/docker-security.test.js
  - Dockerfile: no root user in final stage
  - Dockerfile: HEALTHCHECK present
  - Dockerfile: .dockerignore excludes .env, *.db, node_modules
  - Dockerfile: uses specific Node version (not :latest)
  - docker-compose.yml: no privileged mode
  - docker-compose.yml: read-only root filesystem (if applicable)
  - docker-compose.yml: resource limits set

tests/dependency-audit.test.js
  - npm audit: 0 critical vulnerabilities
  - npm audit: 0 high vulnerabilities
  - No deprecated packages in dependencies
  - All dependencies have known licenses
```

**Implementation:**
- Run c8 coverage report, identify uncovered branches
- Write tests for any route handler with 0 tests
- Add remaining security headers via helmet configuration
- Harden Docker configuration
- Run `npm audit` and resolve any findings
- Update all documentation (CLAUDE.md, CHANGELOG.md, openapi.yaml)
- Tag v0.7.25 as security-hardened milestone

**Security findings addressed:** Remaining LOW/MEDIUM findings, coverage gaps

**Expected test count:** 2,501 → ~2,526 (+25)

---

## Summary: 25-Iteration Roadmap

| Version | Title | Focus | New Tests | Cumulative |
|---------|-------|-------|-----------|------------|
| v0.7.1 | ESLint & Code Quality | Foundation | +15 | 2,046 |
| v0.7.2 | CI/CD Pipeline | Foundation | +12 | 2,058 |
| v0.7.3 | Test Infrastructure | Foundation | +20 | 2,078 |
| v0.7.4 | Test Reorganization | Foundation | +8 | 2,086 |
| v0.7.5 | Pre-commit Hooks | Foundation | +10 | 2,096 |
| v0.7.6 | Timing Attack Prevention | Auth | +18 | 2,114 |
| v0.7.7 | Session Security | Auth | +22 | 2,136 |
| v0.7.8 | Account Lockout & Rate Limits | Auth | +20 | 2,156 |
| v0.7.9 | Password Policy | Auth | +15 | 2,171 |
| v0.7.10 | 2FA Hardening | Auth | +18 | 2,189 |
| v0.7.11 | IDOR Protection | Input/Injection | +35 | 2,224 |
| v0.7.12 | XSS Prevention | Input/Injection | +25 | 2,249 |
| v0.7.13 | Input Validation (Zod) | Input/Injection | +30 | 2,279 |
| v0.7.14 | SQL & Query Safety | Input/Injection | +20 | 2,299 |
| v0.7.15 | Recurrence Safety | Input/Injection | +20 | 2,319 |
| v0.7.16 | CSRF Integration | API Security | +20 | 2,339 |
| v0.7.17 | Error Handling | API Security | +18 | 2,357 |
| v0.7.18 | API Token Security | API Security | +16 | 2,373 |
| v0.7.19 | Webhook Security | API Security | +18 | 2,391 |
| v0.7.20 | DB Schema Integrity | API Security | +22 | 2,413 |
| v0.7.21 | Service Worker & Client | Integration | +18 | 2,431 |
| v0.7.22 | E2E Security Workflows | Integration | +20 | 2,451 |
| v0.7.23 | Stress Testing | Integration | +20 | 2,471 |
| v0.7.24 | Audit Verification | Integration | +30 | 2,501 |
| v0.7.25 | Coverage & Final Hardening | Integration | +25 | 2,526 |

**Total new tests: ~495**
**Final test count: ~2,526**

---

## Security Finding Coverage Matrix

| Finding # | Severity | Description | Addressed In |
|-----------|----------|-------------|--------------|
| #1 | CRITICAL | Account enumeration | v0.7.6 |
| #2 | CRITICAL | Timing attack login | v0.7.6 |
| #3 | CRITICAL | Timing attack requirePassword | v0.7.6 |
| #4 | CRITICAL | Missing CSRF | v0.7.16 |
| #5 | HIGH | No session IP/UA binding | v0.7.7 |
| #6 | HIGH | No rate limit on change-password | v0.7.8 |
| #7 | HIGH | No per-user lockout | v0.7.8 |
| #8 | HIGH | Weak password policy | v0.7.9 |
| #9 | HIGH | Password change doesn't invalidate sessions | v0.7.7 |
| #10 | HIGH | No email verification | Out of scope (feature) |
| #11 | HIGH | CSP unsafe-inline | v0.7.12, v0.7.25 |
| #12 | MEDIUM | Cookie Secure flag in dev | v0.7.7 |
| #13 | MEDIUM | Default remember-me checked | Backlog |
| #14 | MEDIUM | Failed logins not logged | v0.7.8 |
| #15 | MEDIUM | No password reset | Out of scope (feature) |
| #16 | MEDIUM | No account deletion | Out of scope (feature) |
| #17 | MEDIUM | No HSTS | Already fixed (v0.7.0) |
| #18 | MEDIUM | Health leaks version | v0.7.17 |
| #40 | CRITICAL | IDOR move task | v0.7.11 |
| #41 | CRITICAL | IDOR bulk update | v0.7.11 |
| #42 | CRITICAL | IDOR template apply | v0.7.11 |
| #43 | HIGH | Public shared list writes | v0.7.11 |
| #44 | HIGH | Rules engine unvalidated JSON | v0.7.13 |
| #45 | HIGH | Recurring config unvalidated | v0.7.13 |
| #46 | HIGH | Focus insights unbounded | v0.7.14 |
| #47 | HIGH | List duplication unbounded | v0.7.14 |
| #48 | CRITICAL | Inbox triage IDOR | v0.7.11 |
| #49 | MEDIUM | Tag UNIQUE not user-scoped | v0.7.20 |
| #50 | MEDIUM | Recurring spawn no transaction | v0.7.15 |
| #51 | HIGH | Time block not validated | v0.7.13 |
| #52 | HIGH | Focus rating type not validated | v0.7.13 |
| #53 | MEDIUM | Recurring doesn't copy fields | v0.7.15 |
| #54 | MEDIUM | Import weak confirmation | Already fixed |
| #76 | CRITICAL | DOM XSS innerHTML | v0.7.12 |
| #77 | CRITICAL | XSS code blocks | v0.7.12 |
| #78 | CRITICAL | Markdown javascript: URI | v0.7.12 |
| #79 | CRITICAL | Push notification open redirect | v0.7.21 |
| #80 | CRITICAL | Missing CSRF on API calls | v0.7.16 |
| #81 | HIGH | CSS injection via colors | v0.7.12 |
| #82 | HIGH | SW cache poisoning | v0.7.21 |
| #83 | HIGH | SW stale cache | v0.7.21 |
| #84 | HIGH | Prototype pollution settings | v0.7.21 |
| #85 | HIGH | Import file size DoS | v0.7.13 |
| #86 | HIGH | Memory leak detail panel | v0.7.21 |
| #116 | CRITICAL | NLP unbounded input | v0.7.13 |
| #117 | CRITICAL | Month-end recurrence bug | v0.7.15 |
| #118 | CRITICAL | Habit streak timezone | v0.7.15 |
| #119 | HIGH | Position race condition | v0.7.20 |
| #120 | HIGH | Specific-days infinite loop | v0.7.15 |
| #121 | HIGH | Null due date on spawn | v0.7.15 |
| #122 | HIGH | Habit log not idempotent | v0.7.15 |
| #124 | HIGH | Reorder no transaction | v0.7.20 |
| #152 | HIGH | Settings migration no tx | v0.7.20 |
| #153 | HIGH | ALTER TABLE swallows errors | v0.7.20 |
| #155-164 | MEDIUM | Missing indexes | v0.7.20 |
| #165 | HIGH | Push open redirect (SW) | v0.7.21 |
| #166 | HIGH | Cache stores errors (SW) | v0.7.21 |
| #167 | HIGH | skipWaiting version mismatch | v0.7.21 |
| #168 | MEDIUM | Hardcoded cache version | v0.7.21 |
| #169-171 | LOW | Store.js issues | v0.7.21 |

**Addressed:** ~70 findings across 25 iterations
**Out of scope (new features):** #10, #15, #16 (email verification, password reset, account deletion)
**Backlog (low priority):** #13, #19-39 (minor), #55-75 (minor), #87-115 (minor), #128-149 (minor)

---

## Dependencies & Prerequisites

| Iteration | Depends On | Reason |
|-----------|------------|--------|
| v0.7.2 | v0.7.1 | CI needs lint step to exist |
| v0.7.4 | v0.7.3 | Rename files after infra improvements |
| v0.7.5 | v0.7.1 | Husky runs ESLint |
| v0.7.7 | v0.7.6 | Session security builds on timing fixes |
| v0.7.8 | v0.7.6 | Lockout uses same auth code paths |
| v0.7.10 | v0.7.8 | 2FA lockout uses lockout infra |
| v0.7.16 | v0.7.11 | CSRF tests need IDOR fixed first |
| v0.7.22 | v0.7.6-20 | E2E workflows test all prior fixes |
| v0.7.24 | v0.7.1-23 | Audit verification covers everything |
| v0.7.25 | v0.7.2 | Coverage report requires c8 from CI setup |

Independent iterations (can be done in any order within their phase):
- v0.7.9 (password policy) — independent
- v0.7.12 (XSS) — independent
- v0.7.13 (input validation) — independent
- v0.7.14 (SQL safety) — independent
- v0.7.17 (error handling) — independent
- v0.7.18 (API tokens) — independent
- v0.7.19 (webhooks) — independent
- v0.7.23 (stress testing) — independent

---

## New Dependencies Required

| Package | Purpose | Iteration |
|---------|---------|-----------|
| `eslint` | Static analysis | v0.7.1 |
| `c8` | Code coverage | v0.7.2 |
| `husky` | Pre-commit hooks | v0.7.5 |
| `lint-staged` | Staged file linting | v0.7.5 |

**No new runtime dependencies.** All security improvements use existing stack
(Node.js built-ins, better-sqlite3, Express middleware, bcryptjs).

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Session IP binding breaks mobile users | Medium | Medium | Log-only mode for 1 iteration, then enforce |
| CSRF breaks existing API integrations | High | Low | Exempt Bearer token auth |
| Password policy locks out existing users | Medium | High | Enforce only on next password change, not retroactive |
| Test rename breaks CI | Low | Medium | Single commit with all renames + CI update |
| Rate limit testing requires env override | Low | High | Add RATE_LIMIT_SKIP env var for test control |
| CSP unsafe-inline removal breaks app | High | High | Phase in: add nonces first, then remove unsafe-inline |
| Coverage tool slows CI | Low | Medium | Run coverage only on main branch, not PRs |

---

## Review Checkpoint

Before implementation begins, confirm:

1. [ ] Are the 25 iterations correctly prioritized for this project?
2. [ ] Are there any security findings not covered that should be?
3. [ ] Is the test count trajectory realistic (~20 tests per iteration average)?
4. [ ] Should email verification (#10), password reset (#15), and account deletion (#16) be included despite being "features"?
5. [ ] Is the CSP `unsafe-inline` removal (v0.7.12) feasible given the vanilla JS SPA architecture?
6. [ ] Are the new devDependencies (eslint, c8, husky, lint-staged) acceptable?
7. [ ] Should Docker security (v0.7.25) be its own iteration or part of final hardening?

---

*Generated by expert panel brainstorm — 30 March 2026*
*LifeFlow v0.7.0 → v0.7.25 Security Hardening Plan*
