'use strict';
/**
 * Advanced Automation Engine
 *
 * Centralized event-driven rule execution with:
 * - 19 trigger types (task, goal, habit, focus, schedule, review)
 * - 19 action types (task, habit, notification, organization)
 * - AND/OR condition system
 * - Multi-action support
 * - Chain depth limiting (max 3)
 * - Per-user rate limiting (50 actions/min)
 * - Execution logging
 * - Template variable interpolation
 */

const MAX_CHAIN_DEPTH = 3;
const MAX_ACTIONS_PER_MINUTE = 50;
const MAX_ACTIONS_PER_RULE = 10;
const MAX_CONDITIONS_PER_RULE = 20;

// ─── Trigger & Action constants ───
const VALID_TRIGGER_TYPES = [
  // Task triggers
  'task_completed', 'task_created', 'task_updated', 'task_overdue',
  'task_due_today', 'task_due_soon', 'task_stale',
  // Goal triggers
  'goal_progress', 'goal_all_tasks_done',
  // Habit triggers
  'habit_logged', 'habit_streak', 'habit_missed',
  // Focus triggers
  'focus_completed', 'focus_streak',
  // Schedule triggers
  'schedule_daily', 'schedule_weekly', 'schedule_monthly',
  // Review triggers
  'daily_review_saved', 'weekly_review_saved',
];

const VALID_ACTION_TYPES = [
  // Task actions
  'add_to_myday', 'remove_from_myday', 'set_priority', 'set_status',
  'set_due_date', 'add_tag', 'move_to_goal', 'create_followup',
  'add_subtasks', 'apply_template',
  // Habit actions
  'log_habit', 'create_habit_task',
  // Notification actions
  'send_notification', 'send_toast',
  // Organization actions
  'move_to_inbox', 'archive_goal', 'create_review_prompt',
];

// Human-readable labels
const TRIGGER_LABELS = {
  task_completed: 'When a task is completed',
  task_created: 'When a task is created',
  task_updated: 'When a task is updated',
  task_overdue: 'When a task becomes overdue',
  task_due_today: 'When a task is due today',
  task_due_soon: 'When a task is due soon',
  task_stale: 'When a task hasn\'t been updated',
  goal_progress: 'When goal progress reaches a threshold',
  goal_all_tasks_done: 'When all tasks in a goal are done',
  habit_logged: 'When a habit is logged',
  habit_streak: 'When a habit streak is reached',
  habit_missed: 'When a habit is missed',
  focus_completed: 'When a focus session ends',
  focus_streak: 'When focus sessions reach a count',
  schedule_daily: 'Every day at a set time',
  schedule_weekly: 'Every week on a set day',
  schedule_monthly: 'Every month on a set day',
  daily_review_saved: 'When daily review is saved',
  weekly_review_saved: 'When weekly review is saved',
};

const ACTION_LABELS = {
  add_to_myday: 'Add to My Day',
  remove_from_myday: 'Remove from My Day',
  set_priority: 'Set priority',
  set_status: 'Set status',
  set_due_date: 'Set due date',
  add_tag: 'Add a tag',
  move_to_goal: 'Move to goal',
  create_followup: 'Create follow-up task',
  add_subtasks: 'Add subtasks',
  apply_template: 'Apply template',
  log_habit: 'Log a habit',
  create_habit_task: 'Create task for habit',
  send_notification: 'Send push notification',
  send_toast: 'Show toast message',
  move_to_inbox: 'Move to inbox',
  archive_goal: 'Archive goal',
  create_review_prompt: 'Add review note',
};

class AutomationEngine {
  constructor(db, logger, helpers) {
    this.db = db;
    this.logger = logger;
    this.helpers = helpers;
    this._executionDepth = 0;
    this._rateCounts = {};       // userId:minuteKey → count
    this._toastQueue = {};       // userId → [{ message, type }]
    this._pushService = null;
    try { this._pushService = require('./push.service'); } catch {}
  }

