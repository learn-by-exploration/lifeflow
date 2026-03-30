# LifeFlow Testing Excellence — Implementation Plan

> **Spec:** [docs/design/spec.md](../design/spec.md)
> **Scope:** v0.7.26 → v0.7.50 (25 iterations, ~810 new tests)
> **Base:** v0.7.25 (2,591 tests | 117 test files)
> **Rule:** Write tests first (RED), fix code to pass (GREEN), commit with tag

---

## Global Conventions (apply to every iteration)

### Test file boilerplate
```js
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, agent, rawAgent, makeArea, makeGoal, makeTask,
        makeSubtask, makeTag, linkTag, makeFocus, makeList, makeListItem,
        makeHabit, logHabit, makeUser2, today, daysFromNow, setup } = require('./helpers');
```

### Commit flow (every iteration)
1. Create test file → run → verify RED (failures expected)
2. Fix source code → run → verify GREEN (all pass)
3. Run full suite: `npm test` — verify 0 regressions
4. Run lint: `npm run lint` — verify 0 errors
5. Update version files (see checklist below)
6. Commit and tag

### Version file checklist (every iteration)
| File | What to update |
|------|---------------|
| `package.json` | `"version": "0.7.XX"` |
| `CLAUDE.md` | Header line: version, test count, test file count |
| `CHANGELOG.md` | New section at top: `## [0.7.XX] - YYYY-MM-DD` |
| `docs/openapi.yaml` | `info.version: 0.7.XX` |

### Git commit message format
```
v0.7.XX: <Short title>

- Add <test-file>.test.js (N tests) for <topic>
- <Fix description if code changed>
- <Additional bullet points>

All M tests pass.
```

### Source files to read before ANY iteration
- `tests/helpers.js` — factory functions, agent(), makeUser2()
- `src/server.js` — middleware stack, error handler
- The specific route file(s) for the iteration

---

## v0.7.26 — Task CRUD Boundary Values

### Pre-read files
- [src/routes/tasks.js](../../src/routes/tasks.js) — POST/PUT task validation logic
- [src/schemas/tasks.schema.js](../../src/schemas/tasks.schema.js) — Zod schemas (if used)
- [src/helpers.js](../../src/helpers.js) — `isValidDate`, `isValidHHMM`, `isPositiveInt`

### Test file
**Create:** `tests/task-boundaries.test.js`

### Test structure
```
describe('Task CRUD Boundary Values')
  describe('Title boundaries')
    it('rejects empty title → 400')
    it('rejects whitespace-only title → 400')
    it('accepts 1-character title')
    it('accepts 499-character title')
    it('accepts exactly 500-character title')
    it('rejects 501-character title → 400')
    it('accepts unicode title (emoji, CJK)')
    it('accepts title with special chars (&, <, >, ")')
  describe('Note boundaries')
    it('accepts null note')
    it('accepts empty string note')
    it('accepts 4999-character note')
    it('accepts exactly 5000-character note')
    it('rejects 5001-character note → 400')
    it('accepts note with markdown content')
  describe('Priority boundaries')
    it('accepts priority 0')
    it('accepts priority 1')
    it('accepts priority 2')
    it('accepts priority 3')
    it('rejects priority -1 → 400')
    it('rejects priority 4 → 400')
    it('rejects priority null (uses default 0)')
    it('rejects boolean false priority → 400')
    it('rejects float priority 1.5 → 400')
    it('rejects string priority "2" (coerced to 2 or rejected)')
  describe('Due date boundaries')
    it('accepts null due_date')
    it('accepts today as due_date')
    it('accepts past due_date')
    it('accepts far future 9999-12-31')
    it('accepts Feb 29 2028 (leap year)')
    it('rejects Feb 29 2027 (non-leap) → 400')
    it('rejects invalid month 2026-13-01 → 400')
    it('rejects malformed date "not-a-date" → 400')
  describe('Status transitions via PUT')
    it('todo → doing')
    it('doing → done (sets completed_at)')
    it('done → todo (clears completed_at)')
    it('rejects status "cancelled" → 400')
    it('rejects null status (keeps current)')
    it('rejects empty string status → 400')
  describe('Position boundaries')
    it('accepts position 0')
    it('accepts large position 999999')
    it('handles negative position (reject or clamp)')
    it('handles float position')
  describe('estimated_minutes boundaries')
    it('accepts 0')
    it('rejects negative → 400')
    it('accepts float (rounded or accepted)')
    it('accepts null')
    it('accepts large value 99999')
```

### Endpoints tested
| Method | Endpoint | Expected |
|--------|----------|----------|
| POST | `/api/goals/:goalId/tasks` | 201 on valid, 400 on invalid |
| PUT | `/api/tasks/:id` | 200 on valid, 400 on invalid |

### Likely code fixes
- **[src/routes/tasks.js](../../src/routes/tasks.js):** May need to reject boolean priority (`typeof priority === 'boolean'` — already present), reject string priority, reject float priority
- **[src/helpers.js](../../src/helpers.js):** `isValidDate` may not reject Feb 29 on non-leap years — needs calendar-aware validation (already added in v0.7.13, verify)
- May need to cap `estimated_minutes` at a max (e.g., 99999)

---

## v0.7.27 — Area & Goal Boundary Values

### Pre-read files
- [src/routes/areas.js](../../src/routes/areas.js) — area/goal CRUD + validation
- [src/services/areas.service.js](../../src/services/areas.service.js)
- [src/schemas/areas.schema.js](../../src/schemas/areas.schema.js)

### Test file
**Create:** `tests/area-goal-boundaries.test.js`

### Test structure
```
describe('Area & Goal Boundary Values')
  describe('Area name boundaries')
    it('rejects empty name → 400')
    it('accepts 1-character name')
    it('accepts max length name (200 chars)')
    it('rejects name exceeding max → 400')
    it('accepts unicode name')
    it('accepts name with HTML entities (stored safely)')
  describe('Area icon boundaries')
    it('accepts null icon (uses default)')
    it('accepts empty icon')
    it('accepts multi-byte emoji 👨‍👩‍👧‍👦')
    it('accepts very long icon string (truncated or rejected)')
  describe('Area color boundaries')
    it('accepts null color (uses default)')
    it('accepts valid 6-char hex #FF0000')
    it('accepts valid 3-char hex #F00')
    it('rejects invalid hex #GGG → 400')
    it('rejects rgb() format → 400')
  describe('Goal title boundaries')
    it('rejects empty title → 400')
    it('accepts max length 200 chars')
    it('rejects 201 chars → 400')
    it('accepts unicode title')
    it('rejects XSS attempt in title (stored escaped or accepted and escaped on output)')
    it('trims leading/trailing whitespace')
  describe('Goal description boundaries')
    it('accepts null description')
    it('accepts empty description')
    it('accepts max length 2000 chars')
    it('rejects 2001 chars → 400')
  describe('Goal status transitions')
    it('active → completed')
    it('completed → active')
    it('rejects unknown status → 400')
    it('accepts null status (keeps current)')
  describe('Goal due_date boundaries')
    it('accepts null → no due date')
    it('accepts past due_date')
    it('accepts far future date')
    it('rejects invalid format → 400')
  describe('Milestone boundaries')
    it('rejects empty title → 400')
    it('accepts max length title')
    it('toggles done 0 → 1')
    it('respects position ordering')
```

### Endpoints tested
| Method | Endpoint | Expected |
|--------|----------|----------|
| POST | `/api/areas` | 201 on valid, 400 on invalid |
| PUT | `/api/areas/:id` | 200 on valid, 400 on invalid |
| POST | `/api/areas/:areaId/goals` | 201 on valid, 400 on invalid |
| PUT | `/api/goals/:id` | 200 on valid |
| POST | `/api/goals/:id/milestones` | 201 on valid, 400 on invalid |
| PUT | `/api/milestones/:id` | 200 |

### Likely code fixes
- **[src/routes/areas.js](../../src/routes/areas.js):** Icon field may need length truncation; area name may need length validation if not present
- **[src/schemas/areas.schema.js](../../src/schemas/areas.schema.js):** May need to add `max()` length on area name

---

## v0.7.28 — Subtask & Tag Boundary Values

### Pre-read files
- [src/routes/tags.js](../../src/routes/tags.js) — subtask + tag routes
- [src/services/tags.service.js](../../src/services/tags.service.js)
- [src/schemas/tags.schema.js](../../src/schemas/tags.schema.js)

### Test file
**Create:** `tests/subtask-tag-boundaries.test.js`

