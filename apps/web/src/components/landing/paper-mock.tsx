'use client';

import { motion, useInView } from 'framer-motion';
import { Check, FileText, Send, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

const QUESTIONS = [
  { key: 'q1', type: 'MCQ', kept: true },
  { key: 'q2', type: 'TF', kept: true },
  { key: 'q3', type: 'SHORT', kept: true },
  { key: 'q4', type: 'SHORT', kept: false },
] as const;

/**
 * A picture of the paper studio, drawn with the design system rather than a screenshot so it
 * stays sharp. When it scrolls into view the questions are ticked one by one (the last is left
 * out, as a teacher would) and the share button sends the paper off.
 */
export function PaperMock() {
  const t = useTranslations('Landing.papers.mock');
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: '-25% 0px' });

  return (
    <div
      ref={ref}
      role="img"
      aria-label={t('selected')}
      className="glass relative mx-auto w-full max-w-lg rounded-3xl p-5 [transform:perspective(1400px)_rotateY(-7deg)_rotateX(3deg)] transition-transform duration-700 hover:[transform:perspective(1400px)_rotateY(0deg)_rotateX(0deg)] sm:p-6"
    >
      <div aria-hidden className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-full bg-brand text-black">
            <Sparkles className="size-4" />
          </span>
          AI Papers
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-sm">{t('topic')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-[#ffb899]">{t('language')}</span>
            {(['MCQ', 'TF', 'SHORT'] as const).map((type) => (
              <span key={type} className="rounded-full bg-white/8 px-3 py-1 text-xs text-muted-foreground">
                {t(`types.${type}`)}
              </span>
            ))}
            <span className="ml-auto rounded-full bg-brand px-3 py-1 text-xs font-bold text-black">{t('generate')}</span>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {QUESTIONS.map((question, index) => (
            <li
              key={question.key}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-opacity duration-500',
                visible && !question.kept && 'opacity-45',
              )}
            >
              <motion.span
                initial={false}
                animate={visible && question.kept ? { backgroundColor: '#f26b3a', scale: [1, 1.25, 1] } : { backgroundColor: 'rgba(255,255,255,0.08)', scale: 1 }}
                transition={{ delay: 0.5 + index * 0.45, duration: 0.35 }}
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md text-black"
              >
                {visible && question.kept ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </motion.span>
              <div className="min-w-0">
                <p className="text-[13px] leading-snug">{t(question.key)}</p>
                <span className="mt-1.5 inline-block rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {t(`types.${question.type}`)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('selected')}</p>
          <motion.span
            initial={false}
            animate={visible ? { scale: [1, 1, 0.94, 1], boxShadow: ['0 0 0 0 rgba(37,211,102,0)', '0 0 0 0 rgba(37,211,102,0)', '0 0 0 0 rgba(37,211,102,0.6)', '0 0 0 14px rgba(37,211,102,0)'] } : {}}
            transition={{ delay: 2.6, duration: 1.1 }}
            className="flex items-center gap-1.5 rounded-full bg-whatsapp px-4 py-2 text-xs font-bold text-black"
          >
            <Send className="size-3.5" />
            {t('share')}
          </motion.span>
        </div>
      </div>

      {/* The paper, on its way to the parents */}
      <motion.div
        aria-hidden
        initial={false}
        animate={visible ? { opacity: [0, 1, 1, 0], y: [20, -10, -50, -90], x: [0, 10, 24, 40], rotate: [-6, -3, 2, 6] } : { opacity: 0 }}
        transition={{ delay: 3.1, duration: 2.2, ease: 'easeOut' }}
        className="pointer-events-none absolute -top-6 right-6 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black shadow-xl"
      >
        <FileText className="size-4 text-brand" />
        Light-worksheet.pdf
      </motion.div>
    </div>
  );
}
