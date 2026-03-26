---
status: Partially implemented
baseline: v0.1.0
---

# LifeFlow Ship-Ready Implementation Plan

> **Baseline:** v0.1.0 | 898 tests | 68+ API endpoints | 25+ views | 8 themes
> **Target:** v1.0.0 — Production-ready, multi-user, secure
> **Source:** 18-specialist review (3 PM, 3 QA, 3 Marketing, 3 Architect, 3 Security, 3 Red Team)
> **Date:** 2026-03-24

---

## Priority Matrix

| Priority | Category | Items | Rationale |
|----------|----------|-------|-----------|
| **P0 — Ship Blocker** | Auth + Security | 8 items | Cannot expose to internet without these |
| **P1 — Ship Critical** | Data Safety + DevOps | 6 items | Data loss prevention + deployment |
| **P2 — Ship Important** | UX + Marketing | 6 items | First impressions, discoverability |
| **P3 — Post-Launch** | Performance + Scale | 5 items | Optimize after users arrive |

---

## Phase 7 — v0.2.0: "Lock the Door" (Auth + Security Hardening)

**Why first:** Every other improvement is meaningless if anyone on the network can wipe the database. Auth is the #1 blocker from ALL 18 reviewers.

### 7.1 User Authentication System

**Schema:**
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  data TEXT DEFAULT '{}',
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/register | Create account (email + password) |
| POST | /api/auth/login | Authenticate → set session cookie |
| POST | /api/auth/logout | Destroy session |
| GET | /api/auth/me | Return current user (from session) |

**Cookie Strategy (Session-based, NOT JWT):**
- `lf_sid` — httpOnly, sameSite=strict, secure (in production), path=/
- "Remember Me" checked → `maxAge: 30 days`
- "Remember Me" unchecked → session cookie (expires on browser close)
- Server validates session on every request via middleware

**Password:**
- `bcryptjs` with 12 salt rounds
- Minimum 8 characters, basic strength check
- No password reset in v0.2.0 (self-hosted, access DB directly)

**Dependencies:** `bcryptjs` (pure JS, no native compilation needed)

| # | Task | Backend | Frontend | Tests |
|---|------|---------|----------|-------|
| 7.1.1 | Users table + migration | db/index.js | — | 2 |
| 7.1.2 | Sessions table + cleanup cron | db/index.js | — | 2 |
| 7.1.3 | POST /api/auth/register | routes/auth.js | — | 5 |
| 7.1.4 | POST /api/auth/login + cookie | routes/auth.js | — | 6 |
| 7.1.5 | POST /api/auth/logout | routes/auth.js | — | 2 |
| 7.1.6 | GET /api/auth/me | routes/auth.js | — | 2 |
| 7.1.7 | Login/Register UI | — | app.js + login.html | 4 |
| 7.1.8 | "Remember Me" toggle | — | login.html | 1 |

### 7.2 Authorization Middleware

**Pattern:** Every API route gets `requireAuth` middleware that:
1. Reads `lf_sid` cookie
2. Looks up session in DB (checks expiry)
3. Sets `req.userId` on the request
4. Returns 401 if no valid session

**Data Isolation:** Add `user_id` column to ALL data tables. Default = 1 for migration of existing data. Every query gets `WHERE user_id = ?`.

