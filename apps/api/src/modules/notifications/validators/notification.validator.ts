import { z } from 'zod';
import { NotificationChannel } from '@vargly/types';

export const sendNotificationSchema = z.object({
  channel: z.nativeEnum(NotificationChannel),
  recipient: z.string().min(1, 'Recipient is required'),
  recipientType: z.enum(['PARENT', 'STUDENT', 'TEACHER']),
  content: z.string().min(1, 'Content is required'),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
  subject: z.string().optional(),
  idempotencyKey: z.string().min(1, 'idempotencyKey is required'),
});

export const failedNotificationQuerySchema = z.object({
  channel: z.nativeEnum(NotificationChannel).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

export const retryNotificationSchema = z.object({
  notificationId: z.string().uuid(),
});

export type SendNotificationSchemaType = z.infer<typeof sendNotificationSchema>;
export type FailedNotificationQuerySchemaType = z.infer<typeof failedNotificationQuerySchema>;
