import ExcelJS from 'exceljs';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import type { ReportService } from '../reports/report.service.js';
import type { StaffAttendanceService } from '../staff-attendance/staff-attendance.service.js';
import {
  ExportRange,
  IExportRepository,
  PrismaExportRepository,
  RegisterData,
  TestsMatrix,
} from './export.repository.js';
import { addSummarySheet, addTableSheet, Column, newWorkbook, safeSheetName, toBuffer } from './xlsx-helpers.js';

export const EXPORT_KINDS = [
  'students',
  'attendance-register',
  'attendance-summary',
  'fees',
  'profit-loss',
  'tests',
  'enquiries',
  'staff-attendance',
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportParams {
  readonly status?: string;
  readonly month?: string;
  readonly batchId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly threshold?: number;
}

export interface ExportFile {
  readonly buffer: Buffer;
  readonly fileName: string;
}

const MAX_BATCH_SHEETS = 40;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LABEL: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  ONLINE: 'Online',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone call',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  OTHER: 'Other',
  ONLINE_FORM: 'Online form',
  NEW: 'New',
  CONTACTED: 'Called',
  ADMITTED: 'Admitted',
  NOT_INTERESTED: 'Not interested',
};
const label = (value: string | null | undefined) => (value ? (LABEL[value] ?? value) : '');

function periodText(range: ExportRange): string {
  if (range.startDate && range.endDate) return `${range.startDate} to ${range.endDate}`;
  if (range.startDate) return `from ${range.startDate}`;
  if (range.endDate) return `up to ${range.endDate}`;
  return 'all time';
}

function fileSafe(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'export';
}

/** P, A, L or E for a day; blank when the student was not on the register that day */
const SYMBOL: Record<string, string> = { PRESENT: 'P', ABSENT: 'A', LATE: 'L', EXCUSED: 'E' };

export interface RegisterTotals {
  readonly present: number;
  readonly absent: number;
  readonly late: number;
  readonly excused: number;
  /** Present and late days as a share of the days that count; null when none were marked */
  readonly percentage: number | null;
}

/** Excused days count neither way, as in the attendance report */
export function registerTotals(statuses: ReadonlyArray<string | undefined>): RegisterTotals {
  const count = (status: string) => statuses.filter((s) => s === status).length;
  const present = count('PRESENT');
  const late = count('LATE');
  const absent = count('ABSENT');
  const counted = present + late + absent;
  return {
    present,
    absent,
    late,
    excused: count('EXCUSED'),
    percentage: counted === 0 ? null : Math.round(((present + late) / counted) * 1000) / 10,
  };
}

export function addRegisterSheet(workbook: ExcelJS.Workbook, data: RegisterData, month: string): ExcelJS.Worksheet {
  const dayColumns: Column<RegisterData['students'][number]>[] = data.sessions.map((session) => {
    const date = new Date(`${session.date}T00:00:00Z`);
    return {
      header: `${date.getUTCDate()} ${WEEKDAY[date.getUTCDay()]}`,
      format: 'center' as const,
      width: 6,
      value: (student) => SYMBOL[session.statuses.get(student.id) ?? ''] ?? '',
    };
  });
  const totals = (student: RegisterData['students'][number]) => registerTotals(data.sessions.map((s) => s.statuses.get(student.id)));
  const columns: Column<RegisterData['students'][number]>[] = [
    { header: 'Roll no.', value: (s) => s.rollNumber, width: 10 },
    { header: 'Student', value: (s) => s.name, width: 28 },
    ...dayColumns,
    { header: 'Present', value: (s) => totals(s).present, format: 'number', width: 9 },
    { header: 'Late', value: (s) => totals(s).late, format: 'number', width: 7 },
    { header: 'Absent', value: (s) => totals(s).absent, format: 'number', width: 8 },
    { header: 'Excused', value: (s) => totals(s).excused, format: 'number', width: 9 },
    { header: 'Attendance %', value: (s) => totals(s).percentage, format: 'percent', width: 14 },
  ];
  const sheet = addTableSheet(workbook, data.batchName, columns, data.students, { heading: `${data.batchName}: attendance for ${month}` });
  // Absences stand out in red
  sheet.eachRow((row, number) => {
    if (number < 4) return;
    row.eachCell((cell, column) => {
      if (column > 2 && column <= 2 + data.sessions.length && cell.value === 'A') cell.font = { bold: true, color: { argb: 'FFC62828' } };
    });
  });
  sheet.addRow([]);
  sheet.addRow(['P present, L late, A absent, E excused. Blank: not on the register that day.']).font = { italic: true, color: { argb: 'FF666666' } };
  return sheet;
}

