# LifeFlow Feature Roadmap — Product Spec

**Author:** Product Brainstorm  
**Date:** 2026-03-18  
**Status:** Draft  
**Type:** Feature Analysis & Proposals  

---

## 1. Current State Summary

LifeFlow is a self-hosted personal task management SPA with a 4-level hierarchy (Life Area → Goal → Task → Subtask), 6 views, 8 themes, tags, search, keyboard shortcuts, and JSON export. Tech stack: Express + better-sqlite3 backend (414 LOC), vanilla JS SPA frontend (999 LOC), running on port 3456.

**Strengths already in place:**
- Deep hierarchy (most competitors cap at 2 levels)
- Multiple views including Kanban board and calendar
- Fast local SQLite — zero latency, no cloud dependency
- Keyboard-first design (Ctrl+K search, shortcut keys for views)
- Theming with 8 options — more than most competitors
- Clean, lightweight stack — entire app is ~1,400 LOC

---

## 2. Competitor Analysis

### Feature Matrix

| Feature | LifeFlow | Todoist | TickTick | Things 3 | Any.do | MS To Do | Notion | Structured | Sunsama |
|---|---|---|---|---|---|---|---|---|---|
| Hierarchy depth | 4 levels | 2 (project/task) | 2 + checklists | 3 (area/project/task) | 2 | 2 (list/task) | Unlimited | Flat | 2 |
| Recurring tasks | Schema only | ✅ NLP | ✅ NLP | ✅ | ✅ | ✅ | Manual | ✅ | ✅ |
| Reminders/notifications | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Time blocking | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ core | ✅ core |
| Pomodoro/focus timer | ❌ | ❌ | ✅ built-in | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Habit tracking | ❌ | ❌ | ✅ built-in | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| NLP task input | ❌ | ✅ "tomorrow p1" | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Calendar integration | Display only | Google/Outlook | Google/Outlook | ❌ | Google | Outlook | Google | Apple Cal | Google core |
| Undo/redo | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Activity history | ❌ | ✅ karma | ✅ | ✅ logbook | ❌ | ❌ | ✅ | ❌ | ✅ |
| Data import | ❌ | ✅ CSV/Todoist | ✅ multi-format | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Filters/saved views | ❌ | ✅ powerful | ✅ | ❌ | ❌ | ❌ | ✅ DB views | ❌ | ❌ |
| Multi-select bulk ops | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Markdown in notes | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ full | ❌ | ✅ |
| Drag reorder tasks | ❌ (board cols) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Offline/local-first | ✅ | ❌ cloud | Partial | ✅ | ❌ cloud | ❌ cloud | ❌ cloud | ✅ | ❌ cloud |
| Self-hosted | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Price | Free | $5/mo pro | $36/yr pro | $50 once | $6/mo | Free | $10/mo | $30/yr | $20/mo |

### Common Competitor Complaints (Reddit, ProductHunt, App Store)

**Todoist:**
- "Filters are powerful but the syntax is cryptic" — users want visual filter builders
- "No time blocking — I need to switch to Google Calendar to plan my day"
- "Karma points feel gamified/gimmicky, I want real completion analytics"
- "Can't customize views enough — I want to see tasks grouped MY way"

**TickTick:**
- "Too feature-bloated — habit tracker + pomodoro + calendar feels like 3 apps jammed together"
- "Performance gets slow with 500+ tasks"
- "Premium paywall for basic features like calendar view"

**Things 3:**
- "No web app, Mac/iOS only — locked into Apple ecosystem"
- "No collaboration whatsoever"
- "Repeating task options are limited"
- "No API — can't integrate with anything"

**Any.do:**
- "UI is beautiful but functionally shallow"
- "Keeps pushing premium — feels hostile to free users"
- "No proper subtask management"

**Microsoft To Do:**
- "My Day is great but everything else is basic"
- "No hierarchy — just flat lists"
- "Syncing issues across devices"

**Notion:**
- "Overkill for task management — too much setup friction"
- "Slow loading, especially with large databases"
- "No built-in reminders or notifications"

**Structured:**
- "Great for daily planning but terrible for project management"
- "No web version"
- "Can't handle more than a day's worth of planning"

**Sunsama:**
- "$20/month is absurd for a task manager"
- "Great daily planning ritual but too rigid"
- "Timeboxing approach doesn't work for everyone"

