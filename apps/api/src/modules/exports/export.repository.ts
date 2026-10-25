import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { dateRange, timestampRange } from '../reports/report.dates.js';

export interface StudentRow {
  readonly rollNumber: string | null;
  readonly name: string;
  readonly gender: string | null;
  readonly dob: Date | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly joiningDate: Date;
  readonly isActive: boolean;
  readonly batches: string[];
  readonly parents: Array<{ name: string; phone: string; relation: string }>;
}

export interface RegisterData {
  readonly batchName: string;
  readonly students: Array<{ id: string; name: string; rollNumber: string | null }>;
  /** One entry per class held in the month, as YYYY-MM-DD, with each student's status that day */
  readonly sessions: Array<{ date: string; statuses: Map<string, string> }>;
}

export interface PaymentRow {
  readonly paidAt: Date;
  readonly receiptNumber: string;
  readonly studentName: string;
  readonly installmentNo: number;
  readonly amount: number;
  readonly method: string;
  readonly remarks: string | null;
}

export interface SalaryRow {
  readonly paidAt: Date | null;
  readonly teacherName: string;
  readonly month: number;
  readonly year: number;
  readonly amount: number;
  readonly status: string;
  readonly method: string | null;
}

export interface ExpenseRow {
  readonly date: Date;
  readonly title: string;
  readonly category: string;
  readonly amount: number;
  readonly method: string;
  readonly remarks: string | null;
}

export interface TestsMatrix {
  readonly batchName: string;
  readonly students: Array<{ id: string; name: string; rollNumber: string | null }>;
  readonly tests: Array<{ id: string; title: string; subject: string; date: Date; totalMarks: number }>;
  readonly results: Map<string, { marks: number; absent: boolean }>;
}

export interface EnquiryExportRow {
  readonly createdAt: Date;
  readonly name: string;
  readonly phone: string;
  readonly studentName: string | null;
  readonly interestedIn: string | null;
  readonly source: string;
  readonly status: string;
  readonly followUpOn: Date | null;
  readonly lastContactedAt: Date | null;
  readonly notes: string | null;
}

export interface ExportRange {
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface IExportRepository {
  students(status: 'all' | 'active' | 'inactive'): Promise<StudentRow[]>;
  activeBatches(): Promise<Array<{ id: string; name: string }>>;
  register(batchId: string, month: string): Promise<RegisterData | null>;
  payments(range: ExportRange): Promise<PaymentRow[]>;
  salaries(range: ExportRange): Promise<SalaryRow[]>;
  expenses(range: ExportRange): Promise<ExpenseRow[]>;
  testsMatrix(batchId: string): Promise<TestsMatrix | null>;
  enquiries(status?: string): Promise<EnquiryExportRow[]>;
}

const asNumber = (value: unknown) => Number(value);
const fullName = (p: { firstName?: string | null; lastName?: string | null }) => [p.firstName, p.lastName].filter(Boolean).join(' ');

function monthRange(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { start, end };
}

export class PrismaExportRepository implements IExportRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  private get db(): any {
    return this.prisma as any;
  }

