'use client';

import { isApiError } from '@vargly/api-client';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  type OpsEvent,
  type ReviewPayment,
  useDeadEvents,
  useOpsSummary,
  useResolvePayment,
  useRetryEvent,
  useReviewPayments,
} from '@/lib/ops';
import { cn } from '@/lib/utils';

/** Vargly's own console: what needs a person's attention right now. Platform administrators only. */
export function AdminPage() {
  const t = useTranslations('Admin');
  const summary = useOpsSummary();
  const payments = useReviewPayments();
  const events = useDeadEvents();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {summary.isError ? (
        <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <section aria-label={t('summary.label')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Counter
            label={t('summary.payments')}
            value={summary.data?.paymentsNeedingReview}
            alarm
          />
          <Counter label={t('summary.dead')} value={summary.data?.events.dead} alarm />
          <Counter label={t('summary.failed')} value={summary.data?.events.failed} />
          <Counter label={t('summary.notifications')} value={summary.data?.failedNotifications24h} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t('payments.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('payments.body')}</p>
        {payments.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : payments.isError ? (
          <QueryError error={payments.error} onRetry={() => void payments.refetch()} />
        ) : payments.data.length === 0 ? (
          <StatePanel icon={<CheckCircle2 className="size-5" aria-hidden />} title={t('payments.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {payments.data.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t('events.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('events.body')}</p>
        {events.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : events.isError ? (
          <QueryError error={events.error} onRetry={() => void events.refetch()} />
        ) : events.data.length === 0 ? (
          <StatePanel icon={<CheckCircle2 className="size-5" aria-hidden />} title={t('events.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {events.data.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Counter({ label, value, alarm = false }: { label: string; value?: number; alarm?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-9 w-16" />
      ) : (
        <p
          className={cn(
            'mt-1 text-3xl font-extrabold tabular-nums',
            alarm && value > 0 && 'text-destructive',
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

function PaymentCard({ payment }: { payment: ReviewPayment }) {
  const t = useTranslations('Admin.payments');
  const resolve = useResolvePayment();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const what =
    payment.type === 'AI_CREDITS'
      ? t('credits', { credits: payment.credits ?? 0 })
      : t('plan', { plan: payment.planCode ?? '—' });

  const submit = () =>
    resolve.mutate(
      { id: payment.id, note: note.trim() },
      {
        onSuccess: () => toast.success(t('resolved')),
        onError: (error) => toast.error(errorMessage(error, t('resolveFailed'))),
      },
    );

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">
            {payment.coaching.name}
            {payment.coaching.code ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">{payment.coaching.code}</span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {what} · {t('expected', { amount: formatCurrency(payment.expectedAmount) })}
          </p>
        </div>
        <Badge tone="danger">{t('badge')}</Badge>
      </div>

      {payment.note ? <p className="text-sm whitespace-pre-line">{payment.note}</p> : null}

      <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline">{t('order')}: </dt>
          <dd className="inline font-mono break-all">{payment.orderId}</dd>
        </div>
        {payment.gatewayPaymentId ? (
          <div>
            <dt className="inline">{t('gatewayPayment')}: </dt>
            <dd className="inline font-mono break-all">{payment.gatewayPaymentId}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline">{t('contact')}: </dt>
          <dd className="inline">
            {[payment.coaching.phone, payment.coaching.email].filter(Boolean).join(' · ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="inline">{t('flagged')}: </dt>
          <dd className="inline">{formatDateTime(payment.updatedAt)}</dd>
        </div>
      </dl>

      {open ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim().length >= 3) submit();
          }}
        >
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('notePlaceholder')}
            aria-label={t('noteLabel')}
            maxLength={500}
            autoFocus
          />
          <Button type="submit" disabled={note.trim().length < 3 || resolve.isPending} aria-busy={resolve.isPending}>
            {resolve.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t('confirm')}
          </Button>
        </form>
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('resolve')}
          </Button>
        </div>
      )}
    </li>
  );
}

function EventCard({ event }: { event: OpsEvent }) {
  const t = useTranslations('Admin.events');
  const retry = useRetryEvent();

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{event.eventName}</p>
          <p className="text-sm text-muted-foreground">
            {t('meta', { attempts: event.attempts, when: formatDateTime(event.updatedAt) })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={retry.isPending}
          aria-busy={retry.isPending}
          onClick={() =>
            retry.mutate(event.id, {
              onSuccess: () => toast.success(t('requeued')),
              onError: (error) => toast.error(errorMessage(error, t('retryFailed'))),
            })
          }
        >
          {retry.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          {t('retry')}
        </Button>
      </div>
      {event.lastError ? (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs break-words whitespace-pre-wrap">
          {event.lastError}
        </pre>
      ) : null}
      <p className="font-mono text-xs break-all text-muted-foreground">
        {t('ids', { id: event.id, coaching: event.coachingId })}
      </p>
    </li>
  );
}
