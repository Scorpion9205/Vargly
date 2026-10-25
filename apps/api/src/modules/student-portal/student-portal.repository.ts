import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { studentIdFromEmail } from '../../common/security/student-login.js';
import type { AttendanceStatusName } from './student-portal.logic.js';

export interface PortalStudent {
  readonly id: string;
  readonly coachingId: string;
  readonly name: string;
  readonly rollNumber: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly joiningDate: Date;
  readonly loginId: string | null;
  readonly instituteName: string;
}

export interface PortalBatch {
  readonly id: string;
  readonly name: string;
  readonly subject: string | null;
  readonly daysOfWeek: string[];
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly teachers: string[];
}

export interface AttendanceDay {
  /** YYYY-MM-DD */
  readonly date: string;
  readonly status: AttendanceStatusName;
  readonly batchName: string;
}

export interface HomeworkRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** YYYY-MM-DD */
  readonly dueDate: string;
  readonly batchName: string;
  readonly attachmentUrl: string | null;
  readonly doneAt: Date | null;
}

export interface ResultRow {
  readonly testId: string;
  readonly title: string;
  readonly subject: string;
  readonly date: string;
  readonly batchName: string;
  readonly totalMarks: number;
  readonly passingMarks: number | null;
  readonly marks: number;
  readonly absent: boolean;
}

export interface ScoreRow {
  readonly testId: string;
  readonly studentId: string;
  readonly marks: number;
  readonly absent: boolean;
}

export interface MaterialRow {
  readonly shareId: string;
  readonly token: string;
  readonly kind: 'HOMEWORK' | 'PRACTICE' | 'MATERIAL';
  readonly title: string;
  readonly subject: string;
  readonly batchName: string;
  readonly sharedAt: Date;
}

export interface NoticeRow {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly isPinned: boolean;
  readonly batchId: string | null;
  readonly batchName: string | null;
  readonly targetAudience: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

export interface FeeInstallmentRow {
  readonly id: string;
  readonly installmentNo: number;
  readonly amount: number;
  readonly paidAmount: number;
  readonly dueDate: string;
  readonly status: string;
  readonly payments: Array<{ id: string; amount: number; paidAt: Date; receiptNumber: string }>;
}

export interface FeePlanRow {
  readonly id: string;
  readonly academicYear: string;
  readonly finalAmount: number;
  readonly installments: FeeInstallmentRow[];
}

export interface IStudentPortalRepository {
  findStudentByUserId(userId: string): Promise<PortalStudent | null>;
  batchesOf(studentId: string): Promise<PortalBatch[]>;
  attendanceBetween(studentId: string, from: string, to: string): Promise<AttendanceDay[]>;
  allAttendanceStatuses(studentId: string): Promise<AttendanceStatusName[]>;
  /** Homework of the student's batches due on or after the day, with whether they marked it done */
  homework(studentId: string, batchIds: string[], dueFrom: string): Promise<HomeworkRow[]>;
  /** False when the homework is not one of the student's batches' (so nothing is written) */
  setHomeworkDone(studentId: string, batchIds: string[], homeworkId: string, done: boolean): Promise<boolean>;
  results(studentId: string, limit: number): Promise<ResultRow[]>;
  scoresOfTests(testIds: string[]): Promise<ScoreRow[]>;
  materials(batchIds: string[], limit: number): Promise<MaterialRow[]>;
  notices(batchIds: string[], limit: number): Promise<NoticeRow[]>;
  fees(studentId: string): Promise<FeePlanRow[]>;
  /** The institute's switches for the panel and its attendance warning level */
  portalSettings(): Promise<{ enabled: boolean; showFees: boolean; doubts: boolean; attendanceThreshold: number }>;
}

const asDay = (value: string) => new Date(`${value}T00:00:00Z`);
const dayOf = (value: Date) => new Date(value).toISOString().slice(0, 10);
const fullName = (s: { firstName: string; lastName: string }) => [s.firstName, s.lastName].filter(Boolean).join(' ');

export class PrismaStudentPortalRepository implements IStudentPortalRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  public async findStudentByUserId(userId: string): Promise<PortalStudent | null> {
    const student = await this.db.student.findFirst({
      where: { userId, deletedAt: null, isActive: true },
      include: { user: { select: { email: true } }, coaching: { select: { name: true } } },
    });
    if (!student) return null;
    return {
      id: student.id,
      coachingId: student.coachingId,
      name: fullName(student),
      rollNumber: student.rollNumber,
      phone: student.phone,
      email: student.email,
      joiningDate: student.joiningDate,
      loginId: student.user ? studentIdFromEmail(student.user.email) : null,
      instituteName: student.coaching?.name ?? 'Your institute',
    };
  }

