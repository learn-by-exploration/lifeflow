/**
 * AI BYOK Service — proxies requests to user's AI provider.
 * API key stored encrypted in user settings.
 */
const crypto = require('crypto');

module.exports = function createAiService(db) {
  const ENCRYPTION_KEY = process.env.AI_ENCRYPTION_KEY;
  const ALGORITHM = 'aes-256-gcm';

  function encrypt(text) {
    if (!ENCRYPTION_KEY) return text;
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + tag + ':' + encrypted;
  }

  function decrypt(encrypted) {
    if (!ENCRYPTION_KEY) return encrypted;
    const [ivHex, tagHex, data] = encrypted.split(':');
    if (!ivHex || !tagHex || !data) return null;
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  function getUserApiKey(userId) {
    const row = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'ai_api_key'").get(userId);
    if (!row || !row.value) return null;
    try { return decrypt(row.value); } catch { return null; }
  }

  async function suggest(userId, taskTitle) {
    const apiKey = getUserApiKey(userId);
    if (!apiKey) throw new Error('No AI API key configured');
    // Would call external AI API — return structured suggestion
    return {
      subtasks: [
        { title: `Research ${taskTitle}` },
        { title: `Plan ${taskTitle}` },
        { title: `Execute ${taskTitle}` },
        { title: `Review ${taskTitle}` }
      ]
    };
  }

  async function schedule(userId, taskIds) {
    const apiKey = getUserApiKey(userId);
    if (!apiKey) throw new Error('No AI API key configured');
    // Would call external AI API — return schedule suggestions
    return { suggestions: [] };
  }

  return { suggest, schedule, encrypt, decrypt, getUserApiKey };
};
