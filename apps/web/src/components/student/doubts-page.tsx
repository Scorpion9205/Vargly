'use client';

import { MessageCircleQuestion, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { Textarea } from '@/components/ui/textarea';
import { useAskDoubt, usePortalOverview } from '@/lib/student-portal';
import { useApiError } from '@/lib/use-api-error';

const MAX_LENGTH = 1000;
const MIN_LENGTH = 3;

interface Exchange {
  id: number;
  question: string;
  answer: string;
}

/** Ask the AI a study doubt. Answers are kept for this visit only. */
export function StudentDoubtsPage() {
  const t = useTranslations('Student.doubts');
  const describeError = useApiError();
  const overview = usePortalOverview();
  const ask = useAskDoubt();
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (overview.isPending) return <Skeleton className="h-64 rounded-2xl" aria-busy="true" />;
  if (overview.data && !overview.data.doubtsEnabled) {
    return (
      <StatePanel icon={<MessageCircleQuestion className="size-5" aria-hidden />} title={t('off.title')}>
        <p>{t('off.body')}</p>
      </StatePanel>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (text.length < MIN_LENGTH) {
      setError(t('tooShort'));
      return;
    }
    setError(null);
    try {
      const { answer } = await ask.mutateAsync(text);
      setExchanges((previous) => [{ id: previous.length + 1, question: text, answer }, ...previous]);
      setQuestion('');
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
        <label htmlFor="doubt" className="text-sm font-medium">
          {t('label')}
        </label>
        <Textarea
          id="doubt"
          rows={4}
          maxLength={MAX_LENGTH}
          value={question}
          placeholder={t('placeholder')}
          onChange={(event) => setQuestion(event.target.value)}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('notice')}</p>
          <Button type="submit" disabled={ask.isPending || question.trim().length === 0}>
            <Sparkles aria-hidden />
            {ask.isPending ? t('asking') : t('ask')}
          </Button>
        </div>
      </form>

      {exchanges.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {exchanges.map((exchange) => (
            <li key={exchange.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('you')}</p>
                <p className="break-words whitespace-pre-wrap">{exchange.question}</p>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold tracking-wide text-primary uppercase">{t('answer')}</p>
                <p className="break-words whitespace-pre-wrap">{exchange.answer}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
