import { randomBytes, randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { logger } from '../../common/logger/logger.service.js';
import { envConfig } from '../../config/env.config.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { IStorageService } from '../../common/storage/storage.interface.js';
import { assertContentMatchesType, assertUploadAllowed } from '../../common/storage/upload-policy.js';
import { InsufficientAiCreditsError } from '../ai/ai.service.js';
import type { CreateHomeworkDto } from '../homework/dto/homework.dto.js';
import { createPaperSharedEvent } from './paper.events.js';
import {
  AddQuestionsDto,
  GeneratePaperDto,
  MAX_QUESTIONS_PER_PAPER,
  PaperActor,
  PublishPaperDto,
  Question,
  RegenerateQuestionDto,
  UpdatePaperDto,
  UploadPaperDto,
} from './paper.types.js';
import { IPaperRepository, PaperRecord, PaperShareRecord } from './paper.repository.js';
import { PaperBrief, QuestionGenerator } from './question-generator.js';
import { renderPaperPdf } from './paper-pdf.js';

/** Credits a full paper costs, and one question or a small top-up */
export const GENERATE_PAPER_CREDITS = 5;
export const GENERATE_QUESTION_CREDITS = 1;

/** Sharing the same paper with the same batch again within this time is refused: a double click */
const RESHARE_GUARD_MS = 10 * 60 * 1000;

/** What a parent's link produces */
export type DownloadResult =
  | { readonly kind: 'generated'; readonly pdf: Buffer; readonly fileName: string }
  | { readonly kind: 'file'; readonly url: string; readonly fileName: string };

export interface PaperDto {
  readonly id: string;
  readonly source: 'AI' | 'UPLOAD';
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly title: string;
  readonly subject: string;
  readonly topic: string | null;
  readonly language: string;
  readonly questions: Question[];
  readonly questionCount: number;
  readonly totalMarks: number;
  readonly fileName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ShareDto {
  readonly id: string;
  readonly batchId: string;
  readonly kind: 'HOMEWORK' | 'PRACTICE';
  readonly link: string;
  readonly homeworkId: string | null;
  readonly openCount: number;
  readonly lastOpenedAt: Date | null;
  readonly createdAt: Date;
}

export interface PublishResult extends ShareDto {
  /** How many students' parents the message is queued for (the actual recipients are those with a phone and no STOP) */
  readonly activeStudents: number;
  readonly batchName: string;
}

export interface GenerateResult {
  readonly paper: PaperDto;
  /** Questions asked for but not returned usable; the teacher can ask for more */
  readonly shortBy: number;
}

/** Only what publishing needs from the homework module */
export interface HomeworkCreator {
  createHomework(
    dto: CreateHomeworkDto,
    coachingId: string,
    userId?: string,
    correlationId?: string,
  ): Promise<{ id: string }>;
}

function totalMarksOf(questions: readonly Question[]): number {
  return Math.round(questions.reduce((sum, q) => sum + q.marks, 0) * 100) / 100;
}

export function publicLink(token: string): string {
  return `${envConfig.get('API_BASE_URL').replace(/\/+$/, '')}/api/v1/papers/dl/${token}`;
}

function fileNameFor(title: string): string {
  const safe = title.replace(/[^\p{L}\p{N}\s._-]+/gu, '').trim().replace(/\s+/g, '_').slice(0, 80);
  return `${safe || 'paper'}.pdf`;
}

export class PaperService {
  public constructor(
    private readonly repository: IPaperRepository,
    private readonly generator: QuestionGenerator,
    private readonly homework: HomeworkCreator,
    private readonly eventBus: IEventBus,
    private readonly storage: IStorageService,
  ) {}

  // ---------- reading

  private toDto(paper: PaperRecord): PaperDto {
    return {
      id: paper.id,
      source: paper.source,
      status: paper.status,
      title: paper.title,
      subject: paper.subject,
      topic: paper.topic,
      language: paper.language,
      questions: paper.questions,
      questionCount: paper.questions.length,
      totalMarks: totalMarksOf(paper.questions),
      fileName: paper.fileName,
      createdAt: paper.createdAt,
      updatedAt: paper.updatedAt,
    };
  }

  /** A paper the actor may use: their own, or any when they run the institute. Others get "not found". */
  private async load(id: string, actor: PaperActor): Promise<PaperRecord> {
    const paper = await this.repository.findById(id);
    if (!paper || (!actor.canSeeAll && paper.createdBy !== actor.userId)) {
      throw new AppError('PAPER_NOT_FOUND', 'Paper not found', StatusCodes.NOT_FOUND);
    }
    return paper;
  }

  private async loadDraft(id: string, actor: PaperActor): Promise<PaperRecord> {
    const paper = await this.load(id, actor);
    if (paper.status === 'PUBLISHED') {
      throw new AppError(
        'PAPER_PUBLISHED',
        'This paper has already been shared and cannot be changed. Make a copy to edit it.',
        StatusCodes.CONFLICT,
      );
    }
    return paper;
  }

  public async list(actor: PaperActor): Promise<PaperDto[]> {
    const papers = await this.repository.list({
      limit: 100,
      ...(actor.canSeeAll ? {} : { createdBy: actor.userId }),
    });
    // The list shows summaries; the questions come with the single paper
    return papers.map((paper) => ({ ...this.toDto(paper), questions: [] }));
  }

  public async get(id: string, actor: PaperActor): Promise<PaperDto> {
    return this.toDto(await this.load(id, actor));
  }

  public async shares(id: string, actor: PaperActor): Promise<ShareDto[]> {
    await this.load(id, actor);
    return (await this.repository.listShares(id)).map((share) => this.toShareDto(share));
  }

  private toShareDto(share: PaperShareRecord): ShareDto {
    return {
      id: share.id,
      batchId: share.batchId,
      kind: share.kind,
      link: publicLink(share.token),
      homeworkId: share.homeworkId,
      openCount: share.openCount,
      lastOpenedAt: share.lastOpenedAt,
      createdAt: share.createdAt,
    };
  }

  // ---------- AI generation

  private brief(paper: Pick<PaperRecord, 'subject' | 'topic' | 'language'>, extra: Partial<PaperBrief> = {}): PaperBrief {
    return {
      subject: paper.subject,
      topic: paper.topic ?? '',
      language: paper.language as PaperBrief['language'],
      difficulty: 'mixed',
      ...extra,
    };
  }

  /** The AI service reports a drained wallet with its own error; the API answers 402 for it */
  private async withCredits<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (err instanceof InsufficientAiCreditsError) {
        throw new AppError('INSUFFICIENT_AI_CREDITS', err.message, StatusCodes.PAYMENT_REQUIRED, {
          balance: err.currentBalance,
          required: err.requiredCredits,
        });
      }
      throw err;
    }
  }

  public async generate(
    dto: GeneratePaperDto,
    coachingId: string,
    actor: PaperActor,
    correlationId: string = randomUUID(),
  ): Promise<GenerateResult> {
    const requested = dto.sections.reduce((sum, s) => sum + s.count, 0);
    const questions = await this.withCredits(() =>
      this.generator.generate(
        { ...this.brief({ subject: dto.subject, topic: dto.topic, language: dto.language }), classLevel: dto.classLevel, difficulty: dto.difficulty, instructions: dto.instructions },
        dto.sections,
        { coachingId, userId: actor.userId, correlationId },
        GENERATE_PAPER_CREDITS,
      ),
    );

    const paper = await this.repository.createPaper({
      coachingId,
      source: 'AI',
      title: dto.title ?? `${dto.subject}: ${dto.topic}`.slice(0, 255),
      subject: dto.subject,
      topic: dto.topic,
      language: dto.language,
      questions,
      createdBy: actor.userId,
    });
    return { paper: this.toDto(paper), shortBy: Math.max(0, requested - questions.length) };
  }

  public async addQuestions(
    id: string,
    dto: AddQuestionsDto,
    coachingId: string,
    actor: PaperActor,
    correlationId: string = randomUUID(),
  ): Promise<GenerateResult> {
    const paper = await this.loadDraft(id, actor);
    if (paper.source !== 'AI') {
      throw new AppError('NOT_AN_AI_PAPER', 'Questions can only be added to a generated paper', StatusCodes.BAD_REQUEST);
    }
    if (paper.questions.length + dto.section.count > MAX_QUESTIONS_PER_PAPER) {
      throw new AppError('TOO_MANY_QUESTIONS', `A paper holds at most ${MAX_QUESTIONS_PER_PAPER} questions`, StatusCodes.BAD_REQUEST);
    }
    const added = await this.withCredits(() =>
      this.generator.generate(
        this.brief(paper, { instructions: dto.instructions }),
        [dto.section],
        { coachingId, userId: actor.userId, correlationId },
        GENERATE_QUESTION_CREDITS,
        paper.questions.map((q) => q.text),
      ),
    );
    const updated = await this.repository.updatePaper(id, { questions: [...paper.questions, ...added] });
    return { paper: this.toDto(updated), shortBy: Math.max(0, dto.section.count - added.length) };
  }

  public async regenerateQuestion(
    id: string,
    questionId: string,
    dto: RegenerateQuestionDto,
    coachingId: string,
    actor: PaperActor,
    correlationId: string = randomUUID(),
  ): Promise<PaperDto> {
    const paper = await this.loadDraft(id, actor);
    const index = paper.questions.findIndex((q) => q.id === questionId);
    if (index < 0) {
      throw new AppError('QUESTION_NOT_FOUND', 'Question not found in this paper', StatusCodes.NOT_FOUND);
    }
    const old = paper.questions[index];
    const [replacement] = await this.withCredits(() =>
      this.generator.generate(
        this.brief(paper, { instructions: dto.instructions }),
        [{ type: old.type, count: 1, marks: old.marks }],
        { coachingId, userId: actor.userId, correlationId },
        GENERATE_QUESTION_CREDITS,
        paper.questions.map((q) => q.text),
      ),
    );
    const questions = paper.questions.map((q, i) => (i === index ? replacement : q));
    return this.toDto(await this.repository.updatePaper(id, { questions }));
  }

  // ---------- editing

  public async update(id: string, dto: UpdatePaperDto, actor: PaperActor): Promise<PaperDto> {
    const paper = await this.loadDraft(id, actor);
    if (dto.questions && paper.source !== 'AI') {
      throw new AppError('NOT_AN_AI_PAPER', 'An uploaded paper has no questions to edit', StatusCodes.BAD_REQUEST);
    }
    const updated = await this.repository.updatePaper(id, {
      ...(dto.title ? { title: dto.title } : {}),
      ...(dto.questions ? { questions: dto.questions } : {}),
    });
    return this.toDto(updated);
  }

  public async remove(id: string, actor: PaperActor): Promise<void> {
    await this.load(id, actor);
    await this.repository.softDelete(id);
  }

  /** A fresh draft with the same questions: how a shared paper is edited */
  public async duplicate(id: string, coachingId: string, actor: PaperActor): Promise<PaperDto> {
    const paper = await this.load(id, actor);
    const copy = await this.repository.createPaper({
      coachingId,
      source: paper.source,
      title: `${paper.title} (copy)`.slice(0, 255),
      subject: paper.subject,
      topic: paper.topic ?? undefined,
      language: paper.language,
      questions: paper.questions.map((q) => ({ ...q, id: randomUUID() })),
      fileUrl: paper.fileUrl ?? undefined,
      fileKey: paper.fileKey ?? undefined,
      fileName: paper.fileName ?? undefined,
      createdBy: actor.userId,
    });
    return this.toDto(copy);
  }

  // ---------- the teacher's own PDF

  public async upload(
    dto: UploadPaperDto,
    coachingId: string,
    actor: PaperActor,
  ): Promise<PaperDto> {
    const buffer = Buffer.from(dto.contentBase64, 'base64');
    assertUploadAllowed('homework', dto.mimeType, buffer.length);
    assertContentMatchesType(buffer, dto.mimeType);

    const stored = await this.storage.uploadFile({
      coachingId,
      fileBuffer: buffer,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      category: 'homework',
    });
    const paper = await this.repository.createPaper({
      coachingId,
      source: 'UPLOAD',
      title: dto.title,
      subject: dto.subject,
      fileUrl: stored.fileUrl,
      fileKey: stored.fileKey,
      fileName: dto.fileName,
      createdBy: actor.userId,
    });
    return this.toDto(paper);
  }

  // ---------- PDFs

  /** The teacher's preview, or with `withAnswers` the answer key */
  public async renderForTeacher(
    id: string,
    withAnswers: boolean,
    coachingId: string,
    actor: PaperActor,
  ): Promise<{ pdf: Buffer; fileName: string }> {
    const paper = await this.load(id, actor);
    if (paper.source !== 'AI') {
      throw new AppError('NOT_AN_AI_PAPER', 'Only a generated paper has an answer key', StatusCodes.BAD_REQUEST);
    }
    const pdf = await this.render(paper, withAnswers, await this.repository.instituteName(coachingId));
    return { pdf, fileName: fileNameFor(withAnswers ? `${paper.title} answer key` : paper.title) };
  }

  private render(paper: PaperRecord, withAnswers: boolean, instituteName: string): Promise<Buffer> {
    return renderPaperPdf({
      instituteName,
      title: paper.title,
      subject: paper.subject,
      topic: paper.topic,
      questions: paper.questions,
      withAnswers,
    });
  }

  // ---------- sharing

  public async publish(
    id: string,
    dto: PublishPaperDto,
    coachingId: string,
    actor: PaperActor,
    correlationId: string = randomUUID(),
  ): Promise<PublishResult> {
    const paper = await this.load(id, actor);
    if (paper.source === 'AI' && paper.questions.length === 0) {
      throw new AppError('EMPTY_PAPER', 'Keep at least one question before sharing', StatusCodes.BAD_REQUEST);
    }
    if (paper.source === 'UPLOAD' && !paper.fileUrl) {
      throw new AppError('EMPTY_PAPER', 'This paper has no file to share', StatusCodes.BAD_REQUEST);
    }

    const batch = await this.repository.findBatch(dto.batchId);
    if (!batch) throw new AppError('BATCH_NOT_FOUND', 'Batch not found', StatusCodes.NOT_FOUND);

    const recent = await this.repository.findRecentShare(id, dto.batchId, new Date(Date.now() - RESHARE_GUARD_MS));
    if (recent) {
      throw new AppError(
        'ALREADY_SHARED',
        `This paper was just shared with ${batch.name}. Parents already have the link.`,
        StatusCodes.CONFLICT,
      );
    }

    const title = dto.title ?? paper.title;
    const token = randomBytes(24).toString('base64url'); // 192 bits: the link is the only credential
    const link = publicLink(token);

    // The share comes first, so the link is valid by the time any message carrying it is queued
    let share = await this.repository.createShare({
      coachingId,
      paperId: id,
      batchId: dto.batchId,
      kind: dto.kind,
      token,
      createdBy: actor.userId,
    });

    if (dto.kind === 'HOMEWORK') {
      try {
        // The homework's attachment is the link, so the homework alert parents get carries it too
        const homework = await this.homework.createHomework(
          {
            batchId: dto.batchId,
            title,
            description: [paper.topic ? `${paper.subject}: ${paper.topic}` : paper.subject, `Paper: ${title}`].join('. '),
            dueDate: dto.dueDate!,
            attachmentUrl: link,
          },
          coachingId,
          actor.userId,
          correlationId,
        );
        await this.repository.attachHomework(share.id, homework.id);
        share = { ...share, homeworkId: homework.id };
      } catch (err) {
        // No homework, so no message: do not leave a live link nobody was told about
        await this.repository.deleteShare(share.id).catch(() => undefined);
        throw err;
      }
    }
    await this.repository.updatePaper(id, { status: 'PUBLISHED' });

    if (dto.kind === 'PRACTICE') {
      await this.eventBus.publish(
        createPaperSharedEvent(
          { shareId: share.id, paperId: id, coachingId, batchId: dto.batchId, title, link },
          correlationId,
          actor.userId,
        ),
      );
    }

    logger.info('[PaperService] Paper shared', { paperId: id, batchId: dto.batchId, kind: dto.kind });
    return { ...this.toShareDto(share), activeStudents: batch.activeStudents, batchName: batch.name };
  }

  // ---------- the parents' link

  /** Resolves a link to what to serve. Unknown tokens look the same as deleted papers. */
  public async openShare(token: string): Promise<DownloadResult> {
    const target = await this.repository.findDownloadTarget(token);
    if (!target) throw new AppError('LINK_NOT_FOUND', 'This link is not valid any more', StatusCodes.NOT_FOUND);
    // Counting is best effort: a failed counter must not stop a parent getting the paper
    void this.repository.recordOpen(target.share.id).catch((err) => {
      logger.warn('[PaperService] Could not record a paper open', { error: (err as Error).message });
    });

    const { paper, instituteName } = target;
    if (paper.source === 'UPLOAD') {
      return { kind: 'file', url: paper.fileUrl!, fileName: paper.fileName ?? fileNameFor(paper.title) };
    }
    // Always the student version: no answers, whatever else is stored
    return { kind: 'generated', pdf: await this.render(paper, false, instituteName), fileName: fileNameFor(paper.title) };
  }
}
