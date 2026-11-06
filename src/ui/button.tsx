import * as React from 'react';
import { cn } from './cn';
import { Spinner } from './spinner';

/**
 * The Anchor button: a pill in Outfit 600. Three variants make one emphasis
 * ladder, and a view has one `primary` at most; everything else is `outline`
 * or `ghost`. From Cash Bingo, with its colours moved onto the register
 * tokens so the same button is right at night and at the desk.
 *
 * `tone="quiet"` is the muted ghost for destructive-but-quiet actions (Void,
 * Delete, Sign out). Disabled buttons stay on screen at 45 percent so the
 * host can see why an action is not available.
 */
export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** Ghost only: muted text for a quiet destructive action. */
  tone?: 'default' | 'quiet';
  className?: string;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<ButtonStyleOptions, 'className'> {
  /** Shows a spinner, disables the button and sets aria-busy. */
  isLoading?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full border-2 border-transparent text-center font-sans font-semibold leading-tight ' +
  'cursor-pointer transition-[translate,background-color,color,box-shadow,border-color] duration-150 ease-anchor ' +
  'motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-anchor-gold text-white hover:bg-anchor-gold-dark hover:shadow-gold',
  outline: 'border-accent text-accent hover:bg-accent hover:text-bg',
  ghost: 'text-fg hover:bg-hover',
};

// sm is 44px tall, the minimum touch target. xl is the host's main action
// (Next number): a full-width block, 76px tall.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-6 text-sm',
  md: 'min-h-12 px-8 text-base',
  lg: 'min-h-14 px-12 text-lg',
  xl: 'min-h-[76px] w-full px-6 text-[22px] font-bold uppercase tracking-[0.06em]',
};

/**
 * The button's classes, for a link that should look like a button
 * (`<Link className={buttonClass({ variant: 'outline', size: 'sm' })}>`).
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  tone = 'default',
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    variant === 'ghost' && tone === 'quiet' && 'text-fg-muted',
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, tone, isLoading = false, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonClass({ variant, size, block, tone, className })}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <Spinner size={20} /> : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