### Test structure
```
describe('Subtask & Tag Boundary Values')
  describe('Subtask title')
    it('rejects empty title → 400')
    it('accepts very long title (500 chars)')
    it('accepts unicode title')
    it('rejects whitespace-only title → 400')
    it('stores HTML safely')
  describe('Subtask note')
    it('accepts null note')
    it('accepts empty note')
    it('accepts long note')
  describe('Subtask done toggle')
    it('0 → 1 via PUT')
    it('1 → 0 via PUT')
    it('null done treated as no change')
    it('rejects invalid value (string)')
  describe('Subtask position')
    it('reorders to 0')
    it('handles duplicate positions gracefully')
    it('handles gaps in positions')
  describe('Tag name boundaries')
    it('rejects empty name → 400')
    it('creates tag with unicode name')
    it('creates tag with special characters')
    it('accepts max length name')
    it('handles duplicate name (returns existing or 409)')
    it('tag name is case-sensitive or case-insensitive (document behavior)')
  describe('Tag color')
    it('accepts valid hex')
    it('rejects invalid hex → 400')
    it('uses default color when null')
    it('rejects empty string color → 400')
  describe('Task-tag associations')
    it('adding duplicate tag is idempotent')
    it('adding tag from other user → ignored or 403')
    it('removing non-existent tag link → no error')
    it('setting empty tagIds array clears all tags')
    it('setting tagIds with invalid IDs → ignored')
    it('many tags per task (e.g., 20)')
  describe('Subtask on deleted task')
    it('create subtask on non-existent task → 404')
    it('GET subtasks on non-existent task → 404')
    it('PUT subtask on non-existent task → 404')
    it('DELETE subtask on non-existent task → 404')
```

### Endpoints tested
| Method | Endpoint | Expected |
|--------|----------|----------|
| POST | `/api/tasks/:taskId/subtasks` | 201, 400, 404 |
| PUT | `/api/subtasks/:id` | 200, 404 |
| DELETE | `/api/subtasks/:id` | 200, 404 |
| POST | `/api/tags` | 201 or 200 (existing), 400 |
| PUT | `/api/tags/:id` | 200, 400 |
| PUT | `/api/tasks/:id/tags` | 200 |

### Likely code fixes
- Tag name max length may not be validated — add in `tags.schema.js` or `tags.service.js`
- Subtask note field may not exist on PUT route

---

## v0.7.29 — Task Status State Machine

### Pre-read files
- [src/routes/tasks.js](../../src/routes/tasks.js) — PUT `/api/tasks/:id` status logic, `completed_at` handling
- [src/services/recurring.service.js](../../src/services/recurring.service.js) — `spawnNext()`
- [src/routes/stats.js](../../src/routes/stats.js) — `/api/stats`, `/api/activity`
- [src/routes/productivity.js](../../src/routes/productivity.js) — automation rules `executeRules()`

### Test file
**Create:** `tests/task-state-machine.test.js`

### Test structure
```
describe('Task Status State Machine')
  describe('Valid transitions')
    it('todo → doing: status updated')
    it('doing → done: sets completed_at to ISO string')
    it('todo → done: sets completed_at')
    it('done → todo: clears completed_at')
    it('done → doing: clears completed_at')
    it('doing → todo: status updated, no completed_at change')
  describe('completed_at lifecycle')
    it('completed_at is null on creation')
    it('completed_at set when status → done')
    it('completed_at is valid ISO 8601 string')
    it('completed_at cleared when reopened (done → todo)')
    it('completed_at not changed on update without status change')
    it('re-completing a task updates completed_at to new time')
  describe('Recurring task spawn on complete')
    it('daily recurring: spawns next with +1 day due_date')
    it('weekly recurring: spawns next with +7 days due_date')
    it('monthly recurring: spawns next with +1 month')
    it('yearly recurring: spawns next with +1 year')
    it('spawned task copies tags')
    it('spawned task copies subtasks with done=0')
    it('spawned task copies custom field values')
    it('spawned task has status=todo, my_day=0')
  describe('Bulk status changes')
    it('PUT /api/tasks/bulk with status=done sets completed_at on all')
    it('bulk reopen (status=todo) clears completed_at')
    it('bulk with mixed statuses works correctly')
    it('bulk with empty ids → 400')
  describe('Stats integration')
    it('complete task → /api/stats done count increments')
    it('reopen task → /api/stats done count decrements')
    it('complete task → appears in /api/activity')
    it('reopen task → removed from /api/activity')
    it('complete task → appears in /api/stats/streaks heatmap for today')
    it('complete task → increments thisWeek count')
  describe('My-day interaction')
    it('completing a task preserves my_day flag')
    it('spawned recurring task has my_day=0 (not inherited)')
    it('my_day can be set on done task')
    it('my_day can be cleared on todo task')
    it('GET /api/tasks/my-day includes due-today tasks')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| PUT | `/api/tasks/:id` |
| PUT | `/api/tasks/bulk` |
| GET | `/api/stats` |
| GET | `/api/activity` |
| GET | `/api/stats/streaks` |
| GET | `/api/tasks/my-day` |

### Likely code fixes
- **[src/routes/tasks.js](../../src/routes/tasks.js):** `completed_at` may not be cleared properly on `done → doing` transition. Current code: `status && status!=='done' ? null : ex.completed_at` — this should clear it for both `todo` and `doing`
- Stats may count reopened tasks incorrectly because `completed_at` is cleared but the task may still appear in some queries

---

## v0.7.30 — API Contract Tests (Response Shapes)

### Pre-read files
- All route files in `src/routes/` (tasks, areas, features, lists, stats, productivity, tags, filters, custom-fields, data, auth)
- [src/helpers.js](../../src/helpers.js) — `enrichTask()` return shape

### Test file
**Create:** `tests/api-contracts.test.js`

### Test structure
```
describe('API Contract Tests')
  describe('Task response shape')
    it('GET /api/tasks/:id has id, title, note, status, priority, due_date, tags[], subtasks[]')
    it('POST /api/goals/:goalId/tasks returns 201 with full task object')
    it('PUT /api/tasks/:id returns full task object')
    it('GET /api/tasks/all returns array with enriched fields')
    it('GET /api/tasks/all?limit=10 returns { items, total, hasMore, offset }')
    it('GET /api/tasks/board returns enriched array with area_id, goal_title')
    it('GET /api/tasks/table returns { tasks, total, groups }')
    it('DELETE /api/tasks/:id returns { ok: true }')
  describe('Area/Goal response shape')
    it('GET /api/areas returns array with id, name, icon, color, position')
    it('POST /api/areas returns 201 with area object')
    it('GET /api/areas/:areaId/goals returns array with goal objects')
    it('POST /api/areas/:areaId/goals returns 201 with goal object')
    it('DELETE /api/areas/:id returns { ok: true }')
    it('DELETE /api/goals/:id returns { ok: true }')
  describe('Tag/Filter response shape')
    it('GET /api/tags returns array with id, name, color')
    it('POST /api/tags returns tag object (201 if new, 200 if existing)')
    it('GET /api/filters returns array with filter objects')
    it('POST /api/filters returns 201 with filter object')
  describe('List/Item response shape')
    it('GET /api/lists returns array with item_count, checked_count')
    it('POST /api/lists returns 201 with list object')
    it('GET /api/lists/:id/items returns array of items')
    it('POST /api/lists/:id/items returns 201 with item object')
  describe('Auth response shape')
    it('POST /api/auth/login returns { user: { id, email, display_name, created_at } }')
    it('POST /api/auth/register returns 201 with { user }')
    it('GET /api/auth/me returns { user: { id, email, display_name, created_at, last_login } }')
    it('POST /api/auth/tokens returns 201 with { id, name, token, expires_at }')
  describe('Stats response shape')
    it('GET /api/stats returns { total, done, overdue, dueToday, thisWeek, byArea, byPriority, recentDone }')
    it('GET /api/stats/streaks returns { streak, bestStreak, heatmap[] }')
    it('GET /api/stats/trends returns array of { week_start, week_end, completed }')
    it('GET /api/stats/time-analytics returns { byArea, byHour, weeklyVelocity, accuracy }')
    it('GET /api/stats/balance returns { areas, total, dominant, lowest }')
    it('GET /api/focus/stats returns { today, week, sessions, byTask }')
  describe('Focus response shape')
    it('POST /api/focus returns 201 with { id, task_id, duration_sec, type, started_at }')
    it('GET /api/focus/history returns { total, page, pages, items, daily }')
    it('GET /api/focus/insights returns { peakHours, byStrategy, avgRating, completionRate }')
    it('GET /api/focus/goal returns { goalMinutes, todayMinutes, todaySec, pct }')
  describe('Error response shape')
    it('400 response always has { error: string }')
    it('404 response always has { error: string }')
    it('401 response has { error: string }')
    it('403 response has { error: string }')
    it('409 response has { error: string }')
    it('500 response never contains stack traces')
    it('invalid JSON body → 400 with { error }, not 500')
    it('error responses have Content-Type: application/json')
  describe('Pagination contract')
    it('/api/tasks/all?limit=10 returns total, hasMore, offset')
    it('/api/activity?page=1&limit=5 returns total, page, pages, items')
    it('/api/focus/history?page=1&limit=5 returns total, page, pages, items, daily')
    it('/api/tasks/recurring?limit=10 returns items, total, hasMore, offset')
    it('page=0 is treated as page=1')
    it('limit=0 is clamped to 1')
  describe('Status code consistency')
    it('all POST create endpoints return 201')
    it('all PUT update endpoints return 200')
    it('delete endpoints return 200 with { ok/deleted }')
    it('validation errors return 400')
    it('not found errors return 404')
  describe('Content-Type headers')
    it('all JSON responses have Content-Type: application/json')
    it('GET /api/export/ical has Content-Type: text/calendar')
    it('GET /api/export has Content-Disposition: attachment')
