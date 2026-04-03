# Architecture

> LifeFlow system design and technical patterns.
> Updated: 3 April 2026 | Version: 0.8.2

## Overview

LifeFlow is a self-hosted personal productivity application. It consists of:

1. **Express.js REST API** — 191 routes across 11 modules
2. **Vanilla JS SPA** — No framework, no build step, direct DOM manipulation
3. **SQLite database** — better-sqlite3 with WAL mode, 35 tables
4. **Service Worker** — Network-first caching for offline support

```
┌────────────────────────┐
│   Browser (SPA)        │
│   app.js + styles.css  │
│   + Service Worker     │
├────────────────────────┤
│        HTTP / JSON     │
├────────────────────────┤
│   Express.js API       │
│   middleware → routes  │
├────────────────────────┤
│   better-sqlite3       │
│   WAL mode, 35 tables  │
└────────────────────────┘
```

## Backend Architecture

### Entry Point

`src/server.js` (284 lines) — Sets up Express, loads middleware, mounts route modules, starts the server.

### Database Layer

`src/db/index.js` — Creates database, defines 35 tables via `CREATE TABLE IF NOT EXISTS`, runs additive migrations, startup data integrity check with auto-restore from backup. Exports the `db` instance and helper functions.

**Key decisions:**
- WAL mode for concurrent reads during writes
- Foreign keys ON with CASCADE deletes
- Additive-only migrations (never drop tables)
- Single-file database for portability

### Route Modules

Each module exports an Express Router mounted on `/api`:

| Module | Routes | Responsibility |
|--------|--------|---------------|
| `routes/features.js` | 36 | Habits, templates, automations, settings, planner, AI, webhooks, push |
| `routes/tasks.js` | 30 | Core task CRUD, reorder, NLP parse, board/calendar/table/timeline views |
| `routes/lists.js` | 22 | Custom lists + list items CRUD + sharing + templates |
| `routes/stats.js` | 20 | Dashboard, streaks, heatmap, activity log, focus stats, analytics |
| `routes/productivity.js` | 20 | Inbox, notes, reviews (weekly + daily), rules |
| `routes/areas.js` | 17 | Life Areas CRUD + reorder + goals + milestones |
| `routes/auth.js` | 14 | Register, login, logout, session, 2FA, API tokens, users |
| `routes/tags.js` | 11 | Tags CRUD + usage stats |
| `routes/data.js` | 8 | Export, import, backup, iCal, search, Todoist/Trello import |
| `routes/filters.js` | 7 | Saved filters + smart lists (Stale, Quick Wins, Blocked) |
| `routes/custom-fields.js` | 6 | Custom field definitions + task values CRUD |

### Middleware Stack

Applied in order:
1. `helmet()` — Security headers
2. `express.json({ limit: '1mb' })` — Body parsing with size limit
3. `cors()` — Cross-origin support
4. `express-rate-limit` — Rate limiting
5. `express.static('public')` — Serve SPA assets
6. `middleware/auth.js` — Session validation on `/api/*` (except `/api/auth/*`)
7. `middleware/csrf.js` — CSRF token validation on state-changing requests
8. `middleware/validate.js` — Input sanitization
9. `middleware/errors.js` — Global error handler

### Authentication

Session-based authentication:
- Passwords hashed with bcryptjs (10 rounds)
- Session IDs stored in `sessions` table with expiry
- Cookie-based session transport (`lf_sid`)
- CSRF tokens required for POST/PUT/DELETE
- TOTP 2FA (RFC 6238) with setup/verify/disable
- Account lockout after failed login attempts
- API token authentication (Bearer tokens, SHA-256 hashed)

## Frontend Architecture

### Single-Page Application

`public/app.js` (5,966 lines) — All views, routing, state management, and event handling in one file.

**State management:** Top-level mutable `let` variables (`areas`, `goals`, `tasks`, `allTags`, `currentView`, `activeAreaId`, `activeGoalId`). No state library.