---

## 3. Gap Analysis — Critical Missing Features

### Dealbreakers (users won't switch without these)

1. **No recurring tasks execution** — The `recurring` field exists in the DB schema but there's no logic to generate next occurrences. This is table-stakes for any task manager.

2. **No undo** — Deleting a task/goal is permanent and instant. One misclick and data is lost. Every competitor has undo.

3. **No task drag reorder** — Board columns drag works, but individual tasks within a view can't be reordered by dragging. Position field exists but isn't used.

4. **No due times** — Only `due_date` (date-level). Users can't set "Call dentist at 2pm". The schema stores TEXT so it could hold ISO timestamps, but the UI only does dates.

5. **No data import** — Export exists, but no import. Users can't migrate FROM other tools.

### High-Impact Gaps (differentiation opportunities)

6. **No activity log** — Completed tasks vanish into `status='done'` with a `completed_at` timestamp, but there's no logbook or history view. Things 3's Logbook is beloved.

7. **No focus/pomodoro mode** — TickTick's built-in timer is frequently cited as a reason to stay.

8. **No markdown in task notes** — Notes are plain text. Todoist, TickTick, and Notion all support rich/markdown notes.

9. **No filters or saved views** — The board view has basic dropdowns but there's no way to create custom filtered views ("all high-priority tasks due this week in Career area").

10. **No natural language input** — Todoist's "Buy groceries tomorrow p1 #errands" is addictive. LifeFlow's quick capture is fast but dumb.

11. **No week view / planning ritual** — Sunsama's weekly planning is its killer feature. LifeFlow has My Day but no "plan your week" flow.

---

## 4. Feature Proposals

### P0 — Must Have (table-stakes, users expect these)

#### P0-1: Recurring Tasks Engine
- **Description:** When a recurring task is completed, automatically generate the next occurrence based on the recurrence pattern (daily, weekly, monthly, custom).
- **Why it matters:** 60%+ of task manager tasks are recurring. Without this, LifeFlow can't replace any existing tool. The `recurring` TEXT field already exists in the schema — it just needs a generation engine and UI.
- **Complexity:** M

#### P0-2: Undo / Soft Delete
- **Description:** All destructive actions (delete task, complete task, delete goal/area) get a 10-second undo toast. Tasks are soft-deleted (30-day trash) rather than hard-deleted.
- **Why it matters:** Data loss anxiety is the #1 reason people don't trust a new tool with their important tasks. Every serious competitor has undo.
- **Complexity:** M

#### P0-3: Task Drag Reorder
- **Description:** Drag-and-drop reordering of tasks within any list view, goals within an area, and subtasks within a task. Update `position` field on drop.
- **Why it matters:** Manual ordering is fundamental to prioritization. The position field exists but is only settable via API. Users expect to physically arrange their tasks.
- **Complexity:** S

#### P0-4: Due Times (not just dates)
- **Description:** Extend due_date to support optional time component. Add a time picker in the task editor. Display time in task cards when set.
- **Why it matters:** "Call dentist at 2pm" vs "Call dentist today" — time-sensitive tasks need time-level precision. The schema already stores TEXT, so no migration needed.
- **Complexity:** S

#### P0-5: Data Import
- **Description:** Import from Todoist (CSV), TickTick (CSV), and LifeFlow's own JSON export format. Map columns to LifeFlow's hierarchy.
- **Why it matters:** Migration friction is the #1 barrier to switching tools. Without import, users with hundreds of tasks in another app simply won't switch.
- **Complexity:** M

#### P0-6: Inline Task Editing
- **Description:** Click a task title to edit it inline. Click the note area to expand and edit. Currently, editing requires a modal or separate interaction.
- **Why it matters:** Friction in editing = tasks that never get updated. The fastest task managers (Things 3, Todoist) allow inline editing everywhere.
- **Complexity:** S

---

### P1 — High Impact (differentiation features)

