# Production Restructure — Implementation Plan

> **Source spec:** [production-restructure-spec.md](production-restructure-spec.md)  
> **Created:** 27 March 2026  
> **Status:** Ready for implementation  
> **Target:** v1.0.0

---

## Dependency Map

```
Phase 1 (Foundation) ──→ Phase 2 (Backend Architecture)
                    ╲
                     ╲──→ Phase 3 (Frontend Modularization)  ← independent of Phase 2
                    
Phase 2 + Phase 3  ──→ Phase 4 (Production Hardening)
```

**Critical path:** Phase 1 blocks everything. Phases 2 and 3 are parallelizable. Phase 4 depends on Phase 2 (migration runner needs final DB layer) and Phase 1 (config/logger).

---

## Pre-Flight Checklist

- [ ] **[S] Verify baseline** — Run `npm test`, confirm all 1,692 tests pass. Record exact count.
- [ ] **[S] Tag the codebase** — `git tag pre-restructure` so there's a clean rollback point.
- [ ] **[S] Create a branch** — `git checkout -b restructure/phase-1`

---

## Phase 1 — Foundation

**Goal:** Centralized config, ESM modules, structured logging, standardized error responses.  
**Branch:** `restructure/phase-1`

### 1.1 Config Management

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 1.1.1 | Install `dotenv` | S | `npm ls dotenv` shows installed |
| 1.1.2 | Create `src/config.js` | S | Exports frozen config object with all env vars |
| 1.1.3 | Create `.env.example` | S | Documents every variable with defaults |
| 1.1.4 | Replace `process.env` reads in `src/server.js` | S | `grep 'process.env' src/server.js` returns 0 |
| 1.1.5 | Replace `process.env` in `src/middleware/csrf.js` | S | Uses `config.isProd` instead of `process.env.NODE_ENV` |

**Files touched:**
- NEW: `src/config.js`, `.env.example`
- MOD: `package.json`, `src/server.js`, `src/middleware/csrf.js`

**Details for `src/config.js`:**
- `port`, `dbDir`, `nodeEnv`, `isTest`, `isProd`
- `session.maxAgeDays`, `session.rememberMeDays`
- `rateLimit.windowMs`, `rateLimit.max`
- `backup.retainCount`, `backup.intervalHours`
- `log.level` (silent in test, info otherwise)
- `version` (from `package.json`)

**Dependency:** None — can start immediately.

- [ ] 1.1.1 Install `dotenv` dependency
- [ ] 1.1.2 Create `src/config.js` with `Object.freeze()` config
- [ ] 1.1.3 Create `.env.example` with documented defaults
- [ ] 1.1.4 Replace 3 `process.env` reads in `src/server.js` → `config.*`
- [ ] 1.1.5 Replace `process.env.NODE_ENV` in `src/middleware/csrf.js` → `config.isProd`

**Verify:** `grep -r 'process\.env' src/ | grep -v config.js` returns 0 results. All tests pass.

---

### 1.2 ESM Migration

**This is the highest-risk task in the entire restructure. All files change. Do it atomically.**

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 1.2.1 | Change `package.json` `"type"` to `"module"` | S | Field reads `"module"` |
| 1.2.2 | Convert `src/config.js` to ESM (already ESM if freshly written) | S | Uses `export const config` |
| 1.2.3 | Convert `src/helpers.js` | S | `module.exports` → `export default` |
| 1.2.4 | Convert `src/db/index.js` | M | `require` → `import`, `__dirname` → `import.meta.url` |
| 1.2.5 | Convert `src/middleware/auth.js` | S | ESM exports |
| 1.2.6 | Convert `src/middleware/csrf.js` | S | ESM exports |
| 1.2.7 | Convert `src/middleware/errors.js` | S | ESM exports |
| 1.2.8 | Convert `src/middleware/validate.js` | S | ESM exports |
| 1.2.9 | Convert `src/services/audit.js` | S | ESM exports |
| 1.2.10 | Convert `src/routes/tags.js` | S | `require` → `import`, `module.exports` → `export default` |
| 1.2.11 | Convert `src/routes/filters.js` | S | Same pattern |
| 1.2.12 | Convert `src/routes/areas.js` | S | Same pattern |
| 1.2.13 | Convert `src/routes/auth.js` | S | Same pattern |
| 1.2.14 | Convert `src/routes/data.js` | S | Same pattern |
| 1.2.15 | Convert `src/routes/productivity.js` | S | Same pattern |
| 1.2.16 | Convert `src/routes/lists.js` | S | Same pattern |
| 1.2.17 | Convert `src/routes/stats.js` | S | Same pattern |
| 1.2.18 | Convert `src/routes/features.js` | S | Same pattern |
| 1.2.19 | Convert `src/routes/tasks.js` | S | Same pattern |
| 1.2.20 | Convert `src/server.js` | M | All `require()` → `import`, `__dirname` → `import.meta.url`, `require('../package.json')` → JSON import or `fs.readFileSync` |
| 1.2.21 | Convert `tests/helpers.js` | M | `require('../src/server')` → dynamic `import()`, or rename to `.cjs` |
| 1.2.22 | Verify all test files work with ESM | M | All tests pass with `node --test` |

**Files touched:**
- MOD: `package.json`, every `.js` file in `src/`, `tests/helpers.js`

**Migration order (dependency-driven):**
1. `package.json` — set `"type": "module"`
2. Leaf modules first (no internal imports): `src/middleware/validate.js`, `src/middleware/errors.js`
3. Utility modules: `src/helpers.js`, `src/middleware/csrf.js`
4. DB layer: `src/db/index.js` (uses `__dirname`, needs `import.meta.url`)
5. Auth middleware: `src/middleware/auth.js`
6. Services: `src/services/audit.js`
7. Routes (any order — all import from middleware/helpers): all 10 route files
8. Entry point: `src/server.js` (imports everything)
9. Test helper: `tests/helpers.js` (imports `src/server.js`)

**Key `__dirname` replacements:**
- `src/server.js`: `path.join(__dirname, '..')` → `fileURLToPath(new URL('..', import.meta.url))`
- `src/db/index.js`: similar pattern for DB path resolution

**Key `require()` edge cases:**
- `require('../package.json')` in `src/server.js` → `JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))` or use `import` assertion
- `require('bcryptjs')` in `src/server.js` (used inline for `requirePassword`) → top-level `import`
- `require('./routes/auth')(deps)` dynamic call pattern → `import createAuthRoutes from './routes/auth.js'; app.use(createAuthRoutes(deps))`