  // ─── Public API ───

  /**
   * Emit an automation event. Called from routes/scheduler.
   * @param {string} event - Trigger type
   * @param {object} context - { userId, task?, habit?, focus?, goal?, ... }
   */
  emit(event, context) {
    if (!context.userId) return;
    if (!VALID_TRIGGER_TYPES.includes(event)) return;

    try {
      this._handleEvent(event, context);
    } catch (err) {
      this.logger.error({ err, event, userId: context.userId }, 'Automation engine error');
    }
  }

  /** Get queued toasts for a user and clear the queue */
  drainToasts(userId) {
    const toasts = this._toastQueue[userId] || [];
    this._toastQueue[userId] = [];
    return toasts;
  }

  // ─── Core execution ───

  _handleEvent(event, context) {
    if (this._executionDepth >= MAX_CHAIN_DEPTH) {
      this.logger.warn({ event, userId: context.userId, depth: this._executionDepth },
        'Max automation chain depth reached');
      return;
    }

    // Rate limiting
    const minuteKey = `${context.userId}:${Math.floor(Date.now() / 60000)}`;
    this._rateCounts[minuteKey] = (this._rateCounts[minuteKey] || 0);
    // Cleanup old keys periodically
    if (Math.random() < 0.01) this._cleanupRateCounts();

    const rules = this.db.prepare(
      'SELECT * FROM automation_rules WHERE enabled=1 AND trigger_type=? AND user_id=?'
    ).all(event, context.userId);

    for (const rule of rules) {
      try {
        // Check rate limit
        if (this._rateCounts[minuteKey] >= MAX_ACTIONS_PER_MINUTE) {
          this.logger.warn({ userId: context.userId, minuteKey },
            'Automation rate limit reached');
          this._logExecution(rule, event, context, 'Rate limit exceeded');
          break;
        }

        // Parse configs
        const triggerConfig = this._parseJson(rule.trigger_config, {});
        const conditions = this._parseJson(rule.conditions, null);

        // Evaluate conditions (new system or legacy flat filters)
        if (!this._evaluateConditions(conditions, triggerConfig, context)) continue;

        // Get actions (multi-action array or single action_type/action_config)
        const actions = this._getActions(rule);

        // Execute all actions
        this._executionDepth++;
        const results = [];
        for (const action of actions) {
          try {
            const result = this._executeAction(action.type, action.config, context, rule);
            results.push({ type: action.type, config: action.config, result: result || 'ok' });
            this._rateCounts[minuteKey]++;
          } catch (actionErr) {
            results.push({ type: action.type, config: action.config, result: 'error', error: actionErr.message });
            this.logger.error({ err: actionErr, ruleId: rule.id, action: action.type }, 'Action execution failed');
          }
        }
        this._executionDepth--;

        // Update stats
        this.db.prepare(
          'UPDATE automation_rules SET fire_count = fire_count + 1, last_fired_at = datetime(\'now\') WHERE id=?'
        ).run(rule.id);

        // Log execution
        this._logExecution(rule, event, context, null, results);
      } catch (ruleErr) {
        this._executionDepth = Math.max(0, this._executionDepth - 1);
        this.logger.error({ err: ruleErr, ruleId: rule.id }, 'Rule execution failed');
        this._logExecution(rule, event, context, ruleErr.message);
      }
    }
  }

  // ─── Condition evaluation ───

  _evaluateConditions(conditions, triggerConfig, context) {
    // New condition system takes priority
    if (conditions && conditions.rules && conditions.rules.length > 0) {
      return this._evalConditionGroup(conditions, context);
    }

    // Legacy flat trigger_config filters
    if (triggerConfig) {
      const task = context.task;
      if (!task) return true;
      if (triggerConfig.area_id && task.area_id !== triggerConfig.area_id) return false;
      if (triggerConfig.goal_id && task.goal_id !== triggerConfig.goal_id) return false;
      if (triggerConfig.priority !== undefined && task.priority !== triggerConfig.priority) return false;
    }
    return true;
  }

