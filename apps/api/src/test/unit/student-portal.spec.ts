import { describe, expect, it, vi } from 'vitest';

vi.mock('../../modules/papers/paper.service.js', () => ({ publicLink: (token: string) => `https://api.test/papers/dl/${token}` }));
vi.mock('../../modules/fees/receipt-link.js', () => ({ receiptLink: (id: string) => `https://api.test/fees/receipt/${id}/sig` }));

import {
  averagePercentage,
  classesOn,
  homeworkStatus,
  noticeVisibleToStudent,
  percentageOf,
  sortHomework,
  summariseAttendance,
  weekdayCode,
} from '../../modules/student-portal/student-portal.logic.js';
import {
  IStudentPortalRepository,
  PortalBatch,
  PortalStudent,
} from '../../modules/student-portal/student-portal.repository.js';
import { requireStudent } from '../../modules/student-portal/student-portal.module.js';
import { StudentPortalService } from '../../modules/student-portal/student-portal.service.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { RoleType } from '@vargly/types';

describe('student panel rules', () => {
  it('knows the weekday of a date the way batches name it', () => {
    expect(weekdayCode('2026-10-24')).toBe('SAT');
    expect(weekdayCode('2026-10-26')).toBe('MON');
  });

  it('counts attendance with excused days neither for nor against', () => {
    expect(summariseAttendance(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'])).toEqual({
      present: 1, late: 1, absent: 1, excused: 1, counted: 3, percentage: 66.7,
    });
    expect(summariseAttendance([]).percentage).toBeNull();
    expect(summariseAttendance(['EXCUSED']).percentage).toBeNull();
  });

  it('says where a homework stands, and puts open work first by deadline', () => {
    expect(homeworkStatus('2026-10-20', false, '2026-10-24')).toBe('OVERDUE');
    expect(homeworkStatus('2026-10-24', false, '2026-10-24')).toBe('DUE_TODAY');
    expect(homeworkStatus('2026-10-30', false, '2026-10-24')).toBe('UPCOMING');
    expect(homeworkStatus('2026-10-20', true, '2026-10-24')).toBe('DONE');

    const sorted = sortHomework([
      { dueDate: '2026-10-30', status: 'UPCOMING' as const },
      { dueDate: '2026-10-22', status: 'DONE' as const },
      { dueDate: '2026-10-25', status: 'UPCOMING' as const },
      { dueDate: '2026-10-20', status: 'OVERDUE' as const },
    ]);
    expect(sorted.map((h) => h.dueDate)).toEqual(['2026-10-20', '2026-10-25', '2026-10-30', '2026-10-22']);
  });

  it('shows a student the notices meant for them: everyone or students, the whole institute or their batch, not ended', () => {
    const now = new Date('2026-10-24T05:00:00Z');
    const mine = new Set(['b1']);
    const notice = (overrides = {}) => ({ batchId: null, targetAudience: 'ALL', expiresAt: null, ...overrides });
    expect(noticeVisibleToStudent(notice(), mine, now)).toBe(true);
    expect(noticeVisibleToStudent(notice({ targetAudience: 'STUDENTS', batchId: 'b1' }), mine, now)).toBe(true);
    expect(noticeVisibleToStudent(notice({ batchId: 'b2' }), mine, now)).toBe(false);
    expect(noticeVisibleToStudent(notice({ targetAudience: 'PARENTS' }), mine, now)).toBe(false);
    expect(noticeVisibleToStudent(notice({ targetAudience: 'TEACHERS' }), mine, now)).toBe(false);
    expect(noticeVisibleToStudent(notice({ expiresAt: new Date('2026-10-24T04:00:00Z') }), mine, now)).toBe(false);
  });

  it('lists the classes of a day, earliest first', () => {
    const batches = [
      { name: 'Evening', daysOfWeek: ['SAT'], startTime: '17:00' },
      { name: 'Morning', daysOfWeek: ['SAT', 'MON'], startTime: '08:00' },
      { name: 'Monday only', daysOfWeek: ['MON'], startTime: '09:00' },
    ];
    expect(classesOn(batches, '2026-10-24').map((b) => b.name)).toEqual(['Morning', 'Evening']);
  });

  it('works out percentages and averages', () => {
    expect(percentageOf(42.5, 50)).toBe(85);
    expect(percentageOf(5, 0)).toBe(0);
    expect(averagePercentage([80, 90, 70])).toBe(80);
    expect(averagePercentage([])).toBeNull();
  });
});

