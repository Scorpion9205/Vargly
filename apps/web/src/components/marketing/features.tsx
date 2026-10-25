import {
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCheck,
  type LucideIcon,
  MessageCircle,
  ReceiptIndianRupee,
  Sparkles,
  UserCheck,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SpotlightCard } from '@/components/landing/spotlight-card';
import { cn } from '@/lib/utils';
import { SectionHeading } from './section-heading';

type FeatureKey = 'whatsapp' | 'attendance' | 'fees' | 'academics' | 'insights' | 'office' | 'papers';

// Bento layout: WhatsApp (the product's centre) takes a 2x2 tile, the AI papers a wide one below
const FEATURES: ReadonlyArray<{ key: FeatureKey; icon: LucideIcon; className?: string }> = [
  { key: 'whatsapp', icon: MessageCircle, className: 'md:col-span-2 lg:row-span-2' },
  { key: 'attendance', icon: UserCheck },
  { key: 'fees', icon: ReceiptIndianRupee },
  { key: 'academics', icon: BookOpenCheck },
  { key: 'insights', icon: Sparkles },
  { key: 'office', icon: BriefcaseBusiness },
  { key: 'papers', icon: Wand2, className: 'md:col-span-2 lg:col-span-3' },
];

export async function Features() {
  const t = await getTranslations('Features');
  const l = await getTranslations('Landing.floating');

  return (
    <section id="features" data-stop="features" aria-labelledby="features-title">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <SectionHeading id="features-title" eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

        <ul className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon, className }) => {
            const featured = key === 'whatsapp';
            const wide = key === 'papers';
            return (
              <li key={key} className={cn('reveal flex', className)}>
                <SpotlightCard
                  className={cn(
                    'glass flex w-full flex-col gap-4 overflow-hidden rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1 sm:p-8',
                    featured && 'bg-linear-to-br from-brand/25 via-white/[0.04] to-transparent',
                    wide && 'justify-between gap-6 bg-linear-to-r from-brand/15 via-white/[0.04] to-transparent md:flex-row md:items-center',
                  )}
                >
                  <div className={cn('flex flex-col gap-4', wide && 'max-w-xl')}>
                    <span
                      className={cn(
                        'grid size-12 place-items-center rounded-2xl bg-brand/15 text-brand ring-1 ring-brand/30',
                        featured && 'size-14 bg-brand text-black ring-0',
                      )}
                    >
                      <Icon className={cn('size-5', featured && 'size-6')} aria-hidden />
                    </span>
                    <h3 className={cn('text-xl font-bold', featured && 'text-3xl sm:text-4xl', wide && 'text-2xl')}>
                      {t(`${key}.title`)}
                    </h3>
                    <p className={cn('text-muted-foreground', featured && 'max-w-md text-lg')}>{t(`${key}.body`)}</p>
                    {wide ? (
                      <Link href="#papers" className="w-fit text-sm font-semibold text-brand underline-offset-4 hover:underline">
                        {t('papers.title')} →
                      </Link>
                    ) : null}
                  </div>

                  {featured ? (
                    <div aria-hidden className="mt-auto flex flex-col gap-2 pt-4">
                      <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-4 py-2.5 text-sm">{l('message')}</div>
                      <p className="flex items-center gap-1.5 pl-1 text-xs font-medium text-whatsapp">
                        <CheckCheck className="size-4" />
                        {l('delivered')}
                      </p>
                    </div>
                  ) : null}
                </SpotlightCard>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