**Rendering:** Full DOM re-render via `render()` which dispatches to view-specific async functions (`renderToday()`, `renderBoard()`, `renderCalendar()`, etc.). Each function fetches fresh data from the API and rebuilds the DOM.

**Routing:** Hash-based switching via `currentView` string. Keyboard shortcuts (`1`–`0`) map to views.

### Key Frontend Patterns

| Pattern | Implementation |
|---------|---------------|
| HTML escaping | `esc(s)` — entity-encode user content in templates |
| Attribute escaping | `escA(s)` — attribute-safe encoding |
| Date formatting | `fmtDue(d)` — relative date badges ("in 3 days", "2d overdue") |
| Markdown | `renderMd(text)` — lightweight regex-based markdown→HTML |
| Touch DnD | `touchDnD` object — long-press polyfill for mobile drag-and-drop |
| API wrapper | `api.get()`, `api.post()`, `api.put()`, `api.delete()` — fetch with JSON, error handling |
| Toast | `showToast(msg, {undo})` — notification with optional undo callback |

### Styles

`public/styles.css` (1,342 lines) — All styles in one file with clear section comments.

- 8 theme definitions via CSS custom properties on `[data-theme="..."]`
- Responsive breakpoints: 375px, 380px, 600px, 768px, 920px, 1200px
- `@media(pointer:coarse)` for touch-specific styles
- `@media print` stylesheet
- `prefers-color-scheme` auto-detection
- `prefers-reduced-motion` respected for animations

### Service Worker

`public/sw.js` (215 lines) — Network-first caching strategy.

- Caches static assets (HTML, CSS, JS, fonts, icons)
- Serves from cache when offline
- Posts `sw-update-available` message on new version install
- App shows update toast via `initServiceWorker()` in app.js

## Database Schema

35 tables organized into 4 groups:

**Core hierarchy:** `users`, `sessions`, `life_areas`, `goals`, `tasks`, `subtasks`, `tags`, `task_tags`

**Features:** `task_deps`, `task_templates`, `task_comments`, `goal_milestones`, `inbox`, `notes`, `weekly_reviews`, `daily_reviews`

**Productivity:** `focus_sessions`, `focus_session_meta`, `focus_steps`, `habits`, `habit_logs`

**System:** `settings`, `saved_filters`, `lists`, `list_items`, `badges`, `automation_rules`, `custom_field_defs`, `task_custom_values`, `api_tokens`, `push_subscriptions`, `push_notification_log`, `webhooks`, `login_attempts`, `search_index`, `_migrations`

See CLAUDE.md for full column-level schema.

## Data Flow

```
User action → DOM event handler → api.post/put/delete()
  → Express middleware chain → Route handler → SQLite query
  → JSON response → render() → DOM update
```

All state changes go through the API. The frontend never writes to the database directly. After mutations, `render()` is called to refresh the entire view with fresh data from the server.

## Testing Strategy

- **Framework:** `node:test` (built-in) + `node:assert/strict` + `supertest`
- **Isolation:** Each test file creates a temp database directory via `DB_DIR` env var
- **Factories:** `makeArea()`, `makeGoal()`, `makeTask()`, `makeSubtask()`, `makeTag()`, `linkTag()`, `makeFocus()`
- **Cleanup:** `cleanDb()` truncates all tables in `beforeEach`
- **Frontend tests:** Static file validation (read CSS/HTML/JS, assert content with regex/string matching)
- **Coverage:** 3,500 tests across 144 files

## Known Tradeoffs

| Decision | Tradeoff | Rationale |
|----------|----------|-----------|
| Vanilla JS (no framework) | Harder to maintain at scale | Zero build step, instant reload, no toolchain |
| Single app.js file | Large file (5,966 lines) | Avoids module bundler; simple deployment |
| Full DOM re-render | Not incremental | Simpler logic; SQLite is fast enough |
| N+1 query in `enrichTasks()` | Extra DB calls | Keeps helper simple; SQLite latency is ~0ms |
| SQLite (not Postgres) | Single-writer limitation | Zero ops; backup = copy file; portability |
| No WebSocket | No real-time updates | Single-user primary use case; polling not needed |
