import { logger } from '../../common/logger/logger.service.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { eventBus as defaultEventBus } from '../../events/event-bus.js';
import { money, toRupees } from '../../common/money/money.js';
import { todayInIndia } from '../reports/report.dates.js';
import { createOwnerSummaryEvent } from './owner-summary.events.js';

export interface OwnerSummaryStats {
  /** Students marked absent on the previous day */
  readonly absentYesterday: number;
  /** Fee installments past their due date and not fully paid, and what is still owed on them (rupees) */
  readonly overdueCount: number;
  readonly overdueAmount: number;
  /** Open enquiries whose follow-up day is today or earlier */
  readonly callsDue: number;
}

export interface IOwnerSummaryRepository {
  /** Institutes whose plan is running (or in its grace period): the ones that get the message */
  listActiveCoachings(afterId: string | undefined, limit: number): Promise<Array<{ id: string; name: string }>>;
  /** The counts, for one institute; runs in that institute's tenant context */
  statsFor(coachingId: string, today: string): Promise<OwnerSummaryStats>;
}

const RUNNING = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE'];
const PAGE_SIZE = 200;

function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export class PrismaOwnerSummaryRepository implements IOwnerSummaryRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  public async listActiveCoachings(afterId: string | undefined, limit: number) {
    return this.db.coaching.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        subscriptions: { some: { isActive: true, status: { in: RUNNING } } },
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
      take: limit,
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    });
  }

  public async statsFor(coachingId: string, today: string): Promise<OwnerSummaryStats> {
    const todayDate = new Date(`${today}T00:00:00Z`);
    const yesterdayDate = new Date(`${previousDay(today)}T00:00:00Z`);
    return RequestContextService.runForTenant(coachingId, async () => {
      const [absentYesterday, overdue, callsDue] = await Promise.all([
        this.db.attendanceRecord.count({
          where: {
            coachingId,
            status: 'ABSENT',
            session: { deletedAt: null, sessionDate: yesterdayDate },
            student: { deletedAt: null, isActive: true },
          },
        }),
        this.db.feeInstallment.findMany({
          where: {
            coachingId,
            deletedAt: null,
            status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
            dueDate: { lt: todayDate },
            feePlan: { deletedAt: null, student: { deletedAt: null } },
          },
          select: { amount: true, paidAmount: true },
        }),
        this.db.enquiry.count({
          where: { coachingId, deletedAt: null, status: { in: ['NEW', 'CONTACTED'] }, followUpOn: { lte: todayDate } },
        }),
      ]);
      const owed = overdue.reduce((sum: any, i: any) => sum.plus(money(i.amount).minus(money(i.paidAmount))), money(0));
      return { absentYesterday, overdueCount: overdue.length, overdueAmount: toRupees(owed), callsDue };
    });
  }
}

/** Whether there is anything to say: a message that reads "0, 0, 0" is noise */
export function hasNews(stats: OwnerSummaryStats): boolean {
  return stats.absentYesterday > 0 || stats.overdueCount > 0 || stats.callsDue > 0;
}

/**
 * Every morning: how many students were absent yesterday, how many fees are overdue and how many
 * enquiries need a call today, sent to each owner on WhatsApp. One message per institute per day.
 */
export class OwnerSummaryService {
  public constructor(
    private readonly repository: IOwnerSummaryRepository = new PrismaOwnerSummaryRepository(),
    private readonly events: IEventBus = defaultEventBus,
  ) {}

  public async runDaily(now: Date = new Date()): Promise<number> {
    const today = todayInIndia(now);
    let sent = 0;
    let cursor: string | undefined;
    for (;;) {
      const coachings = await this.repository.listActiveCoachings(cursor, PAGE_SIZE);
      for (const coaching of coachings) {
        try {
          const stats = await this.repository.statsFor(coaching.id, today);
          if (!hasNews(stats)) continue;
          await this.events.publish(createOwnerSummaryEvent({ coachingId: coaching.id, date: today, ...stats }));
          sent++;
        } catch (err) {
          logger.error(`[OwnerSummary] Could not build the summary for coaching ${coaching.id}`, err);
        }
      }
      if (coachings.length < PAGE_SIZE) break;
      cursor = coachings[coachings.length - 1]!.id;
    }
    if (sent > 0) logger.info(`[OwnerSummary] Queued ${sent} daily summaries`);
    return sent;
  }
}
