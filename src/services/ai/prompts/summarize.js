/**
 * Summary/narrative prompts — Year in Review, daily highlights, etc.
 */
'use strict';

function buildYearInReviewPrompt(yearData) {
  const system = `You are creating a "Year in Review" narrative summary (like Spotify Wrapped) for a personal task management app. Generate an engaging, data-driven summary.

Your response should be a JSON object with:
- headline: string — catchy one-liner for the year
- totalStats: object — {tasksCompleted, goalsAchieved, focusHours, streakRecord, habitLogs}
- topAreas: array of {name, percentage, insight} — top 3 most active life areas
- monthByMonth: array of {month, highlight, taskCount} — brief highlight per month
- patterns: object — {busiestDay, busiestHour, averageTasksPerWeek, longestStreak}
- achievements: array of strings — notable milestones
- growthStory: string — 2-3 sentence narrative about personal growth
- funFacts: array of strings — 3-5 fun/surprising data points
- nextYearSuggestion: string — one suggestion for next year

Be specific, celebratory, and data-driven. Reference actual numbers.`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Here's my year data:\n${JSON.stringify(yearData, null, 2)}` },
  ];

  return { messages, jsonMode: true };
}

function buildDailyHighlightPrompt(dayData) {
  const system = `Generate a brief daily highlight summary based on today's activity. Response as JSON:
- headline: string — one catchy line about the day
- topWin: string — the best accomplishment
- focusStat: string — focus time summary
- suggestion: string — one small suggestion for tomorrow

Keep it brief and encouraging.`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(dayData) },
  ];

  return { messages, jsonMode: true };
}

function buildCognitiveLoadPrompt(userData) {
  const system = `Analyze the user's current cognitive load based on their task data. Response as JSON:
- score: number 1-10 (1=very light, 10=overwhelmed)
- level: string — "light", "moderate", "heavy", "overloaded"
- factors: array of strings — what's contributing to load
- suggestions: array of strings — 1-3 actionable suggestions to reduce load
- canTakeMore: boolean — whether user can safely add more tasks

Consider: total active tasks, overdue count, priority distribution, approaching deadlines, context switching (many different areas), and recent completion rate.`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(userData) },
  ];

  return { messages, jsonMode: true };
}

function buildNextTaskPrompt(tasks, context) {
  const system = `You are a decision fatigue reducer. From the user's task list, pick THE SINGLE most impactful task to do right now. Response as JSON:
- task_id: integer — the chosen task ID
- reason: string — 1-2 sentences explaining why this task, right now
- estimatedMinutes: integer — how long it should take
- tip: string — a brief tactical tip for approaching this task

Consider: priority, deadlines, dependencies (blocked tasks), time of day, energy level, momentum (quick wins vs. deep work), and how long since user last made progress.`;

  const contextParts = [];
  if (context.timeOfDay) contextParts.push(`Current time: ${context.timeOfDay}`);
  if (context.completedToday !== undefined && context.completedToday !== null) contextParts.push(`Completed today: ${context.completedToday}`);
  if (context.energyLevel) contextParts.push(`Energy: ${context.energyLevel}`);

  const taskList = tasks.map(t => {
    const parts = [`ID:${t.id} "${t.title}" [${t.status}] P${t.priority || 0}`];
    if (t.due_date) parts.push(`due:${t.due_date}`);
    if (t.estimated_minutes) parts.push(`~${t.estimated_minutes}min`);
    if (t.goal_title) parts.push(`goal:"${t.goal_title}"`);
    return parts.join(' ');
  }).join('\n');

  const messages = [
    { role: 'system', content: system + (contextParts.length ? '\n\n' + contextParts.join('\n') : '') },
    { role: 'user', content: `Pick my next task:\n\n${taskList}` },
  ];

  return { messages, jsonMode: true };
}

function buildAccountabilityPrompt(planned, completed, context) {
  const system = `Generate a brief, empathetic accountability check-in message. The user planned tasks for today. Some are done, some aren't.

Rules:
- Be encouraging, never shaming
- Reference specific task names
- If they're behind, suggest rescheduling not guilt
- If they're ahead, celebrate
- Keep it under 2 sentences
- Return as JSON: { message: string, tone: "celebrating"|"encouraging"|"nudging" }`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Planned: ${planned.map(t => `"${t.title}"`).join(', ')}\nCompleted: ${completed.map(t => `"${t.title}"`).join(', ') || 'none yet'}\nTime: ${context.timeOfDay || 'afternoon'}` },
  ];

  return { messages, jsonMode: true };
}

function buildHabitCoachPrompt(habit, context) {
  const system = `You are a behavioral science-informed habit coach. Help the user succeed with a new habit using evidence-based strategies. Response as JSON:
- cueRoutineReward: object — {cue, routine, reward} structure
- stackSuggestion: string or null — suggest stacking with existing habit if possible
- difficultyPrediction: string — "easy", "moderate", "challenging"
- tipsForSuccess: array of 2-3 strings
- expectedTimeToAutomatic: string — e.g., "2-3 weeks"`;

  const contextParts = [];
  if (context.existingHabits?.length) {
    contextParts.push(`Existing habits: ${context.existingHabits.map(h => `"${h.name}" at ${h.preferred_time || 'anytime'}`).join(', ')}`);
  }

  const messages = [
    { role: 'system', content: system + (contextParts.length ? '\n\n' + contextParts.join('\n') : '') },
    { role: 'user', content: `Help me build this habit: "${habit.name}" (target: ${habit.target}x per ${habit.frequency})` },
  ];

  return { messages, jsonMode: true };
}

function buildLifeBalancePrompt(areaData) {
  const system = `Analyze the user's life balance across all their life areas based on recent activity. Response as JSON:
- scores: object — {areaName: number 0-100} for each area
- overallBalance: number 0-100
- neglectedAreas: array of {name, daysSinceActivity, suggestion}
- overinvestedAreas: array of {name, percentageOfTotal}
- commentary: string — 2-3 sentences of personalized analysis
- microTasks: array of {area, task} — small suggested tasks for neglected areas`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(areaData) },
  ];

  return { messages, jsonMode: true };
}

function buildAutomationBuilderPrompt(description, context) {
  const system = `Convert a natural language description into a LifeFlow automation rule. Response as JSON:
- trigger_type: string — one of: ${context.triggerTypes?.join(', ') || 'task.created, task.completed, task.updated, goal.completed, habit.logged, schedule.daily, schedule.weekly'}
- trigger_config: object — trigger-specific configuration
- conditions: array of condition objects with {field, operator, value}
- actions: array of action objects with {type, config}
- name: string — short descriptive name
- description: string — one-line description

Available action types: ${context.actionTypes?.join(', ') || 'update_task, create_task, send_notification, move_to_goal, add_tag, set_priority, create_subtasks'}`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Create automation: "${description}"` },
  ];

  return { messages, jsonMode: true };
}

module.exports = {
  buildYearInReviewPrompt,
  buildDailyHighlightPrompt,
  buildCognitiveLoadPrompt,
  buildNextTaskPrompt,
  buildAccountabilityPrompt,
  buildHabitCoachPrompt,
  buildLifeBalancePrompt,
  buildAutomationBuilderPrompt,
};
