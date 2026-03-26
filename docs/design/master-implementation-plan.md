---
status: Partially implemented
baseline: v0.0.13
---

# LifeFlow — Master Implementation Plan

> **Consolidated from:** Strategic Review (20 experts), Configurable Lists (11 experts), Implementation Roadmap (8 experts), QA Review (12 experts), Focus Design (12 experts)
> **Baseline:** v0.0.13 | 763 tests | 68 endpoints | 25+ views | All uncommitted
> **Target:** v0.1.0
> **Date:** 2026-03-24

---

## Pre-Condition: Git Commit (v0.0.12 + v0.0.13)

Before any new work, commit all pending changes:
```
Commit 1: v0.0.12 — Focus 3-panel (plan/timer/reflect), 9 focus endpoints, 2 new tables
Commit 2: v0.0.13 — Phase A configurable lists, area CRUD, QA fixes, sidebar toggle
```

---

## Phase 1 — v0.0.14: "Feel the Progress" (Engagement Polish)

**Why first:** Zero structural risk. Pure additive. Emotional reward is the #1 retention gap (PM2). Every expert panel identified the flat engagement loop as critical.

### Features (7 items)

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 1.1 | **Morning greeting** — "Good morning, Shyam. 5 tasks today" on My Day header. Time-aware (morning/afternoon/evening). | None | app.js: top of renderMyDay() | 3 |
| 1.2 | **Progress ring** — SVG circle showing % of today's tasks done. Live updates on task toggle. | None | app.js + styles.css: SVG component in My Day header | 3 |
| 1.3 | **Task completion animation** — Checkbox scale+pop (CSS), strikethrough fade. Mini confetti on every 5th task. | None | styles.css: @keyframes, app.js: counter | 2 |
| 1.4 | **"All done!" celebration** — When 0 tasks remain: show summary card (tasks done, focus minutes, habits completed). Buttons: "Plan Tomorrow" / "Relax 🎉" | None | app.js: renderMyDay() empty state | 2 |
| 1.5 | **Streak emoji tiers** — 🌱 (3-6d), 🔥 (7-13d), 🔥🔥 (14-29d), ⚡ (30+). Show total count: "Exercised 47 times" | None | app.js: habit rendering | 2 |
| 1.6 | **Link habits to life areas** — `area_id` on habits table. Picker in habit edit. Badge on area showing habit count. | DB: ALTER habits ADD area_id. Routes: modify GET/PUT habits | app.js: habit UI area picker | 5 |
| 1.7 | **Balance alert** — Toast when one area >60% of week's tasks. "Career 73% | Health 8%. Consider adding a Health task." Max once/day. | Routes: GET /api/stats/balance | app.js: toast on My Day load | 4 |

**DB Migration:** `ALTER TABLE habits ADD COLUMN area_id INTEGER;`
**New Endpoints:** GET /api/stats/balance
**Modified Endpoints:** GET /api/habits (include area), PUT /api/habits/:id (accept area_id)
**Test Target:** +21 → ~784 total

---

## Phase 2 — v0.0.15: "Find Everything" (Navigation + Weekly Review + Labels)

**Why second:** Navigation overload is the #1 UX problem (U4, C3, Things 3 comparison). Weekly Review is the #1 missing GTD feature (L1). Custom labels are settings-only changes with high personalization value.

