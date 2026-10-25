import { beforeEach, describe, expect, it } from 'vitest';
import {
  IStaffAttendanceRepository,
  markStaffSchema,
  monthBounds,
  StaffAttendanceService,
  StaffStatus,
  suggestedPay,
} from '../../modules/staff-attendance/staff-attendance.service.js';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

class FakeRepository implements IStaffAttendanceRepository {
  public marks: Array<{ teacherId: string; date: string; status: StaffStatus; note: string | null }> = [];
  public async listTeachers() {
    return [
      { id: T1, name: 'Asha', monthlySalary: 30000 },
      { id: T2, name: 'Ravi', monthlySalary: null },
    ];
  }
  public async marksForDay(date: string) {
    return new Map(this.marks.filter((m) => m.date === date).map((m) => [m.teacherId, { status: m.status, note: m.note }]));
  }
  public async validTeacherIds(ids: string[]) {
    return new Set(ids.filter((id) => id === T1 || id === T2));
  }
  public async upsert(date: string, entries: Array<{ teacherId: string; status: StaffStatus; note?: string }>) {
    for (const e of entries) {
      this.marks = this.marks.filter((m) => !(m.teacherId === e.teacherId && m.date === date));
      this.marks.push({ teacherId: e.teacherId, date, status: e.status, note: e.note ?? null });
    }
  }
  public async marksInRange(from: string, to: string) {
    return this.marks.filter((m) => m.date >= from && m.date <= to).map((m) => ({ teacherId: m.teacherId, status: m.status }));
  }
}

describe('StaffAttendanceService', () => {
  let repo: FakeRepository;
  let service: StaffAttendanceService;
  beforeEach(() => {
    repo = new FakeRepository();
    service = new StaffAttendanceService(repo);
  });

  it('lists every teacher for a day, marked or not', async () => {
    await service.mark({ date: '2026-10-05', entries: [{ teacherId: T1, status: 'PRESENT' }] });
    const rows = await service.forDay('2026-10-05');
    expect(rows).toEqual([
      { teacherId: T1, name: 'Asha', status: 'PRESENT', note: null },
      { teacherId: T2, name: 'Ravi', status: null, note: null },
    ]);
  });

  it('corrects a mark instead of adding a second one', async () => {
    await service.mark({ date: '2026-10-05', entries: [{ teacherId: T1, status: 'ABSENT' }] });
    await service.mark({ date: '2026-10-05', entries: [{ teacherId: T1, status: 'LEAVE', note: 'Sick' }] });
    expect(repo.marks).toHaveLength(1);
    expect(repo.marks[0]).toMatchObject({ status: 'LEAVE', note: 'Sick' });
  });

  it('refuses a future day and an unknown teacher', async () => {
    await expect(service.mark({ date: '2999-01-01', entries: [{ teacherId: T1, status: 'PRESENT' }] })).rejects.toMatchObject({ code: 'DATE_IN_FUTURE' });
    await expect(
      service.mark({ date: '2026-10-05', entries: [{ teacherId: '33333333-3333-4333-8333-333333333333', status: 'PRESENT' }] }),
    ).rejects.toMatchObject({ code: 'TEACHER_NOT_FOUND' });
  });

  it('counts the month and suggests pay for the days worked', async () => {
    const days: Array<[string, StaffStatus]> = [
      ['2026-10-01', 'PRESENT'],
      ['2026-10-02', 'PRESENT'],
      ['2026-10-03', 'HALF_DAY'],
      ['2026-10-04', 'ABSENT'],
    ];
    for (const [date, status] of days) await service.mark({ date, entries: [{ teacherId: T1, status }] });
    await service.mark({ date: '2026-09-30', entries: [{ teacherId: T1, status: 'ABSENT' }] }); // another month

    const [asha, ravi] = await service.month('2026-10');
    expect(asha).toMatchObject({ present: 2, halfDay: 1, absent: 1, leave: 0, marked: 4, suggestedAmount: 18750 });
    expect(ravi).toMatchObject({ marked: 0, monthlySalary: null, suggestedAmount: null });
  });
});

describe('helpers', () => {
  it('finds the first and last day of a month', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02').to).toBe('2028-02-29');
  });
  it('treats paid leave as a day worked and gives nothing without a salary', () => {
    expect(suggestedPay(26000, { present: 20, halfDay: 0, leave: 2, marked: 26 })).toBe(22000);
    expect(suggestedPay(null, { present: 1, halfDay: 0, leave: 0, marked: 1 })).toBeNull();
  });
  it('needs at least one entry', () => {
    expect(() => markStaffSchema.parse({ date: '2026-10-05', entries: [] })).toThrow();
  });
});
