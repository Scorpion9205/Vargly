import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PapersPage } from '@/components/papers/papers-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('papers') };
}

export default function Page() {
  return <PapersPage />;
}
