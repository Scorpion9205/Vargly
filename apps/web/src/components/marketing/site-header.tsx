import { getTranslations } from 'next-intl/server';
import { HeaderBar } from './header-bar';
import { visibleNavLinks } from './nav-links';

export async function SiteHeader({ showPricing }: { showPricing: boolean }) {
  const t = await getTranslations('Nav');
  const links = visibleNavLinks(showPricing).map((link) => ({
    key: link.key,
    href: link.href,
    label: t(link.key),
  }));

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        {t('skip')}
      </a>
      <HeaderBar links={links} showPricing={showPricing} signIn={t('signIn')} startTrial={t('startTrial')} />
    </>
  );
}
