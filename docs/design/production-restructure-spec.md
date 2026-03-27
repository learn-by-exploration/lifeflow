# Production Restructure — Design Specification

> **Status:** Draft  
> **Author:** Copilot  
> **Created:** 27 March 2026  
> **Target Version:** 1.0.0  
> **Timeline:** 4 weeks (1 developer)

---

## 1. Problem Statement

LifeFlow works, but it's built like a prototype. The codebase has grown to ~11,700 LOC with 157 API routes, 26 DB tables, and 1,692 tests — all riding on patterns that don't scale: a 5,369-line monolithic frontend, raw SQL in route handlers, ad-hoc migrations, no structured logging, no config management, and CommonJS modules. Shipping features or fixing bugs in this codebase increasingly means fighting the structure rather than the problem.

This spec defines a 4-phase restructure to production-grade quality while preserving Express.js + vanilla JS + SQLite and keeping all 1,692 tests green throughout.

## 2. Non-Goals — What NOT to Change

These are working fine. Touching them adds risk with no return:

| Keep As-Is | Reason |
|---|---|
| Express.js framework | Works, team knows it, no benefit from switching |
| Vanilla JS frontend (no React/Vue) | Intentional choice, works for the use case |
| SQLite + better-sqlite3 | Correct for single-server self-hosted app |
| bcryptjs for passwords | Already secure |
| helmet + CORS + CSRF middleware | Already well-configured |
| Rate limiting setup | Already in place with sensible defaults |
| Test runner (node:test + supertest) | Fast, native, 1,692 tests already pass |
| Test helper pattern (temp DB, factories) | Clean isolation, no reason to change |
| Session-based auth | Appropriate for this app type |
| Service Worker (sw.js) | Works, handles caching + offline |
| Audit logging service | Already clean and isolated |
| styles.css, index.html, login.html, landing.html | Stable, rarely change |
| Auto-backup system | Working, rotates correctly |

**Rule: If a file isn't listed in a phase's changes, don't touch it.**

---

## 3. Technology Decisions

Each tool is chosen for one reason: it's the smallest dependency that solves the problem well in the existing stack.

| Need | Choice | Why |
|---|---|---|
| Config management | **dotenv** (1 dep) | Industry standard, zero-config, reads `.env` files |
| Structured logging | **pino** (1 dep) | Fastest Node.js logger, JSON output, zero overhead in prod |
| Input validation | **zod** (1 dep, zero transitive) | TypeScript-native but works in JS, composable schemas, great errors |
| DB migrations | **Custom file-based** (0 deps) | SQLite migrations are trivial — numbered SQL files executed in order. No ORM, no knex, no overhead |
| Frontend module bundler | **None** | Use native ES modules (`<script type="module">`). No build step. Browser support is universal in 2026 |
| Frontend router | **Custom hash router** (~50 lines) | Already doing `hashchange`-based routing. Extract and formalize it |
| Frontend state | **Custom store** (~80 lines) | Pub/sub pattern replacing top-level `let` variables. No Redux, no MobX |
| Process manager | **None in dev** | `node src/server.js` is fine. Docker handles restart in prod |

**Total new production dependencies: 3** (dotenv, pino, zod)

---

## 4. Phase 1 — Foundation (Week 1)

**Goal:** Centralized config, ESM modules, structured logging, standardized error responses. No architectural changes — just plumbing.

### 4.1 Config Management

Create `src/config.js` — single source of truth for all configuration:

```
src/
  config.js          ← NEW: centralized config
.env.example         ← NEW: documented defaults
```

**`src/config.js`** loads from environment with typed defaults:

```js
import 'dotenv/config';

export const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3456,
  dbDir: process.env.DB_DIR || new URL('..', import.meta.url).pathname,
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProd: process.env.NODE_ENV === 'production',
  session: {
    maxAgeDays: parseInt(process.env.SESSION_MAX_AGE_DAYS, 10) || 7,
    rememberMeDays: parseInt(process.env.SESSION_REMEMBER_DAYS, 10) || 30,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  },
  backup: {
    retainCount: parseInt(process.env.BACKUP_RETAIN_COUNT, 10) || 7,
    intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS, 10) || 24,
  },
  log: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  },
});
```

**`.env.example`:**

