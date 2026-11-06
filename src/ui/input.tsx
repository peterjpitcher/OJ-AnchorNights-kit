import * as React from 'react';
import { cn } from './cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * The field surface shared by inputs, selects and textareas. At night it is
 * sunk into the page green with a gold hairline that brightens on focus
 * (Cash Bingo); at the desk it is white with a sand border (Quiz Night).
 * Never under 16px, or iOS Safari zooms the page. Set `aria-invalid` for
 * the error border.
 */
export const fieldClass =
  'w-full min-h-[52px] rounded-input border-[length:var(--field-border-width)] border-field-border bg-field px-4 py-3 font-sans text-[17px] leading-snug text-field-text ' +
  'placeholder:text-field-placeholder transition-[border-color,box-shadow] duration-200 ' +
  'focus:border-field-focus focus:shadow-field-focus focus:outline-none focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-45 aria-[invalid=true]:border-anchor-danger ' +
  'file:border-0 file:bg-transparent file:text-base file:font-medium file:text-field-text';

/** The label above a field: Outfit 600, 14px. */
export const fieldLabelClass = 'font-sans text-sm font-semibold text-fg';

/** A hint or error under a field. */
export const fieldHintClass = 'font-sans text-sm text-fg-muted';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn(fieldClass, className)} ref={ref} {...props} />
));
Input.displayName = 'Input';
