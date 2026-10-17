'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { useUploadPaper } from '@/lib/papers';
import { useApiError } from '@/lib/use-api-error';

const MAX_BYTES = 10 * 1024 * 1024;

/** A teacher's own PDF, to be shared with a batch like a generated paper */
export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('Papers.upload');
  const common = useTranslations('Common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('title')} closeLabel={common('close')}>
      {open ? <UploadForm onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('Papers.upload');
  const router = useRouter();
  const describeError = useApiError();
  const upload = useUploadPaper();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const choose = (chosen: File | null) => {
    setFile(null);
    setFileError(null);
    if (!chosen) return;
    if (chosen.type !== 'application/pdf' && !chosen.name.toLowerCase().endsWith('.pdf')) {
      setFileError(t('notPdf'));
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setFileError(t('tooBig'));
      return;
    }
    setFile(chosen);
    // Name the paper after the file until the teacher types their own
    setTitle((current) => current || chosen.name.replace(/\.pdf$/i, ''));
  };

  const ready = file !== null && title.trim() !== '' && subject.trim() !== '';

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file || !ready) return;
        setFormError(null);
        upload.mutate(
          { title: title.trim(), subject: subject.trim(), file },
          {
            onSuccess: (paper) => {
              toast.success(t('created'));
              onDone();
              router.push(`/app/papers/${paper.id}`);
            },
            onError: (error) => setFormError(describeError(error)),
          },
        );
      }}
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <FormField id="upload-file" label={t('file')} hint={t('fileHint')} error={fileError ?? undefined}>
        <Input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
      </FormField>
      <FormField id="upload-title" label={t('titleLabel')}>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} />
      </FormField>
      <FormField id="upload-subject" label={t('subject')}>
        <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} />
      </FormField>
      <div className="mt-2 flex justify-end border-t pt-5">
        <div className="w-full sm:w-48">
          <SubmitButton
            pending={upload.isPending}
            disabled={!ready}
            label={t('submit')}
            pendingLabel={t('uploading')}
          />
        </div>
      </div>
    </form>
  );
}
