# Public Release Readiness — Implementation Plan

> **Source:** [spec.md](spec.md) (12-category audit, 59 findings)
> **Baseline:** v0.6.1 | 2,048 tests | 86 test files | 190 routes | 34 tables | ~15,000 LOC
> **Date:** 30 March 2026
> **TDD Protocol:** Strict Red→Green→Refactor. Every backend task starts with failing tests.

---

## Scope

This plan covers **Phase 1 only** (blocking items). Phases 2–3 will be planned separately after Phase 1 ships as v0.7.0.

**Phase 1 deliverables:**
1. Process error handlers (uncaughtException, unhandledRejection)
2. Response compression (gzip)
3. `.env.example` updates (missing production variables)
4. `SECURITY.md` (vulnerability disclosure policy)
5. CORS documentation in deployment guide

**Estimated tasks:** 5 implementation + 1 verification
**Estimated new tests:** ~15

---

## TDD Protocol

Every task follows strict TDD:

1. **RED:** Write failing tests FIRST.
2. **GREEN:** Write minimum code to make tests pass.
3. **REFACTOR:** Clean up only if needed.
4. **Verify:** Run `npm test` after each task. Zero failures.

Minimum **4 tests per backend task**, **0 tests for docs-only tasks**.

---

## Task 1: Process Error Handlers

**Type:** Backend
**Files:** `src/server.js`, `tests/process-errors.test.js` (new)
**Priority:** BLOCKING — server crashes silently on unhandled async errors

### Context

`src/server.js` lines 217–237 have SIGTERM/SIGINT handlers but no `uncaughtException` or `unhandledRejection` handlers. An unhandled promise rejection or thrown error in a setTimeout callback crashes the process without logging.

### Tests (RED)

Create `tests/process-errors.test.js`:

1. **`uncaughtException` handler is registered** — verify process has listener
2. **`unhandledRejection` handler is registered** — verify process has listener
3. **Handlers log errors** — mock logger, trigger handler, verify `logger.error` called
4. **Handlers exit process** — verify `process.exit(1)` is called (mock it)

### Implementation (GREEN)

In `src/server.js`, inside the `if (require.main === module)` block, before `app.listen()`:

```javascript
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — forcing shutdown');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection — forcing shutdown');
  process.exit(1);
});
```

### Verification

- `npm test` — all existing tests still pass
- `node --test tests/process-errors.test.js` — new tests pass
- Manual: start server, trigger unhandled rejection in a route, verify logged + exit

---

## Task 2: Response Compression

**Type:** Backend + dependency
**Files:** `package.json`, `src/server.js`, `tests/compression.test.js` (new)
**Priority:** BLOCKING — uncompressed API responses waste bandwidth

### Context

Express does not compress responses by default. The `compression` npm package is not installed. Static assets (styles.css ~30KB, app.js ~160KB) and JSON API responses are sent uncompressed.

### Tests (RED)

Create `tests/compression.test.js`:

1. **GET /health returns compressed response** — send `Accept-Encoding: gzip`, verify `Content-Encoding` header present
2. **GET /api/tasks returns compressed JSON** — create tasks, verify response is gzip-encoded
3. **Static assets compressed** — GET /styles.css with Accept-Encoding: gzip, verify compressed
4. **Small responses not compressed** — verify <1KB responses are not compressed (threshold)

### Implementation (GREEN)

1. `npm install compression`
2. In `src/server.js`, after `app.use(express.json(...))` and before `app.use(express.static(...))`:

```javascript
const compression = require('compression');
app.use(compression());
```

### Verification

- `npm test` — all tests pass
- New compression tests pass
- Check response size: `node -e` fetch /styles.css with/without Accept-Encoding

---

## Task 3: .env.example Updates

**Type:** Documentation
**Files:** `.env.example`
**Priority:** BLOCKING — missing production configuration leads to insecure deployments

### Context

Current `.env.example` has 19 variables but is missing:
- `ALLOWED_ORIGINS` — CORS configuration
- `TRUST_PROXY` — reverse proxy detection
- `BASE_URL` — canonical URL for links/emails

VAPID keys are already documented.

