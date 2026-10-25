'use client';

import { ClipboardCheck, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { QueryError } from '@/components/dashboard/query-error';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatePanel } from '@/components/ui/state-panel';
import { formatDate } from '@/lib/format';
import { type PortalResult, usePortalResults } from '@/lib/student-portal';
import { cn } from '@/lib/utils';

/** The points of a small line chart for the scores of the tests the student sat, oldest first */
export function trendPoints(results: readonly PortalResult[], width: number, height: number): string {
  const sat = results.filter((r) => !r.absent).slice(0, 10).reverse();
  if (sat.length < 2) return '';
  const step = width / (sat.length - 1);
  return sat.map((r, i) => `${Math.round(i * step)},${Math.round(height - (Math.min(100, r.percentage) / 100) * height)}`).join(' ');
}

export function StudentResultsPage() {
  const t = useTranslations('Student.results');
  const results = usePortalResults();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {results.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : results.isError ? (
        <QueryError error={results.error} onRetry={() => void results.refetch()} />
      ) : results.data.results.length === 0 ? (
        <StatePanel icon={<ClipboardCheck className="size-5" aria-hidden />} title={t('empty.title')}>
          <p>{t('empty.body')}</p>
        </StatePanel>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('average')}</p>
                <p className="text-3xl font-extrabold tabular-nums">
                  {results.data.summary.averagePercentage === null ? '—' : `${results.data.summary.averagePercentage}%`}
                </p>
                <p className="text-xs text-muted-foreground">{t('testsSat', { count: results.data.summary.tests })}</p>
              </div>
              {trendPoints(results.data.results, 140, 48) ? (
                <svg role="img" aria-label={t('trend')} viewBox="-4 -4 148 56" className="h-16 w-36 shrink-0 text-primary">
                  <polyline points={trendPoints(results.data.results, 140, 48)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <TrendingUp className="size-8 text-muted-foreground/40" aria-hidden />
              )}
            </div>
          </section>

          <ul className="flex flex-col gap-3">
            {results.data.results.map((result) => (
              <li key={result.testId}>
                <ResultCard result={result} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: PortalResult }) {
  const t = useTranslations('Student.results');
  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold break-words">{result.title}</h2>
          <p className="text-xs text-muted-foreground">
            {result.subject} · {formatDate(result.date)}
          </p>
        </div>
        {result.absent ? (
          <Badge tone="warning">{t('absent')}</Badge>
        ) : result.passed === null ? null : (
          <Badge tone={result.passed ? 'success' : 'danger'}>{result.passed ? t('passed') : t('failed')}</Badge>
        )}
      </div>

      {result.absent ? (
        <p className="text-sm text-muted-foreground">{t('absentNote')}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tabular-nums">{result.marks}</p>
            <p className="text-muted-foreground tabular-nums">/ {result.totalMarks}</p>
            <p className="ml-auto text-lg font-bold tabular-nums">{result.percentage}%</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={cn('h-full rounded-full', result.passed === false ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${Math.min(100, result.percentage)}%` }}
            />
          </div>
          {result.standing ? (
            <p className="text-sm text-muted-foreground">
              {t('standing', { rank: result.standing.rank, outOf: result.standing.outOf, average: result.standing.classAveragePercentage })}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
