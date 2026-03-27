const { z } = require('zod');
const { hexColor } = require('./common.schema');

const createTag = z.object({
  name: z.string().trim().min(1, 'Name required').max(50),
  color: hexColor.optional().default('#64748B'),
});

const updateTag = z.object({
  name: z.string().min(1).max(50).optional(),
  color: hexColor.optional(),
});

const setTaskTags = z.object({
  tagIds: z.array(z.any()),
});

module.exports = { createTag, updateTag, setTaskTags };
