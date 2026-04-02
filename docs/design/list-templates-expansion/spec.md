# List Templates Expansion — Spec

> **Version:** v0.7.52 · **Date:** 2 April 2026  
> **Baseline:** 4 built-in templates (Weekly Groceries, Travel Packing, Moving Checklist, Party Planning)  
> **Target:** ~15 built-in templates across 5 categories  
> **Scope:** Backend template data + frontend template picker UI grouping

---

## Problem

LifeFlow's Lists feature has only 4 hardcoded templates. Users creating a new list see a flat row of 4 buttons ("🛒 Weekly Groceries", "🧳 Travel Packing", etc.). Common personal tracking lists like "Movies to Watch", "Books to Read", or "Gift Ideas" require manual setup every time. Expanding the built-in set covers the most frequent personal list use cases out of the box.

## Design Goals

1. Add ~11 new templates covering lifestyle, entertainment, home, health, and personal tracking
2. Group templates by category in the UI so the expanded set remains discoverable
3. Zero schema changes — templates remain hardcoded in `src/routes/lists.js`
4. Existing `POST /api/lists/from-template` endpoint works unchanged
5. No custom/user-defined templates (out of scope)

---

## New Templates

### Category: Entertainment & Media

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `movies-to-watch` | Movies to Watch | checklist | 🎬 | The Shawshank Redemption, Inception, Parasite, The Godfather, Spirited Away, Everything Everywhere All at Once, Interstellar, The Dark Knight, Amélie, Whiplash |
| `books-to-read` | Books to Read | checklist | 📚 | Atomic Habits, Sapiens, The Alchemist, Dune, Project Hail Mary, Educated, The Psychology of Money, Thinking Fast and Slow, The Midnight Library, Klara and the Sun |
| `tv-shows` | TV Shows to Watch | checklist | 📺 | Breaking Bad, The Bear, Severance, Succession, Shogun, The Last of Us, Arcane, Better Call Saul, The White Lotus, Andor |
| `podcasts` | Podcasts to Try | checklist | 🎙️ | The Daily, Huberman Lab, Lex Fridman, How I Built This, Radiolab, 99% Invisible, Serial, Freakonomics, The Tim Ferriss Show, Hardcore History |

### Category: Home & Life

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `weekly-groceries` | Weekly Groceries | grocery | 🛒 | *(existing — unchanged)* |
| `home-maintenance` | Home Maintenance | checklist | 🏠 | Check smoke detectors, Replace air filters, Clean gutters, Test water heater, Inspect roof, Service HVAC, Flush water heater, Check caulking, Clean dryer vent, Test garage door |
| `cleaning-routine` | Cleaning Routine | checklist | 🧹 | Vacuum floors, Mop kitchen, Clean bathrooms, Dust surfaces, Wipe counters, Take out trash, Clean mirrors, Wash bedding, Organize fridge, Wipe appliances |

### Category: Travel & Events

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `travel-packing` | Travel Packing | checklist | 🧳 | *(existing — unchanged)* |
| `moving-checklist` | Moving Checklist | checklist | 📦 | *(existing — unchanged)* |
| `party-planning` | Party Planning | checklist | 🎉 | *(existing — unchanged)* |
| `camping-trip` | Camping Trip | checklist | ⛺ | Tent, Sleeping bag, Flashlight, First aid kit, Water bottles, Sunscreen, Bug spray, Camp stove, Firewood, Matches |

### Category: Personal

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `gift-ideas` | Gift Ideas | checklist | 🎁 | Birthday gifts, Holiday presents, Thank you gifts, Housewarming ideas, Wedding gift, Anniversary, Teacher appreciation, Host/hostess gift, Graduation, Baby shower |
| `bucket-list` | Bucket List | checklist | ⭐ | Learn a new language, Run a marathon, Visit Japan, Write a book, Learn an instrument, Go skydiving, See the Northern Lights, Cook a 5-course meal, Volunteer abroad, Start a garden |
| `restaurants-to-try` | Restaurants to Try | checklist | 🍽️ | *(starts empty — 10 placeholder items)* Italian place downtown, New Thai spot, Brunch café, Seafood restaurant, Ramen shop, Pizza place, Taco truck, Sushi bar, Farm-to-table bistro, Bakery |

### Category: Health & Wellness

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `workout-routine` | Workout Routine | checklist | 💪 | Push-ups, Squats, Planks, Lunges, Burpees, Jump rope, Pull-ups, Deadlifts, Bench press, Stretching |

