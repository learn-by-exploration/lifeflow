---
status: Partially implemented
baseline: v2.0.0
---

# Custom Lists — Implementation Plan

**Date:** March 23, 2026  
**Baseline:** v2.0.0 | 572 tests passing | Docker on port 3456  
**Approach:** 4-phase incremental delivery, all phases sharing one upfront DB schema

---

## Database Schema (Created in Phase 1, used by all phases)

```sql
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checklist',  -- 'checklist'|'grocery'|'notes'
  icon TEXT DEFAULT '📋',
  color TEXT DEFAULT '#2563EB',
  area_id INTEGER REFERENCES life_areas(id) ON DELETE SET NULL,
  share_token TEXT UNIQUE,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  checked INTEGER DEFAULT 0,
  category TEXT,
  quantity TEXT,
  note TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id, position);
CREATE INDEX IF NOT EXISTS idx_lists_share ON lists(share_token) WHERE share_token IS NOT NULL;
```

---

## Phase 1: Checklist Lists (v2.1)

### Backend (src/server.js)

| # | Task | Details |
|---|------|---------|
| 1.1 | Create tables | Add `lists` and `list_items` CREATE TABLE + indexes to schema init |
| 1.2 | GET `/api/lists` | Return all lists with item counts (`SELECT l.*, COUNT(li.id) as item_count, SUM(li.checked) as checked_count`) |
| 1.3 | POST `/api/lists` | Create list. Validate: `name` required (max 100), `type` in ['checklist','grocery','notes'], `icon` optional, `color` optional |
| 1.4 | PUT `/api/lists/:id` | Update name, icon, color, area_id. Validate id exists |
| 1.5 | DELETE `/api/lists/:id` | Delete list + cascade items. Return 404 if not found |
| 1.6 | GET `/api/lists/:id/items` | Return items for list, ordered by `position` |
| 1.7 | POST `/api/lists/:id/items` | Add item(s). Accept single object or array. Validate title required (max 200) |
| 1.8 | PUT `/api/lists/:id/items/:itemId` | Update item title, checked, position |
| 1.9 | DELETE `/api/lists/:id/items/:itemId` | Delete single item |
| 1.10 | PATCH `/api/lists/:id/items/reorder` | Batch update positions. Body: `[{id, position}]` |
| 1.11 | FTS5 integration | Index list items in `search_index` (type='list', context=list name) |

### Frontend (public/index.html)

| # | Task | Details |
|---|------|---------|
| 1.12 | CSS | `.list-grid`, `.list-card`, `.list-detail`, `.li-item`, `.li-check`, `.li-add-bar` styles matching existing design language |
| 1.13 | Sidebar | Add collapsible "Lists" section below Filters with badge count. Click → `go('lists')` |
| 1.14 | `renderLists()` | Grid of list cards showing: icon, name, progress bar (checked/total), type badge |
| 1.15 | `renderListDetail()` | List header (name, icon, type badge) + items with checkboxes + fixed bottom add-bar |
| 1.16 | New List modal | Modal: name input, type selector (checklist/grocery/notes), icon picker, color picker, optional area link |
| 1.17 | Item interactions | Click checkbox to toggle checked; click title to edit inline; swipe/button to delete; drag to reorder |
| 1.18 | `render()` dispatcher | Add `lists` and `listdetail` to the render switch |
| 1.19 | `updateBC()` | Add breadcrumb for lists view and list detail view |
| 1.20 | Search integration | List items appear in search results with 📋 icon |

### Tests — Phase 1

**Backend (tests/rvf-lists.test.ts — new file)**