| # | Task | Files Changed | Tests |
|---|------|---------------|-------|
| 7.2.1 | Auth middleware (requireAuth) | middleware/auth.js | 4 |
| 7.2.2 | Wire middleware to ALL routes | server.js | 2 |
| 7.2.3 | Add user_id to life_areas, goals, tasks | db/index.js (ALTER x3) | 3 |
| 7.2.4 | Add user_id to tags, habits, habit_logs | db/index.js (ALTER x3) | 3 |
| 7.2.5 | Add user_id to lists, notes, saved_filters | db/index.js (ALTER x3) | 3 |
| 7.2.6 | Add user_id to all remaining tables | db/index.js | 2 |
| 7.2.7 | Update ALL route queries with user_id filter | routes/*.js (9 files) | 6 |
| 7.2.8 | Update test helpers for auth context | tests/helpers.js | 2 |

### 7.3 Security Headers & CSRF

| # | Task | Details | Tests |
|---|------|---------|-------|
| 7.3.1 | Install & configure helmet | server.js — CSP, X-Frame, HSTS, etc. | 2 |
| 7.3.2 | CSRF token generation + validation | Middleware — double-submit cookie pattern | 3 |
| 7.3.3 | CSRF meta tag in HTML + fetch wrapper | index.html + app.js | 2 |
| 7.3.4 | Configure CORS (same-origin default) | server.js | 1 |

### 7.4 Rate Limiting

| # | Task | Details | Tests |
|---|------|---------|-------|
| 7.4.1 | Global rate limiter (100 req/min) | server.js via express-rate-limit | 2 |
| 7.4.2 | Auth endpoints stricter limit (10/min) | routes/auth.js | 2 |
| 7.4.3 | Destructive endpoints limit (5/hour) | data.js (import/export/reset) | 1 |

### 7.5 Protect Destructive Endpoints

| # | Task | Details | Tests |
|---|------|---------|-------|
| 7.5.1 | Require re-authentication for /api/import | Password re-entry | 2 |
| 7.5.2 | Require re-authentication for /api/demo/reset | Password re-entry | 1 |
| 7.5.3 | Add confirmation token for data destruction | Time-limited token pattern | 2 |

### 7.6 User Dashboard (Post-Login Landing)

| # | Task | Details | Tests |
|---|------|---------|-------|
| 7.6.1 | Dashboard view with user greeting | "Good morning, {name}" + stats | 2 |
| 7.6.2 | Quick stats cards (tasks today, streak, focus) | Client-side from existing APIs | 1 |
| 7.6.3 | Recent activity feed (last 10 actions) | From existing task/focus data | 1 |

**Phase 7 Totals:**
- **New dependencies:** bcryptjs, helmet, express-rate-limit, cors
- **New files:** routes/auth.js, middleware/auth.js, public/login.html
- **Modified files:** server.js, db/index.js, all 9 route files, app.js, index.html, helpers.js
- **New tests:** ~68
- **DB migrations:** users, sessions, ALTER TABLE x9+ (add user_id)

---

## Phase 8 — v0.3.0: "Safety Net" (Data Protection + Infrastructure)

**Why second:** Users need confidence their data won't disappear. Architects flagged zero migration system and no soft deletes.

### 8.1 Database Migration System

| # | Task | Details | Tests |
|---|------|---------|-------|
| 8.1.1 | Migration runner (file-based, sequential) | src/db/migrations/ — numbered SQL files | 3 |
| 8.1.2 | Migration tracking table | CREATE TABLE _migrations (id, name, applied_at) | 1 |
| 8.1.3 | Migrate existing schema to migration 001 | Codify current schema as baseline | 1 |
| 8.1.4 | Migration 002: users + sessions tables | Formalize auth schema | 1 |

### 8.2 Soft Deletes

| # | Task | Details | Tests |
|---|------|---------|-------|
| 8.2.1 | Add deleted_at to tasks, goals, areas | ALTER TABLE x3 | 3 |
| 8.2.2 | Update DELETE routes → SET deleted_at | All route files | 4 |
| 8.2.3 | Filter deleted records from all GETs | WHERE deleted_at IS NULL | 2 |
| 8.2.4 | Trash view — list soft-deleted items | New view in app.js | 2 |
| 8.2.5 | Restore from trash endpoint | PUT /api/tasks/:id/restore etc. | 3 |
| 8.2.6 | Permanent purge (after 30 days) | Cleanup cron on server start | 1 |

### 8.3 Audit Log

| # | Task | Details | Tests |
|---|------|---------|-------|
| 8.3.1 | Audit log table | CREATE TABLE audit_log (id, user_id, action, entity, entity_id, details, ts) | 1 |
| 8.3.2 | Log middleware for state-changing ops | Auto-log POST/PUT/DELETE | 2 |
| 8.3.3 | GET /api/audit endpoint (paginated) | For logbook/activity view | 1 |

### 8.4 API Versioning

| # | Task | Details | Tests |
|---|------|---------|-------|
| 8.4.1 | Mount all routes under /api/v1/ | server.js router prefix | 2 |
| 8.4.2 | Redirect /api/* → /api/v1/* (compat) | 301 redirect for old clients | 1 |
| 8.4.3 | Update frontend to use /api/v1/ prefix | app.js api object | 1 |

### 8.5 Error Pages

| # | Task | Details | Tests |
|---|------|---------|-------|
| 8.5.1 | Custom 404 page | public/404.html with "Go home" link | 1 |
| 8.5.2 | Custom 500 page | public/500.html with retry option | 1 |
| 8.5.3 | Wire into Express error handler | middleware/errors.js | 1 |

### 8.6 .env Configuration

| # | Task | Details | Tests |
|---|------|---------|-------|
| 8.6.1 | Create .env.example | PORT, DB_DIR, SESSION_SECRET, NODE_ENV | 0 |
| 8.6.2 | Install dotenv, load in server.js | Config from environment | 1 |
| 8.6.3 | Add .env to .gitignore | Prevent secret leaks | 0 |

**Phase 8 Totals:**
- **New dependencies:** dotenv
- **New files:** src/db/migrations/, public/404.html, public/500.html, .env.example
- **New tests:** ~31
- **Theme:** "If I lose my data, I'll never come back"

---

## Phase 9 — v0.4.0: "First Impressions" (Marketing + Discovery)

**Why third:** Now that the app is secure and data-safe, marketing materials can be created honestly. No point marketing an insecure product.

### 9.1 README & Documentation

| # | Task | Details | Tests |
|---|------|---------|-------|
| 9.1.1 | README.md with hero, install, features | Project root — the GitHub storefront | 0 |
| 9.1.2 | docs/USER-GUIDE.md | How to use each feature | 0 |
| 9.1.3 | docs/KEYBOARD-SHORTCUTS.md | Full shortcut reference | 0 |
| 9.1.4 | docs/API.md | Endpoint reference for developers | 0 |
| 9.1.5 | CONTRIBUTING.md | Dev setup, test commands, PR guide | 0 |

### 9.2 SEO & Social Meta Tags

| # | Task | Details | Tests |
|---|------|---------|-------|
| 9.2.1 | OG meta tags on landing.html | og:title, og:description, og:image | 1 |
| 9.2.2 | Twitter card meta tags | twitter:card, twitter:title | 1 |
| 9.2.3 | Structured data (JSON-LD) | SoftwareApplication schema | 0 |
| 9.2.4 | robots.txt + sitemap.xml | For search indexability | 0 |

### 9.3 Docker Support

| # | Task | Details | Tests |
|---|------|---------|-------|
| 9.3.1 | Dockerfile (multi-stage, Node 20 alpine) | Minimal production image | 0 |
| 9.3.2 | docker-compose.yml | One-command deploy with volume mount | 0 |
| 9.3.3 | Docker install instructions in README | `docker run -p 3456:3456 lifeflow` | 0 |

### 9.4 Landing Page Polish

| # | Task | Details | Tests |
|---|------|---------|-------|
| 9.4.1 | Add screenshots/GIFs to feature cards | Canvas-generated or actual screenshots | 0 |
| 9.4.2 | Add comparison section (vs Todoist, Things) | Honest feature comparison table | 0 |
| 9.4.3 | Privacy/security callout section | "Your data never leaves your machine" | 0 |
| 9.4.4 | Privacy policy page | public/privacy.html — minimal, honest | 0 |
| 9.4.5 | Terms of service page | public/terms.html — MIT license based | 0 |

### 9.5 Share Card Social Integration

| # | Task | Details | Tests |
|---|------|---------|-------|
| 9.5.1 | Add "Share to Twitter" preset on share cards | Pre-filled tweet with image | 1 |
| 9.5.2 | Add "Copy image" button for share cards | Clipboard API fallback | 1 |

**Phase 9 Totals:**
- **New files:** README.md, Dockerfile, docker-compose.yml, privacy.html, terms.html, docs/*
- **New tests:** ~4
- **Theme:** "If nobody knows about it, it doesn't exist"

---

## Phase 10 — v0.5.0: "Ship Shape" (Performance + Quality)

**Why last:** Optimize for the users you have, not the users you imagine. Performance issues surface with real usage patterns.

### 10.1 Frontend Performance

| # | Task | Details | Tests |
|---|------|---------|-------|
| 10.1.1 | Virtual scrolling for task lists | Only render visible rows (>100 tasks) | 2 |
| 10.1.2 | Lazy-load views with dynamic import() | Split app.js into view modules | 1 |
| 10.1.3 | Add fetch timeout + retry wrapper | 10s timeout, 1 retry with backoff | 2 |
| 10.1.4 | Service worker for offline caching | Cache static assets, show offline page | 1 |

### 10.2 Backend Performance

| # | Task | Details | Tests |
|---|------|---------|-------|
| 10.2.1 | Add indexes on hot query columns | user_id, goal_id, status, due_date | 2 |
| 10.2.2 | Query result pagination on all list endpoints | ?page=1&limit=50 (standardize) | 3 |
| 10.2.3 | Compress responses (gzip) | express compression middleware | 1 |

### 10.3 Timezone Consistency

| # | Task | Details | Tests |
|---|------|---------|-------|
| 10.3.1 | Standardize all timestamps to UTC in DB | Audit every CURRENT_TIMESTAMP | 2 |
| 10.3.2 | Client-side UTC ↔ local conversion layer | Utility functions for display | 2 |

### 10.4 Cookie Consent + Compliance

| # | Task | Details | Tests |
|---|------|---------|-------|
| 10.4.1 | Cookie consent banner (session cookies) | Minimal, GDPR-compliant | 1 |
| 10.4.2 | GDPR data export (per-user scoped) | /api/auth/export-my-data | 2 |
| 10.4.3 | GDPR account deletion | /api/auth/delete-account | 2 |

### 10.5 Monitoring

| # | Task | Details | Tests |
|---|------|---------|-------|
| 10.5.1 | Structured JSON logging | Replace console.log with logger | 1 |
| 10.5.2 | Health check expansion (DB size, user count) | /health endpoint enrichment | 1 |
| 10.5.3 | Optional Plausible/Umami analytics snippet | Privacy-respecting, self-hosted | 0 |

**Phase 10 Totals:**
- **New dependencies:** compression (or built-in gzip)
- **New tests:** ~23
- **Theme:** "Fast and reliable at any scale"

---

## Version Progression Summary

| Phase | Version | Theme | New Tests | Cumulative | Key Deliverable |
|-------|---------|-------|-----------|------------|-----------------|
| 1–6 | v0.1.0 | Phases 1–6 (done) | — | 898 | Feature-complete app |
| **7** | **v0.2.0** | **Lock the Door** | **~68** | **~966** | **Auth, sessions, security headers, rate limiting** |
| **8** | **v0.3.0** | **Safety Net** | **~31** | **~997** | **Migrations, soft deletes, audit log, API versioning** |
| **9** | **v0.4.0** | **First Impressions** | **~4** | **~1001** | **README, Docker, SEO, docs** |
| **10** | **v0.5.0** | **Ship Shape** | **~23** | **~1024** | **Performance, compliance, monitoring** |
| — | **v1.0.0** | **GA Release** | — | **1024+** | **Tag, changelog, announce** |

---

## Dependency Graph

```
Phase 7 (Auth/Security) ──── MUST BE FIRST (all routes change) ────┐
                                                                     │
Phase 8 (Data Safety) ──── depends on auth (user_id) ──────────────┤
                                                                     │
Phase 9 (Marketing) ──── depends on secure app to screenshot ──────┤
                                                                     │
Phase 10 (Performance) ──── depends on all above being stable ─────┘
                                                                     │
v1.0.0 (GA) ──── depends on ALL phases complete ───────────────────┘
```

---

## Phase 7 Execution Order (Most Critical)

This is the implementation sequence within Phase 7 to avoid breaking existing tests:

```
Step 1: Install deps (bcryptjs, helmet, express-rate-limit, cors)
Step 2: Create users + sessions tables in db/index.js
Step 3: Create src/routes/auth.js (register, login, logout, me)
Step 4: Create src/middleware/auth.js (requireAuth)
Step 5: Create public/login.html + login CSS
Step 6: Wire auth routes in server.js (BEFORE other routes)
Step 7: Add helmet, cors, rate-limit to server.js
Step 8: Add CSRF middleware
Step 9: ALTER TABLE — add user_id to ALL data tables (default=1)
Step 10: Update test helpers — auto-create user + login for tests
Step 11: Wire requireAuth middleware to all route modules
Step 12: Add user_id filtering to every query in every route
Step 13: Build login/register UI in app.js
Step 14: Add user dashboard view
Step 15: Protect destructive endpoints (re-auth)
Step 16: Run full test suite — target 0 failures
```

---

## New Dependencies (All Phases)

| Package | Version | Phase | Purpose | Size |
|---------|---------|-------|---------|------|
| bcryptjs | ^3.0.2 | 7 | Password hashing (pure JS) | 30KB |
| helmet | ^8.1.0 | 7 | HTTP security headers | 15KB |
| express-rate-limit | ^7.5.0 | 7 | Rate limiting | 12KB |
| cors | ^2.8.5 | 7 | CORS configuration | 8KB |
| dotenv | ^16.4.7 | 8 | Environment variables | 7KB |
| compression | ^1.8.0 | 10 | Response gzip | 10KB |

**Total added:** ~82KB (minimal footprint, all well-maintained)

---

## Files Changed Per Phase

### Phase 7 (Auth)
| File | Action | Impact |
|------|--------|--------|
| package.json | Modify | +4 deps |
| src/db/index.js | Modify | +users, +sessions tables, +ALTER x9 |
| src/server.js | Modify | +helmet, +cors, +rateLimit, +auth routes, +cookie parser |
| src/routes/auth.js | **NEW** | Register, login, logout, me |
| src/middleware/auth.js | **NEW** | requireAuth, optionalAuth |
| public/login.html | **NEW** | Login/register form |
| public/app.js | Modify | Auth state, login redirect, CSRF token, dashboard |
| public/index.html | Modify | CSRF meta tag |
| public/styles.css | Modify | Login page styles |
| src/routes/*.js (9 files) | Modify | Add user_id to ALL queries |
| tests/helpers.js | Modify | Auth-aware test setup |
| tests/phase7-auth.test.js | **NEW** | ~68 tests |

### Phase 8 (Data Safety)
| File | Action | Impact |
|------|--------|--------|
| src/db/migrations/ | **NEW dir** | Migration runner + files |
| public/404.html | **NEW** | Error page |
| public/500.html | **NEW** | Error page |
| .env.example | **NEW** | Config template |
| .gitignore | Modify | +.env |
| src/routes/*.js | Modify | Soft delete logic |
| public/app.js | Modify | Trash view |

### Phase 9 (Marketing)
| File | Action | Impact |
|------|--------|--------|
| README.md | **NEW** | Project storefront |
| Dockerfile | **NEW** | Docker image |
| docker-compose.yml | **NEW** | Docker compose |
| public/landing.html | Modify | OG tags, screenshots |
| public/privacy.html | **NEW** | Privacy policy |
| public/terms.html | **NEW** | Terms of service |
| docs/*.md | **NEW** | User guide, API docs |

### Phase 10 (Performance)
| File | Action | Impact |
|------|--------|--------|
| src/db/index.js | Modify | Indexes |
| src/server.js | Modify | Compression, logging |
| public/app.js | Modify | Virtual scroll, lazy load |
| public/sw.js | **NEW** | Service worker |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth migration breaks all 898 tests | HIGH | Update test helpers FIRST; tests auto-create user |
| user_id ALTER on large DBs is slow | LOW | SQLite ALTER is instant for DEFAULT columns |
| bcryptjs is slow on login | LOW | 12 rounds ≈ 200ms, acceptable for login |
| CSRF breaks SPA fetch calls | MEDIUM | Use double-submit cookie (no server state needed) |
| Cookie not sent cross-origin | LOW | sameSite=strict + same-origin only |
| Existing users lose data on upgrade | HIGH | Default user_id=1; auto-create "admin" user on first boot |

---

## First-Boot Migration Strategy

When a user upgrades from v0.1.0 (no auth) to v0.2.0 (with auth):

1. Server starts → detects no `users` table → runs migrations
2. Creates `users` table + `sessions` table
3. ALTERs all tables to add `user_id DEFAULT 1`
4. Auto-creates a default user: `email: admin@localhost`, `password: changeme`
5. Shows "Welcome to LifeFlow v0.2.0 — please set your password" on first login
6. All existing data belongs to user_id=1 (the auto-created user)
7. No data loss. Seamless upgrade.

---

*Plan created 2026-03-24 | Addresses all 18 specialist recommendations*
*Next action: Implement Phase 7 (Auth + Security)*