```

### Likely code fixes
- Some endpoints may return 200 instead of 201 on create — check POST routes for `res.json()` vs `res.status(201).json()`
- Some delete endpoints may return `{ ok: true }` vs `{ deleted: true }` — standardize

---

## v0.7.31 — Content-Type & Request Body Enforcement

### Pre-read files
- [src/server.js](../../src/server.js) — `express.json()` config, middleware stack
- [src/middleware/errors.js](../../src/middleware/errors.js) — error handler

### Test file
**Create:** `tests/content-type-enforcement.test.js`

### Test structure
```
describe('Content-Type & Request Body Enforcement')
  describe('POST without Content-Type')
    it('POST /api/areas with no Content-Type and raw body → 400 or parses')
    it('POST /api/goals/:id/tasks with text body → rejects')
    it('POST /api/auth/login with form body → behavior documented')
    it('PUT /api/tasks/:id with no Content-Type → behavior documented')
  describe('POST with wrong Content-Type')
    it('POST with text/plain → 400')
    it('POST with application/x-www-form-urlencoded → 400 or ignored')
    it('POST with multipart/form-data → 400')
  describe('Request size limits')
    it('1KB body accepted')
    it('100KB body accepted')
    it('1MB body within limit')
    it('very large body (>limit) → 413 Payload Too Large')
    it('express.json limit configured')
    it('limit applies to all POST/PUT routes')
  describe('Empty/malformed body')
    it('POST with empty body {} to create endpoint → 400 (missing required fields)')
    it('POST with array body where object expected → 400')
    it('PUT with null body → behavior documented')
    it('deeply nested JSON (100 levels) → no crash')
  describe('Non-JSON content handling')
    it('POST with XML body → 400')
    it('POST with binary body → 400')
```

### Endpoints tested
All POST/PUT endpoints — tested via a representative sample from each route module.

### Likely code fixes
- **[src/server.js](../../src/server.js):** May need to add explicit `app.use(express.json({ limit: '1mb' }))` if not already configured
- May need content-type checking middleware (Express 5 may handle this differently)

---

## v0.7.32 — CORS Exhaustive Scenarios

### Pre-read files
- [src/server.js](../../src/server.js) — CORS middleware configuration
- [src/config.js](../../src/config.js) — `ALLOWED_ORIGINS` env var
- Existing `tests/cors.test.js` — avoid duplicate coverage

### Test file
**Create:** `tests/cors-exhaustive.test.js`

### Test structure
```
describe('CORS Exhaustive Scenarios')
  describe('Preflight OPTIONS request')
    it('OPTIONS /api/tasks returns correct CORS headers')
    it('OPTIONS with valid Origin → allowed')
    it('OPTIONS with no Origin → behavior documented')
    it('OPTIONS with invalid Origin → not allowed')
  describe('Access-Control headers')
    it('Access-Control-Allow-Origin set correctly')
    it('Access-Control-Allow-Methods includes GET,POST,PUT,DELETE,PATCH')
    it('Access-Control-Allow-Headers includes Content-Type, Cookie')
    it('Access-Control-Allow-Credentials set when needed')
    it('Access-Control-Max-Age set for caching')
  describe('Credentials behavior')
    it('wildcard * origin not used with credentials')
    it('specific origin echoed back when credentials needed')
    it('no Allow-Credentials on public endpoints')
  describe('ALLOWED_ORIGINS env var')
    it('single origin allowed')
    it('multiple comma-separated origins allowed')
    it('unlisted origin rejected')
    it('empty ALLOWED_ORIGINS allows all (development mode)')
  describe('Cross-origin cookie handling')
    it('SameSite=Strict prevents cross-origin cookie sending')
    it('login sets cookie accessible on same origin')
    it('CORS + cookie tested together')
  describe('Public endpoint CORS')
    it('/health returns correct CORS for any origin')
    it('/api/shared/:token accessible cross-origin')
    it('static files have correct CORS or no CORS')
```

### Endpoints tested
All routes via OPTIONS, plus specific GET/POST with Origin headers.

### Likely code fixes
- CORS config may need tightening for production
- Public endpoints may need separate CORS middleware

---

## v0.7.33 — Import/Export Roundtrip Fidelity

### Pre-read files
- [src/routes/data.js](../../src/routes/data.js) — `/api/export`, `/api/import`, `/api/import/todoist`, `/api/import/trello`, `/api/export/ical`
- Existing `tests/export-import.test.js` and `tests/import-export-extensive.test.js` — avoid duplication

### Test file
**Create:** `tests/import-export-roundtrip.test.js`

### Test structure
```
describe('Import/Export Roundtrip Fidelity')
  describe('Full roundtrip')
    it('create full dataset → export → wipe → import → export again → compare field by field')
    it('export includes all 20+ entity types')
    it('import with confirm != DESTROY_ALL_DATA → 403')
    it('roundtrip preserves entity count exactly')
  describe('Per-entity roundtrip')
    it('areas roundtrip: name, icon, color, position preserved')
    it('goals roundtrip: title, description, color, status, due_date preserved')
    it('tasks roundtrip: all fields including recurring, time_block, estimated_minutes')
    it('tags roundtrip: name, color preserved')
    it('subtasks roundtrip: title, done, position preserved')
    it('habits roundtrip: name, frequency, target, area_id remapped')
    it('habit_logs roundtrip: date, count preserved')
    it('notes roundtrip: title, content, goal_id remapped')
    it('lists roundtrip: name, type, icon, color preserved')
    it('list_items roundtrip: title, checked, category, quantity preserved')
  describe('ID remapping')
    it('tags get new IDs; task_tags use remapped IDs')
    it('areas get new IDs; goals use remapped area IDs')
    it('goals get new IDs; tasks use remapped goal IDs')
    it('custom field defs remapped; task_custom_values use remapped IDs')
  describe('Custom field roundtrip')
    it('custom field defs survive roundtrip')
    it('task custom values survive roundtrip')
    it('select-type field options JSON preserved')
  describe('Corrupt import handling')
    it('missing areas → 400')
    it('orphan tasks (goal_id not in import) → skipped silently')
    it('invalid JSON body → 400')
    it('very large payload (1000 areas) → accepted or capped')
    it('empty arrays → 400 for core (areas/goals/tasks)')
  describe('Todoist import')
    it('valid Todoist JSON → creates area, goals from projects, tasks from items')
    it('empty items → { imported: 0 }')
    it('priority mapping: Todoist 4 → LF 3, Todoist 1 → LF 0')
    it('checked items → status done')
  describe('Trello import')
    it('valid Trello JSON → creates area, goals from lists, tasks from cards')
    it('empty cards → { imported: 0 }')
    it('closed cards → status done')
  describe('iCal export')
    it('GET /api/export/ical returns valid VCALENDAR')
    it('Content-Type is text/calendar')
    it('recurring tasks have RRULE')
    it('high priority tasks have PRIORITY:1')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| GET | `/api/export` |
| POST | `/api/import` |
| POST | `/api/import/todoist` |
| POST | `/api/import/trello` |
| GET | `/api/export/ical` |

### Likely code fixes
- **[src/routes/data.js](../../src/routes/data.js):** Task dependencies (`task_deps`) may not be included in export — verify and add if missing
- Weekly reviews may not roundtrip correctly (field names may differ)
- `focus_session_meta` and `focus_steps` likely not exported — may need to add

---

## v0.7.34 — Recurring Task Spawn Edge Cases

### Pre-read files
- [src/services/recurring.service.js](../../src/services/recurring.service.js) — `spawnNext()` method
- [src/routes/tasks.js](../../src/routes/tasks.js) — recurring field validation, spawn trigger on PUT
- [src/schemas/tasks.schema.js](../../src/schemas/tasks.schema.js) — `validateRecurring()`
- [src/helpers.js](../../src/helpers.js) — `nextDueDate()`

### Test file
**Create:** `tests/recurring-spawn-edges.test.js`

