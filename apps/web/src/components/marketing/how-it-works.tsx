import { getTranslations } from 'next-intl/server';
import { SpotlightCard } from '@/components/landing/spotlight-card';
import { SectionHeading } from './section-heading';

const STEPS = ['one', 'two', 'three'] as const;

export async function HowItWorks() {
  const t = await getTranslations('Steps');

  return (
    <section id="how-it-works" data-stop="steps" aria-labelledby="steps-title">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <SectionHeading id="steps-title" eyebrow={t('eyebrow')} title={t('title')} />

        <ol className="relative mt-16 grid gap-6 md:grid-cols-3">
          {/* The line the steps hang on, glowing along its length */}
          <span
            aria-hidden
            className="absolute top-10 right-[16%] left-[16%] hidden h-px bg-linear-to-r from-transparent via-brand/70 to-transparent md:block"
          />
          {STEPS.map((step, index) => (
            <li key={step} className="reveal">
              <SpotlightCard className="glass relative flex h-full flex-col items-center gap-3 rounded-3xl p-8 text-center transition-transform duration-300 hover:-translate-y-1">
                <span className="relative grid size-16 place-items-center rounded-full bg-brand text-2xl font-extrabold text-black shadow-[0_0_50px_-5px_rgb(242_107_58/0.7)]">
                  <span aria-hidden className="absolute inset-0 animate-[pulse-ring_2.6s_ease-out_infinite] rounded-full" />
                  {index + 1}
                </span>
                <h3 className="mt-3 text-xl font-bold">{t(`${step}.title`)}</h3>
                <p className="text-muted-foreground">{t(`${step}.body`)}</p>
              </SpotlightCard>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
