/**
 * Lightweight background job scheduler.
 * Registers jobs with intervals and runs them on a timer.
 * Built-in jobs: session cleanup, recurring task spawning.
 */
const RecurringService = require('./services/recurring.service');
const pushService = require('./services/push.service');
const createHelpers = require('./helpers');

function createScheduler(db, logger) {
  const jobs = [];
  const helpers = createHelpers(db);
  let automationEngine = null;

  function setAutomationEngine(engine) {
    automationEngine = engine;
  }

  function register(name, intervalMs, fn) {
    jobs.push({ name, intervalMs, fn, timer: null });
  }

  function start() {
    for (const job of jobs) {
      // Run immediately
      job.fn().catch(err => logger.error({ err, job: job.name }, 'Scheduler job failed'));
      // Then on interval
      job.timer = setInterval(() => {
        job.fn().catch(err => logger.error({ err, job: job.name }, 'Scheduler job failed'));
      }, job.intervalMs);
    }
  }

  function stop() {
    for (const job of jobs) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
    }
  }

  function registerBuiltinJobs() {
    // Stale session cleanup (every 6 hours)
    register('session-cleanup', 6 * 60 * 60 * 1000, async () => {
      const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
      if (result.changes > 0) {
        logger.info({ deleted: result.changes }, 'Cleaned up expired sessions');
      }
    });

    // Recurring task spawn (every 60 minutes)
    register('recurring-spawn', 60 * 60 * 1000, async () => {
      const today = new Date().toISOString().slice(0, 10);
      const doneTasks = db.prepare(`
        SELECT t.*, t.user_id FROM tasks t
        WHERE t.recurring IS NOT NULL
          AND t.status = 'done'
          AND t.due_date <= ?
          AND NOT EXISTS (
            SELECT 1 FROM tasks t2
            WHERE t2.goal_id = t.goal_id
              AND t2.title = t.title
              AND t2.recurring IS NOT NULL
              AND t2.status != 'done'
          )
      `).all(today);

      if (doneTasks.length > 0) {
        const recurringSvc = new RecurringService(db, {
          nextDueDate: helpers.nextDueDate,
          getNextPosition: helpers.getNextPosition,
        });
        for (const task of doneTasks) {
          try {
            recurringSvc.spawnNext(task, task.user_id);
          } catch (err) {
            logger.error({ err, taskId: task.id }, 'Failed to spawn recurring task');
          }
        }
        logger.info({ spawned: doneTasks.length }, 'Spawned recurring tasks');
      }
    });

    // Deadline notifications (every 30 minutes)
    register('deadline-notifications', 30 * 60 * 1000, async () => {
      if (!pushService.isEnabled()) return;

      const users = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all();
      let usersNotified = 0;
      let totalTasks = 0;

      for (const { user_id } of users) {
        const tasks = db.prepare(`
          SELECT t.id, t.title, t.due_date,
            CASE WHEN t.due_date < date('now') THEN 'overdue' ELSE 'today' END AS urgency
          FROM tasks t
          WHERE t.status != 'done'
            AND t.due_date IS NOT NULL
            AND t.due_date <= date('now')
            AND t.user_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM push_notification_log pnl
              WHERE pnl.task_id = t.id
                AND pnl.user_id = ?
                AND pnl.type = 'deadline'
                AND pnl.sent_at > datetime('now', '-24 hours')
            )
          ORDER BY urgency DESC, t.due_date ASC, t.priority DESC
          LIMIT 100
        `).all(user_id, user_id);

        if (tasks.length === 0) continue;

        const overdue = tasks.filter(t => t.urgency === 'overdue');
        const dueToday = tasks.filter(t => t.urgency === 'today');
        const payload = buildDeadlinePayload(overdue, dueToday);

        const result = await pushService.sendPush(db, user_id, payload);

        if (result.sent > 0) {
          const insertLog = db.prepare(
            "INSERT INTO push_notification_log (user_id, task_id, type) VALUES (?, ?, 'deadline')"
          );
          const insertMany = db.transaction((items) => {
            for (const task of items) insertLog.run(user_id, task.id);
          });
          insertMany(tasks);

          usersNotified++;
          totalTasks += tasks.length;
        }
      }

      if (usersNotified > 0) {
        logger.info({ usersNotified, totalTasks }, 'Sent deadline notifications');
      }
    });

    // ─── Automation: Check overdue tasks (every 1 hour) ───
    register('automation-overdue', 60 * 60 * 1000, async () => {
      if (!automationEngine) return;
      const today = new Date().toISOString().slice(0, 10);
      const overdueTasks = db.prepare(`
        SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id
        WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < ? LIMIT 200
      `).all(today);
      let emitted = 0;
      for (const task of overdueTasks) {
        const daysOverdue = Math.floor((Date.now() - new Date(task.due_date + 'T00:00:00').getTime()) / 86400000);
        automationEngine.emit('task_overdue', { userId: task.user_id, task, days_overdue: daysOverdue });
        emitted++;
      }
      if (emitted > 0) logger.info({ emitted }, 'Emitted task_overdue events');
    });

    // ─── Automation: Check due today/soon (every 1 hour) ───
    register('automation-due-check', 60 * 60 * 1000, async () => {
      if (!automationEngine) return;
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      // Due today
      const dueToday = db.prepare(`
        SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id
        WHERE t.status != 'done' AND t.due_date = ? LIMIT 100
      `).all(today);
      for (const task of dueToday) {
        automationEngine.emit('task_due_today', { userId: task.user_id, task });
      }
      // Due soon (next 3 days, excluding today)
      const dueSoon = db.prepare(`
        SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id
        WHERE t.status != 'done' AND t.due_date > ? AND t.due_date <= ? LIMIT 100
      `).all(today, threeDays);
      for (const task of dueSoon) {
        const daysUntil = Math.ceil((new Date(task.due_date + 'T00:00:00').getTime() - Date.now()) / 86400000);
        automationEngine.emit('task_due_soon', { userId: task.user_id, task, days_until: daysUntil });
      }
    });

    // ─── Automation: Schedule triggers (every 15 minutes) ───
    register('automation-schedule', 15 * 60 * 1000, async () => {
      if (!automationEngine) return;
      const now = new Date();
      const users = db.prepare("SELECT DISTINCT user_id FROM automation_rules WHERE enabled=1 AND trigger_type LIKE 'schedule_%'").all();
      for (const { user_id } of users) {
        const rules = db.prepare("SELECT * FROM automation_rules WHERE user_id=? AND enabled=1 AND trigger_type LIKE 'schedule_%'").all(user_id);
        for (const rule of rules) {
          if (automationEngine.shouldFireSchedule(rule, now)) {
            automationEngine.emit(rule.trigger_type, { userId: user_id, rule_id: rule.id });
            db.prepare('UPDATE automation_rules SET last_schedule_fire=? WHERE id=?').run(now.toISOString(), rule.id);
          }
        }
      }
    });

    // ─── Automation: Stale tasks (every 6 hours) ───
    register('automation-stale', 6 * 60 * 60 * 1000, async () => {
      if (!automationEngine) return;
      const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const staleTasks = db.prepare(`
        SELECT t.*, g.area_id FROM tasks t JOIN goals g ON t.goal_id=g.id
        WHERE t.status != 'done' AND date(t.created_at) < ? AND t.status = 'todo'
        AND NOT EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id=t.id AND s.done=1)
        LIMIT 100
      `).all(cutoff);
      for (const task of staleTasks) {
        const daysSinceCreated = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000);
        automationEngine.emit('task_stale', { userId: task.user_id, task, days_stale: daysSinceCreated });
      }
    });

    // ─── Automation: Habit missed (daily check at first run after midnight) ───
    register('automation-habit-missed', 24 * 60 * 60 * 1000, async () => {
      if (!automationEngine) return;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const habits = db.prepare("SELECT h.* FROM habits h WHERE h.archived=0").all();
      for (const habit of habits) {
        const logged = db.prepare('SELECT 1 FROM habit_logs WHERE habit_id=? AND date=?').get(habit.id, yesterday);
        if (!logged) {
          automationEngine.emit('habit_missed', { userId: habit.user_id, habit, date: yesterday });
        }
      }
    });

    // ─── Automation: Log cleanup (daily, prune logs older than 30 days) ───
    register('automation-log-cleanup', 24 * 60 * 60 * 1000, async () => {
      const result = db.prepare("DELETE FROM automation_log WHERE created_at < datetime('now', '-30 days')").run();
      if (result.changes > 0) logger.info({ deleted: result.changes }, 'Pruned old automation logs');
    });
  }

  return { register, registerBuiltinJobs, start, stop, setAutomationEngine };
}

