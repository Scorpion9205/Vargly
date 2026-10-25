'use client';

import { Download, FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import { useBatches } from '@/lib/academics';
import { todayInIndia } from '@/lib/dates';
import {
  downloadExport,
  EXPORT_FIELDS,
  EXPORT_KINDS,
  exportReady,
  type ExportKind,
  type ExportValues,
} from '@/lib/exports';
import { ENQUIRY_STATUSES } from '@/lib/enquiries';
import { useApiError } from '@/lib/use-api-error';

function startingValues(): ExportValues {
  return {
    status: 'all',
    month: todayInIndia().slice(0, 7),
    batchId: '',
    startDate: '',
    endDate: '',
    threshold: '',
    enquiryStatus: 'all',
  };
}

export function ExportsPage() {
  const t = useTranslations('Exports');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ul className="grid gap-4 lg:grid-cols-2">
        {EXPORT_KINDS.map((kind) => (
          <li key={kind}>
            <ExportCard kind={kind} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExportCard({ kind }: { kind: ExportKind }) {
  const t = useTranslations('Exports');
  const describeError = useApiError();
  const fields = EXPORT_FIELDS[kind];
  const needsBatches = fields.includes('batch') || fields.includes('batchRequired');
  const batches = useBatches(needsBatches);
  const [values, setValues] = useState<ExportValues>(startingValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<ExportValues>) => setValues((current) => ({ ...current, ...patch }));
  const ready = exportReady(kind, values);
  const id = (name: string) => `export-${kind}-${name}`;

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      await downloadExport(kind, values);
      toast.success(t('downloaded'));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const activeBatches = (batches.data ?? []).filter((batch) => batch.isActive);

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-accent-foreground">
          <FileSpreadsheet className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t(`kind.${kind}.title`)}</h2>
          <p className="text-sm text-muted-foreground">{t(`kind.${kind}.body`)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.includes('status') ? (
          <FormField id={id('status')} label={t('field.students')}>
            <Select value={values.status} onChange={(event) => set({ status: event.target.value })}>
              <option value="all">{t('studentStatus.all')}</option>
              <option value="active">{t('studentStatus.active')}</option>
              <option value="inactive">{t('studentStatus.inactive')}</option>
            </Select>
          </FormField>
        ) : null}
        {fields.includes('enquiryStatus') ? (
          <FormField id={id('enquiry-status')} label={t('field.enquiries')}>
            <Select value={values.enquiryStatus} onChange={(event) => set({ enquiryStatus: event.target.value })}>
              <option value="all">{t('enquiryStatus.all')}</option>
              {ENQUIRY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`enquiryStatus.${status}`)}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {fields.includes('month') ? (
          <FormField id={id('month')} label={t('field.month')}>
            <Input type="month" max={todayInIndia().slice(0, 7)} value={values.month} onChange={(event) => set({ month: event.target.value })} />
          </FormField>
        ) : null}
        {fields.includes('batch') || fields.includes('batchRequired') ? (
          <FormField id={id('batch')} label={fields.includes('batchRequired') ? t('field.batch') : t('field.batchOptional')}>
            <Select value={values.batchId} onChange={(event) => set({ batchId: event.target.value })}>
              <option value="">{fields.includes('batchRequired') ? (batches.isPending ? '…' : t('chooseBatch')) : t('allBatches')}</option>
              {activeBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {fields.includes('range') ? (
          <>
            <FormField id={id('from')} label={t('field.from')}>
              <Input type="date" max={values.endDate || undefined} value={values.startDate} onChange={(event) => set({ startDate: event.target.value })} />
            </FormField>
            <FormField id={id('to')} label={t('field.to')}>
              <Input type="date" min={values.startDate || undefined} value={values.endDate} onChange={(event) => set({ endDate: event.target.value })} />
            </FormField>
          </>
        ) : null}
        {fields.includes('threshold') ? (
          <FormField id={id('threshold')} label={t('field.threshold')} hint={t('field.thresholdHint')}>
            <Input type="number" inputMode="numeric" min={0} max={100} value={values.threshold} onChange={(event) => set({ threshold: event.target.value })} />
          </FormField>
        ) : null}
      </div>

      {fields.includes('range') ? <p className="text-xs text-muted-foreground">{t('rangeHint')}</p> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="mt-auto pt-1">
        <Button disabled={!ready || busy} onClick={() => void run()}>
          <Download aria-hidden />
          {busy ? t('preparing') : t('download')}
        </Button>
      </div>
    </article>
  );
}
