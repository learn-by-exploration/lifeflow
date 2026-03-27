# LifeFlow Feature Gap Analysis — Expert Panel Review

> **Date:** 27 March 2026 (updated: 27 March 2026)
> **Scope:** Recurring task review + Any.do feature comparison
> **Panel:** Product, Engineering, UX, Growth, Security
> **Architecture Direction:** Self-hostable server — users run their own LifeFlow instance for multi-device access and API integration

---

## Part 0: Architecture Direction — Self-Hosted Server Model

### The Vision

LifeFlow will offer **two hosting models** — users choose based on their privacy and control preferences:

| Model | Description | Data Location | Pricing Position |
|-------|-------------|--------------|-----------------|
| **Cloud Hosted** | LifeFlow runs the server. Users sign up, start using immediately. | LifeFlow's infrastructure | **Lower price** — convenience-first, shared infra costs |
| **Self Hosted** | User runs their own LifeFlow instance (Docker, VPS, NAS, Raspberry Pi). | User's own hardware | **Higher price** (license fee) — privacy premium, full control |

### Why This Pricing Model Works

**Self-hosted costs MORE because:**
- Users who need self-hosting are privacy-conscious professionals/enterprises — higher willingness to pay
- Self-hosted = full data sovereignty, no vendor lock-in, no data mining — that's a premium feature
- Cloud-hosted subsidized by scale (thousands of users share infra) — self-hosted is 1:1
- Precedent: Bitwarden ($0 cloud vs $199/yr self-hosted business), GitLab (free SaaS vs paid self-managed)

**Cloud-hosted costs LESS because:**
- Lower friction → higher conversion → larger user base
- Users trade some privacy for convenience (data on LifeFlow servers, but encrypted at rest)
- Upsell path: free tier → paid cloud → self-hosted when they outgrow it

### Shared Codebase, One API

Both models run the **exact same code**. The difference is:

