/**
 * The rules of the student panel, as plain functions: how attendance is counted, what a student
 * may see of a notice, when a homework is late. No database here, so each rule can be tested.
 */

export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** MON..SUN for a YYYY-MM-DD, the way batches name their days */
export function weekdayCode(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
}

export type AttendanceStatusName = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceSummary {
  readonly present: number;
  readonly late: number;
  readonly absent: number;
  readonly excused: number;
  /** Classes that count: excused days count neither way, as in the institute's attendance report */
  readonly counted: number;
  /** Present and late as a share of the classes that count; null when none were marked */
  readonly percentage: number | null;
}

export function summariseAttendance(statuses: ReadonlyArray<AttendanceStatusName>): AttendanceSummary {
  const count = (status: AttendanceStatusName) => statuses.filter((s) => s === status).length;
  const present = count('PRESENT');
  const late = count('LATE');
  const absent = count('ABSENT');
  const counted = present + late + absent;
  return {
    present,
    late,
    absent,
    excused: count('EXCUSED'),
    counted,
    percentage: counted === 0 ? null : Math.round(((present + late) / counted) * 1000) / 10,
  };
}

export type HomeworkStatus = 'DONE' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

/** Where a homework stands for a student; dates are India days (YYYY-MM-DD) */
export function homeworkStatus(dueDay: string, done: boolean, today: string): HomeworkStatus {
  if (done) return 'DONE';
  if (dueDay < today) return 'OVERDUE';
  return dueDay === today ? 'DUE_TODAY' : 'UPCOMING';
}

/** Open work first (the nearest deadline at the top), finished work after it, newest first */
export function sortHomework<T extends { dueDate: string; status: HomeworkStatus }>(items: readonly T[]): T[] {
  const open = items.filter((i) => i.status !== 'DONE').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = items.filter((i) => i.status === 'DONE').sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return [...open, ...done];
}

export interface NoticeLike {
  readonly batchId: string | null;
  readonly targetAudience: string;
  readonly expiresAt: Date | null;
}

/** A student sees a notice meant for everyone or for students, from the whole institute or from their own batch, and not an ended one */
export function noticeVisibleToStudent(notice: NoticeLike, batchIds: ReadonlySet<string>, now: Date): boolean {
  if (notice.expiresAt && notice.expiresAt <= now) return false;
  if (notice.targetAudience !== 'ALL' && notice.targetAudience !== 'STUDENTS') return false;
  return notice.batchId === null || batchIds.has(notice.batchId);
}

export interface BatchLike {
  readonly daysOfWeek: readonly string[];
  readonly startTime: string | null;
}

/** The batches that meet on a day, earliest first */
export function classesOn<T extends BatchLike>(batches: readonly T[], day: string): T[] {
  const code = weekdayCode(day);
  return batches
    .filter((b) => b.daysOfWeek.includes(code))
    .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'));
}

/** Marks as a percentage of the total, to one decimal; 0 when the test has no total */
export function percentageOf(marks: number, total: number): number {
  return total > 0 ? Math.round((marks / total) * 1000) / 10 : 0;
}

/** The average of the percentages the student scored, ignoring tests they missed; null with none */
export function averagePercentage(percentages: readonly number[]): number | null {
  if (percentages.length === 0) return null;
  return Math.round((percentages.reduce((sum, p) => sum + p, 0) / percentages.length) * 10) / 10;
}
