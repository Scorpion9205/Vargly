import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportQuerySchema } from '../../modules/exports/export.module.js';
import { IExportRepository, RegisterData } from '../../modules/exports/export.repository.js';
import { ExportService, registerTotals } from '../../modules/exports/export.service.js';
import { addTableSheet, newWorkbook, safeSheetName } from '../../modules/exports/xlsx-helpers.js';

async function read(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
}

const rowValues = (sheet: ExcelJS.Worksheet, rowNumber: number) =>
  (sheet.getRow(rowNumber).values as unknown[]).slice(1);

const register: RegisterData = {
  batchName: 'Class 10 / Maths',
  students: [
    { id: 's1', name: 'Asha Rao', rollNumber: '1' },
    { id: 's2', name: 'Ravi Kumar', rollNumber: null },
  ],
  sessions: [
    { date: '2026-10-05', statuses: new Map([['s1', 'PRESENT'], ['s2', 'ABSENT']]) },
    { date: '2026-10-06', statuses: new Map([['s1', 'LATE'], ['s2', 'EXCUSED']]) },
    { date: '2026-10-07', statuses: new Map([['s1', 'ABSENT']]) },
  ],
};

const repository: IExportRepository = {
  async students(status) {
    const rows = [
      { rollNumber: '1', name: 'Asha Rao', gender: 'FEMALE', dob: new Date('2010-03-04T00:00:00Z'), phone: '9876543210', email: null, address: 'Pune', joiningDate: new Date('2026-04-01T00:00:00Z'), isActive: true, batches: ['Class 10 / Maths', 'Science'], parents: [{ name: 'Mrs Rao', phone: '9123456780', relation: 'MOTHER' }] },
      { rollNumber: null, name: '=HYPERLINK("http://evil")', gender: null, dob: null, phone: null, email: null, address: null, joiningDate: new Date('2026-04-02T00:00:00Z'), isActive: false, batches: [], parents: [] },
    ];
    return status === 'active' ? rows.filter((r) => r.isActive) : rows;
  },
  async activeBatches() {
    return [{ id: 'b1', name: 'Class 10 / Maths' }];
  },
  async register(batchId) {
    return batchId === 'b1' ? register : null;
  },
  async payments() {
    return [{ paidAt: new Date('2026-10-02T06:00:00Z'), receiptNumber: 'RCT/1', studentName: 'Asha Rao', installmentNo: 1, amount: 1500.5, method: 'UPI', remarks: null }];
  },
  async salaries() {
    return [];
  },
  async expenses() {
    return [{ date: new Date('2026-10-03T00:00:00Z'), title: 'Rent', category: 'RENT', amount: 8000, method: 'BANK_TRANSFER', remarks: null }];
  },
  async testsMatrix(batchId) {
    return batchId === 'b1'
      ? {
          batchName: 'Class 10 / Maths',
          students: register.students,
          tests: [{ id: 't1', title: 'Unit 1', subject: 'Maths', date: new Date('2026-10-10T00:00:00Z'), totalMarks: 50 }],
          results: new Map([['t1:s1', { marks: 42.5, absent: false }], ['t1:s2', { marks: 0, absent: true }]]),
        }
      : null;
  },
  async enquiries() {
    return [{ createdAt: new Date('2026-10-18T05:00:00Z'), name: 'Mrs Verma', phone: '9876543210', studentName: 'Riya', interestedIn: 'Class 10', source: 'ONLINE_FORM', status: 'NEW', followUpOn: null, lastContactedAt: null, notes: 'Fees?' }];
  },
};

