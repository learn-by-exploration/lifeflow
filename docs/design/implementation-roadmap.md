---
status: Partially implemented
baseline: v0.0.13
---

# LifeFlow Implementation Roadmap — 8-Expert Panel

> **Panel:** 3 Product Managers + 2 Architects + 3 UI/UX Designers
> **Baseline:** v0.0.13 (Phase A complete, 775 tests, 68 endpoints, 25+ views)
> **Inputs:** Strategic Review (20 experts), Configurable Lists (11 experts), QA Review
> **Output:** Versioned sprint plan from v0.0.14 through v1.0

---

## Panel Members

### Product Managers (PM1–PM3)
- **PM1 — Arjun Mehta** — Core product strategy, user journey, feature prioritization
- **PM2 — Claire Dupont** — Growth & retention, engagement metrics, onboarding funnels
- **PM3 — Nina Okonkwo** — Competitive positioning, monetization, v1.0 launch readiness

### Architects (A1–A2)
- **A1 — Tomás Reyes** — Backend architecture, database design, API contracts, performance
- **A2 — Ingrid Strand** — Frontend architecture, component design, state management, offline-first

### UI/UX Designers (UX1–UX3)
- **UX1 — Yuki Tanaka** — Information architecture, navigation, progressive disclosure
- **UX2 — Sasha Voronov** — Interaction design, micro-animations, engagement loops
- **UX3 — Lena Fischer** — Mobile UX, accessibility, design system consistency

---

## 1. CURRENT STATE ASSESSMENT

### What's Done (v0.0.13 — Phase A ✅)
| Feature | Status | Tests |
|---------|--------|-------|
| Life area CRUD (create, edit, rename) | ✅ | 6 |
| Life area archive/unarchive | ✅ | 6 |
| Life area reorder (bulk positions) | ✅ | 7 |
| Life area name validation (100 char) | ✅ | 3 |
| List duplicate (deep copy + items) | ✅ | 9 |
| List uncheck-all | ✅ | 3 |
| Configurable grocery categories (API) | ✅ | 3 |
| Settings → Life Areas tab | ✅ | — |
| Sidebar context menus (areas + lists) | ✅ | — |
| Focus 3-panel (plan/timer/reflect) | ✅ | 21 |
| QA bug fixes (4 issues) | ✅ | 9 |

### What's Queued (from Strategic Review + Configurable Lists roadmap)
| # | Feature | Source | Effort | Impact |
|---|---------|--------|--------|--------|
| 1 | Navigation restructure (7±2 items) | U4, C3 | Medium | Critical |
| 2 | Onboarding flow (3-step) | U4, M1, L2 | Medium | Critical |
| 3 | Weekly Review UI | L1 | Medium | Very High |
| 4 | Recurring tasks logic | C1 | Medium | Very High |
| 5 | Daily greeting + progress ring | U3, L4 | Low | High |
| 6 | Custom status labels | PM1-2 | Low | High |
| 7 | Custom priority labels | PM1-3 | Low | Medium |
| 8 | Custom templates CRUD | PM2-2 | Medium | High |
| 9 | Smart filter config | PM3-2 | Low | Medium |
| 10 | Emoji picker component | UX2-4 | Medium | Medium |
| 11 | Shareable summary card | M2, S3 | Medium | High |
| 12 | Task completion celebration | U3 | Low | High |
| 13 | Link habits to life areas | L3, L2 | Low | High |
| 14 | Balance alert (burnout) | L4 | Low | Medium |
| 15 | Mobile bottom tab bar | U1 | Medium | High |
| 16 | Accessibility fixes (ARIA, keyboard) | U2 | Medium | Medium |
| 17 | Demo mode | M2, S1 | Medium | High |
| 18 | Landing page | M1, M3 | High | Critical |

---

## 2. PRODUCT MANAGER ANALYSIS

### PM1 — Arjun Mehta (Core Product Strategy)

**Thesis:** LifeFlow has built 80% of features but only 20% of the experience. The next phase is NOT more features — it's making existing features feel polished, discoverable, and emotionally rewarding.

**Prioritization Framework — ICE Score:**

| Feature | Impact (1-10) | Confidence (1-10) | Ease (1-10) | ICE Score | Sprint |
|---------|--------------|-------------------|-------------|-----------|--------|
| Daily greeting + progress ring | 8 | 9 | 9 | 648 | v0.0.14 |
| Task completion celebration | 7 | 8 | 9 | 504 | v0.0.14 |
| Streak 🔥 emoji + total wins | 7 | 8 | 9 | 504 | v0.0.14 |
| "All done" celebration screen | 7 | 8 | 9 | 504 | v0.0.14 |
| Link habits to life areas | 8 | 9 | 8 | 576 | v0.0.14 |
| Balance alert | 6 | 7 | 8 | 336 | v0.0.14 |
| Navigation restructure | 10 | 9 | 5 | 450 | v0.0.15 |
| Weekly Review UI | 9 | 9 | 5 | 405 | v0.0.15 |
| Custom status labels | 6 | 8 | 8 | 384 | v0.0.15 |
| Custom priority labels | 5 | 8 | 8 | 320 | v0.0.15 |
| Custom grocery categories (UI) | 5 | 8 | 8 | 320 | v0.0.15 |
| Smart filter thresholds | 5 | 7 | 8 | 280 | v0.0.15 |
| Recurring tasks | 9 | 8 | 4 | 288 | v0.0.16 |
| Onboarding flow | 9 | 8 | 4 | 288 | v0.0.16 |
| Custom templates | 7 | 7 | 5 | 245 | v0.0.16 |
| Mobile bottom tab | 8 | 7 | 4 | 224 | v0.0.17 |
| Accessibility | 7 | 9 | 4 | 252 | v0.0.17 |
| Demo mode | 7 | 7 | 4 | 196 | v0.0.17 |
| Landing page | 9 | 7 | 3 | 189 | v1.0 |
| Shareable cards | 6 | 6 | 5 | 180 | v1.0 |

