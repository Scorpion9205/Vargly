import { ArrowRight, ArrowUp, Mail, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { CONTACT_EMAIL } from '@/lib/site';
import { visibleNavLinks } from './nav-links';

export async function SiteFooter({ showPricing }: { showPricing: boolean }) {
  const t = await getTranslations('Footer');
  const nav = await getTranslations('Nav');

  const columns = [
    {
      title: t('product'),
      links: visibleNavLinks(showPricing).map((link) => ({ href: link.href, label: nav(link.key) })),
    },
    {
      title: t('account'),
      links: [
        { href: '/signup', label: nav('startTrial') },
        { href: '/login', label: nav('signIn') },
      ],
    },
  ];

  return (
    <footer className="relative mt-12 overflow-hidden border-t border-white/10 bg-background/90 backdrop-blur-xl">
      {/* The same lights as the page, pooled at the bottom */}
      <div aria-hidden className="absolute -bottom-40 left-1/2 h-80 w-[70%] -translate-x-1/2 rounded-full bg-brand/25 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex max-w-sm flex-col items-start gap-5">
            <Logo className="text-4xl" />
            <p className="text-muted-foreground">{t('tagline')}</p>
            <Button asChild className="rounded-full shadow-[0_8px_30px_-8px_rgb(242_107_58/0.8)]">
              <Link href="/signup">
                {nav('startTrial')} <ArrowRight />
              </Link>
            </Button>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold tracking-widest text-foreground uppercase">{column.title}</h2>
              <ul className="mt-5 flex flex-col gap-3 text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="inline-block transition-all hover:translate-x-1 hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="text-sm font-semibold tracking-widest text-foreground uppercase">{t('contact')}</h2>
            <ul className="mt-5 flex flex-col gap-3 text-muted-foreground">
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 break-all transition-colors hover:text-foreground">
                  <Mail className="size-4 shrink-0 text-brand" aria-hidden />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-whatsapp" aria-hidden />
                {t('whatsappNote')}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>{t('rights', { year: new Date().getFullYear() })}</p>
          <p>{t('madeFor')}</p>
          <Link
            href="/#top"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 font-medium text-foreground transition-colors hover:bg-white/10"
          >
            {t('backToTop')}
            <ArrowUp className="size-4" aria-hidden />
          </Link>
        </div>

        {/* A giant wordmark, fading into the page */}
        <div
          aria-hidden
          className="pointer-events-none -mb-[0.12em] mt-6 select-none text-center text-[26vw] leading-[0.8] font-extrabold tracking-tighter sm:text-[22vw] lg:text-[19rem]"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgb(255 255 255 / 0.3) 0%, rgb(242 107 58 / 0.22) 45%, transparent 85%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Vargly
        </div>
      </div>
    </footer>
  );
}
