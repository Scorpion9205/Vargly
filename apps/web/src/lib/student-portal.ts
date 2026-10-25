'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// apps/api student-portal module: only the signed-in student's own records

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type HomeworkStatus = 'DONE' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

export interface AttendanceSummary {
  present: number;
  late: number;
  absent: number;
  excused: number;
  counted: number;
  /** Present and late as a share of the classes that count; null when none were marked */
  percentage: number | null;
}

export interface PortalClass {
  id: string;
  name: string;
  subject: string | null;
  startTime: string | null;
  endTime: string | null;
  teachers: string[];
}

export interface PortalHomework {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  batchName: string;
  attachmentUrl: string | null;
  status: HomeworkStatus;
  doneAt: string | null;
}

export interface PortalResult {
  testId: string;
  title: string;
  subject: string;
  date: string;
  batchName: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  absent: boolean;
  passed: boolean | null;
  standing: { rank: number; outOf: number; classAveragePercentage: number } | null;
}

export interface PortalNotice {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  batchName: string | null;
  createdAt: string;
}

export interface PortalOverview {
  student: { name: string; rollNumber: string | null; institute: string };
  today: string;
  classesToday: PortalClass[];
  attendance: { thisMonth: AttendanceSummary; overall: AttendanceSummary; threshold: number; belowThreshold: boolean };
  homework: { open: number; overdue: number; next: PortalHomework[] };
  latestResult: PortalResult | null;
  averagePercentage: number | null;
  notices: PortalNotice[];
  fees: { balance: number; overdue: number; nextDue: { amount: number; dueDate: string } | null } | null;
  showFees: boolean;
  doubtsEnabled: boolean;
}

export interface PortalAttendance {
  month: string;
  days: Array<{ date: string; status: AttendanceStatus; batchName: string }>;
  summary: AttendanceSummary;
  overall: AttendanceSummary;
  threshold: number;
  belowThreshold: boolean;
}

export interface PortalResults {
  results: PortalResult[];
  summary: { tests: number; averagePercentage: number | null };
}

export interface PortalMaterial {
  id: string;
  title: string;
  subject: string;
  kind: 'HOMEWORK' | 'PRACTICE' | 'MATERIAL';
  batchName: string;
  sharedAt: string;
  link: string;
}

export interface PortalBatch {
  id: string;
  name: string;
  subject: string | null;
  daysOfWeek: string[];
  startTime: string | null;
  endTime: string | null;
  teachers: string[];
}

export interface PortalProfile {
  institute: string;
  name: string;
  loginId: string | null;
  rollNumber: string | null;
  phone: string | null;
  email: string | null;
  joiningDate: string;
  batches: Array<{ id: string; name: string; subject: string | null }>;
}

export interface PortalFees {
  plans: Array<{
    id: string;
    academicYear: string;
    total: number;
    installments: Array<{
      id: string;
      number: number;
      amount: number;
      paid: number;
      balance: number;
      dueDate: string;
      status: string;
      overdue: boolean;
      payments: Array<{ amount: number; paidAt: string; receiptNumber: string; receiptLink: string }>;
    }>;
  }>;
  totals: { balance: number; overdue: number };
}

function usePortalQuery<T>(key: string, path: string, query?: Record<string, string | undefined>, enabled = true) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'portal', key, query ?? null],
    queryFn: ({ signal }) => api.get<T>(`/student-portal${path}`, { signal, query }),
    enabled,
  });
}

export const usePortalOverview = () => usePortalQuery<PortalOverview>('overview', '/overview');
export const usePortalAttendance = (month: string) => usePortalQuery<PortalAttendance>('attendance', '/attendance', { month });
export const usePortalHomework = () => usePortalQuery<PortalHomework[]>('homework', '/homework');
export const usePortalResults = () => usePortalQuery<PortalResults>('results', '/results');
export const usePortalMaterials = () => usePortalQuery<PortalMaterial[]>('materials', '/materials');
export const usePortalNotices = () => usePortalQuery<PortalNotice[]>('notices', '/notices');
export const usePortalSchedule = () => usePortalQuery<PortalBatch[]>('schedule', '/schedule');
export const usePortalProfile = () => usePortalQuery<PortalProfile>('profile', '/profile');
export const usePortalFees = (enabled: boolean) => usePortalQuery<PortalFees>('fees', '/fees', undefined, enabled);

/** Marks a homework done (or not done) and refreshes the pages that show it */
export function useMarkHomework() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.put(`/student-portal/homework/${id}/done`, { done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [scope, 'portal'] }),
  });
}

/** Asks the AI one study doubt; the answer is not stored, so the page keeps what was asked this visit */
export function useAskDoubt() {
  return useMutation({
    mutationFn: (question: string) => api.post<{ answer: string }>('/student-portal/doubts', { question }),
  });
}

/** A link to open in a new tab, only when it is a web address (never a script) */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** Whether attendance is under the institute's warning level */
export function isLow(summary: AttendanceSummary, threshold: number): boolean {
  return summary.percentage !== null && summary.percentage < threshold;
}

/** The days of a month as calendar cells, Monday first: leading blanks, then each day with its marks */
export function calendarCells(
  month: string,
  days: PortalAttendance['days'],
): Array<{ day: number; date: string; statuses: AttendanceStatus[] } | null> {
  const first = new Date(`${month}-01T00:00:00Z`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday = 0
  const byDate = new Map<string, AttendanceStatus[]>();
  for (const entry of days) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry.status]);
  const cells: Array<{ day: number; date: string; statuses: AttendanceStatus[] } | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= count; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ day, date, statuses: byDate.get(date) ?? [] });
  }
  return cells;
}

/** The status a day shows when several classes were marked: any absence wins, then late, then present */
export function dayStatus(statuses: readonly AttendanceStatus[]): AttendanceStatus | null {
  if (statuses.length === 0) return null;
  for (const status of ['ABSENT', 'LATE', 'PRESENT', 'EXCUSED'] as const) if (statuses.includes(status)) return status;
  return null;
}
