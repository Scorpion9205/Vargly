'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { downloadPdf } from './papers';
import { useQueryScope } from './queries';

// apps/api student-logins module: the owner makes, resets and switches off students' logins

export interface StudentLoginRow {
  studentId: string;
  name: string;
  rollNumber: string | null;
  /** The Student ID, or null when the student has no login yet */
  loginId: string | null;
  active: boolean;
  lastLoginAt: string | null;
}

/** Shown to the owner once: the password is not stored in a form that can be read again */
export interface IssuedLogin {
  studentId: string;
  name: string;
  loginId: string;
  temporaryPassword: string;
}

export type LoginState = 'none' | 'active' | 'off';

export function loginState(row: Pick<StudentLoginRow, 'loginId' | 'active'>): LoginState {
  return row.loginId === null ? 'none' : row.active ? 'active' : 'off';
}

export function useStudentLogins(batchId: string) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'student-logins', batchId],
    queryFn: ({ signal }) => api.get<StudentLoginRow[]>('/student-logins', { signal, query: { batchId: batchId || undefined } }),
  });
}

/** One student's login, for their own page */
export function useStudentLogin(studentId: string, enabled = true) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'student-logins', 'one', studentId],
    queryFn: ({ signal }) => api.get<StudentLoginRow>(`/student-logins/${studentId}`, { signal }),
    enabled,
  });
}

function useInvalidateLogins() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: [scope, 'student-logins'] });
}

export function useCreateLogin() {
  const invalidate = useInvalidateLogins();
  return useMutation({
    mutationFn: (studentId: string) => api.post<IssuedLogin>('/student-logins', { studentId }),
    onSuccess: invalidate,
  });
}

export function useBulkLogins() {
  const invalidate = useInvalidateLogins();
  return useMutation({
    mutationFn: (batchId: string) => api.post<{ issued: IssuedLogin[]; hasMore: boolean }>('/student-logins/bulk', batchId ? { batchId } : {}),
    onSuccess: invalidate,
  });
}

export function useResetLogin() {
  const invalidate = useInvalidateLogins();
  return useMutation({
    mutationFn: (studentId: string) => api.post<IssuedLogin>(`/student-logins/${studentId}/reset`, {}),
    onSuccess: invalidate,
  });
}

export function useDisableLogin() {
  const invalidate = useInvalidateLogins();
  return useMutation({
    mutationFn: (studentId: string) => api.post(`/student-logins/${studentId}/disable`, {}),
    onSuccess: invalidate,
  });
}

/** The printable cards for logins the owner was just shown */
export function downloadLoginCards(logins: readonly IssuedLogin[]): Promise<void> {
  return downloadPdf(
    '/student-logins/cards',
    'student-login-cards.pdf',
    { cards: logins.map(({ name, loginId, temporaryPassword }) => ({ name, loginId, temporaryPassword })) },
  );
}
