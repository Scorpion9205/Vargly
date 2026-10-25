'use client';

import { UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MonthPicker, useMonthParam } from '@/components/ui/month-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { todayInIndia } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';
import {
  STAFF_STATUSES,
  type StaffDayRow,
  type StaffStatus,
  useSaveStaffDay,
  useStaffDay,
  useStaffMonth,
} from '@/lib/staff-attendance';
import { cn } from '@/lib/utils';
import { useApiError } from '@/lib/use-api-error';

const VIEWS = ['day', 'month'] as const;

export function StaffAttendancePage() {
  const t = useTranslations('StaffAttendance');
  const [view, setView] = useQueryState('view', parseAsStringLiteral(VIEWS).withDefault('day'));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div role="tablist" aria-label={t('viewLabel')} className="flex gap-2">
        {VIEWS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => void setView(value === 'day' ? null : value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              view === value ? 'border-primary bg-brand-soft text-accent-foreground' : 'hover:bg-muted',
            )}
          >
            {t(`view.${value}`)}
          </button>
        ))}
      </div>
      {view === 'day' ? <DayView /> : <MonthView />}
    </div>
  );
}

function DayView() {
  const t = useTranslations('StaffAttendance');
  const today = todayInIndia();
  const [date, setDate] = useState(today);
  const day = useStaffDay(date);

  return (
    <div className="flex flex-col gap-4">
      <div className="sm:w-56">
        <Input
          type="date"
          aria-label={t('date')}
          value={date}
          max={today}
          onChange={(event) => event.target.value && setDate(event.target.value)}
        />
      </div>
      {day.isPending ? (
        <Skeleton className="h-64 rounded-xl" aria-busy="true" />
      ) : day.isError ? (
        <QueryError error={day.error} onRetry={() => void day.refetch()} />
      ) : day.data.length === 0 ? (
        <StatePanel icon={<UserCheck className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        // Keyed by the day and what the server holds, so a saved or reloaded day starts from the server's marks
        <DayForm key={`${date}:${day.data.map((r) => r.status ?? '-').join('')}`} date={date} rows={day.data} />
      )}
    </div>
  );
}

function DayForm({ date, rows }: { date: string; rows: StaffDayRow[] }) {
  const t = useTranslations('StaffAttendance');
  const describeError = useApiError();
  const save = useSaveStaffDay(date);
  const [marks, setMarks] = useState<Record<string, StaffStatus | null>>(() =>
    Object.fromEntries(rows.map((row) => [row.teacherId, row.status])),
  );

  const chosen = Object.entries(marks).filter((entry): entry is [string, StaffStatus] => entry[1] !== null);
  const changed = rows.some((row) => marks[row.teacherId] !== row.status);

  const markAll = (status: StaffStatus) =>
    setMarks(Object.fromEntries(rows.map((row) => [row.teacherId, status])));

  const submit = async () => {
    try {
      await save.mutateAsync(chosen.map(([teacherId, status]) => ({ teacherId, status })));
      toast.success(t('saved'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => markAll('PRESENT')}>
          {t('allPresent')}
        </Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
        {rows.map((row) => (
          <li key={row.teacherId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold">{row.name}</span>
            <div role="group" aria-label={t('statusFor', { name: row.name })} className="flex flex-wrap gap-2">
              {STAFF_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={marks[row.teacherId] === status}
                  onClick={() => setMarks((current) => ({ ...current, [row.teacherId]: status }))}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    marks[row.teacherId] === status
                      ? status === 'ABSENT'
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : 'border-primary bg-brand-soft text-accent-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {t(`status.${status}`)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('marked', { done: chosen.length, total: rows.length })}</p>
        <Button disabled={!changed || chosen.length === 0 || save.isPending} onClick={() => void submit()}>
          {save.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}

function MonthView() {
  const t = useTranslations('StaffAttendance');
  const [month, setMonth] = useMonthParam();
  const summary = useStaffMonth(month);

  return (
    <div className="flex flex-col gap-4">
      <MonthPicker month={month} onChange={setMonth} />
      {summary.isPending ? (
        <Skeleton className="h-48 rounded-xl" aria-busy="true" />
      ) : summary.isError ? (
        <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.data.length === 0 ? (
        <StatePanel icon={<UserCheck className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('month.teacher')}</th>
                  <th className="px-3 py-3 font-medium">{t('status.PRESENT')}</th>
                  <th className="px-3 py-3 font-medium">{t('status.HALF_DAY')}</th>
                  <th className="px-3 py-3 font-medium">{t('status.ABSENT')}</th>
                  <th className="px-3 py-3 font-medium">{t('status.LEAVE')}</th>
                  <th className="px-3 py-3 font-medium">{t('month.salary')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('month.suggested')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.data.map((row) => (
                  <tr key={row.teacherId}>
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      {row.name}
                    </th>
                    <td className="px-3 py-3 tabular-nums">{row.present}</td>
                    <td className="px-3 py-3 tabular-nums">{row.halfDay}</td>
                    <td className="px-3 py-3 tabular-nums">{row.absent}</td>
                    <td className="px-3 py-3 tabular-nums">{row.leave}</td>
                    <td className="px-3 py-3 tabular-nums">{row.monthlySalary === null ? '—' : formatCurrency(row.monthlySalary)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {row.suggestedAmount === null ? '—' : formatCurrency(row.suggestedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">{t('month.note')}</p>
        </>
      )}
    </div>
  );
}