**Rollback strategy:** If ESM breaks the test runner irrecoverably:
1. Keep `"type": "commonjs"` in `package.json`
2. Rename all `src/` files to `.mjs` extension
3. Keep test files as `.js` (CommonJS)
4. Update test helper `require()` to use `await import()`

- [ ] 1.2.1 Set `"type": "module"` in `package.json`
- [ ] 1.2.2 Convert `src/config.js` (should already be ESM)
- [ ] 1.2.3 Convert `src/middleware/validate.js`
- [ ] 1.2.4 Convert `src/middleware/errors.js`
- [ ] 1.2.5 Convert `src/helpers.js`
- [ ] 1.2.6 Convert `src/middleware/csrf.js`
- [ ] 1.2.7 Convert `src/db/index.js` — handle `__dirname` → `import.meta.url`
- [ ] 1.2.8 Convert `src/middleware/auth.js`
- [ ] 1.2.9 Convert `src/services/audit.js`
- [ ] 1.2.10–1.2.19 Convert all 10 route files (`tags` → `filters` → `areas` → `auth` → `data` → `productivity` → `lists` → `stats` → `features` → `tasks`)
- [ ] 1.2.20 Convert `src/server.js` — handle `require('../package.json')`, `__dirname`, dynamic route requires
- [ ] 1.2.21 Convert `tests/helpers.js` — `require('../src/server')` → `await import()`
- [ ] 1.2.22 Run full test suite, fix any ESM-related failures

**Verify:** `grep -r 'require(' src/` returns 0 results. `grep -r 'module.exports' src/` returns 0 results. All tests pass.

---

### 1.3 Structured Logging

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 1.3.1 | Install `pino` + `pino-pretty` (dev) | S | `npm ls pino` shows installed |
| 1.3.2 | Create `src/logger.js` | S | Exports pino instance, level from `config.log.level` |
| 1.3.3 | Replace `console.error` in `src/middleware/errors.js` | S | Uses `logger.error({ err, method, url }, ...)` |
| 1.3.4 | Replace `console.error` in `src/services/audit.js` (2 calls) | S | Uses `logger.warn(...)` |
| 1.3.5 | Replace `console.log` in `src/server.js` | S | Uses `logger.info({ port }, 'LifeFlow started')` |
| 1.3.6 | Replace `console.error` in `src/routes/data.js` (3 calls) | S | Uses `logger.error(...)` |

**Files touched:**
- NEW: `src/logger.js`
- MOD: `package.json`, `src/middleware/errors.js`, `src/services/audit.js`, `src/server.js`, `src/routes/data.js`

**Dependency:** Requires 1.1 (config) and 1.2 (ESM) to be complete.

- [ ] 1.3.1 Install `pino` (production) + `pino-pretty` (dev dependency)
- [ ] 1.3.2 Create `src/logger.js` — pino instance with `config.log.level`, pretty-print in dev
- [ ] 1.3.3 Replace `console.error` in `src/middleware/errors.js` (1 call)
- [ ] 1.3.4 Replace `console.error` in `src/services/audit.js` (2 calls)
- [ ] 1.3.5 Replace `console.log` in `src/server.js` (1 call)
- [ ] 1.3.6 Replace `console.error` in `src/routes/data.js` (3 calls)

**Verify:** `grep -r 'console\.\(log\|error\|warn\)' src/` returns 0 results. All tests pass (pino is silent in test env).

---

### 1.4 Standardized Error Responses

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 1.4.1 | Create `src/errors.js` | S | Exports `AppError`, `NotFoundError`, `ValidationError`, `ForbiddenError`, `ConflictError` |
| 1.4.2 | Rewrite `src/middleware/errors.js` | M | Handles `AppError` subclasses, returns `{ error: { code, message, details? } }` format |
| 1.4.3 | Update frontend `api` error handling in `public/app.js` | S | Reads `body.error.message` (or `body.error` for backward compat string) |
| 1.4.4 | Update test assertions that check error response format | M | Tests expecting `{ error: "string" }` updated to `{ error: { code, message } }` or made flexible |

**Files touched:**
- NEW: `src/errors.js`
- MOD: `src/middleware/errors.js`, `public/app.js`
- MOD: Multiple test files (error format assertions)

**Risk:** Changing error response format may break many test assertions.  
**Mitigation:** Support both formats during transition. The error handler can detect `AppError` instances and return structured format, while keeping raw string format for un-wrapped errors. Or: update tests in batch using find/replace for `{ error: 'string' }` → structured format.

**Recommended approach:** Make the error handler backward-compatible:
```js
// If err is AppError → structured { error: { code, message } }
// If err is plain Error → legacy { error: "message" } 
```
This lets us migrate routes to throw `AppError` gradually in Phase 2 without breaking anything now.

- [ ] 1.4.1 Create `src/errors.js` with `AppError`, `NotFoundError`, `ValidationError`, `ForbiddenError`, `ConflictError`
- [ ] 1.4.2 Rewrite `src/middleware/errors.js` — handle both `AppError` (structured) and plain errors (legacy format)
- [ ] 1.4.3 Update frontend `api` helper in `public/app.js` to handle both error formats
- [ ] 1.4.4 Verify existing tests still pass (no assertion changes needed if backward compat maintained)

**Verify:** All tests pass. `curl` to a 404 route returns `{ error: { code: "NOT_FOUND", message: "..." } }`. Frontend displays error messages correctly.

---

### Phase 1 Final Verification

- [ ] `grep -r 'process\.env' src/ | grep -v config.js` → 0 results
- [ ] `grep -r 'console\.\(log\|error\|warn\)' src/` → 0 results
- [ ] `grep -r 'require(' src/` → 0 results
- [ ] `grep -r 'module\.exports' src/` → 0 results
- [ ] `.env.example` lists all config variables
- [ ] `npm start` works with no `.env` file
- [ ] All 1,692 tests pass
- [ ] Commit, PR, merge to main
- [ ] Tag `v0.4.0-foundation`

---

## Phase 2 — Backend Architecture

**Goal:** Repository layer, service layer, zod validation, API versioning, thin route handlers.  
**Branch:** `restructure/phase-2`  
**Depends on:** Phase 1 complete (ESM, config, logger, error classes).

