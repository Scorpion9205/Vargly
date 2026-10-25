'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CoachingProfile } from './api-types';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// apps/api settings and coaching DTOs

export const DEFAULT_RECEIPT_PREFIX = 'RCT';
export const RECEIPT_PREFIX_PATTERN = /^[A-Z0-9]{2,10}$/;

export interface InstituteSettings {
  config: {
    receiptPrefix?: string;
    notifications?: { whatsappEnabled?: boolean };
    /** What students may use: the panel is on unless switched off, and fees stay hidden unless shown */
    studentPortal?: { enabled?: boolean; showFees?: boolean; doubts?: boolean };
    /** Where registration stored the switch before settings existed */
    channels?: { whatsappEnabled?: boolean };
  };
  updatedAt: string;
}

export interface Preferences {
  receiptPrefix: string;
  whatsappEnabled: boolean;
}

/** Mirrors the API's reading of the config (apps/api settings.preferences) */
export function preferencesOf(settings: InstituteSettings | undefined): Preferences {
  const config = settings?.config ?? {};
  const prefix = config.receiptPrefix ?? '';
  return {
    receiptPrefix: RECEIPT_PREFIX_PATTERN.test(prefix) ? prefix : DEFAULT_RECEIPT_PREFIX,
    whatsappEnabled:
      (config.notifications?.whatsappEnabled ?? config.channels?.whatsappEnabled) !== false,
  };
}

/** Indian financial year label for a day, e.g. "2026-27" (receipts are numbered per year) */
export function financialYearLabel(day: string): string {
  const year = Number(day.slice(0, 4));
  const start = Number(day.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export interface InstituteUpdate {
  name?: string;
  phone?: string;
  email?: string;
  /** null clears */
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export function useInstituteSettings(enabled = true) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'settings'],
    queryFn: ({ signal }) => api.get<InstituteSettings>('/settings', { signal }),
    enabled,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return useMutation({
    mutationFn: (input: {
      receiptPrefix?: string;
      notifications?: { whatsappEnabled: boolean };
      studentPortal?: { enabled?: boolean; showFees?: boolean; doubts?: boolean };
    }) =>
      api.put<InstituteSettings>('/settings', input),
    onSuccess: (settings) => queryClient.setQueryData([scope, 'settings'], settings),
  });
}

export function useUpdateInstitute() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return useMutation({
    mutationFn: (input: InstituteUpdate) => api.put<CoachingProfile>('/coachings/me', input),
    // The shell shows the institute's name, so everything reading the profile updates at once
    onSuccess: (profile) => queryClient.setQueryData([scope, 'coaching', 'me'], profile),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', input),
  });
}

export function useSignOutEverywhere() {
  return useMutation({ mutationFn: () => api.post('/auth/logout-all') });
}
