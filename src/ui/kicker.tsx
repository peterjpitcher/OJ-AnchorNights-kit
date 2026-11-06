import * as React from 'react';
import { cn } from './cn';

export interface KickerProps extends React.HTMLAttributes<HTMLElement> {
  /** The element to render: a span by default, a p or div where it stands alone. */
  as?: 'span' | 'p' | 'div';
}

/**
 * The section label used everywhere: Outfit 600, 12px, tracked, gold (the
 * `.kicker` class in tokens.css). It is the only ALL-CAPS text, and the
 * capitals come from CSS, so write the label in sentence case.
 */
export function Kicker({ as: Tag = 'span', className, ...props }: KickerProps): React.ReactElement {
  return <Tag className={cn('kicker', className)} {...props} />;
}
