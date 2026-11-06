import * as React from 'react';
import { cn } from './cn';

/** Where the white wordmark lives in each app's `public/` folder. */
export const ANCHOR_LOGO_WHITE_SRC = '/the-anchor-pub-logo-white-transparent.png';

export interface AnchorLogoProps {
  /** Height in pixels. The wordmark is twice as wide as it is tall. */
  height: number;
  /** Load it straight away (above the fold). */
  priority?: boolean;
  /**
   * The image path. Defaults to the white wordmark, which every app keeps at
   * ANCHOR_LOGO_WHITE_SRC in its public folder.
   */
  src?: string;
  className?: string;
}

/**
 * The white Anchor wordmark, for every dark surface. Never recoloured.
 *
 * A plain <img> rather than next/image, so the kit does not need Next.js and
 * the logo is never sent through the image optimiser (it is a small PNG
 * already). The TV sizes it with a class instead
 * (`className="h-[6.3vh] w-auto"`); the height prop then only sets the
 * intrinsic size.
 */
export function AnchorLogo({ height, priority = false, src = ANCHOR_LOGO_WHITE_SRC, className }: AnchorLogoProps): React.ReactElement {
  return (
    <img
      src={src}
      alt="The Anchor"
      width={height * 2}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={cn('block w-auto shrink-0', className)}
      style={className ? undefined : { height, width: 'auto' }}
    />
  );
}

export interface GrainProps {
  className?: string;
}

/** Film grain over a full-screen dark surface (TV, landing). The parent must be positioned. */
export function Grain({ className }: GrainProps): React.ReactElement {
  return <div aria-hidden="true" className={cn('grain-overlay', className)} />;
}