### Test structure
```
describe('Recurring Task Spawn Edge Cases')
  describe('Spawn with all relations')
    it('spawned task copies tags')
    it('spawned task copies subtasks with done=0')
    it('spawned task copies custom field values')
    it('spawned task does NOT copy comments (by design)')
    it('spawned task copies list_id')
  describe('Next due date calculation')
    it('daily: due 2026-03-30 → next 2026-03-31')
    it('weekly: due Monday → next Monday')
    it('monthly: due Jan 31 → Feb 28 (not Feb 31)')
    it('monthly: due Jan 30 → Feb 28 in non-leap year')
    it('yearly: due Feb 29 2028 → Feb 28 2029')
    it('every-N-days: interval=3, due Mar 30 → Apr 2')
    it('weekdays: due Friday → next Monday')
    it('null due_date → null next (no spawn)')
  describe('Skip + spawn')
    it('POST /api/tasks/:id/skip marks done + spawns next')
    it('skip sets completed_at')
    it('skip returns { skipped, next }')
  describe('Spawn idempotency')
    it('completing already-done task does NOT double-spawn')
    it('rapid PUT done/todo/done → only 1 spawn per transition')
    it('PUT with same status (done → done) → no spawn')
  describe('Recurring with dependencies')
    it('spawned task does NOT copy dependencies')
    it('blocked-by references remain on original task')
    it('spawned task has no blocked_by')
  describe('Recurring JSON validation')
    it('"daily" string accepted')
    it('"weekly" string accepted')
    it('{"type":"every","interval":3,"unit":"days"} accepted')
    it('invalid JSON → 400')
    it('missing required fields in JSON object → 400')
    it('negative interval → 400')
    it('{"type":"every","interval":0,"unit":"days"} → 400')
  describe('Spawn preserves fields')
    it('spawned task has same priority')
    it('spawned task has my_day=0')
    it('spawned task has status=todo')
    it('spawned task has same estimated_minutes')
    it('spawned task increments occurrence count in recurring JSON')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| PUT | `/api/tasks/:id` (with status=done) |
| POST | `/api/tasks/:id/skip` |
| POST | `/api/goals/:goalId/tasks` (with recurring field) |

### Likely code fixes
- **[src/services/recurring.service.js](../../src/services/recurring.service.js):** Custom field values are already copied (verified in source). Comments NOT copied (by design). Verify `list_id` is copied (yes, it is in the source)
- **[src/helpers.js](../../src/helpers.js):** `nextDueDate()` month rollover (Jan 31 → Feb) may need fixing

---

## v0.7.35 — Frontend JS Unit Tests (esc, fmtDue, renderMd)

### Pre-read files
- [public/js/utils.js](../../public/js/utils.js) — `esc()`, `escA()`, `fmtDue()`, `renderMd()`, `isValidHexColor()` (if exists)
- [public/app.js](../../public/app.js) — NLP parser logic, `isValidHexColor()`

### Test file
**Create:** `tests/frontend-units.test.js`

### Implementation note
These functions use `document.createElement` (esc) which isn't available in Node.js. The tests need to either:
1. Extract pure-function equivalents that don't need DOM
2. Use a minimal DOM shim
3. Test the server-side equivalents
4. Use regex-based re-implementations for testing

Best approach: Import the functions using a pattern that replaces DOM calls, OR test the logic by calling the API endpoints that use server-side escaping, OR create a Node-compatible version of these functions for testing.

### Test structure
```
describe('Frontend JS Unit Tests')
  describe('esc() HTML escaping')
    it('escapes < to &lt;')
    it('escapes > to &gt;')
    it('escapes & to &amp;')
    it('escapes " to &quot;')
    it('escapes <script>alert(1)</script>')
    it('handles null/undefined → empty string or throws')
    it('handles number input → string conversion')
    it('handles empty string → empty string')
  describe('escA() attribute escaping')
    it('escapes double quotes')
    it('escapes single quotes &#39;')
    it('escapes ampersand')
    it('handles null → "null" or empty')
    it('escapes backticks')
  describe('fmtDue() relative date formatting')
    it('today → "Today"')
    it('tomorrow → "Tomorrow"')
    it('yesterday → "Yesterday"')
    it('+3 days → "in 3 days"')
    it('-3 days → "3d overdue"')
    it('+7 days → "Next week"')
    it('null → empty string')
    it('empty string → empty string')
    it('invalid date → behavior documented')
    it('far future → formatted date string')
  describe('renderMd() markdown rendering')
    it('**bold** → <strong>bold</strong>')
    it('*italic* → <em>italic</em>')
    it('[link](url) → <a href="url">link</a>')
    it('`code` → <code>code</code>')
    it('- list item → <li>list item</li> wrapped in <ul>')
    it('# heading → <h1>heading</h1>')
    it('XSS via markdown link [x](javascript:alert(1)) → escaped')
    it('empty input → empty string')
    it('null → empty string')
    it('nested **bold *italic*** → correct nesting')
  describe('isValidHexColor()')
    it('#FFF → true')
    it('#FFFFFF → true')
    it('#fff → true')
    it('#GGG → false')
    it('empty → false')
    it('no hash → false')
  describe('NLP parser edge cases')
    it('"buy milk tomorrow p1 #groceries" → title, due, priority, tag')
    it('"meeting next monday" → title with next monday date')
    it('"p2 #work review docs in 5 days" → all fields extracted')
    it('empty string → 400')
    it('only tags "#a #b" → title is empty or original text')
    it('emoji in title "🎉 celebrate today" → preserved')
    it('"day after tomorrow" → correct date')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| POST | `/api/tasks/parse` (NLP) |

### Likely code fixes
- **[public/js/utils.js](../../public/js/utils.js):** `renderMd` may pass through `javascript:` URLs — need to strip them
- NLP parser may not handle "day after tomorrow" correctly

---

## v0.7.36 — Tag/Filter/Custom-Field Interactions

### Pre-read files
- [src/routes/filters.js](../../src/routes/filters.js) — filter execution, smart lists, counts
- [src/routes/custom-fields.js](../../src/routes/custom-fields.js)
- [src/services/filters.service.js](../../src/services/filters.service.js)
- [src/services/tags.service.js](../../src/services/tags.service.js)

### Test file
**Create:** `tests/tag-filter-field-interactions.test.js`

### Test structure
```
describe('Tag/Filter/Custom-Field Interactions')
  describe('Filter by tag')
    it('GET /api/filters/execute?tag_id=X returns only tagged tasks')
    it('filter with multiple tags (AND behavior)')
    it('deleting a tag → filter results update (no phantom matches)')
    it('renaming tag → filter still works')
    it('tag_id filter + status filter combined')
  describe('Filter by custom field')
    it('filter by select field value')
    it('filter with number-type custom field')
    it('filter with date-type custom field')
    it('filter with text-type custom field')
  describe('Smart filters')
    it('GET /api/filters/smart/stale returns tasks older than staleDays setting')
    it('GET /api/filters/smart/quickwins returns unblocked tasks with estimated_minutes ≤ setting')
    it('GET /api/filters/smart/blocked returns tasks with unresolved dependencies')
    it('filter counts match actual result counts')
    it('smart filter with 0 results returns empty array')
  describe('Custom field lifecycle')
    it('create custom field → set value on task → update value → read back')
    it('delete field def → task custom values cascade deleted')
    it('create new field with same name → old values not restored')
    it('required field enforcement on task')
  describe('Tag stats accuracy')
    it('GET /api/tags/stats returns correct usage count after task creation')
    it('usage count updates after task deletion')
    it('tag with 0 usage shows count=0')
    it('bulk tag operations update stats correctly')
  describe('Filter execution')
    it('complex multi-field filter returns correct results')
    it('filter returns empty array for no matches')
    it('filter with invalid params returns all or 400')
    it('filter pagination with limit')
  describe('Custom field types')
    it('text field: stores and retrieves string')
    it('number field: stores and retrieves number')
    it('date field: stores and retrieves YYYY-MM-DD')
    it('select field: only accepts defined options')
  describe('Cross-entity filters')
    it('filter by area_id + priority + tag + status')
    it('filter counts endpoint matches execute results')
    it('saved filter can be created and executed')
    it('saved filter survives update')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| GET | `/api/filters/execute` |
| GET | `/api/filters/smart/:type` |
| GET | `/api/filters/counts` |
| GET/POST/PUT/DELETE | `/api/custom-fields` |
| PUT | `/api/tasks/:id/custom-fields` |
| GET | `/api/tags/stats` |

### Likely code fixes
- Filter counts may miscalculate on complex filters with multiple WHERE conditions
- Custom field deletion CASCADE may not clean up `task_custom_values` (verify via FK)

---

## v0.7.37 — Multi-User Isolation Exhaustive

### Pre-read files
- All route files — check every query for `user_id` / `req.userId` scoping
- [tests/multi-user.test.js](../../tests/multi-user.test.js) — existing coverage (avoid duplication)
- [tests/idor-comprehensive.test.js](../../tests/idor-comprehensive.test.js)

### Test file
**Create:** `tests/multi-user-exhaustive.test.js`

### Test structure
```
describe('Multi-User Isolation Exhaustive')
  describe('Data isolation per entity')
    it('areas: user B cannot list user A areas')
    it('goals: user B cannot GET user A goals')
    it('tasks: user B cannot GET user A tasks')
    it('subtasks: user B cannot access user A subtasks')
    it('tags: user B cannot see user A tags')
    it('habits: user B cannot see user A habits')
    it('habit_logs: logging user A habit as user B → 404')
    it('notes: user B cannot see user A notes')
    it('lists: user B cannot access user A lists')
    it('list_items: user B cannot modify user A list items')
    it('focus_sessions: user B cannot access user A sessions')
    it('custom_fields: user B cannot see user A custom fields')
    it('templates: user B cannot access user A templates')
    it('automations: user B cannot access user A automation rules')
  describe('Search isolation')
    it('GET /api/search only returns requesting user results')
    it('GET /api/tasks/search only returns requesting user tasks')
    it('search with other user task title → empty results')
  describe('Stats isolation')
    it('GET /api/stats only counts requesting user tasks')
    it('GET /api/stats/streaks only counts requesting user completions')
    it('GET /api/activity only shows requesting user completions')
    it('GET /api/focus/stats only counts requesting user sessions')
  describe('Export/Import isolation')
    it('GET /api/export only exports requesting user data')
    it('POST /api/import only replaces requesting user data')
  describe('Shared list access')
    it('shared list token grants read access without auth')
    it('shared list token cannot access non-shared lists')
    it('unsharing a list makes token invalid')
  describe('Demo mode isolation')
    it('POST /api/demo/start creates data for requesting user only')
    it('POST /api/demo/reset deletes only requesting user data')
  describe('Inbox/triage isolation')
    it('inbox items scoped to user')
    it('triage to other user goal → 403')
    it('triage to own goal → 201')
  describe('Badge isolation')
    it('badges earned by user A not visible to user B')
    it('badge check counts only requesting user tasks')
  describe('Settings isolation')
    it('settings changes scoped per user')
    it('user A theme change does not affect user B')
