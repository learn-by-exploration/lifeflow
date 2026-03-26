---
status: Partially implemented
baseline: v0.0.12
---

# LifeFlow Configurable Lists & Personalization — 11-Expert Panel Review

> **Expert Panel Design Document**
> Date: 2026-03-24 | Baseline: v0.0.12 (739 tests, 0 failures)
> Scope: Make ALL lists, categories, and configuration points user-editable
> Goal: Transform LifeFlow from a fixed-structure app into a fully personalizable system

---

## Current State Assessment

### What Exists (v0.0.12)
- **6 hardcoded life areas**: Health (💪), Career (💼), Home (🏠), Family (👨‍👩‍👧‍👦), Finance (💰), Learning (📚)
- **5 hardcoded default tags**: urgent, blocked, quick-win, research, waiting
- **5 task templates**: Sprint Planning, Weekly Review, Bug Fix, Content Creation, Project Launch
- **4 list templates**: Weekly Groceries, Travel Packing, Moving Checklist, Party Planning
- **11 grocery categories**: Produce, Bakery, Dairy, Meat & Seafood, Frozen, Pantry, Beverages, Snacks, Household, Personal Care, Other
- **4 priorities**: None (0), Normal (1), High (2), Critical (3) — labels hardcoded in JS
- **3 task statuses**: todo, doing, done — labels hardcoded
- **7 recurring patterns**: daily, weekdays, weekly, every-2-weeks, monthly, yearly, custom
- **8 themes**: midnight, charcoal, nord, ocean, forest, rose, sunset, light
- **12 color palette**: hardcoded in app.js line 1
- **3 list types**: checklist, grocery, notes
- **3 smart filters**: Stale, Quick Wins, Blocked — hardcoded logic
- **Settings**: theme, focusDuration, shortBreak, longBreak, weekStart, defaultPriority, showCompleted, confirmDelete, dateFormat, autoMyDay

### What Users CANNOT Do
1. **Life Areas**: Cannot rename, reorder, change icon/color, archive, or create new ones from settings
2. **Lists**: Cannot edit list name/icon/color after creation, cannot reorder, cannot duplicate
3. **Tags**: Can CRUD via API, but tag management UI is minimal (no color picker, no merge, no bulk)
4. **Priorities**: Cannot rename "Normal/High/Critical" labels or add levels
5. **Task Statuses**: Cannot rename "To Do/In Progress/Done" labels or add columns
6. **Recurring Patterns**: Cannot define custom patterns (e.g., "every 3 days", "1st and 15th")
7. **Templates**: Cannot create custom templates, edit built-in ones, or delete them
8. **Grocery Categories**: Cannot add/rename/reorder categories
9. **Smart Filters**: Cannot customize thresholds (stale >7d, quick wins ≤15m)
10. **Color Palette**: Cannot add custom colors
11. **Keyboard Shortcuts**: Cannot rebind keys
12. **Default Views**: Limited view-specific defaults

---

## Part 1: UX Designer Reviews (3 Experts)

### UX 1 — Information Architecture & Discoverability

**Finding UX1-1: Settings is a flat dumping ground (Critical)**
The current settings panel is a single scrollable list mixing unrelated concerns (theme next to focus duration next to date format). When we add life area editing, list management, tag management, template management, and all other configuration, it will become overwhelming.

**Recommended Structure:**
```
Settings (⚙️)
├── Appearance        → Theme, accent color, compact mode
├── Life Areas        → CRUD areas with icon/color/position
├── Task Defaults     → Default priority, status labels, custom statuses
├── Lists & Templates → Manage list types, templates, grocery categories
├── Tags & Labels     → Tag CRUD, color picker, merge, bulk ops
├── Time & Dates      → Date format, week start, timezone
├── Focus & Timer     → Durations, break policy, sounds
├── Shortcuts         → View/edit keyboard bindings
├── Data & Backup     → Export, import, backup schedule
└── Advanced          → Smart filter thresholds, automation rules
```

**Finding UX1-2: Inline editing is the expected pattern (High)**
Users shouldn't need to navigate to a separate "manage" page to rename a life area or reorder tags. Every list item in the sidebar should support: long-press or right-click → contextual menu (Rename, Change Icon, Change Color, Reorder, Archive/Delete). This matches Todoist, Things 3, and TickTick patterns.

