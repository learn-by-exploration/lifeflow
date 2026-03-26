---
status: Implemented
baseline: v0.0.11
---

# LifeFlow Focus & Task Completion — 12-Expert Panel Review

> **Expert Panel Design Document**
> Date: 2026-03-24 | Baseline: v0.0.11 (711 tests, 0 failures)
> Current Focus Feature: Basic Pomodoro timer (25/5/15), session logging, stats
> Goal: Transform focus into a comprehensive task completion system

---

## Current State Assessment

### What Exists (v0.0.11)
- **Timer overlay** with circular SVG progress ring
- **3 modes**: Focus (25m), Short Break (5m), Long Break (15m)
- **User-configurable** durations in Settings
- **Session logging**: POST `/api/focus` records task_id, duration_sec, type
- **Stats**: today/week totals, sessions count, by-task breakdown
- **History**: paginated list with 14-day daily aggregates
- **Entry points**: task card button, command palette
- **DB**: `focus_sessions` table with FK to tasks (CASCADE delete)

### What's Missing
- No guided task completion workflow
- No task breakdown into steps before focusing
- No progress tracking within a focus session
- No ambient sounds, environment settings, or distraction blocking
- No session intentions/reflection
- No smart scheduling (when to focus, energy tracking)
- No rewards, streaks, or motivation systems beyond raw stats
- No "ended_at" timestamp (only started_at + duration_sec)

---

## Part 1: Product Manager Reviews

### PM 1 — User Journey & Core Flow

**Finding PM1-1: Focus is disconnected from task completion (Critical)**
The current focus timer is a standalone clock. There's no connection between "I want to finish this task" and "I'll focus on it." Users need a **Task Completion Flow** — a guided path from "I have a task" to "I've completed it." The timer should be one tool within that flow, not the entire experience.

**Recommended Flow:**
```
Task → Plan (break down) → Focus (execute) → Review (reflect) → Complete
```

**Finding PM1-2: No pre-session intention setting (High)**
Research consistently shows that stating intent before work improves focus quality. Before starting a timer, the user should answer: "What specifically will I accomplish in this session?" This creates accountability and measurability.

**Finding PM1-3: No post-session reflection (High)**
When a focus session ends, the user sees a toast notification and that's it. There should be a brief reflection: "Did you complete what you planned? How focused were you (1-5)? Any blockers?" This data feeds the smart insights system and helps users understand their productivity patterns.

**Finding PM1-4: No session chaining / flow state protection (Medium)**
The Pomodoro technique prescribes strict 25/5 cycles, but many users enter "flow state" and don't want to break. The system should detect when a user is in flow (multiple consecutive focus sessions on the same task) and offer to extend rather than interrupt.

**Feature Proposal: Task Completion Modes**
| Mode | Duration | Best For |
|------|----------|----------|
| Quick Sprint | 15 min | Small tasks, emails, admin |
| Pomodoro | 25 + 5 | Standard task work |
| Deep Work | 50 + 10 | Complex/creative tasks |
| Flow Mode | Unlimited | When you're "in the zone" |
| Time Box | Custom | Tasks with hard deadlines |

---

### PM 2 — Task Breakdown & Micro-Goals

**Finding PM2-1: Tasks are too big to focus on (Critical)**
A task like "Implement authentication" is too vague for a 25-minute session. The system needs a **Focus Planning** step where users break their task into session-sized micro-goals. This is different from subtasks — micro-goals are ephemeral, session-scoped checkpoints.

**Proposed Schema: Focus Plan**
```
focus_plans
  id, task_id, created_at
  
focus_plan_steps
  id, plan_id, text, done, position
```

**User flow:**
1. Click "Focus" on a task
2. System shows existing subtasks as suggested steps
3. User adds/removes/reorders steps for this session
4. During focus: check off steps as completed
5. After session: incomplete steps carry forward

**Finding PM2-2: No task difficulty estimation (Medium)**
Users don't know how many focus sessions a task will take. After completing tasks, track the actual sessions used. Over time, suggest estimates: "Tasks like this typically take 2-3 Pomodoro sessions."

**Finding PM2-3: No "next action" prompt (Medium)**
After completing a focus session, the system should suggest what to do next: "Start another session on this task?", "Take a break?", "Switch to [overdue task]?", "Mark task as complete?". This reduces decision fatigue.