  _evalConditionGroup(group, context) {
    if (!group.rules || !group.rules.length) return true;
    const matchAll = group.match !== 'any'; // default to 'all'

    for (const rule of group.rules) {
      // Nested group
      if (rule.rules) {
        const result = this._evalConditionGroup(rule, context);
        if (matchAll && !result) return false;
        if (!matchAll && result) return true;
        continue;
      }

      const result = this._evalSingleCondition(rule, context);
      if (matchAll && !result) return false;
      if (!matchAll && result) return true;
    }

    return matchAll; // all passed for AND, none passed for OR
  }

  _evalSingleCondition(cond, context) {
    const value = this._resolveField(cond.field, context);
    const target = cond.value;
    const op = cond.operator;

    switch (op) {
      case 'equals': return value === target;
      case 'not_equals': return value !== target;
      case 'gt': return typeof value === 'number' && value > target;
      case 'gte': return typeof value === 'number' && value >= target;
      case 'lt': return typeof value === 'number' && value < target;
      case 'lte': return typeof value === 'number' && value <= target;
      case 'contains':
        if (Array.isArray(value)) return value.includes(target);
        if (typeof value === 'string') return value.toLowerCase().includes(String(target).toLowerCase());
        return false;
      case 'not_contains':
        if (Array.isArray(value)) return !value.includes(target);
        if (typeof value === 'string') return !value.toLowerCase().includes(String(target).toLowerCase());
        return true;
      case 'starts_with':
        return typeof value === 'string' && value.toLowerCase().startsWith(String(target).toLowerCase());
      case 'is_empty':
        return value === null || value === undefined || value === '' || value === 0 ||
          (Array.isArray(value) && value.length === 0);
      case 'is_not_empty':
        return value !== null && value !== undefined && value !== '' && value !== 0 &&
          !(Array.isArray(value) && value.length === 0);
      default: return false;
    }
  }

  _resolveField(field, context) {
    if (!field) return undefined;
    const parts = field.split('.');
    const scope = parts[0]; // task, habit, focus, goal, schedule
    const prop = parts[1];

    if (scope === 'task' && context.task) {
      const t = context.task;
      switch (prop) {
        case 'area_id': return t.area_id;
        case 'goal_id': return t.goal_id;
        case 'priority': return t.priority;
        case 'status': return t.status;
        case 'has_due_date': return !!t.due_date;
        case 'is_recurring': return !!t.recurring;
        case 'title': return t.title || '';
        case 'estimated_minutes': return t.estimated_minutes || 0;
        case 'days_overdue': return context.days_overdue || 0;
        case 'days_stale': return context.days_stale || 0;
        case 'tags':
          if (t.tags) return t.tags.map(tg => typeof tg === 'string' ? tg : tg.name);
          // Load tags if not already present
          try {
            return this.db.prepare(
              'SELECT t.name FROM tags t JOIN task_tags tt ON t.id=tt.tag_id WHERE tt.task_id=?'
            ).all(t.id).map(r => r.name);
          } catch { return []; }
        default: return undefined;
      }
    }
    if (scope === 'habit' && context.habit) {
      switch (prop) {
        case 'id': return context.habit.id;
        case 'area_id': return context.habit.area_id;
        case 'streak': return context.streak || 0;
        case 'name': return context.habit.name;
        default: return undefined;
      }
    }
    if (scope === 'focus' && context.focus) {
      switch (prop) {
        case 'duration_sec': return context.focus.duration_sec || 0;
        case 'type': return context.focus.type || 'pomodoro';
        default: return undefined;
      }
    }
    if (scope === 'goal' && context.goal) {
      switch (prop) {
        case 'percentage': return context.percentage || 0;
        case 'id': return context.goal.id;
        case 'title': return context.goal.title;
        default: return undefined;
      }
    }
    if (scope === 'schedule') {
      switch (prop) {
        case 'day_of_week': return context.day_of_week ?? new Date().getDay();
        default: return undefined;
      }
    }
    return undefined;
  }

