import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { Question } from './paper.types.js';

export type PaperSourceType = 'AI' | 'UPLOAD';
export type PaperShareKindType = 'HOMEWORK' | 'PRACTICE';

export interface PaperRecord {
  readonly id: string;
  readonly coachingId: string;
  readonly source: PaperSourceType;
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly title: string;
  readonly subject: string;
  readonly topic: string | null;
  readonly language: string;
  readonly questions: Question[];
  readonly fileUrl: string | null;
  readonly fileKey: string | null;
  readonly fileName: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaperShareRecord {
  readonly id: string;
  readonly coachingId: string;
  readonly paperId: string;
  readonly batchId: string;
  readonly kind: PaperShareKindType;
  readonly token: string;
  readonly homeworkId: string | null;
  readonly openCount: number;
  readonly lastOpenedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreatePaperInput {
  readonly coachingId: string;
  readonly source: PaperSourceType;
  readonly title: string;
  readonly subject: string;
  readonly topic?: string;
  readonly language?: string;
  readonly questions?: Question[];
  readonly fileUrl?: string;
  readonly fileKey?: string;
  readonly fileName?: string;
  readonly createdBy?: string;
}

export interface CreateShareInput {
  readonly coachingId: string;
  readonly paperId: string;
  readonly batchId: string;
  readonly kind: PaperShareKindType;
  readonly token: string;
  readonly homeworkId?: string;
  readonly createdBy?: string;
}

export interface BatchSummary {
  readonly id: string;
  readonly name: string;
  readonly activeStudents: number;
}

/** What the public download link needs, found by its token alone */
export interface DownloadTarget {
  readonly share: PaperShareRecord;
  readonly paper: PaperRecord;
  readonly instituteName: string;
}

export interface IPaperRepository {
  createPaper(input: CreatePaperInput): Promise<PaperRecord>;
  findById(id: string): Promise<PaperRecord | null>;
  /** Newest first; `createdBy` limits the list to one teacher's papers */
  list(filter: { createdBy?: string; limit: number }): Promise<PaperRecord[]>;
  updatePaper(id: string, data: { title?: string; questions?: Question[]; status?: 'DRAFT' | 'PUBLISHED' }): Promise<PaperRecord>;
  softDelete(id: string): Promise<void>;
  createShare(input: CreateShareInput): Promise<PaperShareRecord>;
  findRecentShare(paperId: string, batchId: string, since: Date): Promise<PaperShareRecord | null>;
  listShares(paperId: string): Promise<PaperShareRecord[]>;
  attachHomework(shareId: string, homeworkId: string): Promise<void>;
  deleteShare(shareId: string): Promise<void>;
  findBatch(batchId: string): Promise<BatchSummary | null>;
  instituteName(coachingId: string): Promise<string>;
  /** Public link lookup: no tenant yet, so this runs as the system and returns only that share's data */
  findDownloadTarget(token: string): Promise<DownloadTarget | null>;
  recordOpen(shareId: string): Promise<void>;
}

export class PrismaPaperRepository implements IPaperRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  private toRecord(row: any): PaperRecord {
    return { ...row, questions: Array.isArray(row.questions) ? (row.questions as Question[]) : [] };
  }

  public async createPaper(input: CreatePaperInput): Promise<PaperRecord> {
    const row = await this.db.paper.create({
      data: { ...input, questions: input.questions ?? [], language: input.language ?? 'en' },
    });
    return this.toRecord(row);
  }

  public async findById(id: string): Promise<PaperRecord | null> {
    const row = await this.db.paper.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toRecord(row) : null;
  }

  public async list(filter: { createdBy?: string; limit: number }): Promise<PaperRecord[]> {
    const rows = await this.db.paper.findMany({
      where: { deletedAt: null, ...(filter.createdBy ? { createdBy: filter.createdBy } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: filter.limit,
    });
    return rows.map((row: any) => this.toRecord(row));
  }

  public async updatePaper(
    id: string,
    data: { title?: string; questions?: Question[]; status?: 'DRAFT' | 'PUBLISHED' },
  ): Promise<PaperRecord> {
    return this.toRecord(await this.db.paper.update({ where: { id }, data }));
  }

  public async softDelete(id: string): Promise<void> {
    await this.db.paper.delete({ where: { id } }); // the tenant extension turns this into a soft delete
  }

  public async createShare(input: CreateShareInput): Promise<PaperShareRecord> {
    return this.db.paperShare.create({ data: input });
  }

  public async findRecentShare(paperId: string, batchId: string, since: Date): Promise<PaperShareRecord | null> {
    return this.db.paperShare.findFirst({
      where: { paperId, batchId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async listShares(paperId: string): Promise<PaperShareRecord[]> {
    return this.db.paperShare.findMany({ where: { paperId }, orderBy: { createdAt: 'desc' } });
  }

  public async attachHomework(shareId: string, homeworkId: string): Promise<void> {
    await this.db.paperShare.update({ where: { id: shareId }, data: { homeworkId } });
  }

  public async deleteShare(shareId: string): Promise<void> {
    await this.db.paperShare.delete({ where: { id: shareId } });
  }

  public async findBatch(batchId: string): Promise<BatchSummary | null> {
    const batch = await this.db.batch.findFirst({
      where: { id: batchId, deletedAt: null },
      select: { id: true, name: true, _count: { select: { batchStudents: { where: { leftAt: null } } } } },
    });
    return batch ? { id: batch.id, name: batch.name, activeStudents: batch._count.batchStudents } : null;
  }

  public async instituteName(coachingId: string): Promise<string> {
    const coaching = await this.db.coaching.findUnique({ where: { id: coachingId }, select: { name: true } });
    return coaching?.name ?? 'Vargly';
  }

  public async findDownloadTarget(token: string): Promise<DownloadTarget | null> {
    return RequestContextService.runAsSystem('papers:download', async () => {
      const share = await this.db.paperShare.findUnique({ where: { token } });
      if (!share) return null;
      const [paper, coaching] = await Promise.all([
        this.db.paper.findFirst({ where: { id: share.paperId, deletedAt: null } }),
        this.db.coaching.findUnique({ where: { id: share.coachingId }, select: { name: true } }),
      ]);
      if (!paper) return null;
      return { share, paper: this.toRecord(paper), instituteName: coaching?.name ?? 'Vargly' };
    });
  }

  public async recordOpen(shareId: string): Promise<void> {
    await RequestContextService.runAsSystem('papers:record-open', () =>
      this.db.paperShare.update({
        where: { id: shareId },
        data: { openCount: { increment: 1 }, lastOpenedAt: new Date() },
      }),
    );
  }
}
