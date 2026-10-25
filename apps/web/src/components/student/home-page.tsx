'use client';

import { AlertTriangle, ArrowRight, CalendarCheck, ClipboardCheck, Clock, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatTime } from '@/lib/schedule';
import { isLow, type PortalHomework, usePortalOverview } from '@/lib/student-portal';
import { cn } from '@/lib/utils';

const card = 'rounded-2xl border bg-card p-5 shadow-card';

function SectionTitle({ icon: Icon, title, href, linkLabel }: { icon: typeof Clock; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Icon className="size-4 text-primary" aria-hidden />
        {title}
      </h2>
      {href && linkLabel ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {linkLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export function dueLabelKey(homework: Pick<PortalHomework, 'status'>): 'overdue' | 'today' | 'upcoming' {
  return homework.status === 'OVERDUE' ? 'overdue' : homework.status === 'DUE_TODAY' ? 'today' : 'upcoming';
}

export function StudentHomePage() {
  const t = useTranslations('Student.home');
  const overview = usePortalOverview();

  if (overview.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (overview.isError) return <QueryError error={overview.error} onRetry={() => void overview.refetch()} />;

  const data = overview.data;
  const first = data.student.name.split(' ')[0];
  const attendance = data.attendance;
  const low = isLow(attendance.overall, attendance.threshold);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('greeting', { name: first })}</h1>
        <p className="text-sm text-muted-foreground">{formatDate(data.today)}</p>
      </header>

      {low ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>{t('lowAttendance', { percent: attendance.overall.percentage ?? 0, level: attendance.threshold })}</p>
        </div>
      ) : null}

      <section aria-label={t('stats')} className="grid grid-cols-3 gap-3">
        <Link href="/student/attendance" className={cn(card, 'p-4')}>
          <p className="text-xs font-medium text-muted-foreground">{t('attendance')}</p>
          <p className={cn('mt-1 text-2xl font-extrabold tabular-nums', low && 'text-destructive')}>
            {attendance.overall.percentage === null ? '—' : `${attendance.overall.percentage}%`}
          </p>
        </Link>
        <Link href="/student/homework" className={cn(card, 'p-4')}>
          <p className="text-xs font-medium text-muted-foreground">{t('homeworkOpen')}</p>
          <p className={cn('mt-1 text-2xl font-extrabold tabular-nums', data.homework.overdue > 0 && 'text-destructive')}>{data.homework.open}</p>
        </Link>
        <Link href="/student/results" className={cn(card, 'p-4')}>
          <p className="text-xs font-medium text-muted-foreground">{t('average')}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{data.averagePercentage === null ? '—' : `${data.averagePercentage}%`}</p>
        </Link>
      </section>

      <section className={card} aria-labelledby="today-title">
        <SectionTitle icon={Clock} title={t('today')} href="/student/timetable" linkLabel={t('timetable')} />
        <span id="today-title" className="sr-only">{t('today')}</span>
        {data.classesToday.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noClasses')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.classesToday.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name}</p>
                  {c.teachers.length ? <p className="truncate text-xs text-muted-foreground">{c.teachers.join(', ')}</p> : null}
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">
                  {c.startTime ? formatTime(c.startTime) : ''}
                  {c.endTime ? ` – ${formatTime(c.endTime)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <SectionTitle icon={CalendarCheck} title={t('homework')} href="/student/homework" linkLabel={t('seeAll')} />
        {data.homework.next.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('allDone')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.homework.next.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{h.batchName}</p>
                </div>
                <Badge tone={h.status === 'OVERDUE' ? 'danger' : h.status === 'DUE_TODAY' ? 'warning' : 'neutral'}>
                  {t(`due.${dueLabelKey(h)}`, { date: formatDate(h.dueDate) })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.latestResult ? (
        <section className={card}>
          <SectionTitle icon={ClipboardCheck} title={t('latestResult')} href="/student/results" linkLabel={t('seeAll')} />
          <p className="font-semibold">{data.latestResult.title}</p>
          <p className="text-xs text-muted-foreground">
            {data.latestResult.subject} · {formatDate(data.latestResult.date)}
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums">
            {data.latestResult.absent ? t('absent') : `${data.latestResult.marks} / ${data.latestResult.totalMarks}`}
          </p>
          {data.latestResult.standing ? (
            <p className="text-sm text-muted-foreground">
              {t('standing', { rank: data.latestResult.standing.rank, outOf: data.latestResult.standing.outOf })}
            </p>
          ) : null}
        </section>
      ) : null}

      {data.fees && data.fees.balance > 0 ? (
        <Link href="/student/fees" className={cn(card, 'flex items-center justify-between gap-3')}>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('feesDue')}</p>
            <p className={cn('text-xl font-extrabold tabular-nums', data.fees.overdue > 0 && 'text-destructive')}>{formatCurrency(data.fees.balance)}</p>
            {data.fees.nextDue ? <p className="text-xs text-muted-foreground">{t('nextDue', { date: formatDate(data.fees.nextDue.dueDate) })}</p> : null}
          </div>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      {data.notices.length ? (
        <section className={card}>
          <SectionTitle icon={Megaphone} title={t('notices')} href="/student/notices" linkLabel={t('seeAll')} />
          <ul className="flex flex-col gap-3">
            {data.notices.map((n) => (
              <li key={n.id}>
                <p className="font-semibold break-words">{n.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{n.content}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
