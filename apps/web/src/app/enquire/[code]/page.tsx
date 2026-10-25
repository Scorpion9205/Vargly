import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EnquiryForm } from '@/components/enquiries/public-enquiry-form';
import { API_URL } from '@/lib/api';

// Parents open this from a QR code or a link; it must always show the institute's current details
export const dynamic = 'force-dynamic';

// A parents' page is not for search results
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The institute's name, or null when the code is not an institute; an unreachable API shows the form without a name */
async function loadInstitute(code: string): Promise<{ name: string | null } | null> {
  try {
    const response = await fetch(`${API_URL}/public/enquiry/${encodeURIComponent(code)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) return null;
    if (!response.ok) return { name: null };
    const body = (await response.json()) as { data?: { name?: string } };
    return { name: body.data?.name ?? null };
  } catch {
    return { name: null };
  }
}

export default async function EnquirePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const institute = await loadInstitute(code);
  if (!institute) notFound();
  const t = await getTranslations('PublicEnquiry');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">{institute.name ?? t('fallbackName')}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <EnquiryForm code={code} />
      <footer className="mt-auto pt-6 text-center text-xs text-muted-foreground">{t('footer')}</footer>
    </main>
  );
}
