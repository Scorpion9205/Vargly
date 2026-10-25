'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { publicApi } from '@/lib/api';
import { isValidPhone, normalisePhone } from '@/lib/phone';
import { useApiError } from '@/lib/use-api-error';

const FIELDS = ['name', 'phone', 'studentName', 'interestedIn', 'message'] as const;

/** The parent's side: a short form that lands in the owner's Enquiries list */
export function EnquiryForm({ code }: { code: string }) {
  const t = useTranslations('PublicEnquiry');
  const describeError = useApiError();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t('nameMin')).max(120),
        phone: z.string().refine(isValidPhone, t('phoneInvalid')),
        studentName: z.string().trim().max(120),
        interestedIn: z.string().trim().max(200),
        message: z.string().trim().max(500),
        website: z.string(),
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
    defaultValues: { name: '', phone: '', studentName: '', interestedIn: '', message: '', website: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await publicApi.post(`/public/enquiry/${encodeURIComponent(code)}`, {
        name: values.name,
        phone: normalisePhone(values.phone),
        studentName: values.studentName,
        interestedIn: values.interestedIn,
        message: values.message,
        website: values.website,
      });
      setSent(true);
    } catch (error) {
      setFormError(describeError(error, setError, FIELDS));
    }
  });

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-card">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <h2 className="text-xl font-bold">{t('thanksTitle')}</h2>
        <p className="text-muted-foreground">{t('thanksBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-card">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <FormField id="enquiry-name" label={t('name')} error={errors.name?.message}>
        <Input autoComplete="name" maxLength={120} {...register('name')} />
      </FormField>
      <FormField id="enquiry-phone" label={t('phone')} hint={t('phoneHint')} error={errors.phone?.message}>
        <Input type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
      </FormField>
      <FormField id="enquiry-student" label={`${t('studentName')} (${t('optional')})`} error={errors.studentName?.message}>
        <Input autoComplete="off" maxLength={120} {...register('studentName')} />
      </FormField>
      <FormField id="enquiry-interest" label={`${t('interestedIn')} (${t('optional')})`} hint={t('interestedInHint')} error={errors.interestedIn?.message}>
        <Input autoComplete="off" maxLength={200} {...register('interestedIn')} />
      </FormField>
      <FormField id="enquiry-message" label={`${t('message')} (${t('optional')})`} error={errors.message?.message}>
        <Textarea rows={3} maxLength={500} {...register('message')} />
      </FormField>

      {/* A field people never see; a bot that fills it in is ignored */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      <SubmitButton pending={isSubmitting} label={t('submit')} pendingLabel={t('sending')} />
      <p className="text-center text-xs text-muted-foreground">{t('privacy')}</p>
    </form>
  );
}
