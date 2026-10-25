'use client';

import { isApiError } from '@vargly/api-client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { useSubscription } from '@/lib/billing';
import {
  DIFFICULTIES,
  type Difficulty,
  GENERATE_PAPER_CREDITS,
  PAPER_LANGUAGES,
  type PaperLanguage,
  QUESTION_TYPES,
  type QuestionType,
  type SectionSpec,
  useGeneratePaper,
} from '@/lib/papers';
import { useApiError } from '@/lib/use-api-error';

/** Most questions one request may ask for (apps/api paper.types.ts) */
const MAX_QUESTIONS = 40;
const MAX_PER_TYPE = 20;

interface Row {
  enabled: boolean;
  count: number;
  marks: number;
}

const DEFAULT_ROWS: Record<QuestionType, Row> = {
  MCQ: { enabled: true, count: 5, marks: 1 },
  TRUE_FALSE: { enabled: false, count: 3, marks: 1 },
  FILL_BLANK: { enabled: false, count: 3, marks: 1 },
  SHORT: { enabled: true, count: 3, marks: 2 },
  LONG: { enabled: false, count: 1, marks: 5 },
};

/** What the teacher wants asked: subject, chapter, language and how many of each question type */
export function GenerateForm() {
  const t = useTranslations('Papers');
  const router = useRouter();
  const describeError = useApiError();
  const generate = useGeneratePaper();
  const subscription = useSubscription();

  const [subject, setSubject] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState<PaperLanguage>('en');
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [instructions, setInstructions] = useState('');
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [error, setError] = useState<{ message: string; buyCredits?: boolean } | null>(null);

  const sections: SectionSpec[] = QUESTION_TYPES.filter((type) => rows[type].enabled).map((type) => ({
    type,
    count: rows[type].count,
    marks: rows[type].marks,
  }));
  const total = sections.reduce((sum, section) => sum + section.count, 0);
  const rowsValid = sections.every(
    (s) => Number.isInteger(s.count) && s.count >= 1 && s.count <= MAX_PER_TYPE && s.marks > 0,
  );
  const ready = subject.trim() !== '' && topic.trim() !== '' && sections.length > 0 && rowsValid && total <= MAX_QUESTIONS;

  const setRow = (type: QuestionType, change: Partial<Row>) =>
    setRows((current) => ({ ...current, [type]: { ...current[type], ...change } }));

  const hint = sections.length === 0 ? t('new.pickOne') : total > MAX_QUESTIONS ? t('new.tooMany', { max: MAX_QUESTIONS }) : undefined;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={
          <Link
            href="/app/papers"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('new.back')}
          </Link>
        }
        title={t('new.title')}
        subtitle={t('new.subtitle')}
      />

      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          setError(null);
          generate.mutate(
            {
              subject: subject.trim(),
              topic: topic.trim(),
              ...(classLevel.trim() ? { classLevel: classLevel.trim() } : {}),
              language,
              difficulty,
              ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
              sections,
            },
            {
              onSuccess: ({ paper, shortBy }) => {
                toast.success(t('new.created'));
                if (shortBy > 0) toast.warning(t('new.shortBy'));
                router.push(`/app/papers/${paper.id}`);
              },
              onError: (failure) => {
                if (isApiError(failure) && failure.code === 'INSUFFICIENT_AI_CREDITS') {
                  setError({ message: t('new.noCredits'), buyCredits: true });
                } else if (isApiError(failure) && failure.code === 'AI_BUSY') {
                  setError({ message: t('new.busy') });
                } else if (isApiError(failure) && failure.code === 'AI_BAD_RESPONSE') {
                  setError({ message: t('new.failed') });
                } else {
                  setError({ message: describeError(failure) });
                }
              },
            },
          );
        }}
      >
        {error ? (
          <Alert tone="danger">
            <div className="flex flex-col gap-2">
              <span>{error.message}</span>
              {error.buyCredits ? (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href="/app/billing">{t('new.buyCredits')}</Link>
                </Button>
              ) : null}
            </div>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="paper-subject" label={t('new.subject')}>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t('new.subjectPlaceholder')}
              maxLength={100}
              autoFocus
            />
          </FormField>
          <FormField id="paper-class" label={t('new.classLevel')}>
            <Input
              value={classLevel}
              onChange={(event) => setClassLevel(event.target.value)}
              placeholder={t('new.classPlaceholder')}
              maxLength={50}
            />
          </FormField>
        </div>
        <FormField id="paper-topic" label={t('new.topic')}>
          <Input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t('new.topicPlaceholder')}
            maxLength={500}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="paper-language" label={t('new.language')}>
            <Select value={language} onChange={(event) => setLanguage(event.target.value as PaperLanguage)}>
              {PAPER_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {t(`languages.${code}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="paper-difficulty" label={t('new.difficulty')}>
            <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {t(`difficulties.${level}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">{t('new.typesTitle')}</legend>
          <p className="text-sm text-muted-foreground">{t('new.typesHint')}</p>
          {QUESTION_TYPES.map((type) => {
            const row = rows[type];
            return (
              <div key={type} className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={row.enabled}
                    onChange={(event) => setRow(type, { enabled: event.target.checked })}
                  />
                  {t(`types.${type}`)}
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PER_TYPE}
                  aria-label={`${t(`types.${type}`)}: ${t('new.count')}`}
                  disabled={!row.enabled}
                  value={row.count}
                  onChange={(event) => setRow(type, { count: Number(event.target.value) })}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step={0.5}
                  aria-label={`${t(`types.${type}`)}: ${t('new.marks')}`}
                  disabled={!row.enabled}
                  value={row.marks}
                  onChange={(event) => setRow(type, { marks: Number(event.target.value) })}
                />
              </div>
            );
          })}
          <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
            <span aria-live="polite">{hint}</span>
            <span className="hidden sm:block">{t('new.count')}</span>
            <span className="hidden sm:block">{t('new.marks')}</span>
          </div>
        </fieldset>

        <FormField id="paper-instructions" label={t('new.instructions')}>
          <Textarea
            rows={3}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder={t('new.instructionsPlaceholder')}
            maxLength={500}
          />
        </FormField>

        <p className="text-sm text-muted-foreground">
          {t('new.cost', {
            credits: GENERATE_PAPER_CREDITS,
            balance: subscription.data ? subscription.data.aiCreditBalance : '—',
          })}
        </p>
        <div className="sm:w-56">
          <SubmitButton
            pending={generate.isPending}
            disabled={!ready}
            label={t('new.generate')}
            pendingLabel={t('new.generating')}
          />
        </div>
      </form>
    </div>
  );
}
