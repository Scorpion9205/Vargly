import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExportsPage } from '@/components/exports/exports-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('exports') };
}

export default function Page() {
  return <ExportsPage />;
}