### 2.1 Zod Setup + Validation Middleware

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 2.1.1 | Install `zod` | S | `npm ls zod` shows installed |
| 2.1.2 | Create `src/schemas/common.schema.js` | S | Exports `positiveInt`, `hexColor`, `isoDate`, `hhmm`, `paginationQuery` |
| 2.1.3 | Rewrite `src/middleware/validate.js` | M | Exports `validate(schema, source)` function using zod; preserves existing named exports for transitional use |

**Files touched:**
- NEW: `src/schemas/common.schema.js`
- MOD: `package.json`, `src/middleware/validate.js`

**Dependency:** None within Phase 2 — do first.

- [ ] 2.1.1 Install `zod`
- [ ] 2.1.2 Create `src/schemas/common.schema.js` with shared validators
- [ ] 2.1.3 Rewrite `src/middleware/validate.js` — zod-based `validate()` function

---

### 2.2 Base Repository

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 2.2.1 | Create `src/repositories/base.repository.js` | S | Exports `getNextPosition(db, table, scopeCol, scopeVal)` and shared helpers extracted from `src/helpers.js` |

**Files touched:**
- NEW: `src/repositories/base.repository.js`

- [ ] 2.2.1 Create `src/repositories/base.repository.js` with `getNextPosition` and shared DB utilities

---

### 2.3 Route-by-Route Conversion

**This is the bulk of Phase 2. Each route converts in 5 steps: schema → repository → service → route refactor → test verification.**

**Order (simplest → most complex, per spec):**

#### 2.3.1 — `tags` (125 lines, 11 routes)

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 2.3.1a | Create `src/schemas/tags.schema.js` | S | Validates name (string, 1-100), color (hex) |
| 2.3.1b | Create `src/repositories/tags.repository.js` | S | All tag SQL extracted from `src/routes/tags.js` |
| 2.3.1c | Create `src/services/tags.service.js` | S | Business logic (create, update, delete, stats) |
| 2.3.1d | Refactor `src/routes/tags.js` | M | Thin controller, uses service + validate middleware |
| 2.3.1e | Run tag tests | S | All tag-related tests pass |

- [ ] 2.3.1a Schema: `src/schemas/tags.schema.js`
- [ ] 2.3.1b Repository: `src/repositories/tags.repository.js`
- [ ] 2.3.1c Service: `src/services/tags.service.js`
- [ ] 2.3.1d Refactor: `src/routes/tags.js` → thin controller
- [ ] 2.3.1e Verify: all tag tests pass, commit

#### 2.3.2 — `filters` (134 lines, 7 routes)

| # | Task | Size |
|---|------|------|
| 2.3.2a | Create `src/schemas/filters.schema.js` | S |
| 2.3.2b | Create `src/repositories/filters.repository.js` | S |
| 2.3.2c | Create `src/services/filters.service.js` | S |
| 2.3.2d | Refactor `src/routes/filters.js` | S |
| 2.3.2e | Run filter tests | S |

- [ ] 2.3.2a Schema: `src/schemas/filters.schema.js`
- [ ] 2.3.2b Repository: `src/repositories/filters.repository.js`
- [ ] 2.3.2c Service: `src/services/filters.service.js`
- [ ] 2.3.2d Refactor: `src/routes/filters.js` → thin controller
- [ ] 2.3.2e Verify: all filter tests pass, commit

#### 2.3.3 — `areas` (202 lines, 17 routes)

| # | Task | Size |
|---|------|------|
| 2.3.3a | Create `src/schemas/areas.schema.js` | S |
| 2.3.3b | Create `src/repositories/areas.repository.js` | M |
| 2.3.3c | Create `src/repositories/goals.repository.js` | M |
| 2.3.3d | Create `src/services/areas.service.js` | M |
| 2.3.3e | Create `src/services/goals.service.js` | M |
| 2.3.3f | Refactor `src/routes/areas.js` | M |
| 2.3.3g | Run area/goal tests | S |

**Note:** `areas.js` handles both areas AND goals. Create both repositories and services together. `goals.repository.js` will also be used by `tasks` later.

- [ ] 2.3.3a Schema: `src/schemas/areas.schema.js` (areas + goals schemas)
- [ ] 2.3.3b Repository: `src/repositories/areas.repository.js`
- [ ] 2.3.3c Repository: `src/repositories/goals.repository.js`
- [ ] 2.3.3d Service: `src/services/areas.service.js`
- [ ] 2.3.3e Service: `src/services/goals.service.js`
- [ ] 2.3.3f Refactor: `src/routes/areas.js` → thin controller
- [ ] 2.3.3g Verify: all area/goal tests pass, commit

#### 2.3.4 — `auth` (183 lines, 5 routes)

| # | Task | Size |
|---|------|------|
| 2.3.4a | Create `src/schemas/auth.schema.js` | S |
| 2.3.4b | Create `src/repositories/users.repository.js` | S |
| 2.3.4c | Create `src/services/auth.service.js` | M |
| 2.3.4d | Refactor `src/routes/auth.js` | M |
| 2.3.4e | Run auth tests | S |

- [ ] 2.3.4a Schema: `src/schemas/auth.schema.js`
- [ ] 2.3.4b Repository: `src/repositories/users.repository.js`
- [ ] 2.3.4c Service: `src/services/auth.service.js`
- [ ] 2.3.4d Refactor: `src/routes/auth.js` → thin controller
- [ ] 2.3.4e Verify: all auth tests pass, commit

#### 2.3.5 — `data` (193 lines, 6 routes)

| # | Task | Size |
|---|------|------|
| 2.3.5a | Create `src/schemas/data.schema.js` | S |
| 2.3.5b | Create `src/services/data.service.js` | M |
| 2.3.5c | Refactor `src/routes/data.js` | M |
| 2.3.5d | Run data/import/export tests | S |

**Note:** Data routes (export/import/backup) don't need a repository — they operate on the raw DB. Service layer handles the logic.

- [ ] 2.3.5a Schema: `src/schemas/data.schema.js`
- [ ] 2.3.5b Service: `src/services/data.service.js`
- [ ] 2.3.5c Refactor: `src/routes/data.js` → thin controller
- [ ] 2.3.5d Verify: all data tests pass, commit

#### 2.3.6 — `productivity` (207 lines, 18 routes)