  // ─── Action execution ───

  _getActions(rule) {
    // Multi-action array takes priority
    const actionsJson = this._parseJson(rule.actions, null);
    if (Array.isArray(actionsJson) && actionsJson.length > 0) {
      return actionsJson.slice(0, MAX_ACTIONS_PER_RULE);
    }
    // Single action fallback
    if (rule.action_type) {
      return [{ type: rule.action_type, config: this._parseJson(rule.action_config, {}) }];
    }
    return [];
  }

  _executeAction(type, config, context, rule) {
    const db = this.db;
    const userId = context.userId;
    const task = context.task;

    switch (type) {
      // ─── Task actions ───
      case 'add_to_myday': {
        if (!task) return 'no_task';
        db.prepare('UPDATE tasks SET my_day=1 WHERE id=? AND user_id=?').run(task.id, userId);
        return 'ok';
      }
      case 'remove_from_myday': {
        if (!task) return 'no_task';
        db.prepare('UPDATE tasks SET my_day=0 WHERE id=? AND user_id=?').run(task.id, userId);
        return 'ok';
      }
      case 'set_priority': {
        if (!task || config.priority === undefined) return 'no_task';
        const p = Math.max(0, Math.min(3, Number(config.priority) || 0));
        db.prepare('UPDATE tasks SET priority=? WHERE id=? AND user_id=?').run(p, task.id, userId);
        return 'ok';
      }
      case 'set_status': {
        if (!task || !config.status) return 'no_task';
        const valid = ['todo', 'doing', 'done'];
        if (!valid.includes(config.status)) return 'invalid_status';
        const now = config.status === 'done' ? new Date().toISOString() : null;
        db.prepare('UPDATE tasks SET status=?, completed_at=COALESCE(?,completed_at) WHERE id=? AND user_id=?')
          .run(config.status, now, task.id, userId);
        return 'ok';
      }
      case 'set_due_date': {
        if (!task) return 'no_task';
        let newDue = null;
        if (config.mode === 'shift' && config.value) {
          const m = String(config.value).match(/^([+-]?\d+)([dwm])$/);
          if (m) {
            const base = task.due_date ? new Date(task.due_date + 'T00:00:00') : new Date();
            const n = parseInt(m[1]);
            if (m[2] === 'd') base.setDate(base.getDate() + n);
            else if (m[2] === 'w') base.setDate(base.getDate() + n * 7);
            else if (m[2] === 'm') base.setMonth(base.getMonth() + n);
            newDue = base.toISOString().slice(0, 10);
          }
        } else if (config.value === 'today') {
          newDue = new Date().toISOString().slice(0, 10);
        } else if (config.value === 'tomorrow') {
          const d = new Date(); d.setDate(d.getDate() + 1);
          newDue = d.toISOString().slice(0, 10);
        } else if (config.value && /^\d{4}-\d{2}-\d{2}$/.test(config.value)) {
          newDue = config.value;
        } else if (config.value) {
          // Relative format: +1d, +2w, etc.
          const m = String(config.value).match(/^[+]?(\d+)([dwm])$/);
          if (m) {
            const base = new Date();
            const n = parseInt(m[1]);
            if (m[2] === 'd') base.setDate(base.getDate() + n);
            else if (m[2] === 'w') base.setDate(base.getDate() + n * 7);
            else if (m[2] === 'm') base.setMonth(base.getMonth() + n);
            newDue = base.toISOString().slice(0, 10);
          }
        }
        if (newDue) {
          db.prepare('UPDATE tasks SET due_date=? WHERE id=? AND user_id=?').run(newDue, task.id, userId);
        }
        return newDue ? 'ok' : 'invalid_date';
      }
      case 'add_tag': {
        if (!task || !config.tag_id) return 'no_task';
        // Verify tag belongs to user
        const tag = db.prepare('SELECT id FROM tags WHERE id=? AND user_id=?').get(config.tag_id, userId);
        if (!tag) return 'tag_not_found';
        db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(task.id, config.tag_id);
        return 'ok';
      }
      case 'move_to_goal': {
        if (!task || !config.goal_id) return 'no_task';
        // Verify goal belongs to user
        const goal = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(config.goal_id, userId);
        if (!goal) return 'goal_not_found';
        const pos = this.helpers.getNextPosition('tasks', 'goal_id', config.goal_id);
        db.prepare('UPDATE tasks SET goal_id=?, position=? WHERE id=? AND user_id=?')
          .run(config.goal_id, pos, task.id, userId);
        return 'ok';
      }
      case 'create_followup': {
        if (!config.title) return 'no_title';
        const goalId = config.goal_id || (task ? task.goal_id : null);
        if (!goalId) return 'no_goal';
        // Verify goal ownership
        const g = db.prepare('SELECT id FROM goals WHERE id=? AND user_id=?').get(goalId, userId);
        if (!g) return 'goal_not_found';
        const title = this._interpolate(config.title, context);
        const pos = this.helpers.getNextPosition('tasks', 'goal_id', goalId);
        let dueDate = null;
        if (config.due) {
          const m = String(config.due).match(/^[+]?(\d+)([dwm])$/);
          if (m) {
            const d = new Date();
            if (m[2] === 'd') d.setDate(d.getDate() + parseInt(m[1]));
            else if (m[2] === 'w') d.setDate(d.getDate() + parseInt(m[1]) * 7);
            else if (m[2] === 'm') d.setMonth(d.getMonth() + parseInt(m[1]));
            dueDate = d.toISOString().slice(0, 10);
          } else if (config.due === 'today') {
            dueDate = new Date().toISOString().slice(0, 10);
          } else if (config.due === 'tomorrow') {
            const d = new Date(); d.setDate(d.getDate() + 1);
            dueDate = d.toISOString().slice(0, 10);
          }
        }
        db.prepare(
          'INSERT INTO tasks (goal_id, title, priority, position, due_date, user_id) VALUES (?,?,?,?,?,?)'
        ).run(goalId, title, config.priority || 0, pos, dueDate, userId);
        return 'ok';
      }
      case 'add_subtasks': {
        if (!task || !Array.isArray(config.subtasks)) return 'no_task';
        const maxPos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM subtasks WHERE task_id=?')
          .get(task.id).p;
        const ins = db.prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?,?,?)');
        config.subtasks.slice(0, 20).forEach((s, i) => {
          if (typeof s === 'string' && s.trim()) {
            ins.run(task.id, this._interpolate(s.trim(), context), maxPos + i);
          }
        });
        return 'ok';
      }
      case 'apply_template': {
        if (!task || !config.template_id) return 'no_task';
        const tmpl = db.prepare('SELECT * FROM task_templates WHERE id=? AND user_id=?')
          .get(config.template_id, userId);
        if (!tmpl) return 'template_not_found';
        const tasks = this._parseJson(tmpl.tasks, []);
        const maxPos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM subtasks WHERE task_id=?')
          .get(task.id).p;
        const ins = db.prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?,?,?)');
        tasks.forEach((t, i) => {
          if (t.title) ins.run(task.id, t.title, maxPos + i);
        });
        return 'ok';
      }