const reports = {
  async generateFeeReport() {
    return { data: { totalExpected: 10000, totalCollected: 4000, totalWaived: 0, totalPending: 6000, totalOverdue: 2000, collectionPercentage: 40, defaulterCount: 1, defaulters: [{ studentId: 's1', studentName: 'Asha Rao', studentPhone: '9876543210', parentName: 'Mrs Rao', parentPhone: '9123456780', pendingAmount: 2000, overdueDays: 12, installmentDueDate: '2026-10-08' }] } };
  },
  async generateAttendanceReport() {
    const student = { studentId: 's1', studentName: 'Asha Rao', batchName: 'Class 10', totalClasses: 10, attendedClasses: 6, percentage: 60 };
    return { data: { totalSessions: 10, threshold: 75, averageAttendancePercentage: 80, defaultersCount: 1, students: [student], defaulters: [student] } };
  },
  async generateProfitLossReport() {
    return { data: { totalRevenue: 1500.5, teacherSalaryExpenses: 0, generalExpenses: 8000, totalExpenses: 8000, netProfit: -6499.5, profitMarginPercentage: null } };
  },
} as any;

const staff = {
  async month() {
    return [{ teacherId: 't1', name: 'Asha', present: 20, halfDay: 0, absent: 2, leave: 0, marked: 22, monthlySalary: 22000, suggestedAmount: 20000 }];
  },
};

const service = new ExportService(repository, reports, staff);