**Finding PM2-4: Subtasks should auto-integrate (Low)**
If a task has subtasks, the focus plan should pre-populate with those subtasks. Checking off a subtask during focus should update the actual subtask record.

---

### PM 3 — Analytics & Smart Insights

**Finding PM3-1: Stats are raw numbers, not insights (High)**
The current stats show "3600 seconds focused today" but don't say "You're 20% more productive on Tuesdays" or "You focus best between 9-11 AM." Users need actionable insights, not raw data.

**Proposed Insights Engine:**
- **Best focus time**: Analyze session start times → find peak hours
- **Session length sweet spot**: Which durations lead to most task completions?
- **Task type patterns**: Do you complete technical tasks faster with deep work or pomodoro?
- **Weekly rhythm**: Which days are most/least productive?
- **Break compliance**: Do users who take breaks complete more tasks?

**Finding PM3-2: No daily/weekly focus goals (High)**
Users should set a daily focus goal (e.g., "Focus for 2 hours today") and see progress toward it. This creates a positive reinforcement loop. The dashboard already shows focus minutes — add a progress bar toward the goal.

**Finding PM3-3: No focus quality score (Medium)**
Not all focus time is equal. A session where you checked off 3/3 steps and rated 5/5 focus quality is more valuable than starting and immediately stopping. Create a **Focus Score** composite metric.

**Focus Score Formula:**
```
score = (completion_ratio × 40) + (focus_rating × 30) + (duration_ratio × 20) + (break_compliance × 10)
```

**Finding PM3-4: Session timeline / replay (Low)**
Show a visual timeline of the user's day: when they focused, when they took breaks, which tasks. This "time audit" view helps users understand where their time goes.

---

## Part 2: UI/UX Designer Reviews

### UX 1 — Focus Timer Interface

**Finding UX1-1: Timer overlay blocks the entire app (Critical)**
The focus timer is a full-screen overlay (`.ft-ov`). Users can't see their task notes, subtasks, or reference material while focusing. The timer should be a **persistent mini-widget** that stays visible while allowing navigation.

**Proposed Design: Focus Modes**
1. **Full Screen** (current) — immersive mode for maximum focus
2. **Floating Widget** — small circular timer in corner, app navigable
3. **Mini Bar** — thin bar at top/bottom showing time + controls
4. **Picture-in-Picture** — detachable, movable timer panel

**UI Wireframe — Floating Widget:**
```
┌──────────────────────────────────┐
│  Normal app view (navigable)     │
│                                  │
│                                  │
│                    ┌──────┐      │
│                    │ 18:42│      │
│                    │  ▮▮  │      │
│                    │ Task │      │
│                    └──────┘      │
└──────────────────────────────────┘
```

**Finding UX1-2: No ambient/environment customization (Medium)**
Focus research shows that environment cues improve concentration. Add:
- Ambient sound options (rain, cafe, white noise, lofi)
- Screen dimming (reduce sidebar/nav visibility during focus)
- Color temperature shift (warm colors reduce eye strain)
- "Do Not Disturb" mode (suppress toast notifications)

**Finding UX1-3: Timer doesn't respect system features (Low)**
- No browser notification when timer completes (users may switch tabs)
- No sound alert on completion
- No integration with system DND modes

---

### UX 2 — Task Completion Experience

**Finding UX2-1: No visual progress through task completion (Critical)**
When focusing on a task, there's no sense of progress beyond the countdown. The experience should feel like you're actively completing something, not just watching a clock.

**Proposed: Focus Session Panel**
```
┌─────────────────────────────────────┐
│ 🎯 Implement login form     18:42  │
│ ─────────────────────────────────── │
│                                     │
│ Session Plan:                       │
│ ☑ Set up form component            │
│ ☑ Add validation logic             │
│ ☐ Connect to auth API              │
│ ☐ Handle error states              │
│                                     │
│ Progress: ██████░░░░ 50%           │
│                                     │
│ Notes: [quick scratchpad area]      │
│                                     │
│ [Pause] [Complete Task] [End]       │
└─────────────────────────────────────┘
```

Key elements:
- **Checkable steps** from focus plan
- **Progress bar** based on steps completed
- **Scratchpad** for quick notes during focus
- **Complete Task** button (mark done without stopping timer)

