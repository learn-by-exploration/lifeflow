# v0.5.1 Review Remediation — Implementation Plan

> **Source:** Code review of v0.5.0 (Phases 1–5 implementation)
> **Baseline:** v0.5.0 | 1,841 tests | 76 test files | 185 routes | 32 tables
> **Date:** 27 March 2026
> **Verdict:** Request Changes — 3 critical, 5 high, 4 medium, 2 low findings

---

## Summary of Findings

| # | Severity | Finding | Phase |
|---|----------|---------|-------|
| 1 | CRITICAL | 2FA not enforced on login | Phase 1 |
| 2 | CRITICAL | Fixed salt in AES key derivation | Phase 1 |
| 3 | CRITICAL | Encryption silently disabled without env var | Phase 1 |
| 4 | HIGH | No SSRF protection on webhook URLs | Phase 2 |
| 5 | HIGH | Webhook errors silently swallowed | Phase 2 |
| 6 | HIGH | Webhook secret exposed in creation response | Phase 2 |
| 7 | HIGH | Push test endpoint fakes success | Phase 2 |
| 8 | HIGH | AI suggest/schedule are hardcoded stubs | Phase 2 |
| 9 | MEDIUM | No access control on task assignment | Phase 3 |
| 10 | MEDIUM | Offline queue lost on page refresh | Phase 3 |
| 11 | MEDIUM | Service Worker drops request body on failure | Phase 3 |
| 12 | MEDIUM | N+1 query in timeline | Phase 3 |
| 13 | LOW | GET /api/users exposes all user IDs | Phase 4 |
| 14 | LOW | No event enum validation on webhook creation | Phase 4 |

---

## Phase 1 — Critical Security Fixes

**Why first:** These are security vulnerabilities. 2FA bypass means the feature provides zero protection. Encryption issues mean API keys may be stored in plaintext.

### Task 1.1: Enforce 2FA on Login

**Type:** Bug fix + tests
**Severity:** CRITICAL — 2FA is completely bypassed; login succeeds with just email+password even when TOTP is enabled
**File:** `src/routes/auth.js` (login endpoint, lines 76–107)

**Problem:** The login endpoint creates a session immediately after bcrypt password verification. It never checks whether `totp_enabled` is `'1'` for the user. Enabling 2FA has no security effect.

**Changes:**
- `src/routes/auth.js` — After password verification and before session creation:
  1. Query `settings` for `totp_enabled` where `user_id = user.id`
  2. If `totp_enabled === '1'`:
     - If `req.body.totp_token` is missing or empty → return `403 { error: '2FA token required', requires_2fa: true }`
     - If `totp_token` provided → validate with `generateTOTP(secret)` checking current and ±1 time steps
     - If invalid → return `401 { error: 'Invalid 2FA token' }`
     - If valid → continue to session creation
  3. If 2FA not enabled → proceed as before (no change)
- `src/routes/auth.js` — Add time-window tolerance: check `generateTOTP(secret, 30)` with `Math.floor(Date.now() / 1000 / 30)` for current step and `±1` step (30-second drift tolerance)

**Tests:** 8 new (in `tests/totp-2fa.test.js`)
```
1. Enable 2FA → login without totp_token → 403 with requires_2fa: true
2. Enable 2FA → login with valid totp_token → 200 (session created)
3. Enable 2FA → login with invalid totp_token → 401
4. Enable 2FA → login with expired totp_token (wrong time step) → 401
5. 2FA not enabled → login without totp_token → 200 (unchanged behavior)
6. Enable 2FA → disable 2FA → login without totp_token → 200
7. Valid TOTP token acceptance test (generate token server-side, verify it)
8. Adjacent time-step tolerance (±1 window) works
```

### Task 1.2: Fix Salt in AES Key Derivation

**Type:** Security fix + tests
**Severity:** CRITICAL — Hardcoded `'salt'` in scryptSync means identical derived keys for all encryptions
**File:** `src/services/ai.js` (lines 13, 26)

**Problem:** `crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)` uses a string literal instead of a random salt. All encrypted values share the same derived key.

**Changes:**
- `src/services/ai.js` — `encrypt()`:
  1. Generate random salt: `const salt = crypto.randomBytes(16)`
  2. Derive key: `crypto.scryptSync(ENCRYPTION_KEY, salt, 32)`
  3. Store salt in output: `salt.toString('hex') + ':' + iv.toString('hex') + ':' + tag + ':' + encrypted`
