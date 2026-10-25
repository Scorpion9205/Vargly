import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StudentAttendancePage } from '@/components/student/attendance-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Student.nav');
  return { title: t('attendance') };
}

export default function Page() {
  return <StudentAttendancePage />;
}
