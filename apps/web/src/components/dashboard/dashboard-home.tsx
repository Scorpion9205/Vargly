'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { can } from '@/lib/auth/permissions';
import { useSession } from '@/lib/auth/use-session';
import { firstName, greetingKey } from './greeting';
import { OwnerDashboard } from './owner-dashboard';
import { TeacherDashboard } from './teacher-dashboard';

function GoToConsole() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/admin');
  }, [router]);
  return null;
}

/** The /app home: the owner's or the teacher's dashboard, whichever the user may see */
export function DashboardHome() {
  const t = useTranslations('Dashboard');
  const user = useSession()?.user;
  if (!user) return null;
  // Vargly's own operators belong to no institute, so there is no dashboard to show them
  if (user.roles.includes('SUPER_ADMIN')) return <GoToConsole />;

  const view = can(user, 'dashboard:owner')
    ? 'owner'
    : can(user, 'dashboard:teacher')
      ? 'teacher'
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t(`greeting.${greetingKey()}`, { name: firstName(user.name) })}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {view ? t(`subtitle.${view}`) : t('subtitle.none')}
        </p>
      </header>
      {view === 'owner' ? <OwnerDashboard /> : view === 'teacher' ? <TeacherDashboard /> : null}
    </div>
  );
}
