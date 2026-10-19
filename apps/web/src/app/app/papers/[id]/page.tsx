import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaperEditor } from '@/components/papers/paper-editor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('papers') };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperEditor id={id} />;
}
