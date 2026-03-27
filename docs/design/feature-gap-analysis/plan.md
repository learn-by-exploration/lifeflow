# Feature Gap Analysis — Implementation Plan

> **Source:** [spec.md](spec.md) (Parts 0-7)
> **Baseline:** v0.4.0 | 1,728 tests | 61 test files | 166 routes | 28 tables
> **Date:** 27 March 2026

---

## Already Implemented (v0.4.0)

These items from the spec are **done** and committed:

| Spec Section | Feature | Status |
|-------------|---------|--------|
| 6.1 | Copy subtasks on recurring spawn | ✅ Shipped |
| 6.2 | Auto-link Pomodoro to actual_minutes | ✅ Shipped |
| 5.3 | Recurring field Zod validation | ✅ Shipped |
| 6.3 | Table View (backend + frontend) | ✅ Shipped |
| 6.4 | Custom Fields (2 tables, 6 endpoints, UI) | ✅ Shipped |
| 6.5 | Gantt Chart MVP (SVG, no drag/deps) | ✅ Shipped |

---

## Remaining Work

Organized into 6 phases. Phase 0 addresses critical test infrastructure gaps discovered during the test audit. Phases 1-5 follow the spec's tiered priorities.

---

## Phase 0 — Test Gap Remediation

**Why first:** The test audit found 4 critical gaps (CSRF untested, FTS cross-user data leak, export/import data loss, migration runner untested) plus 5 high-severity gaps. These are bugs and security holes that must be fixed before adding new features.

### Task 0.1: Fix FTS Search Cross-User Data Leak

**Type:** Bug fix + test
**Severity:** CRITICAL — User2 can search and find User1's private task data
**Risk:** Security vulnerability in production

**Problem:** `search_index` FTS5 table has no `user_id` column. The search query in `src/routes/data.js` doesn't filter by user_id.

**Changes:**
- `src/db/index.js` — Rebuild `search_index` FTS5 table to include `user_id` column, or join against tasks table on search
- `src/routes/data.js` — Add `WHERE user_id = ?` filtering to search query (JOIN tasks ON search_index.rowid = tasks.rowid WHERE tasks.user_id = ?)
- `tests/break_auth.test.js` — Verify User2 search does NOT return User1's tasks (currently marked FAIL-EXPECTED)

**Tests:** 3-5 new
```
1. User1 creates task "Secret Project" → User2 searches "Secret" → 0 results
2. User1 searches own task → finds it
3. Search with no results → empty array
4. Search after task deletion → no stale index entries
```

### Task 0.2: CSRF Middleware Test Coverage

**Type:** New tests (no code changes expected)
**Severity:** CRITICAL — Security middleware completely untested

**Changes:**
- New test file `tests/csrf.test.js`
- Use `rawAgent()` (no session) and `agent()` (with session) to test CSRF enforcement

**Tests:** 6-8 new
```
1. POST /api/tasks without X-CSRF-Token header → 403
2. POST /api/tasks with invalid CSRF token → 403
3. POST /api/tasks with valid CSRF token → 201 (succeeds)
4. PUT request without token → 403
5. DELETE request without token → 403
6. GET request without token → 200 (exempt)
7. Auth endpoints exempt from CSRF → login works without token
8. CSRF cookie set on first response
```

**Implementation note:** The test helpers `agent()` may already auto-handle CSRF tokens. Need to read `src/middleware/csrf.js` to understand the double-submit cookie pattern and craft tests that intentionally bypass it.

### Task 0.3: Export/Import Data Completeness

**Type:** Bug fix + test
**Severity:** CRITICAL — Export silently drops custom fields, focus sessions, habits, comments, deps, automation rules

**Problem:** `GET /api/export` only exports 4 tables (areas, goals, tasks, tags). Users lose custom field data, focus session history, habit logs, comments, dependencies, and automation rules on export/import cycle.

