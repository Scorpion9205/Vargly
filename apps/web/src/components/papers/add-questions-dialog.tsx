'use client';

import { isApiError } from '@vargly/api-client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  GENERATE_QUESTION_CREDITS,
  QUESTION_TYPES,
  type Question,
  type QuestionType,
  useAddQuestions,
} from '@/lib/papers';
import { useApiError } from '@/lib/use-api-error';

/** Asks the AI for more questions of one type, to add to the paper */
export function AddQuestionsDialog({
  open,
  onOpenChange,
  paperId,
  existing,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: string;
  /** Ids the paper already has, so only the new questions are handed back */
  existing: ReadonlySet<string>;
  onAdded: (added: Question[], shortBy: number) => void;
}) {
  const t = useTranslations('Papers.add');
  const types = useTranslations('Papers.types');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const add = useAddQuestions(paperId);

  const [type, setType] = useState<QuestionType>('MCQ');
  const [count, setCount] = useState(3);
  const [marks, setMarks] = useState(1);
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = Number.isInteger(count) && count >= 1 && count <= 20 && marks > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('title')} closeLabel={common('close')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          setError(null);
          add.mutate(
            { section: { type, count, marks }, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) },
            {
              onSuccess: ({ paper, shortBy }) => {
                onAdded(paper.questions.filter((q) => !existing.has(q.id)), shortBy);
                onOpenChange(false);
              },
              onError: (failure) =>
                setError(
                  isApiError(failure) && failure.code === 'AI_BAD_RESPONSE'
                    ? t('failed')
                    : describeError(failure),
                ),
            },
          );
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <FormField id="add-type" label={t('type')}>
          <Select value={type} onChange={(event) => setType(event.target.value as QuestionType)}>
            {QUESTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {types(value)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="add-count" label={t('count')}>
            <Input type="number" inputMode="numeric" min={1} max={20} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </FormField>
          <FormField id="add-marks" label={t('marks')}>
            <Input type="number" inputMode="decimal" min={0.5} step={0.5} value={marks} onChange={(event) => setMarks(Number(event.target.value))} />
          </FormField>
        </div>
        <FormField id="add-instructions" label={t('instructions')}>
          <Textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={500} />
        </FormField>
        <p className="text-sm text-muted-foreground">{t('cost', { credits: GENERATE_QUESTION_CREDITS })}</p>
        <div className="mt-2 flex justify-end border-t pt-5">
          <div className="w-full sm:w-48">
            <SubmitButton pending={add.isPending} disabled={!valid} label={t('submit')} pendingLabel={t('adding')} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