**Finding UX1-3: Settings sections need be reachable from context (Medium)**
If I'm looking at a life area and want to edit it, I should right-click → "Edit Area" (opens inline) or "Manage Areas" (jumps to settings section). Don't force users to remember where settings live.

**Finding UX1-4: Drag-to-reorder should be universal (Medium)**
Every ordered list (areas in sidebar, tags, templates, grocery categories, saved filters) should support drag-to-reorder. The pattern already works for tasks — extend it everywhere.

---

### UX 2 — Interaction Design & Editing Patterns

**Finding UX2-1: Life area editing needs an inline overlay pattern (Critical)**
Life areas are the top-level organizer. Users need to:
1. Rename (double-click text → inline edit, same as task titles)
2. Change icon (click icon → emoji picker / icon grid)
3. Change color (click color dot → palette picker)
4. Reorder (drag handle in sidebar)
5. Archive (soft-delete; hide from sidebar, keep data)
6. Create new (+ button at bottom of area list)

**Mockup — Area Edit Inline:**
```
┌──────────────────────────────────┐
│  [💪] Health                  ⋮  │  ← click ⋮ for menu
│  ────────────────────────────    │
│  Icon: [💪] ← tap to change     │
│  Name: [Health___________]       │
│  Color: [● ● ● ● ● ● ● ●]     │
│  Position: [▲] 1 of 6 [▼]       │
│                                  │
│  [Archive]          [Save] [✕]   │
└──────────────────────────────────┘
```

**Finding UX2-2: List editing is completely missing (Critical)**
Custom lists (grocery, checklist, notes) cannot be edited after creation. The API endpoints exist (`PUT /api/lists/:id`) but the frontend never calls them. Need:
- Rename list (double-click title)
- Change icon/color (edit modal or inline)
- Reorder lists in sidebar (drag handle)
- Duplicate list (copy with items)
- Convert type (checklist → grocery adds category field)
- Delete with confirmation

**Finding UX2-3: Tag management needs a dedicated panel (High)**
Tags are powerful but under-managed. Need:
- Color picker for each tag (not just API)
- Merge duplicate tags (combine "urgent" + "Urgent")
- Bulk apply/remove tags
- Tag usage counts visible
- Alphabetical or usage-based sorting
- Quick-create from task detail panel

**Finding UX2-4: Emoji picker for icons (Medium)**
Areas, lists, goals, and saved filters all have icon fields. Rather than typing emoji, provide a searchable emoji picker grid (common productivity emojis up top). There are lightweight solutions — a simple categorized grid of ~100 curated emoji is enough.

---

### UX 3 — Mobile & Accessibility

**Finding UX3-1: Touch-friendly editing controls (High)**
On mobile, right-click context menus don't exist. Need:
- Long-press → action sheet (Rename, Color, Icon, Reorder, Archive, Delete)
- Swipe-left on sidebar items → quick actions (Edit, Delete)
- Bottom sheet for settings sections (not full-page navigations)

**Finding UX3-2: Keyboard navigation for settings (Medium)**
Power users (LifeFlow already supports Vim keys) need:
- Tab through settings sections
- Enter to edit, Escape to cancel
- Arrow keys to reorder within lists
- Keyboard shortcut to open settings (,)

**Finding UX3-3: Undo for all destructive list operations (High)**
Deleting a life area cascades to goals and tasks. Archiving is safer. For all destructive operations on configuration items (delete area, delete tag, change template), show an undo toast (same pattern as task deletion). This is especially important for areas since they cascade.

---

## Part 2: Product Manager Reviews (3 Experts)

### PM 1 — Core Personalization Strategy

**Finding PM1-1: Life Areas should be fully user-owned (Critical)**
The 6 seeded areas (Health, Career, Home, Family, Finance, Learning) are a good starting point but every user's life is different. A freelancer needs "Clients" and "Projects". A student needs "Courses" and "Extracurriculars". A parent needs "Kids" split from generic "Family".

