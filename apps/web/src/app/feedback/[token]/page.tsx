import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PublicSurveyForm } from '@/components/surveys/public-survey-form';
import { API_URL } from '@/lib/api';

// A parent's own link: always current, never indexed
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PublicSurvey {
  instituteName: string;
  title: string;
  question: string;
  answered: boolean;
  closed: boolean;
}

async function loadSurvey(token: string): Promise<PublicSurvey | null | 'unavailable'> {
  try {
    const response = await fetch(`${API_URL}/public/survey/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) return null;
    if (!response.ok) return 'unavailable';
    return ((await response.json()) as { data: PublicSurvey }).data;
  } catch {
    return 'unavailable';
  }
}

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await loadSurvey(token);
  if (survey === null) notFound();
  const t = await getTranslations('PublicSurvey');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10 sm:py-16">
      {survey === 'unavailable' ? (
        <p role="alert" className="rounded-xl border bg-card p-6 text-center shadow-card">
          {t('unavailable')}
        </p>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">{survey.instituteName}</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-balance">{survey.title}</h1>
          </header>
          <PublicSurveyForm token={token} question={survey.question} answered={survey.answered} closed={survey.closed} />
        </>
      )}
      <footer className="mt-auto pt-6 text-center text-xs text-muted-foreground">{t('footer')}</footer>
    </main>
  );
}
