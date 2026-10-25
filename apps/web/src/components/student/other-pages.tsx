'use client';

import { Download, FileText, LogOut, Megaphone, Pin, ReceiptIndianRupee } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { signOut } from '@/lib/auth/session';
import { THEMES, type Theme, useTheme } from '@/lib/theme';
import { useSession } from '@/lib/auth/use-session';
import { studentLoginId } from '@/lib/auth/roles';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatTime, sortDays } from '@/lib/schedule';
import {
  type PortalBatch,
  usePortalFees,
  usePortalMaterials,
  usePortalNotices,
  usePortalOverview,
  usePortalProfile,
  usePortalSchedule,
} from '@/lib/student-portal';
import { cn } from '@/lib/utils';
import { isApiError } from '@vargly/api-client';
import { PasswordForm } from './password-form';
import { visibleNav } from './nav';

function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}

const card = 'rounded-2xl border bg-card p-5 shadow-card';

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}

// ---------------------------------------------------------------- study material

export function StudentMaterialsPage() {
  const t = useTranslations('Student.materials');
  const materials = usePortalMaterials();
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t('title')} subtitle={t('subtitle')} />
      {materials.isPending ? (
        <ListSkeleton />
      ) : materials.isError ? (
        <QueryError error={materials.error} onRetry={() => void materials.refetch()} />
      ) : materials.data.length === 0 ? (
        <StatePanel icon={<FileText className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <ul className="flex flex-col gap-3">
          {materials.data.map((item) => (
            <li key={item.id} className={cn(card, 'flex items-center justify-between gap-4')}>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap gap-2">
                  <Badge tone={item.kind === 'MATERIAL' ? 'info' : 'brand'}>{t(`kind.${item.kind}`)}</Badge>
                  <Badge>{item.subject}</Badge>
                </div>
                <p className="font-bold break-words">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.batchName} · {formatDate(item.sharedAt)}
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  <Download aria-hidden />
                  {t('download')}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- notices

export function StudentNoticesPage() {
  const t = useTranslations('Student.notices');
  const notices = usePortalNotices();
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t('title')} subtitle={t('subtitle')} />
      {notices.isPending ? (
        <ListSkeleton />
      ) : notices.isError ? (
        <QueryError error={notices.error} onRetry={() => void notices.refetch()} />
      ) : notices.data.length === 0 ? (
        <StatePanel icon={<Megaphone className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <ul className="flex flex-col gap-3">
          {notices.data.map((notice) => (
            <li key={notice.id} className={cn(card, notice.isPinned && 'border-primary/40')}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {notice.isPinned ? (
                  <Badge tone="brand">
                    <Pin aria-hidden />
                    {t('pinned')}
                  </Badge>
                ) : null}
                {notice.batchName ? <Badge>{notice.batchName}</Badge> : null}
              </div>
              <h2 className="font-bold break-words">{notice.title}</h2>
              <p className="mt-1 text-sm break-words whitespace-pre-line text-foreground/90">{notice.content}</p>
              <p className="mt-3 text-xs text-muted-foreground">{formatDate(notice.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- timetable

export function StudentTimetablePage() {
  const t = useTranslations('Student.timetable');
  const days = useTranslations('Student.attendance.weekday');
  const schedule = usePortalSchedule();
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t('title')} subtitle={t('subtitle')} />
      {schedule.isPending ? (
        <ListSkeleton />
      ) : schedule.isError ? (
        <QueryError error={schedule.error} onRetry={() => void schedule.refetch()} />
      ) : schedule.data.length === 0 ? (
        <StatePanel icon={<FileText className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <ul className="flex flex-col gap-3">
          {schedule.data.map((batch: PortalBatch) => (
            <li key={batch.id} className={card}>
              <h2 className="font-bold break-words">{batch.name}</h2>
              {batch.subject ? <p className="text-sm text-muted-foreground">{batch.subject}</p> : null}
              <p className="mt-3 text-lg font-extrabold tabular-nums">
                {batch.startTime ? formatTime(batch.startTime) : t('timeNotSet')}
                {batch.endTime ? ` – ${formatTime(batch.endTime)}` : ''}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('days')}>
                {sortDays(batch.daysOfWeek).map((day) => (
                  <li key={day} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
                    {days.has(day.toLowerCase() as 'mon') ? days(day.toLowerCase() as 'mon') : day}
                  </li>
                ))}
              </ul>
              {batch.teachers.length ? <p className="mt-3 text-sm text-muted-foreground">{t('teachers', { names: batch.teachers.join(', ') })}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- fees (when the institute shows them)

export function StudentFeesPage() {
  const t = useTranslations('Student.fees');
  const overview = usePortalOverview();
  const fees = usePortalFees(overview.data?.showFees === true);
  const hidden = overview.data?.showFees === false || (fees.isError && isApiError(fees.error) && fees.error.code === 'FEES_HIDDEN');

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t('title')} subtitle={t('subtitle')} />
      {overview.isPending || (fees.isPending && !hidden) ? (
        <ListSkeleton />
      ) : hidden ? (
        <StatePanel icon={<ReceiptIndianRupee className="size-5" aria-hidden />} title={t('hidden.title')}>
          <p>{t('hidden.body')}</p>
        </StatePanel>
      ) : fees.isError ? (
        <QueryError error={fees.error} onRetry={() => void fees.refetch()} />
      ) : !fees.data ? (
        <ListSkeleton />
      ) : fees.data.plans.length === 0 ? (
        <StatePanel icon={<ReceiptIndianRupee className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className={card}>
              <p className="text-xs font-medium text-muted-foreground">{t('balance')}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{formatCurrency(fees.data.totals.balance)}</p>
            </div>
            <div className={card}>
              <p className="text-xs font-medium text-muted-foreground">{t('overdue')}</p>
              <p className={cn('mt-1 text-2xl font-extrabold tabular-nums', fees.data.totals.overdue > 0 && 'text-destructive')}>
                {formatCurrency(fees.data.totals.overdue)}
              </p>
            </div>
          </section>
          {fees.data.plans.map((plan) => (
            <section key={plan.id} className={card} aria-label={t('plan', { year: plan.academicYear })}>
              <h2 className="mb-3 font-bold">{t('plan', { year: plan.academicYear })}</h2>
              <ul className="flex flex-col divide-y">
                {plan.installments.map((installment) => (
                  <li key={installment.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{t('instalment', { number: installment.number })}</p>
                        <p className="text-xs text-muted-foreground">{t('due', { date: formatDate(installment.dueDate) })}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{formatCurrency(installment.amount)}</p>
                        <Badge tone={installment.balance === 0 ? 'success' : installment.overdue ? 'danger' : 'warning'}>
                          {installment.balance === 0 ? t('paid') : installment.overdue ? t('overdueBadge', { amount: formatCurrency(installment.balance) }) : t('pending', { amount: formatCurrency(installment.balance) })}
                        </Badge>
                      </div>
                    </div>
                    {installment.payments.map((payment) => (
                      <p key={payment.receiptNumber} className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span>
                          {t('paidOn', { amount: formatCurrency(payment.amount), date: formatDate(payment.paidAt) })}
                        </span>
                        <a href={payment.receiptLink} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                          {t('receipt', { number: payment.receiptNumber })}
                        </a>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- profile

export function StudentProfilePage() {
  const t = useTranslations('Student.profile');
  const user = useSession()?.user;
  const profile = usePortalProfile();
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t('title')} />
      {profile.isPending ? (
        <ListSkeleton />
      ) : profile.isError ? (
        <QueryError error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <section className={card}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Detail label={t('name')} value={profile.data.name} />
            <Detail label={t('studentId')} value={profile.data.loginId ?? (user ? studentLoginId(user) : '')} />
            <Detail label={t('roll')} value={profile.data.rollNumber} />
            <Detail label={t('institute')} value={profile.data.institute} />
            <Detail label={t('joined')} value={formatDate(profile.data.joiningDate)} />
            <Detail label={t('batches')} value={profile.data.batches.map((b) => b.name).join(', ')} />
          </dl>
        </section>
      )}
      <ThemeChoice />
      <PasswordForm first={false} />
      <Button variant="outline" className="self-start" onClick={() => void signOut()}>
        <LogOut aria-hidden />
        {t('signOut')}
      </Button>
    </div>
  );
}

/** Light, dark, or whatever the phone is set to */
function ThemeChoice() {
  const t = useTranslations('Student.profile');
  const [theme, setTheme] = useTheme();
  return (
    <section className={card} aria-labelledby="theme-title">
      <h2 id="theme-title" className="mb-3 font-bold">
        {t('theme')}
      </h2>
      <div role="radiogroup" aria-labelledby="theme-title" className="grid grid-cols-3 gap-2">
        {THEMES.map((value: Theme) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              theme === value ? 'border-primary bg-brand-soft text-accent-foreground' : 'hover:bg-muted',
            )}
          >
            {t(`themes.${value}`)}
          </button>
        ))}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold break-words">{value || '—'}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- "More" (a phone's bottom bar has room for four)

export function StudentMorePage() {
  const t = useTranslations('Student.more');
  const nav = useTranslations('Student.nav');
  const overview = usePortalOverview();
  const items = visibleNav(overview.data?.showFees ?? false, overview.data?.doubtsEnabled ?? false).slice(4);
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t('title')} />
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className={cn(card, 'flex items-center gap-3 p-4 font-semibold')}>
              <item.icon className="size-5 text-primary" aria-hidden />
              {nav(item.key)}
            </Link>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="self-start" onClick={() => void signOut()}>
        <LogOut aria-hidden />
        {t('signOut')}
      </Button>
    </div>
  );
}