  public async batchesOf(studentId: string): Promise<PortalBatch[]> {
    const rows = await this.db.batchStudent.findMany({
      where: { studentId, leftAt: null, batch: { deletedAt: null, isActive: true } },
      include: {
        batch: { include: { teacherBatches: { include: { teacher: { select: { name: true, isActive: true } } } } } },
      },
    });
    return rows.map((r: any) => ({
      id: r.batch.id,
      name: r.batch.name,
      subject: r.batch.subject,
      daysOfWeek: r.batch.daysOfWeek ?? [],
      startTime: r.batch.startTime,
      endTime: r.batch.endTime,
      teachers: r.batch.teacherBatches.filter((t: any) => t.teacher.isActive).map((t: any) => t.teacher.name),
    }));
  }

  public async attendanceBetween(studentId: string, from: string, to: string): Promise<AttendanceDay[]> {
    const rows = await this.db.attendanceRecord.findMany({
      where: { studentId, session: { deletedAt: null, sessionDate: { gte: asDay(from), lte: asDay(to) } } },
      include: { session: { select: { sessionDate: true, batch: { select: { name: true } } } } },
      orderBy: { session: { sessionDate: 'asc' } },
    });
    return rows.map((r: any) => ({ date: dayOf(r.session.sessionDate), status: r.status, batchName: r.session.batch.name }));
  }

  public async allAttendanceStatuses(studentId: string): Promise<AttendanceStatusName[]> {
    const rows = await this.db.attendanceRecord.findMany({
      where: { studentId, session: { deletedAt: null } },
      select: { status: true },
    });
    return rows.map((r: any) => r.status);
  }