**Changes:**
- `src/routes/data.js` — Extend export to include: `custom_field_defs`, `task_custom_values`, `focus_sessions`, `habits`, `habit_logs`, `task_comments`, `task_deps`, `automation_rules`, `notes`, `inbox`, `saved_filters`, `lists`, `list_items`
- `src/routes/data.js` — Extend import to restore all exported tables
- `tests/data-integrity.test.js` — Roundtrip fidelity tests

**Tests:** 8-12 new
```
1. Export includes custom_field_defs and task_custom_values
2. Export includes focus_sessions
3. Export includes habits + habit_logs
4. Export includes task_comments
5. Export includes task_deps
6. Export includes automation_rules
7. Export includes lists + list_items
8. Full roundtrip: export → wipe → import → all records identical
9. Import with missing optional tables (backward compat) → succeeds
10. Roundtrip preserves tag associations
11. Roundtrip preserves custom field values on tasks
```

### Task 0.4: Database Migration Runner Tests

**Type:** New tests (no code changes expected)
**Severity:** CRITICAL — Migration infrastructure untested

**Changes:**
- New test file `tests/migrations.test.js`
- Test the migration runner in `src/db/migrate.js` with temp DBs

**Tests:** 5-6 new
```
1. Fresh DB → all migrations applied in sorted order
2. Already-applied migration → skipped (idempotent)
3. _migrations table tracks applied migrations with timestamps
4. Malformed SQL migration → throws error (doesn't silently pass)
5. Empty migrations directory → no error
6. Migration files execute in alphabetical/numeric order
```

### Task 0.5: Recurring Spawn Doesn't Copy Custom Fields

**Type:** Bug fix + test
**Severity:** HIGH — Custom field values silently lost when recurring task spawns

**Problem:** `RecurringService.spawnNext()` copies tags and subtasks but NOT custom field values.

**Changes:**
- `src/services/recurring.service.js` — After subtask copying, add custom field value copying:
  ```
  SELECT field_id, value FROM task_custom_values WHERE task_id = ?
  INSERT INTO task_custom_values (task_id, field_id, value) VALUES (newId, ?, ?)
  ```

**Tests:** 3 new
```
1. Complete recurring task with custom fields → spawned task has same field values
2. Complete recurring task with no custom fields → no error
3. Custom field def deleted between spawns → no orphan values
```

### Task 0.6: Error Handler Edge Cases

**Type:** New tests
**Severity:** MEDIUM

**Tests:** 4 new
```
1. SQLite UNIQUE constraint violation → 409 (not 500)
2. Generic unhandled error → 500 with "Internal server error" (no stack trace)
3. Malformed JSON body → 400 (already partially tested, verify coverage)
4. AppError subclasses return correct status codes (NotFoundError→404, ValidationError→400)
```

### Task 0.7: Comment UPDATE Route Test

**Type:** New test
**Severity:** MEDIUM — Route exists at PUT /api/tasks/:id/comments/:commentId but is untested

**Tests:** 3 new
```
1. PUT comment with new content → 200, content updated
2. PUT comment with empty content → 400
3. PUT comment owned by different user → 403/404
```

### Task 0.8: Task Lifecycle → Dashboard Stats E2E

**Type:** New test
**Severity:** MEDIUM — No test verifies the full create → complete → stats reflection flow

**Tests:** 3 new
```
1. Create task → complete it → GET /api/stats → task appears in recentDone
2. Complete task → GET /api/stats → done count incremented
3. Create tasks across areas → complete some → GET /api/stats → byArea percentages correct
```