  public async students(status: 'all' | 'active' | 'inactive'): Promise<StudentRow[]> {
    const rows = await this.db.student.findMany({
      where: { deletedAt: null, ...(status === 'all' ? {} : { isActive: status === 'active' }) },
      include: {
        studentParents: { include: { parent: true } },
        batchStudents: { where: { leftAt: null }, include: { batch: { select: { name: true } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return rows.map((s: any) => ({
      rollNumber: s.rollNumber,
      name: fullName(s),
      gender: s.gender,
      dob: s.dob,
      phone: s.phone,
      email: s.email,
      address: s.address,
      joiningDate: s.joiningDate,
      isActive: s.isActive,
      batches: s.batchStudents.map((b: any) => b.batch.name),
      parents: s.studentParents.filter((sp: any) => !sp.parent.deletedAt).map((sp: any) => ({ name: sp.parent.name, phone: sp.parent.phone, relation: sp.parent.relation })),
    }));
  }

  public async activeBatches() {
    return this.db.batch.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  public async register(batchId: string, month: string): Promise<RegisterData | null> {
    const batch = await this.db.batch.findFirst({ where: { id: batchId, deletedAt: null }, select: { name: true } });
    if (!batch) return null;
    const { start, end } = monthRange(month);
    const [enrolled, sessions] = await Promise.all([
      this.db.batchStudent.findMany({
        where: { batchId, joinedAt: { lte: new Date(end.getTime() + 86_399_000) }, OR: [{ leftAt: null }, { leftAt: { gte: start } }], student: { deletedAt: null } },
        include: { student: { select: { id: true, firstName: true, lastName: true, rollNumber: true } } },
      }),
      this.db.attendanceSession.findMany({
        where: { batchId, deletedAt: null, sessionDate: { gte: start, lte: end } },
        include: { records: { select: { studentId: true, status: true } } },
        orderBy: { sessionDate: 'asc' },
      }),
    ]);
    const students = enrolled
      .map((e: any) => ({ id: e.student.id, name: fullName(e.student), rollNumber: e.student.rollNumber }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return {
      batchName: batch.name,
      students,
      sessions: sessions.map((s: any) => ({
        date: new Date(s.sessionDate).toISOString().slice(0, 10),
        statuses: new Map<string, string>(s.records.map((r: any) => [r.studentId, r.status])),
      })),
    };
  }

  public async payments(range: ExportRange): Promise<PaymentRow[]> {
    const rows = await this.db.feeTransaction.findMany({
      where: { deletedAt: null, paidAt: timestampRange(range) },
      include: { installment: { include: { feePlan: { include: { student: true } } } } },
      orderBy: { paidAt: 'asc' },
      take: 20000,
    });
    return rows.map((t: any) => ({
      paidAt: t.paidAt,
      receiptNumber: t.receiptNumber,
      studentName: fullName(t.installment.feePlan.student),
      installmentNo: t.installment.installmentNo,
      amount: asNumber(t.amount),
      method: t.paymentMethod,
      remarks: t.remarks,
    }));
  }

  public async salaries(range: ExportRange): Promise<SalaryRow[]> {
    const rows = await this.db.salary.findMany({
      where: { deletedAt: null, status: 'PAID', paidAt: timestampRange(range) },
      include: { teacher: { select: { name: true } } },
      orderBy: { paidAt: 'asc' },
    });
    return rows.map((s: any) => ({
      paidAt: s.paidAt,
      teacherName: s.teacher.name,
      month: s.month,
      year: s.year,
      amount: asNumber(s.amount),
      status: s.status,
      method: s.paymentMethod,
    }));
  }

  public async expenses(range: ExportRange): Promise<ExpenseRow[]> {
    const rows = await this.db.expense.findMany({
      where: { deletedAt: null, expenseDate: dateRange(range) },
      orderBy: { expenseDate: 'asc' },
      take: 20000,
    });
    return rows.map((e: any) => ({
      date: e.expenseDate,
      title: e.title,
      category: e.category,
      amount: asNumber(e.amount),
      method: e.paymentMethod,
      remarks: e.remarks,
    }));
  }

  public async testsMatrix(batchId: string): Promise<TestsMatrix | null> {
    const batch = await this.db.batch.findFirst({ where: { id: batchId, deletedAt: null }, select: { name: true } });
    if (!batch) return null;
    const [enrolled, tests] = await Promise.all([
      this.db.batchStudent.findMany({
        where: { batchId, student: { deletedAt: null } },
        include: { student: { select: { id: true, firstName: true, lastName: true, rollNumber: true } } },
      }),
      this.db.test.findMany({
        where: { batchId, deletedAt: null },
        include: { results: { select: { studentId: true, marksObtained: true, isAbsent: true } } },
        orderBy: { testDate: 'asc' },
      }),
    ]);
    const seen = new Set<string>();
    const students = enrolled
      .map((e: any) => ({ id: e.student.id, name: fullName(e.student), rollNumber: e.student.rollNumber }))
      .filter((s: any) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    const results = new Map<string, { marks: number; absent: boolean }>();
    for (const test of tests) {
      for (const r of test.results) results.set(`${test.id}:${r.studentId}`, { marks: asNumber(r.marksObtained), absent: r.isAbsent });
    }
    return {
      batchName: batch.name,
      students,
      tests: tests.map((t: any) => ({ id: t.id, title: t.title, subject: t.subject, date: t.testDate, totalMarks: asNumber(t.totalMarks) })),
      results,
    };
  }

  public async enquiries(status?: string): Promise<EnquiryExportRow[]> {
    const rows = await this.db.enquiry.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });
    return rows.map((e: any) => ({
      createdAt: e.createdAt,
      name: e.name,
      phone: e.phone,
      studentName: e.studentName,
      interestedIn: e.interestedIn,
      source: e.source,
      status: e.status,
      followUpOn: e.followUpOn,
      lastContactedAt: e.lastContactedAt,
      notes: e.notes,
    }));
  }
}
