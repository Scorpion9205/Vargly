'use client';

import { ApiError } from '@vargly/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL } from './api';
import { api, getSession, refreshSession } from './auth/session';
import { useQueryScope } from './queries';

// apps/api papers DTOs (the paper studio)

export const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT', 'LONG'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const PAPER_LANGUAGES = ['en', 'hi', 'hinglish'] as const;
export type PaperLanguage = (typeof PAPER_LANGUAGES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Credits one paper costs, and one question or a small top-up (apps/api paper.service.ts) */
export const GENERATE_PAPER_CREDITS = 5;
export const GENERATE_QUESTION_CREDITS = 1;

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  /** MCQ: A-D. True/false: True or False. Others: the model answer. */
  answer: string;
  marks: number;
  explanation?: string;
}

export interface Paper {
  id: string;
  source: 'AI' | 'UPLOAD';
  status: 'DRAFT' | 'PUBLISHED';
  title: string;
  subject: string;
  topic: string | null;
  language: PaperLanguage | string;
  /** Empty in the list; filled when one paper is opened */
  questions: Question[];
  questionCount: number;
  totalMarks: number;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperShare {
  id: string;
  batchId: string;
  kind: 'HOMEWORK' | 'PRACTICE' | 'MATERIAL';
  link: string;
  homeworkId: string | null;
  openCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
}

export interface PublishResult extends PaperShare {
  activeStudents: number;
  batchName: string;
}

export interface SectionSpec {
  type: QuestionType;
  count: number;
  marks: number;
}

export interface GenerateInput {
  title?: string;
  subject: string;
  topic: string;
  classLevel?: string;
  language: PaperLanguage;
  difficulty: Difficulty;
  instructions?: string;
  sections: SectionSpec[];
}

export interface PublishInput {
  batchId: string;
  kind: 'HOMEWORK' | 'PRACTICE' | 'MATERIAL';
  title?: string;
  dueDate?: string;
}

/** A paper plus how many of the requested questions did not come back usable */
export interface Generated {
  paper: Paper;
  shortBy: number;
}

export function usePapers() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'papers', 'list'],
    queryFn: ({ signal }) => api.get<Paper[]>('/papers', { signal }),
  });
}

export function usePaper(id: string) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'papers', 'detail', id],
    queryFn: ({ signal }) => api.get<Paper>(`/papers/${id}`, { signal }),
  });
}

export function usePaperShares(id: string, enabled: boolean) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'papers', 'shares', id],
    queryFn: ({ signal }) => api.get<PaperShare[]>(`/papers/${id}/shares`, { signal }),
    enabled,
  });
}

function useInvalidatePapers() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: [scope, 'papers'] });
}

// The envelope's `meta` (shortBy) is not part of the unwrapped data, so these read the whole body
async function postGenerating(path: string, body: unknown): Promise<Generated> {
  const response = await api.postEnvelope<{ data: Paper; meta?: { shortBy?: number } }>(path, body);
  return { paper: response.data, shortBy: response.meta?.shortBy ?? 0 };
}

export function useGeneratePaper() {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: (input: GenerateInput) => postGenerating('/papers/generate', input),
    onSuccess: invalidate,
  });
}

export function useAddQuestions(id: string) {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: (input: { section: SectionSpec; instructions?: string }) =>
      postGenerating(`/papers/${id}/questions`, input),
    onSuccess: invalidate,
  });
}

export function useRegenerateQuestion(id: string) {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: (input: { questionId: string; instructions?: string }) =>
      api.post<Paper>(`/papers/${id}/questions/${input.questionId}/regenerate`, {
        instructions: input.instructions,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePaper(id: string) {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: (input: { title?: string; questions?: Question[] }) =>
      api.put<Paper>(`/papers/${id}`, input),
    onSuccess: invalidate,
  });
}

export function usePublishPaper(id: string) {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: (input: PublishInput) => api.post<PublishResult>(`/papers/${id}/publish`, input),
    onSuccess: invalidate,
  });
}

export function useDuplicatePaper(id: string) {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: () => api.post<Paper>(`/papers/${id}/duplicate`),
    onSuccess: invalidate,
  });
}

export function useDeletePaper() {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/papers/${id}`),
    onSuccess: invalidate,
  });
}

export interface UploadInput {
  title: string;
  subject: string;
  file: File;
}

/** The API takes the PDF as base64 in JSON, like the other uploads */
export function useUploadPaper() {
  const invalidate = useInvalidatePapers();
  return useMutation({
    mutationFn: async (input: UploadInput) =>
      api.post<Paper>('/papers/upload', {
        title: input.title,
        subject: input.subject,
        fileName: input.file.name,
        mimeType: 'application/pdf',
        contentBase64: await fileToBase64(input.file),
      }),
    onSuccess: invalidate,
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

// ---------- PDFs: the API client reads JSON only, so these use fetch with the session's token

function fileNameFrom(disposition: string | null, fallback: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* fall through */
    }
  }
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

/** Fetches one of the teacher's PDFs (preview or answer key), renewing an expired token once */
export async function fetchPdf(
  path: string,
  fallbackName: string,
  /** A POST with a JSON body, for PDFs made from what the page sends */
  post?: unknown,
): Promise<{ blob: Blob; fileName: string }> {
  const get = (token?: string) =>
    fetch(`${API_URL}${path}`, {
      ...(post === undefined ? {} : { method: 'POST', body: JSON.stringify(post) }),
      headers: {
        ...(post === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let response = await get(getSession()?.accessToken);
  if (response.status === 401) {
    const renewed = await refreshSession();
    if (renewed) response = await get(renewed.accessToken);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? 'Could not load the PDF',
    );
  }
  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response.headers.get('Content-Disposition'), fallbackName),
  };
}

/** Opens the PDF in a new tab, where the browser's own viewer shows it */
export async function openPdf(path: string, fallbackName: string): Promise<void> {
  const { blob } = await fetchPdf(path, fallbackName);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Long enough for the new tab to load it
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Saves the PDF to the device */
export async function downloadPdf(path: string, fallbackName: string, post?: unknown): Promise<void> {
  const { blob, fileName } = await fetchPdf(path, fallbackName, post);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Marks of a list of questions, without float noise (0.1 + 0.2) */
export function totalMarks(questions: readonly Pick<Question, 'marks'>[]): number {
  return Math.round(questions.reduce((sum, q) => sum + q.marks, 0) * 100) / 100;
}
