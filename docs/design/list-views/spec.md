# List Views — Design Spec

> **Status:** Draft · **Created:** 3 April 2026 · **Author:** brainstorm agent

## Problem Statement

Lists in LifeFlow currently render as a single flat checklist regardless of list type. A grocery list with 40 items, a reading list tracking progress over months, and a quick packing checklist all look and behave identically — checkbox, title, delete button.

This creates friction:
- **Grocery lists** need category grouping (already partially done) but lack aisle-order sorting, smart quantity handling, and a "shop mode" optimized for one-handed mobile use.
- **Tracking lists** (books, movies, restaurants) have no way to record ratings, notes, or completion dates — checking an item just strikes it through.
- **Project checklists** can't show progress sections, due dates, or assignment — they're just flat checkboxes.
- **Wishlist / idea lists** have no priority, cost, or link fields — everything is a title string.

Users default to tasks + subtasks to get richer structure, even when a lightweight list would be more appropriate.

## Use Cases

### UC1: Weekly Grocery Run
**Persona:** Shyam, shopping at the store on Saturday morning.
**Current pain:** Items are grouped by category but the full list is unwieldy on a phone. Checked items stay visible and clutter the view. No way to quickly add "Milk x2" without typing category each time.
**Wants:** A "shop mode" that shows one category at a time, auto-hides checked items, supports swipe-to-check, and remembers frequently bought items for autocomplete.

### UC2: Books to Read
**Persona:** Someone tracking 30+ books across genres.
**Current pain:** All books are in one flat list. No way to mark "currently reading" vs "want to read" vs "finished." No notes or ratings after finishing. Can't sort by when added.
**Wants:** A kanban-style board (To Read → Reading → Finished) or at minimum sections/statuses. Optional star rating and one-line review when marking done.

### UC3: Travel Packing
**Persona:** Packing for a trip, list reused each time.
**Current pain:** After a trip, you uncheck all and reuse, but some items should be pre-checked (passport — always packed first). No way to group by bag/category. Progress bar exists but not prominent.
**Wants:** Clear section headers (Carry-on / Checked bag / Toiletries), prominent progress indicator, and a "reset for next trip" that keeps essential items checked.

### UC4: Project Launch Checklist
**Persona:** Shipping a side project, tracking pre-launch steps.
**Current pain:** No due dates on items, no way to add notes/details per item, no priority. Quickly outgrows a list and needs to become tasks — but that's heavyweight.
**Wants:** Optional due date per item, expandable notes, maybe assignee if collaborating. Essentially subtasks-lite without the full task overhead.

### UC5: Wishlist / Gift Ideas
**Persona:** Tracking things to buy or gift ideas with prices and links.
**Current pain:** Only has title field. Price, URL, and priority are crammed into the title string ("AirPods Max - $549 - amazon.com/dp/...").
**Wants:** Structured fields: price, URL (clickable), priority/tier, and maybe an image thumbnail.

## Proposed Views / Modes

### View 1: Flat Checklist (current — keep as default)

The existing view. Simple, fast, no learning curve.

```
☐ Buy milk
☐ Call dentist
☑ Book flights ~~strikethrough~~
───────────────────
[+ Add item...]
```

**Pros:** Zero friction, works for short lists, already built.
**Cons:** Falls apart past ~15 items, no organization.
**Change:** None needed — this stays as the default for `checklist` type.

### View 2: Sectioned List

Items grouped under collapsible section headers. Sections are user-defined (or auto-generated for grocery by category). Drag items between sections.

```
▼ Carry-on (3/5)
  ☐ Passport
  ☐ Headphones
  ☐ Charger
  ☑ Wallet
  ☑ Phone

▼ Checked Bag (1/4)
  ☐ Clothes
  ☐ Shoes
  ...

► Toiletries (0/6)  [collapsed]

───────────────────
[+ Add item...]  [Section: ▾ Carry-on]
```

**Pros:** Natural for grocery (already has categories), packing, and any list >15 items. Collapsible saves screen space. Progress per section.
**Cons:** Extra step to create/manage sections. Need drag-between-sections UX.

**Implementation notes:**
- Reuse existing `category` field on `list_items` as the section identifier.
- For grocery lists, auto-populate with existing `GROCERY_CATEGORIES`.
- For other types, let users create sections inline (type `/section My Section` or a dedicated button).
- Persist collapsed state in `settings` table (key: `list-{id}-collapsed`, value: JSON array of section names).

### View 3: Shop Mode (grocery-specific)

A mobile-optimized, full-screen, one-category-at-a-time experience for in-store shopping.

```
┌─────────────────────────┐
│  🥬  PRODUCE   2/5      │
│                          │
│  ☐  Bananas              │
│  ☐  Tomatoes             │
│  ☐  Spinach              │
│  ☑  Apples               │  ← swipe right to check
│  ☑  Onions               │  ← fades to bottom
│                          │
│   [← Dairy]  [Bakery →] │  ← swipe between categories
│                          │
│  ━━━━━━━━━━━━━━━ 12/28  │  ← overall progress bar
└─────────────────────────┘
```

