'use client';

import { ArrowLeft, Copy, Eye, EyeOff, FileText, KeyRound, Loader2, Pencil, Plus, RefreshCw, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { QueryError } from '@/components/dashboard/query-error';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { formatDateTime } from '@/lib/format';
import {
  downloadPdf,
  type Paper,
  type Question,
  openPdf,
  totalMarks,
  useDuplicatePaper,
  usePaper,
  usePaperShares,
  useRegenerateQuestion,
  useUpdatePaper,
} from '@/lib/papers';
import { cn } from '@/lib/utils';
import { AddQuestionsDialog } from './add-questions-dialog';
import { ShareDialog } from './share-dialog';

/** One paper: choose and edit its questions, preview it, and share it with a batch */
export function PaperEditor({ id }: { id: string }) {
  const paper = usePaper(id);
  if (paper.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (paper.isError) return <QueryError error={paper.error} onRetry={() => void paper.refetch()} />;
  // The draft keeps its own working copy of the questions, so it mounts once per paper
  return paper.data.status === 'PUBLISHED' ? (
    <SharedPaper paper={paper.data} />
  ) : (
    <DraftPaper key={paper.data.id} paper={paper.data} />
  );
}

function BackLink() {
  const t = useTranslations('Papers.editor');
  return (
    <Link href="/app/papers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden />
      {t('back')}
    </Link>
  );
}

/** Preview and answer key buttons: the API renders the saved paper, so unsaved edits are saved first */
function usePdfActions(paperId: string, beforeOpen?: () => Promise<void>) {
  const t = useTranslations('Papers.editor');
  const [busy, setBusy] = useState<'preview' | 'key' | null>(null);
  const run = async (which: 'preview' | 'key') => {
    setBusy(which);
    try {
      await beforeOpen?.();
      if (which === 'preview') await openPdf(`/papers/${paperId}/pdf`, 'paper.pdf');
      else await downloadPdf(`/papers/${paperId}/pdf?answers=true`, 'answer-key.pdf');
    } catch {
      toast.error(t('pdfFailed'));
    } finally {
      setBusy(null);
    }
  };
  return { busy, preview: () => run('preview'), answerKey: () => run('key') };
}

// ---------------------------------------------------------------- a draft

function DraftPaper({ paper }: { paper: Paper }) {
  const t = useTranslations('Papers.editor');
  const types = useTranslations('Papers.types');
  const update = useUpdatePaper(paper.id);
  const regenerate = useRegenerateQuestion(paper.id);

  const [title, setTitle] = useState(paper.title);
  const [questions, setQuestions] = useState<Question[]>(paper.questions);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(paper.questions.map((q) => q.id)));
  const [saved, setSaved] = useState(() => JSON.stringify({ title: paper.title, questions: paper.questions }));
  const [showAnswers, setShowAnswers] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const isAi = paper.source === 'AI';
  const current = JSON.stringify({ title, questions });
  const dirty = current !== saved;
  const chosen = useMemo(() => questions.filter((q) => selected.has(q.id)), [questions, selected]);

  /** Saves the paper as edited (every question, selected or not) */
  const saveDraft = async (): Promise<void> => {
    if (!isAi && title === paper.title) return;
    setSaveError(false);
    try {
      await update.mutateAsync(isAi ? { title, questions } : { title });
      setSaved(current);
    } catch (error) {
      setSaveError(true);
      throw error;
    }
  };

  /** Before sharing: what the teacher kept is what gets shared, so the others are dropped */
  const saveSelection = async (): Promise<void> => {
    if (!isAi) return;
    await update.mutateAsync({ title, questions: chosen });
  };

  const pdf = usePdfActions(paper.id, async () => {
    if (dirty) await saveDraft();
  });

  const setQuestion = (id: string, change: Partial<Question>) =>
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...change } : q)));

  const toggle = (id: string) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const replace = (question: Question) => {
    setReplacingId(question.id);
    regenerate.mutate(
      { questionId: question.id },
      {
        onSuccess: (updated) => {
          const index = questions.findIndex((q) => q.id === question.id);
          const fresh = updated.questions[index];
          if (!fresh || fresh.id === question.id) return;
          setQuestions((list) => list.map((q) => (q.id === question.id ? fresh : q)));
          setSelected((set) => {
            const next = new Set(set);
            if (next.delete(question.id)) next.add(fresh.id);
            return next;
          });
          setEditingId((id) => (id === question.id ? null : id));
          toast.success(t('regenerated'));
        },
        onError: () => toast.error(t('regenerateFailed')),
        onSettled: () => setReplacingId(null),
      },
    );
  };

  const existingIds = useMemo(() => new Set(questions.map((q) => q.id)), [questions]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={<BackLink />}
        title={title || paper.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {paper.subject}
            {paper.topic ? ` · ${paper.topic}` : ''}
            <Badge tone="info">{t('statusDraft')}</Badge>
          </span>
        }
        actions={
          <>
            {isAi ? (
              <>
                <Button variant="outline" onClick={() => void pdf.preview()} disabled={pdf.busy !== null}>
                  {pdf.busy === 'preview' ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
                  {t('preview')}
                </Button>
                <Button variant="outline" onClick={() => void pdf.answerKey()} disabled={pdf.busy !== null}>
                  {pdf.busy === 'key' ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
                  {t('answerKey')}
                </Button>
              </>
            ) : null}
            <Button onClick={() => setShareOpen(true)} disabled={isAi && chosen.length === 0}>
              <Send aria-hidden />
              {t('share')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:max-w-md">
        <label htmlFor="paper-title" className="text-sm font-medium">
          {t('titleLabel')}
        </label>
        <Input id="paper-title" value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} />
      </div>

      {saveError ? <Alert tone="danger">{t('saveFailed')}</Alert> : null}

      {!isAi ? (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-5">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-semibold break-all">{t('yourFile', { name: paper.fileName ?? '' })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('yourFileBody')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-4 py-3 backdrop-blur">
            <p className="mr-auto text-sm font-medium" aria-live="polite">
              {t('selected', { selected: chosen.length, total: questions.length, marks: totalMarks(chosen) })}
              {dirty ? <span className="ml-2 text-xs font-normal text-warning">{t('unsaved')}</span> : null}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(questions.map((q) => q.id)))}>
              {t('selectAll')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              {t('selectNone')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAnswers((value) => !value)}>
              {showAnswers ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {showAnswers ? t('hideAnswers') : t('showAnswers')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus aria-hidden />
              {t('addQuestions')}
            </Button>
            <Button
              size="sm"
              variant={dirty ? 'primary' : 'outline'}
              disabled={!dirty || update.isPending}
              onClick={() => void saveDraft().then(() => toast.success(t('saved'))).catch(() => undefined)}
            >
              {update.isPending ? t('saving') : t('saveDraft')}
            </Button>
          </div>

          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                index={index + 1}
                question={question}
                typeLabel={types(question.type)}
                selected={selected.has(question.id)}
                editing={editingId === question.id}
                replacing={replacingId === question.id}
                showAnswer={showAnswers}
                onToggle={() => toggle(question.id)}
                onEdit={() => setEditingId((id) => (id === question.id ? null : question.id))}
                onChange={(change) => setQuestion(question.id, change)}
                onReplace={() => replace(question)}
              />
            ))}
          </ol>
        </>
      )}

      <AddQuestionsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        paperId={paper.id}
        existing={existingIds}
        onAdded={(added, shortBy) => {
          setQuestions((list) => [...list, ...added]);
          setSelected((set) => new Set([...set, ...added.map((q) => q.id)]));
          toast.success(`+${added.length}`);
          if (shortBy > 0) toast.warning(t('addShortBy'));
        }}
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} paper={paper} beforeShare={saveSelection} />
    </div>
  );
}

