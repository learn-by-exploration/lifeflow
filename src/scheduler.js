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
  }

  return { register, registerBuiltinJobs, start, stop };
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