### Phase 0 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 0.1 FTS user isolation | Bug fix | 4 | data.js, db/index.js, break_auth.test.js |
| 0.2 CSRF tests | Tests only | 8 | csrf.test.js (new) |
| 0.3 Export/Import completeness | Bug fix | 12 | data.js, data-integrity.test.js |
| 0.4 Migration runner tests | Tests only | 6 | migrations.test.js (new) |
| 0.5 Recurring + custom fields | Bug fix | 3 | recurring.service.js |
| 0.6 Error handler tests | Tests only | 4 | error-handler.test.js (new) |
| 0.7 Comment UPDATE test | Tests only | 3 | exhaustive-misc.test.js |
| 0.8 Lifecycle → stats E2E | Tests only | 3 | stats.test.js |
| **Total** | | **~43** | |

---

## Phase 1 — Server Foundation (Spec Tier 1 remaining)

**Why:** API tokens and HTTPS docs are prerequisites for every server-ready feature (Web Push, multi-device, integrations). Nothing in Tiers 2-4 works without these.

### Task 1.1: API Token Authentication

**Spec ref:** Part 4, Tier 1 #4
**Effort:** Medium

**Database:**
- New table `api_tokens` (id, user_id, name, token_hash, last_used_at, created_at, expires_at)
- Token stored as bcrypt hash (never plaintext)

**Backend:**
- `src/routes/auth.js` — 4 new endpoints:
  - `POST /api/auth/tokens` — Generate token (returns plaintext ONCE)
  - `GET /api/auth/tokens` — List user's tokens (name, last_used, created — no hash)
  - `DELETE /api/auth/tokens/:id` — Revoke token
  - `PUT /api/auth/tokens/:id` — Rename token
- `src/middleware/auth.js` — Extend `requireAuth` to check `Authorization: Bearer <token>` header alongside session cookie. Bearer tokens bypass CSRF (stateless).

**Frontend:**
- Settings → Data tab: Token management UI (generate, copy, revoke, rename)

**Security requirements (from spec Part 3, Security Panel):**
- Tokens hashed with bcrypt (like passwords)
- Rate limit per-token
- Token names for user identification ("My Laptop Script", "Phone App")
- Expiration support (optional, default: no expiry)

**Tests:** 12-15 new
```
1. POST /api/auth/tokens → 201, returns token string + id
2. Token only shown once (subsequent GET shows name, not token)
3. Bearer token authenticates API requests
4. Invalid bearer token → 401
5. Expired bearer token → 401
6. Revoke token → subsequent requests fail
7. List tokens → returns all user tokens (no hashes)
8. Rename token → 200
9. Bearer auth bypasses CSRF requirement
10. Session auth still works alongside token auth
11. User2 cannot revoke User1's token
12. Token rate limiting separate from session rate limiting
```

### Task 1.2: HTTPS / Reverse Proxy Documentation

**Spec ref:** Part 4, Tier 1 #5
**Effort:** Small (documentation only)

**Changes:**
- `docs/deployment.md` — Add sections for:
  - Nginx reverse proxy config (HTTPS termination, WebSocket, proxy headers)
  - Caddy reverse proxy config (automatic HTTPS)
  - `BASE_URL` env var for external URL generation (iCal links, share links)
  - Cookie `Secure` flag when behind HTTPS (`TRUST_PROXY=1` env var)
  - HSTS header configuration
- `src/server.js` — Add `app.set('trust proxy', 1)` when `TRUST_PROXY` env var set
- `src/config.js` — Add `BASE_URL`, `TRUST_PROXY` to config

**Tests:** 2 new
```
1. trust proxy setting applied when TRUST_PROXY=1
2. BASE_URL used in share link generation
```

### Task 1.3: CORS Configuration

**Spec ref:** Part 3, Security Panel
**Effort:** Small

**Changes:**
- `src/server.js` — Read `ALLOWED_ORIGINS` env var (comma-separated), configure CORS dynamically
- `src/config.js` — Add `ALLOWED_ORIGINS` to config
- `.env.example` — Document the variable

**Tests:** 4 new
```
1. Default (no ALLOWED_ORIGINS) → same-origin only
2. ALLOWED_ORIGINS set → those origins allowed
3. Unlisted origin → rejected
4. Preflight OPTIONS request → correct headers
```

