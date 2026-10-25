import { randomBytes } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { envConfig } from '../../config/env.config.js';
import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { eventBus as defaultEventBus } from '../../events/event-bus.js';
import { createSurveyOpenedEvent } from './survey.events.js';

export const DEFAULT_QUESTION = 'How happy are you with our classes and teaching?';

export const createSurveySchema = z.object({
  title: z.string().trim().min(3).max(255),
  question: z.string().trim().min(5).max(500).optional(),
  /** Leave out to ask every parent of the institute */
  batchId: z.string().uuid().optional(),
});
export type CreateSurveyDto = z.infer<typeof createSurveySchema>;

export const answerSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type AnswerDto = z.infer<typeof answerSchema>;

export interface SurveySummary {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly batchName: string | null;
  readonly sent: number;
  readonly answered: number;
  /** One decimal, e.g. 4.3; null until someone answers */
  readonly averageRating: number | null;
  readonly closed: boolean;
  readonly createdAt: Date;
}

export interface SurveyResponse {
  readonly parentName: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly respondedAt: Date;
}

export interface SurveyDetail extends SurveySummary {
  /** How many parents gave each rating, 1 to 5 */
  readonly distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  readonly responses: SurveyResponse[];
}

export interface PublicSurvey {
  readonly instituteName: string;
  readonly title: string;
  readonly question: string;
  readonly answered: boolean;
  readonly closed: boolean;
}

export interface ParentContact {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
}

export interface InviteRow {
  readonly rating: number | null;
  readonly comment: string | null;
  readonly respondedAt: Date | null;
  readonly parentId: string;
}

export interface ISurveyRepository {
  findParents(batchId: string | undefined): Promise<ParentContact[]>;
  batchName(batchId: string): Promise<string | null>;
  createWithInvites(
    survey: { coachingId: string; title: string; question: string; batchId?: string; createdBy?: string },
    invites: Array<{ parentId: string; token: string }>,
  ): Promise<{ id: string; createdAt: Date }>;
  list(): Promise<Array<{ id: string; title: string; question: string; batchId: string | null; closedAt: Date | null; createdAt: Date; sentCount: number }>>;
  invitesOf(surveyId: string): Promise<InviteRow[]>;
  findSurvey(id: string): Promise<{ id: string; title: string; question: string; batchId: string | null; closedAt: Date | null; createdAt: Date; sentCount: number } | null>;
  parentNames(ids: string[]): Promise<Map<string, string>>;
  close(id: string): Promise<void>;
  /** Public link lookup: no tenant yet, so this runs as the system and returns only that invite's data */
  findByToken(token: string): Promise<{ inviteId: string; surveyId: string; coachingId: string; title: string; question: string; instituteName: string; answered: boolean; closed: boolean } | null>;
  /** Records the answer once; false when it was already answered meanwhile */
  answer(inviteId: string, coachingId: string, answer: AnswerDto): Promise<boolean>;
}

export function webLink(token: string): string {
  return `${envConfig.get('FRONTEND_URL').replace(/\/+$/, '')}/feedback/${token}`;
}

export class PrismaSurveyRepository implements ISurveyRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  public async findParents(batchId: string | undefined): Promise<ParentContact[]> {
    return this.db.parent.findMany({
      where: {
        deletedAt: null,
        studentParents: {
          some: {
            student: {
              deletedAt: null,
              isActive: true,
              ...(batchId ? { batchStudents: { some: { batchId, leftAt: null } } } : {}),
            },
          },
        },
      },
      select: { id: true, name: true, phone: true },
    });
  }

  public async batchName(batchId: string): Promise<string | null> {
    const batch = await this.db.batch.findFirst({ where: { id: batchId, deletedAt: null }, select: { name: true } });
    return batch?.name ?? null;
  }

  public async createWithInvites(
    survey: { coachingId: string; title: string; question: string; batchId?: string; createdBy?: string },
    invites: Array<{ parentId: string; token: string }>,
  ) {
    return this.db.$transaction(async (tx: any) => {
      const created = await tx.survey.create({
        data: { ...survey, sentCount: invites.length },
        select: { id: true, createdAt: true },
      });
      await tx.surveyInvite.createMany({
        data: invites.map((invite) => ({ coachingId: survey.coachingId, surveyId: created.id, ...invite })),
      });
      return created;
    });
  }

  public async list() {
    return this.db.survey.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  public async invitesOf(surveyId: string): Promise<InviteRow[]> {
    return this.db.surveyInvite.findMany({
      where: { surveyId },
      select: { rating: true, comment: true, respondedAt: true, parentId: true },
    });
  }

  public async findSurvey(id: string) {
    return this.db.survey.findFirst({ where: { id } });
  }

  public async parentNames(ids: string[]) {
    const rows = await this.db.parent.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map<string, string>(rows.map((r: any) => [r.id, r.name]));
  }

  public async close(id: string) {
    await this.db.survey.update({ where: { id }, data: { closedAt: new Date() } });
  }

  public async findByToken(token: string) {
    return RequestContextService.runAsSystem('surveys:public-link', async () => {
      const invite = await this.db.surveyInvite.findUnique({ where: { token }, include: { survey: true } });
      if (!invite) return null;
      const coaching = await this.db.coaching.findUnique({ where: { id: invite.coachingId }, select: { name: true } });
      return {
        inviteId: invite.id,
        surveyId: invite.surveyId,
        coachingId: invite.coachingId,
        title: invite.survey.title,
        question: invite.survey.question,
        instituteName: coaching?.name ?? 'Vargly',
        answered: invite.respondedAt !== null,
        closed: invite.survey.closedAt !== null,
      };
    });
  }

  public async answer(inviteId: string, coachingId: string, answer: AnswerDto): Promise<boolean> {
    return RequestContextService.runAsSystem('surveys:public-answer', async () => {
      // Only an invite that has not been answered yet is updated, so a double tap counts once
      const result = await this.db.surveyInvite.updateMany({
        where: { id: inviteId, coachingId, respondedAt: null },
        data: { rating: answer.rating, comment: answer.comment || null, respondedAt: new Date() },
      });
      return result.count === 1;
    });
  }
}

