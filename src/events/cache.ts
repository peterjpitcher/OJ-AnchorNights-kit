// The feed's caches, per server instance. Pure (the clock is injected), so
// it is tested without timers.
//
// From Cash Bingo (src/lib/events-feed/projection.ts: TtlMemo and
// createProjectionRefresher). Cash Bingo let Next's `unstable_cache` hold the
// projection and serve it stale; the kit holds it here in memory instead
// (see feed.ts for why), with the same rules:
//   - fresh for 5 minutes;
//   - after that the next call refreshes, and a failed refresh keeps serving
//     the last good answer for up to 24 hours from when it was fetched;
//   - one refresh in flight at a time: callers that arrive meanwhile share it;
//   - after a failure, every call for the next minute answers at once from
//     what is held (or fails with that same error) instead of trying again,
//     so a down management app is not hammered and a cold page never waits.

/** How long an answer is fresh. */
export const FEED_FRESH_MS = 5 * 60 * 1000;

/** How long an answer may keep serving while refreshes fail. */
export const FEED_STALE_IF_ERROR_MS = 24 * 60 * 60 * 1000;

/** After a failed refresh, how long calls answer at once instead of trying again. */
export const FEED_FAIL_FAST_MS = 60 * 1000;

interface MemoEntry<T> {
  value: T;
  expiresAt: number;
}

/** A small time-limited map with a size cap. */
export class TtlMemo<T> {
  private readonly entries = new Map<string, MemoEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 200) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string, nowMs: number): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= nowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, nowMs: number): void {
    if (this.entries.size >= this.maxEntries) {
      for (const [k, entry] of this.entries) {
        if (entry.expiresAt <= nowMs) this.entries.delete(k);
      }
      // Still full: drop the oldest insertion.
      const oldest = this.entries.keys().next();
      if (this.entries.size >= this.maxEntries && !oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: nowMs + this.ttlMs });
  }
}

export interface CachedValue<T> {
  value: T;
  /** When it was loaded (epoch milliseconds). */
  fetchedAtMs: number;
  /** True when it is past fresh and is being served because a refresh failed. */
  stale: boolean;
}

export interface StaleIfErrorCacheOptions<T> {
  load: () => Promise<T>;
  now?: () => number;
  freshMs?: number;
  maxStaleMs?: number;
  failFastMs?: number;
  /** Told about each failed refresh once (not again while failing fast). */
  onRefreshError?: (err: unknown) => void;
}

export interface StaleIfErrorCache<T> {
  /** The held answer, refreshed when due. Rejects only with nothing usable to serve. */
  get(): Promise<CachedValue<T>>;
  /** Forgets everything, for tests and a manual refresh. */
  clear(): void;
}

export function createStaleIfErrorCache<T>(options: StaleIfErrorCacheOptions<T>): StaleIfErrorCache<T> {
  const now = options.now ?? Date.now;
  const freshMs = options.freshMs ?? FEED_FRESH_MS;
  const maxStaleMs = options.maxStaleMs ?? FEED_STALE_IF_ERROR_MS;
  const failFastMs = options.failFastMs ?? FEED_FAIL_FAST_MS;

  let held: { value: T; fetchedAtMs: number } | null = null;
  let inFlight: Promise<{ value: T; fetchedAtMs: number }> | null = null;
  let lastFailure: { atMs: number; error: unknown } | null = null;

  const usable = (nowMs: number): boolean => held !== null && nowMs - held.fetchedAtMs <= maxStaleMs;

  const fallBack = (err: unknown): CachedValue<T> => {
    const nowMs = now();
    if (held && usable(nowMs)) return { value: held.value, fetchedAtMs: held.fetchedAtMs, stale: true };
    throw err;
  };

  const refresh = (): Promise<{ value: T; fetchedAtMs: number }> => {
    if (inFlight) return inFlight;
    const run = options
      .load()
      .then((value) => {
        held = { value, fetchedAtMs: now() };
        lastFailure = null;
        return held;
      })
      .catch((err: unknown) => {
        lastFailure = { atMs: now(), error: err };
        try {
          options.onRefreshError?.(err);
        } catch {
          // Reporting must never become the failure.
        }
        throw err;
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = run;
    return run;
  };

  return {
    async get(): Promise<CachedValue<T>> {
      const nowMs = now();
      if (held && nowMs - held.fetchedAtMs < freshMs) {
        return { value: held.value, fetchedAtMs: held.fetchedAtMs, stale: false };
      }
      if (lastFailure && !inFlight) {
        const elapsed = nowMs - lastFailure.atMs;
        if (elapsed >= 0 && elapsed < failFastMs) return fallBack(lastFailure.error);
      }
      try {
        const fresh = await refresh();
        return { value: fresh.value, fetchedAtMs: fresh.fetchedAtMs, stale: false };
      } catch (err) {
        return fallBack(err);
      }
    },
    clear(): void {
      held = null;
      inFlight = null;
      lastFailure = null;
    },
  };
}
