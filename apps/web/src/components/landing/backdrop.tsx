'use client';

import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * The page's lighting: slow orange and blue glows that drift and shift with the scroll, a faint
 * grid, a vignette, film grain, and a soft light that follows the pointer. Fixed behind the 3D
 * scene and the content, and decorative only (nothing here carries text).
 */
export function Backdrop() {
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll();

  // Each glow travels a different distance, which is what reads as depth
  const orangeY = useTransform(scrollYProgress, [0, 1], ['0vh', '70vh']);
  const blueY = useTransform(scrollYProgress, [0, 1], ['0vh', '-60vh']);
  const warmX = useTransform(scrollYProgress, [0, 1], ['0vw', '25vw']);

  const pointerX = useMotionValue(-400);
  const pointerY = useMotionValue(-400);
  const x = useSpring(pointerX, { stiffness: 90, damping: 22, mass: 0.6 });
  const y = useSpring(pointerY, { stiffness: 90, damping: 22, mass: 0.6 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${x}px ${y}px, rgb(242 107 58 / 0.11), transparent 70%)`;

  useEffect(() => {
    if (reduced) return;
    const move = (event: PointerEvent) => {
      pointerX.set(event.clientX);
      pointerY.set(event.clientY);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [reduced, pointerX, pointerY]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        style={{ y: reduced ? 0 : orangeY }}
        className="absolute -top-[28vh] -right-[18vw] size-[78vw] max-w-[1100px] rounded-full opacity-90 blur-3xl"
      >
        <div
          className="size-full animate-[drift_22s_ease-in-out_infinite] rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(242 107 58 / 0.34) 0%, rgb(194 65 12 / 0.12) 45%, transparent 68%)' }}
        />
      </motion.div>

      <motion.div
        style={{ y: reduced ? 0 : blueY }}
        className="absolute -bottom-[30vh] -left-[20vw] size-[70vw] max-w-[980px] rounded-full opacity-80 blur-3xl"
      >
        <div
          className="size-full animate-[drift_28s_ease-in-out_infinite_reverse] rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(70 100 255 / 0.2) 0%, rgb(60 80 200 / 0.07) 45%, transparent 68%)' }}
        />
      </motion.div>

      <motion.div
        style={{ x: reduced ? 0 : warmX }}
        className="absolute top-[34vh] -left-[12vw] size-[44vw] max-w-[640px] rounded-full opacity-60 blur-3xl"
      >
        <div
          className="size-full animate-[drift_34s_ease-in-out_infinite] rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(255 170 120 / 0.14) 0%, transparent 65%)' }}
        />
      </motion.div>

      <div className="grid-fade absolute inset-0 opacity-70" />
      <motion.div style={{ background: reduced ? undefined : spotlight }} className="absolute inset-0 hidden md:block" />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 45%, rgb(0 0 0 / 0.55) 100%)' }} />
      <div className="grain absolute inset-0 opacity-[0.16]" />
    </div>
  );
}
