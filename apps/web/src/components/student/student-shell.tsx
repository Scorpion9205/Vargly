'use client';

import { Ellipsis, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { initials } from '@/components/app-shell/user-menu';
import { signOut } from '@/lib/auth/session';
import { useSession } from '@/lib/auth/use-session';
import { usePortalOverview } from '@/lib/student-portal';
import { cn } from '@/lib/utils';
import { isActive, PRIMARY_COUNT, visibleNav } from './nav';
import { PASSWORD_PATH } from './student-gate';

/**
 * The student's layout: a top bar with the institute's name, tabs on a wide screen, and a bar
 * at the bottom on a phone, where thumbs are. Built for phones first: that is what students use.
 */
export function StudentShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Student.shell');
  const nav = useTranslations('Student.nav');
  const pathname = usePathname();
  const user = useSession()?.user;
  const overview = usePortalOverview();
  const choosingPassword = pathname === PASSWORD_PATH && Boolean(user?.mustChangePassword);

  const items = visibleNav(overview.data?.showFees ?? false, overview.data?.doubtsEnabled ?? false);
  const primary = items.slice(0, PRIMARY_COUNT);
  const moreActive = pathname.startsWith('/student/more') || items.slice(PRIMARY_COUNT).some((item) => isActive(item, pathname));

  return (
    <div className="min-h-dvh bg-muted/40">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        {t('skip')}
      </a>

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Logo href={choosingPassword ? null : '/student'} />
          {overview.data ? (
            <p className="min-w-0 flex-1 truncate border-l pl-3 text-sm font-semibold" title={overview.data.student.institute}>
              {overview.data.student.institute}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {user && !choosingPassword ? (
            <Link
              href="/student/profile"
              aria-label={t('profile', { name: user.name })}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-sm font-bold text-background"
            >
              {initials(user.name)}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
          >
            <LogOut className="size-4" aria-hidden />
            {t('signOut')}
          </button>
        </div>

        {!choosingPassword ? (
          <nav aria-label={t('navLabel')} className="mx-auto hidden max-w-5xl gap-1 overflow-x-auto px-3 pb-2 md:flex">
            {items.map((item) => {
              const active = isActive(item, pathname);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-brand-soft text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {nav(item.key)}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main id="content" tabIndex={-1} className="mx-auto max-w-3xl px-4 pt-6 pb-28 outline-none md:pb-12">
        {children}
      </main>

      {!choosingPassword ? (
        <nav
          aria-label={t('navLabel')}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
        >
          {primary.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium', active ? 'text-primary' : 'text-muted-foreground')}
              >
                <item.icon className="size-5" aria-hidden />
                {nav(item.key)}
              </Link>
            );
          })}
          <Link
            href="/student/more"
            aria-current={moreActive ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium', moreActive ? 'text-primary' : 'text-muted-foreground')}
          >
            <Ellipsis className="size-5" aria-hidden />
            {nav('more')}
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
