'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import { useBatches } from '@/lib/academics';
import { useCreateSurvey } from '@/lib/surveys';
import { useApiError } from '@/lib/use-api-error';

const FIELDS = ['title', 'question', 'batchId'] as const;

interface SurveyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SurveyFormDialog({ open, onOpenChange }: SurveyFormDialogProps) {
  const t = useTranslations('Surveys.form');
  const common = useTranslations('Common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('title')} closeLabel={common('close')}>
      {open ? <SurveyForm onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function SurveyForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('Surveys');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const batches = useBatches(true);
  const create = useCreateSurvey();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(3, t('form.titleMin')).max(255),
        question: z.string().trim().max(500),
        batchId: z.string(),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', question: '', batchId: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const survey = await create.mutateAsync({
        title: values.title,
        ...(values.question ? { question: values.question } : {}),
        ...(values.batchId ? { batchId: values.batchId } : {}),
      });
      toast.success(t('form.sent', { count: survey.sent }));
      onDone();
    } catch (error) {
      setFormError(describeError(error, setError, FIELDS));
    }
  });

  const activeBatches = (batches.data ?? []).filter((batch) => batch.isActive);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormField id="survey-title" label={t('form.titleLabel')} hint={t('form.titleHint')} error={errors.title?.message}>
        <Input autoComplete="off" autoFocus maxLength={255} {...register('title')} />
      </FormField>
      <FormField
        id="survey-question"
        label={`${t('form.question')} (${common('optional')})`}
        hint={t('form.questionHint')}
        error={errors.question?.message}
      >
        <Input autoComplete="off" maxLength={500} {...register('question')} />
      </FormField>
      <FormField id="survey-batch" label={t('form.batch')} error={errors.batchId?.message}>
        <Select {...register('batchId')}>
          <option value="">{t('form.everyone')}</option>
          {activeBatches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
      </FormField>
      <Alert>{t('form.note')}</Alert>
      <div className="flex justify-end border-t pt-5">
        <div className="w-full sm:w-52">
          <SubmitButton pending={isSubmitting} label={t('form.send')} pendingLabel={t('form.sending')} />
        </div>
      </div>
    </form>
  );
}
