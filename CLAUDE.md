# LifeFlow — Claude Code Configuration

> **Last updated:** 30 March 2026 · **Version:** 0.7.4
> **Metrics:** 2,095 tests | 92 test files | 190 API routes | 34 DB tables | ~15,000 LOC

## Project Overview

Personal task planner with 4-level hierarchy: Life Area → Goal → Task → Subtask.
Multi-user Express.js backend + vanilla JS SPA frontend. SQLite via better-sqlite3.
Includes authentication, habits, lists, focus timer, templates, automations, custom fields, and service worker.

## Quick Start

```bash
npm install
node src/server.js          # http://localhost:3456
npm test                    # 2,095 tests via node:test
# or with Docker:
docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `DB_DIR` | Project root | Directory for `lifeflow.db` |
| `NODE_ENV` | `development` | Environment (development/production/test) |
| `LOG_LEVEL` | `info` | Pino log level (silent/error/warn/info/debug) |
| `RATE_LIMIT_MAX` | `200` | Max requests per window |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |

See `.env.example` for all variables.

## Architecture

**Backend:**
```
src/
  server.js           — Express app entry, middleware, graceful shutdown
  config.js           — Centralized config (dotenv, Object.freeze)
  logger.js           — Pino structured logging
  errors.js           — AppError classes (NotFoundError, ValidationError, etc.)
  helpers.js          — Shared utilities (enrichTask, getNextPosition, etc.)
  scheduler.js        — Background job scheduler (session cleanup, recurring spawn)
  db/
    index.js          — SQLite schema, 26 tables, inline migrations
    migrate.js        — SQL migration runner (_migrations table)
    migrations/       — Versioned SQL migration files
  routes/
    areas.js          — Life Areas + Goals + Milestones (uses AreasService)
    auth.js           — Register, login, logout, session (5 routes)
    custom-fields.js  — Custom field definitions + task values CRUD (6 routes)
    data.js           — Export, import, backup (6 routes)
    features.js       — Habits, templates, automations, settings (25 routes)
    filters.js        — Saved filters, smart lists (uses FiltersService)
    lists.js          — Custom lists + list items CRUD (22 routes)
    productivity.js   — Inbox, notes, reviews (weekly + daily), rules (20 routes)
    stats.js          — Dashboard, streaks, heatmap, analytics (20 routes)
    tags.js           — Tags CRUD + stats (uses TagsService)
    tasks.js          — Tasks CRUD, reorder, parse, board, calendar, table, timeline, suggested, batch (30 routes)
  schemas/            — Zod validation schemas
    common.schema.js  — Shared validators (positiveInt, hexColor, idParam)
    tasks.schema.js   — Recurring field Zod validation
    tags.schema.js    — Tag CRUD schemas
    filters.schema.js — Filter CRUD schemas
    areas.schema.js   — Area/Goal/Milestone schemas
  repositories/       — Data access layer (prepared statements)
    tags.repository.js
    filters.repository.js
    areas.repository.js
  services/           — Business logic layer
    audit.js          — Audit logging
    tags.service.js
    filters.service.js
    areas.service.js
  middleware/
    auth.js           — Session-based authentication guard
    csrf.js           — CSRF token middleware
    errors.js         — Global error handler (AppError + legacy compat)
    validate.js       — Zod validation middleware + legacy validators
    request-logger.js — HTTP request logging (method, path, status, duration)
```

**Frontend (7,860 LOC):**
```
public/
  app.js              — Main SPA: all views, routing, state management (5,369 lines)
  styles.css          — All styles, responsive breakpoints, themes (1,246 lines)
  index.html          — SPA shell, overlays, modals (436 lines)
  sw.js               — Service Worker: network-first caching (192 lines)
  store.js            — Offline state store (47 lines)
  login.html          — Auth login page (213 lines)
  landing.html        — Marketing landing page (119 lines)
  landing.css         — Landing page styles (68 lines)
  share.html          — Shared task view (170 lines)
  manifest.json       — PWA manifest
  js/                 — ES module extractions (progressive migration)
    api.js            — API client with CSRF, auth redirect, error handling
    utils.js          — Pure utilities (esc, fmtDue, renderMd, etc.)
