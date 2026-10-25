import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Accordion } from 'radix-ui';
import { TRIAL_DAYS } from '@/lib/site';
import { SectionHeading } from './section-heading';

const ITEMS = ['app', 'trial', 'private', 'hindi', 'fees', 'import'] as const;

/** Questions institutes ask, as an accordion: all the answers stay in the page for search engines and readers */
export async function Faq() {
  const t = await getTranslations('Landing.faq');

  return (
    <section id="faq" data-stop="faq" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32">
        <SectionHeading id="faq-title" eyebrow={t('eyebrow')} title={t('title')} />

        <Accordion.Root type="single" collapsible defaultValue="app" className="mt-12 flex flex-col gap-3">
          {ITEMS.map((key) => (
            <Accordion.Item
              key={key}
              value={key}
              className="glass group overflow-hidden rounded-2xl transition-colors data-[state=open]:border-brand/40"
            >
              <Accordion.Header>
                <Accordion.Trigger className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-lg font-semibold sm:px-6">
                  {t(`items.${key}.q`)}
                  <Plus
                    className="size-5 shrink-0 text-brand transition-transform duration-300 group-data-[state=open]:rotate-45"
                    aria-hidden
                  />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <p className="px-5 pb-5 text-muted-foreground sm:px-6">{t(`items.${key}.a`, { days: TRIAL_DAYS })}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
