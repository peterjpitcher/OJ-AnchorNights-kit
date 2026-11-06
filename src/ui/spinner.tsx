import * as React from 'react';
import { cn } from './cn';

export interface SpinnerProps {
  /** Width and height in pixels. */
  size?: number;
  /**
   * Read out by screen readers. Leave it out when the spinner sits inside
   * something that already says it is busy (a button with aria-busy).
   */
  label?: string;
  className?: string;
}

/**
 * The loading ring, in the current text colour. The spin is a Tailwind
 * animation, so reduced motion stops it (tokens.css) and the ring stays as
 * a still mark.
 */
export function Spinner({ size = 20, label, className }: SpinnerProps): React.ReactElement {
  return (
    <svg
      className={cn('shrink-0 animate-spin text-current', className)}
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
