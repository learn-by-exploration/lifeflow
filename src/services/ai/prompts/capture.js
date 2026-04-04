/**
 * NLP v2 — AI-enhanced task capture prompt.
 * Falls back to regex parser if AI unavailable.
 */
'use strict';

const CAPTURE_FUNCTION = {
  name: 'parse_task',
  description: 'Parse natural language into structured task fields',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Clean task title without metadata' },
      priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0=none, 1=low, 2=medium, 3=high' },
      due_date: { type: 'string', description: 'ISO date YYYY-MM-DD or null' },
      due_time: { type: 'string', description: 'Time HH:MM or null' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tag names extracted' },
      estimated_minutes: { type: 'integer', description: 'Estimated duration in minutes or null' },
      recurring: { type: 'string', description: 'Recurring pattern or null. One of: daily, weekly, monthly, yearly, weekdays, or null' },
      my_day: { type: 'boolean', description: 'Whether task should be added to My Day' },
      goal_hint: { type: 'string', description: 'Suggested goal/area name if implied' },
    },
    required: ['title'],
  },
};

function buildCapturePrompt(text, context) {
  const system = `You are a task parser for a personal task management app. Parse the user's natural language input into structured task fields.

Rules:
- Extract a clean title (remove dates, priorities, tags, time estimates)
- Detect priority: words like "urgent", "important", "critical" = 3; "high priority" = 3; "low priority" = 1
- Detect dates: "today", "tomorrow", "next monday", "in 3 days", "by Friday", specific dates
- Detect times: "at 3pm", "at 14:00", "morning" (09:00), "afternoon" (14:00), "evening" (18:00)
- Detect tags: words after # or contextual categories (work, personal, health, etc.)
- Detect duration: "30 min", "1 hour", "takes about 2h"
- Detect recurring: "every day", "weekly", "every monday", "daily"
- Detect my_day: "today" or "for today" implies my_day = true
- goal_hint: if text implies a life area or goal (e.g., "for my fitness goal"), extract it

Today's date: ${new Date().toISOString().split('T')[0]}
Day of week: ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]}`;

  const contextParts = [];
  if (context.areas?.length) {
    contextParts.push(`User's life areas: ${context.areas.map(a => a.name).join(', ')}`);
  }
  if (context.tags?.length) {
    contextParts.push(`Existing tags: ${context.tags.map(t => t.name).join(', ')}`);
  }
  if (context.goals?.length) {
    contextParts.push(`Active goals: ${context.goals.map(g => g.title).join(', ')}`);
  }

  const messages = [
    { role: 'system', content: system + (contextParts.length ? '\n\n' + contextParts.join('\n') : '') },
    { role: 'user', content: text },
  ];

  return { messages, function: CAPTURE_FUNCTION };
}

module.exports = { buildCapturePrompt, CAPTURE_FUNCTION };