**Required Capabilities:**
| Action | Priority | Complexity |
|--------|----------|------------|
| Create new area | Critical | Low — INSERT + UI |
| Rename area | Critical | Low — UPDATE + inline edit |
| Change area icon | Critical | Low — emoji picker |
| Change area color | Critical | Low — color palette |
| Reorder areas | High | Low — position UPDATE |
| Archive area (hide, keep data) | High | Medium — add `archived` column |
| Unarchive area | High | Low — toggle archived |
| Delete area (with cascade warning) | Medium | Low — already works via API |
| Merge two areas | Low | Medium — re-parent goals |

**Finding PM1-2: Custom task statuses unlock workflow diversity (High)**
Some users want Kanban columns beyond "To Do / In Progress / Done":
- **Software**: Backlog → To Do → In Progress → Review → Done
- **Content**: Idea → Draft → Review → Published
- **Legal**: Intake → Research → Draft → Review → Filed

**Proposal:** Keep `todo/doing/done` as internal DB states (for filtering/sorting compatibility) but allow **display labels** per area or global. A `status_labels` setting:
```json
{
  "todo": "Backlog",
  "doing": "In Progress",  
  "done": "Shipped"
}
```

Advanced (Phase 2): Custom intermediate statuses that map to the 3 base states.

**Finding PM1-3: Priority labels should be renameable (Medium)**
"None / Normal / High / Critical" is generic. Some users prefer:
- "P0 / P1 / P2 / P3" (engineering)
- "Low / Medium / High / Urgent" (project management)
- Custom emoji labels: 🟢 🟡 🟠 🔴

**Proposal:** A `priority_labels` setting:
```json
["", "Low", "Medium", "High"]
```
Keep numeric 0-3 in DB, just remap display text.

---

### PM 2 — Lists & Templates Ecosystem

**Finding PM2-1: Lists need full lifecycle management (Critical)**
Lists are a distinct content type (separate from Areas → Goals → Tasks) but they're second-class citizens. After creation, users can't:
- Edit the list name, icon, or color
- Reorder lists in the sidebar
- Duplicate a list (great for recurring shopping lists)
- Move items between lists
- Bulk check/uncheck items

All the API endpoints exist. The frontend just doesn't wire them up.

**Finding PM2-2: User-created templates are a retention driver (High)**
The 5 task templates and 4 list templates are helpful but rigid. Users should be able to:
1. **Save any goal's tasks as a template** ("Save as Template" on goal overflow menu)
2. **Save any list as a template** ("Save as Template" on list overflow menu)
3. **Edit/delete custom templates** (Settings → Lists & Templates)
4. **Share templates** (future: export/import template JSON)

**Implementation:**
```sql
-- task_templates already has: id, name, icon, tasks_json
-- Just add: user_created BOOLEAN DEFAULT 0, source_type TEXT DEFAULT 'task'
ALTER TABLE task_templates ADD COLUMN user_created INTEGER DEFAULT 0;
ALTER TABLE task_templates ADD COLUMN source_type TEXT DEFAULT 'task';
-- source_type: 'task' (goal template) or 'list' (list template)
```

**Finding PM2-3: Grocery categories should be configurable (Medium)**
The 11 hardcoded categories (Produce, Bakery, Dairy...) are a good default but:
- International users need different categories (e.g., "Spices" is huge in Indian cooking)
- Health-conscious users want "Supplements", "Organic"
- Budget shoppers want categories by store aisle

**Proposal:** Store categories in settings:
```json
{
  "groceryCategories": ["Produce", "Bakery", "Dairy", ...]
}
```
Allow add/rename/reorder/delete from Settings → Lists & Templates.

**Finding PM2-4: List types should be extensible (Low)**
Current: checklist, grocery, notes. Users might want:
- **Wishlist** (items with price + URL)
- **Reading List** (items with author + progress)
- **Contacts** (name + phone + email)

This is Phase 2+ territory — requires schema changes. For now, just make the existing 3 types more configurable.

---

### PM 3 — Smart Defaults & Progressive Disclosure

**Finding PM3-1: Onboarding should be adaptive (High)**
The current onboarding asks users to pick life areas from a fixed set (Work, Health, Learning, Personal, Home, Finance, Goals). This should be:
1. **Persona-based**: "I'm a student / professional / freelancer / parent / retiree"
2. **Each persona pre-selects relevant areas** but user can customize
3. **Persona also sets default templates, tags, and smart filter thresholds**

