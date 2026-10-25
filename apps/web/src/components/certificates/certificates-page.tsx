'use client';

import { Award, Download, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { useStudents } from '@/lib/academics';
import { todayInIndia } from '@/lib/dates';
import { downloadPdf, openPdf } from '@/lib/papers';
import { useApiError } from '@/lib/use-api-error';

export const CERTIFICATE_TYPES = ['ACHIEVEMENT', 'COMPLETION', 'PARTICIPATION'] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export interface CertificateRequest {
  studentId: string;
  type: CertificateType;
  reason: string;
  issuedOn: string;
  signedBy: string;
}

/** The API path that makes the PDF; empty details are left out */
export function certificatePath(request: CertificateRequest): string {
  const params = new URLSearchParams({ studentId: request.studentId, type: request.type });
  if (request.reason.trim()) params.set('reason', request.reason.trim());
  if (request.issuedOn) params.set('issuedOn', request.issuedOn);
  if (request.signedBy.trim()) params.set('signedBy', request.signedBy.trim());
  return `/certificates/pdf?${params.toString()}`;
}

export function CertificatesPage() {
  const t = useTranslations('Certificates');
  const describeError = useApiError();
  const [search, setSearch] = useState('');
  const students = useStudents({ search, status: 'active', page: 1 });
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState<CertificateType>('ACHIEVEMENT');
  const [reason, setReason] = useState('');
  const [issuedOn, setIssuedOn] = useState(todayInIndia());
  const [signedBy, setSignedBy] = useState('');
  const [busy, setBusy] = useState<'open' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = students.data?.items ?? [];
  const ready = studentId !== '' && issuedOn !== '';

  const run = async (mode: 'open' | 'download') => {
    if (!ready) return;
    setError(null);
    setBusy(mode);
    const path = certificatePath({ studentId, type, reason, issuedOn, signedBy });
    try {
      if (mode === 'open') await openPdf(path, 'certificate.pdf');
      else {
        await downloadPdf(path, 'certificate.pdf');
        toast.success(t('downloaded'));
      }
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="grid gap-6 rounded-xl border bg-card p-5 shadow-card lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SearchInput
            value={search}
            onSearch={setSearch}
            label={t('searchStudent')}
            clearLabel={t('clearSearch')}
            placeholder={t('searchPlaceholder')}
          />
          <FormField id="certificate-student" label={t('student')}>
            <Select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">{students.isPending ? '…' : t('chooseStudent')}</option>
              {list.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                  {student.rollNumber ? ` (${student.rollNumber})` : ''}
                </option>
              ))}
            </Select>
          </FormField>
          {students.isSuccess && list.length === 0 ? <p className="text-sm text-muted-foreground">{t('noStudents')}</p> : null}

          <FormField id="certificate-type" label={t('kind')}>
            <Select value={type} onChange={(event) => setType(event.target.value as CertificateType)}>
              {CERTIFICATE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`type.${value}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="flex flex-col gap-4">
          <FormField id="certificate-reason" label={t('reason')} hint={t('reasonHint')}>
            <Textarea rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t(`placeholder.${type}`)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="certificate-date" label={t('date')}>
              <Input type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} />
            </FormField>
            <FormField id="certificate-signer" label={`${t('signedBy')}`} hint={t('signedByHint')}>
              <Input value={signedBy} maxLength={100} onChange={(event) => setSignedBy(event.target.value)} />
            </FormField>
          </div>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" disabled={!ready || busy !== null} onClick={() => void run('open')}>
          <Eye aria-hidden />
          {busy === 'open' ? t('preparing') : t('preview')}
        </Button>
        <Button disabled={!ready || busy !== null} onClick={() => void run('download')}>
          <Download aria-hidden />
          {busy === 'download' ? t('preparing') : t('download')}
        </Button>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Award className="size-4" aria-hidden />
        {t('note')}
      </p>
    </div>
  );
}