const student: PortalStudent = {
  id: 's1', coachingId: 'c1', name: 'Riya Verma', rollNumber: '12', phone: null, email: null,
  joiningDate: new Date('2026-04-01T00:00:00Z'), loginId: 'RIYA-4821', instituteName: 'Sharma Classes',
};
const batch: PortalBatch = { id: 'b1', name: 'Class 10 Maths', subject: 'Maths', daysOfWeek: ['SAT'], startTime: '08:00', endTime: '09:30', teachers: ['Mr Sharma'] };

function fakeRepository(overrides: Partial<IStudentPortalRepository> = {}): IStudentPortalRepository {
  return {
    findStudentByUserId: async () => student,
    batchesOf: async () => [batch],
    attendanceBetween: async () => [
      { date: '2026-10-03', status: 'PRESENT', batchName: 'Class 10 Maths' },
      { date: '2026-10-10', status: 'ABSENT', batchName: 'Class 10 Maths' },
    ],
    allAttendanceStatuses: async () => ['PRESENT', 'ABSENT', 'ABSENT', 'PRESENT'],
    homework: async () => [
      { id: 'h1', title: 'Chapter 3', description: 'Do exercise 3.1', dueDate: '2026-10-22', batchName: 'Class 10 Maths', attachmentUrl: null, doneAt: null },
      { id: 'h2', title: 'Chapter 4', description: 'Read', dueDate: '2026-10-28', batchName: 'Class 10 Maths', attachmentUrl: 'https://x', doneAt: null },
      { id: 'h3', title: 'Chapter 2', description: 'Done', dueDate: '2026-10-15', batchName: 'Class 10 Maths', attachmentUrl: null, doneAt: new Date('2026-10-14T05:00:00Z') },
    ],
    setHomeworkDone: async () => true,
    results: async () => [
      { testId: 't1', title: 'Unit 1', subject: 'Maths', date: '2026-10-10', batchName: 'Class 10 Maths', totalMarks: 50, passingMarks: 20, marks: 42, absent: false },
    ],
    scoresOfTests: async () => [
      { testId: 't1', studentId: 's1', marks: 42, absent: false },
      { testId: 't1', studentId: 'other-1', marks: 30, absent: false },
      { testId: 't1', studentId: 'other-2', marks: 20, absent: false },
    ],
    materials: async () => [{ shareId: 'm1', token: 'tok', kind: 'MATERIAL', title: 'Light notes', subject: 'Science', batchName: 'Class 10 Maths', sharedAt: new Date('2026-10-20T05:00:00Z') }],
    notices: async () => [
      { id: 'n1', title: 'Diwali holiday', content: 'Closed', isPinned: true, batchId: null, batchName: null, targetAudience: 'ALL', expiresAt: null, createdAt: new Date('2026-10-18T05:00:00Z') },
      { id: 'n2', title: 'Other batch only', content: 'x', isPinned: false, batchId: 'b9', batchName: 'Other', targetAudience: 'STUDENTS', expiresAt: null, createdAt: new Date('2026-10-17T05:00:00Z') },
    ],
    fees: async () => [
      {
        id: 'p1', academicYear: '2026-27', finalAmount: 3000,
        installments: [
          { id: 'i1', installmentNo: 1, amount: 1500, paidAmount: 1000, dueDate: '2026-10-10', status: 'PARTIAL', payments: [{ id: 'tx1', amount: 1000, paidAt: new Date('2026-10-05T05:00:00Z'), receiptNumber: 'RCT/1' }] },
          { id: 'i2', installmentNo: 2, amount: 1500, paidAmount: 0, dueDate: '2026-12-10', status: 'PENDING', payments: [] },
        ],
      },
    ],
    portalSettings: async () => ({ enabled: true, showFees: false, doubts: false, attendanceThreshold: 75 }),
    ...overrides,
  };
}

const clock = () => new Date('2026-10-24T05:00:00Z'); // a Saturday

