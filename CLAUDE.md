# LifeFlow — Claude Code Configuration

> **Last updated:** 27 March 2026 · **Version:** 0.3.0
> **Metrics:** 1,634 tests | 60 test files | 157 API routes | 26 DB tables | 10,687 LOC

## Project Overview

Personal task planner with 4-level hierarchy: Life Area → Goal → Task → Subtask.
Multi-user Express.js backend + vanilla JS SPA frontend. SQLite via better-sqlite3.
Includes authentication, habits, lists, focus timer, templates, automations, and service worker.

## Quick Start

```bash
npm install
node src/server.js          # http://localhost:3456
npm test                    # 1,692 tests via node:test
# or with Docker:
docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `DB_DIR` | Project root | Directory for `lifeflow.db` |

## Architecture

**Backend (3,839 LOC):**
```
src/
  server.js           — Express app entry, middleware setup (174 lines)
  helpers.js          — Shared utilities (146 lines)
  db/index.js         — SQLite schema, 26 tables, migrations (511 lines)
  routes/
    areas.js          — Life Areas CRUD + reorder (202 lines, 17 routes)
    auth.js           — Register, login, logout, session (183 lines, 5 routes)
    data.js           — Export, import, backup (193 lines, 6 routes)
    features.js       — Habits, templates, automations, onboarding, inbox, notes, reviews (530 lines, 25 routes)
    filters.js        — Saved filters, smart lists (134 lines, 7 routes)
    lists.js          — Custom lists + list items CRUD (328 lines, 22 routes)
    productivity.js   — Focus timer, reminders, triage, comments, milestones (207 lines, 18 routes)
    stats.js          — Dashboard, streaks, heatmap, activity, analytics (385 lines, 20 routes)
    tags.js           — Tags CRUD + stats (125 lines, 11 routes)
    tasks.js          — Tasks CRUD, reorder, parse, board, calendar (437 lines, 26 routes)
  middleware/
    auth.js           — Session-based authentication guard (91 lines)
    csrf.js           — CSRF token middleware (63 lines)
    errors.js         — Error handler (26 lines)
    validate.js       — Input validation (49 lines)
  services/
    audit.js          — Audit logging service (55 lines)
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
```

**Stack:** Node.js 22, Express 5, better-sqlite3 (WAL mode, foreign keys ON), bcryptjs, helmet, cors, vanilla JS, Inter font, Material Icons Round

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
```

All foreign keys use `ON DELETE CASCADE`.

## API Routes (157 routes across 10 modules)

See `docs/openapi.yaml` for full specification. Key modules:

| Module | Routes | Covers |
|--------|--------|--------|
| `tasks.js` | 26 | CRUD, reorder, parse (NLP), board, calendar, my-day, search, overdue |
| `features.js` | 25 | Habits, templates, automations, onboarding, inbox, notes, reviews |
| `lists.js` | 22 | Custom lists + list items CRUD |
| `stats.js` | 20 | Dashboard, streaks, heatmap, activity, focus stats, analytics |
| `productivity.js` | 18 | Focus timer, reminders, triage, comments, milestones |
| `areas.js` | 17 | Life Areas CRUD + reorder + goals association |
| `tags.js` | 11 | Tags CRUD + usage stats |
| `filters.js` | 7 | Saved filters + smart lists |
| `data.js` | 6 | Export, import, backup/restore |
| `auth.js` | 5 | Register, login, logout, session check, demo mode |

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
| — | Settings | 7 tabs: General, Appearance, Tags, Templates, Automations, Data, Shortcuts |
| — | Inbox | Quick capture inbox |
| — | Lists | Custom checklists/grocery/etc |
| — | Triage | Morning briefing / task triage |
| — | Habits | Habit tracker with daily logging |

**Shortcuts:** `N` quick capture, `M` multi-select, `Ctrl+K` search, `?` help, `Esc` close

## Features Inventory

### Core
- 4-level hierarchy: Life Area → Goal → Task → Subtask
- Multi-user authentication (bcrypt, sessions, CSRF)
- 8 themes (midnight, charcoal, nord, ocean, forest, rose, sunset, light) + auto-detect via prefers-color-scheme
- Service Worker with network-first caching, offline support, update notifications
- PWA manifest for add-to-homescreen

### Task Management
- Recurring tasks (daily/weekly/monthly/yearly/weekdays/every-N-days/weeks)
- NLP quick capture parser (dates, priorities, tags from natural text)
- Task dependencies with blocked-by indicators
- Task templates for common structures
- Automation rules (trigger → action workflows)
- Drag-and-drop reorder (list, board, weekly columns) + touch support
- Multi-select with bulk complete/delete/set priority
- Inline subtask expansion with drag reorder

### Productivity
- Focus/Pomodoro timer (25/5/15 min, SVG ring, session tracking, history)
- Habit tracker with daily logging and heatmaps
- Streak counter + GitHub-style 365-day contribution heatmap
- Notification bell with overdue/today/upcoming reminders
- Morning briefing / triage workflow
- Weekly reviews

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
npm test                    # Run all 1,692 tests
```

**Runner:** `node --test --test-force-exit` with `node:assert/strict` + `supertest`

**60 test files** across these categories:

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
- Current: 1,692 tests | 60 test files | 157 routes | 26 tables | 11,699 LOC

## What Needs to Be Done (Roadmap)

### High Priority
- **Security remediation** — 115 findings from security audit (16 critical, 32 high)
- **README.md** — Project front door (currently missing)
- **Documentation restructure** — See `docs/DOCUMENTATION-AUDIT.md`

### Medium Priority
- **Gantt chart view** — Timeline view for tasks with due dates
- **Time tracking** — Track total time spent per task (beyond Pomodoro sessions)
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
