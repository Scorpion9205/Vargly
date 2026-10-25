'use client';

import { BookOpen, Check, Download, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/format';
import { type PortalHomework, safeHttpUrl, useMarkHomework, usePortalHomework } from '@/lib/student-portal';
import { useApiError } from '@/lib/use-api-error';
import { cn } from '@/lib/utils';
import { dueLabelKey } from './home-page';

export function StudentHomeworkPage() {
  const t = useTranslations('Student.homework');
  const homework = usePortalHomework();

  const open = homework.data?.filter((h) => h.status !== 'DONE') ?? [];
  const done = homework.data?.filter((h) => h.status === 'DONE') ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {homework.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : homework.isError ? (
        <QueryError error={homework.error} onRetry={() => void homework.refetch()} />
      ) : homework.data.length === 0 ? (
        <StatePanel icon={<BookOpen className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <>
          <section aria-labelledby="todo-title" className="flex flex-col gap-3">
            <h2 id="todo-title" className="text-base font-bold">
              {t('todo', { count: open.length })}
            </h2>
            {open.length === 0 ? <p className="text-sm text-muted-foreground">{t('allDone')}</p> : null}
            <ul className="flex flex-col gap-3">
              {open.map((item) => (
                <li key={item.id}>
                  <HomeworkCard item={item} />
                </li>
              ))}
            </ul>
          </section>

          {done.length ? (
            <section aria-labelledby="done-title" className="flex flex-col gap-3">
              <h2 id="done-title" className="text-base font-bold">
                {t('doneTitle', { count: done.length })}
              </h2>
              <ul className="flex flex-col gap-3">
                {done.map((item) => (
                  <li key={item.id}>
                    <HomeworkCard item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function HomeworkCard({ item }: { item: PortalHomework }) {
  const t = useTranslations('Student.homework');
  const home = useTranslations('Student.home');
  const describeError = useApiError();
  const mark = useMarkHomework();
  const done = item.status === 'DONE';

  const toggle = async () => {
    try {
      await mark.mutateAsync({ id: item.id, done: !done });
      toast.success(done ? t('undone') : t('marked'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <article className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card', done && 'opacity-75')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('font-bold break-words', done && 'line-through decoration-muted-foreground/60')}>{item.title}</h3>
          <p className="text-xs text-muted-foreground">{item.batchName}</p>
        </div>
        <Badge tone={done ? 'success' : item.status === 'OVERDUE' ? 'danger' : item.status === 'DUE_TODAY' ? 'warning' : 'neutral'}>
          {done ? t('doneBadge') : home(`due.${dueLabelKey(item)}`, { date: formatDate(item.dueDate) })}
        </Badge>
      </div>
      <p className="text-sm break-words whitespace-pre-line text-foreground/90">{item.description}</p>
      <div className="flex flex-wrap gap-2">
        {safeHttpUrl(item.attachmentUrl) ? (
          <Button asChild size="sm" variant="outline">
            <a href={safeHttpUrl(item.attachmentUrl)!} target="_blank" rel="noopener noreferrer">
              <Download aria-hidden />
              {t('attachment')}
            </a>
          </Button>
        ) : null}
        <Button size="sm" variant={done ? 'ghost' : 'primary'} disabled={mark.isPending} onClick={() => void toggle()}>
          {done ? <Undo2 aria-hidden /> : <Check aria-hidden />}
          {done ? t('markNotDone') : t('markDone')}
        </Button>
      </div>
    </article>
  );
}
