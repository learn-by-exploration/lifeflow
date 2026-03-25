# LifeFlow Security Remediation — Implementation Plan

> **Source:** [SECURITY-HACKATHON-2026-03-25.md](SECURITY-HACKATHON-2026-03-25.md) (115 findings)
> **Date:** 25 March 2026
> **Base:** v0.2.1 (commit `726495c`)
> **Target:** v0.3.0

---

## Team

| Role | Responsibility |
|------|---------------|
| **PM** | Sprint planning, prioritization, stakeholder communication, acceptance sign-off, risk tracking |
| **Architect** | Solution design, technical specs, code review, pattern enforcement, test strategy |
| **Coder** | Implementation, unit tests, integration tests, bug fixes |

---

## Sprint Overview

| Sprint | Duration | Theme | Findings | Risk Reduction |
|--------|----------|-------|----------|----------------|
| **S1** | 3 days | Critical Exploits — IDOR, XSS, CSRF | 12 findings | Blocks data breach |
| **S2** | 3 days | Auth Hardening — Timing, Sessions, Rate Limits | 12 findings | Blocks account takeover |
| **S3** | 3 days | Input Validation & Business Logic | 14 findings | Blocks DoS + data corruption |
| **S4** | 3 days | Database Schema & Migrations | 16 findings | Blocks data loss + perf issues |
| **S5** | 2 days | Service Worker & Client Hardening | 10 findings | Blocks cache poisoning + phishing |
| **S6** | 5 days | Compliance & Infrastructure | 11 findings | GDPR, audit trail, HSTS |
| **Backlog** | — | Low-priority hardening | 40 findings | Defense-in-depth |

**Total active sprints:** ~19 days → ~4 weeks with testing/review buffer

---

## Sprint 1 — Critical Exploits (Days 1–3)

> **Goal:** Eliminate all paths to immediate data breach, XSS, and cross-site forgery.

### PM Tasks
- [ ] Create GitHub milestone `v0.3.0-S1-critical-exploits`
- [ ] Create issues for each task below with `critical` + `security` labels
- [ ] Define "done": all 1101 existing tests pass + new tests for each fix
- [ ] Risk: CSRF implementation touches every API call — plan for regression

### Architect Tasks

**A1.1 — Design IDOR Fix Pattern**
- Findings: #40, #41, #42, #48
- Design a reusable `verifyOwnership(table, id, userId)` helper in `src/helpers.js`
- Spec: SQL pattern `SELECT 1 FROM {table} WHERE id=? AND user_id=?`
- Review: ensure all 4 IDOR routes call verifyOwnership before mutation
- Files: `src/helpers.js`, `src/routes/tasks.js`, `src/routes/features.js`, `src/routes/productivity.js`

**A1.2 — Design CSRF Protection**
- Findings: #4, #80
- Pattern: Double-Submit Cookie — server sets `csrf_token` cookie, client sends it as `X-CSRF-Token` header
- Spec: middleware in `src/middleware/csrf.js` validates token on all POST/PUT/PATCH/DELETE
- Client: `public/app.js` reads cookie and adds header to all `api.post/put/delete` calls
- Files: new `src/middleware/csrf.js`, `src/server.js`, `public/app.js`

**A1.3 — Design XSS Fix Strategy**
- Findings: #76, #77, #78, #81
- Audit every `innerHTML` assignment in `public/app.js`
- Pattern: all template variables MUST use `esc()` or `escA()` — no exceptions
- Markdown: escape code block content, validate link URIs (reject non-http(s))
- Color validation: server-side regex `/^#[0-9A-Fa-f]{3,6}$/` on all color fields

### Coder Tasks

**C1.1 — Fix IDOR: Goal Ownership Checks** (2h)
- [ ] Add `verifyGoalOwnership(goalId, userId)` to `src/helpers.js`
- [ ] `src/routes/tasks.js:369-376` — `/api/tasks/:id/move`: verify target goal_id
- [ ] `src/routes/tasks.js:200-207` — `/api/tasks/bulk`: verify goal_id in bulk update
- [ ] `src/routes/features.js:130-132` — `/api/templates/:id/apply`: verify goal_id
- [ ] `src/routes/productivity.js:60-62` — inbox triage: verify goal_id
- [ ] Write tests: attempt move/bulk/apply/triage with other user's goal → expect 403

