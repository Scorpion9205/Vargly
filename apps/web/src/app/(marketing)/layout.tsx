import type { ReactNode } from 'react';
import { Backdrop } from '@/components/landing/backdrop';
import { SceneLoader } from '@/components/landing/scene/scene-loader';
import { SmoothScroll } from '@/components/landing/smooth-scroll';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';
import { getPublicPlans } from '@/lib/plans.server';

export default async function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Deduplicated with the page's own call; decides whether "Pricing" appears in the nav
  const showPricing = (await getPublicPlans()).length > 0;

  return (
    // The public site is always dark: the 3D scene and its lighting are built for it. The `dark`
    // class re-themes everything inside; the signed-in app keeps the user's own theme.
    <div id="marketing-root" className="dark relative flex min-h-dvh flex-col bg-background text-foreground">
      <SmoothScroll />
      <Backdrop />
      <SceneLoader />
      <SiteHeader showPricing={showPricing} />
      <main id="main" className="relative z-10 flex-1">
        {children}
      </main>
      <div className="relative z-10">
        <SiteFooter showPricing={showPricing} />
      </div>
    </div>
  );
}