describe('registerTotals', () => {
  it('counts each kind of day and leaves excused days out of the percentage', () => {
    expect(registerTotals(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', undefined])).toEqual({ present: 1, late: 1, absent: 1, excused: 1, percentage: 66.7 });
    expect(registerTotals([undefined, 'EXCUSED']).percentage).toBeNull();
  });
});

describe('xlsx helpers', () => {
  it('makes safe, unique sheet names', () => {
    expect(safeSheetName('Class 10 / Maths: [A]')).toBe('Class 10 Maths A');
    expect(safeSheetName('x'.repeat(50))).toHaveLength(31);
    expect(safeSheetName('Maths', new Set(['maths']))).toBe('Maths 2');
  });

  it('writes a header, freezes it, and formats money and dates', async () => {
    const workbook = newWorkbook('t');
    addTableSheet(workbook, 'T', [
      { header: 'Name', value: (r: { n: string; a: number; d: string }) => r.n },
      { header: 'Amount', value: (r) => r.a, format: 'money' },
      { header: 'On', value: (r) => r.d, format: 'date' },
    ], [{ n: 'A', a: 12.5, d: '2026-10-05' }]);
    const sheet = (await read(Buffer.from(await workbook.xlsx.writeBuffer()))).getWorksheet('T')!;
    expect(rowValues(sheet, 1)).toEqual(['Name', 'Amount', 'On']);
    expect(sheet.getCell('B2').numFmt).toContain('₹');
    expect(sheet.getCell('C2').value).toBeInstanceOf(Date);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });
});

describe('ExportService', () => {
  it('exports every student with batches and parents, and keeps typed text from running as a formula', async () => {
    const { buffer, fileName } = await service.build('students', {}, 'c1');
    expect(fileName).toBe('students-all.xlsx');
    const sheet = (await read(buffer)).getWorksheet('Students')!;
    expect(rowValues(sheet, 3)).toEqual(expect.arrayContaining(['Roll no.', 'Name', 'Batches', 'Parent phone']));
    const row = rowValues(sheet, 4);
    expect(row).toEqual(expect.arrayContaining(['Asha Rao', 'Class 10 / Maths, Science', 'Mrs Rao', '9123456780']));
    // Stored as plain text, so Excel never evaluates it
    const risky = sheet.getCell('B5');
    expect(typeof risky.value).toBe('string');
    expect(risky.type).toBe(ExcelJS.ValueType.String);
  });

  it('filters students by status', async () => {
    const { buffer, fileName } = await service.build('students', { status: 'active' }, 'c1');
    expect(fileName).toBe('students-active.xlsx');
    expect((await read(buffer)).getWorksheet('Students')!.rowCount).toBe(4); // heading, blank, header, one student
  });

  it('lays out the attendance register: a column per class, totals and a percentage', async () => {
    const { buffer, fileName } = await service.build('attendance-register', { month: '2026-10' }, 'c1');
    expect(fileName).toBe('attendance-register-2026-10.xlsx');
    const sheet = (await read(buffer)).getWorksheet('Class 10 Maths')!;
    expect(rowValues(sheet, 3)).toEqual(['Roll no.', 'Student', '5 Mon', '6 Tue', '7 Wed', 'Present', 'Late', 'Absent', 'Excused', 'Attendance %']);
    expect(rowValues(sheet, 4)).toEqual(['1', 'Asha Rao', 'P', 'L', 'A', 1, 1, 1, 0, 66.7]);
    // Ravi: absent, excused, not on the register: 0 of 1 counted days
    expect(rowValues(sheet, 5).slice(1)).toEqual(['Ravi Kumar', 'A', 'E', '', 0, 0, 1, 1, 0].slice(0));
  });

  it('needs a month for the register and a batch for marks', async () => {
    await expect(service.build('attendance-register', {}, 'c1')).rejects.toMatchObject({ code: 'MONTH_REQUIRED' });
    await expect(service.build('tests', {}, 'c1')).rejects.toMatchObject({ code: 'BATCH_REQUIRED' });
    await expect(service.build('tests', { batchId: 'nope' }, 'c1')).rejects.toMatchObject({ code: 'BATCH_NOT_FOUND' });
    await expect(service.build('attendance-register', { month: '2026-10', batchId: 'nope' }, 'c1')).rejects.toMatchObject({ code: 'BATCH_NOT_FOUND' });
  });

  it('puts the fee report in sheets: summary, overdue and payments', async () => {
    const { buffer } = await service.build('fees', { startDate: '2026-10-01', endDate: '2026-10-31' }, 'c1');
    const workbook = await read(buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Summary', 'Overdue', 'Payments']);
    expect(workbook.getWorksheet('Summary')!.getCell('B6').value).toBe(6000);
    expect(workbook.getWorksheet('Overdue')!.getCell('A4').value).toBe('Asha Rao');
    expect(workbook.getWorksheet('Payments')!.getCell('E4').value).toBe(1500.5);
  });

  it('puts profit and loss in sheets with expenses grouped by category', async () => {
    const { buffer } = await service.build('profit-loss', {}, 'c1');
    const workbook = await read(buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Summary', 'Expenses by category', 'Fees collected', 'Salaries paid', 'Expenses']);
    expect(workbook.getWorksheet('Expenses by category')!.getCell('A2').value).toBe('RENT');
    expect(workbook.getWorksheet('Summary')!.getCell('B7').value).toBe(-6499.5);
  });

  it('makes a marks sheet with a column per test, absent shown as text', async () => {
    const { buffer, fileName } = await service.build('tests', { batchId: 'b1' }, 'c1');
    expect(fileName).toBe('test-marks-Class_10_Maths.xlsx');
    const sheet = (await read(buffer)).getWorksheet('Class 10 Maths')!;
    expect(rowValues(sheet, 3)[2]).toBe('Unit 1 (Maths, 2026-10-10) /50');
    expect(rowValues(sheet, 4)[2]).toBe(42.5);
    expect(rowValues(sheet, 5)[2]).toBe('Absent');
  });

  it('exports enquiries and staff attendance in plain words', async () => {
    const enquiries = (await read((await service.build('enquiries', {}, 'c1')).buffer)).getWorksheet('Enquiries')!;
    expect(rowValues(enquiries, 4)).toEqual(expect.arrayContaining(['Mrs Verma', 'Online form', 'New']));
    const staffBook = await read((await service.build('staff-attendance', { month: '2026-10' }, 'c1')).buffer);
    expect(staffBook.worksheets[0]!.getCell('H4').value).toBe(20000);
  });

  it('summarises attendance with the students below the warning level', async () => {
    const workbook = await read((await service.build('attendance-summary', {}, 'c1')).buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Summary', 'All students', 'Below warning level']);
  });
});

describe('exportQuerySchema', () => {
  it('reads the filters and rejects a backwards range', () => {
    expect(exportQuerySchema.parse({ month: '2026-10', threshold: '75' })).toEqual({ month: '2026-10', threshold: 75 });
    expect(() => exportQuerySchema.parse({ month: '2026-13' })).toThrow();
    expect(() => exportQuerySchema.parse({ startDate: '2026-10-10', endDate: '2026-10-01' })).toThrow();
  });
});
