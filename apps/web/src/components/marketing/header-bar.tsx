'use client';

import { motion, useScroll, useSpring } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MobileNav } from './mobile-nav';

export interface HeaderLink {
  key: string;
  href: string;
  label: string;
}

/**
 * The floating navigation: a glass pill that tightens once the page scrolls, lights up the
 * section you are in, slides a highlight under the link you point at, and draws the page's
 * scroll progress along its lower edge.
 */
export function HeaderBar({
  links,
  showPricing,
  signIn,
  startTrial,
}: {
  links: HeaderLink[];
  showPricing: boolean;
  signIn: string;
  startTrial: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The section in the middle of the screen is the "current" one
  useEffect(() => {
    const targets = links
      .map((link) => document.getElementById(link.href.replace(/^\/?#/, '')))
      .filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [links]);

  const highlighted = hovered ?? active;

  return (
    <header className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-6">
      <div
        className={cn(
          'relative mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border px-3 transition-all duration-300 sm:px-4',
          scrolled
            ? 'h-14 border-white/15 bg-black/60 shadow-[0_18px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-2xl'
            : 'h-16 border-white/10 bg-white/[0.04] backdrop-blur-xl',
        )}
      >
        <Logo className="pl-2 text-2xl" />

        <nav aria-label="Main" className="hidden md:block" onMouseLeave={() => setHovered(null)}>
          <ul className="flex items-center">
            {links.map((link) => {
              const id = link.href.replace(/^\/?#/, '');
              return (
                <li key={link.key} className="relative">
                  <Link
                    href={link.href}
                    onMouseEnter={() => setHovered(id)}
                    onFocus={() => setHovered(id)}
                    onBlur={() => setHovered(null)}
                    aria-current={active === id ? 'location' : undefined}
                    className={cn(
                      'relative z-10 block rounded-full px-3 py-2 text-[15px] font-medium whitespace-nowrap transition-colors lg:px-4',
                      highlighted === id ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {link.label}
                  </Link>
                  {highlighted === id ? (
                    <motion.span
                      layoutId="nav-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-white/10"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" className="hidden rounded-full text-[15px] lg:inline-flex">
            <Link href="/login">{signIn}</Link>
          </Button>
          <Button
            asChild
            className="hidden rounded-full px-5 text-[15px] shadow-[0_8px_30px_-8px_rgb(242_107_58/0.8)] md:inline-flex"
          >
            <Link href="/signup">{startTrial}</Link>
          </Button>
          <MobileNav showPricing={showPricing} />
        </div>

        {/* Scroll progress, drawn along the pill's lower edge */}
        <motion.span
          aria-hidden
          style={{ scaleX: progress }}
          className="absolute right-6 -bottom-px left-6 h-px origin-left bg-linear-to-r from-transparent via-brand to-transparent"
        />
      </div>
    </header>
  );
}
