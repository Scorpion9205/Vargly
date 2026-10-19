'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// apps/api ops DTOs (Vargly's own console; platform administrators only)

export interface OpsSummary {
  events: { pending: number; failed: number; dead: number };
  paymentsNeedingReview: number;
  failedNotifications24h: number;
}

export interface OpsEvent {
  id: string;
  eventName: string;
  coachingId: string;
  status: 'FAILED' | 'DEAD';
  attempts: number;
  lastError: string | null;
  occurredAt: string;
  updatedAt: string;
}

export interface ReviewPayment {
  id: string;
  orderId: string;
  gatewayPaymentId: string | null;
  type: 'PLAN_UPGRADE' | 'AI_CREDITS';
  planCode: string | null;
  credits: number | null;
  /** Rupees the order was priced at */
  expectedAmount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  coaching: { id: string; name: string; code: string | null; email: string | null; phone: string | null };
}

// The numbers on screen should not go stale while someone watches them
const REFRESH_MS = 30_000;

export function useOpsSummary() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'ops', 'summary'],
    queryFn: ({ signal }) => api.get<OpsSummary>('/admin/ops/summary', { signal }),
    refetchInterval: REFRESH_MS,
  });
}

export function useDeadEvents() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'ops', 'events', 'DEAD'],
    queryFn: ({ signal }) => api.get<OpsEvent[]>('/admin/ops/events?status=DEAD', { signal }),
    refetchInterval: REFRESH_MS,
  });
}

export function useReviewPayments() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'ops', 'payments'],
    queryFn: ({ signal }) => api.get<ReviewPayment[]>('/admin/ops/payments', { signal }),
    refetchInterval: REFRESH_MS,
  });
}

function useRefreshOps() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: [scope, 'ops'] });
}

export function useRetryEvent() {
  const refresh = useRefreshOps();
  return useMutation({
    mutationFn: (id: string) => api.post<{ status: string }>(`/admin/ops/events/${encodeURIComponent(id)}/retry`),
    onSuccess: refresh,
  });
}

export function useResolvePayment() {
  const refresh = useRefreshOps();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post<{ status: string }>(`/admin/ops/payments/${id}/resolve`, { note }),
    onSuccess: refresh,
  });
}
