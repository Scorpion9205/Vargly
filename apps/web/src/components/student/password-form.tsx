'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { signOut } from '@/lib/auth/session';
import { useChangePassword } from '@/lib/settings';
import { useApiError } from '@/lib/use-api-error';

/**
 * Choosing a new password. The first time (a temporary password from the institute) it is the
 * only thing the panel allows; later it is under Profile. Either way every session ends with
 * the old password, so the student signs in again with the new one.
 */
export function PasswordForm({ first }: { first: boolean }) {
  const t = useTranslations('Student.password');
  const v = useTranslations('Auth.validation');
  const auth = useTranslations('Auth.fields');
  const describeError = useApiError();
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, v('required')),
          newPassword: z.string().min(8, v('passwordMin')).max(128),
          confirmPassword: z.string(),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          path: ['confirmPassword'],
          message: v('passwordsMatch'),
        })
        .refine((values) => values.newPassword !== values.currentPassword, {
          path: ['newPassword'],
          message: t('samePassword'),
        }),
    [v, t],
  );
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      await change.mutateAsync({ currentPassword, newPassword });
    } catch (error) {
      setFormError(describeError(error, setError, ['currentPassword', 'newPassword']));
      return;
    }
    await signOut('passwordChanged');
  });

  const toggle = { showLabel: auth('showPassword'), hideLabel: auth('hidePassword') };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-primary">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-bold">{first ? t('firstTitle') : t('title')}</h1>
          <p className="text-sm text-muted-foreground">{first ? t('firstBody') : t('body')}</p>
        </div>
      </div>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormField id="current-password" label={first ? t('temporary') : t('current')} error={errors.currentPassword?.message}>
        <PasswordInput autoComplete="current-password" {...toggle} {...register('currentPassword')} />
      </FormField>
      <FormField id="new-password" label={auth('newPassword')} hint={t('rules')} error={errors.newPassword?.message}>
        <PasswordInput autoComplete="new-password" {...toggle} {...register('newPassword')} />
      </FormField>
      <FormField id="confirm-password" label={auth('confirmPassword')} error={errors.confirmPassword?.message}>
        <PasswordInput autoComplete="new-password" {...toggle} {...register('confirmPassword')} />
      </FormField>
      <SubmitButton pending={isSubmitting} label={t('submit')} pendingLabel={t('submitting')} />
    </form>
  );
}
