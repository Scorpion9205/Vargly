import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KnowledgePage } from '@/components/knowledge/knowledge-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('assistant') };
}

export default function Page() {
  return <KnowledgePage />;
}
