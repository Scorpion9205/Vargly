'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// ---------- Types (apps/api fees DTOs; money in rupees, dates as ISO strings) ----------

export const PAYMENT_METHODS = [
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CHEQUE',
  'CARD',
  'ONLINE',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type DiscountType = 'PERCENTAGE' | 'FIXED';
export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED' | 'OVERDUE';

export interface FeeTransaction {
  id: string;
  installmentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef?: string | null;
  receiptNumber: string;
  paidAt: string;
  remarks?: string | null;
}

export interface FeeInstallment {
  id: string;
  feePlanId: string;
  installmentNo: number;
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  dueDate: string;
  status: InstallmentStatus;
  transactions?: FeeTransaction[];
}

export interface FeePlan {
  id: string;
  studentId: string;
  studentName?: string;
  totalAmount: number;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  finalAmount: number;
  academicYear: string;
  totalPaid: number;
  /** Still collectable: the fee minus payments and waivers */
  totalPending: number;
  totalWaived?: number;
  installments?: FeeInstallment[];
  createdAt: string;
}

export interface FeePlanInput {
  studentId: string;
  totalAmount: number;
  discountType?: DiscountType;
  discountValue?: number;
  academicYear: string;
  installments: Array<{ installmentNo: number; amount: number; dueDate: string }>;
}

export interface PaymentInput {
  installmentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef?: string;
  remarks?: string;
}

/** GET /fees/defaulters: unpaid instalments whose due date has passed, oldest first */
export interface OverdueInstallment {
  installmentId: string;
  installmentNo: number;
  amount: number;
  paidAmount: number;
  pendingAmount: number;
  dueDate: string;
  status: InstallmentStatus;
  student?: { id: string; name: string; phone?: string | null };
  parent?: { name: string; phone: string } | null;
}

// ---------- Money (whole paise, so sums are exact like the API's decimals) ----------

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => paise / 100;

/** The amount after discount, rounded to the paisa exactly as the API computes it */
export function finalAmount(total: number, type?: DiscountType, value?: number): number {
  const totalPaise = toPaise(total);
  if (!type || !value || value <= 0) return fromPaise(totalPaise);
  const discount = type === 'PERCENTAGE' ? (totalPaise * value) / 100 : toPaise(value);
  return fromPaise(Math.max(0, Math.round(totalPaise - discount)));
}

/**
 * Splits an amount into `count` instalments whose sum is exactly the amount: every part gets an
 * equal share of paise and the last takes the leftover (₹10,000 / 3 -> 3,333.33 ×2 + 3,333.34).
 */
export function splitAmount(amount: number, count: number): number[] {
  const paise = toPaise(amount);
  const base = Math.floor(paise / count);
  return Array.from({ length: count }, (_, i) =>
    fromPaise(i === count - 1 ? paise - base * (count - 1) : base),
  );
}

/** The same day `months` later, clamped to the month's end (31 Jan + 1 month -> 28/29 Feb) */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  if (!y || !m || !d) return day;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Sum in paise, so floating-point error never shows up in a total */
export function sumRupees(values: number[]): number {
  return fromPaise(values.reduce((acc, value) => acc + toPaise(value), 0));
}

/** Unpaid, not waived, and its due day has passed (the API never stores OVERDUE itself) */
export function isOverdue(installment: FeeInstallment, today: string): boolean {
  return (
    (installment.status === 'PENDING' ||
      installment.status === 'PARTIAL' ||
      installment.status === 'OVERDUE') &&
    installment.dueDate.slice(0, 10) < today
  );
}

export function canPay(installment: FeeInstallment): boolean {
  return (
    installment.status !== 'PAID' &&
    installment.status !== 'WAIVED' &&
    installment.balanceAmount > 0
  );
}

// ---------- Queries and mutations ----------

export function useStudentFees(studentId: string, enabled = true) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'fees', 'student', studentId],
    queryFn: ({ signal }) => api.get<FeePlan[]>(`/fees/students/${studentId}`, { signal }),
    enabled,
  });
}

/** Sends every parent with overdue fees one WhatsApp reminder; returns how many students were reminded */
export function useRemindOverdue() {
  return useMutation({
    mutationFn: () => api.post<{ students: number }>('/fees/remind-overdue', {}),
  });
}

export function useOverdueFees() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'fees', 'overdue'],
    queryFn: ({ signal }) => api.get<OverdueInstallment[]>('/fees/defaulters', { signal }),
  });
}

/** Fee changes also move the dashboard's collected/pending figures */
function useInvalidateFees() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () =>
    Promise.all(
      ['fees', 'dashboard'].map((key) => queryClient.invalidateQueries({ queryKey: [scope, key] })),
    );
}

export function useCreateFeePlan() {
  const invalidate = useInvalidateFees();
  return useMutation({
    mutationFn: (input: FeePlanInput) => api.post<FeePlan>('/fees/plans', input),
    onSuccess: invalidate,
  });
}

export function useRecordPayment() {
  const invalidate = useInvalidateFees();
  return useMutation({
    mutationFn: (input: PaymentInput) => api.post<FeeTransaction>('/fees/pay', input),
    onSuccess: invalidate,
  });
}

export function useWaiveInstallment() {
  const invalidate = useInvalidateFees();
  return useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks?: string }) =>
      api.post(`/fees/installments/${id}/waive`, remarks ? { remarks } : {}),
    onSuccess: invalidate,
  });
}

/** A rupee amount as typed: "25000", "2,500.50" (commas allowed), at most two decimals */
export function parseRupees(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}
