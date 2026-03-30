# Review Fixes v2 — Spec

> **Version:** v0.7.52 · **Date:** 30 March 2026  
> **Source:** `docs/REVIEW_v0.7.26-v0.7.51.md` (Grade B+)  
> **Baseline:** 3,504 tests | 145 test files  
> **Target:** ~3,410 tests | 138 test files (net −94 tests, −7 files)

---

## Work Items

### WI-1: Fix `COLOR_HEX_RE` regex bug (Critical)

**Problem:** `/^#[0-9A-Fa-f]{3,6}$/` accepts 4-char (`#FFFF`) and 5-char (`#FFFFF`) hex values, which are not valid CSS colors. Only 3-char and 6-char hex are valid.

**Files to modify:**
- `src/middleware/validate.js:6`
- `src/routes/auth.js:17`
- `src/schemas/common.schema.js:6`

**Change:** Replace `{3,6}` with `({3}|{6})` in all three locations:
```js
// Before
const COLOR_HEX_RE = /^#[0-9A-Fa-f]{3,6}$/;
// or
z.string().regex(/^#[0-9A-Fa-f]{3,6}$/, ...)

// After
const COLOR_HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
// or
z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, ...)
```

**Acceptance criteria:**
- [ ] `#FFF` accepted (3-char)
- [ ] `#FF0000` accepted (6-char)
- [ ] `#FFFF` rejected (4-char)
- [ ] `#FFFFF` rejected (5-char)
- [ ] `#FF` rejected (2-char)
- [ ] All existing color tests still pass

**Risk:** Low. Tightens validation — only rejects previously-invalid values. No stored data uses 4/5-char hex.

---

### WI-2: Add 4/5-char hex rejection tests (pairs with WI-1)

**File to modify:** `tests/xss-prevention.test.js`

**Change:** Add 2 test cases to the "Server-side color validation" describe block:
- `POST /api/areas with color "#FFFF" → rejected (400)` (4-char)
- `POST /api/areas with color "#FFFFF" → rejected (400)` (5-char)

**Test count impact:** +2

**Risk:** None.

---

### WI-3: Add `user_id` to factory functions (Critical)

**Problem:** `makeArea()`, `makeGoal()`, `makeTask()`, `makeTag()`, `makeFocus()`, `makeList()`, `makeHabit()` omit `user_id` in INSERT statements. Works because schema has `DEFAULT 1`, but is fragile.

**File to modify:** `tests/helpers.js`

**Changes:**
- `makeArea()`: Add `user_id` to INSERT (`VALUES` clause + parameter)
- `makeGoal()`: Add `user_id` to INSERT (goals inherit from area but adding explicitly is safer)
- `makeTask()`: Add `user_id` to INSERT
- `makeTag()`: Add `user_id` to INSERT
- `makeFocus()`: Add `user_id` to INSERT
- `makeList()`: Add `user_id` to INSERT
- `makeHabit()`: Add `user_id` to INSERT

Default `user_id: 1` in overrides object, so callers don't need to change.

**Acceptance criteria:**
- [ ] All factory functions include `user_id` in INSERT
- [ ] Default value is 1 (backward compatible)
- [ ] `overrides` can set `user_id` to other values
- [ ] All existing tests pass unchanged

**Risk:** Low. Adding an explicit value that matches the existing DEFAULT.

---

### WI-4: Add `users` and `sessions` cleanup to `cleanDb()`

**Problem:** `cleanDb()` doesn't clean `users` or `sessions` tables. Tests accumulate orphaned rows.

**File to modify:** `tests/helpers.js`

**Change:** Add to `cleanDb()`:
```js
db.exec("DELETE FROM sessions WHERE sid != '" + _testSessionId + "'");
db.exec("DELETE FROM users WHERE id != " + _testUserId);
```

Must preserve the default test user (id=1) and its session to avoid breaking auth for the test agent.

**Acceptance criteria:**
- [ ] `cleanDb()` removes non-default users and sessions
- [ ] Default test user (id=1) and its session preserved
- [ ] Multi-user tests that create User2 still work (they create users in the test body, after cleanDb)

**Risk:** Medium. Could break tests that rely on accumulated users from prior `beforeEach` cycles. Unlikely since user creation happens within individual test bodies, but needs verification.

