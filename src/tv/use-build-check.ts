// From Cash Bingo (src/hooks/use-build-check.ts), generalised: the endpoint,
// the client build id, the storage key and the reload are options, and the
// app says when a reload is safe through `isSafeToReload`.
//
// Checks the build route every 5 minutes and whenever the page becomes
// visible, and acts on decideBuildAction:
//   - mode 'auto' (TV, phones): reloads by itself once it is safe, and online;
//   - mode 'prompt' (host): never reloads, returns showPrompt for a banner.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { decideBuildAction, DEV_BUILD_ID, readBuildResponse, type BuildAction, type BuildCheckMode } from './build-check';

export const BUILD_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const BUILD_CHECK_TIMEOUT_MS = 8000;
/**
 * After the connection comes back, how long to wait before a reload that was
 * held back while offline. A network that has only just returned often drops
 * again within a second or two.
 */
export const ONLINE_SETTLE_MS = 3000;

export interface UseBuildCheckOptions {
  mode: BuildCheckMode;
  /**
   * The release this bundle was built from: pass
   * `process.env.NEXT_PUBLIC_BUILD_ID` (set in next.config.ts with
   * buildIdFromEnv()). Missing or 'dev' never triggers anything.
   */
  clientBuild: string | null | undefined;
  /**
   * Whether this screen may reload now, by the app's own rule: between
   * games, never mid-reveal, never while the host has a dialog open. Called
   * on every render, so read it from the same state the screen renders
   * from, and keep it cheap and side-effect free.
   */
  isSafeToReload: () => boolean;
  /** The app's build route. Defaults to /api/build. */
  endpoint?: string;
  /**
   * Remembers which release this tab already reloaded for, so a stale cache
   * that serves the old bundle again cannot cause a reload every 5 minutes.
   * Defaults to 'anchor-nights:build-reloaded-for'; Cash Bingo keeps its
   * 'anchor-bingo:build-reloaded-for'.
   */
  storageKey?: string;
  /** How to reload. Defaults to window.location.reload(). */
  onReload?: () => void;
}

export interface UseBuildCheckApi {
  action: BuildAction;
  /** Host only: show "A new version is ready" with a Reload button. */
  showPrompt: boolean;
  reload: () => void;
}

async function fetchServerBuild(endpoint: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUILD_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    return readBuildResponse(await response.json());
  } catch {
    // Offline or timed out: the next check will try again.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function claimAutoReload(storageKey: string, serverBuild: string): boolean {
  try {
    if (window.sessionStorage.getItem(storageKey) === serverBuild) return false;
    window.sessionStorage.setItem(storageKey, serverBuild);
  } catch {
    // Storage unavailable: allow the reload. The check only runs every five
    // minutes, so the worst case is bounded.
  }
  return true;
}

function defaultReload(): void {
  window.location.reload();
}

export function useBuildCheck({
  mode,
  clientBuild,
  isSafeToReload,
  endpoint = '/api/build',
  storageKey = 'anchor-nights:build-reloaded-for',
  onReload = defaultReload,
}: UseBuildCheckOptions): UseBuildCheckApi {
  const [serverBuild, setServerBuild] = useState<string | null>(null);
  const client = clientBuild || DEV_BUILD_ID;

  useEffect(() => {
    // A local build can never be told to reload, so do not even ask.
    if (client === DEV_BUILD_ID) return;

    let cancelled = false;
    const check = async (): Promise<void> => {
      const build = await fetchServerBuild(endpoint);
      if (!cancelled && build) setServerBuild(build);
    };

    void check();
    const interval = setInterval(() => {
      void check();
    }, BUILD_CHECK_INTERVAL_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [client, endpoint]);

  let safe: boolean;
  try {
    safe = isSafeToReload();
  } catch {
    // If the app cannot say, it is not safe.
    safe = false;
  }
  const action = decideBuildAction({ clientBuild: client, serverBuild, mode, safe });

  useEffect(() => {
    if (action !== 'reload' || !serverBuild) return;
    const reloadNow = (): void => {
      if (!claimAutoReload(storageKey, serverBuild)) return;
      onReload();
    };
    // Reloading with no network lands on the browser's offline page, which
    // on an unattended TV stays up until somebody walks over to it. So wait
    // for the connection to come back, give it a moment to settle, and
    // reload then. If the moment stops being safe first, this effect is
    // cleaned up and the listener and timer go with it.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      let settleTimer: ReturnType<typeof setTimeout> | null = null;
      const onOnline = (): void => {
        if (settleTimer !== null) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          settleTimer = null;
          if (navigator.onLine) reloadNow();
        }, ONLINE_SETTLE_MS);
      };
      window.addEventListener('online', onOnline);
      return () => {
        window.removeEventListener('online', onOnline);
        if (settleTimer !== null) clearTimeout(settleTimer);
      };
    }
    reloadNow();
  }, [action, serverBuild, storageKey, onReload]);

  const reload = useCallback(() => {
    onReload();
  }, [onReload]);

  return { action, showPrompt: action === 'prompt', reload };
}
