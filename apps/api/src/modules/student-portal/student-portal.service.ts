import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { receiptLink } from '../fees/receipt-link.js';
import { publicLink } from '../papers/paper.service.js';
import { todayInIndia } from '../reports/report.dates.js';
import { classStandings } from '../tests/test-ranking.js';
import {
  AttendanceSummary,
  averagePercentage,
  classesOn,
  homeworkStatus,
  HomeworkStatus,
  noticeVisibleToStudent,
  percentageOf,
  sortHomework,
  summariseAttendance,
} from './student-portal.logic.js';
import type { IStudentPortalRepository, PortalBatch, PortalStudent, ResultRow } from './student-portal.repository.js';

type PortalSettings = Awaited<ReturnType<IStudentPortalRepository['portalSettings']>>;

export const attendanceQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM').optional(),
});
export const homeworkDoneSchema = z.object({ done: z.boolean() });

/** How far back a homework still shows (so a recent miss is not hidden), and how many results and notices */
const HOMEWORK_LOOKBACK_DAYS = 30;
const RESULT_LIMIT = 60;
const MATERIAL_LIMIT = 100;
const NOTICE_LIMIT = 50;

export interface PortalResult {
  readonly testId: string;
  readonly title: string;
  readonly subject: string;
  readonly date: string;
  readonly batchName: string;
  readonly marks: number;
  readonly totalMarks: number;
  readonly percentage: number;
  readonly absent: boolean;
  /** Whether the pass mark was reached; null when the test has none */
  readonly passed: boolean | null;
  /** Where the student stands in the class: their own rank and the average, never anyone else's marks */
  readonly standing: { readonly rank: number; readonly outOf: number; readonly classAveragePercentage: number } | null;
}

export interface PortalHomework {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dueDate: string;
  readonly batchName: string;
  readonly attachmentUrl: string | null;
  readonly status: HomeworkStatus;
  readonly doneAt: Date | null;
}

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthBounds(month: string): { from: string; to: string } {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: `${month}-01`, to: end.toISOString().slice(0, 10) };
}

