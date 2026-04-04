/**
 * Smart Task Routing — AI classifies and routes new tasks.
 */
'use strict';

const CLASSIFY_FUNCTION = {
  name: 'classify_task',
  description: 'Classify a task into the appropriate goal, tags, and priority',
  parameters: {
    type: 'object',
    properties: {
      suggested_goal_id: { type: 'integer', description: 'Best matching goal ID, or null' },
      suggested_tags: { type: 'array', items: { type: 'string' }, description: 'Suggested tag names' },
      suggested_priority: { type: 'integer', enum: [0, 1, 2, 3] },
      suggested_area_id: { type: 'integer', description: 'Best matching life area ID, or null' },
      confidence: { type: 'number', description: '0-1 confidence score' },
      reason: { type: 'string', description: 'Brief explanation' },
    },
    required: ['confidence'],
  },
};

function buildClassifyPrompt(task, context) {
  const system = `You are a task classifier. Given a task title and the user's existing organizational structure, suggest where this task belongs.

Rules:
- Match to the most relevant goal based on semantic similarity
- Suggest existing tags that fit (don't invent new ones unless none match)
- Suggest priority based on urgency signals in the title
- If no good match exists, leave goal_id null — don't force a bad match
- Confidence should reflect how sure you are (below 0.5 = uncertain)`;

  const contextParts = [];
  if (context.goals?.length) {
    contextParts.push('Goals:\n' + context.goals.map(g => `  ID:${g.id} "${g.title}" [area: ${g.area || '?'}]`).join('\n'));
  }
  if (context.areas?.length) {
    contextParts.push('Life areas:\n' + context.areas.map(a => `  ID:${a.id} "${a.name}"`).join('\n'));
  }
  if (context.tags?.length) {
    contextParts.push(`Existing tags: ${context.tags.map(t => t.name).join(', ')}`);
  }

  const messages = [
    { role: 'system', content: system + '\n\n' + contextParts.join('\n\n') },
    { role: 'user', content: `Classify: "${task.title}"${task.note ? `\nNote: ${task.note}` : ''}` },
  ];

  return { messages, function: CLASSIFY_FUNCTION };
}

module.exports = { buildClassifyPrompt, CLASSIFY_FUNCTION };
