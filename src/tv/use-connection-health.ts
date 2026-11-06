// From Cash Bingo (src/hooks/use-connection-health.ts), unchanged apart
// from comments.
//
// NEVER put the object returned by useConnectionHealth() in a dependency
// array. It re-renders once a second by design (see the tick effect below),
// so any effect or useCallback that depends on the object is torn down and
// rebuilt every second. That silently broke Cash Bingo's host screen: a 3
// second poll interval was cleared before it could fire, and the Realtime
// channel was re-subscribed faster than Supabase could subscribe it.
//
// Destructure the callbacks instead, and depend on those:
//   const { markPollSuccess, markPollFailure, markRealtimeStatus } = health;
// Read the changing values (healthy, shouldShowBanner, shouldAutoRefresh,
// unhealthyForMs) inline in JSX, never as dependencies.
'use client';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  initialHealthState,
  reduceHealth,
  selectHealthy,
  selectShouldAutoRefresh,
  selectShouldShowBanner,
  type HealthEvent,
  type HealthState,
  type RealtimeStatus,
} from './connection-health';

export interface UseConnectionHealthApi {
  healthy: boolean;
  /** True after 10 seconds with nothing delivering data. */
  shouldShowBanner: boolean;
  /** True after 30 seconds. ConnectionBanner decides whether a reload is safe. */
  shouldAutoRefresh: boolean;
  unhealthyForMs: number;
  markPollSuccess: () => void;
  markPollFailure: () => void;
  /** Pass the status a Supabase channel's subscribe callback reports. */
  markRealtimeStatus: (status: RealtimeStatus) => void;
}

export function useConnectionHealth(): UseConnectionHealthApi {
  const [state, dispatch] = useReducer(
    (s: HealthState, e: HealthEvent) => reduceHealth(s, e),
    null,
    () => initialHealthState(Date.now()),
  );
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so the banner and reload thresholds re-evaluate
  // without anything having to dispatch an event for time to pass.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Wire window online and offline.
  useEffect(() => {
    const onOnline = (): void => dispatch({ type: 'browser-online', at: Date.now() });
    const onOffline = (): void => dispatch({ type: 'browser-offline', at: Date.now() });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const markPollSuccess = useCallback(() => {
    dispatch({ type: 'poll-success', at: Date.now() });
  }, []);
  const markPollFailure = useCallback(() => {
    dispatch({ type: 'poll-failure', at: Date.now() });
  }, []);
  const markRealtimeStatus = useCallback((status: RealtimeStatus) => {
    dispatch({ type: 'realtime-status', status, at: Date.now() });
  }, []);

  const healthy = selectHealthy(state);
  const shouldShowBanner = selectShouldShowBanner(state, now);
  const shouldAutoRefresh = selectShouldAutoRefresh(state, now);
  const unhealthyForMs = state.unhealthySinceMs == null ? 0 : Math.max(0, now - state.unhealthySinceMs);

  // Memoised on its real values so consumers that DO compare the object by
  // identity only see a change when something actually changed. This does not
  // make the object safe as a dependency: unhealthyForMs still moves every
  // second while unhealthy.
  return useMemo(
    () => ({
      healthy,
      shouldShowBanner,
      shouldAutoRefresh,
      unhealthyForMs,
      markPollSuccess,
      markPollFailure,
      markRealtimeStatus,
    }),
    [healthy, shouldShowBanner, shouldAutoRefresh, unhealthyForMs, markPollSuccess, markPollFailure, markRealtimeStatus],
  );
}
