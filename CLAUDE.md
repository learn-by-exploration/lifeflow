# LifeFlow — Claude Code Configuration

> **Last updated:** 5 April 2026 · **Version:** 0.8.5
> **Metrics:** 6,348 tests | 161 test files | 240 API routes | 45 DB tables | ~21,000 LOC

## LLM Behavior Guidelines

> Based on [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls. These principles complement the rules above.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## Project Overview

Personal task planner with 4-level hierarchy: Life Area → Goal → Task → Subtask.
Multi-user Express.js backend + vanilla JS SPA frontend. SQLite via better-sqlite3.
Includes authentication, habits, lists, focus timer, templates, automations, custom fields, and service worker.

> **Shared standards** (git workflow, security rules, testing strategy, backend service architecture,
> error handling, anti-patterns, documentation requirements) are in the parent repo's `CLAUDE.md`.
> All standards defined there apply here. This file covers LifeFlow-specific structure and conventions only.

## Quick Start

```bash
npm install
node src/server.js          # http://localhost:3456
npm test                    # 6,296 tests via node:test
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
    index.js          — SQLite schema, 35 tables, inline migrations, startup integrity check, auto-restore
    migrate.js        — SQL migration runner (_migrations table)
    migrations/       — Versioned SQL migration files
  routes/
    areas.js          — Life Areas + Goals + Milestones (uses AreasService)
    auth.js           — Register, login, logout, session, 2FA, tokens (14 routes)
    custom-fields.js  — Custom field definitions + task values CRUD (6 routes)
    data.js           — Export, import, backup, iCal, search (8 routes)
    features.js       — Habits, templates, automations, settings, planner, webhooks, push, AI (61 routes)
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
    automation-engine.js — Advanced automation engine (19 triggers, 19 actions, conditions, interpolation)
    ai.js             — Re-exports from ai/index.js (backward compat)
    ai/
      index.js        — AI service: encryption, rate limiting, all AI feature methods
      provider.js     — Provider abstraction (OpenAI, Anthropic, Ollama, Custom)
      transparency.js — Data minimization, prompt logging, pre-flight disclosure
      prompts/        — Prompt template builders (capture, classify, decompose, daily-plan, review, summarize)
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

**Frontend (8,943 LOC):**
```
public/
  app.js              — Main SPA: all views, routing, state management (5,966 lines)
  styles.css          — All styles, responsive breakpoints, 8 themes (1,342 lines)
  index.html          — SPA shell, overlays, modals (454 lines)
  sw.js               — Service Worker: network-first caching (215 lines)
  store.js            — Offline state store (96 lines)
  login.html          — Auth login page (105 lines)
  landing.html        — Marketing landing page (119 lines)
  landing.css         — Landing page styles (68 lines)
  share.html          — Shared task view (50 lines)
  manifest.json       — PWA manifest
  js/                 — ES module extractions (progressive migration)
    api.js            — API client with CSRF, auth redirect, error handling
    utils.js          — Pure utilities (esc, fmtDue, renderMd, etc.)
```

**Stack:** Node.js 22, Express 5, better-sqlite3 (WAL mode, foreign keys ON), bcryptjs, helmet, cors, dotenv, pino, zod, vanilla JS, Inter font, Material Icons Round

**No build step.** Edit files, restart server (`node src/server.js`), hard-refresh browser (`Ctrl+Shift+R`).

## Database Schema (41 tables)

### Core hierarchy
```
users          (id, email, password_hash, display_name, xp_total, xp_level, daily_goal, weekly_goal, created_at)
sessions       (sid PK, user_id→users, remember, expires_at, created_at)
life_areas     (id, user_id→users, name, icon, color, position, archived, default_view, created_at)
goals          (id, area_id→life_areas, user_id→users, title, description, color, status, due_date, position, created_at)
tasks          (id, goal_id→goals, user_id→users, title, note, status[todo|doing|done], priority[0-3], due_date, due_time, recurring, assigned_to, assigned_to_user_id, position, my_day, estimated_minutes, actual_minutes, list_id, starred, start_date, created_at, completed_at)
subtasks       (id, task_id→tasks, title, note, done, position, parent_id→subtasks, created_at) — max 3 levels
tags           (id, user_id→users, name, color)  — UNIQUE(user_id, name)
task_tags      (task_id→tasks, tag_id→tags)  — M:N join
```

### Features
```
task_deps      (task_id→tasks, blocked_by_id→tasks) — dependency graph
task_templates (id, user_id→users, name, description, icon, tasks JSON, user_created, source_type)
task_comments  (id, task_id→tasks, text, created_at)
goal_milestones(id, goal_id→goals, title, done, position, completed_at)
inbox          (id, user_id→users, title, note, priority, created_at)
notes          (id, user_id→users, title, content, goal_id, created_at, updated_at)
weekly_reviews (id, user_id→users, week_start, tasks_completed, tasks_created, top_accomplishments, reflection, next_week_priorities, rating)
daily_reviews  (id, user_id→users, date, note, completed_count, created_at) — UNIQUE(user_id, date)
```

### Productivity
```
focus_sessions     (id, task_id→tasks, user_id→users, started_at, duration_sec, type)
focus_session_meta (id, session_id→focus_sessions, intention, reflection, focus_rating, steps_planned, steps_completed, strategy)
focus_steps        (id, session_id→focus_sessions, text, done, position, completed_at)
habits             (id, user_id→users, name, icon, color, frequency, target, position, area_id, archived, preferred_time, created_at)
habit_logs         (id, habit_id→habits, date, count)
```

### System
```
settings           (user_id, key, value) — user preferences + system flags (no FK, uses user_id=0 for system keys)
saved_filters      (id, user_id→users, name, icon, color, filters JSON, position)
lists              (id, user_id→users, name, type, icon, color, position, created_at)
list_items         (id, list_id→lists, title, checked, category, quantity, note, position)
badges             (id, user_id→users, type, earned_at) — UNIQUE(user_id, type)
automation_rules   (id, user_id→users, name, trigger_type, trigger_config, action_type, action_config, conditions, actions, description, template_id, enabled, fire_count, last_fired_at, last_schedule_fire)
automation_log     (id, rule_id→automation_rules[SET NULL], user_id→users, trigger_type, action_type, trigger_context, actions_executed, status, error, created_at)
automation_templates (id PK TEXT, name, description, category, icon, trigger_type, trigger_config, conditions, actions, customizable_fields, sort_order)
automation_suggestions (id, user_id→users, suggestion_type, template_id, reason, context, dismissed, dismissed_permanently)
custom_field_defs  (id, user_id→users, name, field_type, options JSON, position, required, show_in_card)
task_custom_values (id, task_id→tasks, field_id→custom_field_defs, value)
user_xp           (id, user_id→users, amount, reason, created_at) — XP awards history
task_attachments  (id, task_id→tasks, user_id→users, filename, original_name, mime_type, size_bytes, created_at)
custom_statuses   (id, goal_id→goals, name, color, position, is_done) — per-goal workflow stages
api_tokens         (id, user_id→users, name, token_hash, last_used_at, created_at, expires_at)
push_subscriptions (id, user_id→users, endpoint, p256dh, auth, created_at)
push_notification_log (id, user_id, type, task_id, sent_at) — dedup for push notifications
webhooks           (id, user_id→users, name, url, events JSON, secret, active, created_at)
login_attempts     (email PK, attempts, first_attempt_at, locked_until)
audit_log          (id, user_id→users[SET NULL], action, resource, resource_id, ip, ua, detail, created_at)
search_index       (FTS5 virtual table — rowid, type, id, user_id, title, note, extra)
ai_interactions    (id, user_id→users, feature, provider, prompt_hash, tokens_used, accepted, created_at)
embeddings         (id, entity_type, entity_id, user_id→users, embedding BLOB, model, updated_at)
_migrations        (name PK, applied_at) — SQL migration tracking
```

All foreign keys use `ON DELETE CASCADE` except: `audit_log.user_id` (SET NULL — preserves audit records), `settings` (no FK — uses user_id=0 for system keys).

## API Routes (224 routes across 11 modules)

See `docs/openapi.yaml` for full specification. Key modules:

| Module | Routes | Covers |
|--------|--------|--------|
| `features.js` | 75 | Habits, templates, automations, settings, planner, AI (25 endpoints), webhooks, push, gamification, attachments, custom statuses |
| `productivity.js` | 20 + 10 | Focus timer, reminders, triage, comments, milestones, daily review + advanced automation CRUD, log, templates, suggestions, toasts, testing |
| `tasks.js` | 33 | CRUD, reorder, parse (NLP), board, calendar, table, timeline, my-day, search, overdue, suggested, batch, activity feed, suggestions, upcoming |
| `lists.js` | 22 | Custom lists + list items CRUD |
| `stats.js` | 20 | Dashboard, streaks, heatmap, activity, focus stats, analytics |

| `areas.js` | 17 | Life Areas CRUD + reorder + goals association |
| `auth.js` | 14 | Register, login, logout, session, tokens, 2FA, users |
| `tags.js` | 11 | Tags CRUD + usage stats |
| `data.js` | 8 | Export, import, backup, iCal, search, Todoist/Trello import |
| `filters.js` | 7 | Saved filters + smart lists |
| `custom-fields.js` | 6 | Custom field definitions + task values CRUD |

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
| — | Reports | 7-tab view: Overview, Activity, Habits analytics, Focus, Analytics, Reviews, Notes |
| — | Settings | 8 tabs: General, Appearance, Tags, Templates, Automations, Custom Fields, Data, Shortcuts |
| — | Inbox | Quick capture inbox |
| — | Lists | Custom checklists/grocery/etc |
| — | Table | Sortable/filterable/groupable task table with pagination |
| — | Gantt | SVG timeline with task bars, today marker, area grouping |
| — | Task Planner | Hierarchical area → goal → task planner with batch move controls |
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
- Automation engine: 19 trigger types (task, goal, habit, focus, schedule, review), 19 action types, AND/OR conditions, multi-action chains, rate limiting, chain depth limiting
- 14 built-in automation templates (auto-triage, follow-up, streak celebration, etc.)
- Automation execution log with paginated history
- Template variable interpolation ({{task.title}}, {{percentage}}, etc.)
- Rule dry-run testing (preview which tasks match)
- Schedule-based triggers (daily/weekly/monthly automation firing)
- Custom fields (text, number, date, select types) with per-task values
- Table view with sortable columns, grouping, filtering, pagination
- Gantt chart V2 (SVG timeline, task bars, dependency arrows via blocked_by, progress fill, today marker, area grouping)
- Gantt bar rescheduling via drag and arrow keys
- Multi-user task assignment (assigned_to_user_id)
- Drag-and-drop reorder (list, board, weekly columns) + touch support
- Multi-select with bulk complete/delete/set priority
- Hierarchical task planner with area/goal grouping and batch move between goals
- Inline subtask expansion with drag reorder
- Starred/favorite tasks with quick-toggle icon
- Start date for task date ranges (start_date + due_date)
- Per-task activity feed from audit log (task created/updated/deleted history)
- My Day smart suggestions (scored: overdue/due/priority/starred/quick-win)
- Upcoming view (overdue + date-grouped + undated tasks)
- File attachments (upload, list, delete per task, 10 MB limit, mime-type whitelist)
- Custom statuses per goal (up to 10 workflow stages with is_done flag)
- @mentions in comments (extracted, highlighted in UI)
- Nested subtasks (parent_id, max 3 levels deep)

### Productivity
- Focus/Pomodoro timer (25/5/15 min, SVG ring, session tracking, history)
- Auto-link focus session duration to task actual_minutes on completion
- Habit tracker with daily logging and heatmaps
- Habit analytics dashboard with streak, completion-rate, and sparkline summaries
- Streak counter + GitHub-style 365-day contribution heatmap
- Gamification XP system (6 XP reasons, auto-leveling, daily/weekly completion goals)
- Web Push notifications (subscribe, test, overdue/reminder triggers)
- Notification bell with overdue/today/upcoming reminders
- Morning briefing / triage workflow
- Weekly reviews

### Organization
- Pinned life areas persisted in settings for sidebar prioritization
- Direct task quick-add from the area view with goal targeting

### Integrations
- Outbound webhooks (HMAC-SHA256 signed, configurable events, fire-and-forget)
- AI BYOK (bring your own key — encrypted AES-256-GCM key storage, rate limited 50 calls/hour)
- AI provider abstraction (OpenAI, Anthropic, Ollama, Custom) with auto-detection
- AI features: NLP capture, smart classify, goal decomposition, daily planner, next task, weekly review copilot
- AI engagement: year in review, cognitive load monitor, daily highlight, accountability check
- AI advanced: semantic search (embeddings + FTS fallback), habit coach, life balance, automation builder
- AI transparency: data minimization (strict/standard/full), prompt logging, pre-flight disclosure
- Todoist JSON import (maps projects → goals, items → tasks)
- Trello JSON import (maps lists → goals, cards → tasks)
- iCal export (VCALENDAR with RRULE for recurring)

### UX
- Toast notifications with undo (area + goal deletion restore)
- Markdown rendering in notes
- Confetti on goal 100% completion (prefers-reduced-motion respected)
- Relative date badges ("in 3 days", "2d overdue")
- Custom lists (checklists, grocery, notes, trackers with board view)
- Sectioned lists with collapsible headers and per-section progress
- Shop mode for grocery lists (full-screen, swipe between categories)
- Enhanced list items (metadata: price, URL, rating)
- Board/kanban view for tracker lists (drag between columns)
- Hide checked toggle and print view for lists
- Auto-backup (startup + 24h, rotates last 7)
- Data watermark — detects >50% data loss on startup, auto-restores from richest backup
- WAL checkpoint after auto-restore to prevent data loss on container restart
- Print stylesheet
- Responsive mobile: hamburger sidebar, bottom nav bar, touch targets ≥44px
- iOS keyboard detection, safe-area insets
- Onboarding wizard for new users
- Collapsible sidebar with section icons in icon-rail mode

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
npm test                    # Run all 6,296 tests
```

**Runner:** `node --test --test-force-exit` with `node:assert/strict` + `supertest`

**159 test files** across these categories:

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
- `docs/openapi.yaml` — Full OpenAPI 3.0.3 spec (3,163 lines)
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
- **Current:** 6,348 tests | 161 test files | 240 routes | 45 tables | ~21,000 LOC

## What Needs to Be Done (Roadmap)

### High Priority
- **Security remediation** — 115 findings from security audit (16 critical, 32 high)
- **Documentation restructure** — See `docs/DOCUMENTATION-AUDIT.md`

### Medium Priority
- **Gantt chart V2** — Dependency arrows, drag-to-reschedule, zoom levels (MVP done)
- **Attachment support** — File/image uploads on tasks

### Low Priority / Nice to Have
- **Collaboration** — Multi-user task sharing (assigned_to field exists but unused in UI)
- **Mobile app** — React Native or Capacitor wrapper
- **Calendar sync** — Google/Apple calendar two-way sync
- **API tokens** — Token-based access for programmatic use / integrations (backend done, UI pending)

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
