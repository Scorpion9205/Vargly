'use client';

import {
  CalendarClock,
  Check,
  MessageCircle,
  Pencil,
  PhoneCall,
  Plus,
  Trash2,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import {
  ENQUIRY_VIEWS,
  type Enquiry,
  type EnquiryStatus,
  type EnquiryView,
  isDue,
  useDeleteEnquiry,
  useEnquiries,
  useEnquirySummary,
  useUpdateEnquiry,
} from '@/lib/enquiries';
import { formatDate } from '@/lib/format';
import { whatsappLink } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { useApiError } from '@/lib/use-api-error';

// The form is left out of the page's first download and loads just after it
const EnquiryFormDialog = dynamic(() =>
  import('./enquiry-form-dialog').then((m) => m.EnquiryFormDialog),
);

const STATUS_TONE = {
  NEW: 'info',
  CONTACTED: 'warning',
  ADMITTED: 'success',
  NOT_INTERESTED: 'neutral',
} as const;

export function EnquiriesPage() {
  const t = useTranslations('Enquiries');
  const [adding, setAdding] = useState(false);
  const [{ view, q }, setParams] = useQueryStates({
    view: parseAsStringLiteral(ENQUIRY_VIEWS).withDefault('all'),
    q: parseAsString.withDefault(''),
  });
  const enquiries = useEnquiries(view, q);
  const summary = useEnquirySummary();

  const count = (key: EnquiryView): number | null => {
    if (!summary.data) return null;
    if (key === 'all') return summary.data.total;
    if (key === 'due') return summary.data.dueToday;
    return summary.data.byStatus[key];
  };

  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={addButton} />

      <div role="group" aria-label={t('viewLabel')} className="flex flex-wrap gap-2">
        {ENQUIRY_VIEWS.map((key) => {
          const total = count(key);
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => void setParams({ view: key === 'all' ? null : key })}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active ? 'border-primary bg-brand-soft text-accent-foreground' : 'hover:bg-muted',
                key === 'due' && !active && (total ?? 0) > 0 && 'border-warning/50',
              )}
            >
              {t(`view.${key}`)}
              {total !== null ? <span className="text-xs text-muted-foreground">{total}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="sm:w-80">
        <SearchInput
          value={q}
          onSearch={(value) => void setParams({ q: value || null })}
          label={t('search')}
          clearLabel={t('clearSearch')}
          placeholder={t('searchPlaceholder')}
        />
      </div>

      {enquiries.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : enquiries.isError ? (
        <QueryError error={enquiries.error} onRetry={() => void enquiries.refetch()} />
      ) : enquiries.data.length === 0 ? (
        <StatePanel icon={<UserPlus className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{view === 'all' && !q ? t('empty.body') : t('empty.filtered')}</p>
          {view === 'all' && !q ? <div className="mt-2">{addButton}</div> : null}
        </StatePanel>
      ) : (
        <ul className="enter-stagger flex flex-col gap-4">
          {enquiries.data.map((enquiry) => (
            <li key={enquiry.id}>
              <EnquiryCard enquiry={enquiry} />
            </li>
          ))}
        </ul>
      )}

      <EnquiryFormDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function EnquiryCard({ enquiry }: { enquiry: Enquiry }) {
  const t = useTranslations('Enquiries');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const update = useUpdateEnquiry(enquiry.id);
  const remove = useDeleteEnquiry();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const due = isDue(enquiry);
  const open = enquiry.status === 'NEW' || enquiry.status === 'CONTACTED';

  const mark = async (status: EnquiryStatus) => {
    try {
      await update.mutateAsync({ status });
      toast.success(t(`marked.${status}`));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(enquiry.id);
      toast.success(t('deleted'));
      setDeleting(false);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card',
        due && 'border-warning/60',
        !open && 'opacity-80',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[enquiry.status]}>{t(`status.${enquiry.status}`)}</Badge>
        <Badge>{t(`source.${enquiry.source}`)}</Badge>
        {due ? (
          <Badge tone="warning">
            <CalendarClock aria-hidden />
            {t('dueBadge')}
          </Badge>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg font-bold break-words">{enquiry.name}</h2>
        <p className="text-sm text-muted-foreground">
          {[
            enquiry.studentName ? t('forStudent', { name: enquiry.studentName }) : null,
            enquiry.interestedIn,
          ]
            .filter(Boolean)
            .join(' · ') || t('noDetails')}
        </p>
      </div>

      {enquiry.notes ? (
        <p className="text-sm break-words whitespace-pre-line text-foreground/90">{enquiry.notes}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={`tel:${enquiry.phone}`}>
            <PhoneCall aria-hidden />
            {enquiry.phone}
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={whatsappLink(enquiry.phone)} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t('whatsapp')}
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{t('askedOn', { date: formatDate(enquiry.createdAt) })}</span>
          {enquiry.lastContactedAt ? (
            <span>{t('calledOn', { date: formatDate(enquiry.lastContactedAt) })}</span>
          ) : null}
          {open && enquiry.followUpOn ? (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {t('followUpOn', { date: formatDate(enquiry.followUpOn) })}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {enquiry.status === 'NEW' ? (
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => void mark('CONTACTED')}>
              <Check aria-hidden />
              {t('action.CONTACTED')}
            </Button>
          ) : null}
          {open ? (
            <>
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => void mark('ADMITTED')}>
                <UserPlus aria-hidden />
                {t('action.ADMITTED')}
              </Button>
              <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => void mark('NOT_INTERESTED')}>
                <UserX aria-hidden />
                {t('action.NOT_INTERESTED')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => void mark('NEW')}>
              {t('action.reopen')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t('edit')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden />
            {t('delete')}
          </Button>
        </div>
      </div>

      <EnquiryFormDialog open={editing} onOpenChange={setEditing} enquiry={enquiry} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteBody', { name: enquiry.name })}
        confirmLabel={t('delete')}
        cancelLabel={common('cancel')}
        destructive
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </article>
  );
}