### Features (10 items)

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 2.1 | **Sidebar restructure** — 7 primary items: Today, Tasks, Focus, Habits, Inbox, Review, More. Everything else in "More" expandable. | None | index.html: restructure nav, app.js: nav logic | 5 |
| 2.2 | **Tasks hub** — Single "Tasks" entry with List/Board/Calendar tab strip inside the view (replaces 3 separate sidebar items). | None | app.js: tab switching within tasks view | 4 |
| 2.3 | **Weekly Review UI** — 3-step guided flow: (1) Area check-in with completion bars, (2) Inbox + overdue triage, (3) Set priorities + rate week (1-5 stars). | New route: routes/weekly-review.js. Endpoints: GET current, POST save, GET history | app.js: full review flow render | 12 |
| 2.4 | **Custom status labels** — Settings → Task Defaults. Remap "To Do/In Progress/Done" display text. Internal DB stays todo/doing/done. | Settings key: statusLabels | app.js: settings UI + board/task rendering reads from settings | 4 |
| 2.5 | **Custom priority labels** — Settings → Task Defaults. Remap "None/Normal/High/Critical" + colors. | Settings keys: priorityLabels, priorityColors | app.js: settings UI + priority rendering | 4 |
| 2.6 | **Grocery category editor** — Settings → Lists. Ordered list with add/rename/reorder/delete. | Already have GET /api/lists/categories/configured | app.js: settings tab UI for categories | 3 |
| 2.7 | **Smart filter thresholds** — Settings → Advanced. Stale: 3/5/7/14/30 days. Quick win: 5/10/15/30/60 min. | Settings keys: smartFilterStale, smartFilterQuickWin. Modify filter queries. | app.js: settings UI | 3 |
| 2.8 | **Sidebar section collapse persist** — All sections (Areas, Plan, Filters, Lists) remember open/closed state via localStorage. | None | Already implemented (sb-toggle system) — verify all sections | 1 |
| 2.9 | **Sidebar customization** — Drag items between primary/secondary. Persist layout to settings. | Settings key: sidebarLayout | app.js: drag-drop nav items | 4 |
| 2.10 | **Extract store.js** — Lightweight state store for settings cache, current view state. Custom events for reactivity. | None | New: public/store.js. Refactor app.js to use it. | 2 |

**New Route File:** `src/routes/weekly-review.js`
**New Endpoints:** GET /api/weekly-review/current, POST /api/weekly-review, GET /api/weekly-review/history, GET /api/stats/balance (if not done in Phase 1)
**Settings Keys:** statusLabels, priorityLabels, priorityColors, smartFilterStale, smartFilterQuickWin, sidebarLayout, sidebarCollapsed
**Test Target:** +42 → ~826 total

---

## Phase 3 — v0.0.16: "Make It Yours" (Recurring + Onboarding + Templates)

**Why third:** Recurring tasks is table-stakes (every competitor has it). Onboarding needs the navigation restructure (Phase 2) to be in place. Templates build on the custom labels system.

### Features (8 items)

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 3.1 | **Recurring task engine** — On My Day load: check recurring tasks, generate instances for today. Patterns: daily, weekdays, weekly (day), bi-weekly, monthly (date), yearly, custom (every N days), custom (specific days). End conditions: never, after N times, after date. | Modify routes/tasks.js: generation logic. Add last_recurrence_date. Recurring field: string or JSON. | app.js: "repeats" picker in task edit. Pattern builder modal. | 12 |
| 3.2 | **3-step onboarding flow** — Step 1: Persona pick (Student/Professional/Freelancer/Parent/General). Step 2: Customize areas (pre-filled from persona). Step 3: Create first goal + 3 tasks. Skip option. | Settings keys: onboardingComplete, userPersona. Persona presets for areas/tags/templates. | New: components/onboarding.js. Shown on first launch. | 6 |
| 3.3 | **Custom template CRUD** — Create from goal or list ("Save as Template"). Edit name/icon/items. Delete user-created. Built-in templates immutable but hideable. | New: routes/templates.js. POST create, PUT edit, DELETE (user_created only). POST /api/goals/:id/save-as-template. POST /api/lists/:id/save-as-template. | app.js: settings template manager + goal/list overflow menus. | 8 |
| 3.4 | **Emoji picker** — Reusable floating panel. Categories: productivity shortcuts row, smileys, objects, symbols. Search. Recent. ~300 curated emoji. | None | New: components/emoji-picker.js. Used by areas, lists, goals. | 3 |
| 3.5 | **Default view per area** — Each area can set preferred view (List/Board/Calendar). Falls back to global default. | DB: ALTER life_areas ADD default_view TEXT | app.js: area navigation respects default_view. Settings per-area. | 3 |
| 3.6 | **Template source_type** — Distinguish task templates from list templates. | DB: ALTER task_templates ADD source_type TEXT DEFAULT 'task' | — | 1 |
| 3.7 | **Tag management panel** — Settings → Tags. List all with color, usage count. Inline rename, color picker, sort, search, delete with "used in X tasks" warning. | None (API exists) | app.js: settings tag panel | 4 |
| 3.8 | **Improved tag creation** — Create tags inline from task detail panel (type name + pick color). | None (POST /api/tags exists) | app.js: task detail tag section enhancement | 2 |