**Persona Presets:**
| Persona | Areas | Extra Tags | Templates |
|---------|-------|-----------|-----------|
| Student | Courses, Study, Social, Health, Finance | exam, assignment, group-project | Study Plan, Essay Writing |
| Professional | Work, Career, Health, Home, Finance, Learning | meeting, deadline, review | Sprint Planning, Weekly Review |
| Freelancer | Clients, Projects, Finance, Marketing, Health | invoice, deadline, proposal | Client Onboarding, Invoice Checklist |
| Parent | Family, Kids, Home, Health, Finance, Self-Care | school, appointment, errand | Weekly Meal Plan, School Prep |
| General | Health, Career, Home, Family, Finance, Learning | (current defaults) | (current defaults) |

**Finding PM3-2: Smart filter thresholds should be configurable (Medium)**
Currently hardcoded:
- **Stale**: tasks not updated in >7 days
- **Quick Wins**: estimated ≤15 minutes, not blocked
- **Blocked**: has dependencies

Users should be able to tune these:
- Stale threshold: 3/5/7/14/30 days
- Quick win ceiling: 5/10/15/30/60 minutes
- Add custom smart filters with formula builder

**Finding PM3-3: Default view per area/goal (Medium)**
Settings has a global `defaultView` but users want:
- Work area opens in Board view
- Home area opens in List view
- "Fitness" goal opens in Calendar view

**Proposal:** `default_view` column on `life_areas` and `goals` tables (nullable, falls back to global).

---

## Part 3: User Persona Reviews (5 Users)

### User 1 — Sarah, Freelance Designer (Power User)

> "I have 12 clients and the 6 default areas don't work for me at all. I need 'Active Clients', 'Pipeline', 'Portfolio', 'Admin', 'Learning', and 'Self-Care'. And I need to rename them constantly as clients come and go."

**Pain Points:**
1. Can't create areas beyond the initial 6 — must use goals as pseudo-areas
2. Can't rename areas to reflect current client names
3. Can't archive old client areas (deleting loses all history)
4. Can't color-code areas to match client brand colors
5. Priority labels "Normal/High/Critical" don't match her workflow — she uses "Someday / This Week / Today / Overdue"

**Needs:**
- [ ] Create/rename/archive/reorder areas freely
- [ ] Custom priority labels per area or global
- [ ] Duplicate an area (copy structure without tasks)
- [ ] Quick-switch between "work mode" (show only work areas) and "life mode"

---

### User 2 — Raj, Software Engineer (Keyboard-Heavy User)

> "I love the Vim keys but I can't edit anything in the sidebar without grabbing the mouse. Let me rename an area with 'r', reorder with Alt+J/K, and manage tags from a keyboard-driven palette."

**Pain Points:**
1. No keyboard way to manage sidebar items
2. Tags are hard to manage — can't see all tags with usage counts
3. Can't customize keyboard shortcuts (wants Ctrl+1 for first area instead of views)
4. Smart filter "stale >7 days" is too aggressive for his sprint cycle (2-week sprints)
5. Template tasks don't match his workflow — wants to save his own

**Needs:**
- [ ] Keyboard shortcuts for sidebar management
- [ ] Tag management panel with search, sort-by-usage, merge
- [ ] Configurable smart filter thresholds
- [ ] Save custom templates from existing goals
- [ ] Rebindable keyboard shortcuts (future phase)

---

### User 3 — Maria, Stay-at-Home Parent (Mobile-Heavy User)

> "I mostly use LifeFlow on my phone for grocery lists and family tasks. I can't edit my grocery list names, and the categories don't include 'Baby Supplies' which I need every week."

**Pain Points:**
1. Can't rename lists after creation (typo in "Weely Groceries" stuck forever)
2. Grocery categories missing her needs (Baby Supplies, Pet Food, International Foods)
3. Can't duplicate a grocery list for next week (has to recreate manually)
4. Can't reorder items by category (they're in creation order)
5. No quick "uncheck all" to reuse a weekly list
6. Life areas "Career" and "Learning" are irrelevant — wants "Kids", "Meals", "Household"

