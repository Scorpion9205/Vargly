import { z } from 'zod';

export const ENQUIRY_SOURCES = ['WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'OTHER'] as const;
export const ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'ADMITTED', 'NOT_INTERESTED'] as const;
export type EnquirySourceType = (typeof ENQUIRY_SOURCES)[number];
export type EnquiryStatusType = (typeof ENQUIRY_STATUSES)[number];

/** Drops the spaces, dashes and brackets people type: "98765 43210" -> "9876543210" */
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Enter a valid phone number'));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const createEnquirySchema = z.object({
  name: z.string().trim().min(2).max(255),
  phone,
  studentName: optionalText(255).optional(),
  interestedIn: optionalText(255).optional(),
  source: z.enum(ENQUIRY_SOURCES).default('WALK_IN'),
  notes: optionalText(2000).optional(),
  followUpOn: day.nullable().optional(),
});
export type CreateEnquiryDto = z.infer<typeof createEnquirySchema>;

export const updateEnquirySchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    phone,
    studentName: optionalText(255).nullable(),
    interestedIn: optionalText(255).nullable(),
    source: z.enum(ENQUIRY_SOURCES),
    status: z.enum(ENQUIRY_STATUSES),
    notes: optionalText(2000).nullable(),
    followUpOn: day.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateEnquiryDto = z.infer<typeof updateEnquirySchema>;

export const listEnquirySchema = z.object({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  /** Only enquiries still open (new or contacted) whose follow-up day has come */
  due: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListEnquiryQuery = z.infer<typeof listEnquirySchema>;

export interface EnquiryRecord {
  readonly id: string;
  readonly coachingId: string;
  readonly name: string;
  readonly phone: string;
  readonly studentName: string | null;
  readonly interestedIn: string | null;
  readonly source: EnquirySourceType;
  readonly status: EnquiryStatusType;
  readonly notes: string | null;
  /** YYYY-MM-DD */
  readonly followUpOn: string | null;
  readonly lastContactedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EnquirySummary {
  readonly total: number;
  readonly byStatus: Record<EnquiryStatusType, number>;
  /** Open enquiries whose follow-up day is today or earlier */
  readonly dueToday: number;
}
