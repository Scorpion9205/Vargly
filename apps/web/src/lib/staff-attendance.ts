'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// apps/api staff-attendance module: teachers' attendance and what it means for their pay

export const STAFF_STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export interface StaffDayRow {
  teacherId: string;
  name: string;
  status: StaffStatus | null;
  note: string | null;
}

export interface StaffMonthRow {
  teacherId: string;
  name: string;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  marked: number;
  monthlySalary: number | null;
  suggestedAmount: number | null;
}

export interface StaffMark {
  teacherId: string;
  status: StaffStatus;
}

export function useStaffDay(date: string) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'staff-attendance', 'day', date],
    queryFn: ({ signal }) => api.get<StaffDayRow[]>('/staff-attendance', { signal, query: { date } }),
  });
}

export function useStaffMonth(month: string) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'staff-attendance', 'month', month],
    queryFn: ({ signal }) => api.get<StaffMonthRow[]>('/staff-attendance/month', { signal, query: { month } }),
  });
}

export function useSaveStaffDay(date: string) {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return useMutation({
    mutationFn: (entries: StaffMark[]) => api.put<{ saved: number }>('/staff-attendance', { date, entries }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [scope, 'staff-attendance'] }),
  });
}
