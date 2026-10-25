import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentHomePage } from '@/components/student/home-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.nav');
  return { title: t('home') };
}

export default function Page() {
  return <StudentHomePage />;
}
