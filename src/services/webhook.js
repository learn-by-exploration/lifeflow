/**
 * Webhook service — fires outbound webhooks on events.
 * Fire-and-forget with 5s timeout, HMAC-SHA256 signature.
 */
const crypto = require('crypto');
const logger = require('../logger');

module.exports = function createWebhookService(db) {
  /**
   * Fire webhooks for a given event.
   * @param {number} userId
   * @param {string} event - e.g. 'task.created', 'task.completed'
   * @param {object} payload
   */
  async function fireWebhook(userId, event, payload) {
    const hooks = db.prepare(
      "SELECT * FROM webhooks WHERE user_id = ? AND active = 1"
    ).all(userId);

    for (const hook of hooks) {
      let events;
      try { events = JSON.parse(hook.events || '[]'); } catch {
        logger.warn({ webhookId: hook.id }, 'Webhook has malformed events JSON, skipping');
        continue;
      }
      if (!events.includes(event) && !events.includes('*')) continue;

      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
      const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');

      // Fire-and-forget with 5s timeout
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event
          },
          body,
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (err) {
        logger.warn({ err: err.message, webhookId: hook.id, event, url: hook.url }, 'Webhook delivery failed');
      }
    }
  }

  return { fireWebhook };
};
