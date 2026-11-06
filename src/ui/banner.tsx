import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from './cn';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerProps {
  tone?: BannerTone;
  /** The short headline. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** A button or link on the right ("Retry", "Reload"). */
  action?: React.ReactNode;
  className?: string;
}

const TONES: Record<BannerTone, { box: string; icon: LucideIcon }> = {
  info: { box: 'border-line-strong bg-surface text-fg', icon: Info },
  success: { box: 'border-transparent bg-success-fill text-success-text', icon: CheckCircle2 },
  warning: { box: 'border-accent bg-surface text-accent-text', icon: AlertTriangle },
  danger: { box: 'border-transparent bg-danger-fill text-danger-text', icon: XCircle },
};

/**
 * An inline message across the top of a page or card: a save that did not
 * land, a setting that is missing, a new version ready. Danger is announced
 * straight away (role="alert"); the others politely (role="status").
 *
 * The TV's reconnecting bar is ConnectionBanner in @anchor-nights/kit/tv.
 */
export function Banner({ tone = 'info', title, children, action, className }: BannerProps): React.ReactElement {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-card border px-4 py-3 font-sans text-base', box, className)}
    >
      <Icon size={20} aria-hidden className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'text-fg')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