#### P1-1: Natural Language Quick Capture
- **Description:** Parse task input like "Buy groceries tomorrow p2 #errands" into structured fields: title="Buy groceries", due_date=tomorrow, priority=2, tag=errands. Support relative dates (tomorrow, next monday, in 3 days), priorities (p1-p3), tags (#name), and goal assignment (@goalname).
- **Why it matters:** Todoist's NLP input is consistently rated as its #1 feature. It makes task capture 3x faster than filling out fields. This is the single most-requested feature across all task manager communities.
- **Complexity:** M (regex parser, no AI needed)

#### P1-2: Activity Log / Logbook
- **Description:** Chronological timeline of all completed tasks, grouped by day/week. Shows completion timestamp, area, goal context. Filterable by area and date range.
- **Why it matters:** Things 3's Logbook creates a satisfying sense of accomplishment. It also serves as a work diary — "what did I do last Tuesday?" is a common need for freelancers and knowledge workers.
- **Complexity:** S (data already exists via `completed_at`)

#### P1-3: Weekly Planning View
- **Description:** A dedicated "Plan Your Week" view showing a 7-day timeline. Drag tasks onto specific days. See capacity per day. Review last week's completion rate. Set weekly focus areas.
- **Why it matters:** Sunsama charges $20/month primarily for its weekly planning ritual. This is the highest-value feature in the productivity space right now. LifeFlow's My Day is good but doesn't help with weekly planning.
- **Complexity:** L

#### P1-4: Smart Filters & Saved Views
- **Description:** A visual filter builder: combine area, goal, priority, tags, status, date range, and text search. Save filter combinations as named views that appear in the sidebar.
- **Why it matters:** Todoist's filters are its power-user moat. "Show me all high-priority Career tasks due this week" is a query every power user needs. Currently LifeFlow's board has basic dropdowns but nothing is savable.
- **Complexity:** M

#### P1-5: Focus Mode / Pomodoro Timer
- **Description:** Select a task → enter focus mode. A minimal timer overlay (25/5 pomodoro or custom). Track time spent. Show focus stats in dashboard. Optional: ambient background sounds.
- **Why it matters:** TickTick users consistently cite the built-in pomodoro as a key differentiator. Combining task management + focus timer eliminates the need for a separate timer app.
- **Complexity:** M

#### P1-6: Markdown Notes
- **Description:** Task notes support Markdown rendering: headings, bold, italic, links, code blocks, bullet lists. Edit in plain text, preview rendered. Use a lightweight parser (marked.js ~7KB).
- **Why it matters:** Power users write detailed notes, meeting minutes, and reference links in task notes. Plain text feels limiting compared to Todoist/Notion.
- **Complexity:** S

#### P1-7: Multi-Select & Bulk Operations
- **Description:** Shift+click or checkbox mode to select multiple tasks. Bulk actions: change status, move to goal, set priority, assign tag, set due date, delete.
- **Why it matters:** "I have 15 tasks that need to move to next week" — without bulk ops, this is 15 individual edits. Every serious task manager supports this.
- **Complexity:** M

#### P1-8: Keyboard-Driven Command Palette
- **Description:** Expand Ctrl+K from search-only to a full command palette: "Move to...", "Set priority...", "Add tag...", "Go to view...", "Create task in...". Fuzzy matching on all commands and entities.
- **Why it matters:** Keyboard power users (developers, writers) want to never touch the mouse. A command palette turns LifeFlow into the "VS Code of task managers" — a unique positioning no competitor has.
- **Complexity:** M

---

### P2 — Delight (wow moments, user loyalty)

#### P2-1: Streak & Completion Analytics
- **Description:** Dashboard section showing: daily completion streaks, best day of the week, average tasks completed per day, completion rate trends (line chart), "most productive hour" analysis, and per-area velocity.
- **Why it matters:** Gamification without gimmicks. Unlike Todoist's karma (widely criticized as shallow), real analytics help users understand their own patterns. This creates the "I can't leave" stickiness.
- **Complexity:** M

#### P2-2: Task Templates
- **Description:** Save a task (with subtasks, tags, priority) as a reusable template. One-click instantiation. Pre-built templates: "Weekly Review", "Trip Planning", "Sprint Planning", "Moving Checklist".
- **Why it matters:** Users recreate the same task structures repeatedly. Templates turn LifeFlow from a task manager into a personal workflow engine.
- **Complexity:** S

#### P2-3: Daily Review Ritual
- **Description:** At the start of each day (or on-demand), show an interactive review: yesterday's completions → today's overdue → today's scheduled → unplanned capacity → pick tasks from backlog. Guided flow, not just a list.
- **Why it matters:** Sunsama's daily planning ritual is its core value prop ($20/month). Building this into a free, self-hosted tool would be a direct competitive strike. This is the "10x angle."
- **Complexity:** L

#### P2-4: Global Hotkey Quick Capture
- **Description:** A system-tray-style floating input that captures tasks from outside the browser. On web: a browser extension popup or bookmarklet. In-app: Ctrl+Shift+N opens a minimal overlay even when the app is minimized.
- **Why it matters:** The best task capture happens at the moment of thought. If the user has to switch to a browser tab, open LifeFlow, navigate to a goal — the thought is lost.
- **Complexity:** S (bookmarklet/popup), L (extension)

#### P2-5: Relative Date Badges
- **Description:** Instead of showing "2026-03-20", show "in 2 days", "tomorrow", "next Monday", "3 days overdue" with color coding. Raw date on hover.
- **Why it matters:** Humans think in relative terms, not ISO dates. This small UX detail makes LifeFlow feel instantly more polished and human than competitors showing raw dates.
- **Complexity:** S

#### P2-6: Ambient Progress Feedback
- **Description:** Subtle micro-animations on task completion: confetti burst on completing a goal, progress ring animation when subtasks complete, streak flame icon when on a 7+ day streak. Tasteful, not gamified.
- **Why it matters:** Completion dopamine. Things 3's satisfying checkbox animation is frequently cited as a reason people love it. Small polish creates emotional connection.
- **Complexity:** S

#### P2-7: Eisenhower Matrix View
- **Description:** A new view showing tasks in a 2x2 grid: Urgent+Important, Important+Not Urgent, Urgent+Not Important, Neither. Map from existing priority field + due date proximity.
- **Why it matters:** The Eisenhower Matrix is the most famous productivity framework. No mainstream task manager offers it as a native view. This would be highly shareable/viral ("LifeFlow has an Eisenhower Matrix!").
- **Complexity:** S

#### P2-8: Auto-Backup & Version History
- **Description:** Automatically save a JSON backup every 24 hours (rotate last 7). Show a simple version history: "Restore from March 17 backup". Store in a `backups/` directory alongside the DB.
- **Why it matters:** Self-hosted means the user is responsible for backups. Automating this removes anxiety and is a strong selling point vs cloud competitors ("you own your data AND it's backed up").
- **Complexity:** S

---

## 5. Prioritized Implementation Roadmap

### Phase 1 — Foundation (make it trustworthy)
| # | Feature | Complexity | Impact |
|---|---------|-----------|--------|
| 1 | P0-2: Undo / Soft Delete | M | Eliminates data loss anxiety |
| 2 | P0-3: Task Drag Reorder | S | Basic UX expectation |
| 3 | P0-6: Inline Task Editing | S | Removes friction |
| 4 | P2-5: Relative Date Badges | S | Instant polish |
| 5 | P2-8: Auto-Backup | S | Trust & safety |

### Phase 2 — Core Power (make it usable as a daily driver)
| # | Feature | Complexity | Impact |
|---|---------|-----------|--------|
| 6 | P0-1: Recurring Tasks Engine | M | Unlocks daily use |
| 7 | P0-4: Due Times | S | Time-sensitive tasks |
| 8 | P1-1: NLP Quick Capture | M | 3x faster input |
| 9 | P1-2: Activity Log | S | Sense of progress |
| 10 | P1-6: Markdown Notes | S | Rich task context |

### Phase 3 — Differentiation (make it better than competitors)
| # | Feature | Complexity | Impact |
|---|---------|-----------|--------|
| 11 | P1-3: Weekly Planning View | L | Sunsama-killer |
| 12 | P1-5: Focus Mode / Pomodoro | M | TickTick-killer |
| 13 | P1-4: Smart Filters & Saved Views | M | Power user moat |
| 14 | P1-7: Multi-Select & Bulk Ops | M | Efficiency |
| 15 | P1-8: Command Palette | M | Keyboard-first identity |

### Phase 4 — Delight & Stickiness (make it irreplaceable)
| # | Feature | Complexity | Impact |
|---|---------|-----------|--------|
| 16 | P2-1: Streak & Analytics | M | Retention loop |
| 17 | P2-3: Daily Review Ritual | L | Core differentiator |
| 18 | P2-2: Task Templates | S | Workflow engine |
| 19 | P2-7: Eisenhower Matrix View | S | Viral feature |
| 20 | P2-6: Ambient Progress Feedback | S | Emotional connection |
| 21 | P0-5: Data Import | M | Migration path |

---

## 6. Product Vision & Positioning

### The Problem
Every task manager forces a tradeoff:
- **Simple but shallow** (MS To Do, Any.do) — easy to start, can't handle real life complexity
- **Powerful but complex** (Notion, Todoist with filters) — steep learning curve, slow, overkill
- **Opinionated but rigid** (Sunsama, Structured) — great daily workflow but breaks when life doesn't fit the mold
- **Cloud-dependent** (all of the above) — your most personal data lives on someone else's server

### LifeFlow's Position
> **LifeFlow: The keyboard-first, self-hosted task planner that grows with your life.**

The "10x better" angle is the intersection of three things no competitor combines:

1. **Deep hierarchy without complexity** — 4 levels (Area → Goal → Task → Subtask) maps to how people actually think about their lives, not how software engineers think about databases. Things 3 comes closest but caps at 3 levels and is Apple-only.

2. **Keyboard-first, command-palette-driven** — LifeFlow should be to task management what VS Code is to code editors. NLP input, command palette, keyboard shortcuts for everything. No competitor has leaned into this.

3. **Self-hosted, local-first, zero-subscription** — Your tasks, your server, your data. Instant performance (SQLite). No $20/month Sunsama tax. No "please upgrade to Premium" nagware. This is the anti-SaaS positioning that resonates deeply with developers, privacy-conscious users, and the growing self-hosted community (r/selfhosted: 380K+ members).

### Tagline Options
- "Your life, organized. Your server, your data."
- "The task planner for people who type faster than they click."
- "Plan your life, own your data."

### Target User
Primary: **Developers, freelancers, and knowledge workers** who:
- Use keyboard shortcuts instinctively
- Distrust SaaS subscriptions for personal data
- Want one tool for life + work task management
- Value speed and simplicity over collaboration features

Secondary: **Self-hosted enthusiasts** who run their own infrastructure and want a clean, lightweight alternative to Notion/Nextcloud Tasks.

### Success Metrics (North Stars)
- **Daily Active Use:** User opens LifeFlow 5+ days/week
- **Task Velocity:** User completes 3+ tasks/day average
- **Retention Signal:** User has 50+ tasks across 3+ life areas within 30 days
- **Switching Signal:** User imports data from another tool within first session

---

## 7. What NOT to Build

Equally important — features to explicitly avoid:

| Feature | Why Not |
|---|---|
| Mobile app | Massive complexity for a solo dev. Responsive web is sufficient. Make the web app a PWA instead. |
| Real-time collaboration | LifeFlow is a *personal* tool. Adding multi-user sync quadruples complexity with minimal value. |
| AI-powered task suggestions | Requires cloud AI infrastructure. The NLP parser for quick capture achieves 80% of the value at 1% of the complexity. |
| Email integration | Scope creep. Users can use Quick Capture to manually add email-derived tasks. |
| Gantt charts | Wrong abstraction for personal tasks. The weekly planning view covers the same need. |
| Native desktop app (Electron) | The web app + bookmarklet covers this. Electron adds 200MB+ bundle for minimal benefit. |
| Social/sharing features | Antithetical to the "private, self-hosted" positioning. |

---

## 8. Quick Wins — Implementable This Week

These 5 features are all **S complexity** and would dramatically improve the daily experience:

1. **Relative date badges** — Replace ISO dates with "tomorrow", "in 3 days", "overdue by 2d". Pure frontend, ~30 lines of JS.
2. **Inline task title editing** — Click title → contenteditable. Blur → save. ~50 lines.
3. **Task drag reorder** — HTML5 drag API on task cards, PATCH position on drop. ~80 lines.
4. **Auto-backup** — `setInterval` that writes `lifeflow-backup-{date}.json` to a backups dir every 24h. ~20 lines backend.
5. **Activity log view** — Query `completed_at IS NOT NULL` grouped by date. New sidebar item. ~60 lines total.

---

*This document is a living spec. Features should be validated with actual usage before Phase 3+. Build Phase 1, use it daily for a week, then reassess priorities.*