**Finding UX2-2: Completion should feel rewarding (High)**
When a task is marked complete during a focus session, celebrate it:
- Subtle animation (confetti, checkmark burst, progress fill)
- Sound cue (optional, settable in preferences)
- Show: "Task completed in X sessions, Y total minutes"
- Suggest next task from same goal

**Finding UX2-3: Post-session reflection should be fast (Medium)**
The reflection after a focus session should take <10 seconds:
```
┌──────────────────────────────┐
│ Session Complete! 25:00      │
│                              │
│ How focused were you?        │
│ 😫  😐  🙂  😊  🔥         │
│                              │
│ Steps: 3/4 completed         │
│                              │
│ [Take Break] [Keep Going]   │
└──────────────────────────────┘
```
Single tap for rating, auto-skippable after 5 seconds.

---

### UX 3 — Statistics & Visualization

**Finding UX3-1: Focus history is a data table, not visual (High)**
The focus history endpoint returns paginated JSON. The UI should show:
- **Heatmap calendar** (like GitHub contributions) showing focus intensity per day
- **Daily timeline** (horizontal bar showing focus/break periods)
- **Trend chart** (weekly focus hours over time)

**Proposed Dashboard Widgets:**
```
┌────────── Today ──────────┐  ┌──── This Week ────┐
│ 🔥 1h 42m focused         │  │ ████████░░ 6.5h   │
│ ████████████░░░ 85%       │  │ Goal: 8h          │
│ of 2h daily goal          │  │ ↑12% vs last week │
└───────────────────────────┘  └────────────────────┘

┌─────────── Focus Heatmap (30 days) ───────────┐
│ M  ░░▓▓▓░▓▓░░▓░░▓▓▓▓░░▓▓░░▓▓▓░░              │
│ T  ░▓▓▓▓░▓▓▓░▓▓░▓▓▓▓▓░▓▓▓░▓▓▓░░              │
│ W  ░░▓▓░░░▓░░▓▓░░▓▓░░░▓▓░░▓▓▓░░              │
│ T  ░▓▓▓▓░▓▓▓░▓▓░▓▓▓▓▓░▓▓▓░▓▓▓░░              │
│ F  ░░▓░░░░▓░░▓░░░░▓░░░░▓░░░▓░░░              │
└───────────────────────────────────────────────┘

┌─────── Peak Focus Hours ──────┐
│ 9AM  ████████████ 92%         │
│ 10AM ██████████░░ 78%         │
│ 2PM  ████████░░░░ 65%         │
│ 3PM  ██████░░░░░░ 52%         │
└───────────────────────────────┘
```

**Finding UX3-2: No focus streaks display (Medium)**
Habit psychology research shows streaks are powerful motivators. Show:
- Current daily focus streak (consecutive days with >0 focus)
- Longest streak record
- "Streak at risk" nudge when approaching end of day without focus

**Finding UX3-3: Task-level focus insights (Medium)**
On the task detail panel, show focus history for that specific task:
- Total time invested
- Number of sessions
- Average session duration
- Focus quality trend

---

## Part 3: Life Coach Reviews

### Coach 1 — Energy Management & Circadian Alignment

**Finding LC1-1: Timer ignores human energy patterns (Critical)**
The Pomodoro technique treats all 25-minute blocks as equal. They're not. A 25-minute session at 9 AM when you're fresh produces 3x the output of one at 3 PM during your post-lunch dip. The system should incorporate **energy awareness**.

**Recommended: Energy-Aware Focus**
- **Morning Peak (8-11 AM)**: Suggest deep work, complex tasks, creative work
- **Post-Lunch Dip (1-3 PM)**: Suggest light tasks, email, admin, reviews
- **Afternoon Recovery (3-5 PM)**: Suggest collaborative work, planning
- **Evening (7+ PM)**: Suggest reflection, next-day planning, light reading

Implementation: Track when users are most productive (sessions completed/quality score by hour) and personalize these windows over time.

**Finding LC1-2: No pre-focus preparation ritual (High)**
Research from Cal Newport's "Deep Work" and James Clear's "Atomic Habits" shows that **transition rituals** dramatically improve focus quality. Before the timer starts:

