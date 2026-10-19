import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { logger } from '../../common/logger/logger.service.js';
import type { GenerateAiCompletionDto, AiCompletionResponseDto } from '../ai/dto/ai.dto.js';
import {
  GeneratePaperDto,
  Question,
  QuestionType,
  SectionSpec,
  questionSchema,
} from './paper.types.js';

/** The part of AiService the generator needs (it takes care of credits, usage and the provider) */
export interface CompletionService {
  generateCompletion(
    dto: GenerateAiCompletionDto,
    coachingId: string,
    userId?: string,
    correlationId?: string,
    creditsCost?: number,
  ): Promise<AiCompletionResponseDto>;
  refundCredits(coachingId: string, credits: number): Promise<void>;
}

export interface GenerationContext {
  readonly coachingId: string;
  readonly userId?: string;
  readonly correlationId?: string;
}

export interface PaperBrief {
  readonly subject: string;
  readonly topic: string;
  readonly classLevel?: string;
  readonly language: GeneratePaperDto['language'];
  readonly difficulty: GeneratePaperDto['difficulty'];
  readonly instructions?: string;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  MCQ: 'MCQ',
  SHORT: 'SHORT',
  LONG: 'LONG',
  FILL_BLANK: 'FILL_BLANK',
  TRUE_FALSE: 'TRUE_FALSE',
};

const LANGUAGE_RULE: Record<GeneratePaperDto['language'], string> = {
  en: 'Write the questions in clear English suitable for Indian school students.',
  hi: 'Write the questions in Hindi, in Devanagari script (हिन्दी).',
  hinglish: 'Write the questions in Hinglish: Hindi written in Roman letters, the way students text.',
};

const SYSTEM_PROMPT =
  'You are an experienced school teacher in India who writes clear, correct exam questions. ' +
  'Reply with ONE JSON object and nothing else, in this shape: ' +
  '{"questions":[{"type":"MCQ|SHORT|LONG|FILL_BLANK|TRUE_FALSE","question":"...","options":["...","...","...","..."],"answer":"...","explanation":"..."}]}. ' +
  'Rules: every question must be factually correct and answerable from the topic; no duplicates; ' +
  'MCQ has exactly 4 options (written without "A)" prefixes) and exactly one correct one; ' +
  'for MCQ the answer is the letter A, B, C or D; for TRUE_FALSE the answer is True or False; ' +
  'for the other types the answer is a short model answer; ' +
  'FILL_BLANK puts ___ where the blank is; options only for MCQ; ' +
  'explanation is one short sentence; plain text only (no markdown, no LaTeX: write x², √, ½ as symbols).';

/** Tokens a question may need, with room for the JSON around it */
const TOKENS_PER_QUESTION = 260;

export function buildUserPrompt(
  brief: PaperBrief,
  sections: readonly SectionSpec[],
  avoid: readonly string[] = [],
): string {
  const lines = [
    brief.classLevel ? `Class: ${brief.classLevel}` : null,
    `Subject: ${brief.subject}`,
    `Chapter / topic: ${brief.topic}`,
    `Difficulty: ${brief.difficulty}`,
    LANGUAGE_RULE[brief.language],
    'Create exactly these questions, in this order:',
    ...sections.map((s) => `- ${s.count} ${TYPE_LABEL[s.type]}`),
    brief.instructions ? `Extra instructions from the teacher: ${brief.instructions}` : null,
    avoid.length
      ? `Do not repeat or closely resemble any of these existing questions:\n${avoid
          .slice(0, 20)
          .map((q) => `* ${q.slice(0, 150)}`)
          .join('\n')}`
      : null,
    // Identical prompts are answered from a cache for free; a teacher asking again wants new questions
    `Variation id: ${randomUUID()}`,
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

const TYPE_ALIASES: Record<string, QuestionType> = {
  MCQ: 'MCQ',
  MULTIPLE_CHOICE: 'MCQ',
  MULTIPLE_CHOICE_QUESTION: 'MCQ',
  SHORT: 'SHORT',
  SHORT_ANSWER: 'SHORT',
  LONG: 'LONG',
  LONG_ANSWER: 'LONG',
  FILL_BLANK: 'FILL_BLANK',
  FILL_BLANKS: 'FILL_BLANK',
  FILL_IN_THE_BLANK: 'FILL_BLANK',
  FILL_IN_THE_BLANKS: 'FILL_BLANK',
  TRUE_FALSE: 'TRUE_FALSE',
  TRUE_OR_FALSE: 'TRUE_FALSE',
};

function normaliseType(value: unknown): QuestionType | null {
  const key = String(value ?? '')
    .toUpperCase()
    .replace(/[\s/-]+/g, '_')
    .replace(/[^A-Z_]/g, '');
  return TYPE_ALIASES[key] ?? null;
}

const OPTION_PREFIX = /^\s*(?:\(?[A-Da-d]\)|[A-Da-d][.)]|\d[.)])\s*/;

function cleanOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((option) => String(option ?? '').replace(OPTION_PREFIX, '').trim());
}