| # | Test | Endpoint |
|---|------|----------|
| T1.1 | POST /api/lists — create checklist with valid name | POST |
| T1.2 | POST /api/lists — reject empty name (400) | POST |
| T1.3 | POST /api/lists — reject invalid type (400) | POST |
| T1.4 | POST /api/lists — reject name > 100 chars (400) | POST |
| T1.5 | GET /api/lists — returns all lists with counts | GET |
| T1.6 | GET /api/lists — empty array when none exist | GET |
| T1.7 | PUT /api/lists/:id — update name | PUT |
| T1.8 | PUT /api/lists/:id — 404 for non-existent | PUT |
| T1.9 | DELETE /api/lists/:id — deletes list | DELETE |
| T1.10 | DELETE /api/lists/:id — cascades to items | DELETE |
| T1.11 | DELETE /api/lists/:id — 404 for non-existent | DELETE |
| T1.12 | POST /api/lists/:id/items — add single item | POST |
| T1.13 | POST /api/lists/:id/items — add array of items | POST |
| T1.14 | POST /api/lists/:id/items — reject empty title (400) | POST |
| T1.15 | POST /api/lists/:id/items — reject title > 200 chars (400) | POST |
| T1.16 | GET /api/lists/:id/items — returns items ordered by position | GET |
| T1.17 | GET /api/lists/:id/items — empty array for empty list | GET |
| T1.18 | PUT /api/lists/:id/items/:itemId — toggle checked | PUT |
| T1.19 | PUT /api/lists/:id/items/:itemId — update title | PUT |
| T1.20 | DELETE /api/lists/:id/items/:itemId — deletes item | DELETE |
| T1.21 | PATCH /api/lists/:id/items/reorder — batch reorder | PATCH |
| T1.22 | Lists appear in FTS5 search | GET /api/search |
| T1.23 | List with area_id links correctly | POST + GET |
| T1.24 | area_id SET NULL on area delete | DELETE area |

**Frontend (tests/frontend-validation.test.js — extend)**

| # | Test | Category |
|---|------|----------|
| T1.25 | 'lists' in render() dispatcher | Lists Page |
| T1.26 | 'listdetail' in render() dispatcher | Lists Page |
| T1.27 | renderLists function defined | Lists Page |
| T1.28 | renderListDetail function defined | Lists Page |
| T1.29 | Lists section in sidebar HTML | Lists Page |
| T1.30 | New list modal elements exist | Lists Page |
| T1.31 | List CSS classes defined (.list-grid, .list-card, etc.) | Lists CSS |
| T1.32 | Lists in updateBC() | Lists Page |

**Total Phase 1 tests: 32 new (→ 604 total)**

---

## Phase 2: Grocery Type (v2.2)

### Backend

| # | Task | Details |
|---|------|---------|
| 2.1 | Category constants | Define: Produce, Bakery, Dairy, Meat & Seafood, Frozen, Pantry, Beverages, Snacks, Household, Personal Care, Other |
| 2.2 | GET `/api/lists/categories` | Return category list for grocery type |
| 2.3 | Grocery item validation | Allow `category` and `quantity` fields on items where list type='grocery' |
| 2.4 | POST `/api/lists/:id/clear-checked` | Bulk delete all checked items in a list |
| 2.5 | GET `/api/lists/:id/items` enhancement | When type='grocery', group by category in response |

### Frontend

| # | Task | Details |
|---|------|---------|
| 2.6 | Grocery detail view | Items grouped under category headers (sticky on scroll) |
| 2.7 | Category selector | Dropdown on item add/edit for grocery type |
| 2.8 | Quantity input | Optional inline quantity field (e.g. "2 lbs", "500g") |
| 2.9 | Checked items sink | Checked items move to bottom with strikethrough + fade |
| 2.10 | "Clear Checked" button | Top bar action to bulk-remove checked items with confirmation |
| 2.11 | Grocery-specific CSS | Green accent for grocery type; `.li-cat-header` sticky; `.li-qty` styling |
| 2.12 | Mobile grocery UX | 56px touch targets; check button on left; fixed bottom add-bar with category quick-select |

### Tests — Phase 2

| # | Test | Type |
|---|------|------|
| T2.1 | GET /api/lists/categories — returns category array | Backend |
| T2.2 | POST grocery item with category and quantity | Backend |
| T2.3 | GET grocery items grouped by category | Backend |
| T2.4 | POST /api/lists/:id/clear-checked — removes checked items | Backend |
| T2.5 | POST /api/lists/:id/clear-checked — keeps unchecked items | Backend |
| T2.6 | POST /api/lists/:id/clear-checked — 404 non-existent list | Backend |
| T2.7 | Quantity field accepts various formats (number, "2 lbs", etc.) | Backend |
| T2.8 | Category header CSS classes defined | Frontend |
| T2.9 | Grocery-specific CSS (.li-cat-header, .li-qty) | Frontend |
| T2.10 | Clear checked button exists in grocery view | Frontend |