**Pros:** Purpose-built for the #1 list use case. Large touch targets, swipe gestures, auto-hide checked. Dramatically better than scrolling a 40-item list while pushing a cart.
**Cons:** Narrow use case (grocery only). Extra UI to build and maintain. Needs swipe gesture handling (app already has `touchDnD`, can extend).

**Implementation notes:**
- Toggled via a "Shop" button in the list detail header (only shown for grocery lists).
- Uses full viewport, hides sidebar/header — similar to focus timer's fullscreen mode.
- Swipe right on item → check. Swipe left → set quantity. Tap category pills at top to jump. 
- Checked items slide down with a short animation, grouped at bottom.
- Exit shop mode → return to normal sectioned view.
- No new API routes needed — purely frontend.

### View 4: Board / Columns (tracking lists)

Kanban-style columns for lists where items have a lifecycle (to-read → reading → done).

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Want (8) │ │ Active(2)│ │  Done(12)│
│           │ │          │ │          │
│ ┌───────┐ │ │ ┌──────┐ │ │ ┌──────┐ │
│ │Dune   │ │ │ │Sapiens│ │ │ │Atomic│ │
│ │       │ │ │ │p.142  │ │ │ │★★★★☆│ │
│ └───────┘ │ │ └──────┘ │ │ └──────┘ │
│ ┌───────┐ │ │          │ │ ┌──────┐ │
│ │Klara  │ │ │          │ │ │Dune  │ │
│ └───────┘ │ │          │ │ │★★★★★│ │
│    ...    │ │          │ │ └──────┘ │
└──────────┘ └──────────┘ └──────────┘
```

**Pros:** Perfect for books, movies, restaurants, courses. Gives items a visual lifecycle. Drag between columns. Can show metadata (rating, note snippet) on cards.
**Cons:** Overkill for simple checklists. Needs a `status` field on items. Overlaps with task board view conceptually, may confuse users.

**Implementation notes:**
- New list type: `tracker` (or reuse `custom` type with a view-mode setting).
- Add optional `status` column to `list_items` (default: null → flat list; values: 'want', 'active', 'done' — configurable per list).
- Board rendering reuses patterns from task board view (`renderBoard()`).
- Stage names stored as JSON in a new `list_settings` key or on the list itself.
- Rating: reuse `quantity` field cleverly (or add a `rating` integer column 0-5).

### View 5: Enhanced Items (rich fields)

Not a separate view, but an enhancement to the detail panel — items can optionally have structured metadata shown inline.

```
☐  AirPods Max
   💰 $549  ·  🔗 amazon.com/dp/...  ·  Priority: High
   "Birthday gift idea for self"

☐  Standing Desk
   💰 $399  ·  🔗 upliftdesk.com
   ───
☑  Keyboard
   💰 $75  ·  Bought 2026-02-15  ·  ★★★★★
```

**Pros:** Solves the wishlist/gift use case directly. No new view — just richer items. Fields are optional, so simple lists stay simple.
**Cons:** DB schema changes (or overload existing columns). UI complexity in add/edit. Need to decide which fields each list type gets.

**Implementation notes:**
- Option A (minimal): Overload existing columns — `quantity` for price, `note` for URL + notes, `category` for priority. Ugly but zero-migration.
- Option B (clean): Add `metadata` JSON column to `list_items`. Store `{price, url, priority, rating, completed_at}`. Flexible, single migration, no column sprawl.
- Option B is recommended. Render metadata fields conditionally based on list type or a per-list "show fields" setting.

### View 6: Print / Export View

A clean, printable rendering of a list — for sticking on the fridge or sending to someone who doesn't use the app.

```
╔═══════════════════════════╗
║  🛒  Weekly Groceries     ║
║  Updated: 3 Apr 2026      ║
╠═══════════════════════════╣
║                           ║
║  PRODUCE                  ║
║  □ Bananas (x3)           ║
║  □ Tomatoes (x4)          ║
║  □ Spinach                ║
║                           ║
║  DAIRY                    ║
║  □ Milk (x2)              ║
║  □ Yogurt                 ║
║  □ Cheese                 ║
║                           ║
╚═══════════════════════════╝
```

**Pros:** Useful for grocery lists, packing lists, checklists shared with non-users. Already have a print stylesheet — just needs list-specific formatting.
**Cons:** Low priority — sharing via link already exists.

**Implementation notes:**
- CSS-only: Add `@media print` rules for `.list-detail` that hide action buttons, expand all sections, use checkbox characters.
- Add a "Print" button to list detail actions bar.
- Minimal effort, nice polish.

## Recommendation: MVP Scope

**Phase 1 — Quick wins (low effort, high value):**
1. **Sectioned List** — Formalize the category grouping that grocery lists already have. Let all list types define sections. Collapsible headers with per-section progress.
2. **Print View** — CSS-only, add a print button.
3. **Hide checked toggle** — One button to show/hide completed items (currently they always show).

**Phase 2 — Shop Mode:**
4. **Shop Mode** for grocery lists — full-screen, swipe-to-check, category navigation. This involves substantial frontend work but no backend changes.

**Phase 3 — Rich items + Board:**
5. **Enhanced Items** with `metadata` JSON column — price, URL, rating, notes. Show per-list-type.
6. **Board View** for tracker-type lists — requires `status` field, new list type, board rendering.

### What NOT to build:
- ❌ Collaborative real-time editing (WebSocket complexity, out of scope for personal planner)
- ❌ Recurring list items (use the "uncheck all + reset" pattern instead)
- ❌ AI-powered smart lists (over-engineered for the use cases)
- ❌ Calendar view for lists (lists aren't date-driven — tasks are)

## Schema Changes (planned)

```sql
-- Phase 1: No changes needed (reuse `category` as section)