export function averageOf(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10;
}

export function distributionOf(ratings: number[]): Record<1 | 2 | 3 | 4 | 5, number> {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of ratings) distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
  return distribution;
}

export class SurveyService {
  public constructor(
    private readonly repository: ISurveyRepository = new PrismaSurveyRepository(),
    private readonly events: IEventBus = defaultEventBus,
  ) {}

  /** Creates the survey and one private link per parent, then queues the WhatsApp messages */
  public async create(dto: CreateSurveyDto, coachingId: string, userId?: string): Promise<SurveySummary> {
    const batchName = dto.batchId ? await this.repository.batchName(dto.batchId) : null;
    if (dto.batchId && !batchName) throw new AppError('BATCH_NOT_FOUND', 'Batch not found', StatusCodes.NOT_FOUND);

    const parents = await this.repository.findParents(dto.batchId);
    if (parents.length === 0) {
      throw new AppError('NO_PARENTS', 'There are no parents with a number to send this to', StatusCodes.BAD_REQUEST);
    }
    const invites = parents.map((parent) => ({ parentId: parent.id, token: randomBytes(24).toString('base64url') }));
    const question = dto.question ?? DEFAULT_QUESTION;
    const survey = await this.repository.createWithInvites(
      { coachingId, title: dto.title, question, batchId: dto.batchId, createdBy: userId },
      invites,
    );

    // Created first, so every link is valid by the time a message carrying it is queued
    const phoneOf = new Map(parents.map((p) => [p.id, p.phone]));
    await this.events.publish(
      createSurveyOpenedEvent({
        coachingId,
        surveyId: survey.id,
        title: dto.title,
        invites: invites.map((invite) => ({ link: webLink(invite.token), token: invite.token, phone: phoneOf.get(invite.parentId)! })),
      }),
    );

    return {
      id: survey.id,
      title: dto.title,
      question,
      batchName,
      sent: invites.length,
      answered: 0,
      averageRating: null,
      closed: false,
      createdAt: survey.createdAt,
    };
  }

  public async list(): Promise<SurveySummary[]> {
    const surveys = await this.repository.list();
    const summaries: SurveySummary[] = [];
    for (const survey of surveys) {
      const invites = await this.repository.invitesOf(survey.id);
      const ratings = invites.filter((i) => i.rating !== null).map((i) => i.rating as number);
      summaries.push({
        id: survey.id,
        title: survey.title,
        question: survey.question,
        batchName: survey.batchId ? await this.repository.batchName(survey.batchId) : null,
        sent: survey.sentCount,
        answered: ratings.length,
        averageRating: averageOf(ratings),
        closed: survey.closedAt !== null,
        createdAt: survey.createdAt,
      });
    }
    return summaries;
  }

  public async detail(id: string): Promise<SurveyDetail> {
    const survey = await this.repository.findSurvey(id);
    if (!survey) throw new AppError('SURVEY_NOT_FOUND', 'Survey not found', StatusCodes.NOT_FOUND);
    const invites = await this.repository.invitesOf(id);
    const answered = invites.filter((i) => i.rating !== null && i.respondedAt !== null);
    const names = await this.repository.parentNames(answered.map((i) => i.parentId));
    const ratings = answered.map((i) => i.rating as number);
    return {
      id: survey.id,
      title: survey.title,
      question: survey.question,
      batchName: survey.batchId ? await this.repository.batchName(survey.batchId) : null,
      sent: survey.sentCount,
      answered: ratings.length,
      averageRating: averageOf(ratings),
      closed: survey.closedAt !== null,
      createdAt: survey.createdAt,
      distribution: distributionOf(ratings),
      responses: answered
        .map((i) => ({ parentName: names.get(i.parentId) ?? 'Parent', rating: i.rating as number, comment: i.comment, respondedAt: i.respondedAt as Date }))
        .sort((a, b) => b.respondedAt.getTime() - a.respondedAt.getTime()),
    };
  }

  public async close(id: string): Promise<void> {
    const survey = await this.repository.findSurvey(id);
    if (!survey) throw new AppError('SURVEY_NOT_FOUND', 'Survey not found', StatusCodes.NOT_FOUND);
    await this.repository.close(id);
  }

  // ---------- the parent's link

  public async publicSurvey(token: string): Promise<PublicSurvey | null> {
    const found = await this.repository.findByToken(token);
    if (!found) return null;
    return { instituteName: found.instituteName, title: found.title, question: found.question, answered: found.answered, closed: found.closed };
  }

  public async submit(token: string, answer: AnswerDto): Promise<void> {
    const found = await this.repository.findByToken(token);
    if (!found) throw new AppError('LINK_NOT_FOUND', 'This link is not valid any more', StatusCodes.NOT_FOUND);
    if (found.closed) throw new AppError('SURVEY_CLOSED', 'This survey is closed', StatusCodes.GONE);
    const saved = await this.repository.answer(found.inviteId, found.coachingId, answer);
    if (!saved) throw new AppError('ALREADY_ANSWERED', 'You have already answered. Thank you!', StatusCodes.CONFLICT);
  }
}
