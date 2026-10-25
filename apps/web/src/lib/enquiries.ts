'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { todayInIndia } from './dates';
import { useQueryScope } from './queries';

// apps/api enquiry DTOs; follow-up days are YYYY-MM-DD

/** How an enquiry reached the institute; ONLINE_FORM is set by the public page, not chosen by the owner */
export const ENQUIRY_SOURCES = ['WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'OTHER', 'ONLINE_FORM'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

/** The sources the owner can pick when noting down an enquiry by hand */
export const MANUAL_SOURCES = ENQUIRY_SOURCES.filter((source) => source !== 'ONLINE_FORM');

export const ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'ADMITTED', 'NOT_INTERESTED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  studentName: string | null;
  interestedIn: string | null;
  source: EnquirySource;
  status: EnquiryStatus;
  notes: string | null;
  followUpOn: string | null;
  lastContactedAt: string | null;
  /** The student this enquiry became, once admitted */
  studentId: string | null;
  createdAt: string;
}

export interface EnquiryInput {
  name: string;
  phone: string;
  studentName: string | null;
  interestedIn: string | null;
  source: EnquirySource;
  notes: string | null;
  followUpOn: string | null;
}

export interface EnquirySummary {
  total: number;
  byStatus: Record<EnquiryStatus, number>;
  dueToday: number;
}

/** What the list shows: everything, one status, or the calls that are due */
export const ENQUIRY_VIEWS = ['all', 'due', ...ENQUIRY_STATUSES] as const;
export type EnquiryView = (typeof ENQUIRY_VIEWS)[number];

/** An open enquiry whose follow-up day has come (or passed) */
export function isDue(enquiry: Pick<Enquiry, 'status' | 'followUpOn'>, today = todayInIndia()): boolean {
  return (
    (enquiry.status === 'NEW' || enquiry.status === 'CONTACTED') &&
    Boolean(enquiry.followUpOn) &&
    (enquiry.followUpOn as string) <= today
  );
}

export function useEnquiries(view: EnquiryView, search: string) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'enquiries', 'list', view, search],
    queryFn: ({ signal }) =>
      api.get<Enquiry[]>('/enquiries', {
        signal,
        query: {
          status: view === 'all' || view === 'due' ? undefined : view,
          due: view === 'due' ? 'true' : undefined,
          search: search || undefined,
        },
      }),
  });
}

export function useEnquirySummary() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'enquiries', 'summary'],
    queryFn: ({ signal }) => api.get<EnquirySummary>('/enquiries/summary', { signal }),
  });
}

function useInvalidateEnquiries() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: [scope, 'enquiries'] });
}

export function useCreateEnquiry() {
  const invalidate = useInvalidateEnquiries();
  return useMutation({
    mutationFn: (input: EnquiryInput) => api.post<Enquiry>('/enquiries', input),
    onSuccess: invalidate,
  });
}

export function useUpdateEnquiry(id: string) {
  const invalidate = useInvalidateEnquiries();
  return useMutation({
    mutationFn: (input: Partial<EnquiryInput> & { status?: EnquiryStatus }) =>
      api.put<Enquiry>(`/enquiries/${id}`, input),
    onSuccess: invalidate,
  });
}

export interface AdmitInput {
  firstName: string;
  lastName: string;
  relation: 'GUARDIAN' | 'MOTHER' | 'FATHER';
  batchId?: string;
}

/** Makes the enquiry a student (with the parent linked and a batch if chosen) and marks it admitted */
export function useAdmitEnquiry(id: string) {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return useMutation({
    mutationFn: (input: AdmitInput) => api.post<Enquiry>(`/enquiries/${id}/admit`, input),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [scope, 'enquiries'] }),
      queryClient.invalidateQueries({ queryKey: [scope, 'students'] }),
    ]),
  });
}

export function useDeleteEnquiry() {
  const invalidate = useInvalidateEnquiries();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/enquiries/${id}`),
    onSuccess: invalidate,
  });
}
