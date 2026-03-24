# Contributing to LifeFlow

## Quick Start

```bash
git clone https://github.com/learn-by-exploration/lifeflow.git
cd lifeflow
npm install
npm start          # http://localhost:3456
npm test           # 711+ tests, Node.js native test runner
```

## Project Structure

```
src/
  server.js        — Express app, schema, routes
public/
  index.html       — SPA frontend (vanilla JS)
tests/
  helpers.js       — Shared setup/teardown + data builders
  *.test.js        — Test files (node:test + supertest)
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

## Code Style

- 2-space indent, single quotes, trailing commas
- No external runtime dependencies beyond `express` and `better-sqlite3`
- Tests use `node:test` + `node:assert/strict` + `supertest`

## Database

- SQLite via better-sqlite3, WAL mode, foreign keys ON
- Schema uses `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migrations
- Never drop tables — always use additive migrations
- Test DB is created in a temp directory and destroyed after tests