/** What a signed-in student sees: only their own records, shaped for the panel */
export class StudentPortalService {
  public constructor(
    private readonly repository: IStudentPortalRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private today(): string {
    return todayInIndia(this.clock());
  }

  public async settings() {
    return this.repository.portalSettings();
  }

  public async profile(student: PortalStudent) {
    const batches = await this.repository.batchesOf(student.id);
    return {
      institute: student.instituteName,
      name: student.name,
      loginId: student.loginId,
      rollNumber: student.rollNumber,
      phone: student.phone,
      email: student.email,
      joiningDate: student.joiningDate,
      batches: batches.map((b) => ({ id: b.id, name: b.name, subject: b.subject })),
    };
  }

  public async schedule(student: PortalStudent): Promise<PortalBatch[]> {
    return this.repository.batchesOf(student.id);
  }

  /** `known` lets a caller that already read the institute's settings pass them in, instead of reading them again */
  public async attendance(student: PortalStudent, month?: string, known?: PortalSettings) {
    const today = this.today();
    const chosen = month ?? today.slice(0, 7);
    const { from, to } = monthBounds(chosen);
    const [days, allStatuses, settings] = await Promise.all([
      this.repository.attendanceBetween(student.id, from, to),
      this.repository.allAttendanceStatuses(student.id),
      known ?? this.repository.portalSettings(),
    ]);
    const overall = summariseAttendance(allStatuses);
    return {
      month: chosen,
      days,
      summary: summariseAttendance(days.map((d) => d.status)),
      overall,
      threshold: settings.attendanceThreshold,
      belowThreshold: overall.percentage !== null && overall.percentage < settings.attendanceThreshold,
    };
  }

  public async homework(student: PortalStudent, known?: PortalBatch[]): Promise<PortalHomework[]> {
    const today = this.today();
    const batches = known ?? (await this.repository.batchesOf(student.id));
    const rows = await this.repository.homework(student.id, batches.map((b) => b.id), shiftDay(today, -HOMEWORK_LOOKBACK_DAYS));
    return sortHomework(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        dueDate: row.dueDate,
        batchName: row.batchName,
        attachmentUrl: row.attachmentUrl,
        status: homeworkStatus(row.dueDate, row.doneAt !== null, today),
        doneAt: row.doneAt,
      })),
    );
  }

  public async markHomework(student: PortalStudent, homeworkId: string, done: boolean): Promise<void> {
    const batches = await this.repository.batchesOf(student.id);
    const found = await this.repository.setHomeworkDone(student.id, batches.map((b) => b.id), homeworkId, done);
    if (!found) throw new AppError('HOMEWORK_NOT_FOUND', 'Homework not found', StatusCodes.NOT_FOUND);
  }

  public async results(student: PortalStudent) {
    const rows = await this.repository.results(student.id, RESULT_LIMIT);
    const scores = await this.repository.scoresOfTests(rows.map((r) => r.testId));
    const results = rows.map((row) => this.shapeResult(row, student.id, scores));
    const sat = results.filter((r) => !r.absent);
    return {
      results,
      summary: {
        tests: sat.length,
        averagePercentage: averagePercentage(sat.map((r) => r.percentage)),
      },
    };
  }

  private shapeResult(row: ResultRow, studentId: string, scores: Awaited<ReturnType<IStudentPortalRepository['scoresOfTests']>>): PortalResult {
    const standings = classStandings(
      scores.filter((s) => s.testId === row.testId).map((s) => ({ studentId: s.studentId, marksObtained: s.marks, isAbsent: s.absent })),
      row.totalMarks,
    );
    const standing = row.absent ? undefined : standings.get(studentId);
    return {
      testId: row.testId,
      title: row.title,
      subject: row.subject,
      date: row.date,
      batchName: row.batchName,
      marks: row.marks,
      totalMarks: row.totalMarks,
      percentage: row.absent ? 0 : percentageOf(row.marks, row.totalMarks),
      absent: row.absent,
      passed: row.absent || row.passingMarks === null ? null : row.marks >= row.passingMarks,
      standing: standing ? { rank: standing.rank, outOf: standing.outOf, classAveragePercentage: standing.averagePercentage } : null,
    };
  }

  public async materials(student: PortalStudent) {
    const batches = await this.repository.batchesOf(student.id);
    const rows = await this.repository.materials(batches.map((b) => b.id), MATERIAL_LIMIT);
    return rows.map((m) => ({
      id: m.shareId,
      title: m.title,
      subject: m.subject,
      kind: m.kind,
      batchName: m.batchName,
      sharedAt: m.sharedAt,
      link: publicLink(m.token),
    }));
  }

  public async notices(student: PortalStudent, known?: PortalBatch[]) {
    const batches = known ?? (await this.repository.batchesOf(student.id));
    const batchIds = new Set(batches.map((b) => b.id));
    const now = this.clock();
    const rows = await this.repository.notices([...batchIds], NOTICE_LIMIT);
    return rows
      .filter((n) => noticeVisibleToStudent(n, batchIds, now))
      .map((n) => ({ id: n.id, title: n.title, content: n.content, isPinned: n.isPinned, batchName: n.batchName, createdAt: n.createdAt }));
  }

  /** Fees are the institute's to show: they are hidden from students until the owner switches them on */
  public async fees(student: PortalStudent, known?: PortalSettings) {
    const settings = known ?? (await this.repository.portalSettings());
    if (!settings.showFees) {
      throw new AppError('FEES_HIDDEN', 'Your institute has not made fee details available here', StatusCodes.FORBIDDEN);
    }
    const today = this.today();
    const plans = await this.repository.fees(student.id);
    const shaped = plans.map((plan) => ({
      id: plan.id,
      academicYear: plan.academicYear,
      total: plan.finalAmount,
      installments: plan.installments.map((i) => {
        const waived = i.status === 'WAIVED';
        const balance = waived ? 0 : Math.max(0, Math.round((i.amount - i.paidAmount) * 100) / 100);
        return {
          id: i.id,
          number: i.installmentNo,
          amount: i.amount,
          paid: i.paidAmount,
          balance,
          dueDate: i.dueDate,
          status: i.status,
          overdue: balance > 0 && i.dueDate < today,
          payments: i.payments.map((p) => ({ amount: p.amount, paidAt: p.paidAt, receiptNumber: p.receiptNumber, receiptLink: receiptLink(p.id) })),
        };
      }),
    }));
    const all = shaped.flatMap((p) => p.installments);
    return {
      plans: shaped,
      totals: {
        balance: Math.round(all.reduce((sum, i) => sum + i.balance, 0) * 100) / 100,
        overdue: Math.round(all.filter((i) => i.overdue).reduce((sum, i) => sum + i.balance, 0) * 100) / 100,
      },
    };
  }

  /** The home screen: a bit of everything, in one request */
  public async overview(student: PortalStudent) {
    const today = this.today();
    // The batches and the institute's settings are read once and shared by every part of the screen
    const [settings, batches] = await Promise.all([this.repository.portalSettings(), this.repository.batchesOf(student.id)]);
    const [attendance, homework, results, notices] = await Promise.all([
      this.attendance(student, undefined, settings),
      this.homework(student, batches),
      this.results(student),
      this.notices(student, batches),
    ]);
    const open = homework.filter((h) => h.status !== 'DONE');
    const fees = settings.showFees ? await this.fees(student, settings) : null;
    const nextDue = fees?.plans
      .flatMap((p) => p.installments)
      .filter((i) => i.balance > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

    return {
      student: { name: student.name, rollNumber: student.rollNumber, institute: student.instituteName },
      today,
      classesToday: classesOn(batches, today).map((b) => ({
        id: b.id,
        name: b.name,
        subject: b.subject,
        startTime: b.startTime,
        endTime: b.endTime,
        teachers: b.teachers,
      })),
      attendance: {
        thisMonth: attendance.summary as AttendanceSummary,
        overall: attendance.overall as AttendanceSummary,
        threshold: attendance.threshold,
        belowThreshold: attendance.belowThreshold,
      },
      homework: {
        open: open.length,
        overdue: open.filter((h) => h.status === 'OVERDUE').length,
        next: open.slice(0, 3),
      },
      latestResult: results.results[0] ?? null,
      averagePercentage: results.summary.averagePercentage,
      notices: notices.slice(0, 3),
      fees: fees ? { balance: fees.totals.balance, overdue: fees.totals.overdue, nextDue: nextDue ? { amount: nextDue.balance, dueDate: nextDue.dueDate } : null } : null,
      showFees: settings.showFees,
      doubtsEnabled: settings.doubts,
    };
  }
}
