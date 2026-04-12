# Phase 2 Implementation Plan

**Status:** PLANNING  
**Target:** 2-3 weeks  
**Features:** #12, #3, #9, #14  

## Phase 2 Goals

1. **Background Focus Timer** (#12) - Make timer work when tab is backgrounded
2. **Better Daily Reflection UI** (#3) - Improve the daily reflection wizard
3. **Improved Task Edit UI** (#9) - Polish the task editing interface
4. **Better Calendar View** (#14) - Improve calendar styling and UX

## Feature 2.1: Background Focus Timer (#12)

**Problem:** Focus timer pauses when tab is backgrounded due to browser throttling.

**Solution:** Use Web Worker to run timer independently of main thread.

### Implementation Steps:

1. Create `public/timer-worker.js` - Web Worker that maintains timer independent of throttling
2. Update `public/app.js` - Replace setInterval with worker messages
3. Add Notification API - Alert user when timer completes
4. Add audio chime - Use AudioContext or <audio> tag
5. Add fallback handling - If worker fails, use setInterval
6. Write tests - Worker round-trip and accuracy tests

### Files to Modify:
- Create: `public/timer-worker.js`
- Modify: `public/app.js`
- Create: `tests/focus-timer-worker.test.js`

### Step-by-Step Tasks:

#### Task 2.1.1: Create Web Worker for Timer
- [ ] Create timer-worker.js that maintains accurate time
- [ ] Handle start/pause/resume messages
- [ ] Send tick events to main thread
- [ ] Handle errors gracefully

#### Task 2.1.2: Integrate Worker into Main App
- [ ] Create worker instance in app.js
- [ ] Route timer messages to worker
- [ ] Handle worker messages for ticks
- [ ] Implement fallback for unsupported browsers

#### Task 2.1.3: Add Notifications & Audio
- [ ] Request notification permission on focus start
- [ ] Show notification when timer completes
- [ ] Add audio chime (Web Audio API)
- [ ] Handle notification interactions

#### Task 2.1.4: Add Worker Tests
- [ ] Test worker initialization
- [ ] Test timer accuracy
- [ ] Test pause/resume
- [ ] Test error handling
- [ ] Test main-thread integration

---

## Feature 2.2: Better Daily Reflection UI (#3)

**Problem:** Current wizard is basic and not engaging.

**Solution:** Redesign with better UX flow, progress indicator, and guided prompts.

### Implementation Steps:

1. Redesign step 1 (Yesterday's Review) - Checklist of yesterday's tasks with summary
2. Improve step 2 (Today's Planning) - Quick goal setting with time estimates
3. Add step 3 (Priorities) - Mood/energy selector and priority reordering
4. Add visual progress indicator
5. Improve styling and accessibility
6. Write integration tests

### Files to Modify:
- Modify: `public/app.js` - Wizard rendering
- Modify: `public/styles.css` - New wizard styles
- Create: `tests/daily-reflection-ui.test.js`

---

## Feature 2.3: Improved Task Edit UI (#9)

**Problem:** Task edit UI exists but is cramped and difficult to use.

**Solution:** Expand modal, improve field organization, better inline editing.

### Implementation Steps:

1. Create full-height task edit modal
2. Add field groups (metadata, dates, priority, assignment)
3. Improve multi-line note editor
4. Add real-time validation feedback
5. Improve keyboard navigation
6. Add custom field editing

### Files to Modify:
- Modify: `public/app.js` - Task modal
- Modify: `public/styles.css` - Modal styling
- Create: `tests/task-edit-ui.test.js`

---

## Feature 2.4: Better Calendar View Styling (#14)

**Problem:** Calendar view is functional but visually plain.

**Solution:** Improve visual hierarchy, better cell styling, hover states.

### Implementation Steps:

1. Redesign calendar cell styling
2. Add color coding for priority/status
3. Improve hover/click states
4. Add smooth transitions
5. Better mobile responsiveness
6. Add quick-add button in cells

### Files to Modify:
- Modify: `public/app.js` - Calendar rendering
- Modify: `public/styles.css` - Calendar styling
- Create: `tests/calendar-styling.test.js`

---

## Team Assignment

| Feature | Assigned To | Estimated Time |
|---------|------------|-----------------|
| 2.1 - Background Timer | backend-architect | 5 days |
| 2.2 - Reflection UI | frontend-architect | 5 days |
| 2.3 - Task Edit UI | frontend-architect | 4 days |
| 2.4 - Calendar Styling | ui-designer | 3 days |

**Total:** 17 days (parallel: ~5 days with 4 agents)

---

## Success Criteria

- [ ] All 4 features implemented
- [ ] 40+ new tests written and passing
- [ ] Zero regressions in existing tests
- [ ] No accessibility violations introduced
- [ ] Mobile responsiveness maintained
- [ ] Code review sign-off from team
- [ ] Performance metrics maintained
- [ ] Security review passed

---

## Dependencies

- Phase 1 must be complete (✅ VERIFIED)
- Git state must be clean (✅ VERIFIED)
- Node 22.14.0 active (can verify at start)
- Database migrations current (can check at start)

---

## Git Workflow

1. Create feature branches from main: `feature/phase2-*`
2. Commit atomically as features complete
3. Merge to main with PR review
4. Tag as `v0.9.0` when all Phase 2 features ship

---

## Ready to Execute

Phase 2 plan is ready. Can dispatch to team or start implementation immediately upon user approval.

*Generated: April 13, 2026*
