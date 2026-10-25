import { z } from 'zod';

/** One import at a time stays small enough to run in a single transaction */
export const MAX_IMPORT_ROWS = 1000;

const PHONE = /^\+?[1-9]\d{9,14}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Spreadsheet cells arrive as text, numbers or blanks; blanks mean "not given" */
const cell = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
};

/** "98765 43210" / "98765-43210" -> "9876543210", as the web app stores numbers */
const phoneCell = (value: unknown) => cell(value)?.replace(/[\s\-()]/g, '');

const optionalText = (max: number) => z.preprocess(cell, z.string().max(max).optional());
const optionalPhone = (message: string) =>
  z.preprocess(phoneCell, z.string().regex(PHONE, message).optional());
const optionalDay = z.preprocess(
  cell,
  z.string().regex(DAY, 'Use a date like 2010-05-31').optional(),
);

export const studentImportRowSchema = z
  .object({
    firstName: z.preprocess(cell, z.string().min(1, 'Required').max(100)),
    lastName: z.preprocess(cell, z.string().min(1, 'Required').max(100)),
    phone: optionalPhone('Enter a valid mobile number'),
    email: z.preprocess(cell, z.string().email('Enter a valid email').max(255).optional()),
    rollNumber: optionalText(50),
    gender: z.preprocess(
      (value) => cell(value)?.toUpperCase(),
      z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    ),
    dob: optionalDay,
    joiningDate: optionalDay,
    parentName: optionalText(200),
    parentPhone: optionalPhone('Enter a valid parent mobile number'),
    parentRelation: z.preprocess(
      (value) => cell(value)?.toUpperCase(),
      z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('FATHER'),
    ),
    batchName: optionalText(100),
  })
  .superRefine((row, ctx) => {
    // A parent needs both a name and a number to be reachable
    if (row.parentName && !row.parentPhone) {
      ctx.addIssue({ code: 'custom', path: ['parentPhone'], message: 'Parent phone is required' });
    }
    if (row.parentPhone && (!row.parentName || row.parentName.length < 2)) {
      ctx.addIssue({ code: 'custom', path: ['parentName'], message: 'Parent name is required' });
    }
  });

export const batchImportRowSchema = z.object({
  name: z.preprocess(cell, z.string().min(2, 'Required').max(100)),
  subject: optionalText(100),
  academicYear: z.preprocess(cell, z.string().min(4, 'Required').max(50)),
  startTime: optionalText(20),
  endTime: optionalText(20),
  // "MON,WED,FRI"
  daysOfWeek: optionalText(100),
});

/**
 * Students and batches can be imported. Teachers are added one by one in the app: each gets a
 * sign-in account and a password to hand over, which a spreadsheet cannot do safely.
 */
export const bulkImportSchema = z
  .object({
    entityType: z.enum(['STUDENTS', 'BATCHES']),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .min(1)
      .max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} rows at a time`),
    dryRun: z.boolean().default(false),
  })
  .strict();

export type StudentImportRow = z.infer<typeof studentImportRowSchema>;
export type BatchImportRow = z.infer<typeof batchImportRowSchema>;
