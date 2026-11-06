'use client';
import React, { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../ui/cn';
import { computeScale } from './scale';

export interface StageProps {
  children: ReactNode;
  /**
   * Set on the viewport, so it reaches every screen and overlay: a special
   * night's colours as CSS variables (resolveBranding().cssVars). Absent for
   * The Anchor, and then the viewport carries no style at all.
   */
  style?: CSSProperties;
  /** Extra classes on the viewport (Quiz Night passes its own "viewport tv"). */
  className?: string;
  /** Extra classes on the 1920x1080 canvas. */
  canvasClassName?: string;
}

/**
 * The TV stage (spec S3.3), from Quiz Night's DisplayStage: a fixed
 * 1920x1080 canvas in a viewport that fills the window, scaled with a CSS
 * transform so the whole canvas is always visible. Design every TV screen
 * in canvas pixels. Needs tokens.css for the anchor-stage classes.
 */
export function Stage({ children, style, className, canvasClassName }: StageProps): React.ReactElement {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = (): void => setScale(computeScale(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    // data-branded lets an app's stylesheet derive the colours a palette does
    // not carry from the night's own, not The Anchor's.
    <div className={cn('anchor-stage', className)} style={style} data-branded={style ? '' : undefined}>
      <div className="anchor-stage-scaler" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={cn('anchor-stage-canvas', canvasClassName)}>{children}</div>
      </div>
    </div>
  );
}