```

### Endpoints tested
All endpoints, tested with two users via `makeUser2()`.

### Likely code fixes
- Badge check queries may not include `AND user_id=?` in all counts (verify)
- Demo start/reset may affect all users (verify transaction scoping)

---

## v0.7.38 — Habit System Edge Cases

### Pre-read files
- [src/routes/features.js](../../src/routes/features.js) — Habit GET/POST/PUT/DELETE, log, undo, heatmap
- Existing `tests/habits.test.js` and `tests/exhaustive-habits.test.js`

### Test file
**Create:** `tests/habit-edges.test.js`

### Test structure
```
describe('Habit System Edge Cases')
  describe('Streak calculation')
    it('streak starts from today if logged today')
    it('streak starts from yesterday if not logged today but logged yesterday')
    it('gap in logs resets streak to 0')
    it('best streak tracked across all time')
    it('streak with target>1: only counts if count >= target')
    it('365-day heatmap returns up to 365 entries')
  describe('Multi-target habits')
    it('target=3: log 1 time → not completed')
    it('target=3: log 3 times → completed')
    it('undo log reduces count by 1')
    it('undo when count=1 → deletes log entry')
  describe('Frequency types')
    it('daily habit → no schedule_days validation')
    it('weekly habit with schedule_days [mon,wed,fri] accepted')
    it('monthly habit with schedule_days [1,15] accepted')
    it('invalid frequency → 400')
  describe('Habit log boundaries')
    it('double-log same day → increments count')
    it('undo when count=1 → deletes entry')
    it('undo when no log exists → graceful (200 { ok: true })')
    it('log future date → accepted')
    it('log very old date → accepted')
  describe('Archived habits')
    it('GET /api/habits excludes archived habits')
    it('heatmap still accessible for archived habit')
    it('unarchive (archived=0) restores to GET list')
  describe('Habit area association')
    it('habit with area_id returns area_name, area_icon')
    it('area deletion sets habit area_id to null or cascades')
    it('invalid area_id → 400')
  describe('Heatmap data')
    it('GET /api/habits/:id/heatmap returns last 90 days')
    it('empty heatmap returns empty array')
    it('many logs return correct counts')
  describe('preferred_time validation')
    it('"14:30" → accepted')
    it('"25:00" → 400')
    it('"abc" → 400')
    it('null → accepted')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| GET/POST/PUT/DELETE | `/api/habits` |
| POST | `/api/habits/:id/log` |
| DELETE | `/api/habits/:id/log` (undo) |
| GET | `/api/habits/:id/heatmap` |

### Likely code fixes
- Undo when no log may throw a DB error instead of returning `{ ok: true }`
- Archived habit heatmap may return 404 if the GET check filters by `archived=0`

---

## v0.7.39 — Focus System Edge Cases

### Pre-read files
- [src/routes/stats.js](../../src/routes/stats.js) — Focus CRUD, stats, history, insights, streak, goal, meta, steps
- Existing `tests/focus-system.test.js` and `tests/focus-enhanced.test.js`

### Test file
**Create:** `tests/focus-edges.test.js`

### Test structure
```
describe('Focus System Edge Cases')
  describe('Focus session lifecycle')
    it('POST /api/focus creates session with started_at')
    it('PUT /api/focus/:id/end sets ended_at and updates task actual_minutes')
    it('actual_minutes increments (does not replace)')
    it('DELETE /api/focus/:id deletes session')
    it('deleting session does not reduce task actual_minutes')
  describe('Focus meta boundaries')
    it('focus_rating 0 → accepted')
    it('focus_rating 5 → accepted')
    it('focus_rating -1 → 400')
    it('focus_rating 6 → 400')
    it('intention max length accepted')
    it('reflection max length accepted')
    it('strategy field accepted')
  describe('Focus steps lifecycle')
    it('POST /api/focus/:id/steps creates steps')
    it('PUT /api/focus/steps/:stepId toggles done')
    it('toggling sets completed_at, toggling back clears it')
    it('duplicate step titles accepted')
  describe('Focus streak')
    it('consecutive days with sessions → streak count matches')
    it('gap resets streak')
    it('best streak tracks historical max')
    it('heatmap includes all days with sessions')
  describe('Focus insights')
    it('peak hours with no data → empty array')
    it('by-strategy aggregation returns all strategies')
    it('completion rate calculates correctly')
  describe('Focus daily goal')
    it('default goal is 120 minutes')
    it('custom goal from settings respected')
    it('progress percentage caps at 100')
  describe('Focus stats accuracy')
    it('today/week aggregation correct')
    it('by-task breakdown sums correctly')
    it('sessions count for today correct')
  describe('Focus with task deletion')
    it('delete task → focus sessions remain (orphaned but queryable)')
    it('focus history may show NULL task_title for deleted tasks')
    it('focus stats still count orphaned sessions')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| POST | `/api/focus` |
| PUT | `/api/focus/:id` |
| PUT | `/api/focus/:id/end` |
| DELETE | `/api/focus/:id` |
| POST | `/api/focus/:id/meta` |
| GET | `/api/focus/:id/meta` |
| POST | `/api/focus/:id/steps` |
| GET | `/api/focus/:id/steps` |
| PUT | `/api/focus/steps/:stepId` |
| GET | `/api/focus/stats` |
| GET | `/api/focus/history` |
| GET | `/api/focus/insights` |
| GET | `/api/focus/streak` |
| GET | `/api/focus/goal` |

### Likely code fixes
- Focus session deletion may not cascade to `focus_session_meta` and `focus_steps` — check FK constraints
- Focus history JOIN may fail when task is deleted (task_title NULL)

---

## v0.7.40 — List System Exhaustive

### Pre-read files
- [src/routes/lists.js](../../src/routes/lists.js) — all list + list item routes
- Existing `tests/lists.test.js` and `tests/configurable-lists.test.js`

### Test file
**Create:** `tests/list-exhaustive.test.js`

### Test structure
```
describe('List System Exhaustive')
  describe('List CRUD boundaries')
    it('name max 100 chars → accepted')
    it('name 101 chars → 400')
    it('100 lists → accepted; 101st → 400')
    it('duplicate names → accepted (not unique)')
    it('type must be checklist|grocery|notes')
    it('invalid type → 400')
  describe('List item boundaries')
    it('500 items → accepted; 501st → 400')
    it('item title max 200 chars')
    it('category/quantity fields stored')
    it('checked toggle 0→1→0')
    it('position reorder via PATCH')
    it('batch create items (array body)')
  describe('Sublist nesting')
    it('create sublist with parent_id')
    it('2-level nesting prevented → 400')
    it('parent deletion cascades sublists')
    it('self-referencing parent_id → 400')
  describe('List operations')
    it('POST /api/lists/:id/duplicate copies items')
    it('duplicate with keep_checked=false resets checked')
    it('POST /api/lists/:id/clear-checked removes checked items')
    it('POST /api/lists/:id/uncheck-all resets all to unchecked')
    it('POST /api/lists/:id/share generates token')
  describe('Shared list access')
    it('GET /api/shared/:token returns list with items (no auth)')
    it('invalid token format → 400')
    it('non-existent token → 404')
    it('PUT /api/shared/:token/items/:id toggles checked')
    it('POST /api/shared/:token/items adds item')
    it('rate limiting on shared endpoints → 429')
  describe('Grocery categories')
    it('GET /api/lists/categories returns default categories')
    it('GET /api/lists/categories/configured returns user settings')
    it('invalid categories setting → fallback to defaults')
  describe('List templates')
    it('GET /api/lists/templates returns available templates')
    it('POST /api/lists/from-template creates list with items')
    it('invalid template_id → 404')
  describe('Save-as-template')
    it('POST /api/lists/:id/save-as-template creates template')
    it('POST /api/goals/:id/save-as-template creates template from goal tasks')
  describe('List delete + search rebuild')
    it('deleting list rebuilds search index')
    it('adding item rebuilds search index')