**Total Phase 2 tests: 10 new (→ 614 total)**

---

## Phase 3: Share via Link (v2.3)

### Backend

| # | Task | Details |
|---|------|---------|
| 3.1 | POST `/api/lists/:id/share` | Generate `crypto.randomBytes(12).toString('hex')` token, store in `share_token`. Return `{token, url}` |
| 3.2 | DELETE `/api/lists/:id/share` | Set `share_token = NULL`. Instant revocation |
| 3.3 | GET `/api/shared/:token` | Public. Validate token format (24 hex chars). Return list + items. No `list.id` exposed |
| 3.4 | PUT `/api/shared/:token/items/:itemId` | Public. Toggle checked only. Rate limited |
| 3.5 | POST `/api/shared/:token/items` | Public. Add item (title required, max 200 chars). Rate limited |
| 3.6 | Rate limiter | In-memory rate limit: 60 req/min per token on shared endpoints |
| 3.7 | Input validation | Token: `/^[a-f0-9]{24}$/`; item title: max 200 chars, escaped; max 500 items/list |

### Frontend — Main App

| # | Task | Details |
|---|------|---------|
| 3.8 | Share toggle | On/off pill in list detail header. Shows share URL + copy button when on |
| 3.9 | Share URL display | Copyable URL with click-to-copy + toast confirmation |
| 3.10 | Share badge | Small 🔗 icon on shared list cards in the grid view |
| 3.11 | Revoke flow | Toggle off → confirmation modal → instant revoke |

### Frontend — Share Page (public/share.html — new file)

| # | Task | Details |
|---|------|---------|
| 3.12 | Create share.html | Lightweight standalone page (~200 lines). Fetches from `/api/shared/:token` |
| 3.13 | Share page UI | List header (name, icon) + items with check-off + add item input at bottom |
| 3.14 | Share page mobile | Mobile-first responsive design. Touch-friendly |
| 3.15 | Share page branding | Subtle "Powered by LifeFlow" footer with "Create your own" CTA link |
| 3.16 | Share page errors | "List not found" for invalid/revoked tokens; "Too many requests" for rate limit |
| 3.17 | Open Graph meta | `<meta property="og:title">`, `og:description` for pretty link previews in messages |
| 3.18 | Server route | Serve `share.html` on `GET /share/:token` (HTML page, not API) |

### Tests — Phase 3

| # | Test | Type |
|---|------|------|
| T3.1 | POST /api/lists/:id/share — generates 24-hex token | Backend |
| T3.2 | POST /api/lists/:id/share — returns share URL | Backend |
| T3.3 | POST /api/lists/:id/share — idempotent (same token on repeat) | Backend |
| T3.4 | DELETE /api/lists/:id/share — revokes token (NULL) | Backend |
| T3.5 | GET /api/shared/:token — returns list + items | Backend |
| T3.6 | GET /api/shared/:token — 404 for invalid token | Backend |
| T3.7 | GET /api/shared/:token — 404 after revocation | Backend |
| T3.8 | GET /api/shared/:token — rejects non-hex tokens (400) | Backend |
| T3.9 | GET /api/shared/:token — does NOT expose list.id | Backend |
| T3.10 | PUT /api/shared/:token/items/:itemId — toggle checked | Backend |
| T3.11 | POST /api/shared/:token/items — add item | Backend |
| T3.12 | POST /api/shared/:token/items — reject empty title (400) | Backend |
| T3.13 | POST /api/shared/:token/items — reject >200 char title (400) | Backend |
| T3.14 | Share token is cryptographically random (not sequential) | Backend |
| T3.15 | Max 500 items per list enforced on shared add | Backend |
| T3.16 | GET /share/:token — serves HTML page | Backend |
| T3.17 | Share page exists as public/share.html | Frontend |
| T3.18 | Share toggle UI elements in list detail | Frontend |
| T3.19 | Share badge on shared list cards | Frontend |

**Total Phase 3 tests: 19 new (→ 633 total)**

---

## Phase 4: Notes List Type + Templates (v2.4)

### Backend

