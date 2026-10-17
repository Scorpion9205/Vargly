'use client';

import { Lock } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { StatePanel } from '@/components/ui/state-panel';
import { can } from '@/lib/auth/permissions';
import { useSession } from '@/lib/auth/use-session';
import { navItemFor } from './nav-config';

/**
 * Pages of a section the user's role does not include (opened from a link or typed URL) explain
 * that, instead of loading and failing on the API's refusal. The API still enforces access.
 */
export function SectionGuard({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell.noAccess');
  const user = useSession()?.user;
  const item = navItemFor(usePathname());

  const denied =
    item?.role !== undefined
      ? !user?.roles.includes(item.role)
      : item?.permission !== undefined && !can(user, item.permission);

  if (denied) {
    return (
      <StatePanel icon={<Lock className="size-5" aria-hidden />} title={t('title')}>
        <p>{t('body')}</p>
      </StatePanel>
    );
  }
  return <>{children}</>;
}