function QuestionCard({
  index,
  question,
  typeLabel,
  selected,
  editing,
  replacing,
  showAnswer,
  onToggle,
  onEdit,
  onChange,
  onReplace,
  readOnly = false,
}: {
  index: number;
  question: Question;
  typeLabel: string;
  selected: boolean;
  editing: boolean;
  replacing: boolean;
  showAnswer: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onChange: (change: Partial<Question>) => void;
  onReplace: () => void;
  /** A shared paper: no choosing, editing or replacing */
  readOnly?: boolean;
}) {
  const t = useTranslations('Papers.editor');
  const answerText =
    question.type === 'MCQ' && question.options
      ? `${question.answer}) ${question.options['ABCD'.indexOf(question.answer)] ?? ''}`
      : question.answer;

  return (
    <li className={cn('rounded-xl border bg-card p-4 transition-opacity', !selected && 'opacity-60')}>
      <div className="flex items-start gap-3">
        {readOnly ? null : (
          <input
            type="checkbox"
            className="mt-1.5 size-4 shrink-0 accent-primary"
            checked={selected}
            onChange={onToggle}
            aria-label={`${t('keep')} ${index}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{index}.</span>
            <Badge tone="neutral">{typeLabel}</Badge>
            <span className="text-xs text-muted-foreground">
              {question.marks} {t('marksLabel').toLowerCase()}
            </span>
            {readOnly ? null : (
              <span className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={onEdit}>
                  <Pencil aria-hidden />
                  {editing ? t('doneEditing') : t('edit')}
                </Button>
                <Button variant="ghost" size="icon" aria-label={t('regenerate')} title={t('regenerate')} disabled={replacing} onClick={onReplace}>
                  {replacing ? <Loader2 className="size-4! animate-spin" aria-hidden /> : <RefreshCw className="size-4!" aria-hidden />}
                </Button>
              </span>
            )}
          </div>

          {editing ? (
            <QuestionFields question={question} onChange={onChange} />
          ) : (
            <>
              <p className="mt-2 break-words whitespace-pre-line">{question.text}</p>
              {question.options ? (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {question.options.map((option, i) => (
                    <li key={i} className={cn(showAnswer && question.answer === 'ABCD'[i] && 'font-semibold text-success')}>
                      {'ABCD'[i]}) {option}
                    </li>
                  ))}
                </ul>
              ) : null}
              {showAnswer ? (
                <div className="mt-2 rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">{t('answerIs', { answer: answerText })}</p>
                  {question.explanation ? <p className="mt-1 text-muted-foreground">{question.explanation}</p> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function QuestionFields({ question, onChange }: { question: Question; onChange: (change: Partial<Question>) => void }) {
  const t = useTranslations('Papers.editor');
  return (
    <div className="mt-3 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('question')}
        <Textarea rows={3} value={question.text} onChange={(event) => onChange({ text: event.target.value })} maxLength={1500} />
      </label>
      {question.options ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option, i) => (
            <label key={i} className="flex flex-col gap-1 text-sm font-medium">
              {t('options', { letter: 'ABCD'[i] ?? '' })}
              <Input
                value={option}
                maxLength={300}
                onChange={(event) =>
                  onChange({ options: question.options!.map((o, at) => (at === i ? event.target.value : o)) })
                }
              />
            </label>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('answer')}
          {question.type === 'MCQ' ? (
            <Select value={question.answer} onChange={(event) => onChange({ answer: event.target.value })}>
              {['A', 'B', 'C', 'D'].map((letter) => (
                <option key={letter} value={letter}>
                  {letter}
                </option>
              ))}
            </Select>
          ) : question.type === 'TRUE_FALSE' ? (
            <Select value={question.answer} onChange={(event) => onChange({ answer: event.target.value })}>
              <option value="True">True</option>
              <option value="False">False</option>
            </Select>
          ) : (
            <Textarea rows={2} value={question.answer} onChange={(event) => onChange({ answer: event.target.value })} maxLength={2000} />
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('marksLabel')}
          <Input
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={question.marks}
            onChange={(event) => onChange({ marks: Number(event.target.value) > 0 ? Number(event.target.value) : question.marks })}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('explanation')}
        <Input value={question.explanation ?? ''} maxLength={1500} onChange={(event) => onChange({ explanation: event.target.value })} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- a shared paper

function SharedPaper({ paper }: { paper: Paper }) {
  const t = useTranslations('Papers.editor');
  const types = useTranslations('Papers.types');
  const router = useRouter();
  const shares = usePaperShares(paper.id, true);
  const duplicate = useDuplicatePaper(paper.id);
  const pdf = usePdfActions(paper.id);
  const [shareOpen, setShareOpen] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('linkCopied'));
    } catch {
      toast.error(link);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={<BackLink />}
        title={paper.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {paper.subject}
            {paper.topic ? ` · ${paper.topic}` : ''}
            <Badge tone="success">{t('statusShared')}</Badge>
          </span>
        }
        actions={
          <>
            {paper.source === 'AI' ? (
              <>
                <Button variant="outline" onClick={() => void pdf.preview()} disabled={pdf.busy !== null}>
                  <FileText aria-hidden />
                  {t('preview')}
                </Button>
                <Button variant="outline" onClick={() => void pdf.answerKey()} disabled={pdf.busy !== null}>
                  <KeyRound aria-hidden />
                  {t('answerKey')}
                </Button>
              </>
            ) : null}
            <Button onClick={() => setShareOpen(true)}>
              <Send aria-hidden />
              {t('share')}
            </Button>
          </>
        }
      />

      <Alert tone="info">
        <div className="flex flex-col gap-2">
          <p className="font-medium">{t('publishedTitle')}</p>
          <p>{t('publishedBody')}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={duplicate.isPending}
            onClick={() =>
              duplicate.mutate(undefined, {
                onSuccess: (copyOfPaper) => {
                  toast.success(t('copyMade'));
                  router.push(`/app/papers/${copyOfPaper.id}`);
                },
              })
            }
          >
            <Copy aria-hidden />
            {t('makeCopy')}
          </Button>
        </div>
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('sharedWith')}</h2>
        {shares.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : shares.isError ? (
          <QueryError error={shares.error} onRetry={() => void shares.refetch()} />
        ) : shares.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noShares')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shares.data.map((share) => (
              <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{formatDateTime(share.createdAt)}</p>
                  <p className="text-muted-foreground">
                    {t('opens', { count: share.openCount })}
                    {share.lastOpenedAt ? ` · ${formatDateTime(share.lastOpenedAt)}` : ''}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void copy(share.link)}>
                  <Copy aria-hidden />
                  {t('copyLink')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {paper.source === 'AI' ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{t('selected', { selected: paper.questionCount, total: paper.questionCount, marks: paper.totalMarks })}</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowAnswers((value) => !value)}>
              {showAnswers ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {showAnswers ? t('hideAnswers') : t('showAnswers')}
            </Button>
          </div>
          <ol className="flex flex-col gap-3">
            {paper.questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                index={index + 1}
                question={question}
                typeLabel={types(question.type)}
                selected
                readOnly
                editing={false}
                replacing={false}
                showAnswer={showAnswers}
                onToggle={() => undefined}
                onEdit={() => undefined}
                onChange={() => undefined}
                onReplace={() => undefined}
              />
            ))}
          </ol>
        </section>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-5">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="font-semibold break-all">{t('yourFile', { name: paper.fileName ?? '' })}</p>
        </div>
      )}

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} paper={paper} />
    </div>
  );
}

