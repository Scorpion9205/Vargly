import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GenerateForm } from '@/components/papers/generate-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Papers.new');
  return { title: t('title') };
}

export default function Page() {
  return <GenerateForm />;
}