### Implementation

Add to `.env.example` after the existing content, organized by section:

```env
# ─── Reverse Proxy ───
# Set to "true" or "1" when running behind Nginx, Caddy, ALB, Cloudflare, etc.
# Required for correct client IP detection, Secure cookies, and HSTS.
# TRUST_PROXY=true

# ─── CORS ───
# Comma-separated list of allowed origins for cross-origin requests.
# Leave empty for same-origin only (default, most secure).
# ALLOWED_ORIGINS=https://app.example.com,https://other.example.com

# ─── Base URL ───
# Canonical URL for the application (used in emails, shared links).
# BASE_URL=https://lifeflow.example.com
```

### Tests

No tests needed (documentation only). Verify file parses correctly:
- `node -e "require('dotenv').config({path:'.env.example'}); console.log('OK')"`

---

## Task 4: SECURITY.md

**Type:** Documentation
**Files:** `SECURITY.md` (new)
**Priority:** BLOCKING — open source projects need vulnerability disclosure process

### Implementation

Create `SECURITY.md` with:

1. **Supported Versions** — table showing which versions receive security updates
2. **Reporting a Vulnerability** — email-based private disclosure instructions
3. **Response Timeline** — 48h acknowledgment, 7-day assessment, 30-day fix target
4. **Disclosure Policy** — coordinated disclosure after fix is released
5. **Security Update Process** — how patches are released
6. **Scope** — what's in scope (the application), what's out (dependencies, hosting)
7. **Credit** — reporters credited in CHANGELOG unless they prefer anonymity

### Tests

No tests needed (documentation only).

---

## Task 5: CORS Documentation

**Type:** Documentation
**Files:** `docs/deployment.md`
**Priority:** BLOCKING — CORS misconfiguration is a common deployment mistake

### Context

`docs/deployment.md` line 105 briefly mentions `ALLOWED_ORIGINS` in an env var table but doesn't explain what it does or the security implications.

### Implementation

Add a new section after the existing "Environment Variables" section in `docs/deployment.md`:

```markdown
## CORS Configuration

By default, LifeFlow only accepts requests from the same origin...
```

Content should cover:
1. Default behavior (same-origin only, most secure)
2. When to configure CORS (separate frontend, mobile app, API consumers)
3. How to set `ALLOWED_ORIGINS` with examples
4. Security warning: never use `*` with credentials
5. Interaction with `TRUST_PROXY` (both needed behind reverse proxy)

### Tests

No tests needed (documentation only).

---

## Task 6: Final Verification

**Type:** Verification gate
**Dependencies:** Tasks 1–5 complete

### Checklist

- [ ] `npm test` — all tests pass (target: 2,060+)
- [ ] No lint errors in changed files
- [ ] `.env.example` parses without errors
- [ ] `SECURITY.md` exists and is well-formatted
- [ ] `docs/deployment.md` has CORS section
- [ ] `compression` in package.json dependencies
- [ ] Docker rebuild works: `docker compose down && docker compose up -d --build`
- [ ] Health check passes: `GET /health` returns `{"status":"ok"}`
- [ ] Version bump to 0.7.0 in `package.json`
- [ ] `CHANGELOG.md` updated with v0.7.0 entry
- [ ] `CLAUDE.md` metrics updated if test count changed significantly
- [ ] Git commit and tag: `v0.7.0`

---

## Execution Order

```
Task 1 (process error handlers)  ─┐
Task 2 (compression)             ─┤── Can run in parallel
Task 3 (.env.example)            ─┤
Task 4 (SECURITY.md)             ─┤
Task 5 (CORS docs)               ─┘
                                  │
                                  ▼
                    Task 6 (Final Verification)
```

Tasks 1–5 are independent and can be implemented in any order. Task 6 runs after all are complete.

---

## Post-Plan: Phase 2 Preview

After v0.7.0 ships, Phase 2 (important items) will be planned:
- ESLint configuration + CI integration
- Accessibility fixes (ARIA, focus traps, screen reader)
- Zod validation migration for remaining routes
- API quickstart documentation
- Privacy policy
- Request timeout middleware
- Import payload limit reduction
