# Changelog

All notable changes to LifeFlow are documented in this file.

## [2.0.0] - 2026-03-22

### UX Redesign

Major interface overhaul based on a 12-expert multi-perspective review (2 architects, 3 UI experts, 5 life coaches, 2 PMs).

#### Sidebar Redesign (Phase A)
- Reduced navigation from 23+ items to 5 primary + 2 collapsible groups
- Primary nav: Inbox, Today, All Tasks, Calendar
- Life Areas promoted to top-level with inline add button
- Plan group: Board, Weekly Plan, Matrix (collapsible)
- Filters group: Smart Lists + Saved Filters merged (collapsible)
- Bottom bar with Settings and Reports icons

#### Today View (Phase B)
- Unified "Today" view merges My Day + Day Planner + Dashboard stats
- Stats bar: tasks done, focus minutes, streak, overdue count
- List / Timeline tab toggle
- Overdue tasks section with count and items
- Habits strip at bottom with quick-toggle buttons
- Renamed "My Day" → "Today" throughout the app

#### Settings Tabs (Phase C)
- Settings view now has 7 tabs: General, Appearance, Tags, Templates, Automations, Data, Shortcuts
- Visual theme picker with color swatches (8 themes)
- Tags, Templates, and Automations content reused from existing views
- Keyboard shortcuts reference integrated
- Import/Export/Reset consolidated under Data tab

#### Reports View (Phase D)
- New tabbed Reports view with 7 tabs: Overview, Activity, Habits, Focus, Analytics, Reviews, Notes
- Delegates to existing render functions with tab bar overlay
- Accessible via sidebar icon and command palette

#### Filters Merge (Phase E)
- Smart Lists (Stale, Quick Wins, Blocked) and Saved Filters unified under one sidebar section
- Removed redundant separate sections

### Bug Fixes
- Fixed 4 broken render targets where `renderSettings`, `renderHabits`, `renderSavedFilter`, and `renderPlanner` rendered into wrong containers (`cp-body`/`mc` → `ct`)

### Testing
- 537 tests across 32 files, all passing

---

## [1.0.0] - 2026-03-21

### Initial Release

Full-featured personal task management app.

#### Core Features
- Life Areas with color-coded organization
- Goals with milestones and progress tracking
- Tasks with priorities, due dates, due times, tags, subtasks, dependencies
- Recurring tasks with multiple frequency patterns
- Habit tracker with daily logging and heatmaps

#### Views
- My Day / All Tasks / Board (Kanban) / Calendar
- Weekly Planner / Eisenhower Matrix / Day Planner
- Dashboard with streaks, trends, heatmap, area breakdown
- Inbox for quick capture
- Activity Log / Focus History / Time Analytics

#### Productivity
- Focus timer (Pomodoro) with customizable durations
- Command palette (Ctrl+K) with search and navigation
- Quick capture with natural language date parsing
- Daily review ritual
- Morning briefing
- Smart filters (Stale, Quick Wins, Blocked)
- Saved custom filters
- Bulk operations with multi-select
- Task templates
- Automation rules

#### Organization
- Tag manager with color coding
- Notes with markdown support
- Weekly review
- iCal export
- Import/Export (JSON)

#### UX
- 8 themes (Midnight, Charcoal, Forest, Ocean, Rose, Light, Nord, Sunset)
- Keyboard shortcuts and vim-style navigation
- Onboarding wizard
- Mobile responsive
- Push notifications via Service Worker
- Drag-and-drop reorder and board management
- Confetti celebrations on completions
- Undo system
- Global FTS5 search
- Accessibility improvements

#### Technical
- Single-file SPA (vanilla JS, no framework)
- Node.js + Express 5 backend
- better-sqlite3 with FTS5
- 537 tests across 32 test files
