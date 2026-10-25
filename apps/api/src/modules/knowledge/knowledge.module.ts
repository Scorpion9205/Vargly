import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { logger } from '../../common/logger/logger.service.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import type { KnowledgeBaseService } from '../ai/rag/knowledge-base.service.js';
import type { KnowledgeBaseEntity } from '../ai/rag/knowledge-base.interface.js';

/** What the owner writes for the chatbot. Notices, homework and tests sync in by themselves. */
export const OWNER_TYPES = ['FAQ', 'POLICY', 'SCHEDULE', 'SYLLABUS'] as const;
export const MAX_ENTRY_LENGTH = 8000;
const AUTO_SYNCED = 'Auto-synced';

const entrySchema = z.object({
  title: z.string().trim().min(2).max(255),
  type: z.enum(OWNER_TYPES).default('FAQ'),
  content: z.string().trim().min(5).max(MAX_ENTRY_LENGTH),
});

export interface KnowledgeEntry {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly content: string;
  readonly updatedAt: Date;
}

/** Entries the owner wrote, not the ones that sync in from notices, homework and tests */
export function isOwnerEntry(document: Pick<KnowledgeBaseEntity, 'description'>): boolean {
  return !document.description?.startsWith(AUTO_SYNCED);
}

export class KnowledgeService {
  public constructor(private readonly knowledge: KnowledgeBaseService) {}

  private toEntry(document: KnowledgeBaseEntity): KnowledgeEntry {
    return {
      id: document.id,
      title: document.title,
      type: document.type,
      content: document.rawContent,
      updatedAt: document.updatedAt,
    };
  }

  public async list(coachingId: string): Promise<{ items: KnowledgeEntry[]; canEmbed: boolean }> {
    const documents = await this.knowledge.listDocuments(coachingId, 200, 0);
    return { items: documents.filter(isOwnerEntry).map((d) => this.toEntry(d)), canEmbed: this.knowledge.canEmbed };
  }

  /** An entry that cannot be indexed right now (no embedding key, or the provider is down) is still saved */
  public async create(dto: z.infer<typeof entrySchema>, coachingId: string, userId?: string): Promise<KnowledgeEntry> {
    const input = { title: dto.title, type: dto.type, rawContent: dto.content };
    try {
      const { document } = await this.knowledge.ingestDocument(input, coachingId, userId);
      return this.toEntry(document);
    } catch (error) {
      logger.error('[KnowledgeService] Could not index the entry; it is saved and kb:reindex will retry', error);
      const documents = await this.knowledge.listDocuments(coachingId, 1, 0);
      const saved = documents.find((d) => d.title === dto.title);
      if (!saved) throw error;
      return this.toEntry(saved);
    }
  }

  /** Editing replaces the entry: the new text is indexed first, so the bot never loses the answer */
  public async replace(id: string, dto: z.infer<typeof entrySchema>, coachingId: string, userId?: string): Promise<KnowledgeEntry> {
    const current = await this.knowledge.getDocument(id, coachingId);
    if (!current || !isOwnerEntry(current)) {
      throw new AppError('KNOWLEDGE_NOT_FOUND', 'Entry not found', StatusCodes.NOT_FOUND);
    }
    const next = await this.create(dto, coachingId, userId);
    await this.knowledge.deleteDocument(id, coachingId);
    return next;
  }

  public async remove(id: string, coachingId: string): Promise<void> {
    const current = await this.knowledge.getDocument(id, coachingId);
    if (!current || !isOwnerEntry(current)) {
      throw new AppError('KNOWLEDGE_NOT_FOUND', 'Entry not found', StatusCodes.NOT_FOUND);
    }
    await this.knowledge.deleteDocument(id, coachingId);
  }
}

function paramId(id: string): string {
  if (!isUuid(id)) throw new AppError('VALIDATION_ERROR', 'Invalid id', StatusCodes.BAD_REQUEST);
  return id;
}

export class KnowledgeModule {
  public static init(deps: { knowledgeBaseService: KnowledgeBaseService }): { router: Router; service: KnowledgeService } {
    const service = new KnowledgeService(deps.knowledgeBaseService);
    const router = createRouter();
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('knowledge:manage'));

    router.get('/', async (_req, res) => {
      res.status(StatusCodes.OK).json({ data: await service.list(RequestContextService.getRequiredCoachingId()) });
    });
    router.post('/', async (req, res) => {
      const entry = await service.create(
        entrySchema.parse(req.body),
        RequestContextService.getRequiredCoachingId(),
        RequestContextService.getUserId(),
      );
      res.status(StatusCodes.CREATED).json({ data: entry });
    });
    router.put('/:id', async (req, res) => {
      const entry = await service.replace(
        paramId(req.params.id),
        entrySchema.parse(req.body),
        RequestContextService.getRequiredCoachingId(),
        RequestContextService.getUserId(),
      );
      res.status(StatusCodes.OK).json({ data: entry });
    });
    router.delete('/:id', async (req, res) => {
      await service.remove(paramId(req.params.id), RequestContextService.getRequiredCoachingId());
      res.status(StatusCodes.OK).json({ data: { message: 'Entry deleted' } });
    });

    return { router, service };
  }
}
