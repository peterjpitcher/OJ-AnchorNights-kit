import * as React from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  /** A lucide icon element, shown in a gold ring. */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** The one thing to do next (a Button or a link styled with buttonClass). */
  action?: React.ReactNode;
  className?: string;
}

/** What a list or page shows when there is nothing in it yet, and what to do about it. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-5 py-10 text-center', className)}>
      {icon ? (
        <div aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full border border-line-gold text-accent-text">
          {icon}
        </div>
      ) : null}
      <h2 className="text-2xl leading-tight text-fg-strong">{title}</h2>
      {description ? <p className="max-w-[44ch] text-base text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
