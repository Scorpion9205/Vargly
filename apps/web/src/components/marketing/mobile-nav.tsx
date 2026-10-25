'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useState, useSyncExternalStore } from 'react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { visibleNavLinks } from './nav-links';

/** Full-width menu sheet for small screens; a dialog so focus is trapped and Escape closes it */
export function MobileNav({ showPricing }: { showPricing: boolean }) {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // The public site is themed dark by a wrapper, and a portal into <body> would leave it
  const root = useSyncExternalStore(
    () => () => undefined,
    () => document.getElementById('marketing-root'),
    () => null,
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('openMenu')}>
          <Menu className="size-5!" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal container={root ?? undefined}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-0 z-50 rounded-b-3xl border-b border-white/10 bg-background/95 px-4 pt-3 pb-6 shadow-float backdrop-blur-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-top-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 md:hidden"
        >
          <div className="flex h-10 items-center justify-between">
            <Logo href={null} />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('closeMenu')}>
                <X className="size-5!" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">{t('menu')}</Dialog.Title>

          <nav aria-label={t('main')} className="mt-4">
            <ul className="flex flex-col">
              {visibleNavLinks(showPricing).map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    onClick={close}
                    className="block rounded-lg px-3 py-3 text-base font-medium hover:bg-muted"
                  >
                    {t(link.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-4 grid gap-2">
            <Button asChild size="lg">
              <Link href="/signup" onClick={close}>
                {t('startTrial')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login" onClick={close}>
                {t('signIn')}
              </Link>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
