import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CertificatesPage } from '@/components/certificates/certificates-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('certificates') };
}

export default function Page() {
  return <CertificatesPage />;
}