  public async homework(studentId: string, batchIds: string[], dueFrom: string): Promise<HomeworkRow[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.homework.findMany({
      where: { batchId: { in: batchIds }, deletedAt: null, dueDate: { gte: asDay(dueFrom) } },
      include: { batch: { select: { name: true } }, completions: { where: { studentId }, select: { doneAt: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
    return rows.map((h: any) => ({
      id: h.id,
      title: h.title,
      description: h.description,
      dueDate: dayOf(h.dueDate),
      batchName: h.batch.name,
      attachmentUrl: h.attachmentUrl,
      doneAt: h.completions[0]?.doneAt ?? null,
    }));
  }

  public async setHomeworkDone(studentId: string, batchIds: string[], homeworkId: string, done: boolean): Promise<boolean> {
    if (batchIds.length === 0) return false;
    const coachingId = (await this.db.student.findFirst({ where: { id: studentId }, select: { coachingId: true } }))?.coachingId;
    const homework = await this.db.homework.findFirst({ where: { id: homeworkId, batchId: { in: batchIds }, deletedAt: null }, select: { id: true } });
    if (!homework || !coachingId) return false;
    if (done) {
      await this.db.homeworkCompletion.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId } },
        create: { coachingId, homeworkId, studentId },
        update: {},
      });
    } else {
      await this.db.homeworkCompletion.deleteMany({ where: { homeworkId, studentId } });
    }
    return true;
  }

  public async results(studentId: string, limit: number): Promise<ResultRow[]> {
    const rows = await this.db.testResult.findMany({
      where: { studentId, test: { deletedAt: null } },
      include: { test: { include: { batch: { select: { name: true } } } } },
      orderBy: { test: { testDate: 'desc' } },
      take: limit,
    });
    return rows.map((r: any) => ({
      testId: r.test.id,
      title: r.test.title,
      subject: r.test.subject,
      date: dayOf(r.test.testDate),
      batchName: r.test.batch.name,
      totalMarks: Number(r.test.totalMarks),
      passingMarks: r.test.passingMarks === null ? null : Number(r.test.passingMarks),
      marks: Number(r.marksObtained),
      absent: r.isAbsent,
    }));
  }

  public async scoresOfTests(testIds: string[]): Promise<ScoreRow[]> {
    if (testIds.length === 0) return [];
    const rows = await this.db.testResult.findMany({
      where: { testId: { in: testIds } },
      select: { testId: true, studentId: true, marksObtained: true, isAbsent: true },
    });
    return rows.map((r: any) => ({ testId: r.testId, studentId: r.studentId, marks: Number(r.marksObtained), absent: r.isAbsent }));
  }

  public async materials(batchIds: string[], limit: number): Promise<MaterialRow[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.paperShare.findMany({
      where: { batchId: { in: batchIds }, paper: { deletedAt: null } },
      include: { paper: { select: { title: true, subject: true } }, batch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((s: any) => ({
      shareId: s.id,
      token: s.token,
      kind: s.kind,
      title: s.paper.title,
      subject: s.paper.subject,
      batchName: s.batch.name,
      sharedAt: s.createdAt,
    }));
  }

  public async notices(batchIds: string[], limit: number): Promise<NoticeRow[]> {
    const rows = await this.db.notice.findMany({
      where: {
        deletedAt: null,
        targetAudience: { in: ['ALL', 'STUDENTS'] },
        OR: [{ batchId: null }, { batchId: { in: batchIds } }],
      },
      include: { batch: { select: { name: true } } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map((n: any) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      isPinned: n.isPinned,
      batchId: n.batchId,
      batchName: n.batch?.name ?? null,
      targetAudience: n.targetAudience,
      expiresAt: n.expiresAt,
      createdAt: n.createdAt,
    }));
  }

  public async fees(studentId: string): Promise<FeePlanRow[]> {
    const plans = await this.db.feePlan.findMany({
      where: { studentId, deletedAt: null },
      include: {
        installments: {
          where: { deletedAt: null },
          orderBy: { installmentNo: 'asc' },
          include: { transactions: { where: { deletedAt: null }, orderBy: { paidAt: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return plans.map((p: any) => ({
      id: p.id,
      academicYear: p.academicYear,
      finalAmount: Number(p.finalAmount),
      installments: p.installments.map((i: any) => ({
        id: i.id,
        installmentNo: i.installmentNo,
        amount: Number(i.amount),
        paidAmount: Number(i.paidAmount),
        dueDate: dayOf(i.dueDate),
        status: i.status,
        payments: i.transactions.map((t: any) => ({ id: t.id, amount: Number(t.amount), paidAt: t.paidAt, receiptNumber: t.receiptNumber })),
      })),
    }));
  }

  public async portalSettings(): Promise<{ enabled: boolean; showFees: boolean; doubts: boolean; attendanceThreshold: number }> {
    const setting = await this.db.setting.findFirst({ select: { config: true } });
    const config = (setting?.config && typeof setting.config === 'object' ? setting.config : {}) as Record<string, any>;
    return {
      enabled: config.studentPortal?.enabled !== false,
      showFees: config.studentPortal?.showFees === true,
      doubts: config.studentPortal?.doubts === true,
      attendanceThreshold: typeof config.attendanceThreshold === 'number' ? config.attendanceThreshold : 75,
    };
  }
}