```

**Stack:** Node.js 22, Express 5, better-sqlite3 (WAL mode, foreign keys ON), bcryptjs, helmet, cors, dotenv, pino, zod, vanilla JS, Inter font, Material Icons Round

**No build step.** Edit files, restart server (`node src/server.js`), hard-refresh browser (`Ctrl+Shift+R`).

## Database Schema (26 tables)

### Core hierarchy
```
users          (id, username, password_hash, display_name, created_at)
sessions       (id, user_id→users, token, created_at, expires_at)
life_areas     (id, user_id→users, name, icon, color, position, created_at)
goals          (id, area_id→life_areas, title, description, color, status, due_date, position, created_at)
tasks          (id, goal_id→goals, title, note, status[todo|doing|done], priority[0-3], due_date, recurring, assigned_to, position, my_day, created_at, completed_at)
subtasks       (id, task_id→tasks, title, note, done, position, created_at)
tags           (id, user_id→users, name UNIQUE, color)
task_tags      (task_id→tasks, tag_id→tags)  — M:N join
```

### Features
```
task_deps      (task_id→tasks, depends_on→tasks) — dependency graph
task_templates (id, user_id, name, template JSON)
task_comments  (id, task_id→tasks, user_id, content, created_at)
goal_milestones(id, goal_id→goals, title, done, position)
inbox          (id, user_id, text, created_at)
notes          (id, user_id, title, content, created_at, updated_at)
weekly_reviews (id, user_id, week, wins, struggles, plan, created_at)
daily_reviews  (id, user_id, date UNIQUE, note, completed_count, created_at)
```

### Productivity
```
focus_sessions     (id, task_id→tasks, user_id, started_at, duration_sec, type)
focus_session_meta (id, session_id→focus_sessions, key, value)
focus_steps        (id, session_id→focus_sessions, title, done, position)
habits             (id, user_id, name, frequency, color, position, created_at)
habit_logs         (id, habit_id→habits, date, done)
```

### System
```
settings       (user_id, key, value) — user preferences
saved_filters  (id, user_id, name, filter JSON)
lists          (id, user_id, name, type, icon, position, created_at)
list_items     (id, list_id→lists, title, done, position, note)
badges         (id, user_id, badge_type, earned_at)
automation_rules (id, user_id, trigger, action, config JSON, enabled)
custom_field_defs (id, user_id, name, field_type, options JSON, position, required, show_in_card)
task_custom_values (id, task_id→tasks, field_id→custom_field_defs, value)
api_tokens     (id, user_id→users, name, token_hash, last_used_at, created_at, expires_at)
push_subscriptions (id, user_id→users, endpoint, p256dh, auth, created_at)
webhooks       (id, user_id→users, name, url, events JSON, secret, active, created_at)
```

All foreign keys use `ON DELETE CASCADE`.

## API Routes (166 routes across 11 modules)

See `docs/openapi.yaml` for full specification. Key modules:

| Module | Routes | Covers |
|--------|--------|--------|
| `tasks.js` | 30 | CRUD, reorder, parse (NLP), board, calendar, table, timeline, my-day, search, overdue, suggested, batch |
| `features.js` | 34 | Habits, templates, automations, settings, AI, webhooks, push (34 routes) |
| `lists.js` | 22 | Custom lists + list items CRUD |
| `stats.js` | 20 | Dashboard, streaks, heatmap, activity, focus stats, analytics |
| `productivity.js` | 20 | Focus timer, reminders, triage, comments, milestones, daily review |
| `areas.js` | 17 | Life Areas CRUD + reorder + goals association |
| `tags.js` | 11 | Tags CRUD + usage stats |
| `filters.js` | 7 | Saved filters + smart lists |
| `custom-fields.js` | 6 | Custom field definitions + task values CRUD |
| `data.js` | 8 | Export, import, backup, iCal, Todoist/Trello import (8 routes) |
| `auth.js` | 14 | Register, login, logout, session, tokens, 2FA, users (14 routes) |

## Frontend Views (25+)

| Key | View | Description |
|-----|------|-------------|
| `1` | Today | Today's tasks + my_day flagged + overdue + stats bar + habits strip |
| `2` | All Tasks | Everything grouped by status |
| `3` | Board | Kanban (todo/doing/done) with area/priority/tag filters |
| `4` | Calendar | Month grid with task pills, click to open |
| `5` | Dashboard | Stats, streaks, heatmap, area breakdown, drill-down |
| `6` | Weekly Plan | 7-day column layout, drag to reschedule |
| `7` | Matrix | Eisenhower 2×2 urgency/importance grid |
| `8` | Activity Log | Completed tasks grouped by day, paginated |
| `9` | Tag Manager | Rename, recolor, delete tags with usage counts |
| `0` | Focus History | Stats bar, 14-day bar chart, top tasks, session list |
| — | Area | Goals grid for a life area |
| — | Goal | Tasks for a specific goal (list/board tabs) |
| — | Reports | 7-tab view: Overview, Activity, Habits, Focus, Analytics, Reviews, Notes |
| — | Settings | 8 tabs: General, Appearance, Tags, Templates, Automations, Custom Fields, Data, Shortcuts |
| — | Inbox | Quick capture inbox |
| — | Lists | Custom checklists/grocery/etc |
| — | Table | Sortable/filterable/groupable task table with pagination |
| — | Gantt | SVG timeline with task bars, today marker, area grouping |
| — | Triage | Morning briefing / task triage |
| — | Habits | Habit tracker with daily logging |

**Shortcuts:** `N` quick capture, `M` multi-select, `Ctrl+K` search, `?` help, `Esc` close

## Features Inventory

### Core
- 4-level hierarchy: Life Area → Goal → Task → Subtask
- Multi-user authentication (bcrypt, sessions, CSRF)
- API token authentication (Bearer tokens, SHA-256 hashed)
- TOTP 2FA (RFC 6238, setup/verify/disable)
- 8 themes (midnight, charcoal, nord, ocean, forest, rose, sunset, light) + auto-detect via prefers-color-scheme
- Service Worker with network-first caching, offline mutation queue, update notifications
- PWA manifest for add-to-homescreen
- Configurable CORS (ALLOWED_ORIGINS env var)
- Trust proxy support for reverse proxy deployments

### Task Management
- Recurring tasks (daily/weekly/monthly/yearly/weekdays/every-N-days/weeks) with subtask copying on spawn
- Recurring field Zod validation (JSON structure enforcement at API boundary)
- NLP quick capture parser (dates, priorities, tags from natural text)
- Task dependencies with blocked-by indicators
- Task templates for common structures
- Automation rules (trigger → action workflows)
- Custom fields (text, number, date, select types) with per-task values
- Table view with sortable columns, grouping, filtering, pagination
- Gantt chart V2 (SVG timeline, task bars, dependency arrows via blocked_by, progress fill, today marker, area grouping)
- Multi-user task assignment (assigned_to_user_id)
- Drag-and-drop reorder (list, board, weekly columns) + touch support
- Multi-select with bulk complete/delete/set priority
- Inline subtask expansion with drag reorder

### Productivity
- Focus/Pomodoro timer (25/5/15 min, SVG ring, session tracking, history)
- Auto-link focus session duration to task actual_minutes on completion
- Habit tracker with daily logging and heatmaps
- Streak counter + GitHub-style 365-day contribution heatmap
- Web Push notifications (subscribe, test, overdue/reminder triggers)
- Notification bell with overdue/today/upcoming reminders
- Morning briefing / triage workflow
- Weekly reviews

### Integrations
- Outbound webhooks (HMAC-SHA256 signed, configurable events, fire-and-forget)
- AI BYOK (bring your own key — task suggestions, scheduling via encrypted API key)
- Todoist JSON import (maps projects → goals, items → tasks)
- Trello JSON import (maps lists → goals, cards → tasks)
- iCal export (VCALENDAR with RRULE for recurring)

### UX
- Toast notifications with undo (area + goal deletion restore)
- Markdown rendering in notes
- Confetti on goal 100% completion (prefers-reduced-motion respected)
- Relative date badges ("in 3 days", "2d overdue")
- Custom lists (checklists, grocery, custom)
- Auto-backup (startup + 24h, rotates last 7)
- Print stylesheet
- Responsive mobile: hamburger sidebar, bottom nav bar, touch targets ≥44px
- iOS keyboard detection, safe-area insets
- Onboarding wizard for new users

## Key Patterns

- `enrichTask(t)` / `enrichTasks(tasks)` — decorates each task with `tags[]`, `subtasks[]`, `subtask_done`, `subtask_total`
- `esc(s)` — HTML entity escaping for user content in templates
- `escA(s)` — attribute-safe escaping
- `fmtDue(d)` — relative date formatter
- `renderMd(text)` — lightweight markdown→HTML (esc first, then regex transform)
- `touchDnD` — touch drag-and-drop polyfill (long-press 200ms, ghost element, auto-scroll)
- All state is top-level `let` variables: `areas`, `goals`, `tasks`, `allTags`, `currentView`, etc.
- Full DOM re-render on state change via `render()` → view-specific async functions
- Express 5 wildcard: `app.get('/{*splat}', ...)` for SPA fallback
- Session-based auth: `requireAuth` middleware on all `/api/*` routes

## Testing

```bash
npm test                    # Run all 2,095 tests
```

**Runner:** `node --test --test-force-exit` with `node:assert/strict` + `supertest`

**91 test files** across these categories:

| Category | Files | Description |
|----------|-------|-------------|
| Core CRUD | areas, goals, tasks, subtasks, tags | Entity lifecycle, cascades, validation |
| Views | views, board, calendar | Multi-view rendering, filters |
| Productivity | stats, focus, habits, streaks | Dashboard, timer, heatmap |
| Features | nlp, lists, templates, automations, notes | Feature-specific tests |
| Auth & Security | auth, security, idor, csrf | Authentication, authorization, CSRF |
| Frontend | frontend-validation, input-system, mobile-responsive-fixes | Static CSS/HTML/JS validation |
| Integration | misc, data, migration, concurrency | Cross-cutting concerns |
| Accessibility | phase4-a11y-mobile | ARIA, focus, reduced-motion |

**Isolation:** Each test file uses temp DB via `DB_DIR` env var, `cleanDb()` in `beforeEach`, factories: `makeArea()`, `makeGoal()`, `makeTask()`, `makeSubtask()`, `makeTag()`, `linkTag()`, `makeFocus()`.

## Documentation

See `docs/DOCUMENTATION-AUDIT.md` for the full documentation review and proposed restructure.

### Key docs
- `docs/openapi.yaml` — Full OpenAPI 3.0.3 spec (2,892 lines)
- `docs/SECURITY-HACKATHON-2026-03-25.md` — Security audit (115 findings)
- `docs/SECURITY-IMPLEMENTATION-PLAN.md` — Security remediation roadmap
- `docs/design/` — Design documents (see `docs/design/INDEX.md` for status)

## Documentation Update Requirements

**After every code change, update these docs as applicable:**

| Change Type | Must Update |
|-------------|------------|
| New/changed API endpoint | `docs/openapi.yaml` |
| New DB table or column | CLAUDE.md § Database Schema |
| New frontend view | CLAUDE.md § Frontend Views |
| New feature shipped | CLAUDE.md § Features Inventory, CHANGELOG.md |
| New test file or 50+ tests added | CLAUDE.md § Testing metrics |
| Security fix | `docs/SECURITY-IMPLEMENTATION-PLAN.md` (mark complete) |
| Architecture change | CLAUDE.md § Architecture |
| Breaking change | CHANGELOG.md with migration notes |
| Version bump | CLAUDE.md header, `package.json`, `docs/openapi.yaml` |

**Update the CLAUDE.md header line counts** when LOC changes significantly (>5%):
- Current: 2,095 tests | 91 test files | 190 routes | 34 tables | ~15,000 LOC

## What Needs to Be Done (Roadmap)

### High Priority
- **Security remediation** — 115 findings from security audit (16 critical, 32 high)
- **README.md** — Project front door (currently missing)
- **Documentation restructure** — See `docs/DOCUMENTATION-AUDIT.md`

### Medium Priority
- **Gantt chart V2** — Dependency arrows, drag-to-reschedule, zoom levels (MVP done)
- **Attachment support** — File/image uploads on tasks

### Low Priority / Nice to Have
- **Collaboration** — Multi-user task sharing (assigned_to field exists but unused in UI)
- **Mobile app** — React Native or Capacitor wrapper
- **Calendar sync** — Google/Apple calendar two-way sync
- **API tokens** — Token-based access for programmatic use / integrations

## Rules

- ALWAYS read a file before editing it
- ALWAYS update documentation after code changes (see Documentation Update Requirements above)
- After changing backend files, restart: `pkill -f "node src/server" && node src/server.js &`
- After changing frontend files, hard-refresh browser (`Ctrl+Shift+R`) — browser caches aggressively
- Express route order matters: static routes (`/api/tasks/reorder`) MUST come before parameterized routes (`/api/tasks/:id`)
- SQLite WAL files (`.db-shm`, `.db-wal`) and `backups/` are gitignored
- No build step, no bundler, no framework — edit and reload
- `position` column exists on areas, goals, tasks, subtasks for ordering
- `completed_at` is set when task status changes to 'done'
- Recurring tasks copy tags to the auto-spawned next occurrence
- All API routes require authentication (session-based) except `/api/auth/*`
