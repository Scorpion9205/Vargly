import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import {
  ENQUIRY_STATUSES,
  EnquiryRecord,
  EnquirySourceType,
  EnquiryStatusType,
  EnquirySummary,
} from './enquiry.types.js';

export interface CreateEnquiryInput {
  readonly coachingId: string;
  readonly name: string;
  readonly phone: string;
  readonly studentName?: string | null;
  readonly interestedIn?: string | null;
  readonly source: EnquirySourceType;
  readonly notes?: string | null;
  readonly followUpOn?: string | null;
  readonly createdBy?: string;
}

export interface UpdateEnquiryInput {
  readonly name?: string;
  readonly phone?: string;
  readonly studentName?: string | null;
  readonly interestedIn?: string | null;
  readonly source?: EnquirySourceType;
  readonly status?: EnquiryStatusType;
  readonly notes?: string | null;
  readonly followUpOn?: string | null;
  readonly lastContactedAt?: Date;
}

export interface EnquiryFilter {
  readonly status?: EnquiryStatusType;
  /** Open enquiries due on or before this day (YYYY-MM-DD) */
  readonly dueBy?: string;
  readonly search?: string;
  readonly limit: number;
}

export interface IEnquiryRepository {
  create(input: CreateEnquiryInput): Promise<EnquiryRecord>;
  findById(id: string): Promise<EnquiryRecord | null>;
  list(filter: EnquiryFilter): Promise<EnquiryRecord[]>;
  update(id: string, input: UpdateEnquiryInput): Promise<EnquiryRecord>;
  softDelete(id: string): Promise<void>;
  summary(today: string): Promise<EnquirySummary>;
}

const OPEN: EnquiryStatusType[] = ['NEW', 'CONTACTED'];

/** A DATE column is read and written as midnight UTC of that day, so the day never shifts */
function toDate(day: string | null | undefined): Date | null | undefined {
  if (day === undefined) return undefined;
  return day === null ? null : new Date(`${day}T00:00:00.000Z`);
}

export class PrismaEnquiryRepository implements IEnquiryRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  private toRecord(row: any): EnquiryRecord {
    return { ...row, followUpOn: row.followUpOn ? (row.followUpOn as Date).toISOString().slice(0, 10) : null };
  }

  public async create(input: CreateEnquiryInput): Promise<EnquiryRecord> {
    const row = await this.db.enquiry.create({ data: { ...input, followUpOn: toDate(input.followUpOn) } });
    return this.toRecord(row);
  }

  public async findById(id: string): Promise<EnquiryRecord | null> {
    const row = await this.db.enquiry.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toRecord(row) : null;
  }

  public async list(filter: EnquiryFilter): Promise<EnquiryRecord[]> {
    const search = filter.search?.trim();
    const rows = await this.db.enquiry.findMany({
      where: {
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.dueBy ? { status: { in: OPEN }, followUpOn: { lte: toDate(filter.dueBy) } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { studentName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      // The ones to call soonest come first, then the newest enquiries
      orderBy: [{ followUpOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: filter.limit,
    });
    return rows.map((row: any) => this.toRecord(row));
  }

  public async update(id: string, input: UpdateEnquiryInput): Promise<EnquiryRecord> {
    const row = await this.db.enquiry.update({
      where: { id },
      data: { ...input, followUpOn: toDate(input.followUpOn) },
    });
    return this.toRecord(row);
  }

  public async softDelete(id: string): Promise<void> {
    await this.db.enquiry.delete({ where: { id } }); // the tenant extension turns this into a soft delete
  }

  public async summary(today: string): Promise<EnquirySummary> {
    const [groups, dueToday] = await Promise.all([
      this.db.enquiry.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.db.enquiry.count({
        where: { deletedAt: null, status: { in: OPEN }, followUpOn: { lte: toDate(today) } },
      }),
    ]);
    const byStatus = Object.fromEntries(ENQUIRY_STATUSES.map((status) => [status, 0])) as Record<
      EnquiryStatusType,
      number
    >;
    for (const group of groups) byStatus[group.status as EnquiryStatusType] = group._count._all;
    return { total: Object.values(byStatus).reduce((sum, n) => sum + n, 0), byStatus, dueToday };
  }
}