```
PORT=3456
DB_DIR=./data
NODE_ENV=development
LOG_LEVEL=info
SESSION_MAX_AGE_DAYS=7
```

### 4.2 ESM Migration

Convert all backend files from CommonJS to ESM.

**Changes:**
- `package.json`: change `"type": "commonjs"` → `"type": "module"`
- All `require()` → `import`
- All `module.exports` → `export` / `export default`
- `__dirname` → `import.meta.url` + `fileURLToPath`
- `require.main === module` → `import.meta.url` check

**Migration strategy:** One commit that touches every `.js` file in `src/`. Run tests after each file conversion — they'll break if imports are wrong, giving immediate feedback. Convert `tests/helpers.js` and test files last (or keep CommonJS tests with `.cjs` extension if conversion is painful).

**Risk:** Test files using `require('../src/server')` will break.  
**Mitigation:** Convert test helper first. If the test runner has issues with ESM, rename test files to `.mjs` or use `--experimental-vm-modules`. Node 22 has stable ESM support — this should be straightforward. If it's not, the fallback is keeping `"type": "commonjs"` and using `.mjs` extension only for `src/` files.

### 4.3 Structured Logging

Replace all `console.log` / `console.error` with pino.

```
src/
  logger.js          ← NEW: pino instance
```

**`src/logger.js`:**

```js
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.log.level,
  ...(config.isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
```

> `pino-pretty` is a dev dependency only. In production, pino outputs JSON to stdout — pipe to any log aggregator.

**Replacements:**
- `console.log('LifeFlow running...')` → `logger.info({ port }, 'LifeFlow started')`
- `console.error('[timestamp] method url:', err.message)` → `logger.error({ err, method, url }, 'Request error')`
- `console.error('Audit log error:', ...)` → `logger.warn({ err }, 'Audit log write failed')`

### 4.4 Standardized Error Responses

Create `src/errors.js` — application error classes with error codes:

```js
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super('NOT_FOUND', `${resource} ${id} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super('VALIDATION_ERROR', message, 400);
    this.details = details;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super('CONFLICT', message, 409);
  }
}
```

Update `src/middleware/errors.js` to return structured JSON:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required",
    "details": [{ "field": "title", "message": "Required" }]
  }
}
```

### 4.5 Phase 1 File Changes Summary

```
NEW FILES:
  .env.example
  src/config.js
  src/logger.js
  src/errors.js

MODIFIED FILES:
  package.json              — "type": "module", add dotenv + pino deps
  src/server.js             — import config/logger, remove hard-coded values
  src/db/index.js           — import config for dbDir
  src/helpers.js            — ESM exports
  src/middleware/auth.js    — ESM exports, use config for session expiry
  src/middleware/csrf.js    — ESM exports
  src/middleware/errors.js  — Structured error response format
  src/middleware/validate.js — ESM exports
  src/services/audit.js     — ESM exports, use logger
  src/routes/*.js (10 files) — ESM exports, use logger for errors
  tests/helpers.js          — ESM or .cjs adaptation
```

### 4.6 Phase 1 Definition of Done

- [ ] All `process.env` reads go through `config.js` (grep for `process.env` finds only `config.js` and test setup)
- [ ] Zero `console.log` / `console.error` in `src/` (grep returns 0 results)
- [ ] All API error responses use `{ error: { code, message } }` format
- [ ] `.env.example` documents every variable
- [ ] All 1,692 tests pass
- [ ] `npm start` works with no `.env` file (defaults apply)
- [ ] `node --test` works with ESM imports

### 4.7 Phase 1 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ESM breaks test runner | Medium | Node 22 has stable ESM. Fallback: keep tests as `.cjs` |
| ESM breaks dynamic requires in db/index.js | Low | Only `require('better-sqlite3')` — straightforward `import` |
| pino output differs from expected test assertions | Low | Set log level to `silent` in test env |
| Existing error response format changes break frontend | Medium | Frontend `api` object already checks `r.ok` and calls `r.json()` — update it to read `body.error.message` instead of `body.error` |

---

## 5. Phase 2 — Backend Architecture (Week 2)

**Goal:** Separate concerns. Route handlers become thin controllers. Business logic moves to services. Database access moves to repositories. Input validation uses schemas.

