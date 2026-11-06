'use client';

import * as React from 'react';
import { tvText, TV_KICKER_CLASS } from '../../tv/tv-text';
import { TvCanvas } from './tv-shell';

/** Reloading the page, behind a seam the tests can watch. */
export const tvNavigation = {
  reload(): void {
    window.location.reload();
  },
};

export interface TvNoticeProps {
  title: string;
  message?: string;
  /** Reload the page after this long. Omit to stay put. */
  reloadAfterMs?: number;
  logoSrc?: string;
}

/**
 * A full-screen message on the TV, e.g. "Reconnecting" when the device or
 * tonight's game could not be read. It never shows any of the game, and it
 * reloads itself to try again.
 */
export function TvNotice({ title, message, reloadAfterMs, logoSrc }: TvNoticeProps): React.ReactElement {
  React.useEffect(() => {
    if (!reloadAfterMs) return;
    const timer = window.setTimeout(() => tvNavigation.reload(), reloadAfterMs);
    return () => window.clearTimeout(timer);
  }, [reloadAfterMs]);
  return (
    <TvCanvas logoSrc={logoSrc}>
      <p className={TV_KICKER_CLASS}>Pub TV</p>
      <h1 role="status" className={tvText('2xl', 'font-display text-fg-strong')}>
        {title}
      </h1>
      {message ? <p className={tvText('base', 'max-w-[32ch] text-fg-muted')}>{message}</p> : null}
    </TvCanvas>
  );
}
