/**
 * Reusable input validation helpers for LifeFlow routes.
 */
const { ZodError } = require('zod');

const COLOR_HEX_RE = /^#[0-9A-Fa-f]{3,6}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate a hex color string. Returns true if valid or falsy.
 */
function isValidColor(value) {
  if (!value) return true; // null/undefined/empty is OK (optional)
  return COLOR_HEX_RE.test(String(value));
}

/**
 * Validate HH:MM time format. Returns true if valid or falsy.
 */
function isValidHHMM(value) {
  if (!value) return true;
  return HHMM_RE.test(String(value));
}

/**
 * Validate time ordering: start < end.
 */
function isValidTimeRange(start, end) {
  if (!start || !end) return true;
  return start < end;
}

/**
 * Validate a positive integer (>= 0).
 */
function isNonNegativeInt(value) {
  if (value === undefined || value === null) return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

/**
 * Validate string max length.
 */
function isWithinLength(value, max) {
  if (!value) return true;
  return String(value).length <= max;
}

/**
 * Zod-based validation middleware factory.
 * Usage: router.post('/api/foo', validate(fooSchema), handler)
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body'|'query'|'params'} source - Request property to validate (default: 'body')
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const msg = issues.map(e => {
        const field = e.path.join('.');
        return field ? `${field}: ${e.message}` : e.message;
      }).join(', ');
      return res.status(400).json({ error: msg });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { isValidColor, isValidHHMM, isValidTimeRange, isNonNegativeInt, isWithinLength, validate, COLOR_HEX_RE, HHMM_RE };
