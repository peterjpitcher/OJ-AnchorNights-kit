import * as React from 'react';
import { cn } from './cn';

export interface CardStyleOptions {
  /** The signature rule along the top edge: bright gold at night, gold at the desk. */
  accent?: boolean;
  /** Link cards: lift 3px on hover. */
  hover?: boolean;
  className?: string;
}

/**
 * The card's classes, for an element that is not a div (a link card). At
 * night: 3px corners and a gold hairline on the card green (Cash Bingo). At
 * the desk: white, 12px corners and a soft shadow (Quiz Night).
 */
export function cardClass({ accent = false, hover = false, className }: CardStyleOptions = {}): string {
  return cn(
    'rounded-card border border-card-border bg-surface text-fg shadow-card',
    accent && 'border-t-[3px] border-t-card-accent',
    hover && 'transition-[translate,box-shadow] duration-200 ease-anchor motion-safe:hover:-translate-y-[3px] hover:shadow-lift',
    className,
  );
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, Omit<CardStyleOptions, 'className'> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, accent, hover, ...props }, ref) => (
  <div ref={ref} className={cardClass({ accent, hover, className })} {...props} />
));
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('font-display text-2xl leading-tight text-fg-strong', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';