### Phase 1 Summary

| Task | New Tests | Files Changed |
|------|-----------|---------------|
| 1.1 API Tokens | 15 | auth.js (routes + middleware), db/index.js, app.js |
| 1.2 HTTPS Docs | 2 | deployment.md, server.js, config.js |
| 1.3 CORS Config | 4 | server.js, config.js, .env.example |
| **Total** | **~21** | |

---

## Phase 2 — Multi-Device Ready (Spec Tier 2)

**Depends on:** Phase 1 (API tokens for auth, CORS for cross-origin)

### Task 2.1: Web Push Notifications

**Spec ref:** Part 4, Tier 2 #6
**Effort:** Medium

**Dependencies:** `npm install web-push`

**Database:**
- New table `push_subscriptions` (id, user_id, endpoint, p256dh, auth, created_at)

**Backend:**
- `src/routes/features.js` — 3 new endpoints:
  - `POST /api/push/subscribe` — Store push subscription
  - `DELETE /api/push/subscribe` — Remove subscription
  - `POST /api/push/test` — Send test notification
- `src/services/push.js` — New service:
  - `sendPushNotification(userId, title, body, url)`
  - Uses VAPID keys from env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
- Trigger push on: overdue task (daily check), reminder time reached, task assigned to user

**Frontend:**
- `public/sw.js` — Add `push` event handler, `notificationclick` for navigation
- `public/app.js` — Push permission request in Settings, subscription management
- `public/index.html` — VAPID public key meta tag

**Tests:** 10-12 new
```
1. POST /api/push/subscribe → 201
2. Duplicate subscription → upsert (no error)
3. DELETE subscription → 200
4. Push notification sent on overdue task
5. Push notification sent on reminder
6. Invalid subscription → graceful failure (no crash)
7. User with no subscriptions → skip silently
8. VAPID keys missing → service disabled gracefully
9. Subscription cascade deletes with user
```

### Task 2.2: Offline Mutation Queue

**Spec ref:** Part 4, Tier 2 #9
**Effort:** Medium

**Changes:**
- `public/sw.js` — Intercept failed POST/PUT/DELETE requests, store in IndexedDB queue
- `public/store.js` — Mutation queue manager:
  - `queueMutation(method, url, body)` — Store failed write
  - `syncQueue()` — Replay queue when online (FIFO order)
  - `getQueueSize()` — For UI badge
- `public/app.js` — Online/offline event listeners, sync indicator in header, queue badge count
- Conflict strategy: Last-write-wins (simplest). Server timestamps win on conflict.

**Tests:** 6-8 new (static analysis + API behavior)
```
1. SW intercepts failed POST → stored in queue (static code analysis)
2. Queue replays in FIFO order on reconnect
3. Successful replay removes from queue
4. Failed replay retains in queue
5. Queue size reflected in UI indicator
6. Empty queue → no sync attempt
```

### Phase 2 Summary

| Task | New Tests | Files Changed |
|------|-----------|---------------|
| 2.1 Web Push | 12 | features.js, push.js (new), sw.js, db/index.js |
| 2.2 Offline Mutation Queue | 8 | sw.js, store.js, app.js |
| **Total** | **~20** | |

---

## Phase 3 — Gantt V2 + Webhooks (Spec Tier 3 partial)

**Depends on:** Phase 0 (test stability), Phase 1 (API tokens for webhook auth)

### Task 3.1: Gantt Chart V2

**Spec ref:** Part 6.5, V2 scope
**Effort:** Medium

**Changes (frontend only):**
- `public/app.js` — Extend `renderGantt()`:
  - Dependency arrows: SVG `<path>` bezier curves from task end → dependent task start
  - Drag-to-reschedule: mousedown/mousemove on bar → update due_date via PUT
  - Zoom controls: Day (40px col) / Week (120px) / Month (200px) toggle buttons
  - Progress fill: Partial bar fill based on subtask_done/subtask_total
