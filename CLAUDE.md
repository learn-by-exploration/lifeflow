# LifeFlow — Claude Code Configuration

## Project Overview

Personal task planner with 4-level hierarchy: Life Area → Goal → Task → Subtask.
Express.js backend + vanilla JS single-page app frontend. SQLite via better-sqlite3.

## Quick Start

```bash
npm install
node src/server.js          # http://localhost:3456
npm test                    # 168 tests via node:test
# or with Docker:
docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `DB_DIR` | Project root | Directory for `lifeflow.db` |

## Architecture

**Two files:**
- `src/server.js` (~615 lines) — Express REST API, SQLite schema, all endpoints
- `public/index.html` (~1660 lines) — Full SPA: CSS + HTML + JS in one file

**Stack:** Node.js 22, Express 5, better-sqlite3 (WAL mode, foreign keys ON), vanilla JS, Inter font, Material Icons Round

**No build step.** Edit files, restart server (`node src/server.js`), hard-refresh browser (`Ctrl+Shift+R`).

## Database Schema (7 tables)

```
life_areas (id, name, icon, color, position, created_at)
goals      (id, area_id→life_areas, title, description, color, status, due_date, position, created_at)
tasks      (id, goal_id→goals, title, note, status[todo|doing|done], priority[0-3], due_date, recurring, assigned_to, position, my_day, created_at, completed_at)
subtasks   (id, task_id→tasks, title, note, done, position, created_at)
tags       (id, name UNIQUE, color)
task_tags  (task_id→tasks, tag_id→tags)  — M:N join
focus_sessions (id, task_id→tasks, started_at, duration_sec, type)
```

All foreign keys use `ON DELETE CASCADE`.

## API Endpoints (38 routes)

### Areas
- `GET /api/areas` — list with goal_count, pending_tasks
- `POST /api/areas` — create (name, icon, color)
- `PUT /api/areas/:id` — update
- `DELETE /api/areas/:id` — cascade delete

### Goals
- `GET /api/areas/:areaId/goals` — list with task stats
- `GET /api/goals` — all active goals (for quick capture dropdown)
- `POST /api/areas/:areaId/goals` — create
- `PUT /api/goals/:id` — update
- `DELETE /api/goals/:id` — cascade delete

### Tasks
- `GET /api/goals/:goalId/tasks` — by goal
- `GET /api/tasks/all` — all with area/goal context
- `GET /api/tasks/my-day` — my_day=1 or due today
- `GET /api/tasks/board` — filterable by area_id, priority, tag_id
- `GET /api/tasks/calendar?start=&end=` — date range
- `GET /api/tasks/overdue` — past due, not done
- `GET /api/tasks/search?q=` — search title, note, subtask title
- `GET /api/tasks/:id` — single with context
- `POST /api/goals/:goalId/tasks` — create
- `PUT /api/tasks/:id` — update (auto-spawns next recurring task on complete)
- `PUT /api/tasks/reorder` — batch position update `{items:[{id,position,due_date?}]}`
- `DELETE /api/tasks/:id`

### Subtasks
- `GET /api/tasks/:taskId/subtasks`
- `POST /api/tasks/:taskId/subtasks`
- `PUT /api/subtasks/:id`
- `DELETE /api/subtasks/:id`

### Tags
- `GET /api/tags`
- `POST /api/tags` — upsert by name
- `PUT /api/tasks/:id/tags` — replace all `{tagIds:[]}`
- `DELETE /api/tags/:id`

### Stats & Activity
- `GET /api/stats` — dashboard aggregates (total, done, overdue, byArea, byPriority, recentDone)
- `GET /api/stats/streaks` — streak, bestStreak, 365-day heatmap
- `GET /api/activity?page=&limit=` — paginated completed tasks
- `GET /api/focus/stats` — today, week totals, top tasks
- `POST /api/focus` — log focus session `{task_id, duration_sec, type}`

### NLP & Utilities
- `POST /api/tasks/parse` — NLP text→{title, priority, due_date, tags, my_day}
- `GET /api/export` — full JSON export download
- `POST /api/backup` — manual backup trigger
- `GET /api/backups` — list backup files

## Frontend Views (10)

| Key | View | Description |
|-----|------|-------------|
| `1` | My Day | Today's tasks + my_day flagged |
| `2` | All Tasks | Everything grouped by status |
| `3` | Board | Kanban (todo/doing/done) with filters |
| `4` | Calendar | Month grid with task pills |
| `5` | Dashboard | Stats, streaks, heatmap, area breakdown |
| `6` | Weekly Plan | 7-day column layout, drag to reschedule |
| `7` | Matrix | Eisenhower 2x2 urgency/importance grid |
| `8` | Activity Log | Completed tasks grouped by day |
| — | Area | Goals grid for a life area |
| — | Goal | Tasks for a specific goal (list/board tabs) |

**Other shortcuts:** `N` quick capture, `M` multi-select, `Ctrl+K` search, `?` help, `Esc` close

## Features Inventory

- 8 themes (midnight, charcoal, nord, ocean, forest, rose, sunset, light)
- Toast notifications with undo
- Recurring tasks (daily/weekly/monthly) with auto-spawn on completion
- NLP quick capture parser (dates, priorities, tags from natural text)
- Focus/Pomodoro timer (25/5/15 min modes, SVG ring, session tracking)
- Drag-and-drop task reorder + drag between weekly columns
- Multi-select with bulk complete/delete/set priority
- Markdown rendering in notes (bold, italic, code, links, headers, lists, blockquotes)
- Confetti on goal 100% completion
- Relative date badges ("in 3 days", "2d overdue", "Next Mon")
- Inline subtask expansion in task cards
- Auto-backup (startup + 24h, rotates last 7)
- Responsive mobile sidebar (hamburger + overlay)
- Google Calendar color palette for areas/goals

## Key Patterns

- `enrichTask(t)` / `enrichTasks(tasks)` — decorates each task with `tags[]`, `subtasks[]`, `subtask_done`, `subtask_total` (N+1 query pattern — known tradeoff for simplicity)
- `esc(s)` — HTML entity escaping for user content in templates
- `escA(s)` — attribute-safe escaping
- `fmtDue(d)` — relative date formatter
- `renderMd(text)` — lightweight markdown→HTML (esc first, then regex transform)
- All state is top-level `let` variables: `areas`, `goals`, `tasks`, `allTags`, `currentView`, `activeAreaId`, `activeGoalId`
- Full DOM re-render on state change via `render()` → view-specific async functions
- Express 5 wildcard: `app.get('/{*splat}', ...)` for SPA fallback

## File Organization

```
src/server.js          — Backend (all logic in one file, ~620 lines)
public/index.html      — Frontend SPA (CSS + HTML + JS, ~1661 lines)
tests/helpers.js       — Test factories, DB setup/teardown, supertest agent
tests/*.test.js        — 9 test files, 168 tests (node:test + assert/strict)
Dockerfile             — node:22-slim, npm ci, EXPOSE 3456
docker-compose.yml     — Single service, persistent volume
docs/design/           — Brainstorm spec documents (3 perspectives)
backups/               — Auto-generated JSON backups (gitignored)
```

## Testing

```bash
npm test                    # Run all 168 tests
```

**Runner:** `node --test --test-force-exit` with `node:assert/strict` + `supertest`

| Test File | Tests | Covers |
|-----------|-------|--------|
| `tests/areas.test.js` | 16 | Life Areas CRUD, cascade deletes, validation, ordering |
| `tests/goals.test.js` | 15 | Goals CRUD, computed counts, cascade, area association |
| `tests/tasks.test.js` | 28 | Tasks CRUD, recurring spawn (daily/weekly/monthly), tag copy, reorder, status transitions |
| `tests/subtasks.test.js` | 16 | Subtasks CRUD, done toggle, notes, enrichment in parent |
| `tests/tags.test.js` | 14 | Tags CRUD, dedup, sanitize, task-tag replace/clear, non-integer handling |
| `tests/views.test.js` | 21 | my-day, all, board (5 filter combos), calendar, overdue, search (subtask search, limit 50) |
| `tests/stats.test.js` | 16 | Dashboard stats, streaks/heatmap, focus sessions, activity pagination |
| `tests/nlp.test.js` | 16 | Priority, tags, 7 date formats, my_day, combined extraction, fallback |
| `tests/misc.test.js` | 10 | Backup/export, SPA fallback, unicode, concurrency, full cascade hierarchy |

**Isolation:** Each test file uses a temp DB directory (`DB_DIR` env var), `cleanDb()` in `beforeEach`, factories: `makeArea()`, `makeGoal()`, `makeTask()`, `makeSubtask()`, `makeTag()`, `linkTag()`, `makeFocus()`.

## What's Done (Shipped)

### Batch 0 — Foundation (`c8f8c3f`)
- Express 5 + better-sqlite3 backend with full REST API
- Vanilla JS SPA frontend — no framework, no build step
- 4-level hierarchy: Life Area → Goal → Task → Subtask
- 7 SQLite tables with foreign key cascades
- Board (Kanban) view, Calendar view, Dashboard view
- 8 color themes, keyboard shortcuts, Docker setup

### Batch 1 — Consensus Features (`3c5bba2`)
- Toast notifications with undo (5s timer)
- Recurring tasks (daily/weekly/monthly) with auto-spawn on completion
- NLP quick capture parser (priority, dates, tags from natural text)
- Responsive sidebar (hamburger + overlay for mobile)
- Docker Compose persistent volume

### Batch 2 — Polish Features (`ca2a917`)
- Activity log / logbook (completed tasks grouped by day, paginated)
- Focus / Pomodoro timer (25min/5min/15min, SVG ring, session tracking to DB)
- Relative date badges ("in 3 days", "2d overdue", "Next Mon")
- Clickable calendar event pills → task detail
- Dashboard drill-down (click area/priority → filtered board)
- Markdown rendering in notes (bold, italic, code, links, headers, lists, blockquotes)
- Auto-backup JSON (startup + every 24h, rotates last 7)

### Batch 3 — Power Features (`5242a75`)
- Drag-and-drop task reordering (within lists + between weekly columns)
- Weekly Planning view (7-day column layout)
- Eisenhower Matrix view (2×2 urgency/importance grid)
- Streak counter + GitHub-style contribution heatmap (365 days)
- Multi-select with bulk complete/delete/set priority
- Confetti celebration on goal 100% completion

### Documentation & Testing (`e1f43f1`, `826be3a`)
- CLAUDE.md project configuration
- 168 API tests across 9 files (100% endpoint coverage)
- Route ordering bugfix: `/search` and `/overdue` before `/:id`
- NLP bugfix: "day after tomorrow" processed before "tomorrow"

## What Needs to Be Done (Roadmap)

### High Priority
- **Data import/restore** — Currently export-only; need `POST /api/import` to restore from backup JSON
- **Task due-date reminders** — Browser notification API or in-app notification bell
- **Goal progress tracking** — Visual progress bar on goal cards (% tasks done)
- **Undo for destructive actions** — Delete area/goal currently has no undo (tasks have toast undo)
- **Task dependencies** — "blocked by" relationships between tasks

### Medium Priority
- **Drag-and-drop for subtasks** — Reorder subtasks within a task (currently only tasks support drag)
- **Task templates** — Save/apply common task structures (e.g., "Sprint Planning" with preset subtasks)
- **Recurring task improvements** — Custom intervals (every 2 weeks, specific days), skip/snooze
- **Goal archiving UI** — Backend supports `archived` status but no frontend way to archive/view archived goals
- **Tag management view** — Dedicated page to rename/recolor/merge tags (currently tag CRUD only via API)
- **Focus session history view** — See past Pomodoro sessions by day/week (data exists, no UI)
- **Search improvements** — Search within specific area/goal, filter by date range, saved searches

### Low Priority / Nice to Have
- **PWA support** — Service worker for offline, add-to-homescreen
- **Dark/light auto-detect** — Follow `prefers-color-scheme` media query
- **Keyboard-driven task creation** — Create task from keyboard without mouse (N → type → Enter)
- **Gantt chart view** — Timeline view for tasks with due dates
- **Time tracking** — Track total time spent per task (beyond Pomodoro sessions)
- **Area/goal reordering** — Drag to reorder life areas and goals (tasks already support this)
- **Attachment support** — File/image uploads on tasks
- **Collaboration** — Multi-user with task assignment (assigned_to field exists but unused in UI)
- **API authentication** — Currently no auth; add token-based access for remote use
- **Mobile app** — React Native or Capacitor wrapper

## Rules

- ALWAYS read a file before editing it
- After changing server.js, restart: `pkill -f "node src/server" && node src/server.js &`
- After changing index.html, hard-refresh browser (`Ctrl+Shift+R`) — browser caches aggressively
- Express route order matters: static routes (`/api/tasks/reorder`) MUST come before parameterized routes (`/api/tasks/:id`)
- SQLite WAL files (`.db-shm`, `.db-wal`) and `backups/` are gitignored
- No build step, no bundler, no framework — edit and reload
- `position` column exists on areas, goals, tasks, subtasks for ordering
- `completed_at` is set when task status changes to 'done'
- Recurring tasks copy tags to the auto-spawned next occurrence