| Concern | Cloud Hosted | Self Hosted |
|---------|-------------|-------------|
| Deployment | LifeFlow manages (Kubernetes/Docker) | User manages (docker compose up) |
| HTTPS | Automatic (Let's Encrypt) | User configures (reverse proxy) |
| Backups | Automatic daily, 30-day retention | User's responsibility (auto-backup exists) |
| Updates | Automatic rolling updates | User pulls new Docker image |
| Multi-user | Instance per user (isolated) | Shared instance (family/team) |
| API tokens | Available on paid plan | Always available |
| Support | Email + in-app chat | Community (GitHub Issues) + premium support tier |
| Data export | Always available (no lock-in) | Always available |

### What This Changes

| Concern | Local-Only (Current) | Cloud Hosted (Future) | Self Hosted (Future) |
|---------|---------------------|----------------------|---------------------|
| Access | Single device, localhost:3456 | Any device, app.lifeflow.io | Any device, tasks.myserver.com |
| Data privacy | Maximum — never leaves machine | Encrypted at rest on LifeFlow infra | Maximum — user's own server |
| Multi-device sync | ❌ Not possible | ✅ Automatic | ✅ Automatic |
| Mobile access | PWA on same machine only | PWA from any device | PWA from any device |
| API tokens | Low value (localhost only) | Available on paid plan | Always available |
| Integrations | Impractical | ✅ Webhooks, calendar sync | ✅ Full control |
| Collaboration | Single-user | Per-user instance | ✅ Family/team on shared instance |
| AI features | Privacy concern | LifeFlow-managed (opt-in) | BYOK — user's own API key |
| Push notifications | Browser only, same device | ✅ Web Push to any device | ✅ Web Push to any device |
| Offline support | Always works (local) | PWA offline + sync-on-reconnect | PWA offline + sync-on-reconnect |
| Cost to user | Free (run it yourself) | Subscription (free tier available) | License fee (one-time or annual) |

### What This Does NOT Change

- **No SaaS** — LifeFlow is not a hosted service. No subscription model, no vendor lock-in.
- **No build step** — Still vanilla JS, edit-and-reload.
- **SQLite stays** — Perfect for single-instance self-hosting. No Postgres needed for personal use.
- **Express stays** — HTTP API doesn't change. Just accessed remotely instead of locally.

### Infrastructure Prerequisites

| Prerequisite | Why | Priority |
|-------------|-----|----------|
| **HTTPS/TLS support** | Cookies, CSRF tokens, and Web Push all require secure context over the internet | **P0** |
| **API token auth** | Session cookies work for browsers; API tokens needed for scripts, mobile apps, integrations | **P1** |
| **CORS configuration** | Allow cross-origin requests from user's custom domains/apps | **P1** |
| **Rate limiting (already exists)** | Even more important when exposed to the internet | ✅ Done |
| **Web Push notifications** | Replace browser-only Notification API with Web Push (works across devices) | **P2** |
| **Sync conflict resolution** | If two devices edit the same task simultaneously | **P2** |
| **Docker image** | Already exists (Dockerfile + docker-compose.yml) | ✅ Done |
| **Reverse proxy docs** | Nginx/Caddy config examples for HTTPS termination | **P1** |

---

## Part 1: Recurring Task Feature Review

### Current Implementation

The recurring system is **well-implemented** — a solid foundation covering 90% of use cases.

**Strengths:**
- 8 pattern types: daily, weekly, biweekly, monthly, yearly, weekdays, every-N-days, every-N-weeks
- Advanced JSON patterns: specific-days (MWF), endAfter, endDate, interval multipliers
- Clean architecture: `RecurringService.spawnNext()` handles all logic in a transaction
- Tags, time blocks, estimated minutes, assigned_to all preserved on spawn
- Skip endpoint for "skip this week" UX
- ~80 tests across 9 test files

**Issues Found:**

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1 | Subtasks not copied on spawn | **HIGH** | Completing a recurring task loses its subtask structure. A weekly "Clean house" task with subtasks (kitchen, bathroom, bedroom) spawns without them. User must re-add each time. |
| 2 | No recurring validation schema | **MEDIUM** | The `recurring` field accepts any string — no Zod schema validates the JSON structure. Malformed JSON could cause errors or be silently ignored. |
| 3 | NLP doesn't parse recurring | **LOW** | Quick capture "Buy groceries every Friday" doesn't detect "every Friday" → user must manually set recurrence in the editor. |
| 4 | No "snooze one day" for recurring | **LOW** | Skip marks done + spawns next. There's no "push this occurrence +1 day" without losing the scheduled date. The snooze/reschedule button works but doesn't understand recurring context. |
| 5 | Recurring tasks don't show chain history | **LOW** | No way to see past occurrences of a recurring task — each spawn is an independent task. |

### Recommendations

1. **Copy subtasks on spawn** (HIGH value) — When spawning next occurrence, clone subtask titles+positions with `done=0`. This is the single biggest quality-of-life improvement.
2. **Add Zod schema for recurring field** — Validate JSON structure at API boundary.
3. **Defer NLP recurring parsing** — Complex to get right, low ROI vs the manual dropdown.

---

## Part 2: Any.do Feature Comparison

### Feature Matrix: LifeFlow vs Any.do

| Any.do Feature | LifeFlow Status | Gap? | Panel Verdict |
|----------------|----------------|------|---------------|
| Tasks & Lists | ✅ Full | No | — |
| Calendar | ✅ Full (month grid + task pills) | No | — |
| Daily Planner | ✅ Full (Today view + time blocking) | No | — |
| Widgets | ❌ Missing | Yes | **RECONSIDER** — PWA on remote server enables home screen widgets via shortcuts |
| Reminders (time-based) | ✅ Full (browser notifications) | No | Upgrade to **Web Push** for cross-device |
| Reminders (location-based) | ❌ Missing | Yes | **SKIP** — requires GPS/mobile native app |
| Reminders (recurring) | ✅ Full | No | — |
| WhatsApp integration | ❌ Missing | Yes | **CONSIDER** — feasible with server-side bot + WhatsApp Business API |
| AI assistant | ❌ Missing | Yes | **BUILD** — user brings own API key (OpenAI/Anthropic). No privacy concern on self-hosted. |
| Break It Down (subtasks) | ✅ Full | No | — |
| Color Tags | ✅ Full | No | — |
| Family Board | ❌ Missing | Yes | **BUILD** — self-hosted instance = natural family/household server |
| Shared Grocery List | ✅ Full (shared lists with categories) | No | — |
| Manage Family Projects | ❌ Missing | Yes | **BUILD** — follows from multi-user on same instance |
| Schedule & Assign Tasks | ⚠️ Partial (field exists, no UI) | Partial | **BUILD** — natural next step with multi-user on shared instance |
| Templates | ✅ Full | No | — |
| Chat In Context | ✅ Full (task comments) | No | — |
| Unlimited Boards | ⚠️ Partial (one global + per-goal) | Partial | **CONSIDER** — custom boards per project/context |
| Assign Tasks | ⚠️ Partial (text field, no real assignment) | Partial | **BUILD** — with real user references |
| Kanban View | ✅ Full | No | — |
| Calendar View | ✅ Full | No | — |
| Table View | ❌ Missing | Yes | **BUILD** — high value, moderate effort |
| Custom Views | ⚠️ Partial (saved filters + smart lists) | Partial | **CONSIDER** — saved layouts/groupings |
| Integrations (6000+ apps) | ❌ Missing | Yes | **BUILD** — API tokens + webhooks enable Zapier/n8n/IFTTT |
| Automations | ✅ Full | No | — |
| Custom Fields | ❌ Missing | Yes | **BUILD** — high value, moderate effort |
| Board Notifications | ⚠️ Partial (bell icon) | Partial | Upgrade to **Web Push** |
| Private Boards | ❌ N/A (single-user by default) | Yes | **BUILD** — needed once multi-user exists |
| Import | ✅ Full (JSON) | No | Add Todoist/Trello importers (Tier 3) |
| Time Tracking | ⚠️ Partial (focus sessions + manual) | Partial | **BUILD** — connect Pomodoro to actual_minutes |
| Completed Tasks Report | ✅ Full (Activity Log + Reports) | No | — |
| Gantt Chart | ❌ Missing | Yes | **BUILD** — already on roadmap |

---

## Part 3: Expert Panel Analysis (Revised for Self-Hosted Server Model)

### 🔴 Product Panel

> "The self-hosted server direction changes everything. LifeFlow isn't just a local tool anymore — it's a **personal productivity server**. Think of it like Nextcloud for tasks. This unlocks multi-device access, family sharing, integrations, and AI — all while keeping data sovereignty. The competitive moat is: Any.do holds your data hostage; LifeFlow runs on YOUR server."

**Product recommendations (revised):**

1. **API Tokens** — Now **P0**, not P3. Remote access from scripts, mobile apps, and integrations all depend on this. Session cookies only work in browsers.
2. **Web Push Notifications** — Replace browser-only notifications with Web Push so users get alerts on their phone even when LifeFlow isn't open.
3. **Multi-user on same instance** — A family running LifeFlow on a NAS is the killer use case for self-hosted. The `assigned_to` field already exists. Build real user assignment + per-user task visibility.
4. **AI with BYOK** — "Bring Your Own Key" model for OpenAI/Anthropic. No privacy concern because the user controls both the server AND their API key. Use for: task breakdown suggestions, smart scheduling, natural language queries.

### 🟡 Engineering Panel

> "The good news: the architecture is already server-ready. Express + SQLite + Docker works perfectly for single-instance self-hosting. The main gaps are: (1) API token auth alongside session auth, (2) Web Push requires VAPID keys and a subscription store, (3) multi-user needs permission boundaries beyond just user_id scoping. SQLite handles concurrent reads well with WAL mode — fine for a family of 4-5 users."

**Revised complexity estimates:**

| Feature | Complexity | Notes |
|---------|-----------|-------|
| API Tokens | **Medium** | New `api_tokens` table, bearer auth middleware, token CRUD in settings |
| HTTPS/TLS docs | **Small** | Nginx/Caddy reverse proxy examples, env var for base URL |
| Web Push | **Medium** | VAPID key generation, `push_subscriptions` table, web-push npm package |
| Multi-user assignment | **Medium** | Real user_id references in assigned_to, notification on assignment, task visibility rules |
| AI BYOK | **Medium** | Settings for API key (encrypted), proxy endpoint, prompt templates for task breakdown/scheduling |
| Sync conflict resolution | **Large** | Last-write-wins is simplest. Optimistic locking with `updated_at` version check for robustness |

### 🟢 UX Panel

> "Multi-device is the headline feature. A user adds a task on their laptop, sees it on their phone at the grocery store. That's the pitch. But don't lose the speed — LifeFlow loads in <200ms locally. Over the network, perceived performance drops. Invest in optimistic UI updates and PWA caching to keep it feeling instant."

**UX recommendations (revised):**
- Offline-first PWA: Queue mutations locally, sync when online (Service Worker already does network-first caching — extend to writes)
- API tokens: Show in Settings → Data tab with copy-to-clipboard and revoke
- Multi-user: Keep it simple — shared instance, each user sees their own tasks. Assigned tasks appear in assignee's "Today" view.
- AI: Surface as a "✨ Suggest" button in task detail panel — not a chatbot

### 🔵 Growth Panel

> "Self-hosted is a growing market (Nextcloud, Immich, Jellyfin). The privacy-conscious developer/enthusiast audience is highly engaged and vocal. If LifeFlow gets listed on awesome-selfhosted, it could go viral. The key: make the Docker setup dead simple (one `docker compose up`), and provide a demo instance for try-before-you-install."

### 🟣 Security Panel

> "Exposing to the internet is a major threat model change. HTTPS is non-negotiable. API tokens must be hashed (bcrypt, like passwords) — never stored in plain text. Rate limiting per-token. CORS must be configurable. Consider adding: failed login lockout, audit log for admin, and optional 2FA (TOTP). The existing CSRF protection and session management are solid, but review them for cross-origin scenarios."

**Security requirements for server mode:**

| Requirement | Priority | Detail |
|-------------|----------|--------|
| HTTPS enforcement | **P0** | Redirect HTTP → HTTPS. Set `Secure` flag on cookies. HSTS header. |
| API token hashing | **P0** | Store bcrypt hash of token, not plaintext. Compare on each request. |
| CORS configuration | **P1** | Env var `ALLOWED_ORIGINS` for cross-origin browser access |
| Failed login lockout | **P1** | 5 failed attempts → 15 min lockout (per IP or per username) |
| Audit log | **P2** | Log auth events, data exports, user creation/deletion |
| TOTP 2FA | **P3** | Optional two-factor auth for internet-exposed instances |

---

## Part 4: Prioritized Recommendations (Revised for Self-Hosted Server)

### Tier 1 — Do Now (Quick wins + server foundation)

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 1 | **Copy subtasks on recurring spawn** | Top recurring task pain point. 10 lines in RecurringService. | Small |
| 2 | **Auto-link Pomodoro to actual_minutes** | Focus session duration should update task's actual_minutes automatically. | Small |
| 3 | **Recurring field Zod validation** | Security hardening. Prevents malformed JSON in recurring config. | Small |
| 4 | **API Token authentication** | Foundation for everything: remote access, mobile, integrations, scripts. New `api_tokens` table, bearer middleware. | Medium |
| 5 | **HTTPS/reverse proxy documentation** | Nginx/Caddy examples, `BASE_URL` env var, cookie secure flag. | Small |

### Tier 2 — Server-Ready (Multi-device + notifications)

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 6 | **Web Push notifications** | Cross-device reminders. VAPID keys, `push_subscriptions` table, web-push npm. | Medium |
| 7 | **Table View** | Missing view type. Sortable, groupable, inline-editable. 4th tab in Tasks Hub. | Medium |
| 8 | **Custom Fields** | User-defined task metadata. `custom_field_defs` + `task_custom_values` tables. | Medium |
| 9 | **Offline mutation queue** | PWA queues writes when offline, syncs on reconnect. Critical for mobile-over-network. | Medium |

### Tier 3 — Power Features (Views + collaboration)

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 10 | **Gantt Chart** | Timeline view with dependency arrows. SVG rendering. Already on roadmap. | Large |
| 11 | **Multi-user task assignment** | Real user references in assigned_to, notification on assignment, task in assignee's Today view. | Medium |
| 12 | **AI BYOK (Bring Your Own Key)** | User provides OpenAI/Anthropic key in settings. Use for: task breakdown, smart scheduling, NL queries. No privacy concern — user's server, user's key. | Medium |
| 13 | **Outbound webhooks** | POST to user-configured URLs on task events. Enables Zapier/n8n/IFTTT without building specific integrations. | Medium |

### Tier 4 — Ecosystem (Stretch goals)

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 14 | **Calendar sync (CalDAV)** | Two-way sync with Google/Apple Calendar via CalDAV protocol. Self-hosted friendly (no OAuth needed for CalDAV). | Large |
| 15 | **Telegram/WhatsApp bot** | Create tasks and get reminders via messaging. Server-side bot connects to messaging API. | Medium |
| 16 | **Todoist/Trello importer** | One-time import from other tools. Lowers switching cost. | Small |
| 17 | **TOTP 2FA** | Optional two-factor auth for internet-exposed instances. | Medium |
| 18 | **Sync conflict resolution** | Optimistic locking with `updated_at` version check. For concurrent edits from multiple devices. | Large |

### Explicitly Skipped

- **Location-based reminders** — Requires native mobile app with GPS. Out of scope for web-based self-hosted tool.
- **Native widgets** — PWA shortcuts + Web Push cover 80% of the widget use case. True widgets need native app.
- **Live chat support** — Self-hosted tool, no support team. GitHub Issues + docs serve this purpose.
- **6000+ integrations marketplace** — Webhooks + API tokens let users build their own via n8n/Zapier. No need for a plugin system.

---

## Part 5: Recurring Task Improvements (Detailed)

### 5.1 Copy Subtasks on Spawn

**Current:** Completing a recurring task spawns a new occurrence but subtasks are lost.
**Proposed:** Clone all subtask titles + positions with `done=0` inside the spawn transaction.

```
Location: src/services/recurring.service.js → spawnNext()
After: INSERT INTO tasks → get newId
Add:   SELECT subtasks WHERE task_id = old_id
       INSERT INTO subtasks (task_id=newId, title, position, done=0) for each
```

**Edge cases:**
- Subtask notes: copy or skip? → Copy (users add checklists with context)
- Subtask position: preserve original ordering → Yes
- Nested subtasks: N/A (LifeFlow has flat subtasks)

### 5.2 Auto-link Pomodoro to actual_minutes

**Current:** Focus sessions track `duration_sec` but don't update `tasks.actual_minutes`.
**Proposed:** On focus session completion, add duration to task's `actual_minutes`.

```
Location: src/routes/productivity.js or stats.js → POST /api/focus (session save)
After: INSERT INTO focus_sessions
Add:   UPDATE tasks SET actual_minutes = COALESCE(actual_minutes, 0) + :minutes
       WHERE id = :task_id
```

### 5.3 Recurring JSON Validation

**Proposed Zod schema:**
```javascript
const recurringSchema = z.union([
  z.enum(['daily','weekly','biweekly','monthly','yearly','weekdays']),
  z.string().regex(/^every-\d+-(days|weeks)$/),
  z.object({
    pattern: z.enum(['daily','weekly','biweekly','monthly','yearly','weekdays','specific-days']),
    interval: z.number().int().min(1).max(365).optional(),
    days: z.array(z.number().int().min(0).max(6)).optional(),
    endAfter: z.number().int().min(1).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    count: z.number().int().min(0).optional(),
  }).strict(),
  z.null(),
]);
```

---

## Part 6: Implementation Plans

### 6.1 Copy Subtasks on Recurring Spawn

**Effort:** Small (10 lines, 1 file + tests)
**Risk:** None — additive change inside existing transaction

#### Changes

**`src/services/recurring.service.js` → `spawnNext()` method:**

Add after the tag-copying loop (after line ~43), still inside the `spawnTx` transaction:

```javascript
// Copy subtasks to new task (reset done=0)
const oldSubs = db.prepare('SELECT title, note, position FROM subtasks WHERE task_id=? ORDER BY position').all(task.id);
const insSub = db.prepare('INSERT INTO subtasks (task_id, title, note, done, position) VALUES (?, ?, ?, 0, ?)');
oldSubs.forEach(s => insSub.run(r.lastInsertRowid, s.title, s.note || '', s.position));
```

#### Tests (add to existing recurring test file)

```
1. Complete recurring task with 3 subtasks → verify spawned task has 3 subtasks with done=0
2. Complete recurring task with subtask notes → verify notes are copied
3. Complete recurring task with no subtasks → verify spawn still works (no regression)
4. Skip recurring task with subtasks → verify spawned task has subtasks
5. Verify subtask positions are preserved in spawned task
```

#### Edge Cases
- Subtask with empty note → copy as '' (not null)
- Task with 0 subtasks → no-op (SELECT returns empty array, forEach does nothing)
- Subtask ordering → ORDER BY position preserves original order

---

### 6.2 Auto-Link Pomodoro to actual_minutes

**Effort:** Small (5 lines, 1 file + tests)
**Risk:** None — additive UPDATE after existing INSERT

#### Changes

**`src/routes/stats.js` → `PUT /api/focus/:id/end` handler (line ~163):**

Add after the UPDATE focus_sessions statement, before the response:

```javascript
// Auto-update task's actual_minutes with focus session duration
if (ex.task_id) {
  const minutes = Math.round((duration_sec !== undefined ? duration_sec : ex.duration_sec) / 60);
  if (minutes > 0) {
    db.prepare('UPDATE tasks SET actual_minutes = COALESCE(actual_minutes, 0) + ? WHERE id=? AND user_id=?')
      .run(minutes, ex.task_id, req.userId);
  }
}
```

#### Tests

```
1. Complete focus session (1500 sec = 25 min) → task.actual_minutes increases by 25
2. Complete focus session on task with existing actual_minutes (10) → becomes 10+25=35
3. Complete focus session with 0 duration → task.actual_minutes unchanged
4. Complete focus session with no task_id → no error (guard check)
5. Two focus sessions on same task → actual_minutes accumulates correctly
```

#### Notes
- Round to nearest minute (1500s → 25m, 1530s → 26m, 89s → 1m)
- Don't double-count: only update on `/end`, not on initial `/focus` POST
- The existing `POST /api/tasks/:id/time` endpoint still works for manual time logging

---

### 6.3 Table View

**Effort:** Medium (1 backend endpoint + ~250 lines frontend + tests)
**Risk:** Low — new view, no existing code modified

#### Backend

**New endpoint: `GET /api/tasks/table`** in `src/routes/tasks.js`:

```
Query params:
  sort_by:    'title' | 'due_date' | 'priority' | 'status' | 'area' | 'created_at' (default: 'due_date')
  sort_dir:   'asc' | 'desc' (default: 'asc')
  group_by:   'area' | 'goal' | 'status' | 'priority' | 'tag' | 'none' (default: 'none')
  status:     'todo' | 'doing' | 'done' | 'all' (default: 'all')
  area_id:    number (optional filter)
  limit:      1-500 (default: 100)
  offset:     number (default: 0)

Response: {
  tasks: [enriched task objects],
  total: number,
  groups: [{name, count}] (if group_by !== 'none')
}
```

SQL construction: Dynamic ORDER BY with whitelist validation. GROUP BY handled in JS after query.

#### Frontend

**Add to Tasks Hub tabs array** in `renderTasksHub()`:
```javascript
{id:'table',label:'Table',icon:'table_chart'}
```

**New function `renderTable(container)`:**

| Column | Width | Sortable | Content |
|--------|-------|----------|---------|
| ☐ | 32px | No | Checkbox (complete task) |
| Title | flex | Yes | Task title, click to open detail panel |
| Area | 100px | Yes | Area icon + name |
| Goal | 120px | Yes | Goal title with color dot |
| Due | 90px | Yes | Relative date with overdue highlighting |
| Priority | 70px | Yes | Flag icon + label (None/Normal/High/Critical) |
| Status | 70px | Yes | Badge (todo/doing/done) |
| Tags | 120px | No | Color dots, overflow with +N |
| Est. | 50px | Yes | Estimated minutes |
| Act. | 50px | Yes | Actual minutes |

**Interactions:**
- Click column header → sort by that column (toggle asc/desc)
- Click task title → open detail panel (`openDP()`)
- Click checkbox → toggle status
- Click priority flag → cycle priority
- Group-by dropdown above table → re-render with group headers
- Pagination at bottom → "Showing 1-100 of 342"

**CSS:** Add `.tv` (table view) styles — sticky header, alternating row colors, hover highlight, responsive horizontal scroll on mobile.

#### Tests

```
1. GET /api/tasks/table — returns tasks array with total count
2. Sort by priority DESC — Critical tasks first
3. Sort by due_date ASC — soonest first, nulls last
4. Group by area — response includes groups array
5. Filter by status=todo — only todo tasks returned
6. Filter by area_id — only tasks from that area
7. Pagination — limit=10&offset=10 returns second page
8. Empty result set — returns {tasks:[], total:0}
```

---

### 6.4 Custom Fields

**Effort:** Medium-Large (2 tables, 8 endpoints, settings UI, detail panel integration)
**Risk:** Medium — new schema, needs careful validation

#### Database Schema

**Table 1: `custom_field_defs`** — field definitions per user
```sql
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','select')),
  options TEXT DEFAULT NULL,        -- JSON array for select type: ["Low", "Medium", "High"]
  position INTEGER DEFAULT 0,
  required INTEGER DEFAULT 0,
  show_in_card INTEGER DEFAULT 0,   -- Display in task card (list/board views)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)
);
```

**Table 2: `task_custom_values`** — field values per task
```sql
CREATE TABLE IF NOT EXISTS task_custom_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  field_id INTEGER NOT NULL,
  value TEXT,                        -- All types stored as TEXT, validated by field_type
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  UNIQUE(task_id, field_id)
);
```

#### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/custom-fields` | List user's field definitions |
| POST | `/api/custom-fields` | Create field definition |
| PUT | `/api/custom-fields/:id` | Update field definition (name, options, position) |
| DELETE | `/api/custom-fields/:id` | Delete field + all values |
| GET | `/api/tasks/:id/custom-fields` | Get field values for a task |
| PUT | `/api/tasks/:id/custom-fields` | Set/update field values for a task (batch) |

#### Request/Response Examples

**POST /api/custom-fields:**
```json
{ "name": "Client", "field_type": "text", "show_in_card": true }
{ "name": "Energy Level", "field_type": "select", "options": ["Low", "Medium", "High"] }
{ "name": "Budget", "field_type": "number" }
{ "name": "Deadline", "field_type": "date" }
```

**PUT /api/tasks/:id/custom-fields:**
```json
{ "fields": [
  { "field_id": 1, "value": "Acme Corp" },
  { "field_id": 2, "value": "High" },
  { "field_id": 3, "value": "5000" }
]}
```

#### Validation Rules

| Field Type | Validation | Storage |
|-----------|-----------|---------|
| text | Max 500 chars | As-is |
| number | Parseable as number, finite | String representation |
| date | YYYY-MM-DD regex | ISO date string |
| select | Value must be in `options` array | Exact match |

#### Frontend Integration

**Settings → new "Custom Fields" tab:**
- List existing fields with drag-to-reorder
- Add field: name input, type dropdown, options editor (for select)
- Toggle "Show in card" per field

**Task Detail Panel (`renderDPBody`):**
- After existing fields (tags, subtasks, deps, comments), add "Custom Fields" section
- Render appropriate input for each field type
- Auto-save on blur/change

**Task Card (`tcHtml`):**
- If field has `show_in_card=1`, display value in meta section

#### enrichTask Extension

Extend `enrichTasks()` in `src/helpers.js` to batch-load custom field values:
```javascript
// In enrichTasks(), after blocked_by:
const cfValues = db.prepare(`
  SELECT v.task_id, v.field_id, v.value, d.name, d.field_type
  FROM task_custom_values v JOIN custom_field_defs d ON v.field_id=d.id
  WHERE v.task_id IN (${placeholders})
`).all(...ids);
// Map to: task.custom_fields = [{field_id, name, field_type, value}, ...]
```

#### Tests (20-30)

```
Field definition CRUD:
1. Create text field → 201, field returned
2. Create select field with options → options stored as JSON
3. Create field with duplicate name → 409 conflict
4. Update field name → 200
5. Delete field → cascade deletes all values
6. List fields → ordered by position

Value CRUD:
7. Set text value on task → 200
8. Set number value → validated as number
9. Set date value → validated as YYYY-MM-DD
10. Set select value → must be in options array
11. Set select value not in options → 400
12. Update existing value → upsert behavior
13. Get task custom fields → returns all values with field names
14. Delete task → custom values cascade deleted

Integration:
15. enrichTask includes custom_fields array
16. Table view includes custom field columns
17. Export includes custom field definitions + values
18. Import restores custom field definitions + values
```

---

### 6.5 Gantt Chart

**Effort:** Large (reuse existing data, ~500 lines SVG frontend, ~15 tests)
**Risk:** Medium — complex rendering, but data already exists

#### Backend

**No new endpoints needed.** Reuse:
- `GET /api/tasks/calendar?start=...&end=...` — tasks with due dates in range
- `GET /api/tasks/:id/deps` — dependency data (already enriched via `blocked_by`)
- `enrichTask` already provides: `due_date`, `estimated_minutes`, `blocked_by[]`, `status`, `priority`, `goal_color`, `area_name`

**Optional new endpoint for date ranges:**
```
GET /api/tasks/timeline?start=YYYY-MM-DD&end=YYYY-MM-DD&include_deps=1
```
Returns enriched tasks with full `blocked_by` and `blocking` arrays — saves N+1 dep queries.

#### Frontend — SVG Rendering

**New view: `renderGantt()`** — accessible via sidebar key `G` or Tasks Hub as 5th tab.

**Layout:**

```
┌──────────────┬──────────────────────────────────────────────┐
│  Task List   │  Timeline (scrollable)                       │
│              │  Mar 24  25  26  27  28  29  30  31  Apr 1   │
├──────────────┼──────────────────────────────────────────────┤
│ ▾ Work       │                                              │
│   Design API │  ████████████▓▓▓                             │
│   Build UI   │              ╰──→ ████████████               │
│   Write tests│                            ╰──→ █████        │
│ ▾ Personal   │                                              │
│   Clean house│       ██                                     │
│   Groceries  │            ██                                │
└──────────────┴──────────────────────────────────────────────┘
```

**Components:**

| Component | Implementation |
|-----------|---------------|
| Timeline header | SVG `<text>` elements for dates, `<line>` for day separators |
| Task bars | SVG `<rect>` with rounded corners, colored by goal_color |
| Bar width | `estimated_minutes` → proportional width (default: 1 day if no estimate) |
| Dependency arrows | SVG `<path>` with arrowhead marker, curved bezier from end of blocker to start of blocked |
| Today marker | Red vertical SVG `<line>` at today's x-position |
| Milestones | Diamond `<polygon>` for goal milestones |
| Progress fill | Partial fill if subtask_done/subtask_total > 0 |

**Interactions:**
- Hover bar → tooltip with task title, dates, status, estimate
- Click bar → open detail panel (`openDP()`)
- Drag bar horizontally → reschedule due_date via `PUT /api/tasks/:id`
- Drag bar edges → adjust estimated duration
- Scroll/pan timeline → shift visible date range
- Zoom controls → day/week/month granularity
- Group by area/goal (left panel)

**Time Scale:**

| Zoom Level | Column Width | Visible Range | Label Format |
|-----------|-------------|---------------|-------------|
| Day | 40px | ~3 weeks | "Mon 24" |
| Week | 120px | ~3 months | "W13 Mar" |
| Month | 200px | ~1 year | "Mar 2026" |

#### CSS

```css
.gantt-wrap { display:flex; height:100%; overflow:hidden }
.gantt-tasks { width:220px; overflow-y:auto; border-right:1px solid var(--brd) }
.gantt-timeline { flex:1; overflow:auto; position:relative }
.gantt-bar { cursor:pointer; transition:opacity .15s }
.gantt-bar:hover { opacity:.8; filter:brightness(1.1) }
.gantt-dep-arrow { stroke:var(--txd); fill:none; stroke-width:1.5 }
.gantt-today { stroke:var(--err); stroke-width:2; stroke-dasharray:4,4 }
```

#### Tests

```
1. GET /api/tasks/timeline returns tasks with deps in date range
2. Tasks without due_date excluded from Gantt
3. Dependency arrows render between connected tasks
4. Drag task bar → PUT /api/tasks/:id updates due_date
5. Zoom levels switch correctly (day/week/month)
6. Group by area shows area headers
7. Today marker positioned at correct x-offset
8. Task bar width reflects estimated_minutes
9. Completed tasks shown with muted opacity
10. Circular dependencies don't crash renderer
```

#### MVP vs Full

| Phase | Scope |
|-------|-------|
| **MVP** | Static SVG bars + today line + click-to-open. No drag, no dep arrows. Day zoom only. |
| **V2** | Dependency arrows, drag-to-reschedule, zoom levels |
| **V3** | Drag edges for duration, milestone diamonds, progress fill |

---

## Summary

### Position Shift: From "Local Task App" → "Personal Productivity Server"

The self-hosted server direction transforms LifeFlow's competitive positioning. It's no longer competing with Any.do's SaaS model — it's competing with **Nextcloud Tasks, Vikunja, and Planka** in the self-hosted space, while offering a richer feature set than any of them.

**LifeFlow's differentiators in the self-hosted market:**
- 25+ views (no self-hosted competitor comes close)
- Focus timer with Pomodoro (unique — no self-hosted task app has this)
- Habits + streaks + heatmaps (unique combination)
- NLP quick capture (unique in self-hosted space)
- Eisenhower matrix, weekly reviews, life areas hierarchy (unique depth)
- No build step, instant deploy (competitive advantage over React/Vue-based alternatives)

**What the server direction unlocks (previously "deferred"):**
- ✅ Multi-device access (the #1 user request for any task app)
- ✅ Family/household sharing (a NAS running LifeFlow = household task hub)
- ✅ AI with BYOK (user controls privacy entirely)
- ✅ Integrations via webhooks + API tokens (no per-integration maintenance)
- ✅ Calendar sync via CalDAV (self-hosted friendly, no OAuth dance)

**Critical path for server readiness:**
1. API Tokens (auth foundation)
2. HTTPS docs (security foundation)
3. Web Push (notification foundation)
4. Offline mutation queue (reliability foundation)

Everything else builds on these four pillars.

---

## Part 7: Implementation Sequence

### Recommended Build Order

```
Sprint 1 (Quick Wins — 1-2 days)
├── 6.1 Copy subtasks on recurring spawn    [Small]  ← 10 lines, immediate user value
├── 6.2 Auto-link Pomodoro to actual_min    [Small]  ← 5 lines, connects existing features
└── 5.3 Recurring Zod schema               [Small]  ← security hardening

Sprint 2 (Table View — 3-5 days)
└── 6.3 Table View                          [Medium] ← new view, power user essential
    ├── Backend: GET /api/tasks/table endpoint
    ├── Frontend: renderTable() + sort/group UI
    └── Tests: 8-10 API + rendering tests

Sprint 3 (Custom Fields — 5-7 days)
└── 6.4 Custom Fields                      [Medium-Large] ← user-defined metadata
    ├── Migration: custom_field_defs + task_custom_values tables
    ├── Backend: 6 endpoints + Zod schemas
    ├── Frontend: Settings tab + detail panel integration
    └── Tests: 20-30 covering CRUD + validation + cascade

Sprint 4 (Gantt MVP — 5-7 days)
└── 6.5 Gantt Chart (MVP)                  [Large] ← static SVG, no drag
    ├── Frontend: renderGantt() with bars + today line
    ├── Backend: optional /api/tasks/timeline endpoint
    └── Tests: 10 covering rendering + data

Sprint 5 (Gantt V2 — 3-5 days)
└── 6.5 Gantt Chart (V2)                   ← dep arrows + drag + zoom
```

### Total Estimates

| Feature | Backend | Frontend | Tests | Total |
|---------|---------|----------|-------|-------|
| Copy subtasks | 10 lines | 0 | 5 | ~1 hour |
| Auto-link Pomodoro | 5 lines | 0 | 5 | ~1 hour |
| Recurring schema | 20 lines | 0 | 5 | ~1 hour |
| Table View | ~80 lines | ~250 lines | 10 | ~2-3 days |
| Custom Fields | ~200 lines | ~350 lines | 25 | ~4-5 days |
| Gantt MVP | ~30 lines | ~400 lines | 10 | ~4-5 days |
| Gantt V2 | 0 | ~200 lines | 5 | ~2-3 days |
| **Total** | **~345 lines** | **~1,200 lines** | **65** | **~15-18 days** |
