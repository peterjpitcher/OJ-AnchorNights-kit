// Keeps a screen's events feed fresh. From Cash Bingo
// (src/components/display/use-events-projection.ts). The server page passes
// the first feed in; this re-reads the app's screen route every 10 minutes
// and whenever `refreshKey` changes (for example the phase of the night).
//
// Nothing here is ever shown: a failed refresh goes to `onError` and the
// screen keeps the list it has, and an 'error' answer never replaces a good
// list (chooseScreenFeed). The route takes no parameters and is cached, so a
// room full of screens cannot add load on the management app.
'use client';

import { useEffect, useRef, useState } from 'react';
import { chooseScreenFeed, readScreenFeed } from '../events/read';
import type { ScreenFeed } from '../events/types';

export const SCREEN_FEED_REFRESH_MS = 10 * 60_000;
export const SCREEN_FEED_TIMEOUT_MS = 8_000;
export const SCREEN_FEED_PATH = '/api/screen/events';

export interface UseScreenFeedOptions {
  /** A change refetches straight away. */
  refreshKey?: string;
  /** Defaults to /api/screen/events. */
  path?: string;
  /** Told about a failed refresh (log it; never show it). Must be stable. */
  onError?: (err: unknown) => void;
  refreshMs?: number;
}

async function fetchScreenFeed(path: string, signal: AbortSignal): Promise<ScreenFeed> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  const feed = readScreenFeed(await response.json());
  if (!feed) throw new Error(`GET ${path} returned no feed`);
  return feed;
}

export function useScreenFeed(initial: ScreenFeed | null, options: UseScreenFeedOptions = {}): ScreenFeed | null {
  const { refreshKey = '', path = SCREEN_FEED_PATH, onError, refreshMs = SCREEN_FEED_REFRESH_MS } = options;
  const [feed, setFeed] = useState<ScreenFeed | null>(initial);
  // The server page's feed is fresh on mount, so the first run does not refetch it.
  const skipNextRunRef = useRef(initial !== null);

  useEffect(() => {
    let cancelled = false;
    const inFlight = new Set<AbortController>();

    const refresh = (): void => {
      const controller = new AbortController();
      inFlight.add(controller);
      const timer = setTimeout(() => controller.abort(), SCREEN_FEED_TIMEOUT_MS);
      fetchScreenFeed(path, controller.signal)
        .then((next) => {
          if (!cancelled) setFeed((current) => chooseScreenFeed(current, next));
        })
        .catch((err: unknown) => {
          if (!cancelled) onError?.(err);
        })
        .finally(() => {
          clearTimeout(timer);
          inFlight.delete(controller);
        });
    };

    if (skipNextRunRef.current) skipNextRunRef.current = false;
    else refresh();
    const interval = setInterval(refresh, refreshMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
      inFlight.forEach((controller) => controller.abort());
    };
  }, [refreshKey, path, onError, refreshMs]);

  return feed;
}
