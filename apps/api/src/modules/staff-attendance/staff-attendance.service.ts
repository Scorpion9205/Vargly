import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { todayInIndia } from '../reports/report.dates.js';

export const STAFF_STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const markStaffSchema = z.object({
  date: day,
  entries: z
    .array(
      z.object({
        teacherId: z.string().uuid(),
        status: z.enum(STAFF_STATUSES),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type MarkStaffDto = z.infer<typeof markStaffSchema>;

export const staffMonthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM') });

export interface StaffDayRow {
  readonly teacherId: string;
  readonly name: string;
  readonly status: StaffStatus | null;
  readonly note: string | null;
}

export interface StaffMonthRow {
  readonly teacherId: string;
  readonly name: string;
  readonly present: number;
  readonly halfDay: number;
  readonly absent: number;
  readonly leave: number;
  /** Days marked in the month, the base the suggestion is worked out on */
  readonly marked: number;
  readonly monthlySalary: number | null;
  /** monthlySalary x payable days / marked days; null with no salary or no marked days */
  readonly suggestedAmount: number | null;
}

export interface IStaffAttendanceRepository {
  listTeachers(): Promise<Array<{ id: string; name: string; monthlySalary: number | null }>>;
  /** Marks for one day, as teacher id -> status and note */
  marksForDay(date: string): Promise<Map<string, { status: StaffStatus; note: string | null }>>;
  /** Teachers, of those given, that belong to this institute and are on the books */
  validTeacherIds(ids: string[]): Promise<Set<string>>;
  upsert(date: string, entries: MarkStaffDto['entries'], markedBy: string | undefined): Promise<void>;
  /** All marks in a date range (inclusive) */
  marksInRange(from: string, to: string): Promise<Array<{ teacherId: string; status: StaffStatus }>>;
}

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

export class PrismaStaffAttendanceRepository implements IStaffAttendanceRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  public async listTeachers() {
    const teachers = await this.db.teacher.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, monthlySalary: true },
      orderBy: { name: 'asc' },
    });
    return teachers.map((t: any) => ({ id: t.id, name: t.name, monthlySalary: t.monthlySalary == null ? null : Number(t.monthlySalary) }));
  }

  public async marksForDay(date: string) {
    const rows = await this.db.staffAttendance.findMany({ where: { date: asDate(date) } });
    return new Map<string, { status: StaffStatus; note: string | null }>(
      rows.map((r: any) => [r.teacherId, { status: r.status, note: r.note }]),
    );
  }

  public async validTeacherIds(ids: string[]) {
    const rows = await this.db.teacher.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
    return new Set<string>(rows.map((r: any) => r.id));
  }

  public async upsert(date: string, entries: MarkStaffDto['entries'], markedBy: string | undefined) {
    const coachingId = RequestContextService.getRequiredCoachingId();
    // An interactive transaction: the tenant database layer does not allow the batch form
    await this.db.$transaction(async (tx: any) => {
      for (const entry of entries) {
        await tx.staffAttendance.upsert({
          where: { teacherId_date: { teacherId: entry.teacherId, date: asDate(date) } },
          create: { coachingId, teacherId: entry.teacherId, date: asDate(date), status: entry.status, note: entry.note ?? null, markedBy },
          update: { status: entry.status, note: entry.note ?? null, markedBy },
        });
      }
    });
  }

  public async marksInRange(from: string, to: string) {
    const rows = await this.db.staffAttendance.findMany({
      where: { date: { gte: asDate(from), lte: asDate(to) } },
      select: { teacherId: true, status: true },
    });
    return rows as Array<{ teacherId: string; status: StaffStatus }>;
  }
}

/** First and last day of a YYYY-MM month */
export function monthBounds(month: string): { from: string; to: string } {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: `${month}-01`, to: end.toISOString().slice(0, 10) };
}

/** Pay for the days worked: present counts 1, half day 0.5, paid leave 1, absence 0 */
export function suggestedPay(monthlySalary: number | null, row: Pick<StaffMonthRow, 'present' | 'halfDay' | 'leave' | 'marked'>): number | null {
  if (monthlySalary === null || row.marked === 0) return null;
  const payableDays = row.present + row.halfDay * 0.5 + row.leave;
  return Math.round((monthlySalary * payableDays) / row.marked);
}

/** Staff (teacher) attendance: who came on which day, and what that means for their month's pay */
export class StaffAttendanceService {
  public constructor(private readonly repository: IStaffAttendanceRepository = new PrismaStaffAttendanceRepository()) {}

  public async forDay(date: string): Promise<StaffDayRow[]> {
    const [teachers, marks] = await Promise.all([this.repository.listTeachers(), this.repository.marksForDay(date)]);
    return teachers.map((t) => ({
      teacherId: t.id,
      name: t.name,
      status: marks.get(t.id)?.status ?? null,
      note: marks.get(t.id)?.note ?? null,
    }));
  }

  public async mark(dto: MarkStaffDto, userId?: string): Promise<{ saved: number }> {
    if (dto.date > todayInIndia()) {
      throw new AppError('DATE_IN_FUTURE', 'Attendance cannot be marked for a day that has not come', StatusCodes.BAD_REQUEST);
    }
    const ids = [...new Set(dto.entries.map((e) => e.teacherId))];
    const valid = await this.repository.validTeacherIds(ids);
    const unknown = ids.filter((id) => !valid.has(id));
    if (unknown.length > 0) {
      throw new AppError('TEACHER_NOT_FOUND', 'Some teachers were not found', StatusCodes.BAD_REQUEST, { teacherIds: unknown });
    }
    await this.repository.upsert(dto.date, dto.entries, userId);
    return { saved: dto.entries.length };
  }

  public async month(month: string): Promise<StaffMonthRow[]> {
    const { from, to } = monthBounds(month);
    const [teachers, marks] = await Promise.all([this.repository.listTeachers(), this.repository.marksInRange(from, to)]);
    return teachers.map((t) => {
      const mine = marks.filter((m) => m.teacherId === t.id);
      const count = (status: StaffStatus) => mine.filter((m) => m.status === status).length;
      const counts = { present: count('PRESENT'), halfDay: count('HALF_DAY'), absent: count('ABSENT'), leave: count('LEAVE'), marked: mine.length };
      return { teacherId: t.id, name: t.name, ...counts, monthlySalary: t.monthlySalary, suggestedAmount: suggestedPay(t.monthlySalary, counts) };
    });
  }
}
