# Advanced Automation Rules System

> **Status:** Draft · **Created:** 4 April 2026 · **Author:** Expert Panel Brainstorm  
> **Version:** 0.1 · **Last Updated:** 4 April 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Design Principles](#3-design-principles)
4. [New Trigger Types](#4-new-trigger-types)
5. [New Action Types](#5-new-action-types)
6. [Condition System](#6-condition-system)
7. [Rule Templates](#7-rule-templates)
8. [Smart Automations](#8-smart-automations)
9. [UI/UX Design](#9-uiux-design)
10. [Execution Engine Architecture](#10-execution-engine-architecture)
11. [Database Schema Changes](#11-database-schema-changes)
12. [API Changes](#12-api-changes)
13. [Security Considerations](#13-security-considerations)
14. [Implementation Phases](#14-implementation-phases)
15. [Testing Strategy](#15-testing-strategy)

---

## 1. Executive Summary

### The Problem

LifeFlow's automation system is 50% implemented: 4 triggers (2 working), 6 actions (3 working), no condition logic, no execution log, and a UI that only supports create/delete/toggle. Users can't build the automations that would make a personal task planner genuinely reduce their cognitive load.

### The Vision

A personal automation system that acts as a **digital productivity assistant** — not an enterprise workflow engine. Rules should feel like setting up "if this, then that" recipes for your productivity habits:

- "When I complete a task in my Health goal, log my Exercise habit"
- "When any task is overdue for 3+ days, bump it to critical priority and add to My Day"
- "Every Monday morning, create my weekly review task"
- "When a focus session ends, add a 5-minute break reminder"
- "When my Fitness goal reaches 80%, create a celebration task"

### Expert Panel Perspectives

**Life Coach:** Automations should reduce decision fatigue, enforce positive routines, and make progress visible. The best automations are the ones you set up once and forget — they quietly keep your system running.

**UX Designer:** The builder must be readable as a sentence: "When [trigger] and [conditions], then [action]." Templates are essential — most users won't build rules from scratch. Execution feedback should be subtle (toast) not intrusive (modal).

**Behavioral Psychologist:** Automate the mundane (sorting, prioritizing, scheduling) so users spend mental energy on actual work. Use positive reinforcement (streak celebrations, progress markers) not punishment. Reduce "open loops" — every overdue task is cognitive debt.

**Software Architect:** Keep it simple. SQLite + background scheduler can handle personal-scale automation (dozens of rules, not thousands). No external dependencies. Event bus pattern for clean trigger dispatch. Rate-limit rule execution to prevent runaway chains.

---

## 2. Current State Analysis

### What Works
| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ | `automation_rules` table with user_id scoping |
| CRUD API | ✅ | GET/POST/PUT/DELETE at `/api/rules` |
| `task_completed` trigger | ✅ | Fires on first done transition |
| `task_updated` trigger | ✅ | Fires on non-done status changes |
| `add_to_myday` action | ✅ | Sets my_day=1 |
| `set_priority` action | ✅ | Updates priority field |
| `add_tag` action | ✅ | Inserts into task_tags |
| Trigger config filters | ✅ | area_id, goal_id, priority filtering in engine |
| IDOR protection | ✅ | Rules scoped to user_id |
| Export/Import | ✅ | automation_rules included |

### What's Broken or Missing
| Component | Status | Issue |
|-----------|--------|-------|
| `task_created` trigger | ❌ | Defined but never called from POST /api/tasks |
| `task_overdue` trigger | ❌ | Defined but no background job to fire it |
| `create_followup` action | ⚠️ | Missing user_id on created task (IDOR bug) |
| `move_to_goal` action | ❌ | Type defined but no execution logic |
| `send_notification` action | ❌ | Type defined but not implemented |
| Trigger config UI | ❌ | Engine supports filters but UI doesn't expose them |
| Tag selector for `add_tag` | ❌ | No UI to pick a tag |
| Rule editing | ❌ | Can only toggle enabled/delete, not edit fields |
| Execution log | ❌ | No audit trail of rule firings |
| Rule testing | ❌ | No preview/dry-run capability |
| Execution safety | ⚠️ | No transaction wrapping, no loop detection, no rate limit |

### Infrastructure Available
- **scheduler.js** — Background job system with `register(name, interval, fn)`. Runs session cleanup (6h), recurring task spawn (1h), deadline notifications (30m). Easy to add new jobs.
- **Webhook events** — 8 event types already defined: `task.created`, `task.updated`, `task.completed`, `task.deleted`, `goal.created`, `goal.completed`, `habit.logged`, `focus.completed`. These map naturally to automation triggers.
- **Push notifications** — `push.service.js` with subscription management. Can send payloads to subscribed users.
- **Audit log** — `audit_log` table exists. Can log rule executions.

---

## 3. Design Principles

### P1: Sentence-Readable Rules
Every rule should read as natural language: **"When** `[trigger]` **and** `[conditions]` **, then** `[action]`**."** The UI renders rules this way. The data model supports this.

### P2: Personal Scale, Not Enterprise Scale
- Dozens of rules per user, not thousands
- Seconds of latency acceptable for background triggers
- No complex orchestration, no approval workflows, no multi-user handoffs
- SQLite is fine — no need for a message queue

### P3: Safe by Default
- Rules can't create infinite loops (max chain depth = 3)
- Rules can't execute more than 50 actions per minute per user
- Background triggers run on scheduler intervals, not real-time
- All rule executions are logged for debugging

### P4: Templates First
- 80% of users will use templates, not build from scratch
- Templates are pre-built rules with sensible defaults
- One-click install with customization option

### P5: Progressive Disclosure
- Simple rules: trigger → action (no conditions needed)
- Medium rules: trigger + 1-2 conditions → action
- Advanced rules: trigger + AND/OR conditions → multiple actions
- Each level is optional — the UI grows with the user

---

## 4. New Trigger Types

### 4.1 Task Triggers (fix existing + add new)

| Trigger | Event | Data Available | Notes |
|---------|-------|----------------|-------|
| `task_completed` | Task status → done | task.* + area_id, goal_id | ✅ Already works |
| `task_updated` | Task status change (not done) | task.* + area_id, goal_id | ✅ Already works |
| `task_created` | New task created | task.* + area_id, goal_id | 🔧 Fix: add call in POST /api/tasks |
| `task_overdue` | Task due_date < today & not done | task.* + days_overdue | 🔧 Add scheduler job |
| `task_due_today` | Task due_date = today | task.* | New — scheduler job |
| `task_due_soon` | Task due in N days (configurable) | task.* + days_until_due | New — scheduler job, trigger_config.days = 1-7 |
| `task_stale` | Task not updated in N days | task.* + days_stale | New — scheduler job, trigger_config.days = 3-30 |

### 4.2 Goal Triggers

| Trigger | Event | Data Available | Notes |
|---------|-------|----------------|-------|
| `goal_progress` | Goal completion % crosses threshold | goal.* + percentage + area_id | trigger_config.threshold = 25/50/75/100 |
| `goal_all_tasks_done` | All tasks in goal completed | goal.* + task_count | Subset of goal_progress at 100% |

### 4.3 Habit Triggers

| Trigger | Event | Data Available | Notes |
|---------|-------|----------------|-------|
| `habit_logged` | Habit marked complete for today | habit.* + streak_count | Fire after POST /api/habits/:id/log |
| `habit_streak` | Habit streak reaches N days | habit.* + streak_count | trigger_config.streak = 3/7/14/21/30/60/90 |
| `habit_missed` | Habit not logged by end of day | habit.* + last_logged_date | Scheduler job, checks previous day |

### 4.4 Focus Triggers

| Trigger | Event | Data Available | Notes |
|---------|-------|----------------|-------|
| `focus_completed` | Focus session finished | session.* + task.* + duration_sec | Fire after POST /api/focus (existing route) |
| `focus_streak` | N focus sessions in one day | count + date | trigger_config.count = 2/3/5 |

### 4.5 Time-Based Triggers

| Trigger | Event | Data Available | Notes |
|---------|-------|----------------|-------|
| `schedule_daily` | Fires once per day at configured time | { date, day_of_week } | trigger_config.time = "08:00", trigger_config.days = [1,2,3,4,5] |
| `schedule_weekly` | Fires once per week on configured day | { date, week_number } | trigger_config.day = 1 (Monday), trigger_config.time = "09:00" |
| `schedule_monthly` | Fires once per month on configured day | { date, month } | trigger_config.day_of_month = 1 |

### 4.6 Review Triggers

| Trigger | Event | Data Available | Notes |
|---------|-------|----------------|-------|
| `daily_review_saved` | Daily review submitted | review.* | Fire after POST /api/daily-review |
| `weekly_review_saved` | Weekly review submitted | review.* | Fire after POST /api/weekly-reviews |

### Implementation Priority

**Phase 1 (Quick Wins):** Fix `task_created`, add `task_overdue` + `task_due_today` (scheduler), `habit_logged`, `focus_completed`

**Phase 2 (Core):** `task_due_soon`, `task_stale`, `goal_progress`, `habit_streak`, `habit_missed`, `schedule_daily`

**Phase 3 (Advanced):** `schedule_weekly`, `schedule_monthly`, `focus_streak`, `goal_all_tasks_done`, `daily_review_saved`, `weekly_review_saved`

---

## 5. New Action Types

### 5.1 Task Actions (fix existing + add new)

| Action | Effect | Config | Notes |
|--------|--------|--------|-------|
| `add_to_myday` | Set my_day=1 | — | ✅ Already works |
| `set_priority` | Update priority | { priority: 0-3 } | ✅ Already works |
| `add_tag` | Add tag to task | { tag_id } | ✅ Already works |
| `create_followup` | Create new task | { title, priority?, goal_id? } | 🔧 Fix: add user_id |
| `move_to_goal` | Move task to goal | { goal_id } | 🔧 Implement execution |
| `set_status` | Change task status | { status: "todo"\|"doing"\|"done" } | New |
| `set_due_date` | Set/shift due date | { mode: "set"\|"shift", value: "today"\|"+1d"\|"+1w"\|date } | New |
| `add_subtasks` | Add subtasks from list | { subtasks: ["Step 1", "Step 2"] } | New |
| `apply_template` | Apply task template | { template_id } | New — creates subtasks from template |
| `remove_from_myday` | Clear my_day flag | — | New |

### 5.2 Habit Actions

| Action | Effect | Config | Notes |
|--------|--------|--------|-------|
| `log_habit` | Log a habit completion | { habit_id } | New — great for task↔habit bridge |
| `create_habit_task` | Create task linked to habit | { habit_id, title? } | New — "Do 30min yoga" task from habit |

### 5.3 Notification Actions

| Action | Effect | Config | Notes |
|--------|--------|--------|-------|
| `send_notification` | Push notification | { title?, body? } | 🔧 Implement using push.service.js |
| `send_toast` | In-app toast message | { message, type: "info"\|"success"\|"warning" } | New — lightweight feedback |

### 5.4 Organization Actions

| Action | Effect | Config | Notes |
|--------|--------|--------|-------|
| `move_to_inbox` | Move task to inbox | — | New — for triage workflows |
| `archive_goal` | Archive a goal | — | New — for goal_all_tasks_done trigger |
| `create_review_prompt` | Add to daily review | { note_template } | New — "Reflect on completing {{task.title}}" |

### 5.5 Multi-Action Support

Rules can have **multiple actions** that execute sequentially. This is essential for useful automations:

```
When task completed in "Health" goal:
  → Log "Exercise" habit
  → Send toast "Great workout! 💪"
  → Create follow-up task "Cool down stretches" due tomorrow
```

**Data model:** Change `action_type`/`action_config` from single values to an array:
```json
{
  "actions": [
    { "type": "log_habit", "config": { "habit_id": 5 } },
    { "type": "send_toast", "config": { "message": "Great workout!" } },
    { "type": "create_followup", "config": { "title": "Cool down stretches", "due": "+1d" } }
  ]
}
```

See [Section 11](#11-database-schema-changes) for migration strategy that maintains backward compatibility.

### Implementation Priority

**Phase 1:** Fix `create_followup` + `move_to_goal` + `send_notification`. Add `set_status`, `set_due_date`.

**Phase 2:** `log_habit`, `send_toast`, `remove_from_myday`, `add_subtasks`. Multi-action support.

**Phase 3:** `apply_template`, `create_habit_task`, `move_to_inbox`, `archive_goal`, `create_review_prompt`.

---

## 6. Condition System

### 6.1 Current State

The current system has flat filters in `trigger_config`: `{ area_id?, goal_id?, priority? }`. All filters are AND'd together. No OR logic, no nested conditions, no comparisons beyond equality.

### 6.2 Proposed Condition Model

Conditions are evaluated **after** the trigger fires and **before** actions execute. They answer: "Should this rule actually run for this specific event?"

#### Condition Structure

```json
{
  "conditions": {
    "match": "all",          // "all" (AND) | "any" (OR)
    "rules": [
      {
        "field": "task.area_id",
        "operator": "equals",
        "value": 5
      },
      {
        "field": "task.priority",
        "operator": "gte",
        "value": 2
      },
      {
        "field": "task.tags",
        "operator": "contains",
        "value": "urgent"
      }
    ]
  }
}
```

#### Available Fields

| Field | Type | Available On | Description |
|-------|------|-------------|-------------|
| `task.area_id` | number | Task triggers | Life area of the task's goal |
| `task.goal_id` | number | Task triggers | Goal the task belongs to |
| `task.priority` | number | Task triggers | 0-3 |
| `task.status` | string | Task triggers | todo/doing/done |
| `task.has_due_date` | boolean | Task triggers | Whether due_date is set |
| `task.is_recurring` | boolean | Task triggers | Whether recurring is set |
| `task.tags` | string[] | Task triggers | Tag names on the task |
| `task.title` | string | Task triggers | Task title (for contains/starts_with) |
| `task.estimated_minutes` | number | Task triggers | Estimated time |
| `task.days_overdue` | number | task_overdue | Days past due |
| `habit.id` | number | Habit triggers | Specific habit |
| `habit.area_id` | number | Habit triggers | Habit's life area |
| `habit.streak` | number | habit_streak | Current streak count |
| `focus.duration_sec` | number | Focus triggers | Session duration |
| `focus.type` | string | Focus triggers | focus/short_break/long_break |
| `goal.percentage` | number | Goal triggers | Completion percentage |
| `schedule.day_of_week` | number | Schedule triggers | 0-6 (Sun-Sat) |

#### Operators

| Operator | Types | Description |
|----------|-------|-------------|
| `equals` | all | Exact match |
| `not_equals` | all | Not equal |
| `gt`, `gte`, `lt`, `lte` | number | Numeric comparisons |
| `contains` | string, string[] | Substring or array membership |
| `not_contains` | string, string[] | Inverse of contains |
| `starts_with` | string | String prefix |
| `is_empty` | any | Null/empty/zero check |
| `is_not_empty` | any | Has value |

#### Nested Groups (Phase 3)

For complex rules, conditions can be nested:

```json
{
  "match": "all",
  "rules": [
    { "field": "task.area_id", "operator": "equals", "value": 3 },
    {
      "match": "any",
      "rules": [
        { "field": "task.priority", "operator": "gte", "value": 2 },
        { "field": "task.tags", "operator": "contains", "value": "urgent" }
      ]
    }
  ]
}
```

This reads: "Task is in Area 3 AND (priority >= High OR tagged 'urgent')".

### 6.3 Backward Compatibility

The existing flat `trigger_config` format (`{ area_id, goal_id, priority }`) is supported as a legacy format. The engine converts it internally:

```javascript
// Legacy format:
{ "area_id": 5, "priority": 2 }

// Internally converted to:
{ "match": "all", "rules": [
  { "field": "task.area_id", "operator": "equals", "value": 5 },
  { "field": "task.priority", "operator": "equals", "value": 2 }
]}
```

### Implementation Priority

**Phase 1:** Keep flat filters, add `task.tags` contains and `task.has_due_date` checks as special cases in executeRules.

**Phase 2:** Implement full condition model with `match: all/any`, field/operator/value. Migrate existing trigger_configs. UI condition builder.

**Phase 3:** Nested groups.

---

## 7. Rule Templates

### 7.1 Design Philosophy

Templates are the primary onboarding path. When a user opens the automation settings for the first time, they should see a gallery of templates — not a blank "create rule" form. Templates bridge the gap between "I don't know what automations are" and "I have a productive system running."

### 7.2 Template Categories

#### 🌅 Morning & Evening Routines

**"Morning Focus Setup"**
```
Trigger: schedule_daily (Mon-Fri, 08:00)
Actions:
  → Create task "Morning planning" in Inbox (due: today, priority: high)
  → Send toast "Good morning! Time to plan your day."
Why: Starting the day with intention reduces anxiety and increases follow-through.
```

**"Evening Wind-Down"**
```
Trigger: schedule_daily (every day, 21:00)
Actions:
  → Create task "Review today + plan tomorrow" in Inbox (due: today)
Why: Evening review closes open loops and reduces bedtime rumination.
```

**"Monday Weekly Review"**
```
Trigger: schedule_weekly (Monday, 09:00)
Actions:
  → Create task "Weekly review" (due: today, priority: high)
  → Add tag "review"
  → Add to My Day
Why: Weekly reviews are the keystone habit of GTD. Automating the reminder ensures it happens.
```

#### ✅ Task Management

**"Auto-Triage Overdue Tasks"**
```
Trigger: task_overdue
Conditions: task.days_overdue >= 3
Actions:
  → Set priority to Critical
  → Add to My Day
  → Add tag "overdue"
Why: Tasks overdue 3+ days need attention. Escalating visibility prevents the "out of sight, out of mind" trap.
```

**"Follow-Up on Completed Work"**
```
Trigger: task_completed
Conditions: task.priority >= High
Actions:
  → Create follow-up task "Review outcome of: {{task.title}}"
  → Set due date to +2 days
Why: High-priority completions often need follow-up. This closes the accountability loop.
```

**"Quick Win Radar"**
```
Trigger: task_created
Conditions: task.estimated_minutes <= 15 AND task.estimated_minutes > 0
Actions:
  → Add tag "quick-win"
  → Add to My Day
Why: Tasks under 15 minutes should be done immediately (2-minute rule, extended). Tagging makes them findable.
```

**"Stale Task Alert"**
```
Trigger: task_stale (7 days)
Conditions: task.status != "done"
Actions:
  → Set priority to High
  → Send notification "Task hasn't moved in a week: {{task.title}}"
Why: Stale tasks indicate either procrastination or irrelevance. Surface them for a decision.
```

#### 🏆 Goal Achievement

**"Celebrate Goal Milestones"**
```
Trigger: goal_progress (threshold: 50)
Actions:
  → Send toast "Halfway there! 🎉 50% of [goal] complete"
  → Create task "Reflect on progress toward [goal]" (due: today)
Why: Celebrating milestones sustains motivation through long projects.
```

**"Goal Sprint Finisher"**
```
Trigger: goal_progress (threshold: 90)
Actions:
  → Send notification "Almost done! Just a few tasks left in [goal]"
  → Set all remaining tasks to High priority
Why: The last 10% is where projects stall. A final push notification breaks through.
```

#### 💪 Habit Building

**"Habit-Task Bridge"**
```
Trigger: task_completed
Conditions: task.goal_id = [Health goal] AND task.tags contains "exercise"
Actions:
  → Log habit "Exercise"
Why: Many habits are tracked as tasks. This bridge auto-logs the habit when the task is done.
```

**"Streak Celebration"**
```
Trigger: habit_streak (7 days)
Actions:
  → Send toast "7-day streak! 🔥 Keep it up!"
  → Create task "Reward yourself for consistency" (priority: low)
Why: Positive reinforcement at the 7-day mark is when habit formation is most fragile.
```

**"Missed Habit Recovery"**
```
Trigger: habit_missed
Actions:
  → Create task "Get back on track: [habit name]" (due: today, priority: high)
  → Add to My Day
Why: Missing a habit once is fine. Missing twice is the start of a new pattern. Immediate recovery prevents spirals.
```

#### 🎯 Focus & Deep Work

**"Post-Focus Follow-Up"**
```
Trigger: focus_completed
Conditions: focus.duration_sec >= 1500 (25min)
Actions:
  → Send toast "Great focus session! Take a 5-minute break."
  → Create task "5-min break" (due: today, priority: low, estimated: 5)
Why: Enforcing breaks after deep work prevents burnout and maintains quality across sessions.
```

**"Focus Session Streak"**
```
Trigger: focus_streak (3 sessions in one day)
Actions:
  → Send toast "3 focus sessions today! You're in the zone. 🧠"
  → Log habit "Deep Work" (if exists)
Why: Acknowledging sustained focus reinforces the behavior.
```

### 7.3 Template Data Model

Templates are stored as system defaults (user_id=0) or user-created:

```json
{
  "id": "morning-focus-setup",
  "name": "Morning Focus Setup",
  "description": "Start each weekday with a planning task",
  "category": "routines",
  "icon": "🌅",
  "trigger": {
    "type": "schedule_daily",
    "config": { "time": "08:00", "days": [1,2,3,4,5] }
  },
  "conditions": null,
  "actions": [
    { "type": "create_followup", "config": { "title": "Morning planning", "priority": 2 } },
    { "type": "send_toast", "config": { "message": "Good morning! Time to plan your day." } }
  ],
  "customizable_fields": ["trigger.config.time", "trigger.config.days"],
  "user_created": false
}
```

### 7.4 Template Installation Flow

1. User browses template gallery (categorized cards)
2. Clicks "Use This Template"
3. Modal shows template with customizable fields highlighted
4. User adjusts (e.g., changes morning time from 08:00 to 07:30, picks their Health goal)
5. Clicks "Install" → creates an automation_rule from template
6. Toast: "Automation installed! It will run starting tomorrow."

---

## 8. Smart Automations

### 8.1 System-Suggested Rules

The system analyzes user behavior and suggests automations. These are **not** auto-enabled — they appear as suggestions the user can accept or dismiss.

#### Suggestion Triggers

| Pattern Detected | Suggestion | Logic |
|-----------------|------------|-------|
| User manually adds tasks to My Day every morning | "Auto-add today's tasks to My Day" | User has added 5+ tasks to My Day in the last 7 days |
| Tasks in a goal often completed in sequence | "Auto-start next task when one finishes" | 3+ tasks in same goal completed sequentially within 7 days |
| User completes tasks and immediately creates similar ones | "Set up recurring task" | Same-titled task created within 1 day of completion, 3+ times |
| High-priority tasks often go overdue | "Escalate overdue high-priority tasks" | 3+ high-priority tasks went overdue in last 30 days |
| User logs habit after completing related tasks | "Auto-log habit on task completion" | Habit logged within 30 min of task completion in same area, 5+ times |
| User never uses a rule | "This rule hasn't fired in 30 days" | Suggest disabling or adjusting |

#### Suggestion UI

Suggestions appear as a dismissible banner at the top of the Automations settings tab:

```
💡 Suggested Automation
"You've been manually adding tasks to My Day each morning. 
 Want to automate this?"
[Set It Up]  [Dismiss]  [Don't suggest this again]
```

### 8.2 Rule Analytics

Each rule tracks execution stats (stored in `automation_rule_stats`):

- **Times fired** (total + last 7/30 days)
- **Last fired at** (timestamp)
- **Actions taken** (count by action type)
- **Affected tasks** (count of unique tasks)

This data powers:
- "Most Active Rules" dashboard widget
- "Unused Rules" cleanup suggestions
- Template recommendations based on which templates are popular

### 8.3 Behavioral Nudges

Beyond explicit rules, the system can surface contextual nudges:

| Context | Nudge | Delivery |
|---------|-------|----------|
| 3+ tasks overdue | "You have overdue tasks. Want to triage them?" | Toast on app open |
| No tasks completed today by 3pm | "Afternoon slump? Try a 25-min focus session" | Toast |
| Goal at 90%+ | "Almost there! Focus on [goal] today?" | My Day suggestion |
| 5-day habit streak in danger | "Don't break your [habit] streak! You're at 5 days." | Push notification |

These are **not** automation rules — they're system behaviors configurable via settings:
- `settings.nudges_enabled` (default: true)
- `settings.nudge_overdue_threshold` (default: 3)
- `settings.nudge_quiet_hours` (default: "22:00-07:00")

---

## 9. UI/UX Design

### 9.1 Automations Settings Tab

The automations tab in Settings is restructured into three sections:

```
┌─────────────────────────────────────────────────────┐
│ ⚡ Automations                                [+ New Rule] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 💡 Suggested: Auto-add today's tasks to My Day      │
│    [Set It Up]  [Dismiss]                           │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 📋 My Rules (3 active, 1 disabled)                  │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🟢 Auto-Triage Overdue Tasks                    │ │
│ │ When task is overdue (3+ days) →                │ │
│ │   Set priority Critical → Add to My Day         │ │
│ │ Fired 12 times · Last: 2 hours ago              │ │
│ │                        [Edit] [⏸] [🗑]          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🟢 Celebrate Habit Streaks                      │ │
│ │ When habit streak reaches 7 days →              │ │
│ │   Toast "7-day streak! 🔥"                      │ │
│ │ Fired 3 times · Last: 3 days ago                │ │
│ │                        [Edit] [⏸] [🗑]          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⚪ Morning Planning (disabled)                   │ │
│ │ Every weekday at 08:00 → Create "Plan my day"   │ │
│ │ Fired 0 times                                   │ │
│ │                        [Edit] [▶] [🗑]          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 📊 Execution Log                        [View All] │
│ • 10:32 — Auto-Triage: "Fix login bug" → Critical  │
│ • 09:15 — Auto-Triage: "Update docs" → My Day      │
│ • Yesterday — Habit Streak: 🔥 7 days!              │
└─────────────────────────────────────────────────────┘
```

### 9.2 Rule Builder Modal

The rule builder uses a sentence-style layout with progressive disclosure:

```
┌─────────────────────────────────────────────────────┐
│ ⚡ New Automation Rule                          [✕] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Rule name: [Auto-triage overdue tasks          ]    │
│                                                     │
│ ── WHEN ─────────────────────────────────────────── │
│                                                     │
│  Trigger: [▼ Task becomes overdue              ]    │
│                                                     │
│  ── AND (optional) ──────────────────── [+ Add] ── │
│                                                     │
│  ┌ Condition 1 ─────────────────────────── [✕] ┐   │
│  │ [▼ Days overdue] [▼ is at least] [  3  ]    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌ Condition 2 ─────────────────────────── [✕] ┐   │
│  │ [▼ Priority    ] [▼ is at least] [▼ Normal] │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Match: (•) All conditions  ( ) Any condition       │
│                                                     │
│ ── THEN ─────────────────────────────────────────── │
│                                                     │
│  Action 1: [▼ Set priority   ] → [▼ Critical   ]   │
│  Action 2: [▼ Add to My Day  ]                      │
│                                        [+ Action]   │
│                                                     │
│ ── PREVIEW ──────────────────────────────────────── │
│                                                     │
│  "When a task becomes overdue by 3+ days AND has    │
│   at least Normal priority, set it to Critical      │
│   and add to My Day."                               │
│                                                     │
│  📋 Would match 4 tasks right now:                  │
│     • Fix login bug (5 days overdue)                │
│     • Update API docs (3 days overdue)              │
│     • ...                                           │
│                                                     │
├─────────────────────────────────────────────────────┤
│                    [Cancel]  [Test Rule]  [Save]    │
└─────────────────────────────────────────────────────┘
```

#### Key UI Decisions

1. **Natural language preview** — Auto-generated sentence below the builder. Updates live as user changes fields. This is the primary way users understand what their rule does.

2. **Live preview ("Would match N tasks")** — For task-based triggers, shows how many existing tasks would match the conditions right now. Gives users confidence the rule is configured correctly.

3. **Dynamic action config** — Each action type shows its own config controls inline:
   - `set_priority` → priority dropdown
   - `add_tag` → tag picker (searchable, shows existing tags with colors)
   - `create_followup` → title input + optional priority/due date
   - `log_habit` → habit picker
   - `set_due_date` → mode toggle (set specific date / shift by days) + value

4. **Multiple actions** — "+ Action" button adds another row. Actions execute in order. Drag handle for reorder.

5. **Test button** — Dry-runs the rule against current data. Shows what would happen without executing. Essential for building confidence.

### 9.3 Template Gallery

Accessible via "Browse Templates" button on the automations tab:

```
┌─────────────────────────────────────────────────────┐
│ 📚 Automation Templates                        [✕] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [🔍 Search templates...                        ]    │
│                                                     │
│ Categories:  [All] [Routines] [Tasks] [Goals]       │
│              [Habits] [Focus] [Reviews]             │
│                                                     │
│ ┌─ 🌅 Morning Focus Setup ──────────────────────┐  │
│ │ Start each weekday with a planning task.       │  │
│ │ Popular · Used by 80% of active users          │  │
│ │                              [Use Template →]  │  │
│ └────────────────────────────────────────────────┘  │
│                                                     │
│ ┌─ ✅ Auto-Triage Overdue ──────────────────────┐  │
│ │ Escalate tasks overdue for 3+ days.            │  │
│ │ Staff pick · Reduces overdue by 40%            │  │
│ │                              [Use Template →]  │  │
│ └────────────────────────────────────────────────┘  │
│                                                     │
│ ┌─ 🔥 Streak Celebration ──────────────────────┐   │
│ │ Get a toast when you hit a 7-day streak.       │  │
│ │ Most installed                                 │  │
│ │                              [Use Template →]  │  │
│ └────────────────────────────────────────────────┘  │
│                                                     │
│ ... more templates ...                              │
└─────────────────────────────────────────────────────┘
```

### 9.4 Execution Log

Full execution log accessible via "View All" on the automations tab:

```
┌─────────────────────────────────────────────────────┐
│ 📊 Automation Log                              [✕] │
├─────────────────────────────────────────────────────┤
│ Filter: [▼ All Rules] [▼ All Actions] [Last 7 days]│
│                                                     │
│ Today                                               │
│ ┌───────────────────────────────────────────────┐   │
│ │ 10:32  Auto-Triage Overdue                    │   │
│ │ Task: "Fix login bug"                         │   │
│ │ → Set priority: Normal → Critical             │   │
│ │ → Added to My Day                             │   │
│ └───────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────┐   │
│ │ 09:15  Follow-Up on Completed                 │   │
│ │ Task: "Deploy v0.8.2"                         │   │
│ │ → Created: "Review outcome of: Deploy v0.8.2" │   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ Yesterday                                           │
│ ┌───────────────────────────────────────────────┐   │
│ │ 18:45  Streak Celebration                     │   │
│ │ Habit: "Reading" (7-day streak)               │   │
│ │ → Toast shown                                 │   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ [Load more...]                                      │
└─────────────────────────────────────────────────────┘
```

### 9.5 Inline Feedback

When a rule fires, the user gets **subtle, non-blocking feedback**:

- **Toast notification** (bottom-right, 3 seconds): "⚡ Auto-Triage: 'Fix login bug' → Critical"
- **Badge on Automations icon** in settings sidebar: shows count of firings since last viewed
- **Rule card pulse** in settings: briefly highlights when rule fires while settings are open

No modal popups. No blocking interruptions. Automations should feel ambient.

### 9.6 Onboarding

For new users (or users who haven't created any rules):

```
┌─────────────────────────────────────────────────────┐
│ ⚡ Automations                                      │
│                                                     │
│        🤖                                           │
│   Let automations handle the busywork               │
│                                                     │
│   Set up rules that automatically organize,         │
│   prioritize, and remind you — so you can           │
│   focus on the work itself.                         │
│                                                     │
│   [Browse Templates]     [Create from Scratch]      │
│                                                     │
│   Popular templates:                                │
│   🌅 Morning Focus Setup                            │
│   ✅ Auto-Triage Overdue Tasks                      │
│   🔥 Streak Celebration                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 10. Execution Engine Architecture

### 10.1 Event Bus Pattern

Replace inline `executeRules()` calls with a centralized event emitter:

```javascript
// src/services/automation-engine.js

const EventEmitter = require('events');

class AutomationEngine extends EventEmitter {
  constructor(db, logger, helpers) {
    super();
    this.db = db;
    this.logger = logger;
    this.helpers = helpers;
    this.executionDepth = 0;     // Prevent infinite chains
    this.executionCount = {};    // Per-user rate limiting
  }

  // Called by routes when events happen
  emit(event, context) {
    // context = { userId, task?, habit?, focus?, goal?, ... }
    super.emit('automation', { event, ...context });
  }

  // Central handler
  handleEvent({ event, userId, ...context }) {
    if (this.executionDepth >= 3) {
      this.logger.warn({ event, userId }, 'Max rule chain depth reached');
      return;
    }

    const userKey = `${userId}:${Date.now() / 60000 | 0}`;
    this.executionCount[userKey] = (this.executionCount[userKey] || 0) + 1;
    if (this.executionCount[userKey] > 50) {
      this.logger.warn({ userId }, 'Rule execution rate limit hit');
      return;
    }

    const rules = this.db.prepare(
      'SELECT * FROM automation_rules WHERE enabled=1 AND trigger_type=? AND user_id=?'
    ).all(event, userId);

    for (const rule of rules) {
      try {
        if (!this.evaluateConditions(rule, context)) continue;
        this.executionDepth++;
        this.executeActions(rule, context, userId);
        this.logExecution(rule, context, userId);
        this.executionDepth--;
      } catch (err) {
        this.executionDepth--;
        this.logger.error({ err, ruleId: rule.id }, 'Rule execution failed');
        this.logExecution(rule, context, userId, err.message);
      }
    }
  }
}
```

### 10.2 Trigger Dispatch Points

Events are emitted from their natural locations:

| Trigger | Dispatch Location | When |
|---------|------------------|------|
| `task_completed` | `PUT /api/tasks/:id` | status changes to 'done' |
| `task_updated` | `PUT /api/tasks/:id` | status changes (not done) |
| `task_created` | `POST /api/tasks` | after insert |
| `task_overdue` | scheduler job (every 1h) | due_date < today & not done |
| `task_due_today` | scheduler job (every 1h) | due_date = today |
| `task_due_soon` | scheduler job (every 1h) | due_date within N days |
| `task_stale` | scheduler job (every 6h) | no update in N days |
| `habit_logged` | `POST /api/habits/:id/log` | after log insert |
| `habit_streak` | `POST /api/habits/:id/log` | after logging, if streak = N |
| `habit_missed` | scheduler job (every 24h) | habit not logged yesterday |
| `focus_completed` | `POST /api/focus` | after session insert |
| `goal_progress` | computed after task status change | when % crosses threshold |
| `schedule_daily` | scheduler job (every 15min) | time matches config |
| `schedule_weekly` | scheduler job (every 15min) | day + time matches |

### 10.3 Scheduler Integration

Add automation-related jobs to `scheduler.js`:

```javascript
// Check overdue tasks (every hour)
register('automation-overdue', 60 * 60 * 1000, async () => {
  const users = db.prepare('SELECT DISTINCT user_id FROM automation_rules WHERE enabled=1 AND trigger_type IN (?,?,?)').all('task_overdue', 'task_due_today', 'task_due_soon');
  for (const { user_id } of users) {
    // Fire task_overdue for each overdue task
    // Fire task_due_today for each task due today
    // Fire task_due_soon for each task due within configured days
  }
});

// Check scheduled rules (every 15 minutes)
register('automation-schedule', 15 * 60 * 1000, async () => {
  const now = new Date();
  const rules = db.prepare('SELECT * FROM automation_rules WHERE enabled=1 AND trigger_type LIKE ?').all('schedule_%');
  for (const rule of rules) {
    if (shouldFireSchedule(rule, now)) {
      engine.emit(rule.trigger_type, { userId: rule.user_id, date: now.toISOString().slice(0, 10) });
    }
  }
});

// Check missed habits (daily at 06:00)
register('automation-habit-missed', 24 * 60 * 60 * 1000, async () => {
  // For each user with habit_missed rules, check yesterday's habit logs
});

// Check stale tasks (every 6 hours)
register('automation-stale', 6 * 60 * 60 * 1000, async () => {
  // For each user with task_stale rules, find tasks not updated in N days
});
```

### 10.4 Safety Mechanisms

| Mechanism | Limit | Behavior |
|-----------|-------|----------|
| Chain depth | 3 | Rules that trigger other rules stop at depth 3 |
| Rate limit | 50 actions/min/user | Excess executions are dropped + logged |
| Schedule dedup | 1 fire per rule per interval | Prevents double-firing if scheduler runs overlapping |
| Error isolation | Per-rule try/catch | One rule failure doesn't stop others |
| Disabled rules | Skip immediately | No overhead for disabled rules |
| Orphan cleanup | Scheduler job | Delete rules referencing deleted goals/tags/habits |

### 10.5 Template Variable Interpolation

Actions can reference trigger context via `{{variable}}` syntax:

| Variable | Value | Example |
|----------|-------|---------|
| `{{task.title}}` | Title of triggering task | "Review outcome of: {{task.title}}" |
| `{{task.goal_title}}` | Goal name of triggering task | "Follow up on {{task.goal_title}}" |
| `{{habit.name}}` | Name of triggering habit | "Great job on {{habit.name}}!" |
| `{{streak}}` | Current streak count | "{{streak}}-day streak! 🔥" |
| `{{date}}` | Today's date | "Weekly review for {{date}}" |
| `{{goal.title}}` | Goal name | "{{goal.title}} is 50% done!" |

Interpolation happens at execution time, not at rule creation. Variables are sanitized (HTML-escaped) before use in task titles.

---

## 11. Database Schema Changes

### 11.1 Modify `automation_rules` Table

Add columns for multi-action support, scheduling metadata, and stats tracking:

```sql
-- Migration: 004_advanced_automations.sql

-- Add columns for advanced features
ALTER TABLE automation_rules ADD COLUMN conditions TEXT DEFAULT NULL;
  -- JSON: condition tree { match, rules[] } or NULL for no conditions

ALTER TABLE automation_rules ADD COLUMN actions TEXT DEFAULT NULL;
  -- JSON array: [{ type, config }, ...] for multi-action support
  -- When present, supersedes action_type/action_config (backward compat)

ALTER TABLE automation_rules ADD COLUMN description TEXT DEFAULT '';
  -- Human-readable description of what the rule does

ALTER TABLE automation_rules ADD COLUMN template_id TEXT DEFAULT NULL;
  -- If installed from a template, the template slug

ALTER TABLE automation_rules ADD COLUMN last_fired_at DATETIME DEFAULT NULL;
  -- Timestamp of last execution

ALTER TABLE automation_rules ADD COLUMN fire_count INTEGER DEFAULT 0;
  -- Total execution count

ALTER TABLE automation_rules ADD COLUMN last_schedule_fire TEXT DEFAULT NULL;
  -- ISO date of last scheduled fire (dedup for schedule_* triggers)
```

### 11.2 New `automation_log` Table

```sql
CREATE TABLE IF NOT EXISTS automation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER REFERENCES automation_rules(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_context TEXT DEFAULT '{}',     -- JSON: the triggering event data
  actions_executed TEXT DEFAULT '[]',     -- JSON: [{ type, config, result }]
  error TEXT DEFAULT NULL,               -- Error message if execution failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automation_log_user_date ON automation_log(user_id, created_at DESC);
CREATE INDEX idx_automation_log_rule ON automation_log(rule_id);
```

### 11.3 New `automation_templates` Table

```sql
CREATE TABLE IF NOT EXISTS automation_templates (
  id TEXT PRIMARY KEY,                    -- Slug: "morning-focus-setup"
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,                 -- routines, tasks, goals, habits, focus, reviews
  icon TEXT DEFAULT '⚡',
  trigger_type TEXT NOT NULL,
  trigger_config TEXT DEFAULT '{}',
  conditions TEXT DEFAULT NULL,
  actions TEXT NOT NULL,                  -- JSON array
  customizable_fields TEXT DEFAULT '[]',  -- JSON: which fields the user can customize
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

System templates are seeded on DB initialization with hard-coded data (no user_id, no FK). They're read-only from the API.

### 11.4 New `automation_suggestions` Table

```sql
CREATE TABLE IF NOT EXISTS automation_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,         -- "auto_myday", "set_recurring", etc.
  template_id TEXT DEFAULT NULL,         -- Suggested template
  context TEXT DEFAULT '{}',             -- JSON: why this was suggested
  dismissed INTEGER DEFAULT 0,
  dismissed_permanently INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automation_suggestions_user ON automation_suggestions(user_id, dismissed);
```

### 11.5 Backward Compatibility Strategy

The existing `action_type` and `action_config` columns remain. The engine checks for the new `actions` JSON array first; if absent, falls back to single action_type/action_config. This means:

1. Existing rules continue to work unchanged
2. New rules use the `actions` array format
3. PUT /api/rules accepts either format
4. Export includes both formats for portability

The existing `trigger_config` column continues to work for flat filters. The new `conditions` column is checked first; if null, the engine falls back to trigger_config flat filters.

---

## 12. API Changes

### 12.1 Updated Routes

#### `GET /api/rules`
No change to endpoint. Response includes new fields:
```json
[{
  "id": 1,
  "name": "Auto-Triage Overdue",
  "trigger_type": "task_overdue",
  "trigger_config": "{}",
  "action_type": "set_priority",
  "action_config": "{\"priority\":3}",
  "conditions": "{\"match\":\"all\",\"rules\":[{\"field\":\"task.days_overdue\",\"operator\":\"gte\",\"value\":3}]}",
  "actions": "[{\"type\":\"set_priority\",\"config\":{\"priority\":3}},{\"type\":\"add_to_myday\",\"config\":{}}]",
  "description": "Escalate tasks overdue for 3+ days",
  "template_id": "auto-triage-overdue",
  "enabled": 1,
  "fire_count": 12,
  "last_fired_at": "2026-04-04T10:32:00Z",
  "created_at": "2026-04-01T08:00:00Z"
}]
```

#### `POST /api/rules`
Accept new fields:
```json
{
  "name": "My Rule",
  "trigger_type": "task_overdue",
  "trigger_config": {},
  "conditions": { "match": "all", "rules": [...] },
  "actions": [
    { "type": "set_priority", "config": { "priority": 3 } },
    { "type": "add_to_myday", "config": {} }
  ],
  "description": "Escalate overdue tasks"
}
```

Legacy format (single action_type/action_config) still accepted for backward compat.

#### `PUT /api/rules/:id`
Same as POST — all fields updatable via COALESCE.

### 12.2 New Routes

#### `GET /api/rules/log`
Paginated execution log:
```
GET /api/rules/log?limit=20&offset=0&rule_id=5
```
Response:
```json
{
  "logs": [{
    "id": 42,
    "rule_id": 5,
    "rule_name": "Auto-Triage Overdue",
    "trigger_type": "task_overdue",
    "trigger_context": { "task_id": 123, "task_title": "Fix login bug", "days_overdue": 5 },
    "actions_executed": [
      { "type": "set_priority", "config": { "priority": 3 }, "result": "ok" },
      { "type": "add_to_myday", "config": {}, "result": "ok" }
    ],
    "error": null,
    "created_at": "2026-04-04T10:32:00Z"
  }],
  "total": 156,
  "limit": 20,
  "offset": 0
}
```

#### `GET /api/rules/templates`
List available templates:
```json
[{
  "id": "morning-focus-setup",
  "name": "Morning Focus Setup",
  "description": "Start each weekday with a planning task",
  "category": "routines",
  "icon": "🌅",
  "trigger_type": "schedule_daily",
  "customizable_fields": ["trigger_config.time", "trigger_config.days"]
}]
```

#### `POST /api/rules/templates/:id/install`
Install a template as a new rule:
```json
{
  "customizations": {
    "trigger_config.time": "07:30",
    "trigger_config.days": [1,2,3,4,5]
  }
}
```
Returns the created rule (same as POST /api/rules).

#### `POST /api/rules/:id/test`
Dry-run a rule against current data:
```json
{
  "matches": [
    { "task_id": 123, "title": "Fix login bug", "days_overdue": 5 },
    { "task_id": 456, "title": "Update docs", "days_overdue": 3 }
  ],
  "count": 2,
  "actions_preview": [
    { "type": "set_priority", "description": "Would set priority to Critical" },
    { "type": "add_to_myday", "description": "Would add to My Day" }
  ]
}
```

#### `GET /api/rules/suggestions`
Get active suggestions for the user:
```json
[{
  "id": 1,
  "suggestion_type": "auto_myday",
  "template_id": "auto-add-myday",
  "context": { "reason": "You've manually added 8 tasks to My Day this week" },
  "created_at": "2026-04-04T06:00:00Z"
}]
```

#### `POST /api/rules/suggestions/:id/dismiss`
Dismiss a suggestion. Body: `{ "permanent": false }`.

### 12.3 Extended Trigger/Action Type Constants

```javascript
const VALID_TRIGGER_TYPES = [
  // Task triggers
  'task_completed', 'task_created', 'task_updated', 'task_overdue',
  'task_due_today', 'task_due_soon', 'task_stale',
  // Goal triggers
  'goal_progress', 'goal_all_tasks_done',
  // Habit triggers
  'habit_logged', 'habit_streak', 'habit_missed',
  // Focus triggers
  'focus_completed', 'focus_streak',
  // Schedule triggers
  'schedule_daily', 'schedule_weekly', 'schedule_monthly',
  // Review triggers
  'daily_review_saved', 'weekly_review_saved',
];

const VALID_ACTION_TYPES = [
  // Task actions
  'add_to_myday', 'remove_from_myday', 'set_priority', 'set_status',
  'set_due_date', 'add_tag', 'move_to_goal', 'create_followup',
  'add_subtasks', 'apply_template',
  // Habit actions
  'log_habit', 'create_habit_task',
  // Notification actions
  'send_notification', 'send_toast',
  // Organization actions
  'move_to_inbox', 'archive_goal', 'create_review_prompt',
];
```

---

## 13. Security Considerations

### 13.1 Execution Safety

| Risk | Mitigation |
|------|-----------|
| Infinite loops (rule A triggers rule B triggers rule A) | Max chain depth = 3, enforced in engine |
| Runaway execution (overdue check fires 1000 rules) | Rate limit: 50 actions/min/user |
| Resource exhaustion (huge JSON in conditions) | Max conditions: 20 rules per condition tree. Max actions: 10 per rule |
| Template injection ({{task.title}} in notification) | HTML-escape all interpolated variables |
| Cross-user data access | All queries filter by user_id. Actions verify ownership of target entities (goal, tag, habit) |
| Stale references | Rules referencing deleted goals/tags/habits fail gracefully (skip action, log warning) |
| Schedule abuse | Max 10 schedule_* rules per user. Min interval: 15 minutes |

### 13.2 Input Validation

- `conditions` JSON: Zod schema validation on create/update. Max depth 2 (one level of nesting).
- `actions` JSON array: Max 10 actions per rule. Each action validated against type-specific schema.
- `trigger_config` for schedules: Time validated as HH:MM. Days validated as 0-6 array. Day-of-month validated as 1-28 (avoid month-end Edge cases).
- Template customizations: Only fields in `customizable_fields` can be modified.

### 13.3 Data Retention

- `automation_log` entries auto-pruned after 30 days (scheduler job)
- `automation_suggestions` dismissed permanently are deleted after 90 days
- Rule `fire_count` and `last_fired_at` are cumulative (never pruned)

---

## 14. Implementation Phases

### Phase 1: Quick Wins (Foundation) — ~2-3 days

**Goal:** Fix bugs, complete existing features, add execution logging.

#### 1.1 Fix Existing Bugs
- [ ] `create_followup` action: Add user_id to created task
- [ ] `task_created` trigger: Add executeRules call in POST /api/tasks
- [ ] `move_to_goal` action: Implement execution logic

#### 1.2 Add Execution Log
- [ ] Create `automation_log` table (migration 004)
- [ ] Log every rule execution in executeRules()
- [ ] Add `GET /api/rules/log` endpoint (paginated)
- [ ] Add `last_fired_at` and `fire_count` columns to automation_rules

#### 1.3 Complete Trigger Config UI
- [ ] Area/Goal/Priority filter dropdowns in rule builder modal
- [ ] Tag selector for `add_tag` action (searchable dropdown of user's tags)
- [ ] Goal selector for `move_to_goal` action

#### 1.4 Enable Rule Editing
- [ ] "Edit" button on rule cards → reopens builder modal with populated fields
- [ ] All fields editable (name, trigger, conditions, action, config)

#### 1.5 Add Missing Action Implementations
- [ ] `send_notification`: Use push.service.js to send push notification
- [ ] `set_status`: Update task status
- [ ] `set_due_date`: Set or shift due date (mode: set/shift, value)
- [ ] `remove_from_myday`: Set my_day=0

#### 1.6 Safety
- [ ] Wrap executeRules in transaction
- [ ] Add try/catch per rule with error logging
- [ ] Add chain depth limit (3)
- [ ] Add rate limit (50/min/user)

**Phase 1 Deliverables:** Working rule CRUD + editing, execution logging, 10 trigger+action types fully functional, safety guardrails.

---

### Phase 2: Core Engine (Conditions + Templates + New Triggers) — ~4-5 days

**Goal:** Full condition system, template gallery, background triggers.

#### 2.1 Condition System
- [ ] Implement condition evaluator: `evaluateConditions(rule, context)`
- [ ] Support `match: all/any` with field/operator/value rules
- [ ] Backward-compat conversion from flat trigger_config to conditions
- [ ] Zod validation for conditions JSON
- [ ] Condition builder UI (field → operator → value rows, AND/OR toggle)

#### 2.2 Multi-Action Support
- [ ] Add `actions` column to automation_rules
- [ ] Engine: check `actions` array first, fall back to single action_type/action_config
- [ ] UI: "+ Action" button, drag-to-reorder, per-action config

#### 2.3 New Triggers
- [ ] `task_overdue` scheduler job (hourly)
- [ ] `task_due_today` scheduler job (hourly)
- [ ] `task_due_soon` scheduler job (hourly, configurable days)
- [ ] `habit_logged` dispatch from POST /api/habits/:id/log
- [ ] `habit_streak` calculation + dispatch
- [ ] `focus_completed` dispatch from POST /api/focus
- [ ] `goal_progress` calculation + dispatch after task status change

#### 2.4 New Actions
- [ ] `log_habit`: POST to habit_logs from automation
- [ ] `send_toast`: Return toast payload to client via SSE or polling
- [ ] `add_subtasks`: Insert subtask rows

#### 2.5 Template System
- [ ] Create `automation_templates` table
- [ ] Seed 10 built-in templates on DB init
- [ ] `GET /api/rules/templates` endpoint
- [ ] `POST /api/rules/templates/:id/install` endpoint
- [ ] Template gallery UI (categorized, searchable)
- [ ] Install flow with customization modal

#### 2.6 Rule Testing
- [ ] `POST /api/rules/:id/test` dry-run endpoint
- [ ] "Test Rule" button in builder modal
- [ ] Live preview: "Would match N tasks right now"

#### 2.7 UI Polish
- [ ] Natural language preview below builder
- [ ] Execution log panel in automations tab
- [ ] Rule cards with fire count + last fired timestamp
- [ ] Subtle toast when rules fire during normal use

**Phase 2 Deliverables:** Full condition system, 15+ triggers, 15+ actions, template gallery with 10 templates, rule testing, execution visibility.

---

### Phase 3: Advanced Intelligence — ~3-4 days

**Goal:** Smart suggestions, behavioral nudges, advanced scheduling.

#### 3.1 Smart Suggestions
- [ ] Create `automation_suggestions` table
- [ ] Suggestion engine: analyze user behavior weekly (scheduler job)
- [ ] Pattern detectors: manual My Day, sequential completions, repeated task creation
- [ ] `GET /api/rules/suggestions` endpoint
- [ ] Suggestion banner UI in automations tab
- [ ] Dismiss + "don't suggest again" actions

#### 3.2 Schedule Triggers
- [ ] `schedule_daily` with time + day-of-week config
- [ ] `schedule_weekly` with day + time config
- [ ] `schedule_monthly` with day-of-month + time config
- [ ] Schedule dedup (last_schedule_fire column)
- [ ] Schedule trigger UI (time picker, day selector)

#### 3.3 Advanced Triggers
- [ ] `task_stale` (scheduler, configurable days)
- [ ] `habit_missed` (daily scheduler, previous day check)
- [ ] `focus_streak` (N sessions in one day)
- [ ] `goal_all_tasks_done` (all tasks in goal complete)
- [ ] `daily_review_saved` + `weekly_review_saved`

#### 3.4 Advanced Actions
- [ ] `apply_template`: Create subtasks from task template
- [ ] `create_habit_task`: Create task linked to habit
- [ ] `create_review_prompt`: Add note to daily review
- [ ] `archive_goal`: Set goal archived=1

#### 3.5 Behavioral Nudges
- [ ] Settings: `nudges_enabled`, `nudge_quiet_hours`
- [ ] Overdue task nudge (toast on app open)
- [ ] Afternoon productivity nudge
- [ ] Goal progress nudge (90%+)
- [ ] Streak danger nudge (push notification)

#### 3.6 Nested Conditions (Optional)
- [ ] Support one level of condition nesting (AND containing OR groups)
- [ ] UI: indented condition groups with "Add Group" button

#### 3.7 Variable Interpolation
- [ ] `{{task.title}}`, `{{habit.name}}`, `{{streak}}`, `{{date}}`, `{{goal.title}}` in action configs
- [ ] HTML escaping for all interpolated values
- [ ] Preview in builder modal

#### 3.8 Maintenance
- [ ] Automation log pruning (30 days, scheduler job)
- [ ] Orphan rule cleanup (references to deleted entities)
- [ ] Rule analytics: times fired, affected tasks, per-rule stats
- [ ] "Most Active Rules" in stats dashboard

**Phase 3 Deliverables:** Smart suggestions, scheduled rules, behavioral nudges, 20+ triggers, 20+ actions, full template library, variable interpolation.

---

## 15. Testing Strategy

### 15.1 Unit Tests

| Area | Tests | Priority |
|------|-------|----------|
| Condition evaluator | Field extraction, all operators, AND/OR logic, nested groups, edge cases (null fields, missing data) | Phase 2 |
| Action executor | Each action type individually, multi-action sequencing, error isolation | Phase 1-2 |
| Template interpolation | Variable replacement, HTML escaping, missing variables, malicious input | Phase 3 |
| Schedule matcher | Time matching, day-of-week, dedup, timezone edge cases | Phase 3 |

### 15.2 Integration Tests

| Area | Tests | Priority |
|------|-------|----------|
| Trigger → Condition → Action chain | Create rule → trigger event → verify action executed + logged | Phase 1 |
| Multi-action execution | Rule with 3 actions → all execute in order | Phase 2 |
| Chain depth limit | Rule A triggers Rule B triggers Rule C → stops at depth 3 | Phase 1 |
| Rate limiting | Fire 60 events in 1 minute → last 10 dropped + logged | Phase 1 |
| Template install | Install template → customizations applied → rule created correctly | Phase 2 |
| Rule dry-run | Test endpoint returns correct matches without side effects | Phase 2 |
| Backward compat | Old-format rules (single action_type) still execute correctly | Phase 2 |
| Export/import with new format | Export rules with conditions/actions → import → rules work | Phase 2 |

### 15.3 Security Tests

| Area | Tests | Priority |
|------|-------|----------|
| Cross-user rule access | User A can't see/edit/delete User B's rules | Phase 1 |
| Cross-user action execution | Rule can't modify tasks/goals owned by another user | Phase 1 |
| Condition injection | Malicious JSON in conditions field | Phase 2 |
| Template interpolation XSS | `{{task.title}}` with HTML in title | Phase 3 |
| Schedule abuse | Creating 100+ schedule rules → rejected at limit | Phase 3 |

### 15.4 Frontend Tests

| Area | Tests | Priority |
|------|-------|----------|
| Rule builder renders correctly | All fields, dynamic config panels | Phase 1 |
| Condition builder UI | Add/remove conditions, AND/OR toggle | Phase 2 |
| Template gallery | Categories filter, search, install flow | Phase 2 |
| Execution log display | Pagination, filtering, timestamps | Phase 1 |
| Natural language preview | Updates on field change, readable output | Phase 2 |

---

## Appendix A: Template Catalog (Full List)

| ID | Name | Category | Trigger | Priority |
|----|------|----------|---------|----------|
| `morning-focus-setup` | Morning Focus Setup | routines | schedule_daily | Phase 2 |
| `evening-wind-down` | Evening Wind-Down | routines | schedule_daily | Phase 2 |
| `monday-weekly-review` | Monday Weekly Review | routines | schedule_weekly | Phase 3 |
| `auto-triage-overdue` | Auto-Triage Overdue | tasks | task_overdue | Phase 2 |
| `followup-on-completed` | Follow-Up on Completed | tasks | task_completed | Phase 1 |
| `quick-win-radar` | Quick Win Radar | tasks | task_created | Phase 2 |
| `stale-task-alert` | Stale Task Alert | tasks | task_stale | Phase 3 |
| `celebrate-milestone` | Celebrate Goal Milestones | goals | goal_progress | Phase 2 |
| `goal-sprint-finisher` | Goal Sprint Finisher | goals | goal_progress | Phase 3 |
| `habit-task-bridge` | Habit-Task Bridge | habits | task_completed | Phase 2 |
| `streak-celebration` | Streak Celebration | habits | habit_streak | Phase 2 |
| `missed-habit-recovery` | Missed Habit Recovery | habits | habit_missed | Phase 3 |
| `post-focus-followup` | Post-Focus Follow-Up | focus | focus_completed | Phase 2 |
| `focus-session-streak` | Focus Session Streak | focus | focus_streak | Phase 3 |

## Appendix B: Event→Webhook Alignment

Automation triggers should align with existing webhook events where possible:

| Webhook Event | Automation Trigger | Status |
|--------------|-------------------|--------|
| `task.created` | `task_created` | Align |
| `task.updated` | `task_updated` | Align |
| `task.completed` | `task_completed` | Align |
| `task.deleted` | — | Not needed for automations |
| `goal.created` | — | Low value for automations |
| `goal.completed` | `goal_all_tasks_done` | Related |
| `habit.logged` | `habit_logged` | Align |
| `focus.completed` | `focus_completed` | Align |

Consider unifying the event system: webhook dispatch and automation dispatch use the same event bus.

## Appendix C: Existing Code Locations

| Component | File | Lines | Notes |
|-----------|------|-------|-------|
| CRUD routes | `src/routes/productivity.js` | 6-50 | GET/POST/PUT/DELETE /api/rules |
| executeRules() | `src/helpers.js` | 139-160 | Current execution engine |
| Trigger dispatch | `src/routes/tasks.js` | 456-463 | task_completed + task_updated |
| DB schema | `src/db/index.js` | 421-432 | automation_rules table |
| Scheduler | `src/scheduler.js` | 1-120+ | Background job infrastructure |
| Push service | `src/services/push.service.js` | — | Notification delivery |
| Frontend UI | `public/app.js` | ~5713-5790 | Rule list + create modal |
| Webhook events | `src/routes/features.js` | 678-680 | WEBHOOK_EVENTS constant |

---

*Generated by expert panel brainstorm — 4 April 2026*