| # | Task | Size |
|---|------|------|
| 2.3.6a | Create `src/schemas/focus.schema.js` | S |
| 2.3.6b | Create `src/repositories/focus.repository.js` | M |
| 2.3.6c | Create `src/services/focus.service.js` | M |
| 2.3.6d | Refactor `src/routes/productivity.js` | M |
| 2.3.6e | Run focus/productivity tests | S |

**Note:** `productivity.js` covers focus timer, reminders, triage, comments, milestones. Focus gets its own repo; comments and milestones can live in the focus repo or a small `comments.repository.js`.

- [ ] 2.3.6a Schema: `src/schemas/focus.schema.js` (+ comments/milestones)
- [ ] 2.3.6b Repository: `src/repositories/focus.repository.js`
- [ ] 2.3.6c Service: `src/services/focus.service.js`
- [ ] 2.3.6d Refactor: `src/routes/productivity.js` → thin controller
- [ ] 2.3.6e Verify: all productivity tests pass, commit

#### 2.3.7 — `lists` (328 lines, 22 routes)

| # | Task | Size |
|---|------|------|
| 2.3.7a | Create `src/schemas/lists.schema.js` | S |
| 2.3.7b | Create `src/repositories/lists.repository.js` | M |
| 2.3.7c | Create `src/services/lists.service.js` | M |
| 2.3.7d | Refactor `src/routes/lists.js` | M |
| 2.3.7e | Run list tests | S |

- [ ] 2.3.7a Schema: `src/schemas/lists.schema.js`
- [ ] 2.3.7b Repository: `src/repositories/lists.repository.js`
- [ ] 2.3.7c Service: `src/services/lists.service.js`
- [ ] 2.3.7d Refactor: `src/routes/lists.js` → thin controller
- [ ] 2.3.7e Verify: all list tests pass, commit

#### 2.3.8 — `stats` (385 lines, 20 routes)

| # | Task | Size |
|---|------|------|
| 2.3.8a | Create `src/schemas/stats.schema.js` | S |
| 2.3.8b | Create `src/services/stats.service.js` | L |
| 2.3.8c | Refactor `src/routes/stats.js` | M |
| 2.3.8d | Run stats tests | S |

**Note:** Stats routes are read-only query aggregations. They can query multiple repositories directly rather than needing their own repository. The service layer is where the complex query logic lives.

- [ ] 2.3.8a Schema: `src/schemas/stats.schema.js`
- [ ] 2.3.8b Service: `src/services/stats.service.js` (complex — pulls from several tables)
- [ ] 2.3.8c Refactor: `src/routes/stats.js` → thin controller
- [ ] 2.3.8d Verify: all stats tests pass, commit

#### 2.3.9 — `features` (530 lines, 25 routes)

| # | Task | Size |
|---|------|------|
| 2.3.9a | Create `src/schemas/habits.schema.js` | S |
| 2.3.9b | Create `src/schemas/notes.schema.js` | S |
| 2.3.9c | Create `src/repositories/habits.repository.js` | M |
| 2.3.9d | Create `src/repositories/notes.repository.js` | S |
| 2.3.9e | Create `src/services/habits.service.js` | M |
| 2.3.9f | Refactor `src/routes/features.js` | L |
| 2.3.9g | Run feature tests | S |

**Note:** `features.js` is a grab bag: habits, templates, automations, onboarding, inbox, notes, reviews. Create repos/services for the largest sub-domains (habits, notes). Smaller features (inbox, templates, automations, reviews, onboarding) can share a utilities service or stay inline if logic is trivial.

- [ ] 2.3.9a Schema: `src/schemas/habits.schema.js`
- [ ] 2.3.9b Schema: `src/schemas/notes.schema.js` (+ inbox, templates, reviews)
- [ ] 2.3.9c Repository: `src/repositories/habits.repository.js`
- [ ] 2.3.9d Repository: `src/repositories/notes.repository.js`
- [ ] 2.3.9e Service: `src/services/habits.service.js`
- [ ] 2.3.9f Refactor: `src/routes/features.js` → thin controller
- [ ] 2.3.9g Verify: all feature tests pass, commit

#### 2.3.10 — `tasks` (437 lines, 26 routes) — **most complex, do last**

| # | Task | Size |
|---|------|------|
| 2.3.10a | Create `src/schemas/tasks.schema.js` | M |
| 2.3.10b | Create `src/schemas/subtasks.schema.js` | S |
| 2.3.10c | Create `src/repositories/tasks.repository.js` | L |
| 2.3.10d | Create `src/repositories/subtasks.repository.js` | M |
| 2.3.10e | Create `src/services/tasks.service.js` | L |
| 2.3.10f | Refactor `src/routes/tasks.js` | L |
| 2.3.10g | Run all task tests | S |

**Blockers:** Requires `goals.repository.js` (created in 2.3.3), `tags.repository.js` (created in 2.3.1), and `lists.repository.js` (created in 2.3.7). This is why tasks are last.

**Key concern:** `enrichTask`/`enrichTasks` from `src/helpers.js` — these cross entity boundaries (tags, subtasks, deps, lists). Move them into `tasks.repository.js` or into a dedicated `src/repositories/task-enrichment.js`.

- [ ] 2.3.10a Schema: `src/schemas/tasks.schema.js` (create, update, reorder, search, board filters)
- [ ] 2.3.10b Schema: `src/schemas/subtasks.schema.js`
- [ ] 2.3.10c Repository: `src/repositories/tasks.repository.js` (includes `enrichTask`/`enrichTasks`)
- [ ] 2.3.10d Repository: `src/repositories/subtasks.repository.js`
- [ ] 2.3.10e Service: `src/services/tasks.service.js`
- [ ] 2.3.10f Refactor: `src/routes/tasks.js` → thin controller
- [ ] 2.3.10g Verify: ALL tests pass (full suite, not just task tests), commit

---

### 2.4 Dependency Injection Container

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 2.4.1 | Create `src/container.js` | M | Instantiates all repos + services, exports frozen container |
| 2.4.2 | Update `src/server.js` to use container | M | Replaces ad-hoc `deps` object with `createContainer(db)` |
| 2.4.3 | Update `tests/helpers.js` if test setup uses `deps` | S | Tests still get properly configured `deps` |

**Dependency:** Do after all 10 routes are converted (2.3.1–2.3.10). The container wires everything together.