---

### WI-5: Consolidate IDOR tests

**Problem:** ~40-50 duplicate "User2 cannot access User1's X" tests across 5 files.

**Canonical file:** `tests/idor-comprehensive.test.js` (56 tests — keep all)

**Files to modify (remove IDOR-duplicate tests only):**

| File | IDOR tests to remove | Unique tests to keep |
|------|---------------------|---------------------|
| `tests/multi-user-exhaustive.test.js` | ~13 (area/goal/task/subtask/tag/habit/note/list/custom-field access) | ~20 (search isolation, stats scoping, export scoping, focus stats) |
| `tests/e2e-security-workflows.test.js` | 4 (area edit, goal delete, task complete, list items) | remaining workflow tests |
| `tests/security-regression.test.js` | 4 (inbox, notes, focus sessions, templates) | remaining regression tests |
| `tests/idor-auth.test.js` | ~15 (area/goal/task/subtask/comment CRUD, list items) | ~7 (auth guards: 401 without cookie, expired session, fabricated cookie) |

**Decision rule:** If the exact same resource+operation+assertion is in `idor-comprehensive.test.js`, remove it from other files. Keep tests that test something different (search scoping, stats aggregation, auth guards, workflow context).

**Acceptance criteria:**
- [ ] `idor-comprehensive.test.js` unchanged (56 tests)
- [ ] No IDOR test coverage lost — every resource+operation has exactly one test
- [ ] Unique tests (search isolation, stats scoping, auth guards) preserved
- [ ] All remaining tests pass

**Test count impact:** −36 (estimated)

**Risk:** Medium. Must verify each removed test is truly a duplicate and not testing a subtly different scenario. Review line-by-line before deleting.

---

### WI-6: Consolidate meta/hygiene tests

**Problem:** 4 overlapping files all check version consistency, file existence, code quality.

**Files to merge:**
| File | Tests | Unique value |
|------|-------|-------------|
| `tests/release-hygiene.test.js` | 6 | Version sync, health endpoint, openapi route coverage |
| `tests/dev-workflow.test.js` | ~22 | .editorconfig, .gitignore, Dockerfile, no console.log, indentation |
| `tests/coverage-audit.test.js` | ~22 | Route coverage %, test conventions, no hardcoded secrets |
| `tests/release-gate.test.js` | ~22 | Version sync (dup), file existence, security middleware checks |

**Target:** Create `tests/project-health.test.js` with deduplicated tests in 4 sections:
1. **Version consistency** (package.json ↔ CLAUDE.md ↔ openapi.yaml ↔ CHANGELOG) — 4 tests (from RH + CA + RG, deduplicated)
2. **Project structure** (README, LICENSE, CONTRIBUTING, Dockerfile, .editorconfig, .gitignore, .env.example) — ~10 tests
3. **Code quality** (no console.log, no hardcoded secrets, no TODO in security files, indentation) — ~6 tests
4. **Test infrastructure** (test file count, conventions, helpers exports) — ~5 tests
5. **Security gates** (helmet, CSRF, rate limiting, error handler, timing-safe auth) — ~5 tests
6. **API coverage** (route coverage %, openapi route matching, health endpoint) — ~4 tests

**Files to delete:** `release-hygiene.test.js`, `dev-workflow.test.js`, `coverage-audit.test.js`, `release-gate.test.js`

**Acceptance criteria:**
- [ ] All unique checks from 4 files present in `project-health.test.js`
- [ ] No duplicate checks within the merged file
- [ ] 4 old files deleted
- [ ] All tests pass

**Test count impact:** −34 estimated (72 tests across 4 files → ~38 deduplicated in 1 file)

**Risk:** Low. These are all static analysis tests (read files, check strings). No runtime behavior dependencies.

---

### WI-7: Tighten performance thresholds

**Problem:** `performance-baselines.test.js` uses 2000ms thresholds that only catch outages, not regressions.

**File to modify:** `tests/performance-baselines.test.js`

