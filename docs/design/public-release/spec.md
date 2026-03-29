# Public Release Readiness — Design Specification

> **Created:** 30 March 2026 · **Status:** Draft · **Version:** v1.0.0 target

## Problem Statement

LifeFlow v0.6.1 is a mature personal task planner with 2,048 tests, 190 API routes, and a comprehensive feature set. However, it was built for personal/local use. A public release audit (30 March 2026) identified **5 blocking**, **31 important**, and **23 nice-to-have** issues across 12 categories. This spec defines all work required to reach v1.0.0 public release quality.

## Scope

Three phases, prioritized by release-blocking severity:

- **Phase 1:** Blocking issues (must fix before any public release)
- **Phase 2:** Important issues (should fix for quality release)
- **Phase 3:** Nice-to-have (polish, can ship without)

## Non-Goals

- PostgreSQL migration (SQLite is fine for single-instance)
- Mobile app (PWA is sufficient)
- Multi-instance horizontal scaling
- Full TypeScript migration

---

## Phase 1: Blocking (v0.7.0)

### 1.1 Process Error Handlers

**Problem:** No `process.on('uncaughtException')` or `process.on('unhandledRejection')` handlers. Server crashes silently on unhandled async errors.

**File:** `src/server.js`

**Requirements:**
- Add `uncaughtException` handler that logs error and exits with code 1
- Add `unhandledRejection` handler that logs error and exits with code 1
- Place handlers before `app.listen()` so they're active during startup
- Use existing `logger` for structured output
- Add test verifying handlers exist (unit test the registration)

### 1.2 Environment Variable Documentation

