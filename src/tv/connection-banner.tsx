'use client';
import React, { useEffect, useRef, useState } from 'react';
import { tvText } from './tv-text';

export interface ConnectionBannerProps {
  /** useConnectionHealth().shouldShowBanner: after 10 seconds without contact. */
  visible: boolean;
  /** useConnectionHealth().shouldAutoRefresh: after 30 seconds. */
  shouldAutoRefresh: boolean;
  /** 'tv' sizes the banner for the pub TV's text floors; the default suits phones and the host. */
  variant?: 'default' | 'tv';
  /**
   * True while the surface holds state a reload would destroy: an open host
   * dialog, numbers tapped into a claim, a request in flight. The automatic
   * reload is skipped entirely while this is true, and the manual Refresh
   * asks first. A function is read at the moment of the decision.
   */
  hasUnsavedWork?: boolean | (() => boolean);
  /**
   * How to reload. Defaults to window.location.reload(). An app can pass its
   * own (to log first, or to re-fetch instead of reloading the page).
   */
  onReload?: () => void;
  /** The manual Refresh's question when there is unsaved work. */
  confirmMessage?: string;
}

const DEFAULT_CONFIRM = 'Reloading will clear what is on screen, including anything you have tapped in. Reload anyway?';

function readUnsaved(value: boolean | (() => boolean) | undefined): boolean {
  if (typeof value === 'function') {
    try {
      return value();
    } catch {
      // If the surface cannot say, assume it holds something.
      return true;
    }
  }
  return value === true;
}

function defaultReload(): void {
  window.location.reload();
}

/**
 * The "Reconnecting" banner, and the reload of last resort (spec S3.5), from
 * Cash Bingo (src/components/connection-banner.tsx).
 *
 * WHY THE RELOAD IS GATED
 *   It once reloaded as soon as the connection had been unhealthy for thirty
 *   seconds. On a real night that went wrong twice: with the wifi down the
 *   reload landed on the browser's offline page, so the TV showed a Chrome
 *   error until somebody walked over to it; and on the host's phone it threw
 *   away a claim half typed in. So the reload now needs the browser to
 *   believe it is online, and the surface to say it holds nothing unsaved.
 *   navigator.onLine is a weak signal (it reports the link, not
 *   reachability), which is right here: it is reliable when it says false,
 *   and false is the only answer that changes the behaviour.
 *
 * Changed in the kit: the reload goes through `onReload`, `hasUnsavedWork`
 * may be a function, and the automatic reload fires once per unhealthy
 * spell, so a custom `onReload` that does not leave the page is not called
 * on every render.
 */
export function ConnectionBanner({
  visible,
  shouldAutoRefresh,
  hasUnsavedWork = false,
  variant = 'default',
  onReload = defaultReload,
  confirmMessage = DEFAULT_CONFIRM,
}: ConnectionBannerProps): React.ReactElement | null {
  const [isOffline, setIsOffline] = useState(false);
  const firedRef = useRef(false);
  const unsaved = readUnsaved(hasUnsavedWork);

  useEffect(() => {
    const sync = (): void => setIsOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoRefresh) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    // Read navigator.onLine at the moment of the decision rather than
    // trusting the state, which may not have re-rendered yet.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (unsaved) return;
    firedRef.current = true;
    onReload();
    // isOffline is a dependency so the reload is tried again the moment the
    // browser says it is back online.
  }, [shouldAutoRefresh, unsaved, onReload, isOffline]);

  if (!visible) return null;

  const handleManualRefresh = (): void => {
    if (readUnsaved(hasUnsavedWork) && !window.confirm(confirmMessage)) return;
    onReload();
  };

  // Gold on the deep green with a gold hairline: the brand's own alert, about
  // 7:1. The Refresh target is at least 44px tall. The top offset clears a
  // phone's status bar.
  const barClass =
    'fixed top-[calc(env(safe-area-inset-top)+0.5rem)] left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-1rem)] items-center gap-3 rounded-full border border-anchor-gold-bright bg-anchor-green-deep px-4 py-1 font-semibold text-anchor-gold-bright shadow-sheet';
  const buttonClass =
    'ml-2 min-h-11 shrink-0 rounded-full border-2 border-anchor-gold-bright px-4 font-semibold text-anchor-gold-bright transition-colors duration-150 hover:bg-anchor-gold-bright hover:text-anchor-green-deep';

  return (
    <div role="status" aria-live="polite" className={variant === 'tv' ? tvText('xs', barClass, 'px-[1em]') : `${barClass} text-base`}>
      <span aria-hidden className="inline-block h-[0.5em] w-[0.5em] shrink-0 animate-pulse rounded-full bg-current" />
      <span>{isOffline ? 'No connection. Waiting to reconnect…' : 'Reconnecting…'}</span>
      <button
        type="button"
        className={variant === 'tv' ? tvText('xs', buttonClass, 'px-[0.8em]') : `${buttonClass} text-base`}
        onClick={handleManualRefresh}
      >
        Refresh
      </button>
    </div>
  );
}
