'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QueryError } from '@/components/dashboard/query-error';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useSurveyDetail } from '@/lib/surveys';

interface SurveyDetailDialogProps {
  surveyId: string | null;
  onClose: () => void;
}

export function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={n <= Math.round(value) ? 'size-4 fill-warning text-warning' : 'size-4 text-muted-foreground/40'} />
      ))}
    </span>
  );
}

export function SurveyDetailDialog({ surveyId, onClose }: SurveyDetailDialogProps) {
  const t = useTranslations('Surveys.detail');
  const common = useTranslations('Common');
  const detail = useSurveyDetail(surveyId);

  return (
    <Dialog
      open={surveyId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={detail.data?.title ?? t('loading')}
      description={detail.data?.question}
      closeLabel={common('close')}
      size="lg"
    >
      {detail.isPending ? (
        <Skeleton className="h-48 rounded-xl" aria-busy="true" />
      ) : detail.isError ? (
        <QueryError error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {t('answeredOf', { answered: detail.data.answered, sent: detail.data.sent })}
            {detail.data.averageRating !== null ? ` · ${t('average', { value: detail.data.averageRating })}` : ''}
          </p>

          <ul className="flex flex-col gap-1.5" aria-label={t('distribution')}>
            {([5, 4, 3, 2, 1] as const).map((rating) => {
              const count = detail.data.distribution[String(rating) as '1'];
              const width = detail.data.answered ? Math.round((count / detail.data.answered) * 100) : 0;
              return (
                <li key={rating} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0">{t('stars', { count: rating })}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>

          {detail.data.responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noAnswers')}</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
              {detail.data.responses.map((response, index) => (
                <li key={index} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{response.parentName}</span>
                    <Stars value={response.rating} label={t('stars', { count: response.rating })} />
                  </div>
                  {response.comment ? <p className="mt-1 text-sm break-words whitespace-pre-line">{response.comment}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(response.respondedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
