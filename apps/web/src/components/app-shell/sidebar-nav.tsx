'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { can } from '@/lib/auth/permissions';
import { useSession } from '@/lib/auth/use-session';
import { cn } from '@/lib/utils';
import { isActive, visibleNav } from './nav-config';

/** The app's section links, grouped; used by the desktop sidebar and the mobile menu */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('Shell');
  const pathname = usePathname();
  const user = useSession()?.user;
  const groups = visibleNav((permission) => can(user, permission), user?.roles ?? []);

  return (
    <nav aria-label={t('navLabel')} className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {group.key !== 'overview' ? (
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t(`groups.${group.key}`)}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-soft text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden />
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
