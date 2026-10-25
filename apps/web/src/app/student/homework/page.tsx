import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentHomeworkPage } from '@/components/student/homework-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.nav');
  return { title: t('homework') };
}

export default function Page() {
  return <StudentHomeworkPage />;
}
