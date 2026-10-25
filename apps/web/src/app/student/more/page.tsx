import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentMorePage } from '@/components/student/other-pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.nav');
  return { title: t('more') };
}

export default function Page() {
  return <StudentMorePage />;
}
