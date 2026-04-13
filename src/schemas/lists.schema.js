const { z } = require('zod');
const { positiveInt, nonNegativeInt, hexColor } = require('./common.schema');

const VALID_LIST_TYPES = ['checklist', 'grocery', 'notes', 'tracker'];
const VALID_VIEW_MODES = ['list', 'board'];

const createList = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name must be 100 chars or less'),
  type: z.enum(VALID_LIST_TYPES).optional().default('checklist'),
  icon: z.string().optional().default('📋'),
  color: hexColor.optional().nullable(),
  area_id: positiveInt.optional().nullable(),
  parent_id: positiveInt.optional().nullable(),
  view_mode: z.enum(VALID_VIEW_MODES).optional(),
  board_columns: z.array(z.string()).optional().nullable(),
});

const updateList = z.object({
  name: z.string().trim().min(1, 'name cannot be empty').max(100, 'name must be 100 chars or less').optional(),
  icon: z.string().optional(),
  color: hexColor.optional().nullable(),
  area_id: positiveInt.optional().nullable(),
  parent_id: positiveInt.optional().nullable(),
  view_mode: z.enum(VALID_VIEW_MODES).optional(),
  board_columns: z.array(z.string()).optional().nullable(),
  position: nonNegativeInt.optional(),
}).partial();

const applyTemplate = z.object({
  template_id: z.string().min(1, 'template_id is required'),
});

module.exports = { createList, updateList, applyTemplate };