- [ ] 2.4.1 Create `src/container.js` — wires repos → services
- [ ] 2.4.2 Update `src/server.js` — use `createContainer(db)`, mount routes with container services
- [ ] 2.4.3 Update test setup if needed

---

### 2.5 API Versioning

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 2.5.1 | Add `/api/v1/` prefix in `src/server.js` | M | All routes accessible at `/api/v1/...` |
| 2.5.2 | Keep `/api/` as backward-compat alias | S | Existing `/api/` URLs still work |
| 2.5.3 | Update frontend API base URL | S | `api` object in `public/app.js` uses `/api/v1/` |
| 2.5.4 | Update `docs/openapi.yaml` server URL | S | Base URL reflects `/api/v1` |

**Dependency:** Do after container is in place (2.4).

- [ ] 2.5.1 Add `v1` Router in `src/server.js`, mount all route modules on it
- [ ] 2.5.2 Mount v1 router at both `/api/v1` and `/api` (backward compat)
- [ ] 2.5.3 Update `public/app.js` API base URL to `/api/v1/`
- [ ] 2.5.4 Update `docs/openapi.yaml` base URL

---

### 2.6 Cleanup

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 2.6.1 | Slim down `src/helpers.js` | S | Only non-DB utilities remain (or file is deleted if empty) |
| 2.6.2 | Verify no SQL in route files | S | `grep 'db.prepare' src/routes/` returns 0 |

- [ ] 2.6.1 Remove migrated functions from `src/helpers.js`
- [ ] 2.6.2 Verify `grep 'db.prepare' src/routes/` → 0 results

---

### Phase 2 Final Verification

- [ ] `grep 'db.prepare' src/routes/` → 0 results (all SQL in repositories)
- [ ] Every route input has a zod schema
- [ ] Route handlers are ≤15 lines each
- [ ] `/api/v1/` prefix works; `/api/` still works
- [ ] All 1,692 tests pass unchanged (same API contract)
- [ ] Commit, PR, merge to main
- [ ] Tag `v0.5.0-backend-architecture`

---

## Phase 3 — Frontend Modularization

**Goal:** Break 5,369-line `app.js` into ES modules. No build step.  
**Branch:** `restructure/phase-3`  
**Depends on:** Phase 1 complete (ESM understanding). Independent of Phase 2.

### 3.1 Utility Extraction (leaf dependencies — extract first)

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 3.1.1 | Create `public/utils/dom.js` | M | Exports `$()`, `esc()`, `escA()`, `renderMd()` |
| 3.1.2 | Create `public/utils/dates.js` | S | Exports `fmtDue()`, `relativeDate()`, date helpers |
| 3.1.3 | Create `public/utils/format.js` | S | Exports number/string formatters |

**Strategy:** Cut function from `app.js`, paste into module with `export`, replace in `app.js` with `import`. Verify in browser.

- [ ] 3.1.1 Extract `public/utils/dom.js` — `$()`, `esc()`, `escA()`, `renderMd()`
- [ ] 3.1.2 Extract `public/utils/dates.js` — `fmtDue()` and date helpers
- [ ] 3.1.3 Extract `public/utils/format.js` — number/string formatters

**Verify:** Open app in browser, check dev console for errors. Key views render correctly.

---

### 3.2 API Client Extraction

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 3.2.1 | Create `public/api/client.js` | M | Exports the `api` object with `get`, `post`, `put`, `del`, `patch`, CSRF handling |

- [ ] 3.2.1 Extract `public/api/client.js` — the `api` object (all fetch wrappers, CSRF token refresh)

**Verify:** Make an API call from the browser (create a task). Confirm CSRF works.

---

### 3.3 State Management

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 3.3.1 | Create `public/state/store.js` | M | Exports `getState()`, `setState()`, `subscribe()` |
| 3.3.2 | Create `public/state/actions.js` | L | State mutation functions that were previously inline |
| 3.3.3 | Migrate top-level `let` variables to store | L | No mutable `let` state variables in `app.js` |

**Risk:** This is the most invasive frontend change. Every view reads/writes state differently.  
**Mitigation:** Map ALL state variables before starting. Identify which views read and write which variables. Replace incrementally — one variable at a time if needed.

**Top-level state variables to migrate** (from current `app.js`):
`areas`, `goals`, `tasks`, `allTags`, `currentView`, `currentUser`, `selectedAreaId`, `selectedGoalId`, plus any others found during extraction.

- [ ] 3.3.1 Create `public/state/store.js` with pub/sub pattern
- [ ] 3.3.2 Create `public/state/actions.js` with state mutation functions
- [ ] 3.3.3 Replace top-level `let` variables with `store.getState()` / `store.setState()` calls

**Verify:** Navigate between views. State persists correctly across view switches.

---

### 3.4 Router Extraction

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 3.4.1 | Create `public/router/index.js` | M | Hash-based router with pattern matching |
| 3.4.2 | Create `public/router/routes.js` | S | Route definitions map |
| 3.4.3 | Replace hashchange logic in `app.js` | M | Router handles all navigation |

- [ ] 3.4.1 Create `public/router/index.js` — `registerRoute()`, `navigate()`, `start()`
- [ ] 3.4.2 Create `public/router/routes.js` — route-to-view mapping
- [ ] 3.4.3 Replace inline hashchange handling in `app.js`

**Verify:** Navigate to every view via URL hash. Back/forward buttons work.

---

### 3.5 Component Extraction

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 3.5.1 | Create `public/components/toast.js` | S | `showToast()` function |
| 3.5.2 | Create `public/components/modal.js` | M | Overlay lifecycle (`_lockBody`, `_pushFocus`, etc.) |
| 3.5.3 | Create `public/components/confirm.js` | S | Confirmation dialogs |
| 3.5.4 | Create `public/components/task-card.js` | M | Reusable task card rendering |
| 3.5.5 | Create `public/components/task-modal.js` | L | Task detail overlay (largest component) |
| 3.5.6 | Create `public/components/sidebar.js` | M | Sidebar rendering |
| 3.5.7 | Create `public/components/quick-capture.js` | M | Ctrl+K / N quick capture |
| 3.5.8 | Create `public/components/drag-drop.js` | M | `touchDnD` system |

**Order matters:** toast → modal → confirm (dependency chain), then independent components.