**Suggested Pre-Focus Ritual (30-60 seconds):**
1. "Clear your desk/close tabs" — prompt
2. "What will you accomplish?" — type intention
3. "Take 3 deep breaths" — optional breathing exercise
4. Timer begins

**Finding LC1-3: Break quality matters as much as focus quality (High)**
During breaks, users typically check social media, which doesn't actually restore focus. The system should suggest **restorative break activities**:
- Stand up and stretch (show a simple stretch animation)
- Drink water reminder
- Look at something 20 feet away for 20 seconds (20-20-20 rule for eyes)
- Quick breathing exercise
- Walk to the window

**Finding LC1-4: No rest day awareness (Medium)**
Productivity isn't only about doing more. If a user has focused for 4+ hours, the system should suggest: "Great work today! Consider taking the rest of the day off to recover." Burnout prevention is productivity.

---

### Coach 2 — Goal Psychology & Motivation

**Finding LC2-1: No connection between focus and life goals (Critical)**
Focus sessions are logged against tasks, which belong to goals, which belong to life areas. But the UI never says "This 25 minutes brought you closer to [your goal]." Making this connection visible is the single most powerful motivator.

**Proposed: Goal Progress Visualization During Focus**
```
Focusing on: Write API tests
├── Goal: Backend API (68% complete)
│   └── Area: Career (42% complete)
└── This session: +2.5% toward goal completion
```

**Finding LC2-2: No reward/celebration system (High)**
The dopamine hit from completing a focus session should be real. Current implementation: a toast notification. Better implementation:

- **Micro-celebrations**: Subtle animation + sound when timer hits 0
- **Milestone celebrations**: "You've focused for 100 hours total!" with a badge
- **Streak rewards**: 7-day streak gets an achievement
- **Personal bests**: "Your longest focus day! 3h 45m!"
- **Level system** (optional): Earned by accumulating focus time
  - Level 1: Beginner (0-10h total)
  - Level 2: Apprentice (10-50h)
  - Level 3: Practitioner (50-200h)
  - Level 4: Expert (200-500h)
  - Level 5: Master (500h+)

**Finding LC2-3: No accountability mechanism (Medium)**
Solo productivity tools lack accountability. Options:
- **Daily commitment**: "I commit to focusing for 2 hours today" (shown on dashboard)
- **Session intent logging**: Pre-session promise creates personal accountability
- **Weekly review integration**: The existing weekly review should surface focus patterns

**Finding LC2-4: No "getting started" help for procrastination (High)**
The hardest part of focusing isn't the focus — it's starting. When a user has been staring at a task without starting focus, the system should gently nudge:
- "Just start with 5 minutes — you can stop after that" (commitment device)
- "What's the very first tiny step?" (micro-action prompt)
- Show previous successful focus sessions on similar tasks (social proof with self)

---

### Coach 3 — Workflow Design & Task Strategy

**Finding LC3-1: No task attack strategies (Critical)**
Different tasks require different approaches. The system should offer **Focus Strategies**:

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Pomodoro Classic** | 25 min focus, 5 min break, every 4th: 15 min break | Most tasks |
| **Eat the Frog** | Hardest/most dreaded task first, with 50 min deep focus | Tasks you're avoiding |
| **Swiss Cheese** | Poke holes in a big task with 15 min sprints | Overwhelming tasks |
| **Timeboxing** | Fixed 2h block, stop when time's up regardless | Open-ended tasks |
| **Two-Minute Rule** | If it takes <2 min, do it now (skip timer) | Quick tasks |
| **Flowmodoro** | Start timer, stop when you naturally break, break = 1/5 focus time | Creative work |
| **52/17** | 52 min focus, 17 min break | Sustained deep work |

**Finding LC3-2: Tasks should have a "How to approach" prompt (High)**
Before focusing, the system could ask: "How will you approach this task?"
- **Start from scratch** — blank slate, figure it out
- **Continue from last session** — pick up where you left off
- **Research first** — gather information before acting
- **Outline and plan** — structure before executing
- **Just do it** — no planning, dive in

This primes the user's mental model and reduces the "I don't know where to start" paralysis.

**Finding LC3-3: Task completion estimation with learning (Medium)**
After 20+ completed tasks with focus data, the system can learn:
- Average pomodoros per task complexity level
- User's typical task completion rate
- Which task types take longer than expected

