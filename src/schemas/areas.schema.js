const { z } = require('zod');
const { positiveInt, nonNegativeInt, hexColor } = require('./common.schema');

const createArea = z.object({
  name: z.string().trim().min(1, 'Name required').max(100, 'Name too long (max 100 characters)'),
  icon: z.string().optional().default('📋'),
  color: hexColor.optional().default('#2563EB'),
});

const updateArea = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name too long (max 100 characters)').optional(),
  icon: z.string().optional(),
  color: hexColor.optional(),
  position: nonNegativeInt.optional(),
  default_view: z.string().optional(),
});

const createGoal = z.object({
  title: z.string().trim().min(1, 'Title required').max(200, 'Title too long (max 200 characters)'),
  description: z.string().max(2000, 'Description too long (max 2000 characters)').nullable().optional().default(''),
  color: hexColor.optional().default('#6C63FF'),
  due_date: z.string().nullable().optional().default(null),
});

const updateGoal = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  color: hexColor.optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  due_date: z.string().nullable().optional(),
});

const createMilestone = z.object({
  title: z.string().trim().min(1, 'Title required').max(200),
});

const updateMilestone = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
});

module.exports = { createArea, updateArea, createGoal, updateGoal, createMilestone, updateMilestone };