- `public/styles.css` — Gantt interaction styles (drag cursor, arrow markers)

**Tests:** 8 new
```
1. GET /api/tasks/timeline includes blocked_by arrays
2. Tasks with dependencies → both present in response
3. Drag reschedule → PUT /api/tasks/:id updates due_date
4. Zoom day → column width = 40px (CSS check)
5. Zoom week → column width changes
6. Progress bar reflects subtask completion ratio
7. Circular dependency → no infinite loop (render cap)
8. Tasks without dates excluded from timeline
```

### Task 3.2: Outbound Webhooks

**Spec ref:** Part 4, Tier 3 #13
**Effort:** Medium

**Database:**
- New table `webhooks` (id, user_id, name, url, events JSON, secret, active, created_at)

**Backend:**
- `src/routes/features.js` — 4 new endpoints:
  - `POST /api/webhooks` — Register webhook (URL, events, secret)
  - `GET /api/webhooks` — List user's webhooks
  - `PUT /api/webhooks/:id` — Update webhook
  - `DELETE /api/webhooks/:id` — Remove webhook
- `src/services/webhook.js` — New service:
  - `fireWebhook(userId, event, payload)` — POST to registered URLs
  - HMAC-SHA256 signature in `X-Webhook-Signature` header
  - Events: `task.created`, `task.completed`, `task.updated`, `task.deleted`, `habit.logged`
  - Fire-and-forget with 5s timeout, log failures

**Frontend:**
- Settings → Automations tab (or new Webhooks tab): CRUD UI for webhooks

**Tests:** 10-12 new
```
1. POST /api/webhooks → 201
2. Webhook fires on task.created event
3. Webhook fires on task.completed event
4. Webhook with invalid URL → validation error
5. HMAC signature present and correct
6. Disabled webhook → not fired
7. Webhook timeout → doesn't block API response
8. List webhooks → returns all user webhooks
9. Delete webhook → 200
10. User2 cannot access User1's webhooks
```

### Phase 3 Summary

| Task | New Tests | Files Changed |
|------|-----------|---------------|
| 3.1 Gantt V2 | 8 | app.js, styles.css |
| 3.2 Webhooks | 12 | features.js, webhook.js (new), db/index.js, app.js |
| **Total** | **~20** | |

---

## Phase 4 — Collaboration (Spec Tier 3 continued)

**Depends on:** Phase 1 (API tokens), Phase 2 (Web Push for assignment notifications)

### Task 4.1: Multi-User Task Assignment

**Spec ref:** Part 4, Tier 3 #11
**Effort:** Medium

**Current state:** `assigned_to` text field exists on tasks table. UI shows a text input. No real user references.

**Changes:**
- `src/db/index.js` — Add `assigned_to_user_id INTEGER REFERENCES users(id)` to tasks (migration)
- `src/routes/tasks.js` — On assign, verify target user exists on same instance. Send push notification to assignee.
- `public/app.js` — User picker dropdown (populated from instance users), assigned task badge, "Assigned to Me" filter in Today view

**Tests:** 8-10 new
```
1. Assign task to another user → 200
2. Assign to non-existent user → 400
3. Assigned task appears in assignee's task list
4. Assignee receives push notification
5. Unassign task → 200
6. Cannot assign task you don't own (unless admin)
7. Filter tasks by assigned_to_user_id
8. Assigned tasks show assignee name
```

### Task 4.2: AI BYOK (Bring Your Own Key)

**Spec ref:** Part 4, Tier 3 #12
**Effort:** Medium

**Changes:**
- `src/routes/features.js` — 2 new endpoints:
  - `POST /api/ai/suggest` — Task breakdown suggestions
  - `POST /api/ai/schedule` — Smart scheduling suggestions
