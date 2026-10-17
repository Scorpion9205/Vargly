'use client';

import { FileText, Sparkles, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/format';
import { type Paper, useDeletePaper, usePapers } from '@/lib/papers';
import { UploadDialog } from './upload-dialog';

/** The teacher's papers: generate one with AI, upload their own PDF, or open one to edit and share */
export function PapersPage() {
  const t = useTranslations('Papers');
  const papers = usePapers();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<Paper | null>(null);
  const remove = useDeletePaper();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload aria-hidden />
              {t('list.upload')}
            </Button>
            <Button asChild>
              <Link href="/app/papers/new">
                <Sparkles aria-hidden />
                {t('list.generate')}
              </Link>
            </Button>
          </>
        }
      />

      {papers.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : papers.isError ? (
        <QueryError error={papers.error} onRetry={() => void papers.refetch()} />
      ) : papers.data.length === 0 ? (
        <StatePanel icon={<FileText className="size-5" aria-hidden />} title={t('list.emptyTitle')}>
          <p>{t('list.emptyBody')}</p>
        </StatePanel>
      ) : (
        <ul className="flex flex-col gap-3">
          {papers.data.map((paper) => (
            <PaperRow key={paper.id} paper={paper} onDelete={() => setDeleting(paper)} />
          ))}
        </ul>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('list.deleteTitle')}
        description={t('list.deleteBody')}
        confirmLabel={t('list.deleteConfirm')}
        cancelLabel={t('list.cancel')}
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('list.deleted'));
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}

function PaperRow({ paper, onDelete }: { paper: Paper; onDelete: () => void }) {
  const t = useTranslations('Papers.list');
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          href={`/app/papers/${paper.id}`}
          className="font-semibold break-words hover:underline focus-visible:underline"
        >
          {paper.title}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          {paper.subject}
          {paper.source === 'AI'
            ? ` · ${t('questions', { count: paper.questionCount })} · ${t('marks', { marks: paper.totalMarks })}`
            : paper.fileName
              ? ` · ${paper.fileName}`
              : ''}
          {' · '}
          {t('updated', { date: formatDate(paper.updatedAt) })}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge tone="neutral">{t(`source.${paper.source}`)}</Badge>
        <Badge tone={paper.status === 'PUBLISHED' ? 'success' : 'info'}>
          {t(`status.${paper.status}`)}
        </Badge>
        <Button asChild variant="outline" size="sm">
          <Link href={`/app/papers/${paper.id}`}>{t('open')}</Link>
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={onDelete}>
          <Trash2 className="size-4!" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
