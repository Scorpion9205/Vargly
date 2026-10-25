'use client';

import { KeyRound, Power, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/format';
import {
  type IssuedLogin,
  loginState,
  useCreateLogin,
  useDisableLogin,
  useResetLogin,
  useStudentLogin,
} from '@/lib/student-logins';
import { useApiError } from '@/lib/use-api-error';
import { IssuedDialog } from './student-logins-page';

const TONE = { none: 'neutral', active: 'success', off: 'warning' } as const;

/** On a student's page: whether they can sign in to the student panel, and the buttons to change that */
export function StudentLoginCard({ studentId }: { studentId: string }) {
  const t = useTranslations('StudentLogins');
  const describeError = useApiError();
  const login = useStudentLogin(studentId);
  const create = useCreateLogin();
  const reset = useResetLogin();
  const disable = useDisableLogin();
  const [issued, setIssued] = useState<IssuedLogin | null>(null);
  const [confirming, setConfirming] = useState<'reset' | 'off' | null>(null);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const row = login.data;
  const state = row ? loginState(row) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('card.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {login.isPending ? (
          <Skeleton className="h-10" aria-busy="true" />
        ) : login.isError || !row || !state ? (
          <p className="text-sm text-muted-foreground">{t('card.unavailable')}</p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={TONE[state]}>{t(`state.${state}`)}</Badge>
              {row.loginId ? <span className="font-mono">{row.loginId}</span> : null}
              {row.lastLoginAt ? <span className="text-muted-foreground">{t('lastSignIn', { date: formatDate(row.lastLoginAt) })}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {state === 'none' ? (
                <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => void run(async () => setIssued(await create.mutateAsync(studentId)))}>
                  <KeyRound aria-hidden />
                  {t('create')}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setConfirming('reset')}>
                    <RotateCcw aria-hidden />
                    {t('reset')}
                  </Button>
                  {state === 'active' ? (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming('off')}>
                      <Power aria-hidden />
                      {t('switchOff')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming === 'reset'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t('resetConfirm.title', { name: row?.name ?? '' })}
        description={t('resetConfirm.body')}
        confirmLabel={t('reset')}
        cancelLabel={t('cancel')}
        pending={reset.isPending}
        onConfirm={() =>
          void run(async () => {
            setIssued(await reset.mutateAsync(studentId));
            setConfirming(null);
          })
        }
      />
      <ConfirmDialog
        open={confirming === 'off'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t('off.title', { name: row?.name ?? '' })}
        description={t('off.body')}
        confirmLabel={t('switchOff')}
        cancelLabel={t('cancel')}
        destructive
        pending={disable.isPending}
        onConfirm={() =>
          void run(async () => {
            await disable.mutateAsync(studentId);
            toast.success(t('off.done'));
            setConfirming(null);
          })
        }
      />
      <IssuedDialog issued={issued ? { logins: [issued], hasMore: false } : null} onClose={() => setIssued(null)} />
    </Card>
  );
}