### 5.1 Repository Layer

Create `src/repositories/` — one file per entity. Each repository encapsulates all SQL for that entity.

```
src/repositories/
  areas.repository.js
  goals.repository.js
  tasks.repository.js
  subtasks.repository.js
  tags.repository.js
  habits.repository.js
  lists.repository.js
  focus.repository.js
  notes.repository.js
  filters.repository.js
  users.repository.js
  base.repository.js       ← shared helpers (getNextPosition, etc.)
```

**Pattern:**

```js
// src/repositories/tasks.repository.js
export function createTasksRepository(db) {
  return {
    findByGoal(goalId, userId) {
      return db.prepare(`
        SELECT * FROM tasks WHERE goal_id = ? AND user_id = ?
        ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 END, position
      `).all(goalId, userId);
    },

    findById(id, userId) {
      return db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    },

    create(data) {
      const stmt = db.prepare(`
        INSERT INTO tasks (goal_id, user_id, title, note, status, priority, due_date, recurring, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(data.goalId, data.userId, data.title, data.note || '', data.status || 'todo',
        data.priority || 0, data.dueDate || null, data.recurring || null, data.position);
      return this.findById(info.lastInsertRowid, data.userId);
    },

    // ... update, delete, findForBoard, findForCalendar, etc.
  };
}
```

**Key point:** Repositories return plain objects. No ORM. No query builder. Just organized SQL access. This is the seam where you'd swap SQLite for Postgres later — change the SQL in repository files, everything upstream stays the same.

### 5.2 Service Layer

Create `src/services/` — one file per domain. Services contain business logic, call repositories, and are the only layer that crosses entity boundaries.

```
src/services/
  audit.js               ← EXISTS, keep as-is
  tasks.service.js       ← NEW
  areas.service.js       ← NEW
  goals.service.js       ← NEW
  habits.service.js      ← NEW
  lists.service.js       ← NEW
  focus.service.js       ← NEW
  stats.service.js       ← NEW
  auth.service.js        ← NEW
  data.service.js        ← NEW
```

**Pattern:**

```js
// src/services/tasks.service.js
import { NotFoundError, ForbiddenError } from '../errors.js';

export function createTasksService({ tasksRepo, goalsRepo, tagsRepo, enrichTask, enrichTasks }) {
  return {
    async getByGoal(goalId, userId) {
      // Verify goal ownership
      const goal = goalsRepo.findById(goalId, userId);
      if (!goal) throw new NotFoundError('Goal', goalId);
      return enrichTasks(tasksRepo.findByGoal(goalId, userId));
    },

    async create(goalId, userId, data) {
      const goal = goalsRepo.findById(goalId, userId);
      if (!goal) throw new NotFoundError('Goal', goalId);
      const position = tasksRepo.getNextPosition(goalId);
      const task = tasksRepo.create({ ...data, goalId, userId, position });
      return enrichTask(task);
    },

    // ...
  };
}
```

**The `enrichTask` / `enrichTasks` functions** from `helpers.js` move into a shared service utility or into the tasks repository as a decorator. These are query-heavy — they belong in the repository layer.

### 5.3 Input Validation with Zod

Create `src/schemas/` — zod schemas for every route's input.

```
src/schemas/
  tasks.schema.js
  areas.schema.js
  goals.schema.js
  subtasks.schema.js
  tags.schema.js
  habits.schema.js
  lists.schema.js
  focus.schema.js
  common.schema.js        ← shared validators (id, color, date, pagination)
```

**Pattern:**

```js
// src/schemas/tasks.schema.js
import { z } from 'zod';
import { positiveInt, hexColor, isoDate } from './common.schema.js';

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  note: z.string().max(10000).default(''),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  priority: z.number().int().min(0).max(3).default(0),
  due_date: isoDate.nullable().optional(),
  recurring: z.string().max(50).nullable().optional(),
  tag_ids: z.array(positiveInt).optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskIdParam = z.object({
  id: positiveInt,
});
```

**Validation middleware:**

```js
// src/middleware/validate.js — rewrite
import { ZodError } from 'zod';
import { ValidationError } from '../errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ValidationError('Validation failed', err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })));
      }
      throw err;
    }
  };
}
```

### 5.4 API Versioning

Add `/api/v1/` prefix. Keep `/api/` working as an alias for backward compatibility.

```js
// src/server.js
import { createTaskRoutes } from './routes/tasks.js';

