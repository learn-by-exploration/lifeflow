const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeHabit, logHabit } = require('./helpers');

// ─── E2E Phase 3/4 Interaction Tests ────────────────────────────────────────
// End-to-end tests for new planning features: planner view, Gantt rescheduling,
// habit analytics, pinned areas, and area quick-add workflows.

describe('Phase 3/4 Browser Interaction Workflows', () => {
  let testAgent;
  let workArea, planningArea;
  let writeDocsGoal, reviewGoal;
  let task1, task2, task3;

  before(() => setup());
  beforeEach(async () => {
    cleanDb();
    testAgent = agent();

    // Create areas using database directly
    workArea = makeArea({ name: 'Work', icon: '💼', color: '#2563EB' });
    planningArea = makeArea({ name: 'Planning', icon: '📋', color: '#7C3AED' });

    // Create goals
    writeDocsGoal = makeGoal(workArea.id, { title: 'Write Documentation' });
    reviewGoal = makeGoal(workArea.id, { title: 'Code Review' });

    // Create tasks
    task1 = makeTask(writeDocsGoal.id, {
      title: 'API docs',
      priority: 1,
      status: 'todo',
      due_date: '2026-04-15'
    });
    task2 = makeTask(writeDocsGoal.id, {
      title: 'Schema docs',
      priority: 2,
      status: 'doing',
      due_date: '2026-04-16'
    });
    task3 = makeTask(reviewGoal.id, {
      title: 'Review PR #123',
      priority: 3,
      status: 'todo',
      due_date: '2026-04-20'
    });
  });
  after(() => teardown());

  describe('Task Planner View Workflow', () => {
    it('fetches hierarchical planner data grouped by area and goal', async () => {
      const res = await testAgent
        .get('/api/tasks/planner');

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.areas), 'should return areas array');

      const workAreaData = res.body.areas.find(a => a.id === workArea.id);
      assert.ok(workAreaData, 'work area should be in planner');
      assert.ok(Array.isArray(workAreaData.goals), 'area should have goals array');

      const writeDocsGoalData = workAreaData.goals.find(g => g.id === writeDocsGoal.id);
      assert.ok(writeDocsGoalData, 'write docs goal should be in area');
      assert.ok(Array.isArray(writeDocsGoalData.tasks), 'goal should have tasks array');

      const api1 = writeDocsGoalData.tasks.find(t => t.id === task1.id);
      assert.ok(api1, 'API docs task should be in writeDocsGoal');
      assert.equal(api1.title, 'API docs');
      assert.equal(api1.priority, 1);
    });

    it('UI can select multiple tasks from planner and move them', async () => {
      // Fetch planner to get task IDs
      const plannerRes = await testAgent
        .get('/api/tasks/planner');
      assert.equal(plannerRes.status, 200);

      const taskIds = [task1.id, task2.id];
      const targetGoalId = reviewGoal.id;

      // Simulate UI batch move: user selects 2 tasks and moves to reviewGoal
      const moveRes = await testAgent
        .post('/api/tasks/batch-move')
        .send({
          task_ids: taskIds,
          target_goal_id: targetGoalId
        });

      assert.equal(moveRes.status, 200);
      assert.equal(moveRes.body.moved_count, 2, 'should move 2 tasks');

      // Verify tasks now belong to reviewGoal
      const tasksRes = await testAgent
        .get('/api/tasks/all');
      assert.equal(tasksRes.status, 200);

      const movedTask1 = tasksRes.body.find(t => t.id === task1.id);
      const movedTask2 = tasksRes.body.find(t => t.id === task2.id);

      assert.equal(movedTask1.goal_id, reviewGoal.id, 'task1 should be in reviewGoal');
      assert.equal(movedTask2.goal_id, reviewGoal.id, 'task2 should be in reviewGoal');
    });

    it('UI rejects batch move with >100 tasks', async () => {
      // Create array of 101 task IDs
      const taskIds = Array.from({ length: 101 }, (_, i) => task1.id);

      const moveRes = await testAgent
        .post('/api/tasks/batch-move')
        .send({
          task_ids: taskIds,
          target_goal_id: reviewGoal.id
        });

      assert.equal(moveRes.status, 400);
      assert.match(moveRes.body.error, /100/i, 'should mention 100-task limit');
    });
  });

  describe('Gantt Rescheduling Workflow', () => {
    it('UI can reschedule task via PUT /api/tasks/:id with new due_date', async () => {
      const newDueDate = '2026-05-01';

      const updateRes = await testAgent
        .put(`/api/tasks/${task1.id}`)
        .send({
          due_date: newDueDate
        });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.due_date, newDueDate);

      // Verify in task list
      const getRes = await testAgent
        .get(`/api/tasks/${task1.id}`);
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.due_date, newDueDate);
    });

    it('UI can shift task date by N days via PUT', async () => {
      const originalDate = task2.due_date; // '2026-04-16'
      const newDate = '2026-04-20'; // +4 days

      const updateRes = await testAgent
        .put(`/api/tasks/${task2.id}`)
        .send({
          due_date: newDate
        });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.due_date, newDate);
    });

    it('task search index is updated when task date changes', async () => {
      // Update task date (should rebuild search index internally)
      const newDate = '2026-06-01';
      const updateRes = await testAgent
        .put(`/api/tasks/${task1.id}`)
        .send({ due_date: newDate });

      assert.equal(updateRes.status, 200);

      // Verify search still works (search uses FTS index which gets rebuilt)
      const searchRes = await testAgent
        .get('/api/tasks/search?q=API');

      assert.equal(searchRes.status, 200);
      const found = searchRes.body.find(t => t.id === task1.id);
      assert.ok(found, 'rescheduled task should still be searchable');
    });
  });

  describe('Habit Analytics Workflow', () => {
    it('fetches habit analytics dashboard with summary and trends', async () => {
      // Create a habit first
      const habitRes = await testAgent
        .post('/api/habits')
        .send({
          name: 'Morning Exercise',
          icon: '💪',
          color: '#EC4899',
          frequency: 'daily',
          target: 1
        });
      assert.equal(habitRes.status, 201);
      const habitId = habitRes.body.id;

      // Log some habit completions
      await testAgent
        .post(`/api/habits/${habitId}/log`)
        .send({ count: 1 });

      // Fetch analytics
      const analyticsRes = await testAgent
        .get('/api/stats/habits');

      assert.equal(analyticsRes.status, 200);
      assert.ok(analyticsRes.body.overall, 'should have overall stats');
      assert.ok(analyticsRes.body.trends, 'should have trends data');
      assert.ok(analyticsRes.body.heatmap, 'should have heatmap data');
      assert.ok(Array.isArray(analyticsRes.body.habits), 'should have habits array');

      const morning = analyticsRes.body.habits.find(h => h.id === habitId);
      assert.ok(morning, 'Morning Exercise should be in analytics');
      assert.ok(morning.streak >= 0, 'should have streak count');
      assert.ok(morning.completion_rate_30 !== undefined, 'should have 30-day completion %');
      assert.ok(Array.isArray(morning.sparkline_30), 'should have sparkline data');
    });

    it('habit analytics includes per-habit completion rates and streaks', async () => {
      const res = await testAgent
        .get('/api/stats/habits');

      assert.equal(res.status, 200);
      assert.ok(res.body.overall);
      assert.ok(res.body.overall.totalHabits >= 0);
      assert.ok(res.body.overall.avgCompletion30 !== undefined);
      assert.ok(res.body.overall.totalLogs >= 0);
    });
  });

  describe('Pinned Areas Sidebar Workflow', () => {
    it('saves and retrieves pinned area preferences', async () => {
      // Initial state: no pinned areas
      let settingsRes = await testAgent
        .get('/api/settings');
      assert.equal(settingsRes.status, 200);
      let pinnedAreas = JSON.parse(settingsRes.body.pinnedAreas || '[]');
      assert.ok(Array.isArray(pinnedAreas));

      // Pin workArea
      pinnedAreas.push(workArea.id);
      const saveRes = await testAgent
        .put('/api/settings')
        .send({ pinnedAreas: JSON.stringify(pinnedAreas) });

      assert.equal(saveRes.status, 200);

      // Retrieve and verify
      settingsRes = await testAgent
        .get('/api/settings');
      assert.equal(settingsRes.status, 200);
      pinnedAreas = JSON.parse(settingsRes.body.pinnedAreas);
      assert.ok(pinnedAreas.includes(workArea.id), 'workArea should be pinned');
    });

    it('UI can toggle area pin state via settings update', async () => {
      const areaId = workArea.id;

      // Get current settings
      let settingsRes = await testAgent
        .get('/api/settings');
      let pinnedAreas = JSON.parse(settingsRes.body.pinnedAreas || '[]');

      // Toggle pin
      const wasPinned = pinnedAreas.includes(areaId);
      if (wasPinned) {
        pinnedAreas = pinnedAreas.filter(id => id !== areaId);
      } else {
        pinnedAreas.push(areaId);
      }

      // Save
      const saveRes = await testAgent
        .put('/api/settings')
        .send({ pinnedAreas: JSON.stringify(pinnedAreas) });

      assert.equal(saveRes.status, 200);

      // Verify
      settingsRes = await testAgent
        .get('/api/settings');
      const newPinnedAreas = JSON.parse(settingsRes.body.pinnedAreas);
      assert.equal(newPinnedAreas.includes(areaId), !wasPinned, 'pin state should toggle');
    });
  });

  describe('Area Quick-Add Task Workflow', () => {
    it('UI can quickly add task to specific goal from area view', async () => {
      const quickAddRes = await testAgent
        .post(`/api/goals/${writeDocsGoal.id}/tasks`)
        .send({
          title: 'Quick added from area view',
          priority: 1
        });

      assert.equal(quickAddRes.status, 201);
      assert.ok(quickAddRes.body.id, 'should create task with ID');
      assert.equal(quickAddRes.body.goal_id, writeDocsGoal.id);
      assert.equal(quickAddRes.body.title, 'Quick added from area view');
    });

    it('quick-add respects goal association', async () => {
      // Add task to writeDocsGoal via quick-add
      const res = await testAgent
        .post(`/api/goals/${writeDocsGoal.id}/tasks`)
        .send({
          title: 'Quick review notes',
          priority: 0
        });

      assert.equal(res.status, 201);
      const newTaskId = res.body.id;

      // Fetch planner and verify task is under writeDocsGoal
      const plannerRes = await testAgent
        .get('/api/tasks/planner');
      assert.equal(plannerRes.status, 200);

      const workAreaData = plannerRes.body.areas.find(a => a.id === workArea.id);
      const writeDocsData = workAreaData.goals.find(g => g.id === writeDocsGoal.id);
      const quickAdded = writeDocsData.tasks.find(t => t.id === newTaskId);

      assert.ok(quickAdded, 'quick-added task should be in correct goal');
      assert.equal(quickAdded.title, 'Quick review notes');
    });
  });

  describe('Combined Workflow: Multi-step Planning Session', () => {
    it('user can view planner, move tasks, reschedule, and verify', async () => {
      // Step 1: View planner
      const plannerRes = await testAgent
        .get('/api/tasks/planner');
      assert.equal(plannerRes.status, 200);
      assert.ok(Array.isArray(plannerRes.body.areas));

      // Step 2: Move task1 and task2 to reviewGoal
      const moveRes = await testAgent
        .post('/api/tasks/batch-move')
        .send({
          task_ids: [task1.id, task2.id],
          target_goal_id: reviewGoal.id
        });
      assert.equal(moveRes.status, 200);
      assert.equal(moveRes.body.moved_count, 2);

      // Step 3: Reschedule task3
      const reschedRes = await testAgent
        .put(`/api/tasks/${task3.id}`)
        .send({ due_date: '2026-05-10' });
      assert.equal(reschedRes.status, 200);

      // Step 4: View updated planner
      const updatedPlannerRes = await testAgent
        .get('/api/tasks/planner');
      assert.equal(updatedPlannerRes.status, 200);

      const reviewGoalData = updatedPlannerRes.body.areas
        .find(a => a.id === workArea.id)
        .goals.find(g => g.id === reviewGoal.id);

      // Should now have 3 tasks (original task3 + moved task1 + task2)
      assert.ok(reviewGoalData.tasks.length >= 3, 'reviewGoal should have moved tasks');

      // Step 5: Pin the work area for quick access
      let settingsRes = await testAgent
        .get('/api/settings');
      let pinnedAreas = JSON.parse(settingsRes.body.pinnedAreas || '[]');
      pinnedAreas.push(workArea.id);

      const saveRes = await testAgent
        .put('/api/settings')
        .send({ pinnedAreas: JSON.stringify(pinnedAreas) });
      assert.equal(saveRes.status, 200);

      // Verify pin was saved
      settingsRes = await testAgent
        .get('/api/settings');
      pinnedAreas = JSON.parse(settingsRes.body.pinnedAreas);
      assert.ok(pinnedAreas.includes(workArea.id));
    });
  });
});