export function addTestsSheet(workbook: ExcelJS.Workbook, data: TestsMatrix): ExcelJS.Worksheet {
  const testColumns: Column<TestsMatrix['students'][number]>[] = data.tests.map((test) => ({
    header: `${test.title} (${test.subject}, ${test.date.toISOString().slice(0, 10)}) /${test.totalMarks}`,
    format: 'number' as const,
    width: 18,
    value: (student) => {
      const result = data.results.get(`${test.id}:${student.id}`);
      return result === undefined ? '' : result.absent ? 'Absent' : result.marks;
    },
  }));
  const columns: Column<TestsMatrix['students'][number]>[] = [
    { header: 'Roll no.', value: (s) => s.rollNumber, width: 10 },
    { header: 'Student', value: (s) => s.name, width: 28 },
    ...testColumns,
  ];
  return addTableSheet(workbook, data.batchName, columns, data.students, { heading: `${data.batchName}: test marks` });
}

/** Excel downloads for the owner: student details, attendance, fees, profit and loss, marks, enquiries and staff */
export class ExportService {
  public constructor(
    private readonly repository: IExportRepository = new PrismaExportRepository(),
    private readonly reports?: Pick<ReportService, 'generateFeeReport' | 'generateAttendanceReport' | 'generateProfitLossReport'>,
    private readonly staff?: Pick<StaffAttendanceService, 'month'>,
  ) {}

  public async build(kind: ExportKind, params: ExportParams, coachingId: string, userId?: string): Promise<ExportFile> {
    switch (kind) {
      case 'students':
        return this.students(params);
      case 'attendance-register':
        return this.attendanceRegister(params);
      case 'attendance-summary':
        return this.attendanceSummary(params, coachingId, userId);
      case 'fees':
        return this.fees(params, coachingId, userId);
      case 'profit-loss':
        return this.profitLoss(params, coachingId, userId);
      case 'tests':
        return this.tests(params);
      case 'enquiries':
        return this.enquiries(params);
      case 'staff-attendance':
        return this.staffAttendance(params);
    }
  }

  private async students(params: ExportParams): Promise<ExportFile> {
    const status = params.status === 'active' || params.status === 'inactive' ? params.status : 'all';
    const rows = await this.repository.students(status);
    const workbook = newWorkbook('Students');
    addTableSheet(
      workbook,
      'Students',
      [
        { header: 'Roll no.', value: (s) => s.rollNumber, width: 10 },
        { header: 'Name', value: (s) => s.name, width: 26 },
        { header: 'Status', value: (s) => (s.isActive ? 'Active' : 'Left') },
        { header: 'Batches', value: (s) => s.batches.join(', '), width: 30 },
        { header: 'Gender', value: (s) => s.gender },
        { header: 'Date of birth', value: (s) => s.dob, format: 'date' },
        { header: 'Phone', value: (s) => s.phone },
        { header: 'Email', value: (s) => s.email },
        { header: 'Address', value: (s) => s.address, width: 34 },
        { header: 'Joined on', value: (s) => s.joiningDate, format: 'date' },
        { header: 'Parent', value: (s) => s.parents.map((p) => p.name).join(', '), width: 26 },
        { header: 'Parent phone', value: (s) => s.parents.map((p) => p.phone).join(', '), width: 26 },
      ],
      rows,
      { heading: `Students (${status === 'all' ? 'all' : status}): ${rows.length}` },
    );
    return { buffer: await toBuffer(workbook), fileName: `students-${status}.xlsx` };
  }

