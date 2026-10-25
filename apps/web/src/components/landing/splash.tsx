'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { sceneStatus } from './scene/scene-status';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * The splash is never shown for less than this (so it does not flash by) or more than the
 * maximum. Both are counted from the moment the page started loading, not from when the scripts
 * got going: on a slow phone that can be seconds later, and the wait must not stack on top of it.
 */
export const SPLASH_MIN_MS = 1100;
export const SPLASH_MIN_REDUCED_MS = 400;
export const SPLASH_MAX_MS = 3500;
const EXIT_MS = 700;

/**
 * The opening screen: the wordmark and a progress line while the page and its 3D scene get ready.
 * It is part of the server's HTML, so the first thing anyone sees is this and not a half-built
 * page, and it leaves on its own: a CSS fail-safe fades it out even if scripts never run.
 */
export function Splash() {
  const reduced = usePrefersReducedMotion();
  const sceneReady = useSyncExternalStore(sceneStatus.subscribe, sceneStatus.isReady, () => false);
  const [minPassed, setMinPassed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const elapsed = performance.now();
    const min = window.setTimeout(() => setMinPassed(true), Math.max(0, (reduced ? SPLASH_MIN_REDUCED_MS : SPLASH_MIN_MS) - elapsed));
    const max = window.setTimeout(() => setTimedOut(true), Math.max(0, SPLASH_MAX_MS - elapsed));
    return () => {
      window.clearTimeout(min);
      window.clearTimeout(max);
    };
  }, [reduced]);

  const leaving = timedOut || (minPassed && sceneReady);

  // The page behind does not scroll while the splash is up
  useEffect(() => {
    if (gone) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, [gone]);

  useEffect(() => {
    if (!leaving) return;
    const done = window.setTimeout(() => setGone(true), reduced ? 0 : EXIT_MS);
    return () => window.clearTimeout(done);
  }, [leaving, reduced]);

  if (gone) return null;

  return (
    <div
      id="splash"
      role="status"
      aria-label="Loading Vargly"
      data-leaving={leaving}
      className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-[#0b0b0d]"
    >
      <div aria-hidden className="splash-glow absolute size-[34rem] max-w-[90vw] rounded-full" />
      <p aria-hidden className="relative flex text-6xl font-extrabold tracking-tighter text-white sm:text-7xl">
        {'Varg'.split('').map((letter, i) => (
          <span key={i} className="splash-letter" style={{ animationDelay: `${i * 70}ms` }}>
            {letter}
          </span>
        ))}
        {'ly'.split('').map((letter, i) => (
          <span key={letter} className="splash-letter text-brand" style={{ animationDelay: `${(i + 4) * 70}ms` }}>
            {letter}
          </span>
        ))}
      </p>
      <div aria-hidden className="relative h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
        <span className="splash-bar block h-full rounded-full bg-brand" />
      </div>
      <span className="sr-only">Loading Vargly</span>
    </div>
  );
}
