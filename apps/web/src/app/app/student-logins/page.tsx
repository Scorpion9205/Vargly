import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentLoginsPage } from '@/components/student-logins/student-logins-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('studentLogins') };
}

export default function Page() {
  return <StudentLoginsPage />;
}