  private async attendanceRegister(params: ExportParams): Promise<ExportFile> {
    const month = params.month;
    if (!month) throw new AppError('MONTH_REQUIRED', 'Choose a month (YYYY-MM)', StatusCodes.BAD_REQUEST);
    const workbook = newWorkbook('Attendance register');

    const batches = params.batchId ? [{ id: params.batchId, name: '' }] : (await this.repository.activeBatches()).slice(0, MAX_BATCH_SHEETS);
    let written = 0;
    for (const batch of batches) {
      const data = await this.repository.register(batch.id, month);
      if (!data) {
        if (params.batchId) throw new AppError('BATCH_NOT_FOUND', 'Batch not found', StatusCodes.NOT_FOUND);
        continue;
      }
      addRegisterSheet(workbook, data, month);
      written += 1;
    }
    if (written === 0) workbook.addWorksheet('Attendance').addRow(['There are no batches to show.']);
    return { buffer: await toBuffer(workbook), fileName: `attendance-register-${month}.xlsx` };
  }

  private async attendanceSummary(params: ExportParams, coachingId: string, userId?: string): Promise<ExportFile> {
    if (!this.reports) throw new AppError('NOT_AVAILABLE', 'Reports are not set up', StatusCodes.NOT_IMPLEMENTED);
    const range = { startDate: params.startDate, endDate: params.endDate };
    const { data } = await this.reports.generateAttendanceReport(coachingId, { ...range, batchId: params.batchId, threshold: params.threshold }, userId);
    const workbook = newWorkbook('Attendance summary');
    addSummarySheet(workbook, 'Summary', `Attendance summary, ${periodText(range)}`, [
      { label: 'Classes held', value: data.totalSessions, format: 'number' },
      { label: 'Average attendance', value: data.averageAttendancePercentage, format: 'percent' },
      { label: 'Warning level', value: data.threshold, format: 'percent' },
      { label: 'Students below the warning level', value: data.defaultersCount, format: 'number' },
    ]);
    const columns: Column<(typeof data.students)[number]>[] = [
      { header: 'Student', value: (s) => s.studentName, width: 28 },
      { header: 'Batch', value: (s) => s.batchName, width: 24 },
      { header: 'Classes', value: (s) => s.totalClasses, format: 'number' },
      { header: 'Attended', value: (s) => s.attendedClasses, format: 'number' },
      { header: 'Attendance %', value: (s) => s.percentage, format: 'percent', width: 14 },
    ];
    addTableSheet(workbook, 'All students', columns, data.students);
    addTableSheet(workbook, 'Below warning level', columns, data.defaulters);
    return { buffer: await toBuffer(workbook), fileName: 'attendance-summary.xlsx' };
  }

