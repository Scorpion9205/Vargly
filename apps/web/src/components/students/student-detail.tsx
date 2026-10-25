'use client';

import {
  ArrowLeft,
  Layers,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { StudentLoginCard } from '@/components/student-logins/student-login-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import {
  fullName,
  type Student,
  useBatches,
  useDeleteStudent,
  useEnrolStudent,
  useStudent,
  useUpdateStudent,
  useWithdrawStudent,
} from '@/lib/academics';
import { can } from '@/lib/auth/permissions';
import { useSession } from '@/lib/auth/use-session';
import { formatDate } from '@/lib/format';
import { whatsappLink } from '@/lib/phone';
import { useApiError } from '@/lib/use-api-error';
import { StudentResults } from './student-results';
import { StudentFees } from '@/components/fees/student-fees';

// Forms are left out of the page's first download and load just after it
const ParentDialog = dynamic(() => import('./parent-dialog').then((m) => m.ParentDialog));
const StudentFormDialog = dynamic(() =>
  import('./student-form-dialog').then((m) => m.StudentFormDialog),
);

export function StudentDetail({ id }: { id: string }) {
  const t = useTranslations('Students.detail');
  const query = useStudent(id);

  const back = (
    <Link
      href="/app/students"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {t('back')}
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {back}
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <StudentProfile student={query.data} back={back} />;
}

function StudentProfile({ student, back }: { student: Student; back: ReactNode }) {
  const t = useTranslations('Students');
  const common = useTranslations('Common');
  const router = useRouter();
  const user = useSession()?.user;
  const describeError = useApiError();
  const name = fullName(student);

  const [editing, setEditing] = useState(false);
  const [addingParent, setAddingParent] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useUpdateStudent(student.id);
  const remove = useDeleteStudent();
  const withdraw = useWithdrawStudent();

  const canUpdate = can(user, 'students:update');
  const canDelete = can(user, 'students:delete');
  const canManageBatches = can(user, 'batches:update');
  const canSeeResults = can(user, 'tests:read');
  const canSeeFees = can(user, 'fees:read');
  const canManageLogin = can(user, 'student_logins:manage') && student.isActive;

  const toggleActive = async () => {
    try {
      await update.mutateAsync({ isActive: !student.isActive });
      toast.success(t(student.isActive ? 'detail.deactivated' : 'detail.reactivated', { name }));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const deleteStudent = async () => {
    try {
      await remove.mutateAsync(student.id);
      toast.success(t('detail.deleted', { name }));
      router.replace('/app/students');
    } catch (error) {
      setConfirmDelete(false);
      toast.error(describeError(error));
    }
  };

  const details: Array<[string, ReactNode]> = [
    [t('form.rollNumber'), student.rollNumber],
    [t('form.gender'), student.gender ? t(`gender.${student.gender}`) : null],
    [t('form.dob'), student.dob ? formatDate(student.dob) : null],
    [t('form.joiningDate'), formatDate(student.joiningDate)],
    [t('form.phone'), student.phone],
    [t('form.email'), student.email],
    [t('form.address'), student.address],
  ];
  const parents = student.parents ?? [];
  const batches = student.batches ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={back}
        title={name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={student.isActive ? 'success' : 'neutral'}>
              {common(student.isActive ? 'status.active' : 'status.inactive')}
            </Badge>
            {student.rollNumber ? (
              <span className="text-sm">{t('rollNo', { roll: student.rollNumber })}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            {canUpdate ? (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  {common('edit')}
                </Button>
                <Button variant="outline" onClick={toggleActive} disabled={update.isPending}>
                  {student.isActive ? <UserRoundX aria-hidden /> : <UserRoundCheck aria-hidden />}
                  {t(student.isActive ? 'detail.deactivate' : 'detail.reactivate')}
                </Button>
              </>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden />
                {t('detail.delete')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.personal')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-sm break-words">
                      {value || t('detail.notProvided')}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          {canSeeFees ? <StudentFees studentId={student.id} studentName={name} /> : null}
          {canSeeResults ? <StudentResults studentId={student.id} /> : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('detail.parents')}</CardTitle>
              {canUpdate ? (
                <Button size="sm" variant="ghost" onClick={() => setAddingParent(true)}>
                  <Plus aria-hidden />
                  {t('detail.addParent')}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {parents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.noParents')}</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {parents.map((parent) => (
                    <li key={parent.id} className="flex flex-col gap-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {parent.name}
                        <span className="font-normal text-muted-foreground">
                          {t.has(`relation.${parent.relation}`)
                            ? t(`relation.${parent.relation}` as 'relation.FATHER')
                            : parent.relation}
                        </span>
                        {parent.isPrimary ? (
                          <Badge tone="brand">{t('detail.primary')}</Badge>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <a
                          href={`tel:${parent.phone}`}
                          className="inline-flex items-center gap-1.5 text-primary hover:underline"
                        >
                          <Phone className="size-3.5" aria-hidden />
                          {parent.phone}
                        </a>
                        <a
                          href={whatsappLink(parent.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-whatsapp hover:underline"
                        >
                          <MessageCircle className="size-3.5" aria-hidden />
                          WhatsApp
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canManageLogin ? <StudentLoginCard studentId={student.id} /> : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('detail.batches')}</CardTitle>
              {canManageBatches ? (
                <Button size="sm" variant="ghost" onClick={() => setEnrolling(true)}>
                  <Plus aria-hidden />
                  {t('detail.addToBatch')}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.noBatches')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {batches.map((batch) => (
                    <li key={batch.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <Layers className="size-4 shrink-0 text-primary" aria-hidden />
                      <Link
                        href={`/app/batches/${batch.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {batch.subject ? `${batch.name} · ${batch.subject}` : batch.name}
                      </Link>
                      {canManageBatches ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={t('detail.removeFromBatch', { batch: batch.name })}
                          disabled={withdraw.isPending}
                          onClick={() =>
                            withdraw
                              .mutateAsync({ batchId: batch.id, studentId: student.id })
                              .catch((error: unknown) => toast.error(describeError(error)))
                          }
                        >
                          <X aria-hidden />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <StudentFormDialog open={editing} onOpenChange={setEditing} student={student} />
      <ParentDialog
        open={addingParent}
        onOpenChange={setAddingParent}
        studentId={student.id}
        isFirst={parents.length === 0}
      />
      <EnrolDialog
        open={enrolling}
        onOpenChange={setEnrolling}
        studentId={student.id}
        currentBatchIds={batches.map((batch) => batch.id)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('detail.deleteTitle', { name })}
        description={t('detail.deleteBody')}
        confirmLabel={t('detail.delete')}
        cancelLabel={common('cancel')}
        onConfirm={() => void deleteStudent()}
        pending={remove.isPending}
        destructive
      />
    </div>
  );
}

function EnrolDialog({
  open,
  onOpenChange,
  studentId,
  currentBatchIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  currentBatchIds: string[];
}) {
  const t = useTranslations('Students');
  const common = useTranslations('Common');
  const describeError = useApiError();
  // Only needed once the dialog is opened
  const batches = useBatches(open);
  const enrol = useEnrolStudent();
  const [batchId, setBatchId] = useState('');
  const available = (batches.data ?? []).filter(
    (batch) => batch.isActive && !currentBatchIds.includes(batch.id),
  );

  const submit = async () => {
    const batch = available.find((b) => b.id === batchId);
    if (!batch) return;
    try {
      await enrol.mutateAsync({ batchId, studentId });
      toast.success(t('detail.enrolled', { batch: batch.name }));
      setBatchId('');
      onOpenChange(false);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('detail.addToBatch')}
      closeLabel={common('close')}
    >
      <div className="flex flex-col gap-4">
        <Select
          aria-label={t('form.batch')}
          value={batchId}
          onChange={(event) => setBatchId(event.target.value)}
        >
          <option value="">{t('form.batch')}</option>
          {available.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.subject ? `${batch.name} · ${batch.subject}` : batch.name}
            </option>
          ))}
        </Select>
        <Button size="lg" disabled={!batchId || enrol.isPending} onClick={() => void submit()}>
          {common('save')}
        </Button>
      </div>
    </Dialog>
  );
}
