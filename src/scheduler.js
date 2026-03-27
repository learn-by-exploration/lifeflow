/**
 * Lightweight background job scheduler.
 * Registers jobs with intervals and runs them on a timer.
 * Built-in jobs: session cleanup, recurring task spawning.
 */
const RecurringService = require('./services/recurring.service');
const createHelpers = require('./helpers');

module.exports = function createScheduler(db, logger) {
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
  }

  return { register, registerBuiltinJobs, start, stop };
};
