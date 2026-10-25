import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SurveysPage } from '@/components/surveys/surveys-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('surveys') };
}

export default function Page() {
  return <SurveysPage />;
}
