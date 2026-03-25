/**
 * Reusable input validation helpers for LifeFlow routes.
 */

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

module.exports = { isValidColor, isValidHHMM, isValidTimeRange, isNonNegativeInt, isWithinLength, COLOR_HEX_RE, HHMM_RE };
