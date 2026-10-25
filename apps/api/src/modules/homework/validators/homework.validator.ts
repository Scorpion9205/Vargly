import { z } from 'zod';

/** Opened by students and parents from their panel and WhatsApp: a web address, never a script */
const webUrl = z
  .string()
  .url('Invalid attachment URL')
  .refine((value) => /^https?:\/\//i.test(value), 'Use a web address starting with http or https');

export const createHomeworkSchema = z.object({
  batchId: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().min(1, 'Description is required'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  attachmentUrl: webUrl.optional().or(z.literal('')),
});

export const updateHomeworkSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  attachmentUrl: webUrl.optional().or(z.literal('')),
});

export type CreateHomeworkSchemaType = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkSchemaType = z.infer<typeof updateHomeworkSchema>;
