const { z } = require('zod');

// Shared validators used across schemas
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().nonnegative();
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{3,6}$/, 'Invalid hex color');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (HH:MM)');

const idParam = z.object({
  id: positiveInt,
});

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).partial();

module.exports = { positiveInt, nonNegativeInt, hexColor, isoDate, hhmm, idParam, paginationQuery };
