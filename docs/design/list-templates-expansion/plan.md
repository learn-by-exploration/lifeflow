# List Templates Expansion — Implementation Plan

> **Spec:** [spec.md](spec.md)  
> **Date:** 2 April 2026  
> **Scope:** Expand LIST_TEMPLATES from 4→15, add `category` field, group in UI  
> **Risk:** Low — no schema changes, no new endpoints, no migrations

---

## Summary

Add 11 new list templates across 5 categories (Home & Life, Entertainment & Media, Travel & Events, Personal, Health & Wellness). Add a `category` field to each template object. Update the frontend template picker to group templates by category with section headers. Update tests and OpenAPI docs.

**4 files to modify. 0 files to create. 0 schema changes.**

---

## Task Breakdown

### Task 1: Expand LIST_TEMPLATES in backend

**File:** `src/routes/lists.js`  
**Lines:** 10–16 (replace the entire `LIST_TEMPLATES` array)

**What to do:**
1. Replace the 4-element `LIST_TEMPLATES` array (lines 10–16) with 15 templates
2. Add `category` string field to each template object
3. Existing 4 templates keep their exact `id`, `name`, `type`, `icon`, and `items` — only add `category`
4. Order templates by category: Home & Life → Entertainment & Media → Travel & Events → Personal → Health & Wellness
5. Move existing templates into their categories:
   - `weekly-groceries` → "Home & Life"
   - `travel-packing` → "Travel & Events"
   - `moving-checklist` → "Travel & Events"
   - `party-planning` → "Travel & Events"

**Exact template IDs and categories (from spec):**

| # | ID | Category |
|---|-----|----------|
| 1 | `weekly-groceries` | Home & Life |
| 2 | `home-maintenance` | Home & Life |
| 3 | `cleaning-routine` | Home & Life |
| 4 | `movies-to-watch` | Entertainment & Media |
| 5 | `books-to-read` | Entertainment & Media |
| 6 | `tv-shows` | Entertainment & Media |
| 7 | `podcasts` | Entertainment & Media |
| 8 | `travel-packing` | Travel & Events |
| 9 | `moving-checklist` | Travel & Events |
| 10 | `party-planning` | Travel & Events |
| 11 | `camping-trip` | Travel & Events |
| 12 | `gift-ideas` | Personal |
| 13 | `bucket-list` | Personal |
| 14 | `restaurants-to-try` | Personal |
| 15 | `workout-routine` | Health & Wellness |

**Items for each new template:** See spec § "New Templates" for exact item lists (10 items each).

**Edge cases:**
- Existing template IDs must NOT change (backward compatibility)
- Existing template items must NOT change
- `weekly-groceries` keeps `type:'grocery'`; all new templates use `type:'checklist'`

**Verification:** `GET /api/lists/templates` returns 15 objects, each with `id`, `name`, `type`, `icon`, `category`, `items`.

---

### Task 2: Update frontend template picker to group by category

**File:** `public/app.js`  
**Lines:** 4190–4198 (inside `openListModal()`, the template rendering block)

**What to do:**
1. Replace the flat `.map()` rendering at line 4194:
   ```js
   // CURRENT (line 4194):
   $('lm-tpl-list').innerHTML=tpls.map(t=>`<button ...>`).join('');
   ```
2. Group templates by `category` field using `Object.entries` on a grouped object
3. Render each category as a section: small uppercase label + flex-wrap row of buttons
4. Keep button class `btn-c lm-tpl-btn` and `data-tid` attribute unchanged
5. Click handler binding at line 4195 (`querySelectorAll('.lm-tpl-btn').forEach(...)`) needs NO changes — it already queries all `.lm-tpl-btn` buttons regardless of structure

**Replacement rendering logic:**
```js
const groups = {};
tpls.forEach(t => { (groups[t.category] = groups[t.category] || []).push(t); });
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
```

