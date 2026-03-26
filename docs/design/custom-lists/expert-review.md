---
status: Reference
baseline: v2.0.0
---

# Custom Lists Feature — 25-Expert Review Panel

**Date:** March 23, 2026  
**Feature:** Custom Lists (Grocery, Notes, Checklist) + Share via Link  
**App Version:** 2.0.0 (572 tests passing)  
**Panel:** 5 UI Experts, 5 Life Coaches, 3 Product Managers, 3 Sales/Marketing, 3 Architects, 3 QA, 3 Testers

---

## Feature Proposal Summary

Add a new **Lists** system to LifeFlow with:
- **List types:** Checklist (default), Grocery, Notes
- **Item management:** Add, edit, check-off, reorder, delete
- **Grocery-specific:** Category grouping, quantity/unit fields, "clear checked" bulk action
- **Share via link:** Generate a unique token URL — anyone with the link can view + edit
- **Lightweight shared page:** Separate `/public/share.html` for non-app users

---

## UI Experts (5)

### UI-1: Information Architecture Specialist — 7/10
- Sidebar already dense (Inbox, Today, All Tasks, Calendar, Life Areas, Plan, Filters, Settings, Reports, Help)
- Adding "Lists" as a 6th conceptual group risks cognitive overload
- **Recommendation:** Add as a collapsible "Lists" section inside sidebar, not a top-level item flood. Single "Lists" entry with badge count; drill into types inside the view

### UI-2: Interaction Design Expert — 8/10
- Grocery items are fundamentally different from tasks (no priority, no due date)
- Check-off should have satisfying strikethrough animation
- Checked items should sink to bottom automatically
- **Recommendation:** "Clear checked" bulk action button; sticky category headers when scrolling; simple data model (name, quantity, unit, category, checked)

### UI-3: Mobile-First Design Expert — 6/10
- Grocery lists are primarily used on phones while shopping
- **Recommendation:** 56px min-height touch targets; one-handed check-off on left (thumb zone); fixed bottom quick-add bar; QR code alongside share URL for phone-to-phone sharing

### UI-4: Visual Design Expert — 8/10
- Lists should feel native to the existing design language (dark themes, material icons, 12px radius, Inter font)
- **Recommendation:** Visual identity per type — Grocery: green accent (`--ok`), Notes: brand color card layout, Checklist: minimal checkboxes. "New List" modal mirrors habit creation flow (type → name → icon → color). Share toggle as simple on/off pill

### UI-5: Accessibility Expert — 7/10
- **Recommendation:** `role="checkbox"` + `aria-checked` on grocery items; `aria-label` on share copy button; `role="group"` for category groupings; keyboard nav (Tab through items, Space to toggle, Enter to edit); don't rely solely on color for list type distinction

---

## Life Coaches (5)

### LC-1: Habit & Productivity Coach — 9/10
- This is a missing piece — daily life logistics have nowhere to go currently
- **Recommendation:** Preset templates (Weekly Groceries, Travel Packing, Moving Checklist); grocery categories in store-layout order: Produce → Bakery → Dairy → Meat → Frozen → Pantry → Household → Personal Care

### LC-2: Wellness & Work-Life Balance Coach — 8/10
- Notes list type encourages journaling, gratitude lists, meal planning alongside grocery
- **Recommendation:** Link notes lists to weekly reviews; quick note capture (Ctrl+Shift+N?); pin feature for important notes

### LC-3: Goal Achievement Specialist — 7/10
- Don't dilute the core GTD value proposition (Area → Goal → Task)
- **Recommendation:** Every list should optionally attach to a Life Area or Goal; dashboard should show list completion stats; don't let lists become dumping grounds

### LC-4: Family & Household Coach — 10/10
- Sharing is the single most valuable addition — transforms LifeFlow from solo to household tool
- **Recommendation:** Show who added each item; real-time sync critical for grocery; share link should work WITHOUT installing anything

### LC-5: Mindfulness & Organization Coach — 8/10
- Fixes anti-pattern: users creating "Random" goals to dump miscellaneous tasks
- **Recommendation:** Checklists should be the default type; position lists near Inbox conceptually; "List of the Day" option for My Day view

