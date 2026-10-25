import { z } from 'zod';

export const recordTimelineEntrySchema = z.object({
  studentId: z.string().uuid(),
  eventType: z.string().min(1).max(100),
  summary: z.string().min(1),
  referenceId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.coerce.date().optional(),
});

export const timelineFilterSchema = z.object({
  eventType: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export type RecordTimelineEntrySchemaType = z.infer<typeof recordTimelineEntrySchema>;
export type TimelineFilterSchemaType = z.infer<typeof timelineFilterSchema>;
