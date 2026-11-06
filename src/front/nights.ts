// The four nights by name. No hostnames live here: every address comes from
// the app's own configuration (spec S2.3; each app reads its siblings' URLs
// from its environment).

export type NightKey = 'quiz' | 'cash' | 'music' | 'tasting';

export const NIGHT_KEYS: readonly NightKey[] = Object.freeze(['quiz', 'cash', 'music', 'tasting']);

/** Each night's name as the pub uses it. */
export const NIGHT_LABELS: Readonly<Record<NightKey, string>> = Object.freeze({
  quiz: 'Quiz Night',
  cash: 'Cash Bingo',
  music: 'Music Bingo',
  tasting: 'Tasting Night',
});

export interface OtherNight {
  key: NightKey;
  name: string;
  href: string;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** An absolute https URL (plain http only for localhost), or null. */
export function safeNightUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
    if (url.username || url.password) return null;
    return url.toString();
  }
  return null;
}

/**
 * The "Other nights" row: every night except this app's, in the usual order,
 * from the URLs the app passes (for example from NEXT_PUBLIC_*_URL variables).
 * A night with no URL, or one that is not https, is left out rather than
 * linked wrongly.
 */
export function buildOtherNights({ current, urls }: { current: NightKey; urls: Partial<Record<NightKey, string | undefined>> }): OtherNight[] {
  return NIGHT_KEYS.filter((key) => key !== current).flatMap((key) => {
    const href = safeNightUrl(urls[key]);
    return href ? [{ key, name: NIGHT_LABELS[key], href }] : [];
  });
}