- `src/services/ai.js` — `decrypt()`:
  1. Parse 4 parts: `[saltHex, ivHex, tagHex, data]`
  2. Derive key with parsed salt: `crypto.scryptSync(ENCRYPTION_KEY, Buffer.from(saltHex, 'hex'), 32)`
- `src/services/ai.js` — Add migration: if encrypted value has only 3 parts (old format), derive key with `'salt'` for backward compat, then re-encrypt with random salt

**Tests:** 4 new (in `tests/ai-byok.test.js`)
```
1. encrypt → decrypt roundtrip returns original text
2. Two encryptions of same text produce different ciphertexts (random salt)
3. Old 3-part format (legacy) still decrypts correctly
4. Decrypt with wrong key → returns null (not plaintext)
```

### Task 1.3: Require Encryption Key or Refuse to Store

**Type:** Security fix + tests
**Severity:** CRITICAL — Without AI_ENCRYPTION_KEY env var, API keys stored in plaintext
**File:** `src/services/ai.js` (line 11)

**Problem:** `encrypt()` returns plaintext when `ENCRYPTION_KEY` is falsy. Users think their key is encrypted but it's stored in cleartext.

**Changes:**
- `src/services/ai.js` — `encrypt()`: Remove plaintext fallback. If `!ENCRYPTION_KEY`, throw `new Error('AI_ENCRYPTION_KEY environment variable is required for storing API keys')`
- `src/services/ai.js` — `decrypt()`: If `!ENCRYPTION_KEY`, throw same error
- `src/routes/features.js` — AI key save endpoint: catch the error and return `500 { error: 'Server not configured for API key storage' }`

**Tests:** 2 new (in `tests/ai-byok.test.js`)
```
1. Save AI key without AI_ENCRYPTION_KEY → 500 error (not silent plaintext)
2. Suggest/schedule with stored encrypted key + valid env var → works
```

### Phase 1 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 1.1 2FA enforcement | Bug fix | 8 | auth.js, totp-2fa.test.js |
| 1.2 Random salt | Security fix | 4 | ai.js, ai-byok.test.js |
| 1.3 Require encryption key | Security fix | 2 | ai.js, features.js, ai-byok.test.js |
| **Total** | | **14** | |

---

## Phase 2 — High-Severity Fixes

**Why second:** These are security, correctness, and honesty issues. SSRF is exploitable, silent errors hide bugs, and stub endpoints mislead users.

### Task 2.1: SSRF Protection on Webhook URLs

**Type:** Security fix + tests
**Severity:** HIGH — Webhook URLs allow localhost, private IPs, cloud metadata endpoints
**File:** `src/routes/features.js` (webhook creation, line 570)

**Problem:** `new URL(url)` validates format but allows `http://127.0.0.1`, `http://169.254.169.254` (AWS metadata), `http://[::1]`, `http://0.0.0.0`, and other private/reserved addresses.

