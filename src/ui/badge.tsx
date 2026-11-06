import * as React from 'react';
import { cn } from './cn';

export type BadgeVariant = 'outline' | 'success' | 'gold' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** A leading dot in the badge's own colour, for live states (Running, Given). */
  dot?: boolean;
}

const VARIANTS: Record<BadgeVariant, string> = {
  outline: 'border-[1.5px] border-line-strong text-fg',
  success: 'bg-success-fill text-success-text',
  gold: 'bg-anchor-gold text-white',
  danger: 'bg-danger-fill text-danger-text',
};

/** The one labelling primitive: a small uppercase pill (Cash Bingo). */
export function Badge({ variant = 'outline', dot = false, className, children, ...props }: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex min-h-[26px] items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase leading-none tracking-[0.08em]',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