- `src/services/ai.js` — New service:
  - Reads API key from user settings (encrypted with `AES-256-GCM`, key from env `AI_ENCRYPTION_KEY`)
  - Proxies to OpenAI/Anthropic API with structured prompts
  - Rate limit: 20 requests/hour per user
- Settings → General tab: API key input (encrypted storage), model selection

**Security:**
- API key encrypted at rest (never stored plaintext)
- Proxy all requests server-side (user's API key never exposed to browser)
- No data sent to AI provider without explicit user action

**Tests:** 8-10 new
```
1. Save API key → encrypted in settings
2. POST /api/ai/suggest without API key → 400
3. POST /api/ai/suggest with key → returns suggestions (mock external API)
4. API key not exposed in GET /api/settings
5. Rate limit enforced (20/hr)
6. Invalid API key → graceful error
7. AI service disabled when no key configured
```

### Phase 4 Summary

| Task | New Tests | Files Changed |
|------|-----------|---------------|
| 4.1 Multi-user assignment | 10 | tasks.js, db/index.js, app.js |
| 4.2 AI BYOK | 10 | features.js, ai.js (new), app.js |
| **Total** | **~20** | |

---

## Phase 5 — Ecosystem (Spec Tier 4)

**Depends on:** Phase 1 (API tokens), Phases 1-4 stable

### Task 5.1: CalDAV Calendar Sync

**Spec ref:** Part 4, Tier 4 #14
**Effort:** Large

### Task 5.2: TOTP 2FA

**Spec ref:** Part 4, Tier 4 #17
**Effort:** Medium

### Task 5.3: Sync Conflict Resolution

**Spec ref:** Part 4, Tier 4 #18
**Effort:** Large

### Task 5.4: Todoist/Trello Importer

**Spec ref:** Part 4, Tier 4 #16
**Effort:** Small

### Task 5.5: Telegram/WhatsApp Bot

**Spec ref:** Part 4, Tier 4 #15
**Effort:** Medium

> Phase 5 tasks are stretch goals. Each should get its own `agent.spec.md` when prioritized. Not detailed here.

---

## Review Checkpoint

Before implementation begins, verify:

- [ ] Phase 0 tasks are agreed (especially 0.1 FTS fix and 0.3 export fix — these are behavior changes)
- [ ] API token auth design reviewed (hashing strategy, rate limiting, CSRF bypass)
- [ ] Export/import schema change is backward-compatible (import with missing tables must succeed)
- [ ] Gantt V2 drag UX acceptable (last-write-wins for reschedule)
- [ ] Webhook security model approved (HMAC-SHA256, fire-and-forget, 5s timeout)
- [ ] AI BYOK encryption key management understood (separate env var)

---

## Execution Summary

| Phase | Tasks | New Tests | Priority |
|-------|-------|-----------|----------|
| **0: Test Gap Remediation** | 8 | ~43 | CRITICAL — do first |
| **1: Server Foundation** | 3 | ~21 | HIGH — unlocks everything |
| **2: Multi-Device Ready** | 2 | ~20 | HIGH — core value prop |
| **3: Gantt V2 + Webhooks** | 2 | ~20 | MEDIUM — power features |
| **4: Collaboration** | 2 | ~20 | MEDIUM — multi-user |
| **5: Ecosystem** | 5 | TBD | LOW — stretch goals |
| **Total (Phases 0-4)** | **17 tasks** | **~124 tests** | |

### Handoff

This plan is ready for the `implementer` agent. Recommended execution:

```
Phase 0 → commit + tag v0.4.1 (test remediation + bug fixes)
Phase 1 → commit + tag v0.5.0 (server foundation)
Phase 2 → commit + tag v0.6.0 (multi-device)
Phase 3 → commit + tag v0.7.0 (power features)
Phase 4 → commit + tag v0.8.0 (collaboration)
```

Each phase should run `npm test` with 0 failures before committing. Each phase updates `CLAUDE.md` metrics and `docs/openapi.yaml`.
