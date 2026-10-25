import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TRIAL_DAYS } from '@/lib/site';

/**
 * Closing call to action. A plain GET form to /signup?email=..., so it works without JavaScript
 * and the signup page can prefill the address. The 3D objects gather around it.
 */
export async function Cta() {
  const t = await getTranslations('Cta');
  const l = await getTranslations('Landing.cta');

  return (
    <section data-stop="cta" aria-labelledby="cta-title" className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="reveal glass relative mx-auto max-w-5xl overflow-hidden rounded-4xl px-6 py-16 text-center sm:px-14 sm:py-24">
        <div aria-hidden className="absolute -top-32 -right-24 size-80 rounded-full bg-brand/35 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-24 size-80 rounded-full bg-brand/20 blur-3xl" />

        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
          <h2 id="cta-title" className="text-4xl leading-[1.02] font-extrabold tracking-tighter text-balance sm:text-6xl">
            <span className="text-shine">{t('title')}</span>
          </h2>
          <p className="text-lg text-muted-foreground sm:text-xl">{t('subtitle', { days: TRIAL_DAYS })}</p>

          <form action="/signup" method="get" className="mt-4 flex w-full flex-col gap-3 sm:flex-row">
            <label htmlFor="cta-email" className="sr-only">
              {t('emailLabel')}
            </label>
            {/* Full width when stacked on phones; fills the row beside the button on wider screens */}
            <Input
              id="cta-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              className="h-14 w-full rounded-full border-white/15 bg-black/40 px-6 text-base text-foreground backdrop-blur sm:flex-1"
            />
            <Button
              type="submit"
              size="lg"
              className="h-14 rounded-full px-8 text-base shadow-[0_10px_40px_-8px_rgb(242_107_58/0.8)]"
            >
              {t('submit')} <ArrowRight />
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">{l('note')}</p>
        </div>
      </div>
    </section>
  );
}