```

### Endpoints tested
All endpoints in [src/routes/lists.js](../../src/routes/lists.js).

### Likely code fixes
- Sublist deletion may not cascade `list_items` (it should via the lists FK, but items belong to child lists which are deleted separately — verify)

---

## v0.7.41 — Notes, Inbox, Reviews Edge Cases

### Pre-read files
- [src/routes/productivity.js](../../src/routes/productivity.js) — inbox, notes, reviews, daily reviews, automation rules

### Test file
**Create:** `tests/productivity-edges.test.js`

### Test structure
```
describe('Notes, Inbox, Reviews Edge Cases')
  describe('Inbox CRUD')
    it('POST /api/inbox with title → 201')
    it('POST /api/inbox with empty title → 400')
    it('PUT /api/inbox/:id updates fields')
    it('priority boundaries 0-3')
    it('priority -1 → 400; priority 4 → 400')
  describe('Inbox triage workflow')
    it('POST /api/inbox/:id/triage creates task and deletes inbox item')
    it('triage with due_date → task has due_date')
    it('triage with priority → task has priority')
    it('triage to non-owned goal → 403')
  describe('Notes CRUD')
    it('POST /api/notes with title → 201')
    it('POST /api/notes with empty title → 400')
    it('PUT /api/notes/:id updates title and content')
    it('notes can be linked to goal_id')
    it('GET /api/notes?goal_id=X filters by goal')
  describe('Notes goal link')
    it('note with goal_id returns correct association')
    it('goal deletion: note.goal_id set to null or note deleted (verify)')
    it('re-link note to different goal via PUT')
  describe('Weekly review')
    it('POST /api/reviews creates weekly review')
    it('same week_start → upsert (update existing)')
    it('rating boundaries: 1-5 (clamped)')
    it('rating 0 → clamped to 1 or stored as null')
    it('invalid week_start format → 400')
  describe('Weekly review data')
    it('GET /api/reviews/current returns week stats')
    it('completed count matches actual completions this week')
    it('area stats include per-area breakdown')
  describe('Daily review')
    it('POST /api/reviews/daily creates review for date')
    it('same date → upsert')
    it('completed_count auto-calculated from tasks')
    it('invalid date → 400')
  describe('Automation rules')
    it('POST /api/rules with valid trigger/action → 201')
    it('invalid trigger_type → 400')
    it('invalid action_type → 400')
    it('name max 100 chars')
    it('enable/disable toggle')
    it('DELETE /api/rules/:id → 200')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| GET/POST/PUT/DELETE | `/api/inbox` |
| POST | `/api/inbox/:id/triage` |
| GET/POST/PUT/DELETE | `/api/notes` |
| GET/POST/DELETE | `/api/reviews` |
| GET | `/api/reviews/current` |
| POST/GET | `/api/reviews/daily` |
| GET/POST/PUT/DELETE | `/api/rules` |

### Likely code fixes
- Triage ownership check exists in source (`goalOwned` check), verified
- Weekly review rating clamping: `Math.min(5, Math.max(1, Number(rating)))` already in source, but what about `0`? It becomes `1`, which may not be desired — document behavior

---

## v0.7.42 — Database Migration Safety

### Pre-read files
- [src/db/index.js](../../src/db/index.js) — schema creation, inline migrations
- [src/db/migrate.js](../../src/db/migrate.js) — migration runner
- [src/db/migrations/](../../src/db/migrations/) — migration SQL files
- Existing `tests/migrations.test.js`

### Test file
**Create:** `tests/migration-safety.test.js`

### Test structure
```
describe('Database Migration Safety')
  describe('Migration runner')
    it('applies new migration file')
    it('skips already-applied migration (idempotent)')
    it('migrations applied in filename order')
    it('_migrations table tracks applied migrations')
    it('re-running migrate() is safe (no duplicate applies)')
  describe('Migration failure handling')
    it('invalid SQL in migration → throws error')
    it('migration with syntax error → rolled back')
    it('corrupted migration file → error with filename')
  describe('Schema integrity')
    it('all expected tables exist (count ≥ 35)')
    it('foreign_keys pragma is ON')
    it('journal_mode is WAL')
    it('all expected indexes exist')
    it('UNIQUE constraints on expected columns')
  describe('Schema from fresh install')
    it('new database creates all tables')
    it('new database creates all indexes')
    it('new database has correct default data')
  describe('Backup mechanics')
    it('backup creates JSON file in backups directory')
    it('backup file contains valid JSON')
  describe('Migration SQL safety')
    it('no migration contains DROP TABLE without comment justification')
    it('no migration contains DELETE FROM without WHERE')
    it('all migrations are valid SQL (parseable)')
```

### Endpoints tested
None directly — this tests the DB layer.

### Likely code fixes
- Migration runner error handling may need improvement
- Some expected indexes may be missing

---

## v0.7.43 — Performance Baseline Tests

### Pre-read files
- [src/routes/tasks.js](../../src/routes/tasks.js) — `/api/tasks/all`, `/api/tasks/board`
- [src/routes/stats.js](../../src/routes/stats.js) — `/api/stats`
- [src/helpers.js](../../src/helpers.js) — `enrichTasks()` (N+1 query risk)

### Test file
**Create:** `tests/performance-baselines.test.js`

### Test structure
```
describe('Performance Baseline Tests')
  // Setup: create 100 tasks across 5 areas / 10 goals
  describe('Response time assertions')
    it('GET /api/tasks/all responds in <500ms with 100 tasks')
    it('GET /api/stats responds in <200ms')
    it('GET /api/tasks/board responds in <500ms')
    it('GET /api/tasks/search?q=test responds in <500ms')
    it('GET /api/tasks/my-day responds in <200ms')
    it('GET /api/stats/streaks responds in <500ms')
    it('GET /api/focus/stats responds in <200ms')
    it('GET /api/search?q=test responds in <500ms')
  describe('Bulk operation performance')
    it('creating 100 tasks sequentially in <5s')
    it('PUT /api/tasks/bulk with 100 IDs in <2s')
    it('deleting 100 tasks in <5s')
    it('PATCH /api/tasks/batch with 50 IDs in <2s')
  describe('Large dataset handling')
    it('1000 tasks: /api/tasks/all?limit=50 responds in <1s')
    it('100 areas: /api/areas responds in <500ms')
    it('500 tags: /api/tags responds in <500ms')
    it('no N+1 queries detected (enrichTasks() efficient)')
  describe('Pagination performance')
    it('first page vs last page similar response time')
    it('offset=0 and offset=900 within 2x of each other')
    it('very high offset → still responds (may return empty)')
  describe('Search performance')
    it('FTS5 search responds in <500ms')
    it('LIKE fallback responds in <1s')
    it('empty search result → same speed as non-empty')
  describe('Export performance')
    it('export with 100 tasks in <2s')
    it('export response is valid JSON')
    it('export size proportional to data count')
```

### Implementation notes
- Use `Date.now()` before/after to measure response times
- Create large datasets in `before()` hook, not in individual tests
- Use generous timeouts (tests may be slow in CI)

### Likely code fixes
- `enrichTasks()` in [src/helpers.js](../../src/helpers.js) does per-task queries for tags and subtasks — may need batch optimization if N+1 is detected

---

## v0.7.44 — Error Recovery & Graceful Degradation

### Pre-read files
- [src/server.js](../../src/server.js) — error handlers, graceful shutdown, SIGTERM/SIGINT
- [src/middleware/errors.js](../../src/middleware/errors.js) — AppError classes
- [src/errors.js](../../src/errors.js) — error hierarchy
- Existing `tests/error-handling.test.js`

### Test file
**Create:** `tests/error-recovery.test.js`