  private async fees(params: ExportParams, coachingId: string, userId?: string): Promise<ExportFile> {
    if (!this.reports) throw new AppError('NOT_AVAILABLE', 'Reports are not set up', StatusCodes.NOT_IMPLEMENTED);
    const range = { startDate: params.startDate, endDate: params.endDate };
    const [{ data }, payments] = await Promise.all([this.reports.generateFeeReport(coachingId, range, userId), this.repository.payments(range)]);
    const workbook = newWorkbook('Fees');
    addSummarySheet(workbook, 'Summary', 'Fees summary (all fee plans)', [
      { label: 'Fees expected', value: data.totalExpected, format: 'money' },
      { label: 'Collected', value: data.totalCollected, format: 'money' },
      { label: 'Waived', value: data.totalWaived, format: 'money' },
      { label: 'Still to collect', value: data.totalPending, format: 'money' },
      { label: 'Overdue', value: data.totalOverdue, format: 'money' },
      { label: 'Collection', value: data.collectionPercentage, format: 'percent' },
      { label: 'Students with overdue fees', value: data.defaulterCount, format: 'number' },
    ]);
    addTableSheet(
      workbook,
      'Overdue',
      [
        { header: 'Student', value: (d) => d.studentName, width: 28 },
        { header: 'Parent', value: (d) => d.parentName, width: 24 },
        { header: 'Parent phone', value: (d) => d.parentPhone, width: 16 },
        { header: 'Student phone', value: (d) => d.studentPhone, width: 16 },
        { header: 'Overdue amount', value: (d) => d.pendingAmount, format: 'money', width: 16 },
        { header: 'Days overdue', value: (d) => d.overdueDays, format: 'number' },
        { header: 'Oldest due date', value: (d) => d.installmentDueDate, format: 'date', width: 16 },
      ],
      data.defaulters,
      { heading: 'Students with overdue fees' },
    );
    addTableSheet(
      workbook,
      'Payments',
      [
        { header: 'Date', value: (p) => p.paidAt, format: 'date' },
        { header: 'Receipt no.', value: (p) => p.receiptNumber, width: 22 },
        { header: 'Student', value: (p) => p.studentName, width: 28 },
        { header: 'Instalment', value: (p) => p.installmentNo, format: 'number' },
        { header: 'Amount', value: (p) => p.amount, format: 'money', width: 14 },
        { header: 'Paid by', value: (p) => label(p.method) },
        { header: 'Note', value: (p) => p.remarks, width: 30 },
      ],
      payments,
      { heading: `Payments received, ${periodText(range)}` },
    );
    return { buffer: await toBuffer(workbook), fileName: 'fees-report.xlsx' };
  }

