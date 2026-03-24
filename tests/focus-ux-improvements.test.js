/**
 * Focus UX Improvements Tests
 *
 * Tests for the focus timer UI/UX enhancements:
 * 1. GET /api/tasks/all returns enriched data (subtasks, goal context, sorting)
 * 2. GET /api/tasks/:id returns subtasks for technique picker
 * 3. PUT /api/subtasks/:id toggling from technique picker
 * 4. Smart task sorting (priority → due date → staleness)
 * 5. Frontend validation: focus hub goal context, subtask picker, reflection nudge
 */
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, makeSubtask, agent, setup } = require('./helpers');

// ─── BACKEND API: Task enrichment for Focus Hub ───

describe('Focus Hub — Task Enrichment API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('GET /api/tasks/all — enriched fields for focus hub', () => {
    it('returns subtasks array for each task', async () => {
      const area = makeArea({ name: 'Health', icon: '💪' });
      const goal = makeGoal(area.id, { title: 'Get Fit' });
      const task = makeTask(goal.id, { title: 'Run 5K' });
      makeSubtask(task.id, { title: 'Warm up', done: 0 });
      makeSubtask(task.id, { title: 'Run', done: 1 });

      const res = await agent().get('/api/tasks/all').expect(200);
      const t = res.body.find(x => x.id === task.id);
      assert.ok(t, 'task found in response');
      assert.ok(Array.isArray(t.subtasks), 'subtasks is array');
      assert.equal(t.subtasks.length, 2);
      assert.equal(t.subtask_total, 2);
      assert.equal(t.subtask_done, 1);
    });

    it('returns goal_title, area_name, area_icon for goal context', async () => {
      const area = makeArea({ name: 'Career', icon: '💼' });
      const goal = makeGoal(area.id, { title: 'Ship MVP' });
      const task = makeTask(goal.id, { title: 'Write tests' });

      const res = await agent().get('/api/tasks/all').expect(200);
      const t = res.body.find(x => x.id === task.id);
      assert.equal(t.goal_title, 'Ship MVP');
      assert.equal(t.area_name, 'Career');
      assert.equal(t.area_icon, '💼');
    });

    it('sorts by priority DESC (high priority first)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const low = makeTask(goal.id, { title: 'Low', priority: 0 });
      const high = makeTask(goal.id, { title: 'High', priority: 3 });
      const med = makeTask(goal.id, { title: 'Med', priority: 1 });

      const res = await agent().get('/api/tasks/all').expect(200);
      const pending = res.body.filter(x => x.status !== 'done');
      const titles = pending.map(t => t.title);
      assert.equal(titles.indexOf('High') < titles.indexOf('Med'), true, 'High before Med');
      assert.equal(titles.indexOf('Med') < titles.indexOf('Low'), true, 'Med before Low');
    });

    it('sorts by due_date ASC within same priority', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Later', priority: 1, due_date: '2026-12-31' });
      makeTask(goal.id, { title: 'Sooner', priority: 1, due_date: '2026-04-01' });

      const res = await agent().get('/api/tasks/all').expect(200);
      const pending = res.body.filter(x => x.status !== 'done');
      const idx1 = pending.findIndex(t => t.title === 'Sooner');
      const idx2 = pending.findIndex(t => t.title === 'Later');
      assert.ok(idx1 < idx2, 'Sooner due date comes first');
    });

    it('returns tasks with and without due_date (client sorts further)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'No Due', priority: 1, due_date: null });
      makeTask(goal.id, { title: 'Has Due', priority: 1, due_date: '2026-06-01' });

      const res = await agent().get('/api/tasks/all').expect(200);
      const pending = res.body.filter(x => x.status !== 'done');
      assert.equal(pending.length, 2);
      assert.ok(pending.some(t => t.title === 'Has Due' && t.due_date === '2026-06-01'));
      assert.ok(pending.some(t => t.title === 'No Due' && t.due_date === null));
    });

    it('returns both done and pending tasks (client filters done out)', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      makeTask(goal.id, { title: 'Done One', status: 'done', priority: 3 });
      makeTask(goal.id, { title: 'Todo One', status: 'todo', priority: 0 });

      const res = await agent().get('/api/tasks/all').expect(200);
      assert.equal(res.body.length, 2);
      const pending = res.body.filter(t => t.status !== 'done');
      const done = res.body.filter(t => t.status === 'done');
      assert.equal(pending.length, 1);
      assert.equal(done.length, 1);
      assert.equal(pending[0].title, 'Todo One');
      assert.equal(done[0].title, 'Done One');
    });
  });

  describe('GET /api/tasks/:id — subtask enrichment', () => {
    it('returns subtasks array on single task', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Focus Task' });
      makeSubtask(task.id, { title: 'Step 1', done: 0 });
      makeSubtask(task.id, { title: 'Step 2', done: 1 });
      makeSubtask(task.id, { title: 'Step 3', done: 0 });

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.ok(Array.isArray(res.body.subtasks), 'subtasks is array');
      assert.equal(res.body.subtasks.length, 3);
      assert.equal(res.body.subtask_done, 1);
      assert.equal(res.body.subtask_total, 3);
    });

    it('returns goal_title and area_icon for task context', async () => {
      const area = makeArea({ name: 'Finance', icon: '💰' });
      const goal = makeGoal(area.id, { title: 'Save 10K' });
      const task = makeTask(goal.id, { title: 'Cut subscriptions' });

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.equal(res.body.goal_title, 'Save 10K');
      assert.equal(res.body.area_icon, '💰');
      assert.equal(res.body.area_name, 'Finance');
    });

    it('each subtask has id, title, done fields', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { title: 'Check me', done: 0 });

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      const s = res.body.subtasks[0];
      assert.ok(s.id, 'subtask has id');
      assert.equal(s.title, 'Check me');
      assert.equal(s.done, 0);
    });
  });

  describe('PUT /api/subtasks/:id — toggle from technique picker', () => {
    it('toggles subtask from undone to done', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { title: 'Toggle me', done: 0 });

      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: 1 })
        .expect(200);
      assert.equal(res.body.done, 1);
    });

    it('toggles subtask from done to undone', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { title: 'Undo me', done: 1 });

      const res = await agent()
        .put(`/api/subtasks/${sub.id}`)
        .send({ done: 0 })
        .expect(200);
      assert.equal(res.body.done, 0);
    });

    it('subtask toggle reflects in task enrichment', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { title: 'Persist check', done: 0 });

      // Toggle to done
      await agent().put(`/api/subtasks/${sub.id}`).send({ done: 1 }).expect(200);

      // Verify via tasks/all
      const res = await agent().get('/api/tasks/all').expect(200);
      const t = res.body.find(x => x.id === task.id);
      assert.equal(t.subtask_done, 1);
      assert.equal(t.subtask_total, 1);
      const s = t.subtasks.find(x => x.id === sub.id);
      assert.equal(s.done, 1, 'subtask done persisted');
    });

    it('subtask toggle reflects in single task GET', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const sub = makeSubtask(task.id, { title: 'Check via GET', done: 0 });

      await agent().put(`/api/subtasks/${sub.id}`).send({ done: 1 }).expect(200);

      const res = await agent().get(`/api/tasks/${task.id}`).expect(200);
      assert.equal(res.body.subtask_done, 1);
      assert.equal(res.body.subtasks[0].done, 1);
    });

    it('returns 404 for non-existent subtask', async () => {
      await agent().put('/api/subtasks/99999').send({ done: 1 }).expect(404);
    });
  });
});

