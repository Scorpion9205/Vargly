'use client';

import { BookOpen, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BatchScope } from '@/components/academics/batch-scope';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { type Homework, useBatchHomework, useDeleteHomework } from '@/lib/assessments';
import { addDays, toDay } from '@/lib/attendance';
import { can } from '@/lib/auth/permissions';
import { useSession } from '@/lib/auth/use-session';
import { todayInIndia } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import type { TeachingBatch } from '@/lib/teaching-batches';
import { useApiError } from '@/lib/use-api-error';

// The form is left out of the page's first download and loads just after it
const HomeworkDialog = dynamic(() => import('./homework-dialog').then((m) => m.HomeworkDialog));

export type DueStatus = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

export function dueStatus(dueDay: string, today: string = todayInIndia()): DueStatus {
  if (dueDay < today) return 'overdue';
  if (dueDay === today) return 'today';
  if (dueDay === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
}

const DUE_TONES = {
  overdue: 'neutral',
  today: 'danger',
  tomorrow: 'warning',
  upcoming: 'info',
} as const;

export function HomeworkPage() {
  const t = useTranslations('Homework');
  const canCreate = can(useSession()?.user, 'homework:create');
  const [creatingFor, setCreatingFor] = useState<TeachingBatch | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} />
      <BatchScope
        actions={(batch) =>
          canCreate ? (
            <Button onClick={() => setCreatingFor(batch)}>
              <Plus aria-hidden />
              {t('add')}
            </Button>
          ) : null
        }
      >
        {(batch) => (
          <HomeworkList
            batch={batch}
            onCreate={canCreate ? () => setCreatingFor(batch) : undefined}
          />
        )}
      </BatchScope>
      <HomeworkDialog
        open={creatingFor !== null}
        onOpenChange={(open) => !open && setCreatingFor(null)}
        batch={creatingFor ?? undefined}
      />
    </div>
  );
}

function HomeworkList({ batch, onCreate }: { batch: TeachingBatch; onCreate?: () => void }) {
  const t = useTranslations('Homework');
  const homework = useBatchHomework(batch.id);
  const today = todayInIndia();

  if (homework.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }
  if (homework.isError) {
    return <QueryError error={homework.error} onRetry={() => void homework.refetch()} />;
  }
  if (homework.data.length === 0) {
    return (
      <StatePanel icon={<BookOpen className="size-5" aria-hidden />} title={t('empty.title')}>
        <p>{t('empty.body')}</p>
        {onCreate ? (
          <Button className="mt-2" onClick={onCreate}>
            <Plus aria-hidden />
            {t('add')}
          </Button>
        ) : null}
      </StatePanel>
    );
  }

  // Current work soonest first; past work most recent first
  const byDue = [...homework.data].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const current = byDue.filter((item) => toDay(item.dueDate) >= today);
  const past = byDue.filter((item) => toDay(item.dueDate) < today).reverse();

  return (
    <div className="flex flex-col gap-8">
      {[
        ['upcoming', current],
        ['past', past],
      ].map(([key, items]) =>
        (items as Homework[]).length ? (
          <section key={key as string} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {t(key as 'upcoming' | 'past')}
            </h2>
            <ul className="flex flex-col gap-3">
              {(items as Homework[]).map((item) => (
                <li key={item.id}>
                  <HomeworkCard homework={item} batch={batch} />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function HomeworkCard({ homework, batch }: { homework: Homework; batch: TeachingBatch }) {
  const t = useTranslations('Homework');
  const common = useTranslations('Common');
  const user = useSession()?.user;
  const describeError = useApiError();
  const remove = useDeleteHomework();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const day = toDay(homework.dueDate);
  const status = dueStatus(day);

  const deleteHomework = async () => {
    try {
      await remove.mutateAsync(homework.id);
      toast.success(t('deleted'));
    } catch (error) {
      toast.error(describeError(error));
    }
    setConfirmDelete(false);
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold break-words">{homework.title}</h3>
          <p className="text-sm text-muted-foreground">{t('due', { date: formatDate(day) })}</p>
        </div>
        <Badge tone={DUE_TONES[status]}>{t(`status.${status}`)}</Badge>
      </div>
      <p className="text-sm whitespace-pre-line break-words">{homework.description}</p>
      {homework.completedCount ? (
        <p className="text-sm font-medium text-success">{t('markedDone', { count: homework.completedCount })}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {homework.attachmentUrl ? (
          <a
            href={homework.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t('attachment')}
          </a>
        ) : (
          <span />
        )}
        <div className="flex gap-1">
          {can(user, 'homework:update') ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {t('edit')}
            </Button>
          ) : null}
          {can(user, 'homework:delete') ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden />
              {t('delete')}
            </Button>
          ) : null}
        </div>
      </div>

      <HomeworkDialog open={editing} onOpenChange={setEditing} batch={batch} homework={homework} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteTitle', { name: homework.title })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        cancelLabel={common('cancel')}
        onConfirm={() => void deleteHomework()}
        pending={remove.isPending}
        destructive
      />
    </article>
  );
}
