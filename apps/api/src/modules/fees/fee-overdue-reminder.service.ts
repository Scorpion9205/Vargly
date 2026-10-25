import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { eventBus as defaultEventBus } from '../../events/event-bus.js';
import { money, toRupees } from '../../common/money/money.js';
import { todayInIndia } from '../reports/report.dates.js';
import { createFeeReminderTriggeredEvent } from './fee.events.js';

export interface OverdueStudentReminder {
  readonly studentId: string;
  /** The oldest unpaid instalment: the reminder is keyed to it */
  readonly installmentId: string;
  readonly dueDate: Date;
  /** Everything the student owes that is past due, in rupees */
  readonly amount: number;
  readonly daysOverdue: number;
}

interface OverdueRow {
  readonly id: string;
  readonly dueDate: Date;
  readonly amount: unknown;
  readonly paidAmount: unknown;
  readonly feePlan: { readonly studentId: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** One entry per student: their oldest overdue instalment and the total they owe */
export function groupOverdueByStudent(rows: readonly OverdueRow[], today: string): OverdueStudentReminder[] {
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const byStudent = new Map<string, { oldest: OverdueRow; owed: ReturnType<typeof money> }>();
  for (const row of rows) {
    const owed = money(row.amount as any).minus(money(row.paidAmount as any));
    const entry = byStudent.get(row.feePlan.studentId);
    if (!entry) {
      byStudent.set(row.feePlan.studentId, { oldest: row, owed });
    } else {
      entry.owed = entry.owed.plus(owed);
      if (row.dueDate < entry.oldest.dueDate) entry.oldest = row;
    }
  }
  return [...byStudent.entries()].map(([studentId, { oldest, owed }]) => ({
    studentId,
    installmentId: oldest.id,
    dueDate: oldest.dueDate,
    amount: toRupees(owed),
    daysOverdue: Math.max(1, Math.round((todayMs - new Date(oldest.dueDate).getTime()) / DAY_MS)),
  }));
}

/**
 * "Remind everyone who owes" in one go: each student with overdue fees gets one WhatsApp
 * message for their whole overdue amount. Pressing it twice in a day sends nothing new, because
 * the reminder is keyed to the instalment and the day.
 */
export class OverdueReminderService {
  public constructor(
    private readonly prisma: ExtendedPrismaClient = getPrismaClient(),
    private readonly events: IEventBus = defaultEventBus,
  ) {}

  /** Runs in the signed-in owner's tenant context. Returns how many students were reminded. */
  public async remindAll(coachingId: string, userId?: string, now: Date = new Date()): Promise<number> {
    const today = todayInIndia(now);
    const rows: OverdueRow[] = await (this.prisma as any).feeInstallment.findMany({
      where: {
        coachingId,
        deletedAt: null,
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: new Date(`${today}T00:00:00Z`) },
        feePlan: { deletedAt: null, student: { deletedAt: null, isActive: true } },
      },
      select: { id: true, dueDate: true, amount: true, paidAmount: true, feePlan: { select: { studentId: true } } },
    });

    const students = groupOverdueByStudent(rows, today);
    for (const student of students) {
      await this.events.publish(
        createFeeReminderTriggeredEvent(
          {
            installmentId: student.installmentId,
            coachingId,
            studentId: student.studentId,
            amount: student.amount,
            dueDate: new Date(student.dueDate),
            daysUntilDue: -student.daysOverdue,
            stage: `MANUAL-${today}`,
          },
          crypto.randomUUID(),
          userId,
        ),
      );
    }
    return students.length;
  }
}