-- Phase 3: Rich metadata
ALTER TABLE list_items ADD COLUMN metadata TEXT DEFAULT NULL;
-- JSON: {"price": 549, "url": "https://...", "rating": 4, "completed_at": "2026-03-15"}

-- Phase 3: Board view
ALTER TABLE list_items ADD COLUMN status TEXT DEFAULT NULL;
-- Values: null (flat list) | 'want' | 'active' | 'done' (configurable per list)

-- Optional: Per-list view preference
ALTER TABLE lists ADD COLUMN view_mode TEXT DEFAULT 'flat';
-- Values: 'flat' | 'sectioned' | 'board'

-- Optional: Per-list column/stage config
ALTER TABLE lists ADD COLUMN board_columns TEXT DEFAULT NULL;
-- JSON: ["Want", "In Progress", "Done"]
```

## Wireframe: Sectioned List (Phase 1)

```
┌─────────────────────────────────────────┐
│  📋 ← Lists ›                           │
│                                          │
│  🧳 Travel Packing          [⋮] [🖨]   │
│  Checklist · 14 items · 3 checked        │
│  ━━━━━━━━━━━━━━━━━━━━━━ 21%            │
│                                          │
│  [Hide checked ☐]                        │
│                                          │
│  ▼ Carry-on                    3/5       │
│  ┌──────────────────────────────────┐    │
│  │ ☑ ~~Passport~~           [×]    │    │
│  │ ☑ ~~Phone charger~~      [×]    │    │
│  │ ☐ Headphones             [×]    │    │
│  │ ☐ Laptop                 [×]    │    │
│  │ ☐ Charger                [×]    │    │
│  │ ☑ ~~Wallet~~             [×]    │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ▼ Checked Bag                 0/4       │
│  ┌──────────────────────────────────┐    │
│  │ ☐ Clothes                [×]    │    │
│  │ ☐ Shoes                  [×]    │    │
│  │ ☐ Jacket                 [×]    │    │
│  │ ☐ Toiletry bag           [×]    │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ► Toiletries                  0/5  ···  │
│                                          │
│  [+ Add item...]  Section: [▾ Carry-on]  │
│                                          │
│  [+ Add section]                         │
└─────────────────────────────────────────┘
```

## Wireframe: Shop Mode (Phase 2)

```
┌─────────────────────────────────────────┐
│                              [✕ Exit]   │
│                                          │
│  🥬 🍞 🧀 🥩 ❄️ 🥫 🥤 🍿 🏠 🧴       │
│  ▲ active                                │
│                                          │
│                                          │
│       P R O D U C E                      │
│       3 remaining · 2 done               │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │                                  │    │
│  │    Bananas                  x3   │ ←swipe→│
│  │                                  │    │
│  ├──────────────────────────────────┤    │
│  │                                  │    │
│  │    Tomatoes                 x4   │    │
│  │                                  │    │
│  ├──────────────────────────────────┤    │
│  │                                  │    │
│  │    Spinach                       │    │
│  │                                  │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ─ ─ ─ checked ─ ─ ─                    │
│  ☑ Apples                               │
│  ☑ Onions                               │
│                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━ 14/28       │
│                                          │
│  [+ Quick add to Produce]               │
└─────────────────────────────────────────┘
```

## Open Questions

1. **Section management UX** — Should sections be created via a dedicated "Add Section" button, or inline (type `/section Name` in the add-item input, similar to Notion)? The inline approach is faster but less discoverable.

2. **Board column names** — Should tracker lists have fixed columns (Want / Active / Done) or let users name their own? Fixed is simpler; custom is more flexible. Recommendation: start fixed, add custom later.

3. **Migration of existing lists** — The 3 current lists should work unchanged. Sectioned view is opt-in per list (or auto-enabled for grocery type). No data migration needed for Phase 1.

4. **Metadata fields per list type** — Should each list type have a fixed set of extra fields, or should users pick which fields to show (like custom fields on tasks)? Fixed-per-type is simpler; user-configurable is more powerful but duplicates the custom fields system.

5. **Shop mode on desktop** — Should shop mode be available on desktop or restricted to mobile viewport? It's designed for mobile but there's no technical reason to restrict it.

## Next Steps

- [ ] Review this spec
- [ ] Hand off to plan agent for implementation breakdown
- [ ] Phase 1 implementation (sectioned list + print + hide-checked)