**C1.2 — Fix XSS: innerHTML Escaping** (3h)
- [ ] `public/app.js:~200` (buildSwatches) — escape color values with `escA()`
- [ ] `public/app.js:2384-2388` — escape code block content in markdown renderer
- [ ] `public/app.js:2389` — validate markdown link URLs, reject `javascript:` URIs
- [ ] Add server-side color validation in goal/area create+update routes
- [ ] Write tests: inject `<script>` via color field, code block, markdown link → expect escaped output

**C1.3 — Implement CSRF Protection** (4h)
- [ ] Create `src/middleware/csrf.js` — generate token, validate on state-changing requests
- [ ] Register middleware in `src/server.js` after session middleware
- [ ] Update `public/app.js` fetch wrapper to include `X-CSRF-Token` header
- [ ] Update `public/login.html` form to include CSRF token
- [ ] Write tests: POST without CSRF token → 403, POST with valid token → success

**C1.4 — Fix Shared List Write Access** (1h)
- Findings: #43
- [ ] `src/routes/lists.js:232-262` — require write-permission check on public shared list mutations
- [ ] Write test: attempt unauthorized write on shared list → expect 403

### Acceptance Criteria
- All IDOR tests prove cross-user access is blocked (403 response)
- XSS payloads in color, code blocks, and markdown links render as text, not HTML
- All POST/PUT/DELETE without CSRF token return 403
- 1101+ existing tests still pass
- Architect reviews all PRs before merge

---

## Sprint 2 — Auth Hardening (Days 4–6)

> **Goal:** Eliminate timing attacks, strengthen sessions, add rate limiting.

### PM Tasks
- [ ] Create milestone `v0.3.0-S2-auth-hardening`
- [ ] Risk: session binding (IP+UA) may break legitimate mobile/VPN users — plan fallback
- [ ] Risk: account lockout may be used for DoS against specific emails

### Architect Tasks

**A2.1 — Design Timing Attack Mitigation**
- Findings: #2, #3
- Pattern: always call `bcrypt.compareSync(password, DUMMY_HASH)` when user not found
- Define `DUMMY_HASH` as a pre-computed bcrypt hash stored as constant (not a real password)
- Files: `src/routes/auth.js`, `src/middleware/auth.js`

**A2.2 — Design Session Security**
- Findings: #5, #9
- Session binding: store `ip_hash` + `ua_hash` in sessions table, validate each request
- Password change: invalidate ALL sessions (including current), force re-login
- Add columns: `ip_hash TEXT`, `ua_hash TEXT` to sessions table
- Files: `src/middleware/auth.js`, `src/routes/auth.js`, `src/db/index.js`

**A2.3 — Design Rate Limiting & Lockout**
- Findings: #6, #7
- Per-user lockout: new table `login_attempts(email, attempts, locked_until)`
- After 5 failures within 15min → lock for 15min, returns same error as invalid password
- Rate limit `/api/auth/change-password`: max 5 per 24h per user
- Files: `src/routes/auth.js`, `src/db/index.js`, `src/server.js`

**A2.4 — Design Account Enumeration Fix**
- Findings: #1
- Register endpoint: always return 201 with generic message regardless of email existence
- Only send confirmation email if new (email verification is Sprint 6)
- Files: `src/routes/auth.js`

### Coder Tasks

**C2.1 — Fix Timing Attacks** (1h)
- [ ] Define `DUMMY_HASH` constant in `src/routes/auth.js`
- [ ] `src/routes/auth.js:72` — when `!user`, compare against DUMMY_HASH instead of skipping bcrypt
- [ ] `src/middleware/auth.js:77` — same pattern in requirePassword
- [ ] Write tests: measure response time for valid vs invalid email — expect similar (+/- 50ms)