**Needs:**
- [ ] Edit list names/icons after creation
- [ ] Custom grocery categories
- [ ] Duplicate list (with or without checked state)
- [ ] "Uncheck All" button on lists
- [ ] Reorder items by category or drag
- [ ] Delete/hide irrelevant default areas

---

### User 4 — Alex, Graduate Student (Workflow Customization)

> "My workflow is completely different from a typical GTD user. I need statuses like 'Reading → Annotating → Summarizing → Writing → Review → Submitted'. The 3-column board doesn't work for academic work."

**Pain Points:**
1. Only 3 task statuses — needs 5-6 for academic pipeline
2. Can't rename "To Do / In Progress / Done" to "Backlog / Active / Submitted"
3. No custom recurring patterns (e.g., "every Tuesday and Thursday" for class prep)
4. Templates are business-focused — needs academic templates (Literature Review, Thesis Chapter, Lab Report)
5. Tags are global — wants area-scoped tags (class-specific tags)

**Needs:**
- [ ] Custom status labels (map to base 3 for compatibility)
- [ ] Custom recurring patterns beyond presets
- [ ] User-created templates
- [ ] Academic persona preset in onboarding
- [ ] Area-scoped tag visibility (future phase)

---

### User 5 — Jun, Minimalist User (Simplicity-Focused)

> "I only need 3 areas: Work, Health, Personal. The other 3 default areas are clutter. I also only use 2 priorities: Do It and Don't Do It. Let me simplify."

**Pain Points:**
1. Can't delete or hide unused default areas
2. Can't simplify priorities to 2 levels
3. Too many default tags — only uses "urgent"
4. Smart filters are noise — never has blocked tasks
5. Wants a minimal sidebar with just what they use

**Needs:**
- [ ] Delete/archive unused areas
- [ ] Hide features they don't use (smart filters, templates section)
- [ ] Custom priority levels (even just 2)
- [ ] Clean up default tags on first run or in settings
- [ ] Sidebar section collapse + remember state

---

## Part 4: Consolidated Feature Matrix

### Priority Tiers

| Tier | Features | Impact |
|------|----------|--------|
| **P0 — Critical** | Life area CRUD (create, rename, icon, color, reorder, archive), List editing (rename, icon, color, reorder, delete), Tag management UI | Removes hard blocks on personalization |
| **P1 — High** | Custom status labels, Custom priority labels, Custom grocery categories, Duplicate list, Uncheck-all for lists, Save-as-template, Custom templates CRUD, Smart filter threshold settings | Workflow customization |
| **P2 — Medium** | Emoji picker component, Persona-based onboarding, Default view per area, Sidebar section collapse/memory, Improved tag panel (merge, bulk, search) | Polish & progressive disclosure |
| **P3 — Low** | Custom recurring patterns, Area-scoped tags, Custom list types, Keyboard shortcut rebinding, Template sharing | Advanced personalization |

---

## Part 5: Implementation Plan

### Phase A — v0.0.13: Life Areas & List Editing (P0)

**Goal:** Make the two most rigid structures fully editable.

#### A1. Life Area Full CRUD

**Database Changes:**
```sql
ALTER TABLE life_areas ADD COLUMN archived INTEGER DEFAULT 0;
ALTER TABLE life_areas ADD COLUMN position INTEGER DEFAULT 0;
-- position already exists, archived is new
```