---

## Product Managers (3)

### PM-1: Growth & Retention PM — 9/10
- Retention play: users who integrate grocery + tasks + habits become sticky
- Sharing is the growth lever — every link = potential new user
- **Recommendation:** Subtle "Powered by LifeFlow" branding on shared view with CTA; MVP: Checklist + Grocery first, Notes list type in v2.1; keep sharing simple (no accounts, no permissions matrix)

### PM-2: Feature Prioritization PM — 7/10
- **Phased rollout:**

| Phase | Scope | Value | Effort |
|-------|-------|-------|--------|
| v2.1 | Checklist lists (create, items, check-off) | High | Low |
| v2.2 | Grocery type (categories, quantity, units) | High | Medium |
| v2.3 | Share via link (read+write) | Very High | Medium |
| v2.4 | Notes list type + templates | Medium | Low |

- **Recommendation:** Ship incrementally; design DB schema for all phases upfront

### PM-3: User Experience PM — 8/10
- Lists provide a zero-friction entry point for new users
- **Recommendation:** Add "Create a List" to onboarding wizard; default presets ("My Grocery List", "To-Do Checklist"); inviting empty state; consider adding lists to quick capture

---

## Sales / Marketing (3)

### S-1: Competitive Positioning Analyst — 9/10
- Closes competitive gap vs Todoist, Microsoft To Do, Google Keep, Apple Reminders
- **Recommendation:** Marketing angle: "One app for your goals AND your groceries"; differentiator: LifeFlow connects lists to life goals

### S-2: User Acquisition Specialist — 10/10
- Sharing = viral loop (every link puts LifeFlow in front of a non-user)
- **Recommendation:** Clean share URL (`/share/abc123`); beautiful shared mobile view; "Get LifeFlow Free" button on shared view; Open Graph meta tags for pretty link previews

### S-3: Enterprise / Team Sales Rep — 6/10
- For current individual/household market, link sharing is perfect
- **Recommendation:** Keep sharing simple; design `share_token` system to evolve later (expiry, read-only mode); foundation for "LifeFlow for Families"

---

## Architects (3)

### A-1: Database & Schema Architect — 8/10
**Proposed Schema:**
```sql
CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checklist',  -- 'checklist'|'grocery'|'notes'
  icon TEXT DEFAULT '📋',
  color TEXT DEFAULT '#2563EB',
  area_id INTEGER,                          -- optional link to life_area
  share_token TEXT UNIQUE,                  -- NULL = private, set = shared
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE list_items (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  checked INTEGER DEFAULT 0,
  category TEXT,                             -- for grocery: 'Produce','Dairy', etc.
  quantity TEXT,                              -- '2', '500g', '1 dozen'
  note TEXT DEFAULT '',                      -- for notes type: rich content
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_list_items_list ON list_items(list_id, position);
CREATE INDEX idx_lists_share ON lists(share_token) WHERE share_token IS NOT NULL;
```
- **Recommendation:** Crypto-random 24-hex-char `share_token`; cascade delete; add list items to FTS5 search index

