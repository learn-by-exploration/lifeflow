'use strict';

const webpush = require('web-push');
const logger = require('../logger');

let _enabled = false;

/**
 * Initialize web-push with VAPID keys from environment.
 * Returns true if initialized, false if keys are missing.
 */
function initialize() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    logger.info('Web Push disabled: VAPID keys not configured');
    _enabled = false;
    return false;
  }

  webpush.setVapidDetails(email.startsWith('mailto:') ? email : `mailto:${email}`, publicKey, privateKey);
  _enabled = true;
  logger.info('Web Push initialized with VAPID keys');
  return true;
}

/**
 * Whether the push service is enabled (VAPID keys configured).
 */
function isEnabled() {
  return _enabled;
}

/**
 * Get the VAPID public key (for client subscription).
 */
function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Send a push notification to all subscriptions for a user.
 * @param {object} db - Database instance
 * @param {number} userId - User ID
 * @param {object} payload - { title, body, url, tag }
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendPush(db, userId, payload) {
  if (!_enabled) {
    return { sent: 0, failed: 0 };
  }

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (subs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const jsonPayload = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };

    try {
      await webpush.sendNotification(pushSub, jsonPayload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or invalid — remove it
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        logger.info({ subId: sub.id, userId }, 'Removed expired push subscription');
      } else {
        logger.warn({ err, subId: sub.id, userId }, 'Push notification failed');
      }
    }
  }

  return { sent, failed };
}

module.exports = { initialize, isEnabled, getPublicKey, sendPush };