- [ ] 3.5.1 Extract `public/components/toast.js`
- [ ] 3.5.2 Extract `public/components/modal.js`
- [ ] 3.5.3 Extract `public/components/confirm.js`
- [ ] 3.5.4 Extract `public/components/task-card.js`
- [ ] 3.5.5 Extract `public/components/task-modal.js`
- [ ] 3.5.6 Extract `public/components/sidebar.js`
- [ ] 3.5.7 Extract `public/components/quick-capture.js`
- [ ] 3.5.8 Extract `public/components/drag-drop.js`

**Verify:** Toast shows on actions. Modals open/close. Drag-and-drop works on desktop + mobile.

---

### 3.6 View Extraction

**Extract one view at a time. Each view becomes a module exporting `{ render, mount, unmount }`.**

**Order (simplest → most complex, minimize coupling):**

| # | View | File | Size | Key Dependencies |
|---|------|------|------|------------------|
| 3.6.1 | Inbox | `public/views/inbox.js` | S | api, store |
| 3.6.2 | Tag Manager | `public/views/tag-manager.js` | S | api, store |
| 3.6.3 | Activity Log | `public/views/activity.js` | S | api, dates |
| 3.6.4 | Focus History | `public/views/focus-history.js` | M | api, dates, store |
| 3.6.5 | Triage | `public/views/triage.js` | M | api, task-card |
| 3.6.6 | Habits | `public/views/habits.js` | M | api, store |
| 3.6.7 | Lists | `public/views/lists.js` | M | api, drag-drop |
| 3.6.8 | Matrix | `public/views/matrix.js` | M | api, task-card |
| 3.6.9 | Today | `public/views/today.js` | M | api, store, task-card, drag-drop |
| 3.6.10 | All Tasks | `public/views/all-tasks.js` | M | api, store, task-card |
| 3.6.11 | Board | `public/views/board.js` | M | api, store, task-card, drag-drop |
| 3.6.12 | Calendar | `public/views/calendar.js` | M | api, dates |
| 3.6.13 | Weekly Plan | `public/views/weekly-plan.js` | M | api, dates, drag-drop |
| 3.6.14 | Area | `public/views/area.js` | M | api, store |
| 3.6.15 | Goal | `public/views/goal.js` | M | api, store, task-card |
| 3.6.16 | Dashboard | `public/views/dashboard.js` | L | api, store, dates |
| 3.6.17 | Reports | `public/views/reports.js` | L | api, store, dates (7-tab) |
| 3.6.18 | Settings | `public/views/settings.js` | L | api, store (7-tab) |

- [ ] 3.6.1 Extract `public/views/inbox.js`
- [ ] 3.6.2 Extract `public/views/tag-manager.js`
- [ ] 3.6.3 Extract `public/views/activity.js`
- [ ] 3.6.4 Extract `public/views/focus-history.js`
- [ ] 3.6.5 Extract `public/views/triage.js`
- [ ] 3.6.6 Extract `public/views/habits.js`
- [ ] 3.6.7 Extract `public/views/lists.js`
- [ ] 3.6.8 Extract `public/views/matrix.js`
- [ ] 3.6.9 Extract `public/views/today.js`
- [ ] 3.6.10 Extract `public/views/all-tasks.js`
- [ ] 3.6.11 Extract `public/views/board.js`
- [ ] 3.6.12 Extract `public/views/calendar.js`
- [ ] 3.6.13 Extract `public/views/weekly-plan.js`
- [ ] 3.6.14 Extract `public/views/area.js`
- [ ] 3.6.15 Extract `public/views/goal.js`
- [ ] 3.6.16 Extract `public/views/dashboard.js`
- [ ] 3.6.17 Extract `public/views/reports.js`
- [ ] 3.6.18 Extract `public/views/settings.js`

**After each extraction:** Open that view in the browser. Verify rendering, interactions, navigation away and back.

---

### 3.7 Entry Point + HTML Update

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 3.7.1 | Update `public/index.html` | S | `<script type="module" src="app.js">` |
| 3.7.2 | Slim `public/app.js` | M | ~100 lines: imports, init, router setup |
| 3.7.3 | Update `public/sw.js` cache list | M | New module files included in precache |
| 3.7.4 | Update CSP in `src/server.js` if needed | S | Module scripts work with current CSP |

- [ ] 3.7.1 Add `type="module"` to script tag in `public/index.html`
- [ ] 3.7.2 Verify `public/app.js` is under 200 lines
- [ ] 3.7.3 Update `public/sw.js` to cache new module paths
- [ ] 3.7.4 Verify CSP allows module loading (may need to remove `'unsafe-inline'` from scriptSrc or keep for backward compat)

---

### Phase 3 Final Verification

- [ ] `public/app.js` is under 200 lines
- [ ] `wc -l public/app.js` confirms
- [ ] Every view is in `public/views/`
- [ ] No top-level mutable `let` state in `app.js`
- [ ] All keyboard shortcuts work (N, M, Ctrl+K, ?, Esc, 0-9)
- [ ] Touch drag-and-drop works on mobile
- [ ] Service Worker caches new modules — test offline mode
- [ ] Browser console shows 0 module loading errors
- [ ] All 25+ views render correctly (manual smoke test each one)
- [ ] All backend tests still pass (`npm test`)
- [ ] Commit, PR, merge to main
- [ ] Tag `v0.6.0-frontend-modular`

---

## Phase 4 — Production Hardening

**Goal:** Migration system, multi-stage Docker, health checks, graceful shutdown, CI improvements.  
**Branch:** `restructure/phase-4`  
**Depends on:** Phases 1 + 2 complete (config, logger, DB layer).

### 4.1 Database Migration System

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 4.1.1 | Create `src/db/migrations/` directory | S | Directory exists |
| 4.1.2 | Create `001_initial_schema.sql` | M | Full schema with `CREATE TABLE IF NOT EXISTS` — no-op on existing DBs |
| 4.1.3 | Extract existing ad-hoc migrations from `src/db/index.js` | M | Each `try/catch ALTER TABLE` block becomes a numbered `.sql` file |
| 4.1.4 | Add `_migrations` tracking table | S | Created in `db/index.js` before running migrations |
| 4.1.5 | Write migration runner in `src/db/index.js` | M | Reads `migrations/` dir, applies unapplied in order, records in `_migrations` |
| 4.1.6 | Remove ad-hoc `try/catch ALTER TABLE` blocks from `src/db/index.js` | M | All schema changes are in migration files |
| 4.1.7 | Test with fresh DB | S | New install gets full schema from migrations |
| 4.1.8 | Test with existing DB | S | Pre-existing DB runs migration runner without errors |

