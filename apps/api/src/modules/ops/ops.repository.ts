import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { RequestContextService } from '../../common/services/request-context.service.js';

export type OpsEventStatus = 'FAILED' | 'DEAD';

export interface OpsEventRow {
  readonly id: string;
  readonly eventName: string;
  readonly coachingId: string;
  readonly status: string;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly occurredAt: Date;
  readonly updatedAt: Date;
}

export interface OpsCounts {
  readonly events: { readonly pending: number; readonly failed: number; readonly dead: number };
  readonly paymentsNeedingReview: number;
  readonly failedNotifications24h: number;
}

export interface OpenIssueIds {
  readonly deadEventIds: string[];
  readonly reviewPaymentIds: string[];
}

export interface IOpsRepository {
  counts(): Promise<OpsCounts>;
  listEvents(status: OpsEventStatus, limit: number): Promise<OpsEventRow[]>;
  /** Gives a DEAD event a fresh set of attempts. False when it is not DEAD (or does not exist). */
  retryDeadEvent(id: string): Promise<boolean>;
  listPaymentsNeedingReview(limit: number): Promise<any[]>;
  /** Marks an unresolved review payment as handled. False when there is nothing to resolve. */
  resolvePayment(id: string, userId: string | undefined, note: string): Promise<boolean>;
  openIssueIds(limit: number): Promise<OpenIssueIds>;
}

/**
 * Platform-wide reads and writes: events and payments of every institute, so every call runs
 * as the system rather than as one tenant. Callers must already be authorised as SUPER_ADMIN.
 */
export class PrismaOpsRepository implements IOpsRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  private system<R>(reason: string, work: () => Promise<R>): Promise<R> {
    return RequestContextService.runAsSystem(`ops:${reason}`, work);
  }

  public async counts(): Promise<OpsCounts> {
    return this.system('counts', async () => {
      const [eventRows, review, notifications] = await Promise.all([
        this.db.$queryRaw`SELECT status::text AS status, count(*)::int AS n FROM domain_events
                          WHERE status IN ('PENDING', 'FAILED', 'DEAD') GROUP BY status`,
        this.db.billingPayment.count({ where: { status: 'NEEDS_REVIEW', reviewedAt: null } }),
        this.db.$queryRaw`SELECT count(*)::int AS n FROM notification_history
                          WHERE status = 'FAILED' AND updated_at > now() - interval '24 hours'`,
      ]);
      const byStatus: Record<string, number> = { PENDING: 0, FAILED: 0, DEAD: 0 };
      for (const row of eventRows as Array<{ status: string; n: number }>) byStatus[row.status] = row.n;
      return {
        events: { pending: byStatus.PENDING, failed: byStatus.FAILED, dead: byStatus.DEAD },
        paymentsNeedingReview: review as number,
        failedNotifications24h: (notifications as Array<{ n: number }>)[0]?.n ?? 0,
      };
    });
  }

  public async listEvents(status: OpsEventStatus, limit: number): Promise<OpsEventRow[]> {
    // The payload is left out on purpose: it can hold parent and student details
    const rows: any[] = await this.system('list-events', () =>
      this.db.$queryRaw`
        SELECT id, event_name, coaching_id, status::text AS status, attempts, last_error, occurred_at, updated_at
        FROM domain_events WHERE status = ${status}::domain_event_status
        ORDER BY updated_at DESC LIMIT ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      eventName: r.event_name,
      coachingId: r.coaching_id,
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error,
      occurredAt: r.occurred_at,
      updatedAt: r.updated_at,
    }));
  }

  public async retryDeadEvent(id: string): Promise<boolean> {
    const changed = await this.system<number>('retry-event', () =>
      this.db.$executeRaw`
        UPDATE domain_events
        SET status = 'FAILED', attempts = 0, next_attempt_at = now(), updated_at = now()
        WHERE id = ${id} AND status = 'DEAD'`,
    );
    return changed > 0;
  }

  public async listPaymentsNeedingReview(limit: number): Promise<any[]> {
    return this.system('list-review', () =>
      this.db.billingPayment.findMany({
        where: { status: 'NEEDS_REVIEW', reviewedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { coaching: { select: { id: true, name: true, code: true, email: true, phone: true } } },
      }),
    );
  }

  public async resolvePayment(id: string, userId: string | undefined, note: string): Promise<boolean> {
    return this.system('resolve-payment', () =>
      this.db.$transaction(async (tx: any) => {
        // Row lock: two administrators resolving the same payment cannot both succeed
        const locked: Array<{ review_note: string | null }> = await tx.$queryRaw`
          SELECT review_note FROM billing_payments
          WHERE id = ${id}::uuid AND status = 'NEEDS_REVIEW' AND reviewed_at IS NULL FOR UPDATE`;
        if (locked.length === 0) return false;
        await tx.billingPayment.update({
          where: { id },
          data: {
            reviewedAt: new Date(),
            reviewedBy: userId ?? null,
            reviewNote: `${locked[0].review_note ?? ''}\nResolved: ${note}`.trim(),
          },
        });
        return true;
      }),
    );
  }

  public async openIssueIds(limit: number): Promise<OpenIssueIds> {
    return this.system('open-issues', async () => {
      const [dead, review] = await Promise.all([
        this.db.$queryRaw`SELECT id FROM domain_events WHERE status = 'DEAD' ORDER BY id LIMIT ${limit}`,
        this.db.billingPayment.findMany({
          where: { status: 'NEEDS_REVIEW', reviewedAt: null },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: limit,
        }),
      ]);
      return {
        deadEventIds: (dead as Array<{ id: string }>).map((r) => r.id),
        reviewPaymentIds: (review as Array<{ id: string }>).map((r) => r.id),
      };
    });
  }
}