const v1 = Router();
v1.use(createTaskRoutes(deps));
v1.use(createAreaRoutes(deps));
// ... all route modules

app.use('/api/v1', v1);
app.use('/api', v1);  // backward compat — remove in v2
```

**Frontend change:** Update `api` object's base URL from `/api/` to `/api/v1/`. Single find-replace in `app.js`.

### 5.5 Route Handler Simplification

After repository + service + validation layers exist, route handlers become thin:

```js
// src/routes/tasks.js — after refactor
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createTaskSchema, taskIdParam } from '../schemas/tasks.schema.js';

export function createTaskRoutes({ tasksService }) {
  const router = Router();

  router.get('/goals/:goalId/tasks', async (req, res) => {
    const tasks = await tasksService.getByGoal(Number(req.params.goalId), req.userId);
    res.json(tasks);
  });

  router.post('/goals/:goalId/tasks', validate(createTaskSchema), async (req, res) => {
    const task = await tasksService.create(Number(req.params.goalId), req.userId, req.body);
    res.status(201).json(task);
  });

  // ...
  return router;
}
```

### 5.6 Dependency Injection Container

Replace the ad-hoc `deps` object with a structured container created at startup:

```js
// src/container.js
import { createTasksRepository } from './repositories/tasks.repository.js';
import { createTasksService } from './services/tasks.service.js';
// ... other imports

export function createContainer(db) {
  // Repositories
  const tasksRepo = createTasksRepository(db);
  const goalsRepo = createGoalsRepository(db);
  const areasRepo = createAreasRepository(db);
  // ...

  // Services
  const tasksService = createTasksService({ tasksRepo, goalsRepo, tagsRepo });
  const areasService = createAreasService({ areasRepo, goalsRepo });
  // ...

  return Object.freeze({
    tasksService,
    areasService,
    goalsService,
    // ... all services
  });
}
```

### 5.7 Migration Strategy — Route-by-Route

Do NOT convert all 10 route files at once. Convert one at a time:

1. Pick a route file (start with `tags.js` — smallest at 125 lines, 11 routes)
2. Create its repository (`tags.repository.js`)
3. Create its schema (`tags.schema.js`)
4. Create its service (`tags.service.js`)
5. Refactor the route file to use service + validation
6. Run tests — all tag tests must pass
7. Commit
8. Repeat for next route file

**Suggested order** (simplest → most complex):
1. `tags.js` (125 lines, 11 routes)
2. `filters.js` (134 lines, 7 routes)
3. `areas.js` (202 lines, 17 routes)
4. `data.js` (193 lines, 6 routes)
5. `auth.js` (183 lines, 5 routes)
6. `productivity.js` (207 lines, 18 routes)
7. `lists.js` (328 lines, 22 routes)
8. `stats.js` (385 lines, 20 routes)
9. `features.js` (530 lines, 25 routes)
10. `tasks.js` (437 lines, 26 routes)

### 5.8 Phase 2 File Changes Summary

```
NEW FILES:
  src/container.js
  src/repositories/base.repository.js
  src/repositories/areas.repository.js
  src/repositories/goals.repository.js
  src/repositories/tasks.repository.js
  src/repositories/subtasks.repository.js
  src/repositories/tags.repository.js
  src/repositories/habits.repository.js
  src/repositories/lists.repository.js
  src/repositories/focus.repository.js
  src/repositories/notes.repository.js
  src/repositories/filters.repository.js
  src/repositories/users.repository.js
  src/schemas/common.schema.js
  src/schemas/tasks.schema.js
  src/schemas/areas.schema.js
  src/schemas/goals.schema.js
  src/schemas/subtasks.schema.js
  src/schemas/tags.schema.js
  src/schemas/habits.schema.js
  src/schemas/lists.schema.js
  src/schemas/focus.schema.js
  src/services/tasks.service.js
  src/services/areas.service.js
  src/services/goals.service.js
  src/services/habits.service.js
  src/services/lists.service.js
  src/services/focus.service.js
  src/services/stats.service.js
  src/services/auth.service.js
  src/services/data.service.js

