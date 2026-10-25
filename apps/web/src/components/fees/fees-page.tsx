'use client';

import {
  AlertTriangle,
  CircleCheck,
  IndianRupee,
  MessageCircle,
  ReceiptIndianRupee,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toaster';
import { useApiError } from '@/lib/use-api-error';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { QueryError } from '@/components/dashboard/query-error';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { can } from '@/lib/auth/permissions';
import { useSession } from '@/lib/auth/use-session';
import { todayInIndia } from '@/lib/dates';
import { fromPaise, type OverdueInstallment, toPaise, useOverdueFees, useRemindOverdue } from '@/lib/fees';
import { formatCurrency, formatDate } from '@/lib/format';
import { whatsappLink } from '@/lib/phone';
import { useCoachingProfile, useOwnerDashboard } from '@/lib/queries';

export interface OverdueStudent {
  studentId: string;
  studentName: string;
  parent: { name: string; phone: string } | null;
  total: number;
  instalments: number;
  /** YYYY-MM-DD of the oldest unpaid due date */
  oldestDue: string;
}

/** One row per student: everything they owe, and how long the oldest part has been due */
export function groupOverdue(items: OverdueInstallment[]): OverdueStudent[] {
  const byStudent = new Map<string, OverdueStudent & { paise: number }>();
  for (const item of items) {
    if (!item.student) continue;
    const due = item.dueDate.slice(0, 10);
    const row = byStudent.get(item.student.id) ?? {
      studentId: item.student.id,
      studentName: item.student.name,
      parent: item.parent ?? null,
      total: 0,
      paise: 0,
      instalments: 0,
      oldestDue: due,
    };
    row.paise += toPaise(item.pendingAmount);
    row.instalments += 1;
    if (due < row.oldestDue) row.oldestDue = due;
    byStudent.set(item.student.id, row);
  }
  return [...byStudent.values()]
    .map(({ paise, ...row }) => ({ ...row, total: fromPaise(paise) }))
    .sort((a, b) => a.oldestDue.localeCompare(b.oldestDue) || b.total - a.total);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function FeesPage() {
  const t = useTranslations('Fees');
  const common = useTranslations('Common');
  const user = useSession()?.user;
  const isOwner = can(user, 'dashboard:owner');
  const dashboard = useOwnerDashboard(isOwner);
  const overdue = useOverdueFees();
  const institute = useCoachingProfile();
  const [search, setSearch] = useState('');
  const [confirmingAll, setConfirmingAll] = useState(false);
  const remindAll = useRemindOverdue();
  const describeError = useApiError();
  const today = todayInIndia();

  const sendAll = async () => {
    try {
      const result = await remindAll.mutateAsync();
      toast.success(t('overdue.remindAllDone', { count: result.students }));
      setConfirmingAll(false);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const students = overdue.data ? groupOverdue(overdue.data) : [];
  const totalOverdue = fromPaise(students.reduce((sum, row) => sum + toPaise(row.total), 0));
  const query = search.toLowerCase();
  const visible = students.filter(
    (row) =>
      !query ||
      row.studentName.toLowerCase().includes(query) ||
      row.parent?.name.toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} />

      <section className="enter-stagger grid grid-cols-2 gap-4 lg:grid-cols-3">
        {isOwner && dashboard.data ? (
          <>
            <KpiCard
              label={t('kpi.collected')}
              value={formatCurrency(dashboard.data.metrics.monthlyRevenue)}
              icon={IndianRupee}
            />
            <KpiCard
              label={t('kpi.pending')}
              value={formatCurrency(dashboard.data.metrics.monthlyPendingFees)}
              icon={ReceiptIndianRupee}
            />
          </>
        ) : null}
        <KpiCard
          label={t('kpi.overdue')}
          value={overdue.data ? formatCurrency(totalOverdue) : '—'}
          icon={AlertTriangle}
          tone={totalOverdue > 0 ? 'attention' : 'default'}
          className={isOwner ? 'col-span-2 lg:col-span-1' : undefined}
        />
      </section>

      <section aria-labelledby="overdue-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="overdue-title" className="text-lg font-bold">
              {t('overdue.title')}
            </h2>
            {students.length ? (
              <p className="text-sm text-muted-foreground">
                {t('overdue.count', {
                  count: students.length,
                  amount: formatCurrency(totalOverdue),
                })}
              </p>
            ) : null}
          </div>
          {students.length ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="outline" onClick={() => setConfirmingAll(true)}>
                <MessageCircle className="text-whatsapp" aria-hidden />
                {t('overdue.remindAll')}
              </Button>
            <SearchInput
              value={search}
              onSearch={setSearch}
              delayMs={0}
              label={t('overdue.searchLabel')}
              placeholder={t('overdue.searchPlaceholder')}
              clearLabel={common('clearSearch')}
            />
            </div>
          ) : null}
        </div>

        <ConfirmDialog
          open={confirmingAll}
          onOpenChange={setConfirmingAll}
          title={t('overdue.remindAllTitle', { count: students.length })}
          description={t('overdue.remindAllBody')}
          confirmLabel={t('overdue.remindAllConfirm')}
          cancelLabel={common('cancel')}
          pending={remindAll.isPending}
          onConfirm={() => void sendAll()}
        />

        {overdue.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : overdue.isError ? (
          <QueryError error={overdue.error} onRetry={() => void overdue.refetch()} />
        ) : students.length === 0 ? (
          <StatePanel
            icon={<CircleCheck className="size-5" aria-hidden />}
            title={t('overdue.empty')}
          />
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('overdue.noMatch', { search })}</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
            {visible.map((row) => {
              const message = row.parent
                ? t('overdue.reminder', {
                    parent: row.parent.name,
                    institute: institute.data?.name ?? '',
                    amount: formatCurrency(row.total),
                    student: row.studentName,
                    date: formatDate(row.oldestDue),
                  })
                : '';
              return (
                <li
                  key={row.studentId}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/app/students/${row.studentId}#fees`}
                      className="font-semibold hover:underline"
                    >
                      {row.studentName}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {t('overdue.instalments', { count: row.instalments })} ·{' '}
                      {t('overdue.late', { days: daysBetween(row.oldestDue, today) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-bold text-destructive tabular-nums">
                      {formatCurrency(row.total)}
                    </span>
                    {row.parent ? (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={`${whatsappLink(row.parent.phone)}?text=${encodeURIComponent(message)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="text-whatsapp" aria-hidden />
                          {t('overdue.remind')}
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('overdue.noParent')}</span>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/app/students/${row.studentId}#fees`}>{t('overdue.open')}</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
