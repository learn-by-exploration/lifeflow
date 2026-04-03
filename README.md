# LifeFlow

> **The task manager that lives on your machine.** Self-hosted, keyboard-first, zero cloud.

LifeFlow is a personal productivity app with a 4-level hierarchy (Life Area → Goal → Task → Subtask), 25+ views, and no external dependencies. Your data stays on your machine — always.

## Features

- **Deep hierarchy** — Life Areas → Goals → Tasks → Subtasks (most competitors cap at 2 levels)
- **25+ views** — Today, Board (Kanban), Calendar, Weekly Plan, Eisenhower Matrix, Day Planner, Dashboard, Reports, and more
- **Collapsible sidebar** — Icon rail mode (`Ctrl+B`), tooltips, smooth transitions, desktop-only
- **Habits & streaks** — Daily habit tracking with heatmaps and streak counters
- **Focus timer** — Pomodoro (25/5/15min) with session history, stats, and per-task tracking
- **Smart capture** — NLP parser extracts dates, priorities, and tags from natural text
- **Custom lists** — Checklists, grocery lists, notes — shareable via link
- **8 themes** — Midnight, Charcoal, Nord, Ocean, Forest, Rose, Sunset, Light + auto-detect
- **Keyboard-first** — `Ctrl+K` command palette, `N` quick capture, `?` shortcut help
- **Multi-user auth** — Session-based with bcrypt password hashing
- **Offline-ready** — Service Worker with network-first caching
- **Print stylesheet** — Clean printable task lists
- **Zero cloud** — SQLite database, no tracking, no telemetry

## Quick Start

```bash
git clone https://github.com/learn-by-exploration/lifeflow.git
cd lifeflow
npm install
node src/server.js    # → http://localhost:3456
```

## Docker

```bash
docker compose up -d
# or:
docker run -d -p 3456:3456 -v lifeflow-data:/app/data lifeflow
```

Data is persisted in `/app/data` inside the container. See [docs/deployment.md](docs/deployment.md) for production setup.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 |
| Backend | Express 5, better-sqlite3 (WAL mode) |
| Frontend | Vanilla JS SPA — no framework, no build step |
| Auth | bcryptjs, express-session, CSRF tokens |
| Security | helmet, express-rate-limit, input validation |
| Testing | node:test (built-in), supertest |
| Container | Docker (node:22-slim) |
| CI | GitHub Actions (Node 20 + 22) |

## Project Structure

```
src/
  server.js             — Express app entry point
  db/index.js           — SQLite schema (35 tables), migrations, startup integrity check
  routes/               — 11 route modules (191 routes)
  middleware/            — Auth, CSRF, validation, errors
  schemas/              — Zod validation schemas
  repositories/         — Data access layer
  services/             — Business logic + audit logging
public/
  app.js                — SPA frontend (5,966 lines)
  styles.css            — All styles + 8 themes (1,342 lines)
  index.html            — SPA shell (454 lines)
  sw.js                 — Service Worker
  js/                   — ES module extractions
tests/
  *.test.js             — 144 test files, 3,500 tests
docs/
  openapi.yaml          — Full API spec (3,163 lines)
  architecture.md       — System design & patterns
  deployment.md         — Docker & self-hosted guide
```

## Testing

```bash
npm test                                    # All 3,500 tests
node --test tests/tasks.test.js             # Single file
node --test --test-name-pattern "overdue"   # By name pattern
```

## API

191 routes across 11 modules. Full OpenAPI 3.0.3 spec at [docs/openapi.yaml](docs/openapi.yaml).

Quick test:

```bash
# Register
curl -X POST http://localhost:3456/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"me","password":"secret123"}'

# Login (stores session cookie)
curl -c cookies.txt -X POST http://localhost:3456/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"me","password":"secret123"}'

# Create an area
curl -b cookies.txt -X POST http://localhost:3456/api/areas \
  -H 'Content-Type: application/json' \
  -d '{"name":"Health","icon":"💪","color":"#10B981"}'

# List tasks
curl -b cookies.txt http://localhost:3456/api/tasks/all
```

See [docs/api/quickstart.md](docs/api/quickstart.md) for more examples.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, testing conventions, and code style.

## License

MIT — see [LICENSE](LICENSE)