**C2.2 — Implement Session Binding** (2h)
- [ ] Add `ip_hash`, `ua_hash` columns to sessions table migration
- [ ] `src/middleware/auth.js:23-40` — hash IP+UA on session create, validate on each request
- [ ] On mismatch → destroy session, return 401
- [ ] Write tests: session with different IP → 401, same IP → pass

**C2.3 — Fix Password Change Session Handling** (1h)
- [ ] `src/routes/auth.js:127` — after password change, invalidate ALL sessions (including current)
- [ ] Return response instructing client to redirect to login
- [ ] Write tests: change password → old session invalid, must re-login

**C2.4 — Implement Rate Limiting & Lockout** (3h)
- [ ] Apply `authLimiter` to `/api/auth/change-password` in `src/server.js`
- [ ] Create `login_attempts` table in `src/db/index.js`
- [ ] Track per-email failures in `src/routes/auth.js:60-90`
- [ ] After 5 failures → lock for 15min, return same error as invalid password
- [ ] Write tests: 6 failed logins → 6th returns locked error, unlock after 15min

**C2.5 — Fix Account Enumeration** (30min)
- [ ] `src/routes/auth.js:34-35` — return identical 201 response for existing and new emails
- [ ] Write test: register existing email → 201 (not 409)

### Acceptance Criteria
- Timing test: <50ms variance between valid/invalid email responses
- Session with mismatched IP/UA returns 401
- Password change forces re-login on all devices
- 6th failed login returns lockout, works again after 15min
- Registration returns 201 regardless of email existence
- All existing tests pass

---

## Sprint 3 — Input Validation & Business Logic (Days 7–9)

> **Goal:** Fix all input validation gaps, DoS vectors, and business logic bugs.

### PM Tasks
- [ ] Create milestone `v0.3.0-S3-validation`
- [ ] Risk: NLP input limit may truncate legitimate long task descriptions — decide 500 vs 1000 char limit
- [ ] Risk: month-end recurrence change may alter existing schedules — plan data migration

### Architect Tasks

**A3.1 — Design Input Validation Layer**
- Findings: #44, #45, #51, #52, #116, #126, #127
- Pattern: create `src/middleware/validate.js` with reusable validators
- Validators: `maxLength(n)`, `isHHMM()`, `isPositiveInt()`, `jsonSchema(schema)`, `colorHex()`
- Apply at route level as middleware
- Files: new `src/middleware/validate.js`, all route files

**A3.2 — Design Recurrence Fix**
- Findings: #117, #118, #120, #121
- Month-end: clamp day to `Math.min(originalDay, daysInMonth(newMonth))`
- Timezone: use `_toDateStr()` consistently (already exists from v0.2.1 fix)
- Infinite loop guard: max 8 iterations in specific-days loop
- Null due date: don't spawn task if nextDueDate returns null
- Files: `src/helpers.js`, `src/routes/tasks.js`, `src/routes/features.js`

**A3.3 — Design DoS Mitigations**
- Findings: #46, #47, #85
- Focus insights: add `WHERE date >= date('now', '-365 days')` clause
- List duplication: cap at 500 items per list, rate limit to 5 duplications/hour
- File import: 10MB client-side limit, 10MB server-side `express.json({ limit })` per route
- Files: `src/routes/stats.js`, `src/routes/lists.js`, `src/routes/data.js`, `public/app.js`

### Coder Tasks

**C3.1 — Create Validation Middleware** (2h)
- [ ] Create `src/middleware/validate.js` with reusable validators
- [ ] `maxLength(field, n)` — truncate/reject strings over limit
- [ ] `isHHMM(field)` — validate time format
- [ ] `isPositiveInt(field)` — reject negative numbers
- [ ] `jsonSchema(field, schema)` — validate JSON structure
- [ ] Write unit tests for each validator

