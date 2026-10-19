import { getTranslations } from 'next-intl/server';
import { formatCurrency } from '@/lib/format';
import { TRIAL_DAYS } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * A band of product facts. Only true, checkable facts go here (trial length, real starting
 * price): customer counts or ratings get added once there are real numbers to show.
 */
export async function Highlights({ startingPrice }: { startingPrice: number | null }) {
  const t = await getTranslations('Highlights');
  const items = [
    { value: t('trialValue', { days: TRIAL_DAYS }), label: t('trial') },
    ...(startingPrice ? [{ value: formatCurrency(startingPrice), label: t('startingPrice') }] : []),
    { value: t('whatsappValue'), label: t('whatsapp') },
    { value: t('privacyValue'), label: t('privacy') },
  ];

  return (
    <section aria-label={t('label')} className="px-4 py-8 sm:px-6">
      <dl
        className={cn(
          'reveal glass relative mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 overflow-hidden rounded-3xl px-6 py-12 sm:px-12',
          items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        <span aria-hidden className="absolute -top-24 left-1/2 h-48 w-2/3 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
        {items.map((item) => (
          <div key={item.label} className="relative flex flex-col-reverse gap-2 text-center">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              <span className="text-shine">{item.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