// ─── FRONTEND VALIDATION: Focus Hub UX Code Patterns ───

describe('Focus Hub — Frontend Code Patterns', () => {
  const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
  const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
  const CSS_PATH = path.join(__dirname, '..', 'public', 'styles.css');
  const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const css = fs.readFileSync(CSS_PATH, 'utf8');

  describe('Focus Hub task card goal context', () => {
    it('renderFocusHub builds goal context from area_icon and goal_title', () => {
      assert.ok(appJs.includes('area_icon'), 'app.js references area_icon');
      assert.ok(appJs.includes('goal_title'), 'app.js references goal_title');
      assert.ok(appJs.includes('fh-task-ctx'), 'app.js renders fh-task-ctx class');
    });

    it('CSS defines .fh-task-ctx style', () => {
      assert.ok(css.includes('.fh-task-ctx'), 'CSS has .fh-task-ctx class');
    });
  });

  describe('Focus Hub smart sorting', () => {
    it('client-side sort uses priority, due_date, created_at', () => {
      // The sort lambda should reference priority, due_date, and created_at
      assert.ok(appJs.includes('b.priority||0'), 'sort references priority');
      assert.ok(appJs.includes('a.due_date'), 'sort references due_date');
      assert.ok(appJs.includes('a.created_at'), 'sort references created_at');
    });

    it('Focus Hub motivational nudge references due date and staleness', () => {
      assert.ok(appJs.includes('most urgent task'), 'nudge mentions urgency');
      assert.ok(appJs.includes('has been waiting'), 'nudge mentions waiting/staleness');
    });
  });

  describe('Technique picker subtask rendering', () => {
    it('ft-pick-subs element exists in HTML', () => {
      assert.ok(html.includes('id="ft-pick-subs"'), 'HTML has ft-pick-subs element');
    });

    it('CSS defines .ft-pick-subs and .ft-pick-sub styles', () => {
      assert.ok(css.includes('.ft-pick-subs'), 'CSS has .ft-pick-subs');
      assert.ok(css.includes('.ft-pick-sub'), 'CSS has .ft-pick-sub');
      assert.ok(css.includes('.ft-pick-sub-chk'), 'CSS has .ft-pick-sub-chk');
    });

    it('showTechniquePicker renders subtasks into ft-pick-subs', () => {
      // The function should check ftTask.subtasks and render them
      assert.ok(appJs.includes("ftTask.subtasks&&ftTask.subtasks.length"), 'checks for subtasks');
      assert.ok(appJs.includes("ft-pick-subs"), 'references ft-pick-subs element');
      assert.ok(appJs.includes("ft-pick-sub-chk"), 'renders checkbox for subtasks');
    });

    it('subtask toggle calls PUT /api/subtasks/:id', () => {
      // The technique picker should call the subtask toggle API
      assert.ok(appJs.includes("api.put('/api/subtasks/'+sid"), 'calls put subtasks API');
    });

    it('subtask toggle sends done:0 or done:1', () => {
      assert.ok(appJs.includes('{done:newDone}') || appJs.includes('{done: newDone}'),
        'sends done value in PUT body');
    });
  });

  describe('Contextual why-suggested hints', () => {
    it('showTechniquePicker generates contextual pickHint', () => {
      assert.ok(appJs.includes('pickHint'), 'uses pickHint variable');
    });

    it('explains stale task recommendation', () => {
      assert.ok(
        appJs.includes('quick 5-min start') || appJs.includes('beats procrastination'),
        'explains quick start for stale tasks'
      );
    });

    it('explains last-used technique', () => {
      assert.ok(
        appJs.includes('last time for this area'),
        'explains technique reuse for area'
      );
    });
  });

  describe('Gentle reflection nudge', () => {
    it('updateReflectDoneLabel function is defined', () => {
      assert.ok(appJs.includes('function updateReflectDoneLabel'), 'updateReflectDoneLabel defined');
    });

    it('shows Skip Reflection when no rating', () => {
      assert.ok(appJs.includes("'Skip Reflection'"), 'button text says Skip Reflection');
    });

    it('shows Done when rating is given', () => {
      // After rating click, button text changes to Done
      assert.ok(appJs.includes("btn.textContent='Done'"), 'button text changes to Done');
    });

    it('rating click calls updateReflectDoneLabel', () => {
      assert.ok(appJs.includes('updateReflectDoneLabel()'), 'rating handler calls label updater');
    });

    it('dims button when no rating (opacity .7)', () => {
      assert.ok(appJs.includes(".opacity='.7'") || appJs.includes("opacity='.7'"),
        'button dimmed when no rating');
    });
  });

  describe('startFocusTimer data integrity', () => {
    it('fetches full task when subtasks are missing', () => {
      // startFocusTimer should check !tk.subtasks and re-fetch
      assert.ok(appJs.includes('!tk.subtasks'), 'checks for missing subtasks');
    });

    it('fetches task via /api/tasks/ endpoint', () => {
      // Should use single-task endpoint for full enrichment
      assert.ok(appJs.includes("api.get('/api/tasks/'+taskId)"), 'fetches individual task');
    });
  });
});
