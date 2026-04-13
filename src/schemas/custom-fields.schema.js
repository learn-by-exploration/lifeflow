const { z } = require('zod');
const { nonNegativeInt } = require('./common.schema');

const VALID_FIELD_TYPES = ['text', 'number', 'date', 'select'];

const createCustomField = z.object({
  name: z.string().trim().min(1, 'name required').max(100, 'name too long (max 100)'),
  field_type: z.enum(VALID_FIELD_TYPES, { errorMap: () => ({ message: 'field_type must be text, number, date, or select' }) }),
  options: z.array(z.string()).optional().nullable(),
  position: nonNegativeInt.optional().default(0),
  required: z.boolean().optional().default(false),
  show_in_card: z.boolean().optional().default(false),
});

const updateCustomField = z.object({
  name: z.string().trim().min(1, 'name must be non-empty').max(100).optional(),
  options: z.array(z.string()).optional().nullable(),
  position: nonNegativeInt.optional(),
  show_in_card: z.boolean().optional(),
}).partial();

module.exports = { createCustomField, updateCustomField };
