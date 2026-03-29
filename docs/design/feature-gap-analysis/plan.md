# Feature Gap Analysis — Implementation Plan (v2)

> **Source:** [spec.md](spec.md) (5-expert panel, 18 recommendations, Any.do comparison)
> **Baseline:** v0.6.0 | 1,931 tests | 78 test files | 190 routes | 33 tables | ~14,500 LOC
> **Date:** 28 March 2026
> **TDD Protocol:** Strict Red→Green→Refactor. Every task starts with failing tests.
> **Replaces:** Previous plan.md (v0.4.0 baseline, now obsolete)

---

## Scope

The spec proposed 18 features across 4 tiers. **11 of 14 checked features are fully implemented**, 2 are partial, 0 are missing. This plan covers:

1. **Release hygiene** — version sync, CHANGELOG, OpenAPI, engines (blockers for any release)
2. **Completing partial features** — Web Push delivery, multi-user assignment UI
3. **Test hardening** — extensive TDD for undertested existing features

### Already Implemented (verified 28 March 2026)

| Spec Section | Feature | Status | Tests |
|-------------|---------|--------|-------|
| 6.1 | Copy subtasks on recurring spawn | ✅ Shipped | In recurring tests |
| 6.2 | Auto-link Pomodoro to actual_minutes | ✅ Shipped | In stats.js |
| 5.3 | Recurring field Zod validation | ✅ Shipped | In tasks schema |
| 6.3 | Table View (backend + frontend) | ✅ Shipped | In tasks.test.js |
| 6.4 | Custom Fields (2 tables, 6 endpoints, UI) | ✅ Shipped | phase3 tests |
| 6.5 | Gantt Chart V2 (deps, bars, today line) | ✅ Shipped | gantt-v2.test.js |
| — | API Token Authentication | ✅ Shipped | api-tokens.test.js |
| — | TOTP 2FA | ✅ Shipped | phase7-auth.test.js |
| — | Outbound Webhooks (HMAC-SHA256) | ✅ Shipped | batch5.test.js |
| — | Todoist/Trello Import | ✅ Shipped | external-import.test.js |
| — | iCal Export | ✅ Shipped | data-integrity.test.js |
| — | Offline Mutation Queue | ✅ Shipped | offline-queue.test.js |

### Partial (this plan completes them)

| Feature | What exists | What's missing |
|---------|------------|----------------|
| Web Push | Subscriptions table + endpoints | Delivery (web-push pkg), VAPID keys, triggers |
| Multi-user assignment | Backend `assigned_to_user_id` + GET /api/users | UI user picker, assignment indicators |

### Deferred (Tier 4 — future plan)

- CalDAV calendar sync
- Telegram/WhatsApp bot
- Sync conflict resolution

---

## TDD Protocol

Every task in this plan follows strict TDD:

