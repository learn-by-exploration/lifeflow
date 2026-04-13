/**
 * Intelligent Daily Planner — AI optimizes task ordering for the day.
 */
'use strict';

const { toDateStr } = require('../../../utils/date');

const PLANNER_FUNCTION = {
  name: 'plan_day',
  description: 'Create an optimized daily task plan',
  parameters: {
    type: 'object',
    properties: {
      plan: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            task_id: { type: 'integer' },
            suggested_time: { type: 'string', description: 'Suggested time slot HH:MM' },
            reason: { type: 'string', description: 'Brief reason for this ordering' },
            energy_level: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Energy level needed' },
          },
          required: ['task_id'],
        },
      },
      deferred: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            task_id: { type: 'integer' },
            reason: { type: 'string' },
            suggested_date: { type: 'string', description: 'YYYY-MM-DD to defer to' },
          },
          required: ['task_id', 'reason'],
        },
        description: 'Tasks to defer if overloaded',
      },
      summary: { type: 'string', description: 'Brief motivational day preview' },
      estimated_hours: { type: 'number', description: 'Total estimated hours for the plan' },
    },
    required: ['plan'],
  },
};

function buildDailyPlanPrompt(tasks, context) {
  const system = `You are an intelligent daily planner. Create an optimized task schedule for today.

Principles:
- High-priority and deadline tasks first
- Place cognitively demanding tasks in the morning (high energy)
- Group related tasks together (same goal/area)
- Leave buffer time between tasks
- If there are more than 6-8 hours of tasks, suggest deferring lower-priority ones
- Consider the user's past focus patterns if available
- "doing" status tasks should be prioritized (already started)

Today: ${toDateStr()}
Day: ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]}`;

  const contextParts = [];
  if (context.focusPatterns) {
    contextParts.push(`User's typical productive hours: ${context.focusPatterns}`);
  }
  if (context.completedToday) {
    contextParts.push(`Already completed today: ${context.completedToday} tasks`);
  }
  if (context.habitsDue) {
    contextParts.push(`Habits due today: ${context.habitsDue.join(', ')}`);
  }

  const taskList = tasks.map(t => {
    const parts = [`ID:${t.id} "${t.title}" [${t.status}]`];
    if (t.priority) parts.push(`P${t.priority}`);
    if (t.due_date) parts.push(`due:${t.due_date}`);
    if (t.due_time) parts.push(`at:${t.due_time}`);
    if (t.estimated_minutes) parts.push(`~${t.estimated_minutes}min`);
    if (t.tags?.length) parts.push(`tags:${t.tags.map(tg => tg.name || tg).join(',')}`);
    if (t.goal_title) parts.push(`goal:"${t.goal_title}"`);
    return parts.join(' ');
  }).join('\n');

  const messages = [
    { role: 'system', content: system + (contextParts.length ? '\n\n' + contextParts.join('\n') : '') },
    { role: 'user', content: `Plan my day with these tasks:\n\n${taskList}` },
  ];

  return { messages, function: PLANNER_FUNCTION };
}

module.exports = { buildDailyPlanPrompt, PLANNER_FUNCTION };