**Problem:** `.env.example` is missing critical production variables: `ALLOWED_ORIGINS`, `TRUST_PROXY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

**File:** `.env.example`

**Requirements:**
- Add `ALLOWED_ORIGINS=` with comment explaining comma-separated origins for CORS
- Add `TRUST_PROXY=` with comment explaining when to enable (reverse proxy)
- Add `VAPID_PUBLIC_KEY=` and `VAPID_PRIVATE_KEY=` for Web Push
- Add `BASE_URL=` for canonical URL generation
- Group variables by category with section headers

### 1.3 SECURITY.md

**Problem:** No vulnerability disclosure process for open source project.

**File:** `SECURITY.md` (new)

**Requirements:**
- Supported versions table
- Vulnerability reporting instructions (email-based private disclosure)
- Response timeline expectations (48h acknowledgment, 7-day assessment)
- Security update policy
- Credit/acknowledgment policy for reporters

### 1.4 Response Compression

**Problem:** No gzip/brotli compression. API responses and static assets are uncompressed.

**Files:** `src/server.js`, `package.json`

**Requirements:**
- Install `compression` npm package
- Add `app.use(compression())` before static file serving
- Verify it compresses JSON API responses and static assets
- Add test verifying `Content-Encoding: gzip` header on large responses

### 1.5 CORS Documentation

**Problem:** CORS configuration not documented in deployment guide.

**File:** `docs/deployment.md`

**Requirements:**
- Add CORS configuration section
- Document `ALLOWED_ORIGINS` env var with examples
- Explain same-origin default behavior
- Warn about security implications of wildcard origins

---

## Phase 2: Important (v0.8.0)

### 2.1 ESLint Configuration

**Problem:** No linter configured. Code quality not enforced in CI.

**Files:** `.eslintrc.js` (new), `package.json`, `.github/workflows/ci.yml`

**Requirements:**
- ESLint with rules: `prefer-const`, `no-unused-vars`, `no-var`, `eqeqeq`, `no-shadow`
- Add `npm run lint` script
- Add lint step to CI pipeline
- Fix any existing violations

### 2.2 Accessibility Fixes

**Problem:** Multiple WCAG AA violations identified.

**Files:** `public/index.html`, `public/app.js`, `public/styles.css`

**Requirements:**
- Add `aria-live="polite"` to form error containers (area modal, goal modal, list modal)
- Implement focus trap in task detail modal (tab cycles within modal)
- Add `sr-only` text to icon-only buttons (close, delete, edit)
- Add text/icon indicators alongside color for task status
- Add "Skip to main content" link
- Ensure all mobile touch targets ≥ 48×48px

### 2.3 Zod Validation Migration

**Problem:** Only ~30% of routes use Zod schemas. Rest use ad-hoc validation.

**Files:** `src/schemas/*.js` (new schemas), `src/routes/*.js`

**Requirements:**
- Create Zod schemas for all POST/PUT/PATCH endpoints in:
  - `tasks.js` (create, update, batch)
  - `features.js` (habits, templates, automations, settings)
  - `lists.js` (create list, create item, update)
  - `productivity.js` (focus, inbox, notes, reviews)
  - `data.js` (import)
- Wire schemas through existing `validate.js` middleware
- Maintain backward compatibility (no breaking API changes)

### 2.4 API Quickstart Documentation

**Problem:** No curl-based quickstart for API consumers.

**File:** `docs/api/quickstart.md` (new)

**Requirements:**
- Register user
- Login and get session cookie
- Create life area → goal → task → subtask
- Update task status
- Delete task
- List tasks with filters
- All examples use curl with copy-paste commands

### 2.5 Privacy Policy

**Problem:** No privacy statement for an open source project.

**File:** `docs/PRIVACY.md` (new) + link from README

**Requirements:**
- State: no telemetry, no analytics, no third-party data sharing
- Data stored locally (or on user's own server)
- User owns all data, can export/delete at any time
- No cookies used for tracking (session cookies only)

### 2.6 Request Timeout

**Problem:** Long-running queries can hang indefinitely.

**File:** `src/server.js`

**Requirements:**
- Add server-level request timeout (30 seconds default)
- Configurable via `REQUEST_TIMEOUT_MS` env var
- Return 408 on timeout
- Add to `.env.example`

### 2.7 Import Payload Limit

**Problem:** `/api/import` accepts 10MB payloads, too generous.

**File:** `src/routes/data.js`

**Requirements:**
- Reduce import endpoint body limit to 5MB
- Return 413 with clear error message on oversized payloads
- Document limit in API docs

---

## Phase 3: Nice-to-Have (v1.0.0)

### 3.1 app.js Modularization

**Problem:** `public/app.js` is 5,369 lines — hard to maintain and navigate.

**Files:** `public/app.js`, `public/js/` directory

**Requirements:**
- Extract `js/utils.js` (esc, fmtDue, renderMd, debounce)
- Extract `js/api.js` (API client with CSRF handling)
- Extract view functions to `js/views/` (today.js, board.js, calendar.js, etc.)
- Keep `app.js` as orchestrator/state manager
- Use ES module dynamic imports — no bundler required
- Maintain all existing functionality (no regressions)

### 3.2 Code of Conduct

**File:** `CODE_OF_CONDUCT.md` (new)

**Requirements:**
- Adopt Contributor Covenant v2.1
- Link from CONTRIBUTING.md and README.md

### 3.3 Asset Minification

**Problem:** CSS and JS served unminified.

**Requirements:**
- Add optional build step: `npm run build` that minifies `styles.css` and `app.js`
- Use esbuild or terser (fast, zero-config)
- Serve minified in production, source in development
- Keep no-build-step workflow as default (development mode)

### 3.4 Load Testing

**Requirements:**
- Add K6 or Artillery load test script
- Test scenarios: 100 concurrent users, create/read/update/delete cycle
- Document baseline performance numbers
- Add to `scripts/` directory

---

## Success Criteria

| Metric | Current | v1.0.0 Target |
|--------|---------|---------------|
| Tests passing | 2,048 | 2,200+ |
| Blocking issues | 5 | 0 |
| Important issues | 31 | ≤5 |
| ESLint violations | Unknown | 0 |
| WCAG AA compliance | Partial | Core flows pass |
| OpenAPI coverage | ~80% | 100% |

## File References

- `src/server.js` — Error handlers, compression, timeouts
- `src/middleware/csrf.js` — CSRF middleware
- `src/routes/*.js` — All route modules (Zod migration)
- `src/schemas/*.js` — Existing Zod schemas
- `public/index.html` — Accessibility fixes
- `public/app.js` — Accessibility + modularization
- `public/styles.css` — Touch targets, print styles
- `.env.example` — Environment documentation
- `docs/deployment.md` — CORS documentation
- `.github/workflows/ci.yml` — CI pipeline
- `package.json` — Dependencies, scripts