module.exports = createScheduler;
module.exports.buildDeadlinePayload = buildDeadlinePayload;
module.exports.formatTaskList = formatTaskList;

function formatTaskList(tasks) {
  const titles = tasks.map(t => t.title.length > 50 ? t.title.slice(0, 47) + '...' : t.title);
  if (titles.length <= 2) return titles.join(', ');
  return `${titles[0]}, ${titles[1]} and ${tasks.length - 2} more`;
}

function buildDeadlinePayload(overdue, dueToday) {
  const total = overdue.length + dueToday.length;

  if (overdue.length === 0 && dueToday.length === 1) {
    return {
      title: '📅 Task due today',
      body: dueToday[0].title.slice(0, 120),
      url: '/',
      tag: 'deadline-batch'
    };
  }

  if (overdue.length === 1 && dueToday.length === 0) {
    return {
      title: '⚠️ 1 overdue task',
      body: overdue[0].title.slice(0, 120),
      url: '/',
      tag: 'deadline-batch'
    };
  }

  if (dueToday.length === 0) {
    return {
      title: `⚠️ ${overdue.length} overdue tasks`,
      body: formatTaskList(overdue),
      url: '/',
      tag: 'deadline-batch'
    };
  }

  if (overdue.length === 0) {
    return {
      title: `📅 ${dueToday.length} tasks due today`,
      body: formatTaskList(dueToday),
      url: '/',
      tag: 'deadline-batch'
    };
  }

  return {
    title: `⏰ ${total} tasks need attention`,
    body: `${overdue.length} overdue · ${dueToday.length} due today`,
    url: '/',
    tag: 'deadline-batch'
  };
}