1. **RED:** Write failing tests FIRST. Tests must fail for the right reason (not import errors — the feature must be absent or broken).
2. **GREEN:** Write the minimum code to make tests pass. No speculative features.
3. **REFACTOR:** Clean up only if the implementation is unclear. Don't gold-plate.
4. **Verify:** Run `node --test --test-force-exit tests/*.test.js` after each task. Zero failures.
5. **Test categories per task:**
   - **Happy path** — feature works as intended
   - **Validation** — bad input rejected with correct status code and message
   - **Edge cases** — empty arrays, null values, boundary conditions
   - **Security** — IDOR (accessing other user's data), auth required, injection
   - **Integration** — feature interacts correctly with related features
   - **Regression** — existing tests still pass

Minimum **8 tests per backend task**, **4 tests per frontend-only task**.

---

## Phase 0 — Release Hygiene

**Why first:** Version mismatches and missing changelog entries are blockers for any public release. Automated tooling (Docker tags, npm audit) depends on correct versions.

### Task 0.1: Version Sync

**Type:** Config fix
**Files:** `package.json`, `docs/openapi.yaml`

**Problem:** Three different versions exist:
- `package.json`: `0.5.0`
- `docs/openapi.yaml`: `0.2.6`
- `CLAUDE.md`: `0.6.0`
- `src/config.js`: reads from `package.json` (correct), fallback `0.3.0`

**Changes:**
- `package.json` → `"version": "0.6.0"`
- `package.json` → add `"engines": { "node": ">=22" }`
- `docs/openapi.yaml` → line 24: `version: 0.6.0`

**Tests:** 2 new (in new `tests/release-hygiene.test.js`)
```
1. GET /health returns version matching package.json version
2. package.json has engines.node constraint
```

### Task 0.2: CHANGELOG Update

**Type:** Documentation
**File:** `CHANGELOG.md`

**Changes:** Add entries for v0.4.0, v0.5.0, v0.5.1, and v0.6.0 covering:
- v0.4.0: Table view, custom fields, Gantt V1, Todoist/Trello import, iCal export
- v0.5.0: API tokens, TOTP 2FA, outbound webhooks, Web Push subscriptions, offline queue, multi-user assignment backend
- v0.5.1: Security remediation (115 findings), audit logging
- v0.6.0: Multi-expert improvement (6 phases), background scheduler, request logging, daily review, goal progress, What's Next, context menu, bulk operations

**Tests:** 1 new
```
1. CHANGELOG.md contains entry for current package.json version
```

### Task 0.3: OpenAPI Spec — New Endpoints

**Type:** Documentation
**File:** `docs/openapi.yaml`

**Problem:** Missing documentation for endpoints added in v0.5.0–v0.6.0:
- `PATCH /api/tasks/batch` — bulk update
- `GET /api/tasks/suggested` — What's Next suggestions
- `POST /api/reviews/daily` — daily micro-review create/upsert
- `GET /api/reviews/daily/{date}` — daily micro-review get
- `GET /api/tasks/recurring` — list recurring tasks
- `POST /api/tasks/{id}/skip` — skip recurring occurrence

**Tests:** 2 new
```
1. Every router.get/post/put/patch/delete route in src/routes/*.js has a corresponding path in openapi.yaml
2. openapi.yaml version matches package.json version
```

### Phase 0 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 0.1 Version sync | Config | 2 | package.json, openapi.yaml |
| 0.2 CHANGELOG | Docs | 1 | CHANGELOG.md |
| 0.3 OpenAPI update | Docs | 2 | openapi.yaml |
| **Total** | | **5** | |

---

## Phase 1 — Web Push Delivery (Complete Partial Feature)

**Why now:** Push subscription infrastructure exists (table, endpoints, subscribe/unsubscribe) but delivery is stubbed out. Users who subscribe get nothing. This is a broken promise.

### Task 1.1: Web Push Dependency + VAPID Keys

**Type:** Infrastructure
**Files:** `package.json`, `src/server.js`, `.env.example`

**Changes:**
- `npm install web-push` (production dependency)
- `.env.example` → add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- `src/server.js` or new `src/services/push.service.js` → initialize web-push with VAPID keys
- Add VAPID key generation script: `node -e "const wp=require('web-push');console.log(wp.generateVAPIDKeys())"`

**Tests:** 4 new
```
1. web-push is in package.json dependencies
2. Push service initializes without error when VAPID keys provided
3. Push service skips initialization gracefully when VAPID keys missing
4. VAPID public key available via GET /api/push/vapid-key endpoint
```

### Task 1.2: Push Notification Delivery

**Type:** Feature (backend)
**Files:** `src/services/push.service.js` (new), `src/routes/features.js`

**Changes:**
- Create `src/services/push.service.js`:
  - `sendPush(userId, {title, body, url, tag})` — sends to all user's subscriptions
  - Handles expired subscriptions (410 response → delete from DB)
  - Handles network errors gracefully (log, don't crash)
- Update `POST /api/push/test` to actually send a test notification
- Wire push into scheduler: check for overdue tasks every 30 min, send push if any

**Tests:** 10 new
```
1. POST /api/push/test sends notification to subscribed user (mock web-push)
2. POST /api/push/test with no subscriptions → 200 with count:0
3. sendPush handles expired subscription (410) → removes from DB
4. sendPush handles network error → logs warning, doesn't throw
5. sendPush with invalid subscription → removes from DB
6. Multiple subscriptions → sends to all, returns success count
7. Push payload includes title, body, url fields
8. Push payload is properly JSON-encoded
9. VAPID key endpoint returns public key
10. Push service disabled when VAPID keys not configured → operations are no-op
```

### Task 1.3: Push Triggers

**Type:** Feature (backend)
**Files:** `src/routes/tasks.js`, `src/routes/productivity.js`, `src/scheduler.js`

**Changes:**
- Task assignment: when `assigned_to_user_id` changes → push to assignee
- Overdue check (scheduler job, every 30 min): push for tasks overdue by >1 hour
- Daily review reminder (scheduler job, 6pm): push "Review your day"
- Deduplicate: don't re-send for same task within 24h

**Tests:** 8 new
```
1. Assigning task to user triggers push notification (mock)
2. Re-assigning same task doesn't duplicate notification
3. Unassigning task (null) doesn't trigger push
4. Overdue task check finds tasks overdue by >1 hour
5. Overdue push not sent for same task within 24h (dedup)
6. Daily review push fires after configured hour (mock time)
7. Push not sent when user has no subscriptions (no error)
8. Push not sent when VAPID keys not configured (graceful skip)
```

### Phase 1 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 1.1 VAPID + dependency | Infra | 4 | package.json, .env.example, server.js |
| 1.2 Push delivery | Feature | 10 | push.service.js (new), features.js |
| 1.3 Push triggers | Feature | 8 | tasks.js, productivity.js, scheduler.js |
| **Total** | | **22** | |

---

## Phase 2 — Multi-User Assignment UI (Complete Partial Feature)

**Why now:** Backend supports `assigned_to_user_id` with foreign key to users table. GET /api/users returns user list. But the UI only shows a text input for `assigned_to`. This makes the multi-user feature invisible.

### Task 2.1: User Picker in Task Detail Panel

**Type:** Frontend feature
**Files:** `public/app.js`, `public/styles.css`

**Changes:**
- In `renderDPBody()`, replace the text input `#dp-asg` with a user dropdown from `GET /api/users`
- Show user initials + display_name in dropdown
- On select: `PUT /api/tasks/:id { assigned_to_user_id: userId }`
- Show "Unassigned" option to clear assignment

**Tests:** 6 new (static analysis in `tests/frontend-validation.test.js`)
```
1. app.js contains /api/users fetch call
2. app.js contains assigned_to_user_id in task update
3. app.js contains user picker dropdown markup
4. Task detail panel shows assigned user display name
5. PUT /api/tasks/:id with assigned_to_user_id=valid → 200, user assigned
6. PUT /api/tasks/:id with assigned_to_user_id=nonexistent → 400
```

### Task 2.2: Assignment Indicators in Task Cards

**Type:** Frontend feature
**Files:** `public/app.js`, `public/styles.css`

**Changes:**
- In `tcHtml()`, if `assigned_to_user_id` is set, show assignee initials badge
- In Today view, assigned-to-me tasks get a visual indicator

**Tests:** 4 new
```
1. tcHtml includes assignee badge when assigned_to_user_id is set
2. Assignee badge shows user initials (first letter of display_name)
3. Tasks assigned to current user show "You" instead of name
4. CSS contains assignee badge styles
```

### Task 2.3: Assignment API Hardening

**Type:** Backend security
**Files:** `src/routes/tasks.js`

**Changes:**
- Validate `assigned_to_user_id` references a real user on the same instance
- Add assignee display_name to enrichTask response

**Tests:** 8 new
```
1. Assign task to valid user → 200, assigned_to_user_id set
2. Assign task to nonexistent user → 400 error
3. Assign task to user_id=0 → 400 error
4. Unassign task (null) → 200, assigned_to_user_id cleared
5. enrichTask includes assignee_name when assigned_to_user_id set
6. Assigning another user's task → 403 (IDOR protection)
7. GET /api/users excludes password_hash from response
8. GET /api/users requires authentication
```

### Phase 2 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 2.1 User picker | Frontend | 6 | app.js, styles.css |
| 2.2 Assignment indicators | Frontend | 4 | app.js, styles.css |
| 2.3 Assignment API hardening | Backend | 8 | tasks.js |
| **Total** | | **18** | |

---

## Phase 3 — Test Hardening (Extensive TDD for Existing Features)

**Why:** Several implemented features have thin test coverage (3-10 tests). For a beta release, every feature needs comprehensive tests covering happy path, validation, edge cases, security, and integration. This phase adds no new features — only tests. Any bugs discovered get fixed immediately.

### Task 3.1: Custom Fields Test Expansion

**Current coverage:** ~28 tests in `tests/phase3-makeyours.test.js` (shared with other features)
**Target:** 15 new dedicated tests

**Tests:** 15 new (new file `tests/custom-fields-extensive.test.js`)
```
Field definition CRUD:
1. Create text field → 201 with correct type
2. Create number field → validates field_type enum
3. Create select field with options array → stored correctly
4. Create select field without options → 400
5. Create field with empty name → 400
6. Create field with duplicate name → 409
7. Update field name → 200
8. Update field position → 200
9. Delete field → cascades to task_custom_values
10. List fields → ordered by position

Value operations:
11. Set text value → 200, value stored
12. Set number value with non-numeric string → 400
13. Set date value with invalid format → 400
14. Set select value not in options → 400
15. Delete task → custom values cascade deleted
```

### Task 3.2: API Tokens Test Expansion

**Current coverage:** 10 tests in `tests/api-tokens.test.js`
**Target:** 12 new tests

**Tests:** 12 new (append to `tests/api-tokens.test.js`)
```
1. Create token → returns plaintext token ONCE, never again
2. List tokens → does NOT include token_hash or plaintext
3. Use bearer token → authenticated request succeeds
4. Use expired bearer token → 401
5. Use revoked bearer token → 401
6. Bearer token auth sets req.userId correctly
7. Bearer token updates last_used_at on use
8. Create token with empty name → 400
9. Create token with duplicate name → 409 or allowed
10. Delete token → subsequent bearer auth fails
11. Token works for POST/PUT/DELETE (not just GET)
12. Token IDOR: using token for user A on user B's resources → 403
```

### Task 3.3: Webhook Test Expansion

**Current coverage:** Some tests in `tests/batch5.test.js`
**Target:** 10 new dedicated tests

**Tests:** 10 new (new file `tests/webhooks-extensive.test.js`)
```
1. Create webhook → 201 with secret + events
2. Create webhook with invalid URL → 400
3. Create webhook with empty events array → 400
4. List webhooks → returns all user's webhooks
5. Update webhook (name, url, events, active) → 200
6. Delete webhook → 200
7. Get webhook events list → returns supported event types
8. Webhook IDOR: access other user's webhook → 404
9. Webhook secret is unique per webhook
10. Disable webhook (active=false) → persisted correctly
```

### Task 3.4: 2FA Test Expansion

**Current coverage:** Some tests in `tests/phase7-auth.test.js`
**Target:** 10 new tests

**Tests:** 10 new (new file `tests/2fa-extensive.test.js`)
```
1. GET /api/auth/2fa/status when not enabled → { enabled: false }
2. POST /api/auth/2fa/setup → returns secret + otpauth URI
3. POST /api/auth/2fa/verify with correct token → enables 2FA
4. POST /api/auth/2fa/verify with wrong token → 400
5. POST /api/auth/2fa/verify when not in setup state → 400
6. Login with 2FA enabled but no token → 403 "2FA required"
7. Login with 2FA enabled and correct token → success
8. Login with 2FA enabled and wrong token → 401
9. DELETE /api/auth/2fa → disables, login works without token
10. 2FA time drift: token from adjacent time step → accepted (±1)
```

### Task 3.5: Import/Export Roundtrip Tests

**Current coverage:** 28 tests in `tests/data-integrity.test.js`
**Target:** 10 new tests for import formats + edge cases

**Tests:** 10 new (append to `tests/data-integrity.test.js`)
```
1. Todoist import → creates area, goals from projects, tasks from items
2. Todoist import → maps priority correctly (1→3, 2→2, 3→1, 4→0)
3. Todoist import → preserves due dates
4. Trello import → creates area, goals from lists, tasks from cards
5. Trello import → preserves card descriptions as task notes
6. iCal export → valid VCALENDAR format
7. iCal export → includes RRULE for recurring tasks
8. iCal export → excludes completed tasks
9. Export → import roundtrip preserves custom field values
10. Export → import roundtrip preserves daily_reviews
```

### Task 3.6: Gantt View Test Expansion

**Current coverage:** 5 tests in `tests/gantt-v2.test.js`
**Target:** 8 new tests

**Tests:** 8 new (append to `tests/gantt-v2.test.js`)
```
1. GET /api/tasks/timeline returns tasks within date range
2. GET /api/tasks/timeline excludes tasks without due_date
3. Timeline tasks include blocked_by dependency data
4. Timeline tasks include area_name and goal_color
5. Frontend: renderGantt function exists in app.js
6. Frontend: gantt-bar and gantt-today classes exist in CSS
7. Frontend: dependency arrows render (gantt-dep-arrow class)
8. Frontend: task bars have goal_color styling
```

### Task 3.7: Offline Queue Test Expansion

**Current coverage:** 10 tests in `tests/offline-queue.test.js`
**Target:** 6 new tests

**Tests:** 6 new (append to `tests/offline-queue.test.js`)
```
1. store.js has queueMutation function
2. store.js persists queue to localStorage key
3. store.js restores queue from localStorage on init
4. sw.js detects POST/PUT/DELETE failures and notifies client
5. sw.js does NOT queue GET request failures
6. Mutation queue entries have timestamp for ordering
```

### Task 3.8: Push Subscription Test Expansion

**Current coverage:** 9 tests in `tests/push.test.js`
**Target:** 6 new tests

**Tests:** 6 new (append to `tests/push.test.js`)
```
1. POST /api/push/subscribe → stores endpoint + keys
2. POST /api/push/subscribe with missing endpoint → 400
3. POST /api/push/subscribe duplicate endpoint → upsert
4. DELETE /api/push/subscribe → removes subscription
5. Subscription IDOR: other user can't delete your subscription
6. GET /api/push/vapid-key → returns public key (or 404 if not configured)
```

### Phase 3 Summary

| Task | Type | New Tests | Target File |
|------|------|-----------|-------------|
| 3.1 Custom fields | Tests | 15 | custom-fields-extensive.test.js (new) |
| 3.2 API tokens | Tests | 12 | api-tokens.test.js |
| 3.3 Webhooks | Tests | 10 | webhooks-extensive.test.js (new) |
| 3.4 2FA | Tests | 10 | 2fa-extensive.test.js (new) |
| 3.5 Import/export | Tests | 10 | data-integrity.test.js |
| 3.6 Gantt view | Tests | 8 | gantt-v2.test.js |
| 3.7 Offline queue | Tests | 6 | offline-queue.test.js |
| 3.8 Push subscriptions | Tests | 6 | push.test.js |
| **Total** | | **77** | |

---

## Phase 4 — Documentation & Release Polish

**Why last:** All features work and are tested. Now make them discoverable.

### Task 4.1: Reverse Proxy Documentation Update

**Type:** Documentation
**File:** `docs/deployment.md`

**Changes:**
- Verify Nginx reverse proxy config (HTTPS termination, proxy headers)
- Verify Caddy reverse proxy config (automatic HTTPS)
- Document `BASE_URL` env var for proper URL generation
- Document cookie `Secure` flag behavior behind reverse proxy

**Tests:** 2 new
```
1. docs/deployment.md exists and contains nginx configuration
2. docs/deployment.md contains caddy configuration
```

### Task 4.2: Contributing Guide Review

**Type:** Documentation
**File:** `CONTRIBUTING.md`

**Changes:**
- Verify CONTRIBUTING.md references correct test command
- Add TDD methodology section
- Add code architecture overview link

**Tests:** 1 new
```
1. CONTRIBUTING.md references current test command and node version
```

### Phase 4 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 4.1 Reverse proxy docs | Docs | 2 | docs/deployment.md |
| 4.2 Contributing review | Docs | 1 | CONTRIBUTING.md |
| **Total** | | **3** | |

---

## Execution Summary

```
Phase 0 (Release Hygiene)    →   5 tests  — version sync, changelog, OpenAPI
Phase 1 (Web Push Delivery)  →  22 tests  — VAPID, delivery, triggers
Phase 2 (Multi-User UI)      →  18 tests  — user picker, indicators, API hardening
Phase 3 (Test Hardening)     →  77 tests  — extensive TDD for 8 existing features
Phase 4 (Docs & Polish)      →   3 tests  — deployment docs, contributing
                                ────────
Total:                        125 new tests, ~15 tasks
Target:                       v0.7.0-beta | ~2,056 tests | 81+ test files
```

### Execution Order

Phases 0→1→2→3→4 strictly sequential. Within each phase, tasks are independent.

Run `npm test` after each task — zero failures required.

### Review Checkpoint

After Phase 1 completion (Web Push delivery working), pause and verify:
- [ ] All existing 1,931 tests still pass
- [ ] New tests cover happy path + validation + security
- [ ] No regressions in recurring tasks, focus timer, or daily review
- [ ] Web Push actually delivers to a test subscription

If any fail, fix before proceeding to Phase 2.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| web-push npm package version conflicts | Pin version, test before merge |
| VAPID key management complexity | Generate once, store in .env, document clearly |
| Push notification spam | Dedup per task per 24h, respect subscription state |
| Multi-user UI breaks single-user UX | User picker only shown when >1 user exists |
| Test hardening reveals bugs | Fix bugs immediately — that's TDD's purpose |
| OpenAPI spec drift | Task 0.3 adds automated route↔spec coverage test |
