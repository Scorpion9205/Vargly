import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PaperMock } from '@/components/landing/paper-mock';

/** The AI paper studio: what it does, and a picture of it working */
export async function AiPapers() {
  const t = await getTranslations('Landing.papers');
  const points = Object.values(t.raw('points') as Record<string, string>);

  return (
    <section id="papers" data-stop="papers" aria-labelledby="papers-title">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div className="reveal max-w-xl">
          <p className="text-sm font-semibold tracking-widest text-brand uppercase">{t('eyebrow')}</p>
          <h2 id="papers-title" className="mt-3 text-3xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{t('body')}</p>
          <ul className="mt-8 flex flex-col gap-4">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 text-brand ring-1 ring-brand/30">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span className="text-lg">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <PaperMock />
      </div>
    </section>
  );
}