**DB Migrations:**
```sql
ALTER TABLE life_areas ADD COLUMN default_view TEXT;
ALTER TABLE task_templates ADD COLUMN source_type TEXT DEFAULT 'task';
```
**New Route File:** `src/routes/templates.js`
**New Endpoints:** POST /api/templates, PUT /api/templates/:id, DELETE /api/templates/:id, POST /api/goals/:id/save-as-template, POST /api/lists/:id/save-as-template
**Test Target:** +39 → ~865 total

---

## Phase 4 — v0.0.17: "Everyone Welcome" (Mobile + Accessibility + Demo)

**Why fourth:** Accessibility is non-negotiable before public launch (U2). Mobile bottom bar needs the Phase 2 nav restructure. Demo mode needs all features to be feature-complete.

### Features (10 items)

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 4.1 | **Mobile bottom tab bar** — 5 items: Today, Tasks, Focus, Habits, More. CSS @media (max-width: 768px). Hides sidebar, shows bottom nav. | None | styles.css: bottom bar, app.js: mobile nav switching | 3 |
| 4.2 | **Responsive sidebar** — Auto-hide on mobile. Hamburger menu to toggle. | None | styles.css + app.js | 2 |
| 4.3 | **ARIA labels** — All icon-only buttons get aria-label. All material-icons-round buttons. | None | index.html + app.js: add aria-label attributes | 3 |
| 4.4 | **Focus trapping in modals** — Tab cycle trapped within open modals. Escape closes. | None | app.js: focus trap utility | 2 |
| 4.5 | **Keyboard-accessible context menus** — Arrow keys navigate, Enter selects, Escape closes. role="menu" on ctx-menu. | None | app.js: context menu keyboard handler | 3 |
| 4.6 | **Skip-to-content link** — Hidden, visible on focus. Before sidebar. | None | index.html: skip link | 1 |
| 4.7 | **prefers-reduced-motion** — Wrap all CSS animations in @media query. | None | styles.css | 1 |
| 4.8 | **Color contrast audit** — Verify WCAG AA across all 8 themes. Fix failures. | None | styles.css: theme color adjustments | 2 |
| 4.9 | **Demo mode** — Pre-filled with sample data (3 areas, 5 goals, 20 tasks, 3 habits, 2 lists). Reset on exit. "Try LifeFlow" button. | New: routes/demo.js. Seed sample data. Clear on exit. | app.js: demo banner + exit button | 5 |
| 4.10 | **Touch gestures** — Swipe-right on sidebar items for quick actions. Long-press for context menu on mobile. | None | app.js: touch event handlers | 2 |

**New Route File:** `src/routes/demo.js`
**New Endpoints:** POST /api/demo/start, POST /api/demo/reset
**Test Target:** +24 → ~889 total

---

## Phase 5 — v0.0.18: "Advanced Power" (Custom Recurring + Shortcuts + Polish)

**Why fifth:** Advanced features for power users. Not blockers for launch but increase depth.

