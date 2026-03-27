const { z } = require('zod');
const { positiveInt, hexColor } = require('./common.schema');

const createFilter = z.object({
  name: z.string().trim().min(1, 'Name required').max(100),
  icon: z.string().optional().default('🔍'),
  color: hexColor.optional().default('#2563EB'),
  filters: z.record(z.string(), z.unknown()),
});

const updateFilter = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().optional(),
  color: hexColor.optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

module.exports = { createFilter, updateFilter };
