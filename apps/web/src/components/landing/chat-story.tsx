'use client';

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { BadgeCheck, CheckCheck, Phone, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from './use-reduced-motion';

const STEPS = ['attendance', 'fees', 'homework', 'ask'] as const;
type Step = (typeof STEPS)[number];

interface ChatMessage {
  id: string;
  from: 'institute' | 'parent';
  text: string;
  time: string;
}

/**
 * The page's centrepiece: a phone pinned to the screen while you scroll, and a conversation that
 * grows with it, one WhatsApp message per step. The phone tilts as you go. For anyone who asks
 * for less motion the pin is dropped and the whole conversation is simply shown.
 */
export function ChatStory() {
  const t = useTranslations('Landing.story');
  const reduced = usePrefersReducedMotion();
  const section = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    setStep(Math.min(STEPS.length - 1, Math.floor(value * STEPS.length)));
  });

  const rotateY = useTransform(scrollYProgress, [0, 0.5, 1], reduced ? [0, 0, 0] : [-16, 0, 14]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], reduced ? [0, 0, 0] : [8, 0, -6]);
  const shown = reduced ? STEPS.length - 1 : step;

  const messages: ChatMessage[] = [
    { id: 'attendance', from: 'institute', text: t('steps.attendance.message'), time: '8:04 AM' },
    { id: 'fees', from: 'institute', text: t('steps.fees.message'), time: '10:00 AM' },
    { id: 'homework', from: 'institute', text: t('steps.homework.message'), time: '4:30 PM' },
    { id: 'question', from: 'parent', text: t('steps.ask.question'), time: '7:12 PM' },
    { id: 'answer', from: 'institute', text: t('steps.ask.answer'), time: '7:12 PM' },
  ];
  // Steps 0-2 each add one message; the last step adds the parent's question and the answer
  const visible = messages.slice(0, shown >= 3 ? 5 : shown + 1);

  return (
    <section
      id="story"
      data-stop="story"
      aria-labelledby="story-title"
      ref={section}
      className={cn('relative', reduced ? 'py-24' : 'h-[440vh]')}
    >
      <div className={cn(!reduced && 'sticky top-0 flex h-dvh items-center pt-20 pb-4 lg:pt-0 lg:pb-0')}>
        <div className="mx-auto grid w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:gap-20 lg:px-8">
          <div className="max-w-xl lg:pt-0">
            <p className="text-sm font-semibold tracking-widest text-brand uppercase">{t('eyebrow')}</p>
            <h2 id="story-title" className="mt-2 text-2xl leading-[1.05] font-extrabold tracking-tight text-balance sm:mt-3 sm:text-5xl">
              {t('title')}
            </h2>
            <p className="mt-4 hidden text-lg text-muted-foreground sm:block">{t('subtitle')}</p>

            {/* All four steps on wide screens, with the current one lit */}
            <ol className="mt-8 hidden flex-col gap-1 lg:flex">
              {STEPS.map((key, index) => (
                <li
                  key={key}
                  aria-current={shown === index ? 'step' : undefined}
                  className={cn(
                    'relative border-l-2 py-3 pl-6 transition-all duration-500',
                    shown === index ? 'border-brand' : 'border-white/10',
                  )}
                >
                  <span aria-hidden className={cn('absolute top-5 -left-[7px] size-3 rounded-full border-2 border-background transition-colors duration-500', shown >= index ? 'bg-brand' : 'bg-white/20')} />
                  <h3 className={cn('text-lg font-bold transition-colors duration-500', shown !== index && 'text-muted-foreground')}>
                    {t(`steps.${key}.title`)}
                  </h3>
                  <p className={cn('mt-1 transition-colors duration-500', shown === index ? 'text-foreground/85' : 'text-muted-foreground')}>
                    {t(`steps.${key}.body`)}
                  </p>
                </li>
              ))}
            </ol>

            {/* On a phone only the current step's words, above the phone */}
            <div className="mt-3 lg:hidden" aria-live="polite">
              <h3 className="text-lg font-bold">{t(`steps.${STEPS[shown] as Step}.title`)}</h3>
              <p className="mt-1 text-muted-foreground">{t(`steps.${STEPS[shown] as Step}.body`)}</p>
            </div>
          </div>

          <div className="mx-auto [perspective:1400px]">
            <motion.div
              style={{ rotateY, rotateX, transformStyle: 'preserve-3d' }}
              className="relative aspect-[250/470] h-[min(440px,46dvh)] rounded-[2.4rem] border border-white/15 bg-[#0b141a] p-2 shadow-[0_40px_90px_-30px_rgb(242_107_58/0.45),0_0_0_1px_rgb(255_255_255/0.04)_inset] sm:h-[580px] sm:rounded-[2.8rem]"
            >
              <div className="relative flex size-full flex-col overflow-hidden rounded-[2rem] bg-[#0b141a] sm:rounded-[2.4rem]">
                {/* WhatsApp-style header */}
                <div className="flex items-center gap-3 bg-[#202c33] px-4 pt-5 pb-3">
                  <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-extrabold text-black">S</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold">
                      Sharma Classes <BadgeCheck className="size-3.5 text-whatsapp" aria-hidden />
                    </p>
                    <p className="text-[11px] text-white/70">{t('sample')}</p>
                  </div>
                  <Video className="size-4 text-white/60" aria-hidden />
                  <Phone className="size-4 text-white/60" aria-hidden />
                </div>

                <div
                  className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-3 pb-4"
                  style={{ maskImage: 'linear-gradient(to bottom, transparent 0, #000 22%)' }}
                >
                  <AnimatePresence initial={false}>
                    {visible.map((message) => (
                      <motion.div
                        key={message.id}
                        layout={!reduced}
                        initial={reduced ? false : { opacity: 0, y: 28, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                        className={cn(
                          'max-w-[88%] rounded-xl px-3 py-2 text-[12.5px] leading-snug text-white/90 shadow',
                          message.from === 'parent'
                            ? 'self-end rounded-tr-sm bg-[#005c4b]'
                            : 'self-start rounded-tl-sm bg-[#202c33]',
                        )}
                      >
                        {message.text}
                        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/70">
                          {message.time}
                          {message.from === 'parent' ? <CheckCheck className="size-3.5 text-[#53bdeb]" aria-hidden /> : null}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