MODIFIED FILES:
  src/server.js             — use container, mount v1 router
  src/helpers.js            — move enrichTask/enrichTasks to repository layer
  src/middleware/validate.js — rewrite to zod-based middleware
  src/routes/*.js (10 files) — thin controllers using services
  package.json              — add zod
```

### 5.9 Phase 2 Definition of Done

- [ ] Every SQL query lives in a `*.repository.js` file (grep `db.prepare` in `routes/` returns 0 results)
- [ ] Every route input is validated by a zod schema
- [ ] Routes are max ~10 lines each (delegate to service)
- [ ] `deps` object is replaced by typed container
- [ ] `/api/v1/` prefix works; `/api/` still works as alias
- [ ] All 1,692 tests pass unchanged (same API contract)
- [ ] `enrichTask` / `enrichTasks` live in repository layer

### 5.10 Phase 2 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Service/repo granularity wrong — too many tiny files | Medium | Follow the existing route file boundaries; 1 repo + 1 service per route module |
| Zod validation rejects inputs that were previously accepted | High | Write the schemas to match current behavior first (permissive), then tighten in a follow-up |
| API versioning breaks frontend | Low | `/api/` alias ensures backward compat |
| `enrichTasks` in repo layer has cross-entity queries | Medium | Accept it. It queries tags + subtasks + deps — this is a read optimization, not a separation violation |

---

## 6. Phase 3 — Frontend Modularization (Week 3)

**Goal:** Break the 5,369-line `app.js` monolith into ES modules. No build step — native `<script type="module">`.

### 6.1 Target Structure

```
public/
  app.js                   ← SLIM: ~100 lines — imports, init, router setup
  index.html               ← add type="module" to script tag
  api/
    client.js              ← the api object (get, post, put, del, patch, CSRF)
  state/
    store.js               ← pub/sub state management (replaces top-level lets)
    actions.js             ← state mutation functions
  router/
    index.js               ← hash-based router (~50 lines)
    routes.js              ← route definitions map
  views/
    today.js               ← renderToday()
    all-tasks.js           ← renderAllTasks()
    board.js               ← renderBoard()
    calendar.js            ← renderCalendar()
    dashboard.js           ← renderDashboard()
    weekly-plan.js         ← renderWeeklyPlan()
    matrix.js              ← renderMatrix()
    activity.js            ← renderActivityLog()
    tag-manager.js         ← renderTagManager()
    focus-history.js       ← renderFocusHistory()
    area.js                ← renderArea()
    goal.js                ← renderGoal()
    reports.js             ← renderReports()
    settings.js            ← renderSettings()
    inbox.js               ← renderInbox()
    lists.js               ← renderLists()
    triage.js              ← renderTriage()
    habits.js              ← renderHabits()
  components/
    task-card.js           ← reusable task rendering
    task-modal.js          ← task detail overlay
    sidebar.js             ← sidebar rendering
    quick-capture.js       ← Ctrl+K / N quick capture overlay
    toast.js               ← toast notification system
    drag-drop.js           ← touchDnD system
    modal.js               ← overlay lifecycle (_lockBody, _pushFocus, etc.)
    confirm.js             ← confirmation dialogs
    date-picker.js         ← date picker component
  utils/
    dom.js                 ← $(), esc(), escA(), renderMd()
    dates.js               ← fmtDue(), relative date logic
    format.js              ← number/string formatters
```

### 6.2 State Management

Replace top-level `let` variables with a simple store:

```js
// public/state/store.js
const state = {
  areas: [],
  goals: [],
  tasks: [],
  allTags: [],
  currentView: 'today',
  currentUser: null,
  selectedAreaId: null,
  selectedGoalId: null,
  // ... all current top-level variables
};

const listeners = new Set();

export function getState() { return state; }

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

### 6.3 Router

Extract current hashchange logic into a proper router:

```js
// public/router/index.js
const routes = new Map();

export function registerRoute(pattern, handler) {
  routes.set(pattern, handler);
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function start() {
  window.addEventListener('hashchange', () => handleRoute());
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'today';
  for (const [pattern, handler] of routes) {
    const match = matchPattern(pattern, hash);
    if (match) { handler(match.params); return; }
  }
  // 404 — default to today
  routes.get('today')?.({});
}

function matchPattern(pattern, hash) {
  // Supports: 'today', 'area/:id', 'goal/:id'
  const patternParts = pattern.split('/');
  const hashParts = hash.split('/');
  if (patternParts.length !== hashParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = hashParts[i];
    } else if (patternParts[i] !== hashParts[i]) {
      return null;
    }
  }
  return { params };
}
```

### 6.4 Migration Strategy — Extract, Don't Rewrite

The monolith extraction follows a strict pattern:

1. **Create module file** with the function cut from `app.js`
2. **Add `export`** to the function
3. **Replace the code in `app.js`** with `import` + call
4. **Verify** the view works in browser
5. **Commit**

**Order of extraction** (dependencies first):
1. `utils/dom.js` — `$()`, `esc()`, `escA()`, `renderMd()` (used everywhere)
2. `utils/dates.js` — `fmtDue()`, date helpers
3. `api/client.js` — the `api` object
4. `components/toast.js` — `showToast()`
5. `components/modal.js` — overlay lifecycle functions
6. `state/store.js` — replace top-level `let` variables
7. `router/index.js` — extract routing logic
8. Views one at a time (today → all-tasks → board → ... simplest first)
9. Remaining components (task-card, sidebar, etc.)

**Critical constraint:** Each extraction must be a working commit. `app.js` shrinks by one function/view at a time. Never have a broken intermediate state.

### 6.5 `index.html` Changes

```html
<!-- Before -->
<script src="app.js"></script>

<!-- After -->
<script type="module" src="app.js"></script>
```

Native ES modules work in all browsers since 2018. No polyfill needed. The `type="module"` attribute also implies `defer`, so no loading order issues.

**Cache busting:** Add `?v=1.0.0` query parameter to module imports in `index.html`, or use service worker to handle cache invalidation (already in place).

### 6.6 Phase 3 File Changes Summary

```
NEW FILES:
  public/api/client.js
  public/state/store.js
  public/state/actions.js
  public/router/index.js
  public/router/routes.js
  public/views/*.js (18 files)
  public/components/*.js (8 files)
  public/utils/*.js (3 files)

MODIFIED FILES:
  public/app.js            — shrinks from 5,369 → ~100 lines (imports + init)
  public/index.html        — script type="module"
  public/sw.js             — update cache list for new module files
```

### 6.7 Phase 3 Definition of Done

- [ ] `app.js` is under 200 lines
- [ ] Every view is a separate module in `views/`
- [ ] No top-level `let` mutable state in `app.js` — all state in store
- [ ] All keyboard shortcuts still work
- [ ] Touch drag-and-drop still works on mobile
- [ ] Service worker caches new module files
- [ ] All 25+ views render correctly (manual smoke test — no frontend test suite)
- [ ] Browser dev console shows no module loading errors

### 6.8 Phase 3 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Circular module dependencies | High | Extract utils/dom.js first (leaf dependency). Use dependency graph sketch before starting |
| Break implicit global variable coupling | High | The state store solves this — but some views mutate globals that other views read. Map ALL cross-view state before extracting |
| Service Worker caches stale modules | Medium | Update SW version string on each deploy. Already has update detection |
| Event listeners lost during extraction | Medium | Extract event setup into each view's `mount()` function. Each view exports `{ render, mount, unmount }` |
| Performance: many HTTP requests for modules | Low | HTTP/2 multiplexing handles this. If needed, add one bundler step later — but measure first |

---

## 7. Phase 4 — Production Hardening (Week 4)

**Goal:** Multi-stage Docker, proper migrations, health checks, graceful shutdown, and CI pipeline improvements.

### 7.1 Database Migrations System

Replace ad-hoc `try { SELECT... } catch { ALTER... }` with numbered SQL migration files:

```
src/db/
  index.js               ← schema init + migration runner
  migrations/
    001_initial_schema.sql
    002_add_subtask_note.sql
    003_add_user_id_columns.sql
    004_settings_composite_pk.sql
    005_search_index_user_id.sql
    ...
```

**Migration runner** (in `db/index.js`):

```js
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map(r => r.name)
  );

  const migrationsDir = new URL('./migrations', import.meta.url).pathname;
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    })();
    logger.info({ migration: file }, 'Applied migration');
  }
}
```

**Migration path for existing installs:** The first migration (`001_initial_schema.sql`) is a no-op — it contains `CREATE TABLE IF NOT EXISTS` for all current tables. Existing databases already have these tables, so nothing happens. New installs get the schema from migration 001.

### 7.2 Multi-Stage Docker Build

```dockerfile
# Stage 1: Install dependencies
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:22-slim AS runtime
WORKDIR /app

# Security: non-root user
RUN addgroup --system --gid 1001 lifeflow && \
    adduser --system --uid 1001 --ingroup lifeflow lifeflow

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p /app/data && chown -R lifeflow:lifeflow /app

USER lifeflow

ENV NODE_ENV=production \
    DB_DIR=/app/data \
    PORT=3456

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:3456/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
```

**Image size reduction:** `node:22-slim` is already lean (180MB). The multi-stage build ensures no dev dependencies in the final image. If further reduction is needed, switch to `node:22-alpine` (but better-sqlite3 needs build tools — may require a build stage with `python3 make g++`).

### 7.3 Graceful Shutdown

Add to `src/server.js`:

```js
function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');

  server.close(() => {
    logger.info('HTTP server closed');
    db.close();
    logger.info('Database closed');
    process.exit(0);
  });

  // Force shutdown after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 7.4 Enhanced Health Check

Expand `/health` to include version and uptime:

```js
app.get('/health', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}

  const status = dbOk ? 'ok' : 'error';
  res.status(dbOk ? 200 : 503).json({
    status,
    version: config.version,
    uptime: Math.floor(process.uptime()),
    db: dbOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
  });
});
```

Add a readiness probe for orchestrators:

```js
app.get('/ready', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  res.status(dbOk ? 200 : 503).json({ ready: dbOk });
});
```

### 7.5 Docker Compose for Production

```yaml
services:
  lifeflow:
    build:
      context: .
      target: runtime
    ports:
      - "${PORT:-3456}:3456"
    volumes:
      - lifeflow-data:/app/data
    environment:
      - NODE_ENV=production
      - DB_DIR=/app/data
      - LOG_LEVEL=info
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  lifeflow-data:
```

### 7.6 CI Pipeline Improvements

Update GitHub Actions (if it exists, or create `.github/workflows/ci.yml`):

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx --yes biome check src/ tests/

  docker:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t lifeflow:test .
      - run: |
          docker run -d --name lf-test -p 3456:3456 lifeflow:test
          sleep 5
          curl -f http://localhost:3456/health
          docker stop lf-test
```

### 7.7 Phase 4 File Changes Summary

```
NEW FILES:
  src/db/migrations/001_initial_schema.sql
  src/db/migrations/002_add_subtask_note.sql
  src/db/migrations/003_... (extract all current ad-hoc migrations)
  docker-compose.prod.yml

MODIFIED FILES:
  Dockerfile               — multi-stage build
  docker-compose.yml       — named volume, environment vars
  src/server.js            — graceful shutdown, enhanced health check
  src/db/index.js          — migration runner replaces ad-hoc ALTER TABLE blocks
  .github/workflows/ci.yml — add lint + docker build steps
```

### 7.8 Phase 4 Definition of Done

- [ ] `docker build` produces <200MB image
- [ ] `docker compose up` starts clean from empty data directory
- [ ] Graceful shutdown: `docker stop` closes DB cleanly (no WAL corruption)
- [ ] `/health` returns version + uptime + db status
- [ ] `/ready` returns readiness status
- [ ] Migration runner applies new migrations automatically on startup
- [ ] Existing database (pre-migration) works after migration runner runs
- [ ] CI runs tests, lint, and Docker build on push
- [ ] All 1,692 tests pass

### 7.9 Phase 4 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration runner corrupts existing DB | Medium | Test with a copy of production DB. First migration is `IF NOT EXISTS` — safe by definition |
| better-sqlite3 build fails in Docker | Low | Already works in current Dockerfile with `node:22-slim`. No change |
| Graceful shutdown hangs on long-running requests | Low | 10-second force-kill timeout |
| WAL checkpoint on shutdown | Low | SQLite auto-checkpoints. Calling `db.close()` triggers final checkpoint |

---

## 8. Final Target Architecture

After all 4 phases:

```
src/
  config.js              — centralized config (dotenv)
  logger.js              — pino structured logging
  errors.js              — AppError classes with error codes
  container.js           — dependency injection setup
  server.js              — Express app, middleware, graceful shutdown
  helpers.js             — utility functions (slimmed down)
  db/
    index.js             — DB init + migration runner
    migrations/          — numbered .sql files
  middleware/
    auth.js              — session auth guard
    csrf.js              — CSRF protection
    errors.js            — error handler → structured JSON
    validate.js          — zod validation middleware
  repositories/
    base.repository.js
    areas.repository.js
    goals.repository.js
    tasks.repository.js
    subtasks.repository.js
    tags.repository.js
    habits.repository.js
    lists.repository.js
    focus.repository.js
    notes.repository.js
    filters.repository.js
    users.repository.js
  services/
    audit.js
    tasks.service.js
    areas.service.js
    goals.service.js
    habits.service.js
    lists.service.js
    focus.service.js
    stats.service.js
    auth.service.js
    data.service.js
  routes/
    auth.js              — thin controller
    areas.js             — thin controller
    tasks.js             — thin controller
    ... (10 files, each ~50-80 lines)
  schemas/
    common.schema.js
    tasks.schema.js
    areas.schema.js
    ... (8 files)

public/
  app.js                 — ~100 lines: init + imports
  index.html
  api/client.js
  state/store.js
  state/actions.js
  router/index.js
  router/routes.js
  views/               — 18 view modules
  components/          — 8 component modules
  utils/               — 3 utility modules
  styles.css
  sw.js
  store.js             — offline store (keep as-is)
  manifest.json

tests/                   — unchanged (same API contract)
```

**Backend LOC estimate:** ~5,500 (up from 3,839 due to repository + service files, but each file is ~50-100 lines)  
**Frontend LOC estimate:** ~7,800 (same total, but spread across ~30 files instead of 1)  
**New deps:** 3 production (dotenv, pino, zod) + 1 dev (pino-pretty)

---

## 9. Success Metrics

| Metric | Before | After |
|---|---|---|
| Largest source file | 5,369 lines (app.js) | <200 lines |
| SQL queries in route handlers | ~150+ | 0 |
| `process.env` reads scattered | 5+ files | 1 file (config.js) |
| `console.log/error` calls | 20+ | 0 (all pino) |
| Docker image layers | 1 stage | 2 stages |
| API error format | `{ error: "string" }` | `{ error: { code, message, details? } }` |
| Input validation | Ad-hoc inline checks | Zod schemas on every route |
| DB migration method | try/catch ALTER TABLE | Numbered SQL files with tracking |
| Frontend modules | 1 file | ~30 files |
| Test count | 1,692 passing | 1,692 passing (same) |

---

## 10. Dependencies Between Phases

```
Phase 1 (Foundation) ──→ Phase 2 (Backend Architecture)
                    ╲
                     ╲──→ Phase 3 (Frontend) ← independent of Phase 2
                    
Phase 2 + Phase 3  ──→ Phase 4 (Production Hardening)
```

- **Phase 1 must come first** — ESM and config are prerequisites for everything.
- **Phases 2 and 3 are independent** — can be done in parallel or either order. Spec says Week 2/3 but they don't block each other.
- **Phase 4 comes last** — migrations system needs the final DB layer from Phase 2. Docker improvements can start anytime but final config depends on Phase 1.

---

## 11. Open Questions

1. **Linting:** Should we add ESLint or Biome? The CI example above uses Biome (fast, zero-config). Decision: add Biome in Phase 4 as a CI-only check. Don't add IDE config — that's a personal preference.

2. **TypeScript:** Not in scope. The codebase is vanilla JS and the zod schemas provide runtime validation. If TypeScript is desired later, the ESM + zod foundation makes it easy to add JSDoc types or convert to `.ts` incrementally.

3. **Frontend testing:** Currently no frontend test suite. This restructure doesn't add one. Once views are modular, adding Playwright or similar becomes feasible — but it's out of scope for this 4-week plan.

4. **API documentation:** The existing `docs/openapi.yaml` (2,892 lines) should be updated as routes move to `/api/v1/`. This is maintenance, not restructuring — do it as part of each Phase 2 route conversion.
