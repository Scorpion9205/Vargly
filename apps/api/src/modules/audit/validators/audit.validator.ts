import { z } from 'zod';

export const recordAuditLogSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().min(1).max(100),
  entityName: z.string().min(1).max(100),
  entityId: z.string().uuid(),
  beforeState: z.record(z.string(), z.unknown()).optional(),
  afterState: z.record(z.string(), z.unknown()).optional(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().optional(),
});

export const auditLogFilterSchema = z.object({
  entityName: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export type RecordAuditLogSchemaType = z.infer<typeof recordAuditLogSchema>;
export type AuditLogFilterSchemaType = z.infer<typeof auditLogFilterSchema>;
