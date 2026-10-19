'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { todayInIndia } from './dates';
import { useQueryScope } from './queries';

// apps/api enquiry DTOs; follow-up days are YYYY-MM-DD

export const ENQUIRY_SOURCES = ['WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'OTHER'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

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

export function useDeleteEnquiry() {
  const invalidate = useInvalidateEnquiries();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/enquiries/${id}`),
    onSuccess: invalidate,
  });
}
