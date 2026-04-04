/**
 * Weekly Review Copilot — AI-driven reflection and pattern analysis.
 */
'use strict';

function buildReviewPrompt(weekData, context) {
  const system = `You are a thoughtful productivity coach conducting a weekly review. Analyze the user's week and generate personalized reflective insights.

Your response should be a JSON object with these fields:
- patterns: array of 2-4 observation strings about the week's patterns
- reflectionQuestions: array of 3-5 personalized reflection questions
- balanceAlert: string or null — alert if life area balance is off
- nextWeekFocus: string — suggested focus area for next week
- wins: array of 1-3 notable accomplishments to celebrate
- concerns: array of 0-2 things to watch (overwork, neglected areas, etc.)
- motivationalNote: string — brief personalized encouragement

Be specific — reference actual task names, areas, and numbers. Avoid generic advice.`;

  const parts = [];
  if (weekData.completed?.length) {
    parts.push(`Tasks completed (${weekData.completed.length}):\n${weekData.completed.map(t => `  - "${t.title}" [${t.area || 'no area'}]${t.priority ? ' P' + t.priority : ''}`).join('\n')}`);
  }
  if (weekData.created?.length) {
    parts.push(`Tasks created: ${weekData.created.length}`);
  }
  if (weekData.overdue?.length) {
    parts.push(`Overdue tasks: ${weekData.overdue.map(t => `"${t.title}"`).join(', ')}`);
  }
  if (weekData.habitStats) {
    const habits = weekData.habitStats.map(h => `${h.name}: ${h.logged}/${h.target} days`).join(', ');
    parts.push(`Habit performance: ${habits}`);
  }
  if (weekData.focusMinutes !== undefined && weekData.focusMinutes !== null) {
    parts.push(`Total focus time: ${weekData.focusMinutes} minutes`);
  }
  if (weekData.areaBreakdown) {
    const areas = Object.entries(weekData.areaBreakdown).map(([name, count]) => `${name}: ${count}`).join(', ');
    parts.push(`Tasks by life area: ${areas}`);
  }
  if (context.priorReflection) {
    parts.push(`Last week's reflection: "${context.priorReflection}"`);
  }
  if (context.priorPriorities) {
    parts.push(`Last week's priorities: "${context.priorPriorities}"`);
  }

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Here's my week summary:\n\n${parts.join('\n\n')}` },
  ];

  return { messages, jsonMode: true };
}

module.exports = { buildReviewPrompt };
