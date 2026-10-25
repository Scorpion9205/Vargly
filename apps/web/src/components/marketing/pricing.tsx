import { getTranslations } from 'next-intl/server';
import type { PublicPlan } from '@/lib/plans';
import { TRIAL_DAYS } from '@/lib/site';
import { PricingCards } from './pricing-cards';
import { SectionHeading } from './section-heading';

export async function Pricing({ plans }: { plans: PublicPlan[] }) {
  const t = await getTranslations('Pricing');

  return (
    <section id="pricing" data-stop="pricing" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <SectionHeading
          id="pricing-title"
          eyebrow={t('eyebrow')}
          title={t('title')}
          subtitle={t('subtitle', { days: TRIAL_DAYS })}
        />
        <PricingCards plans={plans} />
      </div>
    </section>
  );
}