### Test structure
```
describe('Error Recovery & Graceful Degradation')
  describe('Malformed JSON recovery')
    it('POST with invalid JSON → 400, not 500')
    it('response has { error } with descriptive message')
    it('Content-Type is application/json')
    it('server still accepts subsequent valid requests')
  describe('Database constraint violations')
    it('duplicate unique key → 409 with { error }')
    it('foreign key violation → descriptive error')
    it('CHECK constraint violation → descriptive error')
    it('NOT NULL constraint → 400 with { error }')
  describe('Express error handler chain')
    it('NotFoundError → 404')
    it('ValidationError → 400')
    it('AppError with custom status → that status')
    it('generic Error → 500 with generic message')
  describe('No stack traces in production responses')
    it('400 response contains no file paths')
    it('404 response contains no line numbers')
    it('500 response contains no module names')
  describe('Graceful shutdown')
    it('server handles SIGTERM signal')
    it('server handles SIGINT signal')
    it('in-flight requests complete before shutdown')
    it('cleanup closes database connection')
  describe('Middleware error handling')
    it('auth middleware failure → 401 JSON response')
    it('CSRF middleware failure → 403 JSON response')
    it('validation middleware failure → 400 JSON response')
    it('all middleware errors return JSON, not HTML')
  describe('Health endpoint resilience')
    it('GET /health responds even under load')
    it('health check timing is <100ms')
  describe('Concurrent error handling')
    it('multiple simultaneous bad requests → all get proper error responses')
    it('no unhandled promise rejections')
```

### Likely code fixes
- Some error paths may leak stack traces in development mode — ensure production behavior is tested
- Database constraint errors may surface as 500 instead of 409/400

---

## v0.7.45 — Cookie & Session Security Exhaustive

### Pre-read files
- [src/routes/auth.js](../../src/routes/auth.js) — `buildCookie()`, session creation/deletion
- [src/middleware/auth.js](../../src/middleware/auth.js) — `requireAuth`
- [src/middleware/csrf.js](../../src/middleware/csrf.js)
- Existing `tests/session-security.test.js`

### Test file
**Create:** `tests/cookie-session-exhaustive.test.js`

### Test structure
```
describe('Cookie & Session Security Exhaustive')
  describe('Cookie flags')
    it('login cookie has HttpOnly flag')
    it('login cookie has SameSite=Strict')
    it('login cookie has Path=/')
    it('no Domain attribute on cookie')
    it('Max-Age set from session TTL')
    it('Secure flag present when trust proxy + HTTPS')
  describe('Session lifecycle')
    it('login creates session in sessions table')
    it('logout deletes session from table')
    it('expired session → 401 on next request')
    it('remember-me flag extends session TTL')
    it('multiple concurrent sessions per user')
  describe('Session hijacking prevention')
    it('each login generates unique session ID')
    it('expired session cookie → 401')
    it('malformed session cookie → 401 (not 500)')
    it('session ID is UUID format')
  describe('Password change → sessions')
    it('password change invalidates all sessions')
    it('password change clears current cookie')
    it('must re-login after password change')
  describe('CSRF cookie correlation')
    it('CSRF token present in GET /api/auth/me')
    it('mismatched CSRF token/cookie → 403')
    it('CSRF rotates on each request or per session')
  describe('API token vs session')
    it('API token in Authorization header works without cookie')
    it('session cookie works without API token')
    it('both present → session wins')
    it('expired API token → 401')
  describe('Session cleanup')
    it('expired sessions cleaned up by scheduler')
    it('cleanup does not remove valid sessions')
    it('cleanup runs on schedule')
  describe('Trust proxy')
    it('X-Forwarded-For respected behind proxy')
    it('Secure cookie set when behind HTTPS proxy')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |
| POST | `/api/auth/change-password` |
| All | Any authenticated endpoint (session verification) |

### Likely code fixes
- Session cleanup may not be tested in scheduler — verify `scheduler.js` runs cleanup
- Trust proxy Secure cookie logic may need verification

---

## v0.7.46 — Webhook & Push Notification Testing

### Pre-read files
- [src/routes/features.js](../../src/routes/features.js) — webhook CRUD, push subscribe/test
- [src/services/push.service.js](../../src/services/push.service.js)
- Existing `tests/webhooks.test.js`, `tests/webhooks-extensive.test.js`, `tests/webhook-security.test.js`

### Test file
**Create:** `tests/webhook-push-exhaustive.test.js`

### Test structure
```
describe('Webhook & Push Exhaustive')
  describe('Webhook CRUD')
    it('POST /api/webhooks → 201 with secret')
    it('GET /api/webhooks → list without secret field')
    it('PUT /api/webhooks/:id updates name/url/events/active')
    it('DELETE /api/webhooks/:id → { ok: true }')
    it('10 webhook limit → 11th rejected')
  describe('Webhook URL validation')
    it('HTTPS URL → accepted')
    it('HTTP URL → 400')
    it('localhost → 400 (SSRF block)')
    it('127.0.0.1 → 400')
    it('10.x.x.x → 400')
    it('172.16.x.x → 400')
    it('192.168.x.x → 400')
    it('169.254.x.x → 400')
    it('IPv6 ::1 → 400')
    it('::ffff:127.0.0.1 → 400')
  describe('Webhook event types')
    it('valid events accepted')
    it('invalid event → 400')
    it('wildcard * accepted')
    it('duplicate events deduplicated in response')
    it('empty events → 400')
  describe('Webhook HMAC signing')
    it('webhook has secret field on creation')
    it('GET /api/webhooks does NOT expose secret')
    it('secret is 64-char hex string')
  describe('Push subscription')
    it('POST /api/push/subscribe creates subscription')
    it('duplicate endpoint → upsert (update keys)')
    it('DELETE /api/push/subscribe removes subscription')
    it('POST /api/push/subscribe with missing keys → 400')
  describe('Push test notification')
    it('POST /api/push/test with no subscriptions → { sent: 0 }')
    it('POST /api/push/test with VAPID not configured → { pending }')
  describe('VAPID key')
    it('GET /api/push/vapid-key returns { publicKey }')
    it('publicKey format is base64url string')
  describe('Webhook deactivation')
    it('PUT /api/webhooks/:id { active: false } disables')
    it('PUT /api/webhooks/:id { active: true } re-enables')
  describe('Push assignment notification')
    it('assigning task to user triggers push (when configured)')
    it('dedup within 24h (same task+user → no repeat)')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| GET/POST/PUT/DELETE | `/api/webhooks` |
| GET | `/api/webhooks/events` |
| GET | `/api/push/vapid-key` |
| POST | `/api/push/subscribe` |
| DELETE | `/api/push/subscribe` |
| POST | `/api/push/test` |

### Likely code fixes
- IPv6-mapped SSRF may have edge cases with `::ffff:10.0.0.1`

---

## v0.7.47 — Search & NLP Parser Exhaustive

### Pre-read files
- [src/routes/data.js](../../src/routes/data.js) — `/api/search` (FTS5)
- [src/routes/tasks.js](../../src/routes/tasks.js) — `/api/tasks/search`, `/api/tasks/parse`

### Test file
**Create:** `tests/search-nlp-exhaustive.test.js`

### Test structure
```
describe('Search & NLP Exhaustive')
  describe('FTS5 global search')
    it('GET /api/search?q=keyword returns matching tasks/notes/lists')
    it('multi-word search matches documents with all words')
    it('prefix search (partial word) matches')
    it('special characters stripped safely')
    it('empty query → { results: [], query: "" }')
    it('result limit respected (default 20, max 50)')
  describe('LIKE fallback')
    it('FTS5 failure falls back to LIKE search')
    it('LIKE search is case insensitive')
    it('LIKE search returns results in same format')
  describe('Task search scoping')
    it('GET /api/tasks/search?q=keyword returns matching tasks')
    it('search filters by area_id')
    it('search filters by goal_id')
    it('search filters by status')
    it('combined query + filters')
  describe('Search ranking')
    it('title match returned before note match')
    it('snippet includes <mark> tags')
  describe('NLP parser dates')
    it('"today" → today date')
    it('"tomorrow" → tomorrow date')
    it('"day after tomorrow" → +2 days')
    it('"next monday" → next Monday date')
    it('"in 5 days" → +5 days')
    it('"2026-04-15" → ISO date preserved')
    it('"3/15" → 2026-03-15')
  describe('NLP parser priorities')
    it('"p1" → priority 1')
    it('"P2" → priority 2 (case insensitive)')
    it('"!3" → priority 3')
    it('multiple priorities → last wins')
  describe('NLP parser tags')
    it('"#groceries" → tags: ["groceries"]')
    it('multiple tags "#a #b" → tags: ["a", "b"]')
    it('camelCase tag "#myTag" → tags: ["mytag"]')
  describe('NLP parser edge cases')
    it('only metadata, no title → title is original text or empty')
    it('500 char input → accepted')
    it('501 char input → 400')
    it('empty input → 400')
```

### Endpoints tested
| Method | Endpoint |
|--------|----------|
| GET | `/api/search` |
| GET | `/api/tasks/search` |
| POST | `/api/tasks/parse` |

