# LifeFlow Test Suite

## Running Tests

```bash
npm test                      # Run all tests
npm run test:security         # Security & auth tests
npm run test:crud             # Core CRUD tests
npm run test:integration      # Integration & edge-case tests
```

## Test Categories

### Core CRUD
| File | Description |
|------|-------------|
| `areas.test.js` | Life Areas CRUD, cascades, validation |
| `goals.test.js` | Goals CRUD within areas |
| `tasks.test.js` | Tasks CRUD, status, priority, dates |
| `subtasks.test.js` | Subtask CRUD within tasks |
| `tags.test.js` | Tags CRUD, task-tag linking |
| `lists.test.js` | Custom lists + list items |
| `filters.test.js` | Saved filters |
| `custom-fields.test.js` | Custom field definitions |

### Views & UI
| File | Description |
|------|-------------|
| `views.test.js` | Multi-view rendering (today, board, etc.) |
| `frontend.test.js` | Frontend static analysis |
| `frontend-validation.test.js` | Frontend validation, routing, CSS |
| `text-overflow.test.js` | Text overflow CSS protection |
| `input-system.test.js` | Input design system, ARIA, focus |
| `mobile-responsive-fixes.test.js` | Mobile responsive fixes |
| `accessibility.test.js` | Accessibility checks |
| `a11y-mobile.test.js` | Mobile accessibility |

### Productivity
| File | Description |
|------|-------------|
| `stats.test.js` | Dashboard, analytics |
| `habits.test.js` | Habits CRUD and logging |
| `focus-system.test.js` | Focus timer system |
| `focus-enhanced.test.js` | Enhanced focus API |
| `focus-ux-improvements.test.js` | Focus UX |
| `scheduler.test.js` | Background job scheduler |
| `duetime.test.js` | Due time calculations |

### Auth & Security
| File | Description |
|------|-------------|
| `security.test.js` | Import security, body limits |
| `idor-auth.test.js` | IDOR & cross-user isolation |
| `auth-registration.test.js` | Auth registration flows |
| `csrf.test.js` | CSRF middleware |
| `cors.test.js` | CORS configuration |
| `api-tokens.test.js` | API token authentication |
| `totp-2fa.test.js` | TOTP 2FA |
| `2fa-extensive.test.js` | 2FA edge cases |
| `https-proxy.test.js` | HTTPS proxy handling |
| `multi-user.test.js` | Multi-user isolation |

### Features
| File | Description |
|------|-------------|
| `nlp.test.js` | NLP quick capture parser |
| `templates.test.js` | Task templates |
| `configurable-lists.test.js` | Configurable list types |
| `smart-filters.test.js` | Smart filters & bulk ops |
| `smart-filters-advanced.test.js` | Advanced smart filter tests |
| `settings.test.js` | User settings |
| `settings-reviews.test.js` | Settings & weekly reviews |
| `settings-advanced.test.js` | Advanced settings |
| `customization.test.js` | Customization features |
| `assignment.test.js` | Multi-user task assignment |
| `webhooks.test.js` | Outbound webhooks |
| `webhooks-extensive.test.js` | Webhook edge cases |
| `push.test.js` | Web push notifications |
| `web-push.test.js` | Push subscription management |
| `ai-byok.test.js` | AI bring-your-own-key |
| `gantt-v2.test.js` | Gantt timeline API |

### Data & Import/Export
| File | Description |
|------|-------------|
| `export-import.test.js` | Export/import completeness |
| `import-export-extensive.test.js` | Import/export roundtrip |
| `import-api.test.js` | Import API endpoints |
| `external-import.test.js` | External service imports |
| `data-integrity.test.js` | Data integrity checks |
| `misc.test.js` | Backup, export, misc API |
| `migrations.test.js` | Migration runner |

### Integration & Edge Cases
| File | Description |
|------|-------------|
| `integration-batch.test.js` | Integration batch tests |
| `exhaustive-tasks.test.js` | Task API edge cases |
| `exhaustive-inbox.test.js` | Inbox API edge cases |
| `exhaustive-notes.test.js` | Notes API edge cases |
| `exhaustive-habits.test.js` | Habits API edge cases |
| `exhaustive-misc.test.js` | Misc API edge cases |
| `exhaustive-reviews.test.js` | Reviews edge cases |
| `exhaustive-filters.test.js` | Filter edge cases |
| `exhaustive-stats.test.js` | Stats edge cases |
| `exhaustive-planner.test.js` | Planner edge cases |
| `exhaustive-rules.test.js` | Automation rules edge cases |
| `custom-fields-extensive.test.js` | Custom fields edge cases |
| `input-fuzzing.test.js` | Input fuzzing / boundary tests |
| `http-edge-cases.test.js` | HTTP protocol edge cases |
| `logic-edge-cases.test.js` | Business logic edge cases |
| `concurrency.test.js` | Concurrency tests |
| `performance.test.js` | Performance benchmarks |

### Launch & Readiness
| File | Description |
|------|-------------|
| `launch-readiness.test.js` | Launch readiness checks |
| `launch-checks.test.js` | Launch validation suite |
| `gaps-coverage.test.js` | Coverage gap tests |
| `transactions.test.js` | Transaction integrity |
| `search-ical-planner.test.js` | Search, iCal, planner |
| `engagement-phase1.test.js` | User engagement features |

### Infrastructure
| File | Description |
|------|-------------|
| `helpers.test.js` | Test helper infrastructure |
| `lint-config.test.js` | ESLint configuration |
| `ci-config.test.js` | CI/CD pipeline config |
| `release-hygiene.test.js` | Release hygiene checks |
| `test-organization.test.js` | Test naming conventions |
| `docs-completeness.test.js` | Documentation completeness |
| `compression.test.js` | Response compression |
| `process-errors.test.js` | Process error handlers |
| `crud-completeness.test.js` | CRUD route completeness |
| `ui-ux-review.test.js` | UI/UX review checks |
| `offline-queue.test.js` | Offline queue / SW |
| `sublists-linking.test.js` | Sublist linking |

## Test Helpers

All test files import from `./helpers.js` which provides:

- `setup()` — Initialize test DB + Express app
- `cleanDb()` — Reset all tables between tests
- `agent()` — Authenticated supertest agent (default user)
- `rawAgent()` — Unauthenticated supertest agent
- `makeArea()`, `makeGoal()`, `makeTask()`, `makeSubtask()` — Factory functions
- `makeTag()`, `linkTag()` — Tag factories
- `makeFocus()`, `makeHabit()`, `makeList()`, `makeListItem()` — Feature factories
- `makeUser2()` — Create second user with isolated session
- `agentAs(sessionId)` — Create authenticated agent for any session
- `today()`, `daysFromNow(n)` — Date helpers

## Conventions

- File names: `{module}.test.js` or `{module}-{aspect}.test.js`
- No `phase*`, `batch*`, or `break_*` prefixes
- No underscores in filenames (use hyphens)
- Every test file has a top-level `describe()` block
- Use `beforeEach` with `cleanDb()` for isolation
- Use factory functions instead of raw SQL inserts