**New API Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/api/areas/:id` | Update name, icon, color, position, archived |
| POST | `/api/areas` | Already exists — ensure icon + color support |
| DELETE | `/api/areas/:id` | Already exists — add cascade confirmation data |
| GET | `/api/areas` | Update to filter `archived=0` by default, `?include_archived=1` to show all |
| PUT | `/api/areas/reorder` | Bulk update positions `[{id, position}, ...]` |
| PUT | `/api/areas/:id/archive` | Toggle archived (soft delete) |
| PUT | `/api/areas/:id/unarchive` | Restore archived area |

**Frontend — Sidebar Area Items:**
- Three-dot menu (⋮) on hover/focus → Rename, Change Icon, Change Color, Reorder ↕, Archive, Delete
- Double-click area name → inline rename (contenteditable, Enter to save, Escape to cancel)
- Click icon → mini emoji picker (6×8 grid of common productivity emoji + search)
- Click color → palette row (12 colors + custom hex input)
- Drag handle appears on hover → reorder areas
- "+" button at bottom of Areas section → create new area (inline or modal)
- Archived areas hidden by default, "Show Archived" toggle at bottom

**Frontend — Settings → Life Areas:**
- Full management view with table/list of all areas
- Bulk reorder, bulk archive
- Shows goal count per area
- "Reset to Defaults" button (re-seeds original 6)

#### A2. List Editing

**No DB changes needed — schema already supports name, icon, color, position updates.**

**Frontend Changes:**
- Three-dot menu (⋮) on list items in sidebar → Rename, Change Icon, Change Color, Duplicate, Delete
- Double-click list name → inline rename
- Drag handle → reorder lists
- "Duplicate List" → copies list + all items (unchecked state for grocery, kept state for checklist)
- "Uncheck All" button on grocery/checklist views (reset all items to unchecked)
- List header becomes editable (click icon to change, click name to rename)

**New API Endpoint:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/lists/:id/duplicate` | Deep-copy list + items |
| POST | `/api/lists/:id/uncheck-all` | Set all items checked=0 |

#### A3. Tag Management Panel

**Frontend — Settings → Tags & Labels:**
- List of all tags with: color dot, name, usage count, edit/delete buttons
- Inline rename (click name → editable)
- Color picker per tag (same palette as areas)
- Sort by: name, usage count, color
- Search/filter tags
- Create new tag with name + color
- Delete tag (with "used in X tasks" warning)

**Frontend — Task Detail Panel Tag Section:**
- Current: text input with autocomplete
- Add: small "Manage Tags" link → opens settings section
- Add: create-new-tag inline (type new name, pick color, create)

---

### Phase B — v0.0.14: Custom Labels & Templates (P1)

#### B1. Custom Status Labels

**Database:**
```sql
-- settings table, key-value:
-- key: 'statusLabels', value: '{"todo":"Backlog","doing":"In Progress","done":"Shipped"}'
```

**Frontend:**
- Settings → Task Defaults → "Status Labels" section
- 3 rows: todo → [input], doing → [input], done → [input]
- Preview of how board columns will look
- "Reset to Defaults" button
- All UI that displays "To Do / In Progress / Done" reads from settings

#### B2. Custom Priority Labels

**Database:**
```sql
-- settings table:
-- key: 'priorityLabels', value: '["","Low","Medium","High"]'
-- key: 'priorityColors', value: '["","var(--brand)","var(--warn)","var(--err)"]'
```

**Frontend:**
- Settings → Task Defaults → "Priority Labels" section
- 4 rows: P0 → [input + color], P1 → [...], P2 → [...], P3 → [...]
- Option to use emoji instead of text
- Preview of how task cards will look
- "Reset to Defaults" button

#### B3. Custom Grocery Categories

**Database:**
```sql
-- settings table:
-- key: 'groceryCategories', value: '["Produce","Bakery","Dairy",...]'
```

**Frontend:**
- Settings → Lists & Templates → "Grocery Categories" section
- Ordered list with drag-to-reorder
- Add new category (text input + add button)
- Rename (inline edit)
- Delete (with "X items in this category" warning, items move to "Other")
- "Reset to Defaults" button

#### B4. Custom Templates

**Database:**
```sql
ALTER TABLE task_templates ADD COLUMN user_created INTEGER DEFAULT 0;
```

