import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FirstPassword } from '@/components/student/first-password';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.password');
  return { title: t('title') };
}

export default function Page() {
  return <FirstPassword />;
}
