# Contributing to LifeFlow

## Quick Start

```bash
git clone https://github.com/learn-by-exploration/lifeflow.git
cd lifeflow
npm install
npm start          # http://localhost:3456
npm test           # 1,992+ tests, Node.js native test runner
```

## Project Structure

```
src/
  server.js          — Express app entry point (174 lines)
  db/index.js        — SQLite schema, 26 tables, migrations (511 lines)
  routes/            — 11 route modules (190+ routes total)
    areas.js         — Life Areas CRUD + reorder
    auth.js          — Register, login, logout, session
    data.js          — Export, import, backup
    features.js      — Habits, templates, automations, inbox, notes, reviews
    filters.js       — Saved filters, smart lists
    lists.js         — Custom lists + list items
    productivity.js  — Focus timer, reminders, triage, comments
    stats.js         — Dashboard, streaks, heatmap, activity
    tags.js          — Tags CRUD + stats
    tasks.js         — Tasks CRUD, reorder, NLP parse, board, calendar
  middleware/        — Auth, CSRF, validation, error handling
  services/          — Audit logging
public/
  app.js             — SPA frontend: views, routing, state (5,369 lines)
  styles.css         — Styles, responsive breakpoints, themes (1,246 lines)
  index.html         — SPA shell, overlays, modals (436 lines)
  sw.js              — Service Worker (192 lines)
tests/
  helpers.js         — Shared setup/teardown + data builders
  *.test.js          — 80+ test files (node:test + supertest)
docs/
  openapi.yaml       — Full OpenAPI 3.0.3 spec
```

## Running Tests

```bash
npm test                                    # All tests
node --test tests/tasks.test.js             # Single file
node --test --test-name-pattern "overdue"   # By name pattern
```

## Making Changes

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes — read existing files before editing
3. Add tests for new behavior
4. Run `npm test` — all tests must pass
5. Commit with a descriptive message
6. Open a PR against `main`

## TDD Methodology

1. **RED:** Write a failing test first — the test should fail for the right reason
2. **GREEN:** Write the minimum code to make the test pass
3. **REFACTOR:** Clean up only if the implementation is unclear
4. Run `npm test` after each change — zero failures required

## Code Style

- 2-space indent, single quotes, trailing commas
- No external runtime dependencies beyond `express`, `better-sqlite3`, `bcryptjs`, `helmet`, `cors`, `express-rate-limit`, `web-push`, `pino`, and `zod`
- Tests use `node:test` + `node:assert/strict` + `supertest`
- See `CLAUDE.md` for full architecture documentation

## Database

- SQLite via better-sqlite3, WAL mode, foreign keys ON
- Schema uses `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migrations
- Never drop tables — always use additive migrations
- Test DB is created in a temp directory and destroyed after tests