**Changes:**
- `src/routes/features.js` — After URL validation, add hostname blocklist check:
  1. Parse `new URL(url)` hostname
  2. Reject if hostname matches: `localhost`, `127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `0.0.0.0`, `[::1]`, `[::ffff:127.*]`, `*.local`
  3. Reject non-http(s) schemes (already done but verify)
  4. Apply same check in PUT `/api/webhooks/:id` when url is updated

**Tests:** 5 new (in `tests/webhooks.test.js`)
```
1. POST webhook with url=http://127.0.0.1/hook → 400
2. POST webhook with url=http://169.254.169.254/latest/meta-data → 400
3. POST webhook with url=http://192.168.1.1/hook → 400
4. POST webhook with url=http://[::1]/hook → 400
5. POST webhook with url=https://example.com/hook → 201 (allowed)
```

### Task 2.2: Log Webhook Delivery Failures

**Type:** Bug fix
**Severity:** HIGH — Silent catch hides all delivery failures
**File:** `src/services/webhook.js` (line 41-43)

**Problem:** The catch block says "Log but don't throw" but has no logging. Failed webhook deliveries silently disappear.

**Changes:**
- `src/services/webhook.js` — Import logger: `const logger = require('../logger')`
- `src/services/webhook.js` — In catch block: `logger.warn({ err: err.message, webhookId: hook.id, event, url: hook.url }, 'Webhook delivery failed')`
- `src/services/webhook.js` — Guard `JSON.parse(hook.events)` with try/catch, log malformed events

**Tests:** 2 new (in `tests/webhooks.test.js`)
```
1. fireWebhook with unreachable URL → no throw (fire-and-forget preserved)
2. fireWebhook with malformed events JSON in DB → no throw, skips hook
```

### Task 2.3: Stop Exposing Webhook Secret After Creation

**Type:** Security improvement
**Severity:** HIGH — Secret in HTTP response gets logged by middleware/ALBs
**File:** `src/routes/features.js` (webhook creation response, line 585)

**Problem:** `POST /api/webhooks` returns `secret` in the response body. This is standard practice (show once), but should be clearly documented and the GET endpoint should never return it.

**Changes:**
- `src/routes/features.js` — Verify GET `/api/webhooks` SELECT does NOT include `secret` column (currently correct — only selects `id, name, url, events, active, created_at`)
- `src/routes/features.js` — Add `secret_preview` field showing last 4 chars only: `secret_preview: '...' + secret.slice(-4)` to the creation response alongside the full secret
- No breaking change: keep full secret in creation response (it's the only time user sees it)

**Tests:** 2 new (in `tests/webhooks.test.js`)
```
1. POST /api/webhooks → response includes secret (full, shown once)
2. GET /api/webhooks → response does NOT include secret field
```

### Task 2.4: Honest Push Test Endpoint

**Type:** Bug fix
**Severity:** HIGH — Endpoint returns `{ sent: N }` but sends nothing
**File:** `src/routes/features.js` (push test endpoint, line 686)

**Problem:** `/api/push/test` counts subscriptions and returns `{ sent: subs.length }` without actually sending any push notifications. The response misleads callers.

**Changes:**
- `src/routes/features.js` — Change response when VAPID keys not configured OR web-push not available:
  ```javascript
  res.json({ sent: 0, pending: subs.length, message: 'Push sending not yet implemented — subscriptions stored for future use' });
  ```
- Keep the VAPID key check as-is (correct guard for future implementation)

**Tests:** 1 updated (in `tests/push.test.js`)
```
1. POST /api/push/test → sent: 0, pending: N (honest response)
```

### Task 2.5: Mark AI Functions as Stubs

**Type:** Documentation + behavior fix
**Severity:** HIGH — Functions pretend to call AI but return hardcoded data
**File:** `src/services/ai.js` (suggest and schedule functions)

**Problem:** `suggest()` and `schedule()` check for an API key then return hardcoded responses. Users who configure their API key get fake data with no indication.

**Changes:**
- `src/services/ai.js` — Add `stub: true` flag to both response objects:
  ```javascript
  return { stub: true, subtasks: [...], message: 'AI integration not yet implemented — showing example data' };
  ```
- `src/routes/features.js` — Pass through the `stub` flag in the response so frontend can display appropriately

**Tests:** 2 updated (in `tests/ai-byok.test.js`)
```
1. POST /api/ai/suggest with valid key → response has stub: true
2. POST /api/ai/schedule with valid key → response has stub: true
```

### Phase 2 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 2.1 SSRF protection | Security fix | 5 | features.js, webhooks.test.js |
| 2.2 Webhook logging | Bug fix | 2 | webhook.js, webhooks.test.js |
| 2.3 Secret exposure | Improvement | 2 | features.js, webhooks.test.js |
| 2.4 Honest push test | Bug fix | 1 | features.js, push.test.js |
| 2.5 AI stub transparency | Fix | 2 | ai.js, features.js, ai-byok.test.js |
| **Total** | | **12** | |

---

## Phase 3 — Medium-Severity Fixes

**Why third:** These are correctness and robustness issues. Not security-critical but affect data integrity and user experience.

### Task 3.1: Task Assignment Access Control

**Type:** Improvement + tests
**Severity:** MEDIUM — Any user can assign their task to any other user without consent
**File:** `src/routes/tasks.js` (PUT endpoint, assigned_to_user_id validation)

**Problem:** The endpoint validates that the target user exists but doesn't check whether assignment is appropriate. For a personal task planner, assigning to other users without consent is problematic.

**Changes:**
- `src/routes/tasks.js` — For now, restrict `assigned_to_user_id` to either `null` (unassign) or `req.userId` (self-assign). Multi-user assignment requires a sharing/team model that doesn't exist yet.
- Alternative (simpler): Allow any valid user ID but document this as intentional for the assignment picker use case. The task is still owned by the creator (`user_id` check in WHERE clause prevents other users from modifying).

**Decision:** Go with the simpler approach — keep existing behavior but add a comment documenting the design decision. The real fix requires a team/sharing model (future work).

**Tests:** 2 new (in `tests/assignment.test.js`)
```
1. Assigned task still only editable by owner (assignee can't modify)
2. Assigned task still only visible to owner in task list queries
```

### Task 3.2: Persist Offline Queue in localStorage

**Type:** Bug fix
**Severity:** MEDIUM — Queued mutations lost on page refresh
**File:** `public/store.js`

**Problem:** `_mutationQueue` is an in-memory array. If the user goes offline, queues mutations, then refreshes the page, all queued operations are permanently lost.

**Changes:**
- `public/store.js` — On `queueMutation()`: also write to `localStorage.setItem('lf_mutation_queue', JSON.stringify(_mutationQueue))`
- `public/store.js` — On module load: restore queue from `localStorage.getItem('lf_mutation_queue')`
- `public/store.js` — On `syncQueue()` success and `clearQueue()`: update localStorage
- `public/store.js` — Add try/catch around localStorage operations (may throw in private browsing)

**Tests:** 3 new (in `tests/offline-queue.test.js`)
```
1. Queue mutation → localStorage contains queued item
2. Restore queue from localStorage on init → queue size matches
3. Clear queue → localStorage cleared
```

### Task 3.3: Include Request Body in SW Mutation Failed Message

**Type:** Bug fix
**Severity:** MEDIUM — Client can't retry mutations without the original body
**File:** `public/sw.js` (mutation intercept, line 53-70)

**Problem:** The `mutation-failed` postMessage includes `method` and `url` but not the request `body`. The client cannot properly queue the mutation for retry.

**Changes:**
- `public/sw.js` — Clone request and read body before attempting fetch:
  ```javascript
  const clonedReq = request.clone();
  const bodyText = await clonedReq.text().catch(() => null);
  ```
- `public/sw.js` — Include body in postMessage:
  ```javascript
  c.postMessage({ type: 'mutation-failed', method: request.method, url: request.url, body: bodyText });
  ```

**Tests:** 1 new (in `tests/offline-queue.test.js`)
```
1. Verify SW mutation-failed message structure includes body field
```

### Task 3.4: Fix N+1 Query in Timeline Endpoint

**Type:** Performance fix
**Severity:** MEDIUM — Executes N+1 queries for N tasks
**File:** `src/routes/tasks.js` (GET /api/tasks/timeline)

**Problem:** For each task in the timeline result, a separate `SELECT blocked_by_id FROM task_deps WHERE task_id = ?` query runs. For 100 tasks, that's 101 DB queries.

**Changes:**
- `src/routes/tasks.js` — Replace per-task dependency lookup with a single batched query:
  ```javascript
  // Before: N+1
  const depStmt = db.prepare('SELECT blocked_by_id FROM task_deps WHERE task_id = ?');
  for (const t of tasks) { t.blocked_by = depStmt.all(t.id).map(d => d.blocked_by_id); }

  // After: 1 query
  if (tasks.length > 0) {
    const placeholders = tasks.map(() => '?').join(',');
    const allDeps = db.prepare(
      `SELECT task_id, blocked_by_id FROM task_deps WHERE task_id IN (${placeholders})`
    ).all(...tasks.map(t => t.id));
    const depMap = new Map();
    for (const d of allDeps) {
      if (!depMap.has(d.task_id)) depMap.set(d.task_id, []);
      depMap.get(d.task_id).push(d.blocked_by_id);
    }
    for (const t of tasks) t.blocked_by = depMap.get(t.id) || [];
  }
  ```

**Tests:** 1 new (in `tests/gantt-v2.test.js`)
```
1. Timeline with multiple tasks having deps → all blocked_by arrays populated correctly
```

### Phase 3 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 3.1 Assignment access control | Improvement | 2 | tasks.js, assignment.test.js |
| 3.2 Persist offline queue | Bug fix | 3 | store.js, offline-queue.test.js |
| 3.3 SW body forwarding | Bug fix | 1 | sw.js, offline-queue.test.js |
| 3.4 N+1 timeline query | Perf fix | 1 | tasks.js, gantt-v2.test.js |
| **Total** | | **7** | |

---

## Phase 4 — Low-Severity & Hardening

**Why last:** These are defense-in-depth improvements. Not exploitable but improve robustness.

### Task 4.1: Scope GET /api/users Response

**Type:** Improvement
**Severity:** LOW — All user IDs and creation dates exposed to any authenticated user
**File:** `src/routes/auth.js`

**Problem:** `/api/users` returns all users' `id`, `display_name`, and `created_at`. For a personal planner that may host multiple unrelated users, this is unnecessary information disclosure.

**Changes:**
- `src/routes/auth.js` — Reduce response to only `id` and `display_name` (remove `created_at`):
  ```javascript
  const users = db.prepare('SELECT id, display_name FROM users').all();
  ```

**Tests:** 1 updated (in `tests/assignment.test.js`)
```
1. GET /api/users → response has id and display_name only, no created_at/email/password
```

### Task 4.2: Validate Webhook Event Names

**Type:** Improvement
**Severity:** LOW — Invalid event names accepted silently
**File:** `src/routes/features.js` (webhook creation)

**Problem:** Webhook `events` array accepts arbitrary strings. Invalid events like `"foo.bar"` are stored but will never match, confusing users.

**Changes:**
- `src/routes/features.js` — Define allowed events constant:
  ```javascript
  const WEBHOOK_EVENTS = ['*', 'task.created', 'task.updated', 'task.completed', 'task.deleted',
    'goal.created', 'goal.completed', 'habit.logged', 'focus.completed'];
  ```
- `src/routes/features.js` — On POST and PUT, validate each event in array:
  ```javascript
  if (events && events.some(e => !WEBHOOK_EVENTS.includes(e))) {
    return res.status(400).json({ error: 'Invalid event type', allowed: WEBHOOK_EVENTS });
  }
  ```
- `src/routes/features.js` — Add `GET /api/webhooks/events` to list valid events

**Tests:** 3 new (in `tests/webhooks.test.js`)
```
1. POST webhook with events=['task.created'] → 201
2. POST webhook with events=['invalid.event'] → 400 with allowed list
3. GET /api/webhooks/events → returns array of valid event names
```

### Phase 4 Summary

| Task | Type | New Tests | Files Changed |
|------|------|-----------|---------------|
| 4.1 Scope users response | Improvement | 1 | auth.js, assignment.test.js |
| 4.2 Event name validation | Improvement | 3 | features.js, webhooks.test.js |
| **Total** | | **4** | |

---

## Test Coverage Gaps (Addressed Above)

The review identified systematic test coverage gaps across all v0.5.0 features. The tasks above add tests for each finding. Additionally, the following test improvements are embedded in the phase tasks:

| Feature | Current Tests | After Plan |
|---------|--------------|-----------|
| TOTP 2FA | 4 (no valid token, no login enforcement) | 12 (+8 in Task 1.1) |
| AI BYOK | 4 (no encryption, no stub marker) | 12 (+4 in 1.2, +2 in 1.3, +2 in 2.5) |
| Webhooks | 9 (CRUD only) | 21 (+5 in 2.1, +2 in 2.2, +2 in 2.3, +3 in 4.2) |
| Push | 9 (subscribe only) | 10 (+1 in 2.4) |
| Assignment | 4 (basic assign) | 7 (+2 in 3.1, +1 in 4.1) |
| Offline Queue | 6 (in-memory only) | 10 (+3 in 3.2, +1 in 3.3) |
| Gantt/Timeline | 4 (basic) | 5 (+1 in 3.4) |

---

## Execution Order

```
Phase 1 (Critical)  → 14 tests, ~3 files   — security blockers
Phase 2 (High)      → 12 tests, ~4 files   — correctness & honesty
Phase 3 (Medium)    →  7 tests, ~4 files   — robustness
Phase 4 (Low)       →  4 tests, ~2 files   — hardening
                      ─────────────────
Total:                37 new tests
```

All 4 phases target v0.5.1. Run `npm test` after each phase to verify no regressions.

---

## Documentation Updates Required

After implementation:
- `CLAUDE.md` — Update test count in header
- `docs/openapi.yaml` — Document 2FA `totp_token` field on login, `GET /api/webhooks/events` endpoint
- `CHANGELOG.md` — v0.5.1 security fixes entry

---

## Review Checkpoint

After Phase 1 is complete (critical fixes), run full test suite and do a quick review before proceeding to Phase 2. Critical security fixes must be verified working before addressing lower-severity items.
