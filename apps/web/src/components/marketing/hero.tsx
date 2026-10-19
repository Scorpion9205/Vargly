import { ArrowDown, ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FloatingCards } from '@/components/landing/floating-cards';
import { Button } from '@/components/ui/button';
import { TRIAL_DAYS } from '@/lib/site';

/** The headline with its last two words in the moving brand gradient */
function Headline({ text }: { text: string }) {
  const words = text.split(' ');
  const lead = words.slice(0, -2).join(' ');
  const accent = words.slice(-2).join(' ');
  return (
    <>
      {lead} <span className="text-shine">{accent}</span>
    </>
  );
}

export async function Hero() {
  const t = await getTranslations('Hero');
  const l = await getTranslations('Landing');

  return (
    <section id="top" data-stop="hero" aria-labelledby="hero-title" className="relative">
      <div className="mx-auto grid min-h-[100dvh] max-w-7xl items-center gap-4 px-4 pt-28 pb-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-8">
        <div className="enter-stagger flex flex-col items-center gap-7 text-center lg:items-start lg:text-left">
          <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-sm font-semibold text-[#ffb899]">
            <span aria-hidden className="size-2 animate-[pulse-ring_2s_ease-out_infinite] rounded-full bg-brand" />
            {t('badge')}
          </span>

          <h1
            id="hero-title"
            className="text-[2.6rem] leading-[0.98] font-extrabold tracking-tighter text-balance sm:text-6xl lg:text-7xl xl:text-[5.4rem]"
          >
            <Headline text={t('headline')} />
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground text-pretty sm:text-xl">{t('subhead')}</p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              asChild
              size="lg"
              className="group relative h-14 overflow-hidden rounded-full px-8 text-base shadow-[0_10px_40px_-8px_rgb(242_107_58/0.75)]"
            >
              <Link href="/signup">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 animate-[sweep_3.6s_ease-in-out_infinite] bg-white/30 blur-md" />
                <span className="relative flex items-center gap-2">
                  {t('primary', { days: TRIAL_DAYS })}
                  <ArrowRight className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-14 rounded-full border-white/20 bg-white/5 px-8 text-base backdrop-blur hover:bg-white/10"
            >
              <Link href="#how-it-works">{t('secondary')}</Link>
            </Button>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground lg:justify-start">
            {(['trial', 'card', 'whatsapp'] as const).map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <Check className="size-4 text-brand" aria-hidden />
                {l(`heroTrust.${key}`, { days: TRIAL_DAYS })}
              </li>
            ))}
          </ul>
        </div>

        {/* Room for the 3D scene, with glass cards floating in front of it */}
        <div className="hidden sm:block">
          <FloatingCards />
        </div>
      </div>

      <a
        href="#features"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground lg:flex"
      >
        {l('scroll')}
        <ArrowDown className="size-4 animate-bounce" aria-hidden />
      </a>
    </section>
  );
}