**Changes:**
| Endpoint | Current | New |
|----------|---------|-----|
| `GET /api/tasks/all` (100 tasks) | 2000ms | 500ms |
| `GET /api/stats` | 1000ms | 200ms |
| `GET /api/tasks/board` | 2000ms | 500ms |
| `GET /api/tasks/my-day` | 1000ms | 200ms |
| `GET /api/areas` (5 areas) | 1000ms | 200ms |
| `GET /api/tags` | 500ms | 200ms |
| 50 sequential creates | 5000ms | 2000ms |
| Batch status update | 2000ms | 500ms |
| `GET /api/search` | 2000ms | 500ms |
| Export 100 tasks | 3000ms | 1000ms |

**Acceptance criteria:**
- [ ] All tightened thresholds pass in CI (test environment)
- [ ] Thresholds are 3-5x expected latency (not too tight for CI variance)

**Test count impact:** 0

**Risk:** Medium. May cause flaky failures in slow CI environments. If so, use 2x multiplier instead of current values. Run full suite 3x before committing.

---

### WI-8: Convert frontend tests to behavioral (jsdom)

**Problem:** `frontend-units.test.js` and `service-worker.test.js` do static string analysis (`src.includes('textContent')`) instead of behavioral testing.

**Files to modify:**
- `tests/frontend-units.test.js` (~22 tests)
- `tests/service-worker.test.js` (~22 tests)

**Changes for `frontend-units.test.js`:**
- Extract `esc()`, `escA()`, `fmtDue()`, `renderMd()` from `public/js/utils.js` using jsdom
- Test actual input→output: `esc('<script>') === '&lt;script&gt;'`
- Keep API-based NLP tests as-is (already behavioral)

**Changes for `service-worker.test.js`:**
- Use jsdom to create minimal ServiceWorker environment
- Test actual fetch handler behavior with mock Request/Response
- Test cache key generation, cleanup logic
- Keep file-existence checks (they're valid)

**Acceptance criteria:**
- [ ] `esc()` tested with actual XSS payloads → verified output
- [ ] `escA()` tested with attribute injection payloads → verified output
- [ ] `renderMd()` tested with markdown input → verified HTML output
- [ ] `fmtDue()` tested with date strings → verified formatted output
- [ ] Service worker fetch handler tested with mock requests
- [ ] No `src.includes()` pattern remains for behavior tests

**Test count impact:** ~0 (replace, not add)

**Risk:** Medium. Extracting functions from `app.js`/`utils.js` via jsdom requires those modules to be loadable in Node. May need minor refactoring if they depend on browser globals not available in jsdom. `public/js/utils.js` is an ES module — may need dynamic import or vm module approach.

---

## Execution Order

```
WI-1 → WI-2 (regex fix + tests)         # Critical, zero risk
WI-3 → WI-4 (helpers.js improvements)   # Critical, low risk  
WI-5 (IDOR consolidation)               # Highest dedup value
WI-6 (meta test consolidation)          # Second dedup value
WI-7 (perf thresholds)                  # Quick win
WI-8 (jsdom conversion)                 # Most effort, do last
```

WI-1 through WI-4 are independent and can be parallelized. WI-5 and WI-6 should be done sequentially (both modify test file counts, affecting `project-health.test.js` assertions).

## Test Count Impact Summary

| Item | Added | Removed | Net |
|------|-------|---------|-----|
| WI-1 (regex fix) | 0 | 0 | 0 |
| WI-2 (hex rejection tests) | +2 | 0 | +2 |
| WI-3 (factory user_id) | 0 | 0 | 0 |
| WI-4 (cleanDb users/sessions) | 0 | 0 | 0 |
| WI-5 (IDOR dedup) | 0 | −36 | −36 |
| WI-6 (meta dedup) | 0 | −34 | −34 |
| WI-7 (perf thresholds) | 0 | 0 | 0 |
| WI-8 (jsdom conversion) | 0 | 0 | 0 |
| **Total** | **+2** | **−70** | **−68** |

**Expected result:** ~3,436 tests | 138 test files (−4 deleted, −3 from IDOR file consolidation where empty files are removed, +1 new `project-health.test.js`)

## Verification

After all changes:
1. `npm test` — all tests pass
2. `npm run lint` — 0 errors
3. Test count in range 3,400-3,450
4. No pair of test files tests the same resource+operation+assertion
5. `#FFFF` and `#FFFFF` rejected by all color validation paths
6. `cleanDb()` leaves only the default test user

## Version

Tag as `v0.7.52` after all items complete and verified.
