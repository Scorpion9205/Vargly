import { z } from 'zod';

export const QUESTION_TYPES = ['MCQ', 'SHORT', 'LONG', 'FILL_BLANK', 'TRUE_FALSE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PAPER_LANGUAGES = ['en', 'hi', 'hinglish'] as const;
export type PaperLanguage = (typeof PAPER_LANGUAGES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Most questions one paper may hold, and most one generation may ask for */
export const MAX_QUESTIONS_PER_PAPER = 60;
export const MAX_QUESTIONS_PER_GENERATION = 40;

export const questionSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(3).max(1500),
    /** Multiple choice only: exactly four, without "A)" prefixes */
    options: z.array(z.string().trim().min(1).max(300)).length(4).optional(),
    /** MCQ: A, B, C or D. True/false: True or False. Others: the model answer. */
    answer: z.string().trim().min(1).max(2000),
    marks: z.number().positive().max(100),
    explanation: z.string().trim().max(1500).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'MCQ') {
      if (!q.options) ctx.addIssue({ code: 'custom', path: ['options'], message: 'A multiple-choice question needs four options' });
      if (!/^[A-D]$/.test(q.answer)) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'The answer must be A, B, C or D' });
    } else if (q.options) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only multiple-choice questions have options' });
    }
    if (q.type === 'TRUE_FALSE' && !/^(True|False)$/.test(q.answer)) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'The answer must be True or False' });
    }
  });
export type Question = z.infer<typeof questionSchema>;

const sectionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  count: z.number().int().min(1).max(20),
  marks: z.number().positive().max(100),
});
export type SectionSpec = z.infer<typeof sectionSchema>;

export const generatePaperSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    subject: z.string().trim().min(1).max(100),
    /** Chapter and topic, in the teacher's own words */
    topic: z.string().trim().min(1).max(500),
    classLevel: z.string().trim().max(50).optional(),
    language: z.enum(PAPER_LANGUAGES).default('en'),
    difficulty: z.enum(DIFFICULTIES).default('mixed'),
    instructions: z.string().trim().max(500).optional(),
    sections: z.array(sectionSchema).min(1).max(QUESTION_TYPES.length),
  })
  .superRefine((spec, ctx) => {
    const types = spec.sections.map((s) => s.type);
    if (new Set(types).size !== types.length) {
      ctx.addIssue({ code: 'custom', path: ['sections'], message: 'Each question type may appear once' });
    }
    const total = spec.sections.reduce((sum, s) => sum + s.count, 0);
    if (total > MAX_QUESTIONS_PER_GENERATION) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: `Ask for at most ${MAX_QUESTIONS_PER_GENERATION} questions at a time`,
      });
    }
  });
export type GeneratePaperDto = z.infer<typeof generatePaperSchema>;

export const addQuestionsSchema = z.object({
  section: sectionSchema,
  instructions: z.string().trim().max(500).optional(),
});
export type AddQuestionsDto = z.infer<typeof addQuestionsSchema>;

export const regenerateQuestionSchema = z.object({
  instructions: z.string().trim().max(500).optional(),
});
export type RegenerateQuestionDto = z.infer<typeof regenerateQuestionSchema>;

export const updatePaperSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  questions: z.array(questionSchema).max(MAX_QUESTIONS_PER_PAPER).optional(),
});
export type UpdatePaperDto = z.infer<typeof updatePaperSchema>;

export const publishPaperSchema = z
  .object({
    batchId: z.string().uuid(),
    kind: z.enum(['HOMEWORK', 'PRACTICE']),
    /** Shown to parents; defaults to the paper's title */
    title: z.string().trim().min(1).max(255).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').optional(),
  })
  .superRefine((dto, ctx) => {
    if (dto.kind === 'HOMEWORK' && !dto.dueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Homework needs a due date' });
    }
  });
export type PublishPaperDto = z.infer<typeof publishPaperSchema>;

export const uploadPaperSchema = z.object({
  title: z.string().trim().min(1).max(255),
  subject: z.string().trim().min(1).max(100),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.literal('application/pdf'),
  contentBase64: z.string().min(1),
});
export type UploadPaperDto = z.infer<typeof uploadPaperSchema>;

/** Who is asking: teachers work with their own papers, owners with the whole institute's */
export interface PaperActor {
  readonly userId?: string;
  readonly canSeeAll: boolean;
}
