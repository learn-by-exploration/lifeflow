const { z } = require('zod');

// Valid simple recurring strings
const simpleRecurring = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'weekdays']);

// every-N-days or every-N-weeks pattern
const everyNRecurring = z.string().regex(/^every-\d+-(days|weeks)$/, 'Invalid every-N pattern');

// Advanced JSON recurring config
const advancedRecurring = z.object({
  pattern: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'weekdays', 'specific-days']),
  interval: z.number().int().min(1).max(365).optional(),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  endAfter: z.number().int().min(1).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  count: z.number().int().min(0).optional(),
}).strict();

// The recurring field can be a simple string, every-N pattern, JSON object, or null
const recurringSchema = z.union([
  simpleRecurring,
  everyNRecurring,
  advancedRecurring,
  z.null(),
]).optional();

/**
 * Validate and normalize the recurring field value.
 * Accepts string (simple/every-N/JSON) or object (advanced config) or null.
 * Returns the validated value as stored in DB (string or null).
 */
function validateRecurring(value) {
  if (value === undefined || value === null || value === '') return { valid: true, value: null };

  // If it's an object, validate directly as advanced config
  if (typeof value === 'object') {
    const result = advancedRecurring.safeParse(value);
    if (!result.success) return { valid: false, error: result.error.issues[0].message };
    return { valid: true, value: JSON.stringify(result.data) };
  }

  if (typeof value !== 'string') return { valid: false, error: 'recurring must be a string or object' };

  // Try simple enum first
  if (simpleRecurring.safeParse(value).success) return { valid: true, value };

  // Try every-N pattern
  if (everyNRecurring.safeParse(value).success) return { valid: true, value };

  // Try parsing as JSON
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      const result = advancedRecurring.safeParse(parsed);
      if (!result.success) return { valid: false, error: result.error.issues[0].message };
      return { valid: true, value: JSON.stringify(result.data) };
    }
  } catch {}

  return { valid: false, error: 'Invalid recurring value' };
}

module.exports = { recurringSchema, validateRecurring };
