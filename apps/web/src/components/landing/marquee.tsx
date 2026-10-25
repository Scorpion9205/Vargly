'use client';

import { motion, useScroll, useSpring, useTransform, useVelocity } from 'framer-motion';
import { Sparkle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * A band of what Vargly covers, sliding endlessly. How fast you scroll leans it: the band skews
 * with the scroll speed and settles when you stop, which makes the page feel like one object.
 */
export function Marquee() {
  const t = useTranslations('Landing');
  const items = Object.values(t.raw('marquee') as Record<string, string>);
  const reduced = usePrefersReducedMotion();

  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { stiffness: 120, damping: 30 });
  const skew = useTransform(velocity, [-2500, 0, 2500], reduced ? [0, 0, 0] : [7, 0, -7]);

  const track = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item) => (
        <li key={item} className="flex items-center whitespace-nowrap">
          <span className="px-8 text-4xl font-extrabold tracking-tight text-foreground/80 sm:text-6xl">{item}</span>
          <Sparkle className="size-6 shrink-0 fill-brand text-brand sm:size-8" aria-hidden />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-white/[0.02] py-8 backdrop-blur-[2px] sm:py-10">
      <motion.div style={{ skewX: skew }} className="flex w-max animate-[marquee_46s_linear_infinite]">
        {track(false)}
        {track(true)}
      </motion.div>
      {/* The band fades into the page at both ends */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-linear-to-r from-background to-transparent sm:w-48" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-linear-to-l from-background to-transparent sm:w-48" />
    </div>
  );
}