      // ─── Habit actions ───
      case 'log_habit': {
        if (!config.habit_id) return 'no_habit';
        const habit = db.prepare('SELECT id FROM habits WHERE id=? AND user_id=?').get(config.habit_id, userId);
        if (!habit) return 'habit_not_found';
        const today = new Date().toISOString().slice(0, 10);
        db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id, date, count) VALUES (?,?, COALESCE((SELECT count FROM habit_logs WHERE habit_id=? AND date=?),0)+1)')
          .run(config.habit_id, today, config.habit_id, today);
        return 'ok';
      }
      case 'create_habit_task': {
        if (!config.habit_id) return 'no_habit';
        const h = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?').get(config.habit_id, userId);
        if (!h) return 'habit_not_found';
        // Find first goal for the user (or use habit's area)
        let goalId = null;
        if (h.area_id) {
          const g = db.prepare('SELECT id FROM goals WHERE area_id=? AND user_id=? AND status=\'active\' ORDER BY position LIMIT 1')
            .get(h.area_id, userId);
          if (g) goalId = g.id;
        }
        if (!goalId) {
          const g = db.prepare('SELECT id FROM goals WHERE user_id=? AND status=\'active\' ORDER BY position LIMIT 1').get(userId);
          if (g) goalId = g.id;
        }
        if (!goalId) return 'no_goal';
        const title = config.title ? this._interpolate(config.title, context) : h.name;
        const pos = this.helpers.getNextPosition('tasks', 'goal_id', goalId);
        const today = new Date().toISOString().slice(0, 10);
        db.prepare('INSERT INTO tasks (goal_id, title, priority, position, due_date, user_id, my_day) VALUES (?,?,?,?,?,?,1)')
          .run(goalId, title, config.priority || 1, pos, today, userId);
        return 'ok';
      }

      // ─── Notification actions ───
      case 'send_notification': {
        if (!this._pushService || !this._pushService.isEnabled()) return 'push_disabled';
        const title = config.title ? this._interpolate(config.title, context) : 'Automation';
        const body = config.body ? this._interpolate(config.body, context) : 'An automation rule fired.';
        this._pushService.sendPush(this.db, userId, { title, body }).catch(() => {});
        return 'ok';
      }
      case 'send_toast': {
        const message = config.message ? this._interpolate(config.message, context) : 'Automation fired';
        const toastType = config.type || 'info';
        if (!this._toastQueue[userId]) this._toastQueue[userId] = [];
        this._toastQueue[userId].push({ message, type: toastType });
        // Limit queue
        if (this._toastQueue[userId].length > 10) this._toastQueue[userId].shift();
        return 'ok';
      }

      // ─── Organization actions ───
      case 'move_to_inbox': {
        if (!task) return 'no_task';
        db.prepare('INSERT INTO inbox (title, note, priority, user_id) VALUES (?,?,?,?)')
          .run(task.title, task.note || '', task.priority || 0, userId);
        return 'ok';
      }
      case 'archive_goal': {
        const goalId = config.goal_id || context.goal?.id;
        if (!goalId) return 'no_goal';
        db.prepare('UPDATE goals SET status=\'archived\' WHERE id=? AND user_id=?').run(goalId, userId);
        return 'ok';
      }
      case 'create_review_prompt': {
        const note = config.note_template
          ? this._interpolate(config.note_template, context)
          : (context.task ? `Completed: ${context.task.title}` : 'Automation note');
        const today = new Date().toISOString().slice(0, 10);
        const existing = db.prepare('SELECT id, note FROM daily_reviews WHERE user_id=? AND date=?')
          .get(userId, today);
        if (existing) {
          const updated = existing.note ? existing.note + '\n' + note : note;
          db.prepare('UPDATE daily_reviews SET note=? WHERE id=?').run(updated, existing.id);
        } else {
          db.prepare('INSERT INTO daily_reviews (user_id, date, note) VALUES (?,?,?)').run(userId, today, note);
        }
        return 'ok';
      }

      default:
        return 'unknown_action';
    }
  }

  // ─── Template Variable Interpolation ───

  _interpolate(template, context) {
    if (!template || typeof template !== 'string') return template || '';
    return template.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (match, varName) => {
      const parts = varName.split('.');
      let val;
      if (parts.length === 2) {
        const scope = parts[0], prop = parts[1];
        if (scope === 'task' && context.task) val = context.task[prop];
        else if (scope === 'habit' && context.habit) val = context.habit[prop];
        else if (scope === 'goal' && context.goal) val = context.goal[prop];
        else if (scope === 'focus' && context.focus) val = context.focus[prop];
      } else {
        // Top-level vars
        if (varName === 'streak') val = context.streak;
        else if (varName === 'date') val = new Date().toISOString().slice(0, 10);
        else if (varName === 'percentage') val = context.percentage;
      }
      if (val === undefined || val === null) return match;
      // HTML escape for safety
      return String(val).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    });
  }

  // ─── Execution Logging ───

  _logExecution(rule, event, context, error, results) {
    try {
      const triggerContext = {};
      if (context.task) triggerContext.task_id = context.task.id;
      if (context.task) triggerContext.task_title = context.task.title;
      if (context.habit) triggerContext.habit_id = context.habit.id;
      if (context.habit) triggerContext.habit_name = context.habit.name;
      if (context.focus) triggerContext.session_id = context.focus.id;
      if (context.goal) triggerContext.goal_id = context.goal.id;
      if (context.days_overdue) triggerContext.days_overdue = context.days_overdue;
      if (context.streak) triggerContext.streak = context.streak;
      if (context.percentage !== undefined) triggerContext.percentage = context.percentage;

      this.db.prepare(
        `INSERT INTO automation_log (rule_id, user_id, trigger_type, action_type, trigger_context, actions_executed, status, error)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        rule.id,
        context.userId,
        event,
        rule.action_type || '',
        JSON.stringify(triggerContext),
        results ? JSON.stringify(results) : '[]',
        error ? 'error' : 'success',
        error || null
      );
    } catch (logErr) {
      this.logger.error({ err: logErr }, 'Failed to log automation execution');
    }
  }

  // ─── Helpers ───

  _parseJson(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  _cleanupRateCounts() {
    const now = Math.floor(Date.now() / 60000);
    for (const key of Object.keys(this._rateCounts)) {
      const ts = parseInt(key.split(':')[1]);
      if (now - ts > 2) delete this._rateCounts[key];
    }
  }

  // ─── Schedule matching (used by scheduler) ───

  shouldFireSchedule(rule, now) {
    const tc = this._parseJson(rule.trigger_config, {});
    const lastFire = rule.last_schedule_fire;
    const today = now.toISOString().slice(0, 10);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (rule.trigger_type === 'schedule_daily') {
      if (lastFire === today) return false; // Already fired today
      const [h, m] = (tc.time || '08:00').split(':').map(Number);
      if (currentHour < h || (currentHour === h && currentMinute < m)) return false;
      // Check days of week (0=Sun, 1=Mon, ...)
      if (tc.days && Array.isArray(tc.days) && !tc.days.includes(now.getDay())) return false;
      return true;
    }
    if (rule.trigger_type === 'schedule_weekly') {
      if (lastFire === today) return false;
      const targetDay = tc.day !== undefined ? tc.day : 1; // Default Monday
      if (now.getDay() !== targetDay) return false;
      const [h, m] = (tc.time || '09:00').split(':').map(Number);
      if (currentHour < h || (currentHour === h && currentMinute < m)) return false;
      return true;
    }
    if (rule.trigger_type === 'schedule_monthly') {
      if (lastFire === today) return false;
      const targetDom = tc.day_of_month || 1;
      if (now.getDate() !== targetDom) return false;
      const [h, m] = (tc.time || '09:00').split(':').map(Number);
      if (currentHour < h || (currentHour === h && currentMinute < m)) return false;
      return true;
    }
    return false;
  }

  markScheduleFired(ruleId) {
    const today = new Date().toISOString().slice(0, 10);
    this.db.prepare('UPDATE automation_rules SET last_schedule_fire=? WHERE id=?').run(today, ruleId);
  }
}

module.exports = { AutomationEngine, VALID_TRIGGER_TYPES, VALID_ACTION_TYPES, TRIGGER_LABELS, ACTION_LABELS };