### Likely code fixes
- NLP "day after tomorrow" regex may need verification (currently in source)
- FTS5 MATCH with special characters may throw — verify the `catch` block handles it

---

## v0.7.48 — Service Worker & Offline Queue Tests

### Pre-read files
- [public/sw.js](../../public/sw.js) — service worker
- [public/store.js](../../public/store.js) — offline queue store
- [public/manifest.json](../../public/manifest.json)

### Test file
**Create:** `tests/service-worker.test.js`

### Implementation note
These are static analysis tests that parse JS files and verify patterns. No browser runtime needed.

### Test structure
```
describe('Service Worker & Offline Queue Tests')
  describe('SW file structure')
    it('sw.js exists and is valid JS syntax')
    it('sw.js contains version string')
    it('sw.js exports no syntax errors (parseable with acorn or esprima)')
  describe('Cache strategy patterns')
    it('sw.js uses network-first pattern (fetch event handler)')
    it('cache key includes version string')
    it('cache cleanup on activate event')
  describe('Offline store')
    it('store.js exists and is valid JS syntax')
    it('store.js defines queue operations')
    it('store.js uses localStorage or IndexedDB')
    it('queue serialization is JSON-based')
  describe('Static asset caching')
    it('sw.js references app.js in cache list')
    it('sw.js references styles.css in cache list')
    it('API responses use network-first (not cache-first)')
  describe('Update notification')
    it('sw.js has update detection logic')
    it('version comparison pattern exists')
  describe('Error handling')
    it('sw.js has try/catch around cache operations')
    it('fetch event handler has fallback')
  describe('Manifest validation')
    it('manifest.json exists and is valid JSON')
    it('manifest.json has required PWA fields (name, icons, start_url)')
    it('all icon files referenced in manifest exist')
```

### Likely code fixes
- Cache cleanup may not remove old version caches
- Manifest may reference icons that don't exist

---

## v0.7.49 — Code Coverage & Slow Test Optimization

### Pre-read files
- All test files — analyze structure
- All route files — find untested routes
- `package.json` — add c8 dependency and script

### Test file
**Create:** `tests/coverage-audit.test.js`

### Test structure
```
describe('Code Coverage & Slow Test Optimization')
  describe('Route coverage audit')
    it('tasks.js: all HTTP routes have at least 1 test assertion')
    it('areas.js: all HTTP routes have at least 1 test assertion')
    it('features.js: all HTTP routes have at least 1 test assertion')
    it('lists.js: all HTTP routes have at least 1 test assertion')
    it('stats.js: all HTTP routes have at least 1 test assertion')
    it('productivity.js: all HTTP routes have at least 1 test assertion')
    it('tags.js: all HTTP routes have at least 1 test assertion')
    it('filters.js: all HTTP routes have at least 1 test assertion')
  describe('Untested route detection')
    it('find routes in source without matching test paths')
    it('custom-fields.js routes covered')
    it('data.js routes covered')
    it('auth.js routes covered')
  describe('Test file conventions')
    it('every test file imports from helpers.js')
    it('every test file uses describe()')
    it('every test file uses cleanDb() in beforeEach')
  describe('Test performance')
    it('no individual test file takes >30s')
    it('full suite completes under reported threshold')
    it('count test files matches CLAUDE.md count')
```

### Associated work (non-test)
- Install `c8` as devDependency: `npm i -D c8`
- Add script to `package.json`: `"test:coverage": "c8 --reporter=text node --test --test-force-exit tests/*.test.js"`
- Run coverage and record baseline in CLAUDE.md

### Likely code fixes
- May discover untested routes that need tests in this or future iterations
- May find slow tests that need optimization (e.g., excessive data creation)

---

## v0.7.50 — Final Verification & Release Gate

### Pre-read files
- All version files (package.json, CLAUDE.md, CHANGELOG.md, docs/openapi.yaml)
- [README.md](../../README.md)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- `package.json` — dependency list

### Test file
**Create:** `tests/release-gate.test.js`

### Test structure
```
describe('Final Verification & Release Gate')
  describe('Version consistency')
    it('package.json version matches CLAUDE.md header')
    it('CHANGELOG.md has entry for current version')
    it('openapi.yaml version matches package.json')
  describe('Documentation completeness')
    it('README.md exists and is non-empty')
    it('docs/openapi.yaml is valid YAML')
    it('CHANGELOG.md has entries for v0.7.26 through v0.7.50')
  describe('CI pipeline validation')
    it('ci.yml exists and is valid YAML')
    it('ci.yml has lint job')
    it('ci.yml has test job')
    it('ci.yml has audit job')
  describe('Security baseline')
    it('no console.log in src/ (only logger)')
    it('no hardcoded secrets or passwords in source')
    it('no TODO/FIXME in security-critical files (auth, csrf, session)')
    it('npm audit has 0 critical/high vulns (or documented exceptions)')
  describe('Test suite health')
    it('all tests pass (npm test exit code 0)')
    it('0 skipped tests')
    it('test count matches CLAUDE.md')
    it('no duplicate test descriptions within any file')
  describe('Dependency hygiene')
    it('all production deps used in source')
    it('package-lock.json in sync with package.json')
    it('no deprecated dependencies (npm outdated check)')
```

### Likely code fixes
- May need to update CHANGELOG.md with all 25 iteration entries
- May find unused dependencies to remove
- README.md may need final updates

---

## Review Checkpoint

Before starting implementation, verify:

1. **Spec alignment:** Every iteration in the spec has a corresponding plan section above
2. **No overlap with existing tests:** Cross-reference each planned test file against the 117 existing test files
3. **Helper availability:** All needed factory functions exist in `tests/helpers.js`
4. **Route accuracy:** All endpoint paths match the actual source code

### Key existing test files that overlap with planned tests (check before writing)
| Planned file | Check against existing |
|---|---|
| task-boundaries | tasks.test.js, exhaustive-tasks.test.js, input-validation-comprehensive.test.js |
| area-goal-boundaries | areas.test.js, goals.test.js |
| subtask-tag-boundaries | subtasks.test.js, tags.test.js |
| task-state-machine | tasks.test.js, views.test.js |
| api-contracts | Various test files (spot checks) |
| import-export-roundtrip | export-import.test.js, import-export-extensive.test.js, external-import.test.js |
| recurring-spawn-edges | recurrence-safety.test.js |
| frontend-units | frontend.test.js, frontend-validation.test.js, nlp.test.js |
| tag-filter-field-interactions | filters.test.js, exhaustive-filters.test.js, custom-fields.test.js |
| multi-user-exhaustive | multi-user.test.js, idor-comprehensive.test.js |
| habit-edges | habits.test.js, exhaustive-habits.test.js |
| focus-edges | focus-system.test.js, focus-enhanced.test.js |
| list-exhaustive | lists.test.js, configurable-lists.test.js, sublists-linking.test.js |
| productivity-edges | exhaustive-inbox.test.js, exhaustive-notes.test.js, exhaustive-reviews.test.js |
| migration-safety | migrations.test.js, schema-integrity.test.js |
| performance-baselines | performance.test.js |
| error-recovery | error-handling.test.js |
| cookie-session-exhaustive | session-security.test.js, csrf.test.js |
| webhook-push-exhaustive | webhooks.test.js, webhook-security.test.js, push.test.js, web-push.test.js |
| search-nlp-exhaustive | search-ical-planner.test.js, nlp.test.js |
| service-worker | offline-queue.test.js |
| coverage-audit | test-suite-health.test.js |
| release-gate | release-hygiene.test.js, launch-readiness.test.js |

**Rule:** Read the existing test file before writing the new one. Add only NEW tests that cover gaps not already tested.

---

## Execution Options

### Option A: Sequential (recommended)
Execute iterations v0.7.26 → v0.7.50 in order. Each iteration is self-contained.

### Option B: Parallel tracks
- **Track 1 (Boundary):** v0.7.26, v0.7.27, v0.7.28 (can run in parallel, different entities)
- **Track 2 (Contracts):** v0.7.30, v0.7.31, v0.7.32 (independent HTTP-level tests)
- **Track 3 (Features):** v0.7.33–v0.7.41 (entity-specific, independent)
- **Track 4 (Infrastructure):** v0.7.42–v0.7.50 (can start after core tests land)

### Per-iteration time budget
- Simple iterations (static analysis, boundaries): ~30 min
- Complex iterations (state machine, roundtrip): ~60 min
- Infrastructure iterations (coverage, performance): ~45 min

---

## Success Criteria (v0.7.50)

| Metric | Target |
|--------|--------|
| Total tests | ≥3,400 |
| Total test files | ≥142 |
| All tests pass | Yes |
| Lint errors | 0 |
| Every route has ≥1 test | Yes |
| No stack traces in error responses | Verified |
| Performance baselines documented | Yes |
| Code coverage measured | Yes (c8 integrated) |