**Edge cases:**
- If API returns templates without `category` (shouldn't happen, but defensive): templates would group under `undefined`. Not worth handling — backend always returns `category`.
- Modal height: 15 templates in 5 groups fits within existing modal scroll behavior. No CSS changes needed.
- The `esc()` call on category name handles any potential XSS from the category string (even though it's hardcoded backend data, keeping the pattern consistent).

**Verification:** Open New List modal → see 5 category headers with templates grouped underneath. Clicking any template creates the correct list.

---

### Task 3: Update existing tests

**File:** `tests/lists.test.js`  
**Lines:** 224–250 (the `GET /api/lists/templates` and `POST /api/lists/from-template` describe blocks)

**What to do:**

1. **Line 228** — The existing assertion `assert.ok(res.body.length >= 4)` already passes with 15 templates (uses `>=`). However, update to be precise:
   ```js
   assert.equal(res.body.length, 15);
   ```

2. **Add assertion for `category` field** inside the existing `'returns list templates'` test (after line 229):
   ```js
   assert.ok(res.body.every(t => typeof t.category === 'string' && t.category.length > 0));
   ```

3. **Add test for a new template** — after the existing `'creates list from travel template'` test (after line 246), add:
   ```js
   it('creates list from movies-to-watch template', async () => {
     const res = await agent().post('/api/lists/from-template')
       .send({ template_id: 'movies-to-watch' }).expect(201);
     assert.equal(res.body.name, 'Movies to Watch');
     assert.ok(res.body.items.length >= 10);
   });
   ```

4. **Existing tests that remain valid without changes:**
   - `'creates list from grocery template'` (line 234) — `weekly-groceries` still exists ✓
   - `'creates list from travel template'` (line 244) — `travel-packing` still exists ✓
   - `'rejects invalid template id'` (line 249) — `nope` is still invalid ✓

**Edge cases:**
- No other test files reference `LIST_TEMPLATES` or template count. Confirmed by grep — only `tests/lists.test.js` tests templates.

---

### Task 4: Update OpenAPI documentation

**File:** `docs/openapi.yaml`  
**Lines:** 1640–1660 (the `/api/lists/templates` GET response schema)

**What to do:**
1. Replace the untyped `items: type: object` schema with a properly typed schema that includes the `category` field:

```yaml
  /api/lists/templates:
    get:
      tags: [Lists]
      summary: Get list templates
      description: Returns all built-in list templates grouped by category
      responses:
        '200':
          description: Array of list templates
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  required: [id, name, type, icon, category, items]
                  properties:
                    id:
                      type: string
                      example: movies-to-watch
                    name:
                      type: string
                      example: Movies to Watch
                    type:
                      type: string
                      enum: [checklist, grocery]
                    icon:
                      type: string
                      example: "🎬"
                    category:
                      type: string
                      enum: [Home & Life, Entertainment & Media, Travel & Events, Personal, Health & Wellness]
                    items:
                      type: array
                      items:
                        type: string
```

---

## Implementation Order

```
Task 1 (backend)  →  Task 3 (tests)  →  Task 2 (frontend)  →  Task 4 (docs)
```

**Rationale:**
- Task 1 first: backend data drives everything else
- Task 3 second: verify backend changes pass before touching frontend
- Task 2 third: frontend consumes the new data shape
- Task 4 last: documentation reflects final state

Tasks 2 and 4 are independent of each other and could be done in parallel.

---

## Verification Checklist

- [ ] `npm test` — all existing list tests pass (no regressions)
- [ ] `GET /api/lists/templates` returns exactly 15 templates
- [ ] Every template has `id`, `name`, `type`, `icon`, `category`, `items` fields
- [ ] Existing template IDs (`weekly-groceries`, `travel-packing`, `moving-checklist`, `party-planning`) unchanged
- [ ] `POST /api/lists/from-template` works for a new template ID (e.g., `movies-to-watch`)
- [ ] `POST /api/lists/from-template` with invalid ID still returns 404
- [ ] Frontend New List modal shows 5 category headers with templates grouped
- [ ] Clicking a template in the modal creates the list and navigates to it
- [ ] Modal scrolls gracefully if viewport is short (no layout overflow)

---

## Files Changed Summary

| File | Change Type | Lines Affected |
|------|-------------|----------------|
| `src/routes/lists.js` | Edit | Lines 10–16 → expand to ~80 lines |
| `public/app.js` | Edit | Lines 4194 → ~12 lines of grouped rendering |
| `tests/lists.test.js` | Edit | Lines 228–229 + add ~8 lines |
| `docs/openapi.yaml` | Edit | Lines 1640–1660 → typed schema |

---

## Out of Scope

- No database schema changes
- No new API endpoints
- No new test files
- No CSS file changes
- No user-defined templates
- No CHANGELOG entry (add when shipping)
