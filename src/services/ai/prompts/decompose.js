/**
 * Goal Decomposition — AI breaks down goals into tasks and milestones.
 */
'use strict';

const { toDateStr } = require('../../../utils/date');

const DECOMPOSE_FUNCTION = {
  name: 'decompose_goal',
  description: 'Break a goal into milestones, tasks, and subtasks',
  parameters: {
    type: 'object',
    properties: {
      milestones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  priority: { type: 'integer', enum: [0, 1, 2, 3] },
                  estimated_minutes: { type: 'integer' },
                  subtasks: { type: 'array', items: { type: 'string' } },
                  depends_on: { type: 'string', description: 'Title of task this depends on, or null' },
                },
                required: ['title'],
              },
            },
          },
          required: ['title', 'tasks'],
        },
      },
      suggested_due_date: { type: 'string', description: 'Suggested goal deadline if not set (YYYY-MM-DD)' },
      estimated_total_hours: { type: 'number' },
      notes: { type: 'string', description: 'Any advice or considerations' },
    },
    required: ['milestones'],
  },
};

function buildDecomposePrompt(goal, context) {
  const system = `You are a goal decomposition expert. Break down the user's goal into a structured plan with milestones and actionable tasks.

Rules:
- Create 2-5 milestones that represent major phases
- Each milestone should have 2-6 specific, actionable tasks
- Tasks should be concrete enough to complete in one sitting (30 min - 2 hours)
- Add subtasks for complex tasks
- Set realistic priorities (3=high for critical path, 1=low for nice-to-have)
- Estimate time in minutes for each task
- Note dependencies between tasks where relevant
- Consider the user's existing workload when suggesting timelines

Today: ${toDateStr()}`;

  const contextParts = [];
  if (goal.description) contextParts.push(`Goal description: ${goal.description}`);
  if (goal.due_date) contextParts.push(`Deadline: ${goal.due_date}`);
  if (context.area) contextParts.push(`Life area: ${context.area.name}`);
  if (context.existingTasks) {
    contextParts.push(`User currently has ${context.existingTasks} active tasks across all goals`);
  }
  if (context.completionRate) {
    contextParts.push(`User's average weekly task completion: ${context.completionRate} tasks/week`);
  }

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Decompose this goal: "${goal.title}"${contextParts.length ? '\n\nContext:\n' + contextParts.join('\n') : ''}` },
  ];

  return { messages, function: DECOMPOSE_FUNCTION };
}

module.exports = { buildDecomposePrompt, DECOMPOSE_FUNCTION };