Then surface: "Similar tasks took you ~3 sessions. Want to plan for that?"

**Finding LC3-4: End-of-day wind-down protocol (Low)**
The last focus session of the day should include:
- Review what was accomplished today
- Note any incomplete items and where you left off
- Set tomorrow's top 3 priorities (feeds into start-of-day planner)
- "Shutdown ritual" that psychologically separates work from rest

---

## Part 4: Researcher Reviews (Productivity & Behavioral Science)

### Researcher 1 — Evidence-Based Focus Techniques

**Finding R1-1: Pomodoro is excellent but not universally optimal (Critical)**
Meta-analysis across productivity research (Cirillo 2006, Newport 2016, Mark et al. 2014) shows:

- **Pomodoro (25/5)**: Best for routine, well-defined tasks. Completion rates are 40% higher with structured breaks. Most users report improved focus for tasks under 2 hours total.
- **Ultradian rhythms (90/20)**: Nathaniel Kleitman's research shows the brain naturally cycles in ~90 minute focus periods. For creative and complex work, 90-minute blocks with 20-minute breaks outperform Pomodoro by ~15% in output quality.
- **Flowmodoro (variable)**: Csikszentmihalyi's Flow research shows forced interruptions (timer) can break flow state, reducing quality by 25%. Letting users track time without mandatory breaks preserves flow.
- **52/17 rule**: DeskTime's study of most productive workers found the 52/17 pattern. This splits the difference between Pomodoro and ultradian.

**Recommendation**: Offer multiple preset strategies and let users discover their optimal pattern. Track which strategy leads to higher self-reported focus quality and task completion for each user, then recommend personalized durations.

**Finding R1-2: Implementation intentions dramatically improve follow-through (High)**
Peter Gollwitzer's research (1999) shows that "implementation intentions" — statements of "When X, I will Y" — increase goal achievement by 2-3x.

**Applied to LifeFlow:**
Before a focus session, prompt: "In this session, I will [specific action]"
- "I will write the login form validation"
- "I will review and merge 3 PRs"
- "I will outline the architecture doc"

Store these and show completion rates. This alone can boost productivity by 20-30%.

**Finding R1-3: The "fresh start effect" can be leveraged (Medium)**
Milkman et al. (2014) showed people are more likely to pursue goals at temporal landmarks (Monday, 1st of month, after vacation). LifeFlow already has daily and weekly views — amplify this:
- "New week! Set your focus intentions for the week"
- "New month! You focused X hours last month. Set this month's goal?"
- After completing a big task: "Fresh start! What's your next goal?"

---

### Researcher 2 — Behavioral Design & Habit Formation

**Finding R2-1: Variable reward schedules drive engagement (Critical)**
B.F. Skinner's operant conditioning research and modern game design show that **variable** rewards (unpredictable timing and magnitude) are more engaging than fixed rewards.

**Applied: Random Reinforcement System**
Instead of always showing the same completion toast:
- 70% of sessions: Simple completion message
- 15%: Fun fact about productivity ("Did you know? You've now focused more than 80% of LifeFlow users this week")
- 10%: Achievement unlocked ("3 consecutive sessions! New badge: Flow Finder")
- 5%: Surprise celebration (confetti, special animation, funny GIF)

This creates anticipation and curiosity without being annoying.

**Finding R2-2: Habit stacking for focus routines (High)**
James Clear's "Atomic Habits" framework of habit stacking: "After [current habit], I will [new habit]."

**Implementation:**
- "After opening LifeFlow, I review my daily plan" (auto-show planner on first open)
- "After completing a task, I start the next one" (auto-suggest next task)
- "After my 4th pomodoro, I take a long break" (already implemented)
- "After my last session, I review my day" (end-of-day prompt)

The system should learn the user's patterns and gently encourage consistent ones.

**Finding R2-3: Loss aversion is stronger than gain seeking (Medium)**
Kahneman & Tversky's Prospect Theory shows people are ~2x more motivated to avoid losing something than to gain something equivalent.

**Applied:**
- "You'll lose your 12-day streak if you don't focus today" (more motivating than "Extend your streak!")
- "3 tasks overdue — you might miss your weekly goal" (more motivating than "Complete 3 more tasks to hit your goal")
- Use carefully — can feel punishing if overdone. Only for users who opt into "accountability mode"

