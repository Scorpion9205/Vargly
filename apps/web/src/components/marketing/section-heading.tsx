import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  className?: string;
}

/** Centered eyebrow + title + subtitle used at the top of each public-site section */
export function SectionHeading({ id, eyebrow, title, subtitle, className }: SectionHeadingProps) {
  return (
    <div className={cn('reveal mx-auto flex max-w-3xl flex-col items-center gap-4 text-center', className)}>
      <p className="rounded-full border border-brand/30 bg-brand/10 px-4 py-1 text-sm font-semibold tracking-widest text-[#ffb899] uppercase">
        {eyebrow}
      </p>
      <h2 id={id} className="text-3xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {subtitle ? <p className="text-lg text-muted-foreground text-pretty sm:text-xl">{subtitle}</p> : null}
    </div>
  );
}
