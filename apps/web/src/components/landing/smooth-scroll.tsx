'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { measureStops, scrollState, setScroll } from './scroll-store';

/** Room left above an anchor so a section's heading clears the floating header */
const ANCHOR_OFFSET = -96;

/**
 * Inertial scrolling for the public pages, and the source of the page's scroll progress that
 * drives the 3D scene. Scrolling stays native (the real scrollbar, find-in-page, sticky layouts
 * all keep working); Lenis only eases the wheel. Anyone who asks for less motion gets plain
 * scrolling: the progress is still tracked, nothing is smoothed.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const readNative = () => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      setScroll(window.scrollY, limit);
    };

    // Where each named section sits, for the 3D scene; redone whenever the page changes size
    const measure = () => {
      measureStops();
    };
    measure();
    const sizeWatcher = new ResizeObserver(measure);
    sizeWatcher.observe(document.body);
    window.addEventListener('load', measure);

    if (reduced) {
      readNative();
      window.addEventListener('scroll', readNative, { passive: true });
      return () => {
        window.removeEventListener('scroll', readNative);
        window.removeEventListener('load', measure);
        sizeWatcher.disconnect();
      };
    }

    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', (instance: Lenis) => setScroll(instance.scroll, instance.limit, instance.velocity));
    setScroll(lenis.scroll, lenis.limit, 0);

    let frame = requestAnimationFrame(function tick(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    });

    // In-page links ("#features", "/#pricing") glide instead of jumping
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!link) return;
      const url = new URL(link.getAttribute('href') ?? '', window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: ANCHOR_OFFSET, duration: 1.4 });
      window.history.pushState(null, '', url.hash);
    };
    document.addEventListener('click', onClick);

    // Content growing (images, fonts, accordions) changes the page height, and so the progress
    const resize = new ResizeObserver(() => lenis.resize());
    resize.observe(document.body);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onClick);
      resize.disconnect();
      window.removeEventListener('load', measure);
      sizeWatcher.disconnect();
      lenis.destroy();
      scrollState.velocity = 0;
    };
  }, []);

  return null;
}