**PM1 Verdict:** Ship emotional polish (v0.0.14) → structural improvements (v0.0.15) → power features (v0.0.16) → mobile/accessibility (v0.0.17) → launch prep (v1.0).

---

### PM2 — Claire Dupont (Growth & Retention)

**Retention Analysis:**

Current engagement loop is **FLAT**: Open → See tasks → Do tasks → Close. No reward, no surprise, no progress visibility. Users complete tasks but don't *feel* progress.

**The Dopamine Gap:**
```
Current:  [Open] → [Task list] → [Check box] → [Nothing] → [Close]
Target:   [Open] → [Greeting + progress] → [Check box] → [Animation + streak update] 
          → [Last task done → Celebration] → [Share?] → [Come back tomorrow]
```

**Day-1 Retention Drivers (v0.0.14 must-haves):**
1. **Morning greeting** — Personalized, shows task count + habits due. Emotional hook.
2. **Progress ring** — Visual "67% done" on My Day. Creates completion drive.
3. **Micro-celebration** — Confetti burst or checkmark animation on task complete. Dopamine.
4. **Streak visibility** — 🔥 emoji + "12-day streak" on habits. Loss aversion.
5. **"All done!"** — When My Day is empty, show celebration + daily summary. Closure.

**Day-7 Retention Drivers (v0.0.15):**
1. **Weekly Review** — GTD backbone. Users who do weekly reviews stay 3x longer (industry data).
2. **Balance alerts** — "You did 0 Health tasks this week" — re-engages dormant areas.
3. **Navigation cleanup** — Reduce cognitive load. Users who can't find things churn.

**Day-30 Retention Drivers (v0.0.16):**
1. **Recurring tasks** — Without recurrence, users manually recreate tasks weekly. This is churn friction.
2. **Onboarding** — First-time users who set up areas + first goal in session 1 retain 4x better.
3. **Custom templates** — "Save as template" turns one-time effort into reusable value.

**PM2 Verdict:** Sequence features by retention timeline: Day-1 hooks → Day-7 loops → Day-30 depth.

---

### PM3 — Nina Okonkwo (Competitive Positioning & Launch)

**Competitive Gap Closure Map:**

| Feature | Todoist | Things 3 | TickTick | LifeFlow Now | After Roadmap |
|---------|---------|----------|----------|--------------|---------------|
| Recurring tasks | ✅ NLP | ✅ Picker | ✅ NLP | ❌ | ✅ (v0.0.16) |
| Onboarding | ✅ | ✅ | ✅ | ❌ | ✅ (v0.0.16) |
| Focus timer | ❌ | ❌ | ✅ Basic | ✅ **Best** | ✅ **Best** |
| Habits | ❌ | ❌ | ✅ Basic | ✅ **Best** | ✅ **Best** |
| Life Areas | ❌ | ✅ Areas | ❌ | ✅ **Best** | ✅ **Best** |
| Weekly Review | ❌ | ❌ | ❌ | 🟡 | ✅ (v0.0.15) |
| Gamification | ❌ | ❌ | ✅ Basic | ❌ | ✅ (v0.0.14) |
| Mobile nav | ✅ | ✅ | ✅ | ❌ | ✅ (v0.0.17) |

