import { z } from 'zod';
import { RECEIPT_PREFIX_PATTERN } from '../settings.preferences.js';

export const brandingConfigSchema = z
  .object({
    logoUrl: z.string().url().optional(),
    primaryColor: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}){1,2}$/)
      .optional(),
    headerText: z.string().max(255).optional(),
  })
  .strict();

export const notificationSettingsSchema = z
  .object({
    whatsappEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    defaultSenderName: z.string().max(100).optional(),
  })
  .strict();

export const studentPortalSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    showFees: z.boolean().optional(),
    doubts: z.boolean().optional(),
  })
  .strict();

export const updateSettingsSchema = z
  .object({
    branding: brandingConfigSchema.optional(),
    timezone: z.string().max(50).optional(),
    currency: z.string().max(10).optional(),
    academicYear: z.string().max(50).optional(),
    notifications: notificationSettingsSchema.optional(),
    // Receipt numbers are PREFIX/2026-27/00001; a new prefix starts its own numbering
    receiptPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(RECEIPT_PREFIX_PATTERN, 'Use 2 to 10 letters or digits')
      .optional(),
    attendanceThreshold: z.number().min(0).max(100).optional(),
    studentPortal: studentPortalSettingsSchema.optional(),
  })
  // Unknown keys are refused rather than stored, so the config only holds what is understood
  .strict();
