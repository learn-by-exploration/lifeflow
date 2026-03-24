# Tests

711 tests across 40 test files. Run with `npm test`.

## Source → Test Mapping

| Source Module | Test Files |
|---|---|
| `src/routes/areas.js` | `areas.test.js`, `goals.test.js` |
| `src/routes/tasks.js` | `tasks.test.js`, `exhaustive-tasks.test.js`, `nlp.test.js`, `duetime.test.js` |
| `src/routes/tags.js` | `tags.test.js`, `subtasks.test.js` |
| `src/routes/stats.js` | `stats.test.js`, `exhaustive-stats.test.js` |
| `src/routes/features.js` | `habits.test.js`, `exhaustive-habits.test.js`, `templates.test.js`, `settings.test.js`, `exhaustive-planner.test.js` |
| `src/routes/filters.js` | `filters.test.js`, `exhaustive-filters.test.js` |
| `src/routes/data.js` | `security.test.js` (import validation) |
| `src/routes/productivity.js` | `exhaustive-inbox.test.js`, `exhaustive-notes.test.js`, `exhaustive-reviews.test.js`, `exhaustive-rules.test.js` |
| `src/routes/lists.js` | `lists.test.js`, `sublists-linking.test.js` |
| `src/db/index.js` | `data-integrity.test.js` |
| `public/index.html` | `frontend.test.js`, `frontend-validation.test.js` |

## Cross-Cutting Test Files

| File | Coverage |
|---|---|
| `crud-completeness.test.js` | Ensures all entities have full CRUD |
| `data-integrity.test.js` | FK constraints, cascade deletes, orphan prevention |
| `performance.test.js` | Response time and batch operation benchmarks |
| `security.test.js` | Input validation, injection prevention, size limits |
| `views.test.js` | Board, calendar, search, and aggregation views |
| `misc.test.js`, `exhaustive-misc.test.js` | Edge cases across multiple domains |

## Legacy Phase Files

Files named `batch*.test.js` and `phase*.test.js` contain tests added during incremental development phases. They cover a mix of features and edge cases:

- `batch4.test.js` / `batch5.test.js` — Mixed feature batches
- `phase2.test.js` through `phase7.test.js` — Version-specific regression tests

## Test Helpers

`helpers.js` — Shared setup/teardown, factory functions (`makeArea`, `makeGoal`, `makeTask`, etc.)
