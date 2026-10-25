'use client';

import { isApiError } from '@vargly/api-client';
import { CheckCircle2, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import { useBatches } from '@/lib/academics';
import { addDays } from '@/lib/attendance';
import { todayInIndia } from '@/lib/dates';
import { type Paper, type PublishResult, usePublishPaper } from '@/lib/papers';
import { useApiError } from '@/lib/use-api-error';

/**
 * Sends a paper to a batch: as homework (with a due date) or as a practice paper. Parents get a
 * WhatsApp message with a download link; answers are never part of what they can open.
 */
export function ShareDialog({
  open,
  onOpenChange,
  paper,
  beforeShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paper: Paper;
  /** Saves the teacher's selection and edits first, so what is shared is what they see */
  beforeShare?: () => Promise<void>;
}) {
  const t = useTranslations('Papers.share');
  const common = useTranslations('Common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('title')} closeLabel={common('close')}>
      {open ? (
        <ShareForm paper={paper} beforeShare={beforeShare} onClose={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  );
}

function ShareForm({
  paper,
  beforeShare,
  onClose,
}: {
  paper: Paper;
  beforeShare?: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('Papers.share');
  const describeError = useApiError();
  const batches = useBatches();
  const publish = usePublishPaper(paper.id);

  const [batchId, setBatchId] = useState('');
  const [kind, setKind] = useState<'HOMEWORK' | 'PRACTICE' | 'MATERIAL'>(paper.source === 'UPLOAD' ? 'MATERIAL' : 'HOMEWORK');
  const [title, setTitle] = useState(paper.title);
  const [dueDate, setDueDate] = useState(addDays(todayInIndia(), 1));
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  const activeBatches = (batches.data ?? []).filter((batch) => batch.isActive);
  const chosen = activeBatches.find((batch) => batch.id === batchId);
  const ready = batchId !== '' && title.trim() !== '' && (kind !== 'HOMEWORK' || dueDate !== '');

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('copied'));
    } catch {
      toast.error(link);
    }
  };

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-semibold">{t('doneTitle', { batch: result.batchName })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('doneBody')}</p>
          </div>
        </div>
        <p className="rounded-lg bg-muted p-3 text-sm break-all">{result.link}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void copy(result.link)}>
            <Copy aria-hidden />
            {t('copyLink')}
          </Button>
          <Button onClick={onClose}>{t('close')}</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        setError(null);
        setPreparing(true);
        try {
          await beforeShare?.();
          const shared = await publish.mutateAsync({
            batchId,
            kind,
            title: title.trim(),
            ...(kind === 'HOMEWORK' ? { dueDate } : {}),
          });
          setResult(shared);
        } catch (failure) {
          setError(
            isApiError(failure) && failure.code === 'ALREADY_SHARED'
              ? t('alreadyShared')
              : describeError(failure),
          );
        } finally {
          setPreparing(false);
        }
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <FormField id="share-batch" label={t('batch')}>
        <Select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
          <option value="">{batches.isPending ? '…' : t('choose')}</option>
          {activeBatches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
      </FormField>
      {batches.isSuccess && activeBatches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noBatches')}</p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('kind')}</legend>
        {(['HOMEWORK', 'PRACTICE', 'MATERIAL'] as const).map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-brand-soft/40"
          >
            <input
              type="radio"
              name="share-kind"
              className="mt-1 size-4 accent-primary"
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            <span>
              <span className="block text-sm font-medium">
                {t(value === 'HOMEWORK' ? 'homework' : value === 'PRACTICE' ? 'practice' : 'material')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(value === 'HOMEWORK' ? 'homeworkHint' : value === 'PRACTICE' ? 'practiceHint' : 'materialHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <FormField id="share-title" label={t('titleLabel')}>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} />
      </FormField>
      {kind === 'HOMEWORK' ? (
        <FormField id="share-due" label={t('dueDate')}>
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
      ) : null}

      {paper.source === 'AI' ? <p className="text-sm text-muted-foreground">{t('answersNote')}</p> : null}
      {chosen?.activeStudentCount !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {t('recipients', { count: chosen.activeStudentCount })}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end border-t pt-5">
        <div className="w-full sm:w-56">
          <SubmitButton
            pending={preparing || publish.isPending}
            disabled={!ready}
            label={t('submit')}
            pendingLabel={t('sharing')}
          />
        </div>
      </div>
    </form>
  );
}
