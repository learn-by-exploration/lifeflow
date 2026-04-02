# Templates Expansion v2 + Deadline Notifications — Spec

> **Version:** v0.7.53 · **Date:** 2 April 2026  
> **Baseline:** 15 list templates across 5 categories; scheduler with 2 jobs; push infra operational but server-side never auto-triggered  
> **Target:** ~27 list templates across 9 categories; scheduler sends push notifications for overdue/due-today tasks  
> **Scope:** Backend template data + new scheduler job + push integration

---

## Table of Contents

1. [Feature 1: List Templates Expansion v2](#feature-1-list-templates-expansion-v2)
2. [Feature 2: Deadline Notification Scheduler Job](#feature-2-deadline-notification-scheduler-job)
3. [Files to Modify](#files-to-modify)
4. [Test Plan](#test-plan)
5. [Rollout & Risk](#rollout--risk)

---

## Feature 1: List Templates Expansion v2

### Problem

The current 15 templates cover Home & Life, Entertainment & Media, Travel & Events, Personal, and Health & Wellness. Missing entirely: **Work & Productivity, Finance, Education & Learning, Food & Cooking, and Seasonal/Situational** — categories that represent some of the most common personal checklists people maintain.

### Design Goals

1. Add 12 new templates across 4 new categories
2. Zero schema changes — templates remain hardcoded in `LIST_TEMPLATES` array in `src/routes/lists.js`
3. Existing `POST /api/lists/from-template` endpoint works unchanged
4. Each template has 8–12 realistic, actionable items (not generic placeholders)

### Existing Templates (15 — DO NOT MODIFY)

| Category | Templates |
|----------|-----------|
| Home & Life | weekly-groceries, home-maintenance, cleaning-routine |
| Entertainment & Media | movies-to-watch, books-to-read, tv-shows, podcasts |
| Travel & Events | travel-packing, moving-checklist, party-planning, camping-trip |
| Personal | gift-ideas, bucket-list, restaurants-to-try |
| Health & Wellness | workout-routine |

### New Templates (12)

#### Category: Work & Productivity

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `meeting-agenda` | Meeting Agenda | checklist | 📋 | Review action items from last meeting, Share progress updates, Discuss blockers and dependencies, Review upcoming deadlines, Assign new action items, Set next meeting date, Share relevant documents, Capture decisions made, Identify risks, Confirm attendee follow-ups |
| `project-launch` | Project Launch Checklist | checklist | 🚀 | Define project scope and goals, Identify stakeholders, Create project timeline, Set up communication channels, Assign team roles, Prepare launch announcement, Test all deliverables, Create rollback plan, Schedule post-launch review, Update documentation |
| `onboarding-checklist` | New Employee Onboarding | checklist | 🤝 | Set up workstation and accounts, Complete HR paperwork, Review company handbook, Meet team members, Set up email and calendar, Get building access/badge, Schedule 1:1 with manager, Review first-week goals, Join relevant Slack channels, Complete security training, Set up dev environment, Review team documentation |

#### Category: Finance

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `monthly-bills` | Monthly Bills Tracker | checklist | 💳 | Rent/Mortgage, Electricity, Water/Sewer, Internet, Phone plan, Car insurance, Health insurance, Streaming subscriptions, Gym membership, Credit card payment, Student loans, Groceries budget |
| `subscription-tracker` | Subscription Tracker | checklist | 🔄 | Netflix, Spotify, Cloud storage, News subscription, Software licenses, Meal kit service, App subscriptions, Domain renewals, Password manager, VPN service |
| `savings-goals` | Savings Goals | notes | 🎯 | Emergency fund (3–6 months expenses), Vacation fund, Down payment savings, Retirement contribution, New car fund, Home improvement fund, Education fund, Investment portfolio review, Debt payoff target, Side project budget |

#### Category: Education & Learning

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `study-plan` | Study Plan | checklist | 📖 | Review lecture notes, Complete practice problems, Read assigned chapters, Watch supplementary videos, Create flashcards for key terms, Join study group session, Review past exams, Summarize main concepts, Ask instructor about unclear topics, Take practice quiz |
| `course-progress` | Course Progress Tracker | checklist | 🎓 | Complete Module 1: Introduction, Complete Module 2: Fundamentals, Complete Module 3: Intermediate concepts, Complete Module 4: Advanced topics, Submit Assignment 1, Submit Assignment 2, Complete midterm project, Review peer feedback, Submit final project, Get course certificate |
| `language-learning` | Language Learning | checklist | 🌍 | Practice vocabulary (20 min), Listen to podcast in target language, Complete grammar exercise, Write 5 sentences, Have conversation practice, Review flashcard deck, Watch show with subtitles, Read a short article, Record yourself speaking, Learn 10 new words |

#### Category: Seasonal & Situational

| ID | Name | Type | Icon | Items |
|----|------|------|------|-------|
| `spring-cleaning` | Spring Cleaning | checklist | 🌸 | Deep clean kitchen appliances, Wash windows inside and out, Clean behind furniture, Organize closets and donate, Flip/rotate mattresses, Clean light fixtures, Wash curtains and blinds, Declutter garage/storage, Power wash exterior, Clean out medicine cabinet, Organize pantry, Service lawn mower |
| `holiday-prep` | Holiday Prep | checklist | 🎄 | Set holiday budget, Create gift list with budget per person, Order gifts by shipping deadline, Plan holiday meals and menu, Buy decorations, Send holiday cards, Schedule travel/accommodations, Plan outfits for events, Coordinate with family on plans, Wrap and label gifts, Prepare guest room, Stock up on baking supplies |
| `new-apartment` | New Apartment Setup | checklist | 🏢 | Set up utilities (electric, gas, water), Get internet installed, Change locks or get new keys, Update address everywhere, Get renter's insurance, Buy essential furniture, Set up kitchen basics, Stock cleaning supplies, Meet neighbors, Find nearest grocery/pharmacy, Register to vote at new address, Update vehicle registration |

### Template Data Format

Each entry follows the existing structure:

```js
{
  id: 'meeting-agenda',          // kebab-case, unique
  name: 'Meeting Agenda',        // display name
  type: 'checklist',             // checklist | grocery | notes
  icon: '📋',                    // single emoji
  category: 'Work & Productivity', // group label for UI
  items: ['Review action items from last meeting', ...]  // 8-12 strings
}
```

### Implementation

Append the 12 new template objects to the `LIST_TEMPLATES` array in `src/routes/lists.js` (after line ~30). No other backend changes needed. The frontend template picker already groups by `category` dynamically.

---

## Feature 2: Deadline Notification Scheduler Job

### Problem

LifeFlow has complete push notification infrastructure:
- `pushService.sendPush(db, userId, payload)` sends web push to all user subscriptions
- `push_subscriptions` table stores VAPID subscriptions per user
- `push_notification_log` table tracks sent notifications for deduplication
- Service worker handles `push` events and shows OS notifications
- Client-side `scheduleNotifications()` polls every 5 min — but only works when the app tab is open and focused

**The gap:** The server never proactively sends deadline notifications. If a user's tasks become overdue or due today, they only find out if they open the app. The scheduler runs two jobs (session cleanup, recurring spawn) but doesn't touch push notifications.

### Design Goals

1. New scheduler job `deadline-notifications` runs every 30 minutes
2. For each user with active push subscriptions, check for overdue and due-today tasks
3. Send a single grouped notification per user (not one per task)
4. Use existing `push_notification_log` table for deduplication — don't re-notify for the same set of tasks within 24 hours
5. No new DB tables — reuse `push_notification_log` with type `'deadline'`
6. Graceful no-op when VAPID keys aren't configured (`pushService.isEnabled()` returns false)
7. Habit reminders are out of scope (v2)

### Architecture

```
scheduler.js
  └─ deadline-notifications job (every 30 min)
       ├─ pushService.isEnabled()? → bail if false
       ├─ Find users with active push_subscriptions
       ├─ For each user:
       │    ├─ Query overdue + due-today tasks (status != 'done')
       │    ├─ Exclude tasks already in push_notification_log
       │    │    where type='deadline' AND sent_at > datetime('now','-24 hours')
       │    ├─ If no un-notified tasks → skip
       │    ├─ Build notification payload (grouped)
       │    ├─ pushService.sendPush(db, userId, payload)
       │    └─ Insert rows into push_notification_log for each notified task
       └─ Log summary: { usersNotified, totalTasks }
```

### Notification Payload

Single notification per user, grouped:

```js
// 1 overdue task, 2 due today
{
  title: '⏰ 3 tasks need attention',
  body: '1 overdue · 2 due today',
  url: '/',              // opens Today view
  tag: 'deadline-batch', // replaces previous deadline notification
  requireInteraction: true
}

// Only overdue
{
  title: '⚠️ 2 overdue tasks',
  body: 'Report Q1 results, Submit expense report',
  url: '/',
  tag: 'deadline-batch',
  requireInteraction: true
}

// Only 1 task due today
{
  title: '📅 Task due today',
  body: 'Review pull request #42',
  url: '/tasks/17',       // deep link to specific task
  tag: 'deadline-batch',
  requireInteraction: false
}
```

**Logic for `title` and `body`:**

| Overdue | Due Today | Title | Body |
|---------|-----------|-------|------|
| 0 | 1 | 📅 Task due today | `{task title}` |
| 0 | N>1 | 📅 {N} tasks due today | First 2 titles + "and {N-2} more" |
| M>0 | 0 | ⚠️ {M} overdue task(s) | First 2 titles + "and {M-2} more" |
| M>0 | N>0 | ⏰ {M+N} tasks need attention | `{M} overdue · {N} due today` |

### Deduplication Strategy

Use the existing `push_notification_log` table:

```sql
-- Schema (already exists):
-- push_notification_log (id, user_id, task_id, type, sent_at)

-- Find tasks NOT notified in last 24 hours:
SELECT t.id, t.title, t.due_date
FROM tasks t
WHERE t.status != 'done'
  AND t.due_date IS NOT NULL
  AND t.due_date <= date('now')
  AND t.user_id = ?
  AND NOT EXISTS (
    SELECT 1 FROM push_notification_log pnl
    WHERE pnl.task_id = t.id
      AND pnl.user_id = t.user_id
      AND pnl.type = 'deadline'
      AND pnl.sent_at > datetime('now', '-24 hours')
  )
ORDER BY t.due_date ASC, t.priority DESC
```

After sending, log each notified task:

```sql
INSERT INTO push_notification_log (user_id, task_id, type)
VALUES (?, ?, 'deadline')
```

This means:
- A task due today gets notified once, then not again for 24h
- If the user doesn't complete it, it gets re-notified the next day (still overdue)
- Completing the task (`status = 'done'`) removes it from future queries
- The 24h window prevents duplicate notifications if the scheduler fires multiple times

### Scheduler Job Implementation

```js
// In scheduler.js registerBuiltinJobs():

register('deadline-notifications', 30 * 60 * 1000, async () => {
  const pushService = require('./services/push.service');
  if (!pushService.isEnabled()) return;

  // Get distinct users who have push subscriptions
  const users = db.prepare(
    'SELECT DISTINCT user_id FROM push_subscriptions'
  ).all();

  let usersNotified = 0;
  let totalTasks = 0;

  for (const { user_id } of users) {
    // Find overdue tasks not recently notified
    const overdue = db.prepare(`
      SELECT t.id, t.title, t.due_date FROM tasks t
      WHERE t.status != 'done' AND t.due_date < date('now')
        AND t.user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM push_notification_log pnl
          WHERE pnl.task_id = t.id AND pnl.user_id = ?
            AND pnl.type = 'deadline'
            AND pnl.sent_at > datetime('now', '-24 hours')
        )
      ORDER BY t.due_date ASC, t.priority DESC
    `).all(user_id, user_id);

    // Find due-today tasks not recently notified
    const dueToday = db.prepare(`
      SELECT t.id, t.title, t.due_date FROM tasks t
      WHERE t.status != 'done' AND t.due_date = date('now')
        AND t.user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM push_notification_log pnl
          WHERE pnl.task_id = t.id AND pnl.user_id = ?
            AND pnl.type = 'deadline'
            AND pnl.sent_at > datetime('now', '-24 hours')
        )
      ORDER BY t.priority DESC
    `).all(user_id, user_id);

    const all = [...overdue, ...dueToday];
    if (all.length === 0) continue;

    // Build notification payload
    const payload = buildDeadlinePayload(overdue, dueToday);

    // Send push
    await pushService.sendPush(db, user_id, payload);

    // Log each task to prevent re-notification within 24h
    const insertLog = db.prepare(
      `INSERT INTO push_notification_log (user_id, task_id, type) VALUES (?, ?, 'deadline')`
    );
    for (const task of all) {
      insertLog.run(user_id, task.id);
    }

    usersNotified++;
    totalTasks += all.length;
  }

  if (usersNotified > 0) {
    logger.info({ usersNotified, totalTasks }, 'Sent deadline notifications');
  }
});
```

### Helper: `buildDeadlinePayload(overdue, dueToday)`

```js
function buildDeadlinePayload(overdue, dueToday) {
  const total = overdue.length + dueToday.length;

  // Single task due today — specific notification
  if (overdue.length === 0 && dueToday.length === 1) {
    return {
      title: '📅 Task due today',
      body: dueToday[0].title,
      url: `/tasks/${dueToday[0].id}`,
      tag: 'deadline-batch',
      requireInteraction: false
    };
  }

  // Single overdue task
  if (overdue.length === 1 && dueToday.length === 0) {
    return {
      title: '⚠️ 1 overdue task',
      body: overdue[0].title,
      url: `/tasks/${overdue[0].id}`,
      tag: 'deadline-batch',
      requireInteraction: true
    };
  }

  // Only overdue
  if (dueToday.length === 0) {
    return {
      title: `⚠️ ${overdue.length} overdue tasks`,
      body: formatTaskList(overdue),
      url: '/',
      tag: 'deadline-batch',
      requireInteraction: true
    };
  }

  // Only due today
  if (overdue.length === 0) {
    return {
      title: `📅 ${dueToday.length} tasks due today`,
      body: formatTaskList(dueToday),
      url: '/',
      tag: 'deadline-batch',
      requireInteraction: false
    };
  }

  // Mixed
  return {
    title: `⏰ ${total} tasks need attention`,
    body: `${overdue.length} overdue · ${dueToday.length} due today`,
    url: '/',
    tag: 'deadline-batch',
    requireInteraction: true
  };
}

function formatTaskList(tasks) {
  if (tasks.length <= 2) {
    return tasks.map(t => t.title).join(', ');
  }
  return `${tasks[0].title}, ${tasks[1].title} and ${tasks.length - 2} more`;
}
```

### User Opt-out

Users who don't want deadline notifications can:
1. Not subscribe to push notifications (no `push_subscriptions` row → skipped)
2. Unsubscribe via the existing `DELETE /api/push/subscribe` endpoint

A per-notification-type toggle (e.g., settings key `deadline_notifications_enabled`) is a v2 enhancement — for now, push subscription = opted in to all server-side notifications.

### Edge Cases

| Case | Behavior |
|------|----------|
| VAPID keys not configured | `pushService.isEnabled()` returns false → job is a no-op |
| User has no push subscriptions | Not in `SELECT DISTINCT user_id` query → skipped |
| Task completed between check intervals | `status != 'done'` filter excludes it |
| Task already notified <24h ago | `NOT EXISTS` subquery excludes it |
| Task notified >24h ago, still overdue | Re-notified (still overdue, user should act) |
| 50+ overdue tasks | Notification body shows first 2 + "and 48 more" |
| Push subscription expired (410) | `pushService.sendPush` already handles cleanup |
| Scheduler fires twice rapidly | Second run finds no un-notified tasks → sends nothing |
| Server restart | Job runs immediately on startup (existing scheduler behavior), then every 30 min |

---

## Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `src/routes/lists.js` | Append 12 new template objects to `LIST_TEMPLATES` array | ~60 lines added |
| `src/scheduler.js` | Add `deadline-notifications` job in `registerBuiltinJobs()`, add `buildDeadlinePayload()` and `formatTaskList()` helpers | ~80 lines added |
| `src/scheduler.js` | Add `require('./services/push.service')` at top | 1 line |
| `tests/lists-templates.test.js` | Verify new template IDs, categories, item counts | ~40 lines added |
| `tests/scheduler-deadline.test.js` | **New file** — test deadline notification job logic | ~200 lines |
| `tests/web-push.test.js` | Add integration tests for deadline notification dedup | ~50 lines added |

### Files NOT Modified

- `src/db/index.js` — no schema changes; `push_notification_log` table already exists
- `public/app.js` — client-side polling continues independently
- `public/sw.js` — already handles `push` events generically
- `src/services/push.service.js` — `sendPush()` API is sufficient as-is

---

## Test Plan

### Feature 1: List Templates

| # | Test | Assert |
|---|------|--------|
| T1 | `GET /api/lists/templates` returns all 27 templates | `response.length === 27` |
| T2 | Each template has required fields (id, name, type, icon, category, items) | Schema validation |
| T3 | All template IDs are unique | `new Set(ids).size === ids.length` |
| T4 | Each template has 8–12 items | `items.length >= 8 && items.length <= 12` |
| T5 | New categories present: Work & Productivity, Finance, Education & Learning, Seasonal & Situational | Category set check |
| T6 | `POST /api/lists/from-template` works for each new template ID | Creates list with correct items |
| T7 | Template types are valid enum values | `['checklist', 'grocery', 'notes'].includes(type)` |

### Feature 2: Deadline Notifications

| # | Test | Assert |
|---|------|--------|
| D1 | Job is no-op when push not enabled | `sendPush` not called |
| D2 | Job skips users with no push subscriptions | No queries for those users |
| D3 | Overdue task triggers notification | `sendPush` called with `type: 'deadline'` log entry |
| D4 | Due-today task triggers notification | Correct title/body format |
| D5 | Already-notified task (<24h) is excluded | `NOT EXISTS` dedup works |
| D6 | Task notified >24h ago is re-notified | Old log entry doesn't block |
| D7 | Completed task (`status='done'`) is excluded | Not in query results |
| D8 | Single overdue → specific title/body | `"⚠️ 1 overdue task"` |
| D9 | Single due-today → specific title with deep link | URL is `/tasks/{id}` |
| D10 | Mixed overdue + due-today → grouped message | `"⏰ N tasks need attention"` |
| D11 | 5+ tasks → body truncated to first 2 + "and N more" | `formatTaskList` logic |
| D12 | `push_notification_log` rows inserted after send | One row per task |
| D13 | Job runs on scheduler start (immediate) | Existing scheduler behavior |
| D14 | Multiple users notified independently | User A's tasks don't appear in User B's notification |

### `buildDeadlinePayload` Unit Tests

| # | Input | Expected Title |
|---|-------|----------------|
| P1 | 0 overdue, 1 today | `📅 Task due today` |
| P2 | 0 overdue, 3 today | `📅 3 tasks due today` |
| P3 | 1 overdue, 0 today | `⚠️ 1 overdue task` |
| P4 | 4 overdue, 0 today | `⚠️ 4 overdue tasks` |
| P5 | 2 overdue, 3 today | `⏰ 5 tasks need attention` |

---

## Rollout & Risk

| Risk | Mitigation |
|------|------------|
| Notification spam if scheduler misfires | 24h dedup window in `push_notification_log`; `tag: 'deadline-batch'` replaces previous notification in-tray |
| Performance with many users | Query only users with subscriptions; lightweight queries; 30-min interval is conservative |
| Push service errors (network, quota) | `sendPush` already has per-subscription error handling and cleanup of expired subs |
| VAPID keys not set in production | Job is a complete no-op; no errors logged |
| Template bloat in memory | 27 static objects, negligible (~5KB) |

### Out of Scope (v2)

- Per-notification-type toggle in user settings
- Habit reminder notifications via scheduler
- Configurable notification schedule (morning/evening digest)
- Custom notification sound
- User-created list templates
- Snooze/dismiss tracking for notifications