### A-2: API & Backend Architect — 8/10
**Proposed Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/lists` | All user's lists |
| POST | `/api/lists` | Create list |
| PUT | `/api/lists/:id` | Update list metadata |
| DELETE | `/api/lists/:id` | Delete list + items |
| GET | `/api/lists/:id/items` | Get items for a list |
| POST | `/api/lists/:id/items` | Add item(s) — accepts array |
| PUT | `/api/lists/:id/items/:itemId` | Update item |
| DELETE | `/api/lists/:id/items/:itemId` | Delete item |
| PATCH | `/api/lists/:id/items/reorder` | Batch reorder positions |
| POST | `/api/lists/:id/share` | Generate/toggle share token |
| DELETE | `/api/lists/:id/share` | Revoke sharing |
| GET | `/api/shared/:token` | Public: get shared list + items |
| PUT | `/api/shared/:token/items/:itemId` | Public: check/uncheck item |
| POST | `/api/shared/:token/items` | Public: add item |

- **Recommendation:** Rate limit shared endpoints; validate token format before DB lookup; don't expose `list.id` in shared context

### A-3: Frontend Architecture Expert — 7/10
- Single `index.html` approaching size limit (~4500 lines); lists add ~200-300 lines
- **Recommendation:** Follow existing pattern with `renderLists()`, `renderListDetail()`; share view as separate lightweight `/public/share.html`; add `currentListId` to state management

---

## QA Engineers (3)

### QA-1: Functional QA Lead — 8/10
**Required Test Scenarios:**
- List CRUD: Create each type, rename, delete (with cascade), reorder
- Item CRUD: Add, edit, check/uncheck, delete, reorder
- Grocery: Category assignment, quantity, clear-checked bulk action
- Sharing: Generate token, access via token, edit via token, revoke
- Edge cases: Empty list, 1000+ items, special chars, long names
- Cross-feature: Lists in search, lists in dashboard, list linked to area
- **Estimate:** 40-50 new backend tests, 10-15 frontend validation tests

### QA-2: Security QA Specialist — 7/10 (CRITICAL)
- Share tokens MUST use `crypto.randomBytes(12).toString('hex')` (24 hex chars)
- Rate limit shared endpoints (60 req/min per token)
- XSS prevention — all user content must be text-escaped on shared view
- Input validation: title max 200 chars, quantity max 50 chars, max 500 items/list, max 100 lists/user
- Token revocation must be instant (`share_token = NULL` → immediate block)

### QA-3: Performance QA — 8/10
- 100+ grocery items with categories must load <100ms
- Shared view cold-start <500ms
- Reorder drag-drop should debounce position updates
- **Recommendation:** Batch position updates via single endpoint; index on `(list_id, position)`

---

## Testers (3)

### T-1: Integration Tester — 8/10
**Key Integration Points:**
1. Search: List items appear in FTS5 results with type badges
2. Dashboard: List completion stats (X/Y items checked)
3. Life Areas: Lists linked to areas show in area detail
4. Sidebar: List count badge updates after check-off
5. Quick Capture: "Add to list" doesn't break task capture
6. Keyboard: New shortcuts don't conflict (Ctrl+L for Lists?)

### T-2: Regression Tester — 9/10
**Checklist:** All 572 existing tests pass; task creation, habit logging, inbox triage, search, settings, theme switching, mobile sidebar, weekly review, automation rules, board drag-drop, calendar — all unaffected

### T-3: User Acceptance Tester — 8/10
**UAT Happy Paths:**
1. Create grocery list → add 15 items with categories → check off 5
2. Share grocery list → partner opens on their phone → both edit
3. Create checklist linked to Home area → complete items
4. Search for "milk" → find it in grocery list
5. Create notes list for meal planning
6. Clear checked items after shopping
7. Stop sharing → link no longer works

---

## Consensus Summary

| Expert Group | Avg Rating | Key Message |
|-------------|-----------|-------------|
| UI Experts | 7.2/10 | Don't overcrowd sidebar; grocery needs mobile-first design; keep visually native |
| Life Coaches | 8.4/10 | Fills a real gap; sharing is transformative; connect lists to goals |
| Product Managers | 8.0/10 | Phase it; sharing is the growth lever; lists lower the entry barrier |
| Sales/Marketing | 8.3/10 | Closes competitive gap; sharing = viral loop; shared view = first impression |
| Architects | 7.7/10 | Schema is clean; separate share.html; rate limit public endpoints |
| QA | 7.7/10 | 40+ new tests needed; share token security critical; performance at scale |
| Testers | 8.3/10 | Integration with search/dashboard key; 572 tests must not regress |

### **Overall: 7.9/10 — Strong GO with phased approach**

### Cross-Panel Top Recommendations
1. **Phase it:** Checklist → Grocery → Sharing → Notes list (4 incremental releases)
2. **Sidebar:** Collapsible "Lists" section, not top-level item flood
3. **Mobile-first grocery:** Large touch targets, fixed bottom add-bar, checked items sink
4. **Share token security:** Crypto-random, rate-limited, validated, revocable
5. **Separate share page:** Lightweight `/public/share.html`, not the full SPA
6. **Connect to ecosystem:** Link lists to Life Areas, include in search + dashboard
7. **40+ new tests minimum**, all 572 existing must pass
