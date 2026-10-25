'use client';

import { type MotionValue, motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { CheckCheck, IndianRupee, Sparkles, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * How one card moves. `depth` is how far it travels: a card nearer the viewer (larger depth)
 * moves further, both as the page scrolls and as the pointer moves.
 */
function useLayer(
  depth: number,
  scroll: MotionValue<number>,
  pointerX: MotionValue<number>,
  pointerY: MotionValue<number>,
  still: boolean,
) {
  return {
    y: useTransform(scroll, [0, 0.12], [0, still ? 0 : -depth * 260]),
    x: useTransform(pointerX, (v) => (still ? 0 : v * depth * 60)),
    translateY: useTransform(pointerY, (v) => (still ? 0 : v * depth * 40)),
  };
}

/**
 * Glass cards floating in front of the hero's 3D scene. Each sits at its own depth: it moves a
 * different distance as the page scrolls and as the pointer moves, which is the parallax.
 * Sample figures that show the product, not claims about customers.
 */
export function FloatingCards() {
  const t = useTranslations('Landing.floating');
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll();

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const px = useSpring(pointerX, { stiffness: 70, damping: 18 });
  const py = useSpring(pointerY, { stiffness: 70, damping: 18 });

  useEffect(() => {
    if (reduced) return;
    const move = (event: PointerEvent) => {
      pointerX.set(event.clientX / window.innerWidth - 0.5);
      pointerY.set(event.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [reduced, pointerX, pointerY]);

  const attendance = useLayer(1.1, scrollYProgress, px, py, !!reduced);
  const fees = useLayer(0.6, scrollYProgress, px, py, !!reduced);
  const message = useLayer(1.5, scrollYProgress, px, py, !!reduced);
  const paper = useLayer(0.9, scrollYProgress, px, py, !!reduced);

  return (
    <div className="relative mx-auto h-[420px] w-full max-w-xl sm:h-[500px] lg:h-[560px] lg:max-w-none">
      <motion.div style={attendance} className="absolute top-[2%] left-0 w-60 sm:left-[4%] sm:w-64">
        <div className={cn('glass animate-[bob_7s_ease-in-out_infinite] rounded-2xl p-4')}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-brand/15 text-brand">
              <UserCheck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t('attendance')}</p>
              <p className="text-xs text-muted-foreground">{t('attendanceValue')}</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[93%] rounded-full bg-linear-to-r from-brand to-[#ffb08a]" />
          </div>
        </div>
      </motion.div>

      <motion.div style={fees} className="absolute top-[4%] right-0 w-52 sm:right-[2%]">
        <div className="animate-[bob_9s_ease-in-out_infinite_reverse] rounded-2xl bg-linear-to-br from-[#ff8a5c] to-[#c2410c] p-4 text-black shadow-[0_20px_50px_-20px_rgb(242_107_58/0.8)]">
          <IndianRupee className="size-5" aria-hidden />
          <p className="mt-2 text-xs font-medium opacity-80">{t('fees')}</p>
          <p className="text-2xl font-extrabold tracking-tight">{t('feesValue')}</p>
        </div>
      </motion.div>

      <motion.div style={message} className="absolute right-0 bottom-[8%] w-64 sm:right-[4%] sm:w-72">
        <div className="glass animate-[bob_8s_ease-in-out_infinite] rounded-2xl p-4">
          <div className="rounded-xl rounded-tl-sm bg-whatsapp/15 p-3 text-sm leading-relaxed">{t('message')}</div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-whatsapp">
            <CheckCheck className="size-4" aria-hidden />
            {t('delivered')}
          </p>
        </div>
      </motion.div>

      <motion.div style={paper} className="absolute bottom-[2%] left-0 w-56 sm:left-[2%] sm:w-60">
        <div className="glass animate-[bob_10s_ease-in-out_infinite_reverse] flex items-center gap-3 rounded-2xl p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-black">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t('paper')}</p>
            <p className="text-xs text-muted-foreground">{t('paperValue')}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