**Risk:** Migration runner must be idempotent for existing installs.  
**Rollback:** Keep a copy of the current `db/index.js` with inline migrations as fallback.

**Current ad-hoc migrations to extract** (from `src/db/index.js`):
- `ALTER TABLE subtasks ADD COLUMN note`
- `ALTER TABLE ... ADD COLUMN user_id` (multiple tables)
- Settings composite PK change
- Search index user_id
- Any others found during audit of `db/index.js`

- [ ] 4.1.1 Create `src/db/migrations/` directory
- [ ] 4.1.2 Write `001_initial_schema.sql` (all `CREATE TABLE IF NOT EXISTS`)
- [ ] 4.1.3 Extract ad-hoc migrations into `002_*.sql`, `003_*.sql`, etc.
- [ ] 4.1.4 Add `_migrations` table creation in `src/db/index.js`
- [ ] 4.1.5 Write migration runner function
- [ ] 4.1.6 Remove inline `try/catch ALTER TABLE` blocks from `src/db/index.js`
- [ ] 4.1.7 Test: fresh DB starts clean via migration runner
- [ ] 4.1.8 Test: existing DB (copy of production) runs migrations without error

**Verify:** All tests pass. `SELECT * FROM _migrations` shows all applied migrations.

---

### 4.2 Graceful Shutdown

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 4.2.1 | Add SIGTERM/SIGINT handlers in `src/server.js` | S | `server.close()` + `db.close()` on signal |
| 4.2.2 | Add 10-second force-kill timeout | S | Process exits after timeout if graceful fails |
| 4.2.3 | Test with `kill -TERM <pid>` | S | Server shuts down cleanly, no WAL corruption |

- [ ] 4.2.1 Add `gracefulShutdown()` function with SIGTERM + SIGINT handlers
- [ ] 4.2.2 Add force-kill timeout (10s)
- [ ] 4.2.3 Verify: `kill -TERM` results in clean shutdown (check logs)

---

### 4.3 Enhanced Health Check

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 4.3.1 | Enhance `/health` endpoint | S | Returns `{ status, version, uptime, db, timestamp }` |
| 4.3.2 | Add `/ready` endpoint | S | Returns `{ ready: true/false }` based on DB connectivity |
| 4.3.3 | Update health check tests if any | S | Tests pass with new response format |

- [ ] 4.3.1 Enhance `/health` — add version, uptime, db status, timestamp
- [ ] 4.3.2 Add `/ready` — readiness probe for orchestrators
- [ ] 4.3.3 Update any existing health check test assertions

---

### 4.4 Multi-Stage Docker Build

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 4.4.1 | Rewrite `Dockerfile` with 2-stage build | M | Stage 1: deps, Stage 2: runtime with non-root user |
| 4.4.2 | Add `HEALTHCHECK` using `/health` endpoint | S | Docker health check passes |
| 4.4.3 | Create `docker-compose.prod.yml` | S | Production compose with named volume, resource limits |
| 4.4.4 | Update existing `docker-compose.yml` | S | Dev compose references new Dockerfile targets |
| 4.4.5 | Test `docker build` produces <200MB image | S | `docker images` confirms size |
| 4.4.6 | Test `docker compose up` from empty data dir | S | App starts, creates DB, serves correctly |

**Rollback:** Keep current `Dockerfile` as `Dockerfile.legacy` until new one is verified.

- [ ] 4.4.1 Rewrite `Dockerfile` — multi-stage (deps → runtime), non-root user `lifeflow`
- [ ] 4.4.2 Add `HEALTHCHECK` instruction using Node.js HTTP check against `/health`
- [ ] 4.4.3 Create `docker-compose.prod.yml` with named volume + resource limits
- [ ] 4.4.4 Update `docker-compose.yml` for dev usage
- [ ] 4.4.5 Verify: `docker images lifeflow` shows <200MB
- [ ] 4.4.6 Verify: `docker compose up` from scratch works end-to-end

---

### 4.5 CI Pipeline Improvements

| # | Task | Size | Acceptance Criteria |
|---|------|------|---------------------|
| 4.5.1 | Add lint job to `.github/workflows/ci.yml` | S | Biome check runs on `src/` and `tests/` |
| 4.5.2 | Add Docker build job | M | Builds image + runs health check in CI |
| 4.5.3 | Add `npm cache` to existing test job | S | CI uses npm cache for faster installs |

**Current CI** (from `.github/workflows/ci.yml`): Tests on Node 20 + 22. No lint, no Docker.

- [ ] 4.5.1 Add `lint` job — `npx --yes biome check src/ tests/`
- [ ] 4.5.2 Add `docker` job — build image, run container, curl `/health`, stop
- [ ] 4.5.3 Add `cache: npm` to test job `actions/setup-node` step (already present — verify)

---

### Phase 4 Final Verification

- [ ] `docker build -t lifeflow:test .` succeeds, image <200MB
- [ ] `docker compose -f docker-compose.prod.yml up -d` starts from empty data dir
- [ ] `curl localhost:3456/health` returns version + uptime + db status
- [ ] `curl localhost:3456/ready` returns `{ ready: true }`
- [ ] `docker stop lifeflow` triggers graceful shutdown (check logs)
- [ ] Migration runner applies all migrations on fresh + existing DBs
- [ ] `SELECT * FROM _migrations` shows all applied migrations
- [ ] CI runs tests + lint + Docker build on push
- [ ] All 1,692 tests pass
- [ ] Commit, PR, merge to main
- [ ] Tag `v1.0.0`

---

## Full File Inventory

