'use client';

import { MessageSquareHeart, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
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
import { responseRate, type SurveySummary, useCloseSurvey, useSurveys } from '@/lib/surveys';
import { useApiError } from '@/lib/use-api-error';
import { Stars } from './survey-detail-dialog';

// Dialogs are left out of the page's first download and load just after it
const SurveyFormDialog = dynamic(() => import('./survey-form-dialog').then((m) => m.SurveyFormDialog));
const SurveyDetailDialog = dynamic(() => import('./survey-detail-dialog').then((m) => m.SurveyDetailDialog));

export function SurveysPage() {
  const t = useTranslations('Surveys');
  const surveys = useSurveys();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {t('new')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={newButton} />

      {surveys.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : surveys.isError ? (
        <QueryError error={surveys.error} onRetry={() => void surveys.refetch()} />
      ) : surveys.data.length === 0 ? (
        <StatePanel icon={<MessageSquareHeart className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
          <div className="mt-2">{newButton}</div>
        </StatePanel>
      ) : (
        <ul className="enter-stagger flex flex-col gap-4">
          {surveys.data.map((survey) => (
            <li key={survey.id}>
              <SurveyCard survey={survey} onView={() => setViewing(survey.id)} />
            </li>
          ))}
        </ul>
      )}

      <SurveyFormDialog open={creating} onOpenChange={setCreating} />
      {viewing ? <SurveyDetailDialog surveyId={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function SurveyCard({ survey, onView }: { survey: SurveySummary; onView: () => void }) {
  const t = useTranslations('Surveys');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const close = useCloseSurvey();
  const [closing, setClosing] = useState(false);

  const confirmClose = async () => {
    try {
      await close.mutateAsync(survey.id);
      toast.success(t('closed'));
      setClosing(false);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={survey.closed ? 'neutral' : 'success'}>{survey.closed ? t('status.closed') : t('status.open')}</Badge>
        <Badge>{survey.batchName ?? t('everyone')}</Badge>
        <span className="text-xs text-muted-foreground">{t('sentOn', { date: formatDate(survey.createdAt) })}</span>
      </div>
      <h2 className="text-lg font-bold break-words">{survey.title}</h2>
      <p className="text-sm text-muted-foreground">{survey.question}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>{t('answered', { answered: survey.answered, sent: survey.sent, rate: responseRate(survey) })}</span>
        {survey.averageRating !== null ? (
          <span className="flex items-center gap-2">
            <Stars value={survey.averageRating} label={t('average', { value: survey.averageRating })} />
            <span className="font-semibold tabular-nums">{survey.averageRating}</span>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" variant="outline" onClick={onView}>
          {t('viewAnswers')}
        </Button>
        {!survey.closed ? (
          <Button size="sm" variant="ghost" onClick={() => setClosing(true)}>
            {t('close')}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title={t('closeTitle', { title: survey.title })}
        description={t('closeBody')}
        confirmLabel={t('close')}
        cancelLabel={common('cancel')}
        pending={close.isPending}
        onConfirm={() => void confirmClose()}
      />
    </article>
  );
}