**New API Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/templates` | Create custom template from goal's tasks or list's items |
| PUT | `/api/templates/:id` | Edit template (name, icon, tasks/items) |
| DELETE | `/api/templates/:id` | Delete template (only user_created) |
| POST | `/api/goals/:id/save-as-template` | Snapshot goal's tasks as template |
| POST | `/api/lists/:id/save-as-template` | Snapshot list's items as template |

**Frontend:**
- Settings → Lists & Templates → "Task Templates" / "List Templates" tabs
- Built-in templates marked with 🔒 (not deletable, but hideable)
- Custom templates: full edit (name, icon, add/remove/reorder items)
- Goal overflow menu: "Save as Template"
- List overflow menu: "Save as Template"

#### B5. Smart Filter Configuration

**Database:**
```sql
-- settings table:
-- key: 'smartFilterStale', value: '7'        (days)
-- key: 'smartFilterQuickWin', value: '15'    (minutes)
```

**Frontend:**
- Settings → Advanced → "Smart Filters" section
- Stale threshold: dropdown [3, 5, 7, 14, 30] days
- Quick win ceiling: dropdown [5, 10, 15, 30, 60] minutes
- Toggle to show/hide each smart filter in sidebar

---

### Phase C — v0.0.15: Progressive Disclosure & Polish (P2)

#### C1. Emoji Picker Component

**Reusable component** used by: areas, lists, goals, saved filters
- Floating panel attached to trigger element
- Categories: Smileys, People, Animals, Food, Objects, Symbols, Flags
- Productivity shortcuts row: 💼💪📚🏠💰❤️🎯📋✅🛒📝🔧
- Search box (type to filter)
- Recent picks (last 12 used)
- ~300 curated emoji (not the full Unicode set — keep it fast)

#### C2. Persona-Based Onboarding

**Onboarding Step 1** (new): "How do you plan to use LifeFlow?"
- Cards: Student | Professional | Freelancer | Parent | General
- Each card shows 3-4 suggested areas
- Selecting a persona pre-configures: areas, default tags, templates, smart filter thresholds

**Onboarding Step 2** (existing, enhanced): customize the pre-selected areas
- Add/remove from persona defaults
- Change icons and colors

#### C3. Default View Per Area

**Database:**
```sql
ALTER TABLE life_areas ADD COLUMN default_view TEXT;
-- values: null (use global), 'list', 'board', 'calendar'
```

**Frontend:**
- Area settings (three-dot menu → "Default View") → dropdown: Auto, List, Board, Calendar
- When navigating to an area, use area.default_view ?? appSettings.defaultView

#### C4. Sidebar Section Collapse

**Database:**
```sql
-- settings table:
-- key: 'sidebarCollapsed', value: '{"areas":false,"filters":false,"lists":true,"smart":false}'
```

**Frontend:**
- Each sidebar section header (Areas, Filters, Lists, Smart) gets a collapse toggle (▼/▶)
- State persisted in settings
- Collapsed sections show count badge "Areas (6)"

#### C5. Improved Tag Panel

- Merge tags: select 2+ tags → "Merge into..." → pick surviving name → re-tag all tasks
- Bulk delete unused tags (usage count = 0)
- Tag color themes (preset palettes: monochrome, rainbow, earth tones, neon)
- Tag groups (future: nest tags under groups)

---

### Phase D — v0.0.16: Advanced Customization (P3)

#### D1. Custom Recurring Patterns
- "Every X days/weeks/months" with numeric input
- Specific days of week (Mon+Wed+Fri)
- Specific dates of month (1st, 15th)
- Store as JSON in `recurring` field: `{"type":"custom","every":3,"unit":"day"}` or `{"type":"custom","days":["mon","wed","fri"]}`

#### D2. Keyboard Shortcut Rebinding
- Settings → Shortcuts → list of actions with current binding
- Click binding → press new key combo → save
- Conflict detection
- "Reset to Defaults"

#### D3. Custom List Types (Future)
- Define fields per list type (e.g., Wishlist: title + price + url + priority)
- Custom list type builder in Settings
- This is a significant schema change — defer to v0.1.0+

---

## Part 6: Data Model Summary

### New/Modified Columns

| Table | Column | Type | Purpose | Phase |
|-------|--------|------|---------|-------|
| life_areas | archived | INTEGER DEFAULT 0 | Soft delete | A |
| life_areas | default_view | TEXT | Per-area default view | C |
| task_templates | user_created | INTEGER DEFAULT 0 | Distinguish custom vs built-in | B |

### New Settings Keys

| Key | Default Value | Phase |
|-----|--------------|-------|
| statusLabels | `{"todo":"To Do","doing":"In Progress","done":"Done"}` | B |
| priorityLabels | `["","Normal","High","Critical"]` | B |
| priorityColors | `["","var(--brand)","var(--warn)","var(--err)"]` | B |
| groceryCategories | `["Produce","Bakery",...11 items]` | B |
| smartFilterStale | `7` | B |
| smartFilterQuickWin | `15` | B |
| sidebarCollapsed | `{}` | C |

### New API Endpoints Summary

| Phase | Endpoint | Method | Purpose |
|-------|----------|--------|---------|
| A | `/api/areas/:id` | PUT | Update area (name, icon, color, position) |
| A | `/api/areas/reorder` | PUT | Bulk reorder areas |
| A | `/api/areas/:id/archive` | PUT | Archive area |
| A | `/api/areas/:id/unarchive` | PUT | Unarchive area |
| A | `/api/lists/:id/duplicate` | POST | Deep-copy list + items |
| A | `/api/lists/:id/uncheck-all` | POST | Reset all items to unchecked |
| B | `/api/templates` | POST | Create custom template |
| B | `/api/templates/:id` | PUT | Edit template |
| B | `/api/templates/:id` | DELETE | Delete user template |
| B | `/api/goals/:id/save-as-template` | POST | Snapshot goal as template |
| B | `/api/lists/:id/save-as-template` | POST | Snapshot list as template |

---

## Part 7: Key Design Decisions

### Decision 1: Inline Editing vs. Settings Page
**Verdict: Both.**
- Quick edits (rename, icon, color) → inline via context menu / double-click
- Bulk management (reorder all, archive multiple, reset defaults) → Settings section
- Context link from inline to settings ("Manage All Areas →")

### Decision 2: Keep 3 Base Statuses
**Verdict: Yes, extend with display labels only.**
- Internal DB stays `todo/doing/done` — all queries, filters, bulk ops work unchanged
- Display labels are cosmetic via settings
- Phase D could add custom intermediate statuses that map to base 3

### Decision 3: Color Palette — Fixed vs. Free-Form
**Verdict: Fixed palette + custom hex input.**
- 12-color palette covers most needs (the existing palette)
- Advanced users get a hex input field for exact brand colors
- Prevents jarring/unreadable color choices via contrast check

### Decision 4: Template Ownership
**Verdict: Built-in templates are immutable but hideable.**
- Built-in (user_created=0): can be hidden from template picker, never deleted
- User-created (user_created=1): full CRUD
- This prevents "I accidentally deleted Sprint Planning and can't get it back"

### Decision 5: Archive vs. Delete for Areas
**Verdict: Archive is the default, delete requires extra confirmation.**
- Archive hides from sidebar and navigation, data persists
- Delete shows: "This will permanently delete X goals and Y tasks. Type area name to confirm."
- Undo toast for archive (5 seconds), no undo for delete

---

## Part 8: Migration & Backward Compatibility

### Seed Data Handling
- Existing users: areas/tags/templates already exist in DB, no re-seeding needed
- New users: seeds run as before, but onboarding now allows customization
- `archived` column defaults to 0 — existing areas unaffected
- `user_created` column defaults to 0 — existing templates marked as built-in
- Settings keys have sensible defaults matching current hardcoded values

### No Breaking Changes
- All new columns have defaults → old data just works
- Custom labels are purely cosmetic → no query changes needed
- New endpoints are additive → existing endpoints unchanged
- Frontend changes are progressive → features appear when settings exist

---

## Appendix: Quick Wins (Can Ship Immediately)

These require only frontend changes (APIs already exist):

1. **List rename** — wire up `PUT /api/lists/:id` with inline edit on list title
2. **List icon/color change** — same PUT endpoint, add color/icon pickers
3. **List delete** — wire up `DELETE /api/lists/:id` with confirmation modal
4. **List reorder** — wire up `PUT /api/lists/:id` with position field + drag
5. **Tag color editing** — wire up `PUT /api/tags/:id` with color picker
6. **Tag creation from task panel** — POST `/api/tags` inline
7. **Area create** — `POST /api/areas` with inline form (already works, needs UI button)
8. **Area delete** — `DELETE /api/areas/:id` with cascade warning (already works, needs UI)

These 8 items could ship as a quick patch since the backend is ready.
