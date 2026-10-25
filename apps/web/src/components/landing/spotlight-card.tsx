'use client';

import { type ComponentProps, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

/** A card that lights up where the pointer is (the glow itself is the `spotlight` utility) */
export function SpotlightCard({ className, onPointerMove, ...props }: ComponentProps<'div'>) {
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`);
    onPointerMove?.(event);
  };
  return <div className={cn('spotlight', className)} onPointerMove={move} {...props} />;
}