/** Turns what the model wrote as the answer to a multiple-choice question into A, B, C or D */
function mcqAnswerLetter(answer: unknown, options: string[] | undefined): string | null {
  const text = String(answer ?? '').trim();
  const letter = text.match(/^\(?([A-Da-d])(?:[).:\s]|$)/);
  if (letter) return letter[1].toUpperCase();
  if (/^[1-4]$/.test(text)) return 'ABCD'[Number(text) - 1];
  if (options) {
    const at = options.findIndex((option) => option.toLowerCase() === text.toLowerCase());
    if (at >= 0) return 'ABCD'[at];
  }
  return null;
}

const TRUE_WORDS = new Set(['true', 't', 'yes', 'y', 'correct', 'sahi', 'सही', 'सत्य']);
const FALSE_WORDS = new Set(['false', 'f', 'no', 'n', 'incorrect', 'galat', 'गलत', 'असत्य']);

/** True or False from "True", "false.", "सही", "True, because ..." and the like (\b does not work for Hindi) */
function trueFalseAnswer(answer: unknown): string | null {
  const first = String(answer ?? '')
    .toLowerCase()
    .split(/[\s,.:;!।-]+/)
    .find(Boolean);
  if (first && TRUE_WORDS.has(first)) return 'True';
  if (first && FALSE_WORDS.has(first)) return 'False';
  return null;
}

/** The JSON object in a reply that may be wrapped in a code fence or chatter */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('No JSON object in the reply');
  }
}

/**
 * Questions from the model's reply, each checked and tidied; the ones that do not hold up
 * (wrong option count, answer that is not one of the options, duplicates) are dropped rather
 * than shown to a teacher as if they were fine.
 */
export function parseGeneratedQuestions(
  content: string,
  marksByType: Partial<Record<QuestionType, number>>,
): Question[] {
  const root = extractJson(content) as { questions?: unknown };
  const items = Array.isArray(root) ? root : root?.questions;
  if (!Array.isArray(items)) throw new Error('The reply has no questions list');

  const seen = new Set<string>();
  const questions: Question[] = [];
  for (const item of items as Array<Record<string, unknown>>) {
    const type = normaliseType(item?.type);
    if (!type) continue;
    const text = String(item.question ?? item.text ?? '').trim();
    const options = type === 'MCQ' ? cleanOptions(item.options) : undefined;

    let answer: string | null;
    if (type === 'MCQ') answer = mcqAnswerLetter(item.answer, options);
    else if (type === 'TRUE_FALSE') answer = trueFalseAnswer(item.answer);
    else answer = String(item.answer ?? '').trim() || null;
    if (!answer) continue;

    const explanation = String(item.explanation ?? '').trim();
    const parsed = questionSchema.safeParse({
      id: randomUUID(),
      type,
      text,
      ...(options ? { options } : {}),
      answer,
      marks: marksByType[type] ?? 1,
      ...(explanation ? { explanation } : {}),
    });
    if (!parsed.success) continue;

    const key = parsed.data.text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(parsed.data);
  }
  return questions;
}

export class QuestionGenerator {
  public constructor(private readonly ai: CompletionService) {}

  /**
   * Asks the model for the sections requested. A reply that cannot be read is retried once;
   * fewer questions than asked is returned as is (the caller can ask for more).
   */
  public async generate(
    brief: PaperBrief,
    sections: readonly SectionSpec[],
    context: GenerationContext,
    creditsCost: number,
    avoid: readonly string[] = [],
  ): Promise<Question[]> {
    const total = sections.reduce((sum, s) => sum + s.count, 0);
    const marksByType = Object.fromEntries(sections.map((s) => [s.type, s.marks]));

    let lastError: unknown;
    let charged = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const completion = await this.ai.generateCompletion(
        {
          prompt: buildUserPrompt(brief, sections, avoid),
          systemPrompt: SYSTEM_PROMPT,
          feature: 'paper.generate',
          temperature: 0.5,
          maxTokens: Math.min(7000, total * TOKENS_PER_QUESTION + 400),
          jsonMode: true,
        },
        context.coachingId,
        context.userId,
        context.correlationId,
        // A retry after an unreadable reply is on us, not the teacher
        attempt === 1 ? creditsCost : 0,
      );
      charged += attempt === 1 ? creditsCost : 0;
      try {
        const questions = parseGeneratedQuestions(completion.content, marksByType);
        if (questions.length > 0) return questions.slice(0, total);
        lastError = new Error('No usable questions in the reply');
      } catch (err) {
        lastError = err;
      }
      logger.warn('[QuestionGenerator] Unreadable AI reply', {
        attempt,
        error: (lastError as Error).message,
      });
    }

    // Nothing usable came back, so nothing is charged
    await this.ai.refundCredits(context.coachingId, charged);
    throw new AppError(
      'AI_BAD_RESPONSE',
      'The AI did not return usable questions. Please try again.',
      StatusCodes.BAD_GATEWAY,
    );
  }
}