**Total: 15 templates** (4 existing + 11 new)

---

## API Changes

### `GET /api/lists/templates` — Updated Response

Add a `category` field to each template object. The endpoint returns a flat array (no breaking change), but each template now includes its category string.

```json
[
  {
    "id": "movies-to-watch",
    "name": "Movies to Watch",
    "type": "checklist",
    "icon": "🎬",
    "category": "Entertainment & Media",
    "items": ["The Shawshank Redemption", "Inception", "..."]
  },
  {
    "id": "weekly-groceries",
    "name": "Weekly Groceries",
    "type": "grocery",
    "icon": "🛒",
    "category": "Home & Life",
    "items": ["Milk", "Eggs", "Bread", "..."]
  }
]
```

The `category` field is purely for UI grouping. The `POST /api/lists/from-template` endpoint ignores it — no changes needed there.

### Category Order

Templates should appear in this order in the response:

1. **Home & Life** — Weekly Groceries, Home Maintenance, Cleaning Routine
2. **Entertainment & Media** — Movies to Watch, Books to Read, TV Shows to Watch, Podcasts to Try
3. **Travel & Events** — Travel Packing, Moving Checklist, Party Planning, Camping Trip
4. **Personal** — Gift Ideas, Bucket List, Restaurants to Try
5. **Health & Wellness** — Workout Routine

Home & Life first because grocery is the most common list type.

---

## Frontend Changes

### Template Picker in New List Modal

**Current:** Flat row of 4 small buttons in `#lm-tpl-list`.

**Proposed:** Group templates by category with headers. The container changes from a single `flex-wrap` row to category sections.

```
Or start from a template:

Home & Life
[🛒 Weekly Groceries] [🏠 Home Maintenance] [🧹 Cleaning Routine]

Entertainment & Media
[🎬 Movies to Watch] [📚 Books to Read] [📺 TV Shows] [🎙️ Podcasts]

Travel & Events
[🧳 Travel Packing] [📦 Moving Checklist] [🎉 Party Planning] [⛺ Camping Trip]

Personal
[🎁 Gift Ideas] [⭐ Bucket List] [🍽️ Restaurants to Try]

Health & Wellness
[💪 Workout Routine]
```

**Implementation approach:**

1. In `app.js`, when rendering `#lm-tpl-list`, group templates by `category` field
2. Each category gets a small label (`font-size:11px; color:var(--txd); margin-top:6px`)
3. Template buttons remain the same style (`btn-c lm-tpl-btn`)
4. If the modal feels too tall, add `max-height: 240px; overflow-y: auto` to `#lm-tpl`

**No scrollability concern:** 15 templates across 5 groups fits comfortably. The current modal already scrolls if content overflows.

---

## Backend Implementation

### File: `src/routes/lists.js`

Replace the `LIST_TEMPLATES` array (lines 10-16) with the expanded set. Each template gains a `category` field.

```js
const LIST_TEMPLATES = [
  // Home & Life
  {id:'weekly-groceries',name:'Weekly Groceries',type:'grocery',icon:'🛒',category:'Home & Life',items:[...]},
  {id:'home-maintenance',name:'Home Maintenance',type:'checklist',icon:'🏠',category:'Home & Life',items:[...]},
  {id:'cleaning-routine',name:'Cleaning Routine',type:'checklist',icon:'🧹',category:'Home & Life',items:[...]},
  // Entertainment & Media
  {id:'movies-to-watch',name:'Movies to Watch',type:'checklist',icon:'🎬',category:'Entertainment & Media',items:[...]},
  {id:'books-to-read',name:'Books to Read',type:'checklist',icon:'📚',category:'Entertainment & Media',items:[...]},
  {id:'tv-shows',name:'TV Shows to Watch',type:'checklist',icon:'📺',category:'Entertainment & Media',items:[...]},
  {id:'podcasts',name:'Podcasts to Try',type:'checklist',icon:'🎙️',category:'Entertainment & Media',items:[...]},
  // Travel & Events
  {id:'travel-packing',name:'Travel Packing',type:'checklist',icon:'🧳',category:'Travel & Events',items:[...]},
  {id:'moving-checklist',name:'Moving Checklist',type:'checklist',icon:'📦',category:'Travel & Events',items:[...]},
  {id:'party-planning',name:'Party Planning',type:'checklist',icon:'🎉',category:'Travel & Events',items:[...]},
  {id:'camping-trip',name:'Camping Trip',type:'checklist',icon:'⛺',category:'Travel & Events',items:[...]},
  // Personal
  {id:'gift-ideas',name:'Gift Ideas',type:'checklist',icon:'🎁',category:'Personal',items:[...]},
  {id:'bucket-list',name:'Bucket List',type:'checklist',icon:'⭐',category:'Personal',items:[...]},
  {id:'restaurants-to-try',name:'Restaurants to Try',type:'checklist',icon:'🍽️',category:'Personal',items:[...]},
  // Health & Wellness
  {id:'workout-routine',name:'Workout Routine',type:'checklist',icon:'💪',category:'Health & Wellness',items:[...]},
];
```

