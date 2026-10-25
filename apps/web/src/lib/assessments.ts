'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// ---------- Tests (apps/api tests DTOs; dates are ISO strings, marks are numbers) ----------

export interface TestResult {
  id: string;
  studentId: string;
  studentName: string;
  marksObtained: number;
  isAbsent: boolean;
  percentage: number;
  remarks?: string | null;
}

export interface Test {
  id: string;
  batchId: string;
  title: string;
  subject: string;
  testDate: string;
  totalMarks: number;
  passingMarks?: number | null;
  /** Of students who sat the test; absent when no marks are entered yet */
  averageScore?: number;
  highestScore?: number;
  results?: TestResult[];
  createdAt: string;
}

export interface TestInput {
  batchId: string;
  title: string;
  subject: string;
  /** YYYY-MM-DD */
  testDate: string;
  totalMarks: number;
  passingMarks?: number;
}

export type TestUpdate = Partial<Omit<TestInput, 'batchId' | 'passingMarks'>> & {
  passingMarks?: number | null;
};

export interface MarkEntry {
  studentId: string;
  marksObtained: number;
  isAbsent: boolean;
}

/** One test on a student's report (GET /tests/student/:id) */
export interface StudentTestResult {
  testId: string;
  title: string;
  subject: string;
  testDate: string;
  totalMarks: number;
  passingMarks?: number | null;
  marksObtained: number;
  isAbsent: boolean;
  percentage: number;
}

/** Passed when there is a pass mark and the student reached it; null when no pass mark is set */
export function hasPassed(
  marks: number,
  isAbsent: boolean,
  passingMarks: number | null | undefined,
): boolean | null {
  if (passingMarks === null || passingMarks === undefined) return null;
  return !isAbsent && marks >= passingMarks;
}

// ---------- Homework ----------

export interface Homework {
  id: string;
  batchId: string;
  title: string;
  description: string;
  dueDate: string;
  attachmentUrl?: string | null;
  /** How many students marked it done in the student panel */
  completedCount?: number;
  createdAt: string;
}

export interface HomeworkInput {
  batchId: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  dueDate: string;
  attachmentUrl?: string;
}

export type HomeworkUpdate = Partial<Omit<HomeworkInput, 'batchId'>>;

// ---------- Queries ----------

export function useBatchTests(batchId: string | null) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'tests', 'batch', batchId],
    queryFn: ({ signal }) => api.get<Test[]>(`/tests/batch/${batchId}`, { signal }),
    enabled: Boolean(batchId),
  });
}

export function useTest(id: string) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'tests', 'detail', id],
    queryFn: ({ signal }) => api.get<Test>(`/tests/${id}`, { signal }),
  });
}

export function useStudentResults(studentId: string, enabled = true) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'tests', 'student', studentId],
    queryFn: ({ signal }) =>
      api.get<StudentTestResult[]>(`/tests/student/${studentId}`, { signal }),
    enabled,
  });
}

export function useBatchHomework(batchId: string | null) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'homework', 'batch', batchId],
    queryFn: ({ signal }) => api.get<Homework[]>(`/homework/batch/${batchId}`, { signal }),
    enabled: Boolean(batchId),
  });
}

// ---------- Mutations ----------

function useInvalidate(...keys: string[]) {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () =>
    Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [scope, key] })));
}

export function useCreateTest() {
  const invalidate = useInvalidate('tests', 'dashboard');
  return useMutation({
    mutationFn: (input: TestInput) => api.post<Test>('/tests', input),
    onSuccess: invalidate,
  });
}

export function useUpdateTest(id: string) {
  const invalidate = useInvalidate('tests');
  return useMutation({
    mutationFn: (input: TestUpdate) => api.put<Test>(`/tests/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTest() {
  const invalidate = useInvalidate('tests', 'dashboard');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tests/${id}`),
    onSuccess: invalidate,
  });
}

export function useSaveMarks(testId: string) {
  // Results feed the risk engine, so the dashboard's at-risk count may change too
  const invalidate = useInvalidate('tests', 'dashboard');
  return useMutation({
    mutationFn: (results: MarkEntry[]) => api.post<Test>(`/tests/${testId}/marks`, { results }),
    onSuccess: invalidate,
  });
}

export function useCreateHomework() {
  const invalidate = useInvalidate('homework', 'dashboard');
  return useMutation({
    mutationFn: (input: HomeworkInput) => api.post<Homework>('/homework', input),
    onSuccess: invalidate,
  });
}

export function useUpdateHomework(id: string) {
  const invalidate = useInvalidate('homework');
  return useMutation({
    mutationFn: (input: HomeworkUpdate) => api.put<Homework>(`/homework/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteHomework() {
  const invalidate = useInvalidate('homework', 'dashboard');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/homework/${id}`),
    onSuccess: invalidate,
  });
}
