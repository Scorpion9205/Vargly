import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentResultsPage } from '@/components/student/results-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.nav');
  return { title: t('results') };
}

export default function Page() {
  return <StudentResultsPage />;
}