### New Files (total: ~60)

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `.env.example` | Documented environment variables |
| 1 | `src/config.js` | Centralized config |
| 1 | `src/logger.js` | Pino structured logging |
| 1 | `src/errors.js` | AppError class hierarchy |
| 2 | `src/container.js` | Dependency injection |
| 2 | `src/schemas/common.schema.js` | Shared zod validators |
| 2 | `src/schemas/tags.schema.js` | Tag input schemas |
| 2 | `src/schemas/filters.schema.js` | Filter input schemas |
| 2 | `src/schemas/areas.schema.js` | Area + goal input schemas |
| 2 | `src/schemas/auth.schema.js` | Auth input schemas |
| 2 | `src/schemas/data.schema.js` | Import/export schemas |
| 2 | `src/schemas/focus.schema.js` | Focus session schemas |
| 2 | `src/schemas/lists.schema.js` | List + item schemas |
| 2 | `src/schemas/stats.schema.js` | Query param schemas |
| 2 | `src/schemas/habits.schema.js` | Habit schemas |
| 2 | `src/schemas/notes.schema.js` | Note + inbox + review schemas |
| 2 | `src/schemas/tasks.schema.js` | Task + search schemas |
| 2 | `src/schemas/subtasks.schema.js` | Subtask schemas |
| 2 | `src/repositories/base.repository.js` | Shared DB helpers |
| 2 | `src/repositories/tags.repository.js` | Tag SQL |
| 2 | `src/repositories/filters.repository.js` | Filter SQL |
| 2 | `src/repositories/areas.repository.js` | Area SQL |
| 2 | `src/repositories/goals.repository.js` | Goal SQL |
| 2 | `src/repositories/users.repository.js` | User + session SQL |
| 2 | `src/repositories/focus.repository.js` | Focus session SQL |
| 2 | `src/repositories/lists.repository.js` | List + item SQL |
| 2 | `src/repositories/habits.repository.js` | Habit SQL |
| 2 | `src/repositories/notes.repository.js` | Note SQL |
| 2 | `src/repositories/tasks.repository.js` | Task SQL + enrichTask |
| 2 | `src/repositories/subtasks.repository.js` | Subtask SQL |
| 2 | `src/services/tags.service.js` | Tag business logic |
| 2 | `src/services/filters.service.js` | Filter business logic |
| 2 | `src/services/areas.service.js` | Area business logic |
| 2 | `src/services/goals.service.js` | Goal business logic |
| 2 | `src/services/auth.service.js` | Auth business logic |
| 2 | `src/services/data.service.js` | Export/import logic |
| 2 | `src/services/focus.service.js` | Focus session logic |
| 2 | `src/services/lists.service.js` | List logic |
| 2 | `src/services/stats.service.js` | Stats aggregation logic |
| 2 | `src/services/habits.service.js` | Habit logic |
| 2 | `src/services/tasks.service.js` | Task business logic |
| 3 | `public/utils/dom.js` | DOM utilities |
| 3 | `public/utils/dates.js` | Date formatters |
| 3 | `public/utils/format.js` | String/number formatters |
| 3 | `public/api/client.js` | API fetch wrapper |
| 3 | `public/state/store.js` | Pub/sub state store |
| 3 | `public/state/actions.js` | State mutation functions |
| 3 | `public/router/index.js` | Hash router |
| 3 | `public/router/routes.js` | Route definitions |
| 3 | `public/components/toast.js` | Toast notifications |
| 3 | `public/components/modal.js` | Modal lifecycle |
| 3 | `public/components/confirm.js` | Confirm dialogs |
| 3 | `public/components/task-card.js` | Task card rendering |
| 3 | `public/components/task-modal.js` | Task detail overlay |
| 3 | `public/components/sidebar.js` | Sidebar |
| 3 | `public/components/quick-capture.js` | Quick capture |
| 3 | `public/components/drag-drop.js` | Touch DnD |
| 3 | `public/views/*.js` (×18) | Individual view modules |
| 4 | `src/db/migrations/*.sql` (×5+) | Numbered SQL migrations |
| 4 | `docker-compose.prod.yml` | Production compose |

### Modified Files

| Phase | File | Change |
|-------|------|--------|
| 1 | `package.json` | `"type": "module"`, add dotenv + pino |
| 1 | `src/server.js` | ESM, config, logger, error handling |
| 1 | `src/db/index.js` | ESM, config for dbDir |
| 1 | `src/helpers.js` | ESM exports |
| 1 | `src/middleware/*.js` (×4) | ESM exports |
| 1 | `src/services/audit.js` | ESM, logger |
| 1 | `src/routes/*.js` (×10) | ESM exports |
| 1 | `tests/helpers.js` | ESM adaptation |
| 1 | `public/app.js` | Updated error handling |
| 2 | `src/middleware/validate.js` | Zod-based rewrite |
| 2 | `src/routes/*.js` (×10) | Thin controllers |
| 2 | `src/helpers.js` | Slimmed (functions moved to repos) |
| 2 | `docs/openapi.yaml` | `/api/v1/` base URL |
| 3 | `public/app.js` | 5,369 → ~100 lines |
| 3 | `public/index.html` | `type="module"` on script tag |
| 3 | `public/sw.js` | Updated cache list |
| 4 | `Dockerfile` | Multi-stage build |
| 4 | `docker-compose.yml` | Updated for new Dockerfile |
| 4 | `src/db/index.js` | Migration runner |
| 4 | `.github/workflows/ci.yml` | Lint + Docker jobs |

---

## Risk Summary

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|------------|--------|------------|
| ESM breaks test runner | 1 | Medium | High | Node 22 stable ESM; fallback to `.cjs` tests |
| Error format change breaks tests | 1 | Medium | Medium | Backward-compat error handler |
| Zod rejects previously-accepted inputs | 2 | High | Medium | Write permissive schemas first, tighten later |
| `enrichTasks` cross-entity queries in repo | 2 | Medium | Low | Accept it — read optimization, not a violation |
| Circular JS module dependencies | 3 | High | Medium | Extract utils/dom.js first; sketch dependency graph before starting |
| State migration breaks views | 3 | High | High | Map all state variables before store migration; one variable at a time |
| Service Worker caches stale modules | 3 | Medium | Medium | Update SW version string on deploy |
| Migration runner corrupts existing DB | 4 | Medium | High | Test with production DB copy; `IF NOT EXISTS` for migration 001 |

---

## Execution Notes

- **One phase per branch, one PR per phase.** Never have two phases in flight.
- **Commit after every task group** (e.g., after each route conversion). Small commits = easy revert.
- **Run `npm test` after every task.** All 1,692 tests must stay green at all times.
- **Phase 3 has no automated tests.** Manual browser smoke-test each view after extraction.
- **Update `CLAUDE.md`** after each phase merge: LOC counts, file structure, architecture section.
- **Update `CHANGELOG.md`** with each phase merge.
- **New dependencies total:** 3 production (dotenv, pino, zod) + 1 dev (pino-pretty).
