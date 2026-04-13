const { z } = require('zod');

const templateTask = z.object({
  title: z.string().trim().min(1, 'task title required'),
  priority: z.number().int().optional().default(0),
  subtasks: z.array(z.string()).optional().default([]),
});

const createTemplate = z.object({
  name: z.string().trim().min(1, 'Name required'),
  description: z.string().optional().default(''),
  icon: z.string().optional().default('📋'),
  tasks: z.array(templateTask).min(1, 'Tasks array required'),
});

const updateTemplate = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  tasks: z.array(templateTask).optional(),
}).partial();

module.exports = { createTemplate, updateTemplate };
