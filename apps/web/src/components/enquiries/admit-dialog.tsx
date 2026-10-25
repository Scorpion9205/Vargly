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
import { type Enquiry, useAdmitEnquiry } from '@/lib/enquiries';
import { useApiError } from '@/lib/use-api-error';

const RELATIONS = ['GUARDIAN', 'MOTHER', 'FATHER'] as const;
const FIELDS = ['firstName', 'lastName', 'batchId', 'relation'] as const;

/** "Riya Sharma" -> first name and the rest, to save typing */
export function splitName(full: string | null): { firstName: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

interface AdmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
}

export function AdmitDialog({ open, onOpenChange, enquiry }: AdmitDialogProps) {
  const t = useTranslations('Enquiries.admit');
  const common = useTranslations('Common');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description', { name: enquiry.name })}
      closeLabel={common('close')}
    >
      {open ? <AdmitForm enquiry={enquiry} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function AdmitForm({ enquiry, onDone }: { enquiry: Enquiry; onDone: () => void }) {
  const t = useTranslations('Enquiries');
  const common = useTranslations('Common');
  const describeError = useApiError();
  const batches = useBatches(true);
  const admit = useAdmitEnquiry(enquiry.id);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        firstName: z.string().trim().min(1, t('admit.firstNameRequired')).max(100),
        lastName: z.string().trim().min(1, t('admit.lastNameRequired')).max(100),
        batchId: z.string(),
        relation: z.enum(RELATIONS),
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
    defaultValues: { ...splitName(enquiry.studentName), batchId: '', relation: 'GUARDIAN' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await admit.mutateAsync({ ...values, batchId: values.batchId || undefined });
      toast.success(t('admit.done'));
      onDone();
    } catch (error) {
      setFormError(describeError(error, setError, FIELDS));
    }
  });

  const activeBatches = (batches.data ?? []).filter((batch) => batch.isActive);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="admit-first" label={t('admit.firstName')} error={errors.firstName?.message}>
          <Input autoComplete="off" autoFocus {...register('firstName')} />
        </FormField>
        <FormField id="admit-last" label={t('admit.lastName')} error={errors.lastName?.message}>
          <Input autoComplete="off" {...register('lastName')} />
        </FormField>
        <FormField id="admit-relation" label={t('admit.relation', { name: enquiry.name })} error={errors.relation?.message}>
          <Select {...register('relation')}>
            {RELATIONS.map((value) => (
              <option key={value} value={value}>
                {t(`admit.relations.${value}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="admit-batch" label={`${t('admit.batch')} (${common('optional')})`} error={errors.batchId?.message}>
          <Select {...register('batchId')}>
            <option value="">{t('admit.noBatch')}</option>
            {activeBatches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <Alert>{t('admit.note', { phone: enquiry.phone })}</Alert>
      <div className="flex justify-end border-t pt-5">
        <div className="w-full sm:w-56">
          <SubmitButton pending={isSubmitting} label={t('admit.submit')} pendingLabel={common('saving')} />
        </div>
      </div>
    </form>
  );
}
