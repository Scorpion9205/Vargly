import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EnquiriesPage } from '@/components/enquiries/enquiries-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('enquiries') };
}

export default function Page() {
  return <EnquiriesPage />;
}