**C3.2 — Apply Input Validation to Routes** (2h)
- [ ] `src/routes/tasks.js:35` — NLP parse: limit input to 500 chars (#116)
- [ ] `src/routes/tasks.js:64-75` — time_block: validate HH:MM format (#51)
- [ ] `src/routes/tasks.js:310` — actual_minutes: validate >= 0 (#126)
- [ ] `src/routes/stats.js:190-194` — rating: validate integer 1-5 (#52)
- [ ] `src/routes/stats.js:165-175` — steps_completed: validate <= steps_planned (#127)
- [ ] `src/routes/productivity.js:7-18` — rules: validate JSON schema (#44)
- [ ] `src/routes/tasks.js:282-303` — recurrence: validate schema (#45)
- [ ] Write tests for each validation: invalid input → 400 with message

**C3.3 — Fix Recurrence Bugs** (3h)
- [ ] `src/helpers.js:60-85` — month-end: clamp to last day of month (#117)
- [ ] `src/helpers.js:73-79` — specific-days: add max 8 iteration guard (#120)
- [ ] `src/routes/tasks.js:245` — don't spawn task if nextDueDate is null (#121)
- [ ] `src/routes/features.js:280-320` — habit streaks: use `_toDateStr()` for consistency (#118)
- [ ] `src/routes/tasks.js:294-303` — copy time_block, list_id, estimated_minutes on recurrence (#53)
- [ ] Write tests: Jan 31 monthly → Feb 28, all-7-days recurrence terminates, null end date

**C3.4 — Fix DoS Vectors** (1.5h)
- [ ] `src/routes/stats.js:216-240` — add 365-day limit to focus insights query (#46)
- [ ] `src/routes/lists.js:223-237` — rate limit duplications, cap item count (#47)
- [ ] `src/routes/data.js` — add `express.json({ limit: '10mb' })` to import route (#85)
- [ ] `public/app.js:3980-4010` — add client-side 10MB file size check (#85)
- [ ] Write tests: oversized input → 413, unbounded query returns bounded results

**C3.5 — Fix Miscellaneous Logic** (1h)
- [ ] `src/routes/features.js:168-180` — habit log idempotency: UPSERT with UNIQUE(habit_id, date) (#122)
- [ ] `src/routes/features.js:190` — weekly review: respect weekStart setting (#123)
- [ ] `src/routes/stats.js:95-110` — focus session: verify task exists + ownership (#125)
- [ ] Write tests for each

### Acceptance Criteria
- NLP parse with 50K chars → 400 error (not server hang)
- Jan 31 + monthly recurrence → Feb 28 (not Mar 2)
- Habit log double-submit → single record
- Focus insights query with 10K sessions completes in <100ms
- All input validation rejects bad data with clear error messages
- All existing tests pass

---

## Sprint 4 — Database Schema & Migrations (Days 10–12)

> **Goal:** Fix schema integrity issues, add missing indexes, make migrations safe.

### PM Tasks
- [ ] Create milestone `v0.3.0-S4-database`
- [ ] Risk: schema changes require migration — plan for zero-downtime with WAL mode
- [ ] Risk: index creation on large tables may briefly lock — schedule during low-traffic

### Architect Tasks

**A4.1 — Design Migration Safety**
- Findings: #152, #153
- Pattern: wrap ALL ALTER/DROP/CREATE sequences in `db.transaction()`
- Error handling: check error message before ignoring (only ignore "column already exists" / "table already exists")
- Files: `src/db/index.js`

**A4.2 — Design Index Strategy**
- Findings: #155–#164
- List all needed indexes with expected query patterns
- Prioritize by query frequency (tasks.priority, focus_sessions.task_id first)
- Create single migration function that adds all missing indexes idempotently
- Files: `src/db/index.js`

**A4.3 — Design Schema Fixes**
- Findings: #49, #50, #119, #124, #151, #154
- Tag uniqueness: `UNIQUE(user_id, name)` → requires migration from `UNIQUE(name)`
- List self-reference: `CHECK(parent_id != id)` constraint
- Position race: use `getNextPosition()` in all INSERT paths, add gap-based ordering
- Transaction wrapping: recurring spawn + reorder
- Files: `src/db/index.js`, `src/helpers.js`, `src/routes/tasks.js`

### Coder Tasks

**C4.1 — Fix Migration Safety** (2h)
- [ ] `src/db/index.js:213-220` — wrap settings migration in transaction (#152)
- [ ] `src/db/index.js:163-175` — check error message before ignoring ALTER errors (#153)
- [ ] Pattern: `if (!err.message.includes('duplicate column')) throw err;`
- [ ] Write tests: simulate migration failure → verify rollback

**C4.2 — Add Missing Indexes** (1.5h)
- [ ] `src/db/index.js` — add indexes in idempotent migration:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
  CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id);
  CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_id);
  CREATE INDEX IF NOT EXISTS idx_lists_area ON lists(area_id);
  CREATE INDEX IF NOT EXISTS idx_notes_goal ON notes(goal_id);
  CREATE INDEX IF NOT EXISTS idx_weekly_reviews_week ON weekly_reviews(week_start);
  CREATE INDEX IF NOT EXISTS idx_habit_logs_composite ON habit_logs(habit_id, log_date);
  ```
- [ ] Write test: verify all indexes exist after migration

**C4.3 — Fix Schema Constraints** (2h)
- [ ] Tag uniqueness: drop and recreate as `UNIQUE(user_id, name)` (#49)
- [ ] List self-reference: add `CHECK(parent_id IS NULL OR parent_id != id)` (#151)
- [ ] Position default: ensure all task INSERT paths call `getNextPosition()` (#154)
- [ ] Write tests: self-referencing list → error, duplicate user+tag name → error

**C4.4 — Add Transaction Wrapping** (2h)
- [ ] `src/routes/tasks.js:282-310` — wrap recurring spawn in `db.transaction()` (#50)
- [ ] `src/routes/tasks.js:180-210` — wrap reorder in `db.transaction()` (#124)
- [ ] `src/helpers.js:31-35` — make `getNextPosition()` use `MAX(position)+1` atomically (#119)
- [ ] Write tests: simulate failure mid-reorder → verify positions unchanged

### Acceptance Criteria
- Migration failure rolls back cleanly — no partial state
- All 10 indexes exist after fresh DB init
- Duplicate user+tag name raises constraint error
- Self-referencing list parent raises constraint error
- Reorder failure leaves positions unchanged
- Query performance: goal list, task by priority, focus sessions — all <10ms
- All existing tests pass

---

## Sprint 5 — Service Worker & Client Hardening (Days 13–14)

> **Goal:** Fix cache poisoning, open redirect, and client-side memory issues.

### PM Tasks
- [ ] Create milestone `v0.3.0-S5-client`
- [ ] Risk: SW changes require cache bust — plan user-facing "update available" prompt
- [ ] Coordinate with S1 XSS fixes for holistic frontend security

### Architect Tasks

**A5.1 — Design SW Security Model**
- Findings: #79/#165, #82/#166, #83, #167, #168
- Cache strategy: only cache `response.ok`, add 24h TTL via header
- Push notification: validate URL is relative path or matches `self.location.origin`
- Version: use build-time hash for CACHE_VERSION, prompt refresh on update
- Files: `public/sw.js`

**A5.2 — Design Client Memory Management**
- Findings: #84, #86, #169, #170, #171
- Prototype pollution: freeze settings object after load, validate keys against whitelist
- Memory leaks: implement event listener cleanup pattern via `AbortController`
- Store.js: return deep copies from `getAll()`, add cleanup for empty listener arrays
- Files: `public/app.js`, `public/store.js`

### Coder Tasks

**C5.1 — Fix Service Worker** (3h)
- [ ] `public/sw.js:36-48` — only cache `response.ok` responses (#82/#166)
- [ ] `public/sw.js:108-111` — validate push notification URL against origin (#79/#165)
- [ ] `public/sw.js:18-20` — replace `skipWaiting()` with client-prompted refresh (#167)
- [ ] `public/sw.js:2` — generate CACHE_VERSION from build hash (or date-based) (#168)
- [ ] Add cache TTL: 24h for API responses, 7d for static assets (#83)
- [ ] Write tests: error response not cached, invalid push URL blocked

**C5.2 — Fix Client-Side Vulnerabilities** (2h)
- [ ] `public/app.js:90-110` — freeze settings, validate keys against whitelist (#84)
- [ ] `public/app.js` — implement listener cleanup with AbortController on detail panel (#86)
- [ ] `public/app.js:3980-4010` — file import size check (coordinated with S3/C3.4) (#85)
- [ ] Write tests: prototype pollution attempt → blocked, panel open/close → no leak

**C5.3 — Fix Store.js** (1h)
- [ ] `public/store.js:13` — `getAll()` returns structuredClone or JSON deep copy (#171)
- [ ] `public/store.js:1-5` — prune empty listener arrays periodically (#170)
- [ ] `public/store.js:10-11` — add simple mutex/queue for `set()` calls (#169)
- [ ] Write tests: mutating getAll result doesn't affect store, concurrent sets serialize

### Acceptance Criteria
- 500 error response not found in SW cache
- Push notification with external URL blocked
- SW update prompts user to refresh (no silent activation)
- Settings `__proto__` injection has no effect
- 50 panel open/close cycles: no listener growth
- Store mutation from external reference: no state corruption
- All existing tests pass

---

## Sprint 6 — Compliance & Infrastructure (Days 15–19)

> **Goal:** GDPR compliance, audit logging, security headers, password policy.

### PM Tasks
- [ ] Create milestone `v0.3.0-S6-compliance`
- [ ] Risk: email verification requires email service — evaluate options (Resend, Mailgun, smtp)
- [ ] Risk: audit logging increases storage — plan retention policy
- [ ] Stakeholder: inform users of new password requirements via in-app notice

### Architect Tasks

**A6.1 — Design Email Verification Flow**
- Findings: #10
- Flow: register → send verification email with signed token → verify endpoint activates account
- Token: HMAC-SHA256 with expiry (24h)
- New table: `email_verifications(email, token_hash, expires_at, verified_at)`
- Files: `src/routes/auth.js`, `src/db/index.js`, new `src/services/email.js`

**A6.2 — Design Password Reset Flow**
- Findings: #15
- Flow: forgot password → email with reset link (signed token, 1h expiry) → reset form → new password
- New table: `password_resets(email, token_hash, expires_at, used_at)`
- Files: `src/routes/auth.js`, `src/db/index.js`, new `public/reset-password.html`

**A6.3 — Design Account Deletion**
- Findings: #16
- Flow: user requests deletion → confirm password → soft-delete (30-day grace) → hard-delete cron
- Cascade: goals, tasks, habits, sessions, settings, lists, notes, tags
- Files: `src/routes/auth.js`, `src/db/index.js`

**A6.4 — Design Audit Logging**
- Findings: #14
- New table: `audit_log(id, user_id, action, resource, resource_id, ip, ua, timestamp)`
- Log: login success/failure, password change, data export/import, account deletion
- Retention: 90 days, auto-purge via scheduled cleanup
- Files: `src/db/index.js`, new `src/services/audit.js`, all auth routes

**A6.5 — Design Security Headers**
- Findings: #11, #17, #18
- CSP: remove `unsafe-inline`, use nonce-based CSP (generate per-request nonce)
- HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Health: remove version info from public endpoint, require auth or remove
- Files: `src/server.js`, `public/index.html`

### Coder Tasks

**C6.1 — Implement Password Policy** (2h)
- [ ] `src/routes/auth.js:30` — require 12+ chars, at least 1 uppercase, 1 number, 1 special (#8)
- [ ] Add common password blocklist (top 10K) check
- [ ] Update client-side validation in `public/login.html`
- [ ] Write tests: weak passwords rejected, strong passwords accepted

**C6.2 — Implement Security Headers** (2h)
- [ ] `src/server.js:32` — remove `unsafe-inline` from CSP, add nonce generation (#11)
- [ ] `src/server.js` — add HSTS header (#17)
- [ ] `src/server.js:107-114` — remove version/uptime from health endpoint or add auth (#18)
- [ ] Update `public/index.html` inline scripts to use nonce
- [ ] Write tests: verify headers present in response

**C6.3 — Implement Audit Logging** (4h)
- [ ] Create `audit_log` table in `src/db/index.js`
- [ ] Create `src/services/audit.js` with `logEvent(userId, action, resource, resourceId, req)` 
- [ ] Log: login success, login failure, password change, data export, data import, account deletion
- [ ] Add 90-day cleanup query
- [ ] Write tests: login failure creates audit record, old records purged

**C6.4 — Implement Email Verification** (6h)
- [ ] Create `email_verifications` table
- [ ] Create `src/services/email.js` (pluggable transport: SMTP/Resend)
- [ ] `src/routes/auth.js` — on register: create verification token, send email
- [ ] New endpoint: `GET /api/auth/verify/:token` — activate account
- [ ] Login blocked until verified (return 403 with "verify email" message)
- [ ] Write tests: register → token created, verify → account active, login before verify → 403

**C6.5 — Implement Password Reset** (4h)
- [ ] Create `password_resets` table
- [ ] New endpoint: `POST /api/auth/forgot-password` — send reset email
- [ ] New endpoint: `POST /api/auth/reset-password` — validate token, set new password
- [ ] Create `public/reset-password.html` for the reset form
- [ ] Write tests: request reset → token created, reset with valid token → password changed, expired token → 400

**C6.6 — Implement Account Deletion** (3h)
- [ ] New endpoint: `DELETE /api/auth/account` — requires password confirmation
- [ ] Soft-delete: set `deleted_at` timestamp on users table
- [ ] Block login for soft-deleted accounts
- [ ] Cascade cleanup function for hard-delete
- [ ] Write tests: delete account → can't login, data cascade verified

**C6.7 — Fix Import Confirmation** (1h)
- [ ] `src/routes/data.js:67` — replace hardcoded "DESTROY_ALL_DATA" with time-limited HMAC token (#54)
- [ ] Generate token on import preview, validate on confirm
- [ ] Write tests: replay with old token → 403, valid token → success

### Acceptance Criteria
- Weak password (< 12 chars, no complexity) → rejected
- CSP header has no `unsafe-inline`, nonce present
- HSTS header present with max-age >= 1 year
- Health endpoint does not expose version
- Login failure creates audit record
- Register sends verification email, unverified login → 403
- Password reset flow: request → email → reset → login with new password
- Account deletion: soft-delete → blocked login → data cascade on hard-delete
- Import with replayed confirmation → 403
- All existing tests pass

---

## Backlog — Low Priority Hardening

These findings are lower risk and can be addressed incrementally after v0.3.0.

| # | Finding | Category | Effort | Sprint |
|---|---------|----------|--------|--------|
| #12 | Secure cookie in dev | Config | 30min | Next |
| #13 | Default "remember me" unchecked | UX | 15min | Next |
| #54 | Import weak confirmation | Security | 1h | S6 ✅ |
| #86 | Memory leak in detail panel | Performance | 2h | S5 ✅ |
| #119 | Task position race condition | Data Integrity | 2h | S4 ✅ |
| #122 | Habit log idempotency | Data Integrity | 1h | S3 ✅ |
| #123 | Weekly review week start | Logic | 1h | S3 ✅ |
| #150 | Store.js race condition | Client | 1h | S5 ✅ |
| #151 | List self-reference guard | Schema | 30min | S4 ✅ |
| #169-171 | Store.js hardening | Client | 2h | S5 ✅ |

> Items marked ✅ are already covered in their respective sprints above.

### Remaining Backlog (post-v0.3.0)
| # | Finding | Effort | Priority |
|---|---------|--------|----------|
| #12 | Secure flag in dev mode | 30min | Low |
| #13 | Uncheck default "Remember Me" | 15min | Low |
| All #19-#39 | Minor auth observations | Various | Low |
| All #55-#75 | Minor API observations | Various | Low |
| All #87-#115 | Minor frontend observations | Various | Low |
| All #128-#149 | Minor logic observations | Various | Low |

---

## Cross-Cutting Concerns

### Testing Strategy (Architect)
- **Unit tests:** Each fix includes >1 test validating the security control
- **Regression:** All 1101 existing tests must pass after each sprint
- **Integration:** End-to-end tests for CSRF flow, session binding, email verification
- **Security:** Penetration-style tests (inject payloads, replay attacks, timing measurements)
- **Runner:** `node --test --test-force-exit tests/*.test.js`

### Code Review Protocol (Architect)
- Every PR requires architect review before merge
- Security-critical PRs (S1, S2) require line-by-line review
- Check for: input validation at boundaries, output escaping, SQL parameterization
- Verify: no new `innerHTML` without `esc()`/`escA()`, no direct user input in queries

### Release Plan (PM)
- **v0.3.0-rc.1** — after S1+S2 (critical + auth) — deploy to staging
- **v0.3.0-rc.2** — after S3+S4 (validation + database) — staging regression
- **v0.3.0-rc.3** — after S5+S6 (client + compliance) — full regression
- **v0.3.0** — final release after all sprints pass
- Tag and push: `git tag v0.3.0 && git push origin main --tags`

### Risk Register (PM)

| Risk | Impact | Mitigation |
|------|--------|------------|
| CSRF breaks existing integrations | High | Feature flag, gradual rollout |
| Session binding breaks mobile users | Medium | Log-only mode first, then enforce |
| Email service limits free tier | Low | Start with SMTP, queue emails |
| Nonce-based CSP breaks inline scripts | High | Audit all inline scripts before removing unsafe-inline |
| Index creation locks DB | Low | SQLite WAL mode handles concurrent reads |
| Password policy locks out existing users | Medium | Grace period: enforce only on next password change |

---

## File Change Map

| File | Sprints | Changes |
|------|---------|---------|
| `src/routes/auth.js` | S1, S2, S6 | CSRF, timing fix, enumeration, lockout, email verify, password reset, account delete |
| `src/routes/tasks.js` | S1, S3, S4 | IDOR fix, input validation, recurrence fix, transaction wrapping |
| `src/routes/features.js` | S1, S3 | IDOR fix, habit idempotency, streak timezone, weekly review |
| `src/routes/stats.js` | S3 | Input validation, DoS limit, focus session ownership |
| `src/routes/lists.js` | S1, S3 | Shared list auth, duplication limit |
| `src/routes/productivity.js` | S1, S3 | IDOR fix, rules validation |
| `src/routes/data.js` | S3, S6 | Import size limit, HMAC confirmation |
| `src/middleware/auth.js` | S2 | Timing fix, session binding |
| `src/server.js` | S1, S2, S6 | CSRF middleware, rate limit, CSP, HSTS, health endpoint |
| `src/db/index.js` | S2, S4, S6 | Session columns, indexes, constraints, migrations, new tables |
| `src/helpers.js` | S1, S3, S4 | verifyOwnership, recurrence fix, position fix |
| `public/app.js` | S1, S3, S5 | XSS escaping, CSRF header, file size limit, prototype fix, memory fix |
| `public/sw.js` | S5 | Cache validation, push URL validation, versioning |
| `public/store.js` | S5 | Deep copy, mutex, cleanup |
| `public/login.html` | S1, S6 | CSRF token, password policy |
| **New:** `src/middleware/csrf.js` | S1 | CSRF double-submit cookie middleware |
| **New:** `src/middleware/validate.js` | S3 | Reusable input validators |
| **New:** `src/services/audit.js` | S6 | Audit logging service |
| **New:** `src/services/email.js` | S6 | Email transport service |
| **New:** `public/reset-password.html` | S6 | Password reset form |

---

## Definition of Done

A sprint is **done** when:
1. All coder tasks have passing tests
2. All 1101+ existing tests pass (`node --test --test-force-exit tests/*.test.js`)
3. Architect has reviewed and approved all PRs
4. PM has verified acceptance criteria
5. No CRITICAL or HIGH findings remain open for that sprint's scope
6. Changes committed with descriptive message: `fix(security): S{n} — {theme}`

---

*Implementation plan derived from 200-agent Security Hackathon report, 25 March 2026*
*Target: LifeFlow v0.3.0*
