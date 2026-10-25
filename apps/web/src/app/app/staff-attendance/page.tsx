import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StaffAttendancePage } from '@/components/staff-attendance/staff-attendance-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell.nav');
  return { title: t('staffAttendance') };
}

export default function Page() {
  return <StaffAttendancePage />;
}
