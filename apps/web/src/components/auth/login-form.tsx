'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { homeFor, isStudentIdInput, looksLikeLoginId } from '@/lib/auth/roles';
import { signIn } from '@/lib/auth/session';
import { useAuthError } from '@/lib/auth/use-auth-error';
import { SubmitButton } from './submit-button';

export type LoginNotice =
  'expired' | 'registered' | 'reset' | 'passwordChanged' | 'signedOutEverywhere';

interface LoginFormProps {
  next?: string;
  notice?: LoginNotice;
  defaultEmail?: string;
}

export function LoginForm({ next, notice, defaultEmail }: LoginFormProps) {
  const t = useTranslations('Auth');
  const router = useRouter();
  const describeError = useAuthError();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        // An email, or a Student ID (a student has no email of their own)
        email: z.string().trim().min(1, t('validation.required')).refine(looksLikeLoginId, t('validation.emailOrStudentId')),
        password: z.string().min(1, t('validation.required')),
        coachingCode: z.string().trim(),
      })
      // A Student ID is only unique inside one institute
      .refine((values) => !isStudentIdInput(values.email) || values.coachingCode !== '', {
        path: ['coachingCode'],
        message: t('validation.coachingCodeForStudent'),
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
    defaultValues: { email: defaultEmail ?? '', password: '', coachingCode: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password, coachingCode }) => {
    setFormError(null);
    try {
      const session = await signIn({ email, password, coachingCode: coachingCode.toLowerCase() || undefined });
      router.replace(homeFor(session.user, next));
      router.refresh();
    } catch (error) {
      setFormError(describeError(error, setError, ['email', 'password', 'coachingCode']));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? (
        <Alert tone="danger">{formError}</Alert>
      ) : notice ? (
        <Alert tone={notice === 'expired' ? 'info' : 'success'}>{t(`login.${notice}`)}</Alert>
      ) : null}

      <FormField id="email" label={t('fields.emailOrStudentId')} error={errors.email?.message}>
        <Input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          {...register('email')}
        />
      </FormField>

      <FormField
        id="password"
        label={t('fields.password')}
        error={errors.password?.message}
        action={
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('login.forgot')}
          </Link>
        }
      >
        <PasswordInput
          autoComplete="current-password"
          showLabel={t('fields.showPassword')}
          hideLabel={t('fields.hidePassword')}
          {...register('password')}
        />
      </FormField>

      <FormField
        id="coachingCode"
        label={t('fields.coachingCodeOptional')}
        hint={t('fields.coachingCodeLoginHint')}
        error={errors.coachingCode?.message}
      >
        <Input
          autoComplete="organization"
          autoCapitalize="none"
          spellCheck={false}
          {...register('coachingCode')}
        />
      </FormField>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t('login.studentHint')}</p>

      <SubmitButton
        pending={isSubmitting}
        label={t('login.submit')}
        pendingLabel={t('login.submitting')}
      />

      <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          {t('login.signUp')}
        </Link>
      </p>
    </form>
  );
}
