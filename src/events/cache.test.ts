// The 5-minute cache with stale-if-error up to 24 hours. The clock is a
// variable, so there are no timers and no time zone in it.
import { describe, expect, it } from 'vitest';
import { createStaleIfErrorCache, FEED_FAIL_FAST_MS, FEED_FRESH_MS, FEED_STALE_IF_ERROR_MS, TtlMemo } from './cache';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function setup() {
  let clock = Date.parse('2026-11-18T18:00:00Z');
  let calls = 0;
  let failNext = false;
  const errors: unknown[] = [];
  const cache = createStaleIfErrorCache<number>({
    now: () => clock,
    load: async () => {
      calls += 1;
      if (failNext) throw new Error('down');
      return calls;
    },
    onRefreshError: (err) => errors.push(err),
  });
  return {
    cache,
    errors,
    advance: (ms: number) => {
      clock += ms;
    },
    fail: (value: boolean) => {
      failNext = value;
    },
    calls: () => calls,
  };
}

describe('the feed cache', () => {
  it('has the spec timings', () => {
    expect(FEED_FRESH_MS).toBe(5 * MINUTE);
    expect(FEED_STALE_IF_ERROR_MS).toBe(24 * HOUR);
    expect(FEED_FAIL_FAST_MS).toBe(MINUTE);
  });

  it('serves a fresh answer for 5 minutes, then refreshes', async () => {
    const t = setup();
    expect((await t.cache.get()).value).toBe(1);
    t.advance(4 * MINUTE + 59_000);
    expect((await t.cache.get()).value).toBe(1);
    expect(t.calls()).toBe(1);
    t.advance(1000);
    expect((await t.cache.get()).value).toBe(2);
  });

  it('shares one refresh between callers that arrive together', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.cache.get(), t.cache.get()]);
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
    expect(t.calls()).toBe(1);
  });

  it('keeps serving the last good answer while refreshes fail, for up to 24 hours', async () => {
    const t = setup();
    await t.cache.get();
    t.fail(true);
    t.advance(10 * MINUTE);
    const stale = await t.cache.get();
    expect(stale).toMatchObject({ value: 1, stale: true });
    expect(t.errors).toHaveLength(1);

    t.advance(24 * HOUR - 10 * MINUTE);
    expect((await t.cache.get()).value).toBe(1);

    t.advance(1);
    await expect(t.cache.get()).rejects.toThrow('down');
  });

  it('pauses for a minute after a failure instead of trying again, without reporting again', async () => {
    const t = setup();
    await t.cache.get();
    t.fail(true);
    t.advance(6 * MINUTE);
    await t.cache.get();
    const callsAfterFailure = t.calls();
    t.advance(30_000);
    expect((await t.cache.get()).stale).toBe(true);
    expect(t.calls()).toBe(callsAfterFailure);
    expect(t.errors).toHaveLength(1);

    t.fail(false);
    t.advance(30_000);
    const recovered = await t.cache.get();
    expect(recovered.stale).toBe(false);
    expect(recovered.value).toBe(callsAfterFailure + 1);
  });

  it('rejects on a cold failure, and fails fast with the same error', async () => {
    const t = setup();
    t.fail(true);
    await expect(t.cache.get()).rejects.toThrow('down');
    await expect(t.cache.get()).rejects.toThrow('down');
    expect(t.calls()).toBe(1);
  });
});

describe('TtlMemo', () => {
  it('forgets an entry when it expires and drops the oldest when full', () => {
    const memo = new TtlMemo<string>(1000, 2);
    memo.set('a', 'A', 0);
    memo.set('b', 'B', 0);
    memo.set('c', 'C', 0);
    expect(memo.get('a', 1)).toBeUndefined();
    expect(memo.get('c', 999)).toBe('C');
    expect(memo.get('c', 1000)).toBeUndefined();
  });
});