  private async profitLoss(params: ExportParams, coachingId: string, userId?: string): Promise<ExportFile> {
    if (!this.reports) throw new AppError('NOT_AVAILABLE', 'Reports are not set up', StatusCodes.NOT_IMPLEMENTED);
    const range = { startDate: params.startDate, endDate: params.endDate };
    const [{ data }, payments, salaries, expenses] = await Promise.all([
      this.reports.generateProfitLossReport(coachingId, range, userId),
      this.repository.payments(range),
      this.repository.salaries(range),
      this.repository.expenses(range),
    ]);
    const workbook = newWorkbook('Profit and loss');
    addSummarySheet(workbook, 'Summary', `Profit and loss, ${periodText(range)}`, [
      { label: 'Fees collected', value: data.totalRevenue, format: 'money' },
      { label: 'Teacher salaries', value: data.teacherSalaryExpenses, format: 'money' },
      { label: 'Other expenses', value: data.generalExpenses, format: 'money' },
      { label: 'Total expenses', value: data.totalExpenses, format: 'money' },
      { label: 'Profit', value: data.netProfit, format: 'money' },
      { label: 'Profit margin', value: data.profitMarginPercentage, format: 'percent' },
    ]);

    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    addTableSheet(
      workbook,
      'Expenses by category',
      [
        { header: 'Category', value: (r: [string, number]) => r[0], width: 28 },
        { header: 'Amount', value: (r) => r[1], format: 'money', width: 16 },
      ],
      [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    );
    addTableSheet(
      workbook,
      'Fees collected',
      [
        { header: 'Date', value: (p) => p.paidAt, format: 'date' },
        { header: 'Receipt no.', value: (p) => p.receiptNumber, width: 22 },
        { header: 'Student', value: (p) => p.studentName, width: 28 },
        { header: 'Amount', value: (p) => p.amount, format: 'money', width: 14 },
        { header: 'Paid by', value: (p) => label(p.method) },
      ],
      payments,
    );
    addTableSheet(
      workbook,
      'Salaries paid',
      [
        { header: 'Paid on', value: (s) => s.paidAt, format: 'date' },
        { header: 'Teacher', value: (s) => s.teacherName, width: 26 },
        { header: 'For month', value: (s) => `${String(s.month).padStart(2, '0')}/${s.year}` },
        { header: 'Amount', value: (s) => s.amount, format: 'money', width: 14 },
        { header: 'Paid by', value: (s) => label(s.method) },
      ],
      salaries,
    );
    addTableSheet(
      workbook,
      'Expenses',
      [
        { header: 'Date', value: (e) => e.date, format: 'date' },
        { header: 'Title', value: (e) => e.title, width: 30 },
        { header: 'Category', value: (e) => e.category, width: 20 },
        { header: 'Amount', value: (e) => e.amount, format: 'money', width: 14 },
        { header: 'Paid by', value: (e) => label(e.method) },
        { header: 'Note', value: (e) => e.remarks, width: 30 },
      ],
      expenses,
    );
    return { buffer: await toBuffer(workbook), fileName: 'profit-and-loss.xlsx' };
  }

  private async tests(params: ExportParams): Promise<ExportFile> {
    if (!params.batchId) throw new AppError('BATCH_REQUIRED', 'Choose a batch', StatusCodes.BAD_REQUEST);
    const data = await this.repository.testsMatrix(params.batchId);
    if (!data) throw new AppError('BATCH_NOT_FOUND', 'Batch not found', StatusCodes.NOT_FOUND);
    const workbook = newWorkbook('Test marks');
    addTestsSheet(workbook, data);
    return { buffer: await toBuffer(workbook), fileName: `test-marks-${fileSafe(data.batchName)}.xlsx` };
  }

  private async enquiries(params: ExportParams): Promise<ExportFile> {
    const rows = await this.repository.enquiries(params.status);
    const workbook = newWorkbook('Enquiries');
    addTableSheet(
      workbook,
      'Enquiries',
      [
        { header: 'Asked on', value: (e) => e.createdAt, format: 'date' },
        { header: 'Name', value: (e) => e.name, width: 24 },
        { header: 'Phone', value: (e) => e.phone, width: 16 },
        { header: 'Student', value: (e) => e.studentName, width: 20 },
        { header: 'Interested in', value: (e) => e.interestedIn, width: 24 },
        { header: 'How they came', value: (e) => label(e.source) },
        { header: 'Status', value: (e) => label(e.status) },
        { header: 'Call back on', value: (e) => e.followUpOn, format: 'date' },
        { header: 'Last called', value: (e) => e.lastContactedAt, format: 'date' },
        { header: 'Notes', value: (e) => e.notes, width: 40 },
      ],
      rows,
      { heading: `Enquiries: ${rows.length}` },
    );
    return { buffer: await toBuffer(workbook), fileName: 'enquiries.xlsx' };
  }

  private async staffAttendance(params: ExportParams): Promise<ExportFile> {
    if (!this.staff) throw new AppError('NOT_AVAILABLE', 'Staff attendance is not set up', StatusCodes.NOT_IMPLEMENTED);
    const month = params.month;
    if (!month) throw new AppError('MONTH_REQUIRED', 'Choose a month (YYYY-MM)', StatusCodes.BAD_REQUEST);
    const rows = await this.staff.month(month);
    const workbook = newWorkbook('Staff attendance');
    addTableSheet(
      workbook,
      safeSheetName(`Staff ${month}`),
      [
        { header: 'Teacher', value: (r) => r.name, width: 26 },
        { header: 'Present', value: (r) => r.present, format: 'number' },
        { header: 'Half day', value: (r) => r.halfDay, format: 'number' },
        { header: 'Absent', value: (r) => r.absent, format: 'number' },
        { header: 'Paid leave', value: (r) => r.leave, format: 'number' },
        { header: 'Days marked', value: (r) => r.marked, format: 'number' },
        { header: 'Monthly salary', value: (r) => r.monthlySalary, format: 'money', width: 16 },
        { header: 'Pay for days worked', value: (r) => r.suggestedAmount, format: 'money', width: 20 },
      ],
      rows,
      { heading: `Staff attendance, ${month}` },
    );
    return { buffer: await toBuffer(workbook), fileName: `staff-attendance-${month}.xlsx` };
  }
}