**v1.0 Launch Checklist (Required):**
- [ ] Navigation restructure (currently #1 UX problem)
- [ ] Onboarding flow (can't launch without it)
- [ ] Recurring tasks (table-stakes feature)
- [ ] Weekly Review UI (biggest GTD differentiator)
- [ ] Demo mode (try before install)
- [ ] Landing page (how people find us)
- [ ] 6 "Ship This Week" emotional polish items

**Positioning Strategy for Launch:**
> "LifeFlow — the only productivity app that cares about your whole life. Focus, habits, goals, and tasks — organized by what matters to you. Local-first. No subscription. No cloud lock-in."

**PM3 Verdict:** v0.0.14-v0.0.17 closes ALL competitive gaps except collaboration (intentionally deferred). v1.0 is a credible public launch.

---

## 3. ARCHITECT ANALYSIS

### A1 — Tomás Reyes (Backend Architecture)

#### Database Changes Per Version

**v0.0.14 — Engagement Polish**
```sql
-- Link habits to life areas
ALTER TABLE habits ADD COLUMN area_id INTEGER REFERENCES life_areas(id) ON DELETE SET NULL;

-- No other schema changes — v0.0.14 is frontend + settings-driven
```

**v0.0.15 — Structural Improvements**
```sql
-- Weekly review completion tracking (table already exists)
-- Verify weekly_reviews schema is sufficient:
--   id, week_start, week_end, areas_reviewed, inbox_cleared,
--   priorities_set, rating, notes, created_at

-- Custom labels stored in settings table (key-value, no schema change)
-- Keys: statusLabels, priorityLabels, priorityColors, 
--        groceryCategories, smartFilterStale, smartFilterQuickWin

-- Navigation preferences
-- Key: sidebarLayout (JSON: {primary: [...ids], secondary: [...ids]})
-- Key: sidebarCollapsed (JSON: {areas: false, lists: true, ...})
```

**v0.0.16 — Power Features**
```sql
-- Custom recurring task patterns
-- Extend existing recurring field from simple enum to JSON:
-- Old: "daily", "weekly", "monthly"  
-- New: {"type":"custom","every":3,"unit":"day"} or {"type":"custom","days":["mon","wed","fri"]}
-- Backward compatible: string values still work, JSON adds custom patterns
-- No schema change — recurring is already TEXT

-- User-created templates (migration already added in Phase A)
-- task_templates.user_created already exists
-- Add source_type for list templates:
ALTER TABLE task_templates ADD COLUMN source_type TEXT DEFAULT 'task';

-- Onboarding state
-- Key in settings: onboardingComplete (boolean)
-- Key in settings: userPersona (string: student/professional/freelancer/parent/general)
```

**v0.0.17 — Mobile & Accessibility**
```sql
-- No schema changes needed — pure frontend work
```

#### API Contracts — New Endpoints by Version

**v0.0.14 — 2 new endpoints**
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/habits` | — | Add `area_id` + area name to each habit |
| PUT | `/api/habits/:id` | `{area_id}` | Update habit's area link |

> Note: GET/PUT habits already exist. Only adding `area_id` field handling. No new route files needed.

**v0.0.15 — 5 new endpoints**
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/weekly-review/current` | — | `{week_start, areas: [{name,task_count,done_count}], inbox_count, overdue_count}` |
| POST | `/api/weekly-review` | `{rating, notes, priorities_json}` | `{id, created_at}` |
| GET | `/api/weekly-review/history` | `?limit=10` | `[{id, week_start, rating, summary}]` |
| GET | `/api/stats/balance` | — | `{areas: [{name, tasks_completed_7d, pct}], alert: "Career dominating"}` |
| GET | `/api/lists/categories/configured` | — | Already exists (Phase A) — just ensure settings read |

**v0.0.16 — 5 new endpoints**
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/templates` | `{name, icon, tasks_json, source_type}` | `{id}` |
| PUT | `/api/templates/:id` | `{name, icon, tasks_json}` | `{updated: true}` |
| DELETE | `/api/templates/:id` | — | `{deleted: true}` (only user_created=1) |
| POST | `/api/goals/:id/save-as-template` | `{name, icon}` | `{template_id}` |
| POST | `/api/lists/:id/save-as-template` | `{name, icon}` | `{template_id}` |

#### Performance Considerations

**A1-P1: Settings Cache**
Currently, every settings read queries the DB. With 8+ new settings keys being read on multiple views:
- Cache settings in-memory on server start and after each write
- Invalidate on PUT `/api/settings` → re-read all keys
- Negligible memory cost (< 1KB), saves ~2ms per request

**A1-P2: Weekly Review Query**
The "current week" review needs to aggregate task completions across all areas for the past 7 days. This MUST use a single query with JOINs, not N+1 per-area queries:
```sql
SELECT a.id, a.name, a.icon, a.color,
       COUNT(t.id) as total_tasks,
       SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_tasks
FROM life_areas a
LEFT JOIN goals g ON g.area_id = a.id
LEFT JOIN tasks t ON t.goal_id = g.id 
  AND t.updated_at >= date('now', '-7 days')
WHERE a.archived = 0
GROUP BY a.id
ORDER BY a.position;
```

**A1-P3: Recurring Task Engine**
Recurring task creation should run as a scheduled check (not on every request):
- On app start: check for "due today" recurring patterns, create instances
- On My Day load: check again (lazy evaluation)
- Store `last_generated_date` on each recurring template to avoid duplicates
- Use SQLite `date()` functions for pattern matching

#### Migration Strategy

All migrations use the existing pattern in `src/db/index.js`:
```javascript
// Each migration wrapped in try/catch to be idempotent
try { db.exec('ALTER TABLE habits ADD COLUMN area_id INTEGER'); } catch(e) {}
```
- Run on every server start (existing pattern)
- No data loss on any migration (all ADD COLUMN with defaults)
- Backward compatible: old data works with new schema

---

### A2 — Ingrid Strand (Frontend Architecture)

#### Component Architecture

**Current State Issues:**
- `app.js` is ~4,000+ lines — approaching maintainability limit
- State scattered across global variables (`_editAreaId`, `_currentView`, etc.)
- No component reuse (color pickers, context menus duplicated)

**Proposed Extraction (incremental, NOT a rewrite):**

Phase 1 (v0.0.14): Extract reusable utilities
```
public/
├── app.js            (main orchestrator — remains)
├── components/
│   ├── greeting.js   (morning greeting + progress ring)
│   ├── celebrate.js  (confetti/animation on completion)
│   └── toast.js      (notification toasts — already inline, extract)
```

Phase 2 (v0.0.15): Extract feature modules
```
├── components/
│   ├── weekly-review.js  (review flow — new feature)
│   ├── nav-manager.js    (sidebar restructure logic)
│   ├── settings-labels.js (status/priority label config)
│   └── emoji-picker.js   (reusable picker — prep for v0.0.16)
```

Phase 3 (v0.0.16): Extract complex features
```
├── components/
│   ├── onboarding.js  (3-step flow)
│   ├── recurring.js   (pattern builder UI)
│   └── templates.js   (template CRUD UI)
```

**Loading Strategy:** Each component file exports a single `init()` function called from `app.js`. Uses vanilla JS (no framework). Components communicate via custom DOM events:
```javascript
// components/celebrate.js
export function init() {
  document.addEventListener('task-completed', (e) => {
    showCelebration(e.detail);
  });
}

// In app.js, after task toggle:
document.dispatchEvent(new CustomEvent('task-completed', { detail: { count: remaining } }));
```

**A2 Decision: No framework migration.** Vanilla JS is working. Adding React/Vue for a solo-developer local app would be over-engineering. Keep extracting into ES modules loaded via `<script type="module">`.

#### State Management

**Current:** Global variables in app.js (`_currentView`, `_tasks`, `_areas`, etc.)

**Proposed:** Create a lightweight state store (no library):
```javascript
// public/store.js
const state = { settings: {}, currentView: null, areas: [], ... };
const listeners = new Map();
export function get(key) { return state[key]; }
export function set(key, value) { state[key] = value; listeners.get(key)?.forEach(fn => fn(value)); }
export function on(key, fn) { if (!listeners.has(key)) listeners.set(key, []); listeners.get(key).push(fn); }
```

**Timing:** Introduce with v0.0.15 navigation restructure (natural refactor point).

#### Offline / Performance

- All data is local (SQLite) — offline by default
- Settings should be cached client-side after first load (localStorage mirror)
- Animations use CSS `@keyframes` + `will-change` — no JS animation libraries
- Emoji picker: prebuilt static JSON array (~20KB), lazy-loaded on first open

---

## 4. UI/UX ANALYSIS

### UX1 — Yuki Tanaka (Navigation & Information Architecture)

#### Navigation Restructure Plan (v0.0.15)

**Current sidebar (15+ items):**
```
My Day | All Tasks | Board | Calendar | Overdue | Upcoming | Matrix |
Dashboard | Weekly Plan | Day Planner | Activity | Focus History |
Habits | Reports | Inbox | [Areas...] | [Lists...]
```

**Proposed 2-tier sidebar:**
```
PRIMARY (always visible, 7 items):
┌─────────────────────────┐
│ 🌅  Today               │  ← My Day (renamed for warmth)
│ ✅  Tasks         [12]  │  ← All Tasks (default), sub-nav: Board, Calendar
│ 🎯  Focus               │  ← Focus timer + history
│ 🔄  Habits        [3]   │  ← Habit tracker
│ 📥  Inbox         [5]   │  ← Quick capture
│ 📊  Review               │  ← Weekly Review (NEW, promoted)
│ ⚙️  More                 │  ← Expands secondary nav
└─────────────────────────┘

SECONDARY (inside "More", or collapsed sections):
┌─────────────────────────┐
│ VIEWS                    │
│   Matrix                 │
│   Dashboard              │
│   Reports                │
│   Activity               │
│ PLANNING                 │
│   Weekly Plan            │
│   Day Planner            │
│   Upcoming               │
│   Overdue          [3]   │
│ AREAS                    │
│   💪 Health              │
│   💼 Career              │
│   ...                    │
│ LISTS                    │
│   🛒 Groceries           │
│   ...                    │
└─────────────────────────┘
```

**Key Decisions:**
- "Today" replaces "My Day" — warmer, universally understood
- "Tasks" is a hub with sub-navigation (List/Board/Calendar toggle inside the view)
- "Review" gets promoted to primary — it's the GTD cornerstone
- Areas and Lists move to secondary (reachable in 1 tap via "More")
- Badge counts only on items that warrant attention (Inbox, Overdue, Tasks)
- User can drag items between primary/secondary (customizable order)

#### Tasks Hub (Sub-Navigation Inside View)

Instead of 3 separate sidebar entries (All Tasks, Board, Calendar):
```
┌──────────────────────────────────────────────┐
│  Tasks                    [List] [Board] [Cal]│
│  ─────────────────────────────────────────── │
│  Filter: [Area ▾] [Priority ▾] [Status ▾]   │
│                                               │
│  (Task list / Board / Calendar based on tab) │
└──────────────────────────────────────────────┘
```

This reduces 3 sidebar items to 1, with a tab strip inside the view. Same for Focus (Timer/History as tabs).

---

### UX2 — Sasha Voronov (Engagement & Micro-Interactions)

#### Morning Greeting (v0.0.14)

```
┌──────────────────────────────────────────────────────┐
│                                                       │
│   Good morning, Shyam. ☀️                            │
│                                                       │
│   ┌──────────┐  5 tasks today                        │
│   │   ╭──╮   │  2 habits due                         │
│   │   │67│%  │  1 overdue from yesterday              │
│   │   ╰──╯   │                                       │
│   └──────────┘  "Small steps, big life."              │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Elements:**
- **Time-aware greeting:** "Good morning" / "Good afternoon" / "Good evening" based on hour
- **Progress ring:** SVG circle showing % of today's tasks done. Updates live.
- **Stats row:** Tasks remaining, habits due, overdue count
- **Daily quote/mantra:** Rotating from curated list of ~50 calm productivity quotes
- **Placement:** Top of My Day view, collapses to compact bar once user scrolls

#### Task Completion Animation (v0.0.14)

**On single task complete:**
- Checkbox fills with smooth scale animation (200ms ease-out)
- Task text gets strikethrough with fade (300ms)
- Subtle "pop" haptic on mobile (if supported)

**On milestone completion (every 5th task):**
- Mini confetti burst (8-12 particles, CSS-only, 800ms)
- Toast: "5 down! Keep going 💪"

**On "All done!" (0 tasks remaining):**
```
┌──────────────────────────────────────────┐
│                                           │
│           🎉                              │
│                                           │
│     All done for today!                   │
│                                           │
│     You completed 8 tasks                 │
│     Focused for 45 minutes                │
│     3 habits maintained                   │
│                                           │
│   ┌──────────────┐  ┌──────────────────┐ │
│   │  Plan Tomorrow │  │  Share Summary  │ │
│   └──────────────┘  └──────────────────┘ │
│                                           │
└──────────────────────────────────────────┘
```

#### Streak Enhancements (v0.0.14)

| Streak Length | Display | Visual |
|--------------|---------|--------|
| 0 days | — | No indicator |
| 1-2 days | "2 days" | Plain text |
| 3-6 days | "5 days 🌱" | Seedling emoji |
| 7-13 days | "10 days 🔥" | Fire emoji |
| 14-29 days | "21 days 🔥🔥" | Double fire |
| 30+ days | "45 days ⚡" | Lightning bolt |

Also show **total count:** "Exercised 47 times this year" — cumulative wins feel massive.

#### Balance Alert (v0.0.14)

Trigger: When one area has >60% of completed tasks in the last 7 days.
```
┌──────────────────────────────────────────┐
│  ⚖️  Balance Check                   ✕  │
│                                           │
│  This week: Career 73% | Health 8%       │
│  Consider adding a Health task today.     │
│                                           │
│  [Dismiss]  [Show Health Tasks →]         │
└──────────────────────────────────────────┘
```

- Shows as toast on My Day load (max once per day)
- Dismissible, with "don't show again this week" option via settings

---

### UX3 — Lena Fischer (Mobile & Accessibility)

#### Mobile Bottom Tab Bar (v0.0.17)

```
┌──────────────────────────────────────────────┐
│                                               │
│  (Main content area)                          │
│                                               │
├──────────────────────────────────────────────┤
│  🌅Today  ✅Tasks  🎯Focus  🔄Habits  ⋯More │
└──────────────────────────────────────────────┘
```

**Implementation:**
- CSS `@media (max-width: 768px)` → hide sidebar, show bottom bar
- Bottom bar is a `<nav>` with 5 items matching primary nav
- "More" opens a full-screen overlay matching the secondary sidebar
- Active tab has filled icon + accent color underline
- Badge dots (not numbers) for Inbox/Overdue counts at mobile size

#### Accessibility Checklist (v0.0.17)

| Fix | Priority | Implementation |
|-----|----------|---------------|
| `aria-label` on all icon-only buttons | High | Add to every `<button>` with only `material-icons-round` child |
| Focus trapping in modals | High | On modal open, trap Tab cycle within modal; Escape closes |
| Skip-to-content link | Medium | Hidden link before header, visible on focus |
| `prefers-reduced-motion` | Medium | Wrap all CSS animations in `@media (prefers-reduced-motion: no-preference)` |
| Color contrast audit (all 8 themes) | Medium | Run axe-core, fix failures to WCAG AA |
| Context menus keyboard-accessible | High | Arrow keys navigate, Enter selects, Escape closes |
| `role="menu"` on context menus | Medium | Add proper ARIA roles to `.ctx-menu` |
| Live region for toast notifications | Low | `aria-live="polite"` on toast container |

#### Design System Consistency (v0.0.15+)

**Spacing Scale:** Standardize on 4px base:
```css
--space-xs: 4px;   --space-sm: 8px;   --space-md: 12px;
--space-lg: 16px;  --space-xl: 24px;  --space-2xl: 32px;
```

**Button Variants:** Consolidate to 3:
```css
.btn-primary  → filled accent
.btn-secondary → outlined
.btn-ghost    → text only (for toolbar/inline actions)
```

**Icon Button Standard:**
```css
.btn-icon → 32×32, centered icon, 4px border-radius, hover: bg-surface-hover
```

---

## 5. CONSOLIDATED SPRINT PLAN

### v0.0.14 — "Feel the Progress" (Engagement Polish)

**Theme:** Make every interaction emotionally rewarding. Zero structural changes.
**Estimated scope:** ~6 frontend changes + 1 DB migration + 2 API changes

| # | Feature | Type | Files | Owner |
|---|---------|------|-------|-------|
| 1 | Morning greeting on Today view | Frontend | app.js (or components/greeting.js) | UX2 |
| 2 | Progress ring (SVG) on Today view | Frontend | app.js, styles.css | UX2 |
| 3 | Task completion micro-animation | Frontend | styles.css, app.js | UX2 |
| 4 | "All done!" celebration screen | Frontend | app.js, styles.css | UX2 |
| 5 | Streak emoji tiers + total count | Frontend | app.js (habits section) | UX2 |
| 6 | Link habits to life areas | Backend + Frontend | db/index.js, routes/habits.js(?), app.js | A1 |
| 7 | Balance alert toast | Backend + Frontend | routes/stats.js, app.js | A1, UX2 |

**Database Migration:**
```sql
ALTER TABLE habits ADD COLUMN area_id INTEGER;
```

**New/Modified API:**
- `GET /api/stats/balance` — returns area task distribution for past 7 days
- `GET /api/habits` — include area_id and area name in response
- `PUT /api/habits/:id` — accept area_id field

**Test Plan:** 15-20 new tests
- Greeting shows correct time-of-day text
- Progress ring calculates correct percentage
- "All done" triggers when all tasks complete
- Habit area linking CRUD
- Balance alert triggers at >60% threshold
- Balance alert suppression (dismiss for day)

**Success Metrics (PM2):**
- Session duration increases (users linger on celebration screens)
- Habit completion rate increases (streak visibility)
- Multiple-area engagement increases (balance alerts)

---

### v0.0.15 — "Find Everything" (Navigation + Weekly Review + Labels)

**Theme:** Restructure navigation for clarity. Complete the GTD loop. Ship custom labels.
**Estimated scope:** Major frontend restructure + 5 new API endpoints + settings integration

| # | Feature | Type | Files | Owner |
|---|---------|------|-------|-------|
| 1 | Sidebar restructure (7 primary items) | Frontend | app.js, styles.css | UX1, A2 |
| 2 | Tasks hub with List/Board/Calendar tabs | Frontend | app.js | UX1, A2 |
| 3 | Weekly Review UI (guided flow) | Full-stack | routes/weekly-review.js (new), app.js | A1, UX2 |
| 4 | Custom status labels (settings) | Full-stack | app.js (settings + board render) | A1 |
| 5 | Custom priority labels (settings) | Full-stack | app.js (settings + task render) | A1 |
| 6 | Grocery category editor (settings UI) | Frontend | app.js (settings tab) | UX1 |
| 7 | Smart filter threshold config | Full-stack | app.js (settings), routes adjusted | A1 |
| 8 | Sidebar section collapse + persist | Frontend | app.js, styles.css | UX1 |
| 9 | Sidebar customization (drag primary/secondary) | Frontend | app.js | UX1 |
| 10 | Extract store.js state management | Frontend | new: public/store.js | A2 |

**Weekly Review Flow (Guided):**

```
Step 1: Area Check-in
┌──────────────────────────────────────────────┐
│  📋 Weekly Review — March 24, 2026           │
│                                               │
│  How did each area go this week?              │
│                                               │
│  💪 Health    ████░░░░░░  4/10 tasks    [😊] │
│  💼 Career    ████████░░  8/10 tasks    [😐] │
│  🏠 Home      ██░░░░░░░░  2/10 tasks    [😟] │
│  ...                                          │
│                                               │
│  [Next →]                                     │
└──────────────────────────────────────────────┘

Step 2: Inbox & Overdue Triage
┌──────────────────────────────────────────────┐
│  📥 Clear Your Inbox (3 items)               │
│                                               │
│  ☐ "Call dentist"     [→Goal] [🗑️] [→Task]  │
│  ☐ "Research laptops" [→Goal] [🗑️] [→Task]  │
│  ☐ "Book flights"     [→Goal] [🗑️] [→Task]  │
│                                               │
│  ⚠️ 2 Overdue Tasks                          │
│  ☐ "Submit report" (3 days late) [Reschedule]│
│  ☐ "Pay electricity" (1 day late) [Do Today] │
│                                               │
│  [← Back]  [Next →]                          │
└──────────────────────────────────────────────┘

Step 3: Set Priorities & Rate
┌──────────────────────────────────────────────┐
│  🎯 Next Week's Top 3 Priorities             │
│                                               │
│  1. [____________________________]            │
│  2. [____________________________]            │
│  3. [____________________________]            │
│                                               │
│  Rate this past week: ⭐⭐⭐☆☆               │
│                                               │
│  Notes: [_____________________________]       │
│                                               │
│  [← Back]  [Complete Review ✓]                │
└──────────────────────────────────────────────┘
```

**New Route File:** `src/routes/weekly-review.js`
**New API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/weekly-review/current` | Area stats, inbox count, overdue list for review |
| POST | `/api/weekly-review` | Save completed review (rating, notes, priorities) |
| GET | `/api/weekly-review/history` | Past reviews list |
| GET | `/api/stats/balance` | Area distribution (also used by balance alert) |

**Settings UI — Labels Section:**

```
Settings → Task Defaults
┌──────────────────────────────────────────────┐
│  Status Labels                                │
│  ┌──────────┬──────────────────────┐         │
│  │ Internal │ Display Label         │         │
│  ├──────────┼──────────────────────┤         │
│  │ todo     │ [To Do____________] │         │
│  │ doing    │ [In Progress______] │         │
│  │ done     │ [Done_____________] │         │
│  └──────────┴──────────────────────┘         │
│  [Reset to Defaults]                          │
│                                               │
│  Priority Labels                              │
│  ┌───┬───────────────┬───────┐               │
│  │ 0 │ [None________] │ [●]  │               │
│  │ 1 │ [Normal______] │ [●]  │               │
│  │ 2 │ [High________] │ [●]  │               │
│  │ 3 │ [Critical____] │ [●]  │               │
│  └───┴───────────────┴───────┘               │
│  [Reset to Defaults]                          │
└──────────────────────────────────────────────┘
```

**Test Plan:** 30-40 new tests
- Navigation renders 7 primary items
- Tasks hub tab switching (List/Board/Calendar)
- Weekly Review flow steps (create, area stats, save, history)
- Status label customization (store, render, reset)
- Priority label customization (store, render, reset, colors)
- Grocery category CRUD via settings
- Smart filter threshold changes affect results
- Sidebar collapse state persists across reloads

**Success Metrics (PM1):**
- Sidebar interaction confusion drops (measure via error clicks)
- Weekly Review completion rate > 30% of active users
- Settings engagement (users who customize labels)

---

### v0.0.16 — "Make It Yours" (Recurring + Onboarding + Templates)

**Theme:** Power features that eliminate repetitive manual work and welcome new users.
**Estimated scope:** Significant backend + frontend work

| # | Feature | Type | Files | Owner |
|---|---------|------|-------|-------|
| 1 | Recurring task engine (daily/weekly/monthly/custom) | Full-stack | routes/tasks.js, db logic, app.js | A1 |
| 2 | Recurring task UI (pattern picker) | Frontend | app.js | UX2 |
| 3 | 3-step onboarding flow | Frontend | components/onboarding.js | UX1, PM2 |
| 4 | Persona presets (5 personas) | Full-stack | seed data, settings | PM2 |
| 5 | Custom template CRUD | Full-stack | routes/templates.js (new), app.js | A1 |
| 6 | "Save as Template" on goals/lists | Full-stack | routes/goals.js, routes/lists.js, app.js | A1 |
| 7 | Emoji picker component | Frontend | components/emoji-picker.js | UX2 |
| 8 | Default view per area | Full-stack | db migration, app.js | A1, UX1 |

**Recurring Tasks — Pattern Picker:**
```
┌──────────────────────────────────────┐
│  Repeat: [Every ▾]                   │
│                                       │
│  ○ Daily                              │
│  ○ Weekdays (Mon-Fri)                │
│  ○ Weekly on [Mon ▾]                 │
│  ○ Every [2] weeks on [Mon ▾]       │
│  ○ Monthly on the [15th ▾]          │
│  ○ Yearly on [Mar 24 ▾]            │
│  ○ Custom: Every [3] [days ▾]       │
│  ○ Custom: [☑Mon ☑Wed ☑Fri ☐...]    │
│                                       │
│  Ends: ○ Never ○ After [10] times   │
│        ○ On [2026-06-30]            │
│                                       │
│  [Cancel]  [Set Recurrence]          │
└──────────────────────────────────────┘
```

**Recurring Engine Logic (A1):**
```
On My Day load (and on app start):
1. SELECT tasks WHERE recurring IS NOT NULL AND status = 'done'
     AND last_recurrence_date < today
2. For each recurring task:
   a. Parse recurring pattern (string or JSON)
   b. Calculate next occurrence date
   c. If next occurrence <= today:
      - Clone task (new row, status='todo', due_date=next date)
      - Update original: last_recurrence_date = today
3. Return new instances as part of My Day tasks

Storage:
  task.recurring = "daily" | "weekly" | "monthly" | 
                   '{"type":"custom","every":3,"unit":"day"}' |
                   '{"type":"custom","days":["mon","wed","fri"]}'
  task.last_recurrence_date = DATE (tracks when last generated)
```

**Onboarding (PM2 + UX1):**
```
Step 1: Welcome
┌──────────────────────────────────────────────┐
│                                               │
│     Welcome to LifeFlow 🌊                   │
│                                               │
│     How will you use LifeFlow?               │
│                                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │  🎓  │ │  💼  │ │  🎨  │ │  👨‍👩‍👧  │       │
│  │Studt.│ │ Prof.│ │ Free.│ │Parent│       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│                    ┌──────┐                   │
│                    │  ✨  │                   │
│                    │Genrl.│                   │
│                    └──────┘                   │
│                                               │
│              [Get Started →]                  │
└──────────────────────────────────────────────┘

Step 2: Customize Areas
┌──────────────────────────────────────────────┐
│  Set up your life areas:                      │
│                                               │
│  ☑ 💼 Career         ☑ 💪 Health             │
│  ☑ 📚 Learning       ☐ 🏠 Home               │
│  ☐ 💰 Finance        ☑ ❤️ Personal           │
│                                               │
│  + Add custom area: [________________]        │
│                                               │
│  [← Back]  [Next →]                          │
└──────────────────────────────────────────────┘

Step 3: First Goal + Tasks
┌──────────────────────────────────────────────┐
│  Create your first goal:                      │
│                                               │
│  Area: [💼 Career ▾]                         │
│  Goal: [_____________________________]        │
│                                               │
│  Add a few tasks:                             │
│  + [_____________________________]            │
│  + [_____________________________]            │
│  + [_____________________________]            │
│                                               │
│  [← Back]  [Start Using LifeFlow ✓]         │
└──────────────────────────────────────────────┘
```

**Test Plan:** 35+ new tests
- Recurring pattern parsing (daily, weekly, monthly, custom days, custom interval)
- Recurring instance generation (correct dates, no duplicates)
- Recurring end conditions (after N times, after date)
- Onboarding persona selection sets correct areas/tags/templates
- Onboarding can be skipped
- Template CRUD (create, edit, delete user-created, cannot delete built-in)
- Save-as-template from goal and list
- Emoji picker open/close/select
- Default view per area stored and used

**Success Metrics (PM2):**
- New user Task-1 completion rate > 80% (via onboarding)
- Recurring task adoption > 40% of users with >5 tasks
- Template reuse rate measured

---

### v0.0.17 — "Everyone Welcome" (Mobile + Accessibility)

**Theme:** Make LifeFlow usable for everyone on every device.

| # | Feature | Type | Files | Owner |
|---|---------|------|-------|-------|
| 1 | Mobile bottom tab bar | Frontend | styles.css, app.js | UX3 |
| 2 | Responsive sidebar (hide on mobile) | Frontend | styles.css | UX3 |
| 3 | ARIA labels on all icon buttons | Frontend | index.html, app.js | UX3 |
| 4 | Focus trapping in modals | Frontend | app.js | UX3 |
| 5 | Keyboard-accessible context menus | Frontend | app.js | UX3 |
| 6 | Skip-to-content link | Frontend | index.html | UX3 |
| 7 | `prefers-reduced-motion` support | Frontend | styles.css | UX3 |
| 8 | Color contrast audit (8 themes) | Frontend | styles.css | UX3 |
| 9 | Demo mode (pre-filled sample data) | Full-stack | routes/demo.js, seed data | A1, PM3 |
| 10 | Touch gestures (swipe sidebar items) | Frontend | app.js | UX3 |

**Test Plan:** 20+ new tests
- Bottom tab bar renders on mobile viewport
- Sidebar hidden on mobile
- Demo mode creates sample data + resets on exit
- ARIA labels present on all icon buttons
- Keyboard navigation through context menus
- Focus trap in modals

**Success Metrics (PM3):**
- Mobile session duration increases
- Accessibility audit score > 90 (axe-core)
- Demo mode → real usage conversion rate

---

### v1.0 — "Hello World" (Launch)

**Theme:** Public launch preparation. Marketing, landing page, final polish.

| # | Feature | Type | Owner |
|---|---------|------|-------|
| 1 | Landing page (screenshots, features, download) | HTML/CSS | PM3, UX1 |
| 2 | Shareable weekly summary card (image export) | Frontend | UX2, A2 |
| 3 | Shareable focus completion card | Frontend | UX2 |
| 4 | Demo mode polish | Full-stack | A1 |
| 5 | Changelog visible to users | Frontend | PM1 |
| 6 | Bug bash (all panels re-review) | QA | All |
| 7 | Performance audit | Backend | A1 |
| 8 | Documentation update | Docs | PM1 |

---

## 6. VERSION SUMMARY

| Version | Theme | Key Deliverables | New Endpoints | DB Changes | Est. Tests |
|---------|-------|-----------------|---------------|------------|------------|
| **v0.0.14** | Feel the Progress | Greeting, progress ring, celebrations, streaks, habit-area link, balance alert | 1 new + 2 modified | 1 ALTER | +15-20 |
| **v0.0.15** | Find Everything | Nav restructure, Weekly Review UI, custom labels, settings expansion | 4-5 new | 0 (settings-driven) | +30-40 |
| **v0.0.16** | Make It Yours | Recurring tasks, onboarding, templates CRUD, emoji picker | 5 new | 1 ALTER | +35-40 |
| **v0.0.17** | Everyone Welcome | Mobile bottom bar, accessibility, demo mode | 1-2 new | 0 | +20-25 |
| **v1.0** | Hello World | Landing page, shareable cards, launch polish | 0 | 0 | +10-15 |

**Total new tests across roadmap: ~110-140**
**Projected test count at v1.0: ~885-915**

---

## 7. DEPENDENCY GRAPH

```
v0.0.14 (Engagement)
  └── No dependencies — pure additive
  
v0.0.15 (Navigation + Review)
  ├── Balance alert (from v0.0.14) feeds into Weekly Review
  └── Settings infrastructure used by labels

v0.0.16 (Recurring + Onboarding + Templates)
  ├── Navigation restructure (v0.0.15) needed for onboarding flow
  ├── Labels system (v0.0.15) used in onboarding persona presets
  └── Emoji picker used by area/list editing (built on Phase A work)

v0.0.17 (Mobile + Accessibility)
  ├── Navigation restructure (v0.0.15) — bottom bar mirrors primary nav
  └── Can start accessibility fixes in parallel from v0.0.15

v1.0 (Launch)
  └── All above complete
```

---

## 8. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| app.js exceeds 5000 lines → unmaintainable | High | Medium | Extract components starting v0.0.14 |
| Recurring task engine creates duplicate tasks | Medium | High | Idempotent generation with last_recurrence_date + unique constraint |
| Navigation restructure breaks existing workflows | Medium | High | Keep all views accessible, just reorganize. Add "Classic layout" toggle |
| Onboarding skipped by most users | Medium | Medium | Make it delightful (< 60 seconds), show value immediately |
| Settings bloat (too many options) | Low | Medium | Group settings into clear categories, progressive disclosure |
| CSS complexity (mobile + desktop + 8 themes) | Medium | Medium | CSS custom properties for all theme values, media query consistency |

---

## 9. PANEL CONSENSUS

### All 8 experts agree on:

1. **v0.0.14 MUST be emotional polish** — no new features, just make existing things *feel* good
2. **Navigation restructure is the #1 structural priority** — 15+ sidebar items is untenable
3. **Weekly Review is the single most strategically important missing feature** — it's both a GTD requirement and a competitive differentiator
4. **No framework migration** — vanilla JS is working, stay with it, extract into ES modules
5. **Recurring tasks before onboarding** — can't onboard users to an app that doesn't support recurring tasks
6. **Accessibility is non-negotiable for v1.0** — can't launch publicly without WCAG AA compliance
7. **Component extraction should be gradual** — extract one component per version, not a big-bang refactor
8. **Settings infrastructure is solid** — key-value store in SQLite handles all label/config needs without schema changes

### Dissenting opinions:

- **A2 (Ingrid)** argues for introducing store.js in v0.0.14 instead of v0.0.15 — "the greeting and celebration state needs somewhere to live." PM1 overruled: "v0.0.14 should be as simple as possible."
- **UX3 (Lena)** wants accessibility fixes in v0.0.15, not v0.0.17 — "we shouldn't ship a navigation restructure that isn't accessible." Compromise: basic keyboard nav in v0.0.15 context menus, full audit in v0.0.17.
- **PM3 (Nina)** wants landing page moved to v0.0.16 — "we need it before people can find us." PM1 disagrees: "the app needs to be feature-complete first."

---

*Generated by: 3 Product Managers + 2 Architects + 3 UI/UX Designers*
*Date: 2026-03-24*
*App Version: 0.0.13 (Phase A complete)*
*Target: v1.0 public launch*