### Features (5 items)

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 5.1 | **Custom recurring patterns** — "Every 3 days", "1st and 15th of month", "Mon/Wed/Fri". JSON in recurring field. | Extend task engine from Phase 3 | app.js: advanced pattern builder | 6 |
| 5.2 | **Keyboard shortcut rebinding** — Settings → Shortcuts. List all actions with current binding. Click → press new combo → save. Conflict detection. | Settings key: keyboardShortcuts | app.js: settings shortcuts panel + rebind logic | 4 |
| 5.3 | **Shareable weekly summary card** — Generate image (canvas → PNG) of week's achievements. Share button exports or copies. | None (client-side canvas) | app.js: canvas rendering, share button | 3 |
| 5.4 | **Shareable focus card** — "I focused for 45 minutes on Health" image export after focus session. | None (client-side canvas) | app.js: focus completion share option | 2 |
| 5.5 | **Achievement badges** — First 10 tasks, first focus session, 7-day streak, 30-day streak, 100 tasks, all areas active. Badge gallery in settings. | DB: badges table (id, type, earned_at). Check triggers on task/habit/focus completion. | app.js: badge gallery + notification toast on earn | 6 |

**DB Migration:** `CREATE TABLE badges (id INTEGER PRIMARY KEY, type TEXT, earned_at DATETIME DEFAULT CURRENT_TIMESTAMP);`
**Test Target:** +21 → ~910 total

---

## Phase 6 — v0.1.0: "Hello World" (Launch)

**Why last:** Landing page and marketing need a feature-complete app to showcase.

### Features (6 items)

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 6.1 | **Landing page** — Static HTML/CSS. Hero, feature sections, screenshots, download/install instructions. | None | New: public/landing.html + landing.css | 2 |
| 6.2 | **User-facing changelog** — View accessible from Help. Shows version history with highlights. | None | app.js: changelog view reading from JSON/MD | 1 |
| 6.3 | **Bug bash** — Full regression pass. All panels re-review. | — | — | +10 |
| 6.4 | **Performance audit** — Profile all API endpoints. Optimize slow queries. Add indexes if needed. | Possible index additions | — | 3 |
| 6.5 | **Documentation** — User guide, getting started, keyboard shortcuts reference. | None | Static docs | 0 |
| 6.6 | **Version 0.1.0 polish** — Icon, favicon, meta tags, PWA manifest update, screenshots. | None | public/manifest.json, index.html meta | 0 |

**Test Target:** +16 → ~926 total

---

## Summary Table

| Phase | Version | Theme | Features | New Endpoints | DB Changes | New Tests | Cumulative |
|-------|---------|-------|----------|---------------|------------|-----------|------------|
| **0** | — | Git Commit | Commit v0.0.12 + v0.0.13 | — | — | — | 763 |
| **1** | v0.0.14 | Feel the Progress | 7 | 1 new + 2 mod | 1 ALTER | +21 | 784 |
| **2** | v0.0.15 | Find Everything | 10 | 4 new | 0 (settings) | +42 | 826 |
| **3** | v0.0.16 | Make It Yours | 8 | 5 new | 2 ALTER | +39 | 865 |
| **4** | v0.0.17 | Everyone Welcome | 10 | 2 new | 0 | +24 | 889 |
| **5** | v0.0.18 | Advanced Power | 5 | 0 | 1 CREATE | +21 | 910 |
| **6** | v0.1.0 | Hello World | 6 | 0 | 0 | +16 | 926 |
| | | **TOTAL** | **46 features** | **12 new + 2 mod** | **4 migrations** | **+163** | **926** |

---

## Dependency Graph