**Finding R2-4: The "Zeigarnik Effect" for task persistence (Medium)**
Bluma Zeigarnik (1927) showed that incomplete tasks create mental tension that persists until completed. This is why cliffhangers work.

**Applied:**
- When a user stops mid-task (doesn't complete), show the unfinished steps prominently next time they open the app
- "You were 75% through 'Implement auth' — pick up where you left off?"
- This natural psychological tension makes returning to unfinished work easier

---

### Researcher 3 — Cognitive Load & Attention Science

**Finding R3-1: Context switching is the #1 productivity killer (Critical)**
Mark et al. (2005) measured that after an interruption, it takes an average of **23 minutes** to return to the original task at the same level of focus. Gloria Mark's subsequent research (2023) refined this — the "attention residue" from switching between tasks reduces cognitive performance by 20-40%.

**Applied to LifeFlow Focus Mode:**
- During focus, **suppress all non-critical UI elements** (sidebar items, notification badges, other task counts)
- Optionally hide other tasks: "When focusing, I only see this task"
- If user tries to navigate away during focus: gentle prompt "You're in focus mode. Leave this session?"
- Track "focus interruptions" (navigating away during a session) as a metric

**Finding R3-2: Cognitive load theory demands minimal UI during focus (High)**
Sweller's Cognitive Load Theory shows that extraneous visual elements reduce working memory available for the actual task. During focus mode:
- Minimize chrome (hide sidebar, breadcrumbs, nav)
- Show only: timer, current task, session steps, notes area
- Use calming, low-contrast colors
- Reduce animation and movement

**Finding R3-3: "Attention residue" requires transition rituals (High)**
Sophie Leroy (2009) coined "attention residue" — when switching tasks, part of your attention stays on the previous task. This is worse when the previous task was incomplete.

**Applied: Transition Protocol**
When starting focus:
1. "Finish what you're thinking about right now" (10-second pause)
2. "Write down anything hanging over you" (quick brain dump field)
3. "Now focus solely on: [task name]" (clear intention)
4. Timer begins

This 30-second ritual reduces attention residue by ~40% in lab studies.

**Finding R3-4: Willpower is finite — reduce decisions during focus (Medium)**
Baumeister's ego depletion research (somewhat contested, but the practical implications hold) suggests that decision-making during focused work should be minimized.

**Applied:**
- Auto-advance to next step when one is checked off (don't require picking)
- Pre-set the next session type (don't ask "pomodoro or deep work?" after each session)
- Auto-suggest break duration based on session length
- "Smart mode" that handles focus/break cycling without any user input

---

## Part 5: Implementation Recommendations

### Priority Matrix (Impact × Effort)

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Focus Planning (session steps) | 🔴 Critical | Medium | P0 |
| Pre-session intention | 🔴 Critical | Low | P0 |
| Post-session reflection (quick) | 🔴 Critical | Low | P0 |
| Floating timer widget | 🔴 Critical | Medium | P0 |
| Multiple focus strategies | 🟡 High | Medium | P1 |
| Energy-aware suggestions | 🟡 High | Medium | P1 |
| Daily focus goals + progress | 🟡 High | Low | P1 |
| Focus score / quality metric | 🟡 High | Low | P1 |
| Goal progress during focus | 🟡 High | Low | P1 |
| Completion celebrations | 🟡 High | Low | P1 |
| Smart insights (peak hours) | 🟡 High | Medium | P1 |
| Focus heatmap calendar | 🟢 Medium | Medium | P2 |
| Ambient sounds | 🟢 Medium | Medium | P2 |
| Break activity suggestions | 🟢 Medium | Low | P2 |
| Streak-at-risk nudges | 🟢 Medium | Low | P2 |
| Achievement/badge system | 🟢 Medium | Medium | P2 |
| Task attack strategy selector | 🟢 Medium | Low | P2 |
| Distraction suppression mode | 🟢 Medium | Medium | P2 |
| Procrastination nudges | 🟢 Medium | Low | P2 |
| Session timeline / day replay | 🔵 Low | High | P3 |
| Ambient sound library | 🔵 Low | High | P3 |
| Variable reward system | 🔵 Low | Medium | P3 |
| End-of-day wind-down | 🔵 Low | Low | P3 |

### Proposed Schema Changes

```sql
-- New table: session intentions and reflections
CREATE TABLE IF NOT EXISTS focus_session_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  intention TEXT,                    -- Pre-session: "What will I accomplish?"
  reflection TEXT,                   -- Post-session: brief note
  focus_rating INTEGER DEFAULT 0,   -- 1-5 self-reported focus quality
  steps_planned INTEGER DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  strategy TEXT DEFAULT 'pomodoro',  -- pomodoro|deep|sprint|flow|timebox|52-17
  FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
);

-- New table: session steps (micro-goals for this session)
CREATE TABLE IF NOT EXISTS focus_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  completed_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
);

-- Add ended_at to focus_sessions
ALTER TABLE focus_sessions ADD COLUMN ended_at DATETIME;

-- Add daily focus goal to settings (stored in user_settings key-value)
-- Key: 'dailyFocusGoalMinutes', Value: '120'

-- Focus score computed column (not stored, calculated from meta)
```

### Proposed API Additions

```
POST   /api/focus                          — (existing) create session
PUT    /api/focus/:id                      — (existing) update session
PUT    /api/focus/:id/end                  — NEW: end session + set ended_at
POST   /api/focus/:id/meta                 — NEW: save intention + reflection
GET    /api/focus/:id/meta                 — NEW: get session meta
POST   /api/focus/:id/steps               — NEW: add step(s) to session
PUT    /api/focus/steps/:stepId            — NEW: toggle step done
GET    /api/focus/insights                 — NEW: smart insights (peak hours, patterns)
GET    /api/focus/streak                   — NEW: current streak + longest
GET    /api/focus/goal                     — NEW: daily goal progress
```

### Proposed Implementation Phases

**Phase A: Focus Planning & Reflection (v0.0.12)**
- Add `focus_session_meta` and `focus_steps` tables
- Add `ended_at` column to `focus_sessions`
- New API endpoints for meta and steps
- Frontend: pre-session intention prompt
- Frontend: in-session step checklist
- Frontend: post-session quick reflection (emoji rating)
- Auto-populate steps from task's subtasks

**Phase B: Focus Strategies & Timer Modes (v0.0.13)**
- Multiple strategy presets (Pomodoro, Deep Work, Sprint, Flow, 52/17)
- Floating timer widget (mini-mode)
- Flow state detection (extend instead of break)
- Configurable strategies in Settings
- Browser notification on timer complete

**Phase C: Insights & Motivation (v0.0.14)**
- Focus insights endpoint (peak hours, task patterns)
- Focus score calculation
- Daily focus goal + dashboard progress bar
- Streak tracking and display
- Goal progress connection ("this session = +X% toward goal")
- Completion celebration animations

**Phase D: Advanced Features (v0.0.15)**
- Focus heatmap calendar widget
- Break activity suggestions
- Distraction suppression mode
- Achievement/badge system
- Session timeline / day replay view
- Ambient sound option (rain, lofi — via Web Audio API)

---

## Summary

| Expert Type | Key Recommendation |
|-------------|-------------------|
| **PM 1** | Build a Task Completion Flow (Plan → Focus → Review → Complete) |
| **PM 2** | Add session-scoped micro-goals that integrate with subtasks |
| **PM 3** | Transform raw stats into actionable insights with focus scoring |
| **UX 1** | Offer timer modes (fullscreen, floating, mini-bar), add ambient options |
| **UX 2** | Make progress visible during sessions, celebrate completions |
| **UX 3** | Heatmap calendar, peak hours chart, streak display, task-level insights |
| **Coach 1** | Align focus with energy levels, add pre-focus ritual, improve breaks |
| **Coach 2** | Connect focus to life goals visually, add celebrations/badges |
| **Coach 3** | Offer task attack strategies, help overcome procrastination |
| **Researcher 1** | Multiple evidence-based timing methods, implementation intentions |
| **Researcher 2** | Variable rewards, habit stacking, leverage loss aversion carefully |
| **Researcher 3** | Minimize context switching, reduce cognitive load during focus, add transition rituals |

**Core Insight**: The focus timer shouldn't just count down time — it should be a **guided task completion companion** that helps users plan, execute, reflect, and improve with every session.