### File: `public/app.js`

In `openListModal()`, change the template rendering from a flat list to grouped:

```js
api.get('/api/lists/templates').then(tpls => {
  // Group by category
  const groups = {};
  tpls.forEach(t => {
    (groups[t.category] = groups[t.category] || []).push(t);
  });
  let html = '';
  for (const [cat, items] of Object.entries(groups)) {
    html += `<div style="font-size:10px;color:var(--txd);margin-top:6px;margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">${esc(cat)}</div>`;
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap">`;
    items.forEach(t => {
      html += `<button class="btn-c lm-tpl-btn" data-tid="${escA(t.id)}" style="font-size:11px;padding:4px 10px">${esc(t.icon)} ${esc(t.name)}</button>`;
    });
    html += `</div>`;
  }
  $('lm-tpl-list').innerHTML = html;
  // ... click handlers remain the same
});
```

---

## Test Changes

### File: `tests/lists.test.js`

Update the existing template tests (line ~233):

1. Update the count check: `GET /api/lists/templates` should return 15 templates
2. Add a test for the new `category` field being present on each template
3. Add a test for creating a list from one of the new templates (e.g., `movies-to-watch`)
4. Existing tests for `weekly-groceries`, `travel-packing`, and 404 remain valid

```js
it('returns all built-in templates', async () => {
  const res = await agent().get('/api/lists/templates').expect(200);
  assert.equal(res.body.length, 15);
  assert.ok(res.body.every(t => t.category)); // all have category
});

it('creates list from movies-to-watch template', async () => {
  const res = await agent().post('/api/lists/from-template')
    .send({ template_id: 'movies-to-watch' }).expect(201);
  assert.equal(res.body.name, 'Movies to Watch');
  assert.equal(res.body.items.length, 10);
});
```

---

## Documentation Updates

| File | Change |
|------|--------|
| `docs/openapi.yaml` | Update `/api/lists/templates` response schema to include `category` field |
| `CLAUDE.md` | No changes needed (template count not tracked in header) |
| `CHANGELOG.md` | Add entry under next version |

---

## Scope Exclusions

- **User-defined templates** — Not in scope. This is about expanding built-in templates only.
- **Template preview** — No preview of items before creating. Users can delete items after creation.
- **Template search/filter** — 15 templates across 5 categories doesn't warrant search.
- **Localization** — Template names and items remain English-only.
- **Template icons customization** — Icons are fixed per template.

---

## Effort Estimate

| Area | Files | Complexity |
|------|-------|------------|
| Backend `LIST_TEMPLATES` expansion | 1 (`src/routes/lists.js`) | Low — data addition only |
| Frontend grouped rendering | 1 (`public/app.js`) | Low — ~15 lines changed |
| Tests | 1 (`tests/lists.test.js`) | Low — 2-3 new assertions |
| OpenAPI doc | 1 (`docs/openapi.yaml`) | Low — add `category` property |
| **Total** | **4 files** | **Small feature** |

---

## Review Checkpoint

Before implementation, verify:

- [ ] Template selection feels right — not too many, not too few
- [ ] Category grouping order makes sense (Home first vs Entertainment first?)
- [ ] Item choices for each template are practical starting points (users will edit)
- [ ] No need for a `notes` type template (all new ones are `checklist`)
- [ ] The modal won't feel overwhelming with 15 templates

### Open Questions

1. **Should "Restaurants to Try" have a `notes` type instead of `checklist`?** Notes type allows longer text per item (restaurant name + address + what to order). Checklist is simpler. Recommendation: keep as checklist — users can add notes to individual items.

2. **Should existing template IDs remain stable?** Yes — any user code or bookmarks referencing `weekly-groceries` etc. must continue to work. New templates get new IDs.

3. **Should the `category` field be returned from `GET /api/lists/templates` or should the frontend hardcode category groupings?** Recommendation: return from API. This keeps the frontend dumb and allows future reordering without frontend changes.