```
Phase 0: Git Commit ─────────────────────────────────────────────┐
                                                                   │
Phase 1: Engagement (v0.0.14) ──── no dependencies ──────────────┤
    │                                                              │
    ├── balance alert → feeds into Weekly Review (Phase 2)        │
    └── habits area_id → used in balance calculations              │
                                                                   │
Phase 2: Navigation + Review (v0.0.15) ─── depends on Phase 1 ──┤
    │                                                              │
    ├── nav restructure → needed for onboarding (Phase 3)         │
    ├── settings labels → used by onboarding persona presets       │
    └── store.js → used by all subsequent phases                   │
                                                                   │
Phase 3: Recurring + Onboarding (v0.0.16) ─── depends on Phase 2─┤
    │                                                              │
    ├── recurring engine → must exist before onboarding can demo   │
    ├── emoji picker → used by template editor, area editor        │
    └── templates → enrich onboarding with persona templates       │
                                                                   │
Phase 4: Mobile + A11y (v0.0.17) ── depends on Phase 2 nav ──────┤
    │                                                              │
    ├── bottom bar mirrors Phase 2 primary nav structure           │
    ├── demo mode needs feature-complete app                       │
    └── can start a11y fixes in parallel from Phase 2 onwards     │
                                                                   │
Phase 5: Advanced (v0.0.18) ──── depends on Phase 3 recurring ───┤
    │                                                              │
    └── shareable cards need weekly review + focus to exist         │
                                                                   │
Phase 6: Launch (v0.1.0) ──── depends on ALL above ───────────────┘
```

---

## What's NOT Included (Intentionally Deferred)

| Feature | Why Deferred | Possible Version |
|---------|-------------|-----------------|
| Collaboration / team sharing | Solo-first strategy. Requires auth, cloud sync, major architecture change. | v1.0 |
| Natural language task input ("Buy milk tomorrow") | High complexity, needs NLP library. Not core to life management. | v0.2.0 |
| Custom list types (wishlist, reading list) | Requires schema redesign. Current 3 types (checklist, grocery, notes) sufficient. | v0.3.0 |
| Area-scoped tags | Complex UX. Global tags work fine for solo users. | v0.2.0 |
| Custom intermediate statuses (5+ columns) | Display labels (Phase 2) cover 90% of use cases. Full custom statuses = Kanban framework. | v0.5.0 |
| Cloud sync / backup | SQLite is local-first by design. Could add optional file-based backup. | v0.2.0 |
| Template sharing / marketplace | Needs community infrastructure. | v1.0 |
| Enterprise / team pricing | Solo product for foreseeable future. | v1.0+ |

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| app.js exceeds 5000 lines | High | Extract components starting Phase 1. New features go in separate files. |
| Recurring tasks create duplicates | Medium | Idempotent generation with last_recurrence_date + daily check. |
| Navigation restructure breaks muscle memory | Medium | "Classic layout" option in settings. Gradual migration. |
| Phase 2 scope creep (10 features) | High | Ship nav + weekly review first as v0.0.15a. Labels as v0.0.15b. |
| Onboarding skipped by most users | Medium | Make it < 60 seconds. Show immediate value. Allow skip. |

---

## Implementation Order Within Each Phase

### Phase 1 Recommended Order:
1. habits area_id migration + API (backend first)
2. Morning greeting + progress ring (visible impact)
3. Streak emoji tiers (quick win)
4. Task completion animation (CSS + minimal JS)
5. "All done!" celebration (builds on progress tracking)
6. Balance alert (needs habit-area link from step 1)
7. Tests for all

### Phase 2 Recommended Order:
1. store.js extraction (foundation for everything)
2. Sidebar restructure (biggest UX impact)
3. Tasks hub with tab strip (reduces sidebar items)
4. Weekly Review UI (biggest feature value)
5. Custom status labels (quick settings addition)
6. Custom priority labels (same pattern as status)
7. Grocery category editor (same pattern)
8. Smart filter thresholds (same pattern)
9. Sidebar section collapse persist (verify existing)
10. Sidebar customization (nice-to-have, can defer)

### Phase 3 Recommended Order:
1. Recurring task engine (most complex, start early)
2. Emoji picker component (needed by templates and onboarding)
3. Custom template CRUD + save-as-template
4. Tag management panel
5. 3-step onboarding flow (needs recurring + templates to be complete)
6. Default view per area
7. Tag creation enhancement
8. Tests for all

---

*Consolidated from 5 expert panel reviews (63 experts total)*
*Date: 2026-03-24 | Baseline: v0.0.13 | Target: v0.1.0*
