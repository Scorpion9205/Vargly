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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import {
  ENQUIRY_SOURCES,
  type Enquiry,
  type EnquiryInput,
  useCreateEnquiry,
  useUpdateEnquiry,
} from '@/lib/enquiries';
import { isValidPhone, normalisePhone } from '@/lib/phone';
import { useApiError } from '@/lib/use-api-error';

const FIELDS = ['name', 'phone', 'studentName', 'interestedIn', 'source', 'notes', 'followUpOn'] as const;

interface EnquiryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this enquiry; omit to record a new one */
  enquiry?: Enquiry;
}

export function EnquiryFormDialog({ open, onOpenChange, enquiry }: EnquiryFormDialogProps) {
  const t = useTranslations('Enquiries.form');
  const common = useTranslations('Common');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={enquiry ? t('editTitle') : t('createTitle')}
      closeLabel={common('close')}
      size="lg"
    >
      {open ? <EnquiryForm enquiry={enquiry} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function EnquiryForm({ enquiry, onDone }: { enquiry?: Enquiry; onDone: () => void }) {
  const t = useTranslations('Enquiries');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const create = useCreateEnquiry();
  const update = useUpdateEnquiry(enquiry?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t('form.nameMin')).max(255),
        phone: z.string().refine(isValidPhone, t('form.phoneInvalid')),
        studentName: z.string().trim().max(255),
        interestedIn: z.string().trim().max(255),
        source: z.enum(ENQUIRY_SOURCES),
        notes: z.string().trim().max(2000),
        followUpOn: z.string(),
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
    defaultValues: {
      name: enquiry?.name ?? '',
      phone: enquiry?.phone ?? '',
      studentName: enquiry?.studentName ?? '',
      interestedIn: enquiry?.interestedIn ?? '',
      source: enquiry?.source ?? 'WALK_IN',
      notes: enquiry?.notes ?? '',
      followUpOn: enquiry?.followUpOn ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const input: EnquiryInput = {
      name: values.name,
      phone: normalisePhone(values.phone),
      studentName: values.studentName || null,
      interestedIn: values.interestedIn || null,
      source: values.source,
      notes: values.notes || null,
      followUpOn: values.followUpOn || null,
    };
    try {
      if (enquiry) {
        await update.mutateAsync(input);
        toast.success(t('form.updated'));
      } else {
        await create.mutateAsync(input);
        toast.success(t('form.saved'));
      }
      onDone();
    } catch (error) {
      setFormError(describeError(error, setError, FIELDS));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="enquiry-name" label={t('form.name')} error={errors.name?.message}>
          <Input autoComplete="off" autoFocus maxLength={255} {...register('name')} />
        </FormField>
        <FormField id="enquiry-phone" label={t('form.phone')} error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...register('phone')} />
        </FormField>
        <FormField
          id="enquiry-student"
          label={`${t('form.studentName')} (${common('optional')})`}
          error={errors.studentName?.message}
        >
          <Input autoComplete="off" maxLength={255} {...register('studentName')} />
        </FormField>
        <FormField
          id="enquiry-interest"
          label={`${t('form.interestedIn')} (${common('optional')})`}
          hint={t('form.interestedInHint')}
          error={errors.interestedIn?.message}
        >
          <Input autoComplete="off" maxLength={255} {...register('interestedIn')} />
        </FormField>
        <FormField id="enquiry-source" label={t('form.source')} error={errors.source?.message}>
          <Select {...register('source')}>
            {ENQUIRY_SOURCES.map((value) => (
              <option key={value} value={value}>
                {t(`source.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id="enquiry-follow-up"
          label={`${t('form.followUpOn')} (${common('optional')})`}
          hint={t('form.followUpHint')}
          error={errors.followUpOn?.message}
        >
          <Input type="date" {...register('followUpOn')} />
        </FormField>
      </div>

      <FormField
        id="enquiry-notes"
        label={`${t('form.notes')} (${common('optional')})`}
        error={errors.notes?.message}
      >
        <Textarea rows={4} placeholder={t('form.notesPlaceholder')} {...register('notes')} />
      </FormField>

      <div className="flex justify-end border-t pt-5">
        <div className="w-full sm:w-48">
          <SubmitButton
            pending={isSubmitting}
            label={enquiry ? common('save') : t('form.save')}
            pendingLabel={common('saving')}
          />
        </div>
      </div>
    </form>
  );
}
