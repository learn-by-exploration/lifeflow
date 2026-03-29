const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeUser2 } = require('./helpers');

describe('IDOR Comprehensive Protection', () => {
  let u2;
  before(() => { setup(); u2 = makeUser2(); });
  after(() => teardown());
  beforeEach(() => cleanDb());

  // Helper: User1 creates full hierarchy via API
  async function u1Hierarchy() {
    const areaRes = await agent().post('/api/areas').send({ name: 'U1 Area', icon: '🔹', color: '#FF0000' });
    const area = areaRes.body;
    const goalRes = await agent().post(`/api/areas/${area.id}/goals`).send({ title: 'U1 Goal' });
    const goal = goalRes.body;
    const taskRes = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: 'U1 Task' });
    const task = taskRes.body;
    return { area, goal, task };
  }

  // ─── 1. Area Ownership ───────────────────────────────────────────────────────
  describe('Area ownership', () => {
    it('User2 cannot update User1 area', async () => {
      const { area } = await u1Hierarchy();
      const res = await u2.agent.put(`/api/areas/${area.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 area', async () => {
      const { area } = await u1Hierarchy();
      const res = await u2.agent.delete(`/api/areas/${area.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot archive User1 area', async () => {
      const { area } = await u1Hierarchy();
      const res = await u2.agent.put(`/api/areas/${area.id}/archive`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot list goals in User1 area', async () => {
      const { area } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/areas/${area.id}/goals`);
      // Should return empty array due to user_id filtering (goals belong to User1)
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0, 'Should not leak User1 goals');
    });
  });

  // ─── 2. Goal Ownership ───────────────────────────────────────────────────────
  describe('Goal ownership', () => {
    it('User2 cannot create goal in User1 area', async () => {
      const { area } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/areas/${area.id}/goals`).send({ title: 'Hacked Goal' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot update User1 goal', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.put(`/api/goals/${goal.id}`).send({ title: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 goal', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.delete(`/api/goals/${goal.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot view User1 goal milestones', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/goals/${goal.id}/milestones`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot create milestone on User1 goal', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/goals/${goal.id}/milestones`).send({ title: 'Spy Milestone' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot view User1 goal progress', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/goals/${goal.id}/progress`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot save User1 goal as template', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/goals/${goal.id}/save-as-template`).send({ name: 'Stolen Template' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 3. Task Ownership ───────────────────────────────────────────────────────
  describe('Task ownership', () => {
    it('User2 cannot read User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/tasks/${task.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot update User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.put(`/api/tasks/${task.id}`).send({ title: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.delete(`/api/tasks/${task.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot create task on User1 goal', async () => {
      const { goal } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/goals/${goal.id}/tasks`).send({ title: 'Spy Task' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot read User1 task comments', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/tasks/${task.id}/comments`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot post comment on User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/tasks/${task.id}/comments`).send({ text: 'Spying' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot read User1 task subtasks', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/tasks/${task.id}/subtasks`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot create subtask on User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/tasks/${task.id}/subtasks`).send({ title: 'Spy Subtask' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot set tags on User1 task', async () => {
      const { task } = await u1Hierarchy();
      const tagRes = await u2.agent.post('/api/tags').send({ name: 'u2tag', color: '#FF0000' });
      const res = await u2.agent.put(`/api/tasks/${task.id}/tags`).send({ tagIds: [tagRes.body.id] });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot read User1 task dependencies', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/tasks/${task.id}/deps`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot set dependencies on User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.put(`/api/tasks/${task.id}/deps`).send({ blockedByIds: [] });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot read User1 task custom fields', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.get(`/api/tasks/${task.id}/custom-fields`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot log time on User1 task', async () => {
      const { task } = await u1Hierarchy();
      const res = await u2.agent.post(`/api/tasks/${task.id}/time`).send({ minutes: 30 });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 4. Tag Ownership ────────────────────────────────────────────────────────
  describe('Tag ownership', () => {
    it('User2 cannot update User1 tag', async () => {
      const tagRes = await agent().post('/api/tags').send({ name: 'u1tag', color: '#FF0000' });
      const res = await u2.agent.put(`/api/tags/${tagRes.body.id}`).send({ name: 'hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 tag', async () => {
      const tagRes = await agent().post('/api/tags').send({ name: 'u1tag2', color: '#00FF00' });
      const res = await u2.agent.delete(`/api/tags/${tagRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 5. List Ownership ───────────────────────────────────────────────────────
  describe('List ownership', () => {
    it('User2 cannot update User1 list', async () => {
      const listRes = await agent().post('/api/lists').send({ name: 'U1 List' });
      const res = await u2.agent.put(`/api/lists/${listRes.body.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 list', async () => {
      const listRes = await agent().post('/api/lists').send({ name: 'U1 List' });
      const res = await u2.agent.delete(`/api/lists/${listRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot read User1 list items', async () => {
      const listRes = await agent().post('/api/lists').send({ name: 'U1 List' });
      const res = await u2.agent.get(`/api/lists/${listRes.body.id}/items`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot add item to User1 list', async () => {
      const listRes = await agent().post('/api/lists').send({ name: 'U1 List' });
      const res = await u2.agent.post(`/api/lists/${listRes.body.id}/items`).send({ title: 'Spy Item' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot save User1 list as template', async () => {
      const listRes = await agent().post('/api/lists').send({ name: 'U1 List' });
      const res = await u2.agent.post(`/api/lists/${listRes.body.id}/save-as-template`).send({ name: 'Stolen' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 6. Habit Ownership ──────────────────────────────────────────────────────
  describe('Habit ownership', () => {
    it('User2 cannot update User1 habit', async () => {
      const habitRes = await agent().post('/api/habits').send({ name: 'U1 Habit' });
      const res = await u2.agent.put(`/api/habits/${habitRes.body.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 habit', async () => {
      const habitRes = await agent().post('/api/habits').send({ name: 'U1 Habit' });
      const res = await u2.agent.delete(`/api/habits/${habitRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot log User1 habit', async () => {
      const habitRes = await agent().post('/api/habits').send({ name: 'U1 Habit' });
      const res = await u2.agent.post(`/api/habits/${habitRes.body.id}/log`).send({ date: '2026-03-30' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot view User1 habit heatmap', async () => {
      const habitRes = await agent().post('/api/habits').send({ name: 'U1 Habit' });
      const res = await u2.agent.get(`/api/habits/${habitRes.body.id}/heatmap`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 7. Filter Ownership ─────────────────────────────────────────────────────
  describe('Filter ownership', () => {
    it('User2 cannot update User1 filter', async () => {
      const filterRes = await agent().post('/api/filters').send({ name: 'U1 Filter', filters: { status: 'todo' } });
      const res = await u2.agent.put(`/api/filters/${filterRes.body.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 filter', async () => {
      const filterRes = await agent().post('/api/filters').send({ name: 'U1 Filter2', filters: { status: 'done' } });
      const res = await u2.agent.delete(`/api/filters/${filterRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 8. Note Ownership ───────────────────────────────────────────────────────
  describe('Note ownership', () => {
    it('User2 cannot read User1 note', async () => {
      const noteRes = await agent().post('/api/notes').send({ title: 'U1 Note', content: 'Secret' });
      const res = await u2.agent.get(`/api/notes/${noteRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot update User1 note', async () => {
      const noteRes = await agent().post('/api/notes').send({ title: 'U1 Note', content: 'Secret' });
      const res = await u2.agent.put(`/api/notes/${noteRes.body.id}`).send({ title: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 note', async () => {
      const noteRes = await agent().post('/api/notes').send({ title: 'U1 Note', content: 'Secret' });
      const res = await u2.agent.delete(`/api/notes/${noteRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 9. Focus Session Ownership ──────────────────────────────────────────────
  describe('Focus session ownership', () => {
    it('User2 cannot update User1 focus session', async () => {
      const { task } = await u1Hierarchy();
      const focusRes = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });
      const res = await u2.agent.put(`/api/focus/${focusRes.body.id}`).send({ duration_sec: 9999 });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot end User1 focus session', async () => {
      const { task } = await u1Hierarchy();
      const focusRes = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });
      const res = await u2.agent.put(`/api/focus/${focusRes.body.id}/end`).send({ duration_sec: 1500 });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 focus session', async () => {
      const { task } = await u1Hierarchy();
      const focusRes = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });
      const res = await u2.agent.delete(`/api/focus/${focusRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot add meta to User1 focus session', async () => {
      const { task } = await u1Hierarchy();
      const focusRes = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });
      const res = await u2.agent.post(`/api/focus/${focusRes.body.id}/meta`).send({ intention: 'Spying' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot read meta of User1 focus session', async () => {
      const { task } = await u1Hierarchy();
      const focusRes = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });
      const res = await u2.agent.get(`/api/focus/${focusRes.body.id}/meta`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot add steps to User1 focus session', async () => {
      const { task } = await u1Hierarchy();
      const focusRes = await agent().post('/api/focus').send({ task_id: task.id, duration_sec: 1500, type: 'pomodoro' });
      const res = await u2.agent.post(`/api/focus/${focusRes.body.id}/steps`).send({ steps: ['spy step'] });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 10. Custom Field Ownership ──────────────────────────────────────────────
  describe('Custom field ownership', () => {
    it('User2 cannot update User1 custom field', async () => {
      const fieldRes = await agent().post('/api/custom-fields').send({ name: 'U1 Field', field_type: 'text' });
      const res = await u2.agent.put(`/api/custom-fields/${fieldRes.body.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 custom field', async () => {
      const fieldRes = await agent().post('/api/custom-fields').send({ name: 'U1 Field2', field_type: 'number' });
      const res = await u2.agent.delete(`/api/custom-fields/${fieldRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 11. Inbox Ownership ─────────────────────────────────────────────────────
  describe('Inbox ownership', () => {
    it('User2 cannot update User1 inbox item', async () => {
      const inboxRes = await agent().post('/api/inbox').send({ title: 'U1 Inbox' });
      const res = await u2.agent.put(`/api/inbox/${inboxRes.body.id}`).send({ title: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 inbox item', async () => {
      const inboxRes = await agent().post('/api/inbox').send({ title: 'U1 Inbox' });
      const res = await u2.agent.delete(`/api/inbox/${inboxRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot triage User1 inbox item', async () => {
      const inboxRes = await agent().post('/api/inbox').send({ title: 'U1 Inbox' });
      // User2 needs their own goal to triage into
      const u2area = await u2.agent.post('/api/areas').send({ name: 'U2 Area' });
      const u2goal = await u2.agent.post(`/api/areas/${u2area.body.id}/goals`).send({ title: 'U2 Goal' });
      const res = await u2.agent.post(`/api/inbox/${inboxRes.body.id}/triage`).send({ goal_id: u2goal.body.id });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 12. Template Ownership ──────────────────────────────────────────────────
  describe('Template ownership', () => {
    it('User2 cannot update User1 template', async () => {
      const tmplRes = await agent().post('/api/templates').send({ name: 'U1 Tmpl', tasks: [{ title: 'T1' }] });
      const res = await u2.agent.put(`/api/templates/${tmplRes.body.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 template', async () => {
      const tmplRes = await agent().post('/api/templates').send({ name: 'U1 Tmpl2', tasks: [{ title: 'T1' }] });
      const res = await u2.agent.delete(`/api/templates/${tmplRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot apply User1 template to their goal', async () => {
      const tmplRes = await agent().post('/api/templates').send({ name: 'U1 Tmpl3', tasks: [{ title: 'T1' }] });
      const u2area = await u2.agent.post('/api/areas').send({ name: 'U2 Area' });
      const u2goal = await u2.agent.post(`/api/areas/${u2area.body.id}/goals`).send({ title: 'U2 Goal' });
      const res = await u2.agent.post(`/api/templates/${tmplRes.body.id}/apply`).send({ goalId: u2goal.body.id });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });

  // ─── 13. Automation Rule Ownership ────────────────────────────────────────────
  describe('Automation rule ownership', () => {
    it('User2 cannot update User1 rule', async () => {
      const ruleRes = await agent().post('/api/rules').send({
        name: 'U1 Rule', trigger_type: 'task_completed', action_type: 'add_tag',
        trigger_config: {}, action_config: {}
      });
      const res = await u2.agent.put(`/api/rules/${ruleRes.body.id}`).send({ name: 'Hacked' });
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });

    it('User2 cannot delete User1 rule', async () => {
      const ruleRes = await agent().post('/api/rules').send({
        name: 'U1 Rule2', trigger_type: 'task_created', action_type: 'set_priority',
        trigger_config: {}, action_config: {}
      });
      const res = await u2.agent.delete(`/api/rules/${ruleRes.body.id}`);
      assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
    });
  });
});
