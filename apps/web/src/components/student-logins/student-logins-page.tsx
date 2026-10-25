'use client';

import { Download, KeyRound, Power, RotateCcw, UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { toast } from '@/components/ui/toaster';
import { useBatches } from '@/lib/academics';
import { formatDate } from '@/lib/format';
import { useInstituteSettings, useUpdatePreferences } from '@/lib/settings';
import {
  downloadLoginCards,
  type IssuedLogin,
  loginState,
  type StudentLoginRow,
  useBulkLogins,
  useCreateLogin,
  useDisableLogin,
  useResetLogin,
  useStudentLogins,
} from '@/lib/student-logins';
import { useApiError } from '@/lib/use-api-error';

const TONE = { none: 'neutral', active: 'success', off: 'warning' } as const;

export function StudentLoginsPage() {
  const t = useTranslations('StudentLogins');
  const describeError = useApiError();
  const batches = useBatches(true);
  const [batchId, setBatchId] = useState('');
  const logins = useStudentLogins(batchId);
  const create = useCreateLogin();
  const reset = useResetLogin();
  const disable = useDisableLogin();
  const bulk = useBulkLogins();
  const [issued, setIssued] = useState<{ logins: IssuedLogin[]; hasMore: boolean } | null>(null);
  const [confirming, setConfirming] = useState<'bulk' | StudentLoginRow | null>(null);
  const [resetting, setResetting] = useState<StudentLoginRow | null>(null);

  const without = logins.data?.filter((row) => loginState(row) === 'none').length ?? 0;
  const activeBatches = (batches.data ?? []).filter((batch) => batch.isActive);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <PortalSwitches />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-64">
          <Select aria-label={t('batchFilter')} value={batchId} onChange={(event) => setBatchId(event.target.value)}>
            <option value="">{t('allStudents')}</option>
            {activeBatches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </Select>
        </div>
        <Button disabled={without === 0 || bulk.isPending} onClick={() => setConfirming('bulk')}>
          <UserPlus aria-hidden />
          {t('createAll', { count: without })}
        </Button>
      </div>

      {logins.isPending ? (
        <Skeleton className="h-64 rounded-xl" aria-busy="true" />
      ) : logins.isError ? (
        <QueryError error={logins.error} onRetry={() => void logins.refetch()} />
      ) : logins.data.length === 0 ? (
        <StatePanel icon={<Users className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {logins.data.map((row) => {
            const state = loginState(row);
            return (
              <li key={row.studentId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {row.name}
                    {row.rollNumber ? <span className="ml-2 text-sm font-normal text-muted-foreground">#{row.rollNumber}</span> : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge tone={TONE[state]}>{t(`state.${state}`)}</Badge>
                    {row.loginId ? <span className="font-mono text-foreground">{row.loginId}</span> : null}
                    {row.lastLoginAt ? <span>{t('lastSignIn', { date: formatDate(row.lastLoginAt) })}</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state === 'none' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={create.isPending}
                      onClick={() => void run(async () => setIssued({ logins: [await create.mutateAsync(row.studentId)], hasMore: false }))}
                    >
                      <KeyRound aria-hidden />
                      {t('create')}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setResetting(row)}>
                        <RotateCcw aria-hidden />
                        {t('reset')}
                      </Button>
                      {state === 'active' ? (
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(row)}>
                          <Power aria-hidden />
                          {t('switchOff')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirming === 'bulk'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t('bulk.title', { count: without })}
        description={t('bulk.body')}
        confirmLabel={t('bulk.confirm')}
        cancelLabel={t('cancel')}
        pending={bulk.isPending}
        onConfirm={() =>
          void run(async () => {
            const result = await bulk.mutateAsync(batchId);
            setConfirming(null);
            setIssued({ logins: result.issued, hasMore: result.hasMore });
          })
        }
      />
      <ConfirmDialog
        open={confirming !== null && confirming !== 'bulk'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t('off.title', { name: typeof confirming === 'object' && confirming ? confirming.name : '' })}
        description={t('off.body')}
        confirmLabel={t('switchOff')}
        cancelLabel={t('cancel')}
        destructive
        pending={disable.isPending}
        onConfirm={() =>
          void run(async () => {
            if (confirming && confirming !== 'bulk') await disable.mutateAsync(confirming.studentId);
            toast.success(t('off.done'));
            setConfirming(null);
          })
        }
      />
      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
        title={t('resetConfirm.title', { name: resetting?.name ?? '' })}
        description={t('resetConfirm.body')}
        confirmLabel={t('reset')}
        cancelLabel={t('cancel')}
        pending={reset.isPending}
        onConfirm={() =>
          void run(async () => {
            if (resetting) setIssued({ logins: [await reset.mutateAsync(resetting.studentId)], hasMore: false });
            setResetting(null);
          })
        }
      />
      <IssuedDialog issued={issued} onClose={() => setIssued(null)} />
    </div>
  );
}

/** The passwords are shown once, here, and can be printed as cards */
export function IssuedDialog({ issued, onClose }: { issued: { logins: IssuedLogin[]; hasMore: boolean } | null; onClose: () => void }) {
  const t = useTranslations('StudentLogins.issued');
  const describeError = useApiError();
  const [busy, setBusy] = useState(false);

  const cards = async () => {
    if (!issued) return;
    setBusy(true);
    try {
      await downloadLoginCards(issued.logins);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={issued !== null} onOpenChange={(open) => !open && onClose()} title={t('title')} description={t('description')} closeLabel={t('close')} size="lg">
      {issued ? (
        <div className="flex flex-col gap-4">
          <Alert tone="warning">{t('once')}</Alert>
          {issued.hasMore ? <Alert>{t('more')}</Alert> : null}
          {issued.logins.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('none')}</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('student')}</th>
                    <th className="px-3 py-2 font-medium">{t('studentId')}</th>
                    <th className="px-3 py-2 font-medium">{t('password')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {issued.logins.map((login) => (
                    <tr key={login.studentId}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {login.name}
                      </th>
                      <td className="px-3 py-2 font-mono">{login.loginId}</td>
                      <td className="px-3 py-2 font-mono">{login.temporaryPassword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <Button disabled={busy || issued.logins.length === 0} onClick={() => void cards()}>
              <Download aria-hidden />
              {busy ? t('preparing') : t('cards')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

/** What students may use: the panel itself, and whether they see their fees */
function PortalSwitches() {
  const t = useTranslations('StudentLogins.switches');
  const describeError = useApiError();
  const settings = useInstituteSettings();
  const update = useUpdatePreferences();
  const portal = settings.data?.config.studentPortal;
  const enabled = portal?.enabled !== false;
  const showFees = portal?.showFees === true;
  const doubts = portal?.doubts === true;

  const set = async (change: { enabled?: boolean; showFees?: boolean; doubts?: boolean }) => {
    try {
      await update.mutateAsync({ studentPortal: change });
      toast.success(t('saved'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  if (settings.isPending) return <Skeleton className="h-24 rounded-xl" />;

  return (
    <section aria-label={t('title')} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-card">
      <h2 className="font-bold">{t('title')}</h2>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={enabled}
          disabled={update.isPending}
          onChange={(event) => void set({ enabled: event.target.checked })}
        />
        <span>
          <span className="font-medium">{t('enabled')}</span>
          <span className="block text-muted-foreground">{t('enabledHint')}</span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={showFees}
          disabled={update.isPending || !enabled}
          onChange={(event) => void set({ showFees: event.target.checked })}
        />
        <span>
          <span className="font-medium">{t('showFees')}</span>
          <span className="block text-muted-foreground">{t('showFeesHint')}</span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={doubts}
          disabled={update.isPending || !enabled}
          onChange={(event) => void set({ doubts: event.target.checked })}
        />
        <span>
          <span className="font-medium">{t('doubts')}</span>
          <span className="block text-muted-foreground">{t('doubtsHint')}</span>
        </span>
      </label>
    </section>
  );
}
