'use client';

import { BookOpenText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/format';
import { type KnowledgeEntry, STARTER_TOPICS, useDeleteKnowledge, useKnowledge } from '@/lib/knowledge';
import { useApiError } from '@/lib/use-api-error';
import type { KnowledgeDraft } from './knowledge-form-dialog';

// The form is left out of the page's first download and loads just after it
const KnowledgeFormDialog = dynamic(() =>
  import('./knowledge-form-dialog').then((m) => m.KnowledgeFormDialog),
);

export function KnowledgePage() {
  const t = useTranslations('Assistant');
  const knowledge = useKnowledge();
  const [form, setForm] = useState<{ entry?: KnowledgeEntry; draft?: KnowledgeDraft } | null>(null);

  const add = (draft?: KnowledgeDraft) => setForm({ draft });

  const addButton = (
    <Button onClick={() => add()}>
      <Plus aria-hidden />
      {t('add')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={addButton} />

      {knowledge.data && !knowledge.data.canEmbed ? <Alert tone="warning">{t('notIndexed')}</Alert> : null}

      <section aria-labelledby="starter-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card">
        <h2 id="starter-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t('starter.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('starter.body')}</p>
        <div className="flex flex-wrap gap-2">
          {STARTER_TOPICS.map((topic) => (
            <Button
              key={topic}
              size="sm"
              variant="outline"
              onClick={() =>
                add({
                  title: t(`starter.topics.${topic}.title`),
                  type: topic === 'timings' ? 'SCHEDULE' : topic === 'admission' ? 'POLICY' : 'FAQ',
                  content: t(`starter.topics.${topic}.draft`),
                })
              }
            >
              {t(`starter.topics.${topic}.title`)}
            </Button>
          ))}
        </div>
      </section>

      {knowledge.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : knowledge.isError ? (
        <QueryError error={knowledge.error} onRetry={() => void knowledge.refetch()} />
      ) : knowledge.data.items.length === 0 ? (
        <StatePanel icon={<BookOpenText className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
          <div className="mt-2">{addButton}</div>
        </StatePanel>
      ) : (
        <ul className="enter-stagger flex flex-col gap-4">
          {knowledge.data.items.map((entry) => (
            <li key={entry.id}>
              <EntryCard entry={entry} onEdit={() => setForm({ entry })} />
            </li>
          ))}
        </ul>
      )}

      <KnowledgeFormDialog
        key={form?.entry?.id ?? form?.draft?.title ?? 'new'}
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        entry={form?.entry}
        draft={form?.draft}
      />
    </div>
  );
}

function EntryCard({ entry, onEdit }: { entry: KnowledgeEntry; onEdit: () => void }) {
  const t = useTranslations('Assistant');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const remove = useDeleteKnowledge();
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(entry.id);
      toast.success(t('deleted'));
      setDeleting(false);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{t(`type.${entry.type}`)}</Badge>
        <span className="text-xs text-muted-foreground">{t('updatedOn', { date: formatDate(entry.updatedAt) })}</span>
      </div>
      <h2 className="text-lg font-bold break-words">{entry.title}</h2>
      <p className="line-clamp-4 text-sm break-words whitespace-pre-line text-foreground/90">{entry.content}</p>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil aria-hidden />
          {t('edit')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden />
          {t('delete')}
        </Button>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle', { title: entry.title })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        cancelLabel={common('cancel')}
        destructive
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </article>
  );
}
