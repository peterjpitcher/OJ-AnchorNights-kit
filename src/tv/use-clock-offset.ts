// From Cash Bingo (src/hooks/use-clock-offset.ts), with the endpoint as an
// option. The server clock offset for a public screen: sampled on load and
// every ten minutes. Returns 0 until the first successful round, then the
// last good offset. Use as: correctedNow = Date.now() + offset.
'use client';

import { useEffect, useState } from 'react';
import { createClockOffsetSampler } from './clock-offset';

export const TIME_REQUEST_TIMEOUT_MS = 5000;

/** Reads the server time out of a time route's JSON (`{ now: <ms> }`), or throws. */
export function readTimeResponse(body: unknown): number {
  const now = (body as { now?: unknown } | null)?.now;
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new Error('The time route returned no usable time');
  }
  return now;
}

async function fetchServerNow(endpoint: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`GET ${endpoint} answered ${response.status}`);
    return readTimeResponse(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export interface UseClockOffsetOptions {
  /** The app's time route, answering `{ now: Date.now() }`. Defaults to /api/time. */
  endpoint?: string;
}

export function useClockOffset({ endpoint = '/api/time' }: UseClockOffsetOptions = {}): number {
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    const sampler = createClockOffsetSampler(() => fetchServerNow(endpoint));
    const unsubscribe = sampler.onChange(setOffsetMs);
    sampler.start();
    return () => {
      unsubscribe();
      sampler.stop();
    };
  }, [endpoint]);

  return offsetMs;
}