| # | Task | Details |
|---|------|---------|
| 4.1 | Notes type behavior | Items with `note` field used as rich content (Markdown); `title` as heading |
| 4.2 | GET `/api/lists/templates` | Return preset templates: Weekly Groceries, Travel Packing, Moving Checklist, Party Planning |
| 4.3 | POST `/api/lists/from-template` | Create list from template with pre-populated items |
| 4.4 | GET `/api/lists` enhancement | Include notes preview (first 100 chars of note field) |

### Frontend

| # | Task | Details |
|---|------|---------|
| 4.5 | Notes list view | Card-based layout for notes items; title + content preview |
| 4.6 | Notes editor | Inline markdown editor for note content; preview toggle |
| 4.7 | Template picker | "Create from template" option in new list modal with template cards |
| 4.8 | Dashboard integration | List completion stats in dashboard (e.g. "3 lists, 42/67 items done") |

### Tests — Phase 4

| # | Test | Type |
|---|------|------|
| T4.1 | Create notes-type list | Backend |
| T4.2 | Notes items store note content | Backend |
| T4.3 | GET /api/lists/templates — returns template array | Backend |
| T4.4 | POST /api/lists/from-template — creates list with items | Backend |
| T4.5 | POST /api/lists/from-template — 404 for bad template | Backend |
| T4.6 | Notes content included in FTS5 search | Backend |
| T4.7 | Notes list CSS classes defined | Frontend |
| T4.8 | Template picker modal elements exist | Frontend |

**Total Phase 4 tests: 8 new (→ 641 total)**

---

## Test Summary

| Phase | New Backend Tests | New Frontend Tests | Running Total |
|-------|-------------------|--------------------|---------------|
| Baseline | 540 | 32 | 572 |
| Phase 1 | 24 | 8 | 604 |
| Phase 2 | 7 | 3 | 614 |
| Phase 3 | 16 | 3 | 633 |
| Phase 4 | 6 | 2 | 641 |

### Regression Gate (Every Phase)
- All 572 existing tests must pass before merge
- New tests added to `tests/rvf-lists.test.ts` (backend) and extended in `tests/frontend-validation.test.js`
- Docker rebuild + health check after each phase

---

## Security Checklist (Applied Across All Phases)

- [ ] Share tokens: `crypto.randomBytes(12).toString('hex')` — 24 hex chars
- [ ] Rate limit: 60 req/min per token on `/api/shared/*`
- [ ] Input validation: name ≤ 100, title ≤ 200, quantity ≤ 50 chars
- [ ] Limits: max 500 items/list, max 100 lists total
- [ ] XSS: All user content text-escaped (never `innerHTML` with raw user data)
- [ ] Token revocation: instant (NULL → 404)
- [ ] Token format validation: reject non-hex before DB query
- [ ] No `list.id` exposed in shared API responses
- [ ] SQL injection: parameterized queries only (existing pattern)

---

## Implementation Order

```
Phase 1 (Checklist)
├── 1. DB schema (tables + indexes)
├── 2. Backend CRUD endpoints (11 endpoints)
├── 3. FTS5 integration
├── 4. CSS styles
├── 5. Sidebar section
├── 6. renderLists() + renderListDetail()
├── 7. New list modal
├── 8. Item interactions
├── 9. Tests (32 new)
├── 10. Docker rebuild + verify
└── 11. Commit

Phase 2 (Grocery)
├── 1. Category constants + endpoint
├── 2. Grocery grouping in API
├── 3. Clear-checked endpoint
├── 4. Grocery detail view (categories, quantity)
├── 5. Mobile grocery UX
├── 6. Tests (10 new)
└── 7. Commit

Phase 3 (Sharing)
├── 1. Token generation + revocation endpoints
├── 2. Shared read/write endpoints
├── 3. Rate limiter
├── 4. Share toggle UI in main app
├── 5. share.html standalone page
├── 6. Server route for /share/:token
├── 7. Tests (19 new)
└── 8. Commit

Phase 4 (Notes + Templates)
├── 1. Template data + endpoints
├── 2. Notes list view + editor
├── 3. Template picker modal
├── 4. Dashboard integration
├── 5. Tests (8 new)
└── 6. Commit + tag v2.1.0
```
