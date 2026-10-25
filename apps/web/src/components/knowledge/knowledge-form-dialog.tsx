'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import {
  KNOWLEDGE_TYPES,
  MAX_ENTRY_LENGTH,
  type KnowledgeEntry,
  type KnowledgeType,
  useSaveKnowledge,
} from '@/lib/knowledge';
import { useApiError } from '@/lib/use-api-error';

const FIELDS = ['title', 'type', 'content'] as const;

export interface KnowledgeDraft {
  title: string;
  type: KnowledgeType;
  content: string;
}

interface KnowledgeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this entry; omit to add one */
  entry?: KnowledgeEntry;
  /** Starting text for a new entry (a suggested topic) */
  draft?: KnowledgeDraft;
}

export function KnowledgeFormDialog({ open, onOpenChange, entry, draft }: KnowledgeFormDialogProps) {
  const t = useTranslations('Assistant.form');
  const common = useTranslations('Common');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? t('editTitle') : t('createTitle')}
      closeLabel={common('close')}
      size="lg"
    >
      {open ? <KnowledgeForm entry={entry} draft={draft} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function KnowledgeForm({ entry, draft, onDone }: { entry?: KnowledgeEntry; draft?: KnowledgeDraft; onDone: () => void }) {
  const t = useTranslations('Assistant');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const save = useSaveKnowledge(entry?.id);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(2, t('form.titleMin')).max(255),
        type: z.enum(KNOWLEDGE_TYPES),
        content: z
          .string()
          .trim()
          .min(5, t('form.contentMin'))
          .max(MAX_ENTRY_LENGTH, t('form.contentMax', { max: MAX_ENTRY_LENGTH })),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: entry?.title ?? draft?.title ?? '',
      type: entry?.type ?? draft?.type ?? 'FAQ',
      content: entry?.content ?? draft?.content ?? '',
    },
  });
  const content = useWatch({ control, name: 'content' });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(values);
      toast.success(t(entry ? 'form.updated' : 'form.saved'));
      onDone();
    } catch (error) {
      setFormError(describeError(error, setError, FIELDS));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField id="knowledge-title" label={t('form.title')} error={errors.title?.message}>
          <Input autoComplete="off" autoFocus maxLength={255} {...register('title')} />
        </FormField>
        <FormField id="knowledge-type" label={t('form.type')} error={errors.type?.message}>
          <Select {...register('type')}>
            {KNOWLEDGE_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`type.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField
        id="knowledge-content"
        label={t('form.content')}
        hint={t('form.contentCount', { count: content.length, max: MAX_ENTRY_LENGTH })}
        error={errors.content?.message}
      >
        <Textarea rows={9} placeholder={t('form.contentPlaceholder')} {...register('content')} />
      </FormField>

      <div className="flex justify-end border-t pt-5">
        <div className="w-full sm:w-48">
          <SubmitButton
            pending={isSubmitting}
            label={entry ? common('save') : t('form.save')}
            pendingLabel={common('saving')}
          />
        </div>
      </div>
    </form>
  );
}
