'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QueryError } from '@/components/dashboard/query-error';
import { MonthPicker, useMonthParam } from '@/components/ui/month-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { type AttendanceStatus, calendarCells, dayStatus, isLow, usePortalAttendance } from '@/lib/student-portal';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success/15 text-success',
  LATE: 'bg-warning/15 text-warning',
  ABSENT: 'bg-destructive/15 text-destructive',
  EXCUSED: 'bg-info/15 text-info',
};

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function StudentAttendancePage() {
  const t = useTranslations('Student.attendance');
  const [month, setMonth] = useMonthParam();
  const attendance = usePortalAttendance(month);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <MonthPicker month={month} onChange={setMonth} />

      {attendance.isPending ? (
        <Skeleton className="h-80 rounded-2xl" aria-busy="true" />
      ) : attendance.isError ? (
        <QueryError error={attendance.error} onRetry={() => void attendance.refetch()} />
      ) : (
        <>
          {isLow(attendance.data.overall, attendance.data.threshold) ? (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>{t('low', { percent: attendance.data.overall.percentage ?? 0, level: attendance.data.threshold })}</p>
            </div>
          ) : null}

          <section aria-label={t('summary')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('monthPercent')} value={attendance.data.summary.percentage === null ? '—' : `${attendance.data.summary.percentage}%`} />
            <Stat label={t('present')} value={String(attendance.data.summary.present + attendance.data.summary.late)} />
            <Stat label={t('absent')} value={String(attendance.data.summary.absent)} tone={attendance.data.summary.absent > 0 ? 'bad' : undefined} />
            <Stat label={t('overall')} value={attendance.data.overall.percentage === null ? '—' : `${attendance.data.overall.percentage}%`} />
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-card" aria-label={t('calendar')}>
            <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAY_KEYS.map((key) => (
                <span key={key}>{t(`weekday.${key}`)}</span>
              ))}
            </div>
            <ul className="grid grid-cols-7 gap-1.5">
              {calendarCells(attendance.data.month, attendance.data.days).map((cell, index) => {
                if (!cell) return <li key={`blank-${index}`} aria-hidden />;
                const status = dayStatus(cell.statuses);
                return (
                  <li
                    key={cell.date}
                    aria-label={status ? t('dayLabel', { date: formatDate(cell.date), status: t(`status.${status}`) }) : formatDate(cell.date)}
                    className={cn(
                      'grid aspect-square place-items-center rounded-lg text-sm font-semibold tabular-nums',
                      status ? STATUS_STYLE[status] : 'text-muted-foreground',
                    )}
                  >
                    {cell.day}
                  </li>
                );
              })}
            </ul>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const).map((status) => (
                <li key={status} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('size-3 rounded', STATUS_STYLE[status])} />
                  {t(`status.${status}`)}
                </li>
              ))}
            </ul>
          </section>

          {attendance.data.days.length === 0 ? <p className="text-center text-sm text-muted-foreground">{t('none')}</p> : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-extrabold tabular-nums', tone === 'bad' && 'text-destructive')}>{value}</p>
    </div>
  );
}
