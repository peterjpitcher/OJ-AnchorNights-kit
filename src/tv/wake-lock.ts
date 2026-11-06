'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import NoSleep from 'nosleep.js';

/** How often the lock is re-requested if the browser dropped it without saying. */
export const WAKE_LOCK_KEEPALIVE_MS = 15_000;

export interface WakeLockState {
  /** False only during server rendering. */
  isSupported: boolean;
  isLocked: boolean;
  /** Why the last request failed, if it did. */
  error: string | null;
}

/**
 * Keeps the screen awake (spec S3.4), from Cash Bingo (src/hooks/wake-lock.ts).
 * nosleep.js uses the native Screen Wake Lock API where the browser has it,
 * and a silent looping video where it does not (iOS Safari before 16.4,
 * older TV browsers).
 *
 * The lock is re-requested whenever the page becomes visible or focused, on
 * any tap or key (some browsers only grant it from a user gesture), and
 * every 15 seconds, because browsers drop it silently.
 */
export function useWakeLock(): WakeLockState {
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);

  const enableWakeLock = useCallback(async (): Promise<void> => {
    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }
    try {
      await noSleepRef.current.enable();
      setIsLocked(true);
      setError(null);
    } catch (err: unknown) {
      setIsLocked(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const disableWakeLock = useCallback((): void => {
    if (!noSleepRef.current) return;
    noSleepRef.current.disable();
    setIsLocked(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isUnmounted = false;

    const requestWakeLock = async (): Promise<void> => {
      if (isUnmounted || document.visibilityState !== 'visible') return;
      await enableWakeLock();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      } else {
        disableWakeLock();
      }
    };

    const handlePageActivation = (): void => {
      if (document.visibilityState === 'visible' && !noSleepRef.current?.isEnabled) {
        void requestWakeLock();
      }
    };

    const handleUserInteraction = (): void => {
      if (!noSleepRef.current?.isEnabled) {
        void requestWakeLock();
      }
    };

    void requestWakeLock();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handlePageActivation);
    window.addEventListener('pageshow', handlePageActivation);
    document.addEventListener('click', handleUserInteraction, { passive: true });
    document.addEventListener('touchstart', handleUserInteraction, { passive: true });
    document.addEventListener('keydown', handleUserInteraction);

    const keepAliveInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !noSleepRef.current?.isEnabled) {
        void requestWakeLock();
      }
    }, WAKE_LOCK_KEEPALIVE_MS);

    return () => {
      isUnmounted = true;
      window.clearInterval(keepAliveInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handlePageActivation);
      window.removeEventListener('pageshow', handlePageActivation);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      disableWakeLock();
    };
  }, [disableWakeLock, enableWakeLock]);

  return { isSupported: typeof window !== 'undefined', isLocked, error };
}
