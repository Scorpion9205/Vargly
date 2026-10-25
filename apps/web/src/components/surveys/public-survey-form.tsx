'use client';

import { CheckCircle2, Star } from 'lucide-react';
import { isApiError } from '@vargly/api-client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { publicApi } from '@/lib/api';
import { useApiError } from '@/lib/use-api-error';
import { cn } from '@/lib/utils';

interface PublicSurveyFormProps {
  token: string;
  question: string;
  answered: boolean;
  closed: boolean;
}

/** The parent's side: tap a star, add a few words if they like, send. */
export function PublicSurveyForm({ token, question, answered, closed }: PublicSurveyFormProps) {
  const t = useTranslations('PublicSurvey');
  const describeError = useApiError();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(answered);
  const [error, setError] = useState<string | null>(null);

  if (closed && !done) {
    return <p className="rounded-2xl border bg-card p-6 text-center shadow-card">{t('closed')}</p>;
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-card">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <h2 className="text-xl font-bold">{t('thanksTitle')}</h2>
        <p className="text-muted-foreground">{t('thanksBody')}</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (rating === 0) {
          setError(t('chooseRating'));
          return;
        }
        setError(null);
        setSending(true);
        try {
          await publicApi.post(`/public/survey/${encodeURIComponent(token)}`, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
          setDone(true);
        } catch (failure) {
          if (isApiError(failure) && failure.code === 'ALREADY_ANSWERED') setDone(true);
          else setError(describeError(failure));
        } finally {
          setSending(false);
        }
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="text-lg font-medium text-balance">{question}</p>

      <div role="radiogroup" aria-label={t('ratingLabel')} className="flex justify-between gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={t('stars', { count: value })}
            onClick={() => setRating(value)}
            className="flex flex-1 flex-col items-center gap-1 rounded-lg py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Star className={cn('size-9 transition-colors', value <= rating ? 'fill-warning text-warning' : 'text-muted-foreground/40')} aria-hidden />
            <span className="text-xs text-muted-foreground">{value}</span>
          </button>
        ))}
      </div>
      <p className="-mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{t('low')}</span>
        <span>{t('high')}</span>
      </p>

      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('comment')}
        <Textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>

      <SubmitButton pending={sending} label={t('submit')} pendingLabel={t('sending')} />
    </form>
  );
}
