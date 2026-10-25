import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentDoubtsPage } from '@/components/student/doubts-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.nav');
  return { title: t('doubts') };
}

export default function Page() {
  return <StudentDoubtsPage />;
}