describe('StudentPortalService', () => {
  it('shows the month and warns when overall attendance is under the institute\'s level', async () => {
    const result = await new StudentPortalService(fakeRepository(), clock).attendance(student);
    expect(result.month).toBe('2026-10');
    expect(result.summary).toMatchObject({ present: 1, absent: 1, percentage: 50 });
    expect(result.overall.percentage).toBe(50);
    expect(result.belowThreshold).toBe(true);
    expect(result.threshold).toBe(75);
  });

  it('lists homework with open work first, and marks one done', async () => {
    const markDone = vi.fn().mockResolvedValue(true);
    const service = new StudentPortalService(fakeRepository({ setHomeworkDone: markDone }), clock);
    const homework = await service.homework(student);
    expect(homework.map((h) => [h.id, h.status])).toEqual([['h1', 'OVERDUE'], ['h2', 'UPCOMING'], ['h3', 'DONE']]);

    await service.markHomework(student, 'h2', true);
    expect(markDone).toHaveBeenCalledWith('s1', ['b1'], 'h2', true);
  });

  it('refuses to mark a homework that is not one of the student\'s batches', async () => {
    const service = new StudentPortalService(fakeRepository({ setHomeworkDone: async () => false }), clock);
    await expect(service.markHomework(student, 'someone-elses', true)).rejects.toMatchObject({ code: 'HOMEWORK_NOT_FOUND' });
  });

  it('gives a result with the student\'s own rank and the class average, and nobody else\'s marks', async () => {
    const { results, summary } = await new StudentPortalService(fakeRepository(), clock).results(student);
    expect(results[0]).toMatchObject({ marks: 42, totalMarks: 50, percentage: 84, passed: true, standing: { rank: 1, outOf: 3, classAveragePercentage: 61.3 } });
    expect(summary).toEqual({ tests: 1, averagePercentage: 84 });
    expect(JSON.stringify(results)).not.toContain('other-1');
  });

  it('hides notices of other batches and gives a materials link', async () => {
    const service = new StudentPortalService(fakeRepository(), clock);
    expect((await service.notices(student)).map((n) => n.id)).toEqual(['n1']);
    expect((await service.materials(student))[0]).toMatchObject({ title: 'Light notes', link: 'https://api.test/papers/dl/tok' });
  });

  it('keeps fees hidden until the institute shows them, then shows balances and receipts', async () => {
    const hidden = new StudentPortalService(fakeRepository(), clock);
    await expect(hidden.fees(student)).rejects.toMatchObject({ code: 'FEES_HIDDEN', statusCode: 403 });
    expect((await hidden.overview(student)).fees).toBeNull();

    const shown = new StudentPortalService(fakeRepository({ portalSettings: async () => ({ enabled: true, showFees: true, doubts: false, attendanceThreshold: 75 }) }), clock);
    const fees = await shown.fees(student);
    expect(fees.totals).toEqual({ balance: 2000, overdue: 500 });
    expect(fees.plans[0]!.installments[0]).toMatchObject({ balance: 500, overdue: true });
    expect(fees.plans[0]!.installments[0]!.payments[0]!.receiptLink).toBe('https://api.test/fees/receipt/tx1/sig');
    expect((await shown.overview(student)).fees).toEqual({ balance: 2000, overdue: 500, nextDue: { amount: 500, dueDate: '2026-10-10' } });
  });

  it('reads the batches and the institute\'s settings once for the whole home screen', async () => {
    const batchesOf = vi.fn(async () => [batch]);
    const portalSettings = vi.fn(async () => ({ enabled: true, showFees: true, doubts: false, attendanceThreshold: 75 }));
    await new StudentPortalService(fakeRepository({ batchesOf, portalSettings }), clock).overview(student);
    expect(batchesOf).toHaveBeenCalledTimes(1);
    expect(portalSettings).toHaveBeenCalledTimes(1);
  });

  it('builds the home screen: today\'s classes, open homework, latest result', async () => {
    const overview = await new StudentPortalService(fakeRepository(), clock).overview(student);
    expect(overview.classesToday.map((c) => c.name)).toEqual(['Class 10 Maths']);
    expect(overview.homework).toMatchObject({ open: 2, overdue: 1 });
    expect(overview.latestResult?.title).toBe('Unit 1');
    expect(overview.notices.map((n) => n.title)).toEqual(['Diwali holiday']);
  });
});

describe('requireStudent', () => {
  const run = async (roles: RoleType[], repository: Partial<IStudentPortalRepository>) => {
    const res: any = { locals: {} };
    const next = vi.fn();
    const handler = requireStudent({
      findStudentByUserId: async () => student,
      portalSettings: async () => ({ enabled: true, showFees: false, doubts: false, attendanceThreshold: 75 }),
      ...repository,
    });
    await RequestContextService.run(
      { traceId: 't', coachingId: 'c1', userId: 'u1', roles, permissions: ['*'], features: [] } as any,
      async () => handler({} as any, res, next),
    );
    return { res, next };
  };

  it('lets a student in and tells the route who they are', async () => {
    const { res, next } = await run([RoleType.STUDENT], {});
    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.student).toBe(student);
  });

  it('turns away an owner or a teacher, even one holding every permission', async () => {
    await expect(run([RoleType.OWNER], {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(run([RoleType.TEACHER], {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it('turns away a login with no student behind it, and a switched-off panel', async () => {
    await expect(run([RoleType.STUDENT], { findStudentByUserId: async () => null })).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      run([RoleType.STUDENT], { portalSettings: async () => ({ enabled: false, showFees: false, doubts: false, attendanceThreshold: 75 }) }),
    ).rejects.toMatchObject({ code: 'PORTAL_DISABLED' });
  });
});
