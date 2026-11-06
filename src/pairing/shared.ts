// @anchor-nights/kit/pairing/shared: the browser-safe half of TV pairing.
//
// Constants, the code helpers, the wire shapes of the pairing endpoint and
// the types the app's /tv page and resolver use. Nothing here touches
// Supabase, a cookie value or a key, so the screens may import it. The
// server half is @anchor-nights/kit/pairing.

import type { AuthFormAction, AuthFormState } from '../auth/shared';

// ---------------------------------------------------------------- constants

/** Digits in a pairing code. */
export const PAIRING_CODE_LENGTH = 6;
/** How long a code works, in seconds (10 minutes). */
export const PAIRING_CODE_TTL_SECONDS = 600;
/** How often the TV asks whether it has been paired. */
export const PAIRING_POLL_MS = 3000;
/** The device cookie's life: 400 days, the most a browser keeps a cookie. */
export const TV_DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
/** Where the TV screen asks for a code (POST) and polls (GET), unless the app passes another. */
export const DEFAULT_PAIRING_ENDPOINT = '/api/tv/pairing';
/** The name a TV gets when the host leaves it blank. */
export const DEFAULT_TV_NAME = 'Pub TV';
export const TV_NAME_MAX_LENGTH = 40;

/**
 * The device cookie's name. `__Host-` makes the browser insist on Secure,
 * Path=/ and no Domain, so no other subdomain can set or read it. Plain
 * http on localhost cannot use the prefix.
 */
export function tvDeviceCookieName(secure: boolean): string {
  return secure ? '__Host-anchor-tv' : 'anchor-tv';
}

/** The short-lived cookie that proves a TV is the screen that asked for its code. */
export function tvPairingCookieName(secure: boolean): string {
  return secure ? '__Host-anchor-tv-pairing' : 'anchor-tv-pairing';
}

// ---------------------------------------------------------------- codes

/**
 * The six digits a host typed, or null. Spaces, dashes and dots are
 * dropped, so "123 456" and "123-456" both work; anything else is refused.
 */
export function normalisePairingCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s.-]/g, '');
  return new RegExp(`^[0-9]{${PAIRING_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

/** "123456" as "123 456", for the TV. */
export function formatPairingCode(code: string): string {
  return code.length === PAIRING_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** The name a host typed, trimmed and squeezed, or the default when blank. Null when too long. */
export function normaliseTvName(raw: unknown): string | null {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (name.length === 0) return DEFAULT_TV_NAME;
  return [...name].length <= TV_NAME_MAX_LENGTH ? name : null;
}

// ---------------------------------------------------------------- rehearsal

/**
 * Rehearsal games show only with `?rehearsal=1` exactly (spec S3.2). Pass
 * Next's awaited searchParams, a URLSearchParams or a URL.
 */
export function isRehearsalRequest(params: URLSearchParams | URL | Record<string, string | string[] | undefined> | null | undefined): boolean {
  if (!params) return false;
  if (params instanceof URL) return params.searchParams.get('rehearsal') === '1';
  if (params instanceof URLSearchParams) return params.getAll('rehearsal').length === 1 && params.get('rehearsal') === '1';
  return params.rehearsal === '1';
}

// ---------------------------------------------------------------- wire

/** What POST to the pairing endpoint answers. */
export type PairingCodeResponse =
  | { status: 'code'; code: string; expiresInSeconds: number; pollMs: number }
  | { status: 'paired' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'unavailable' };

/** What GET (the poll) answers. */
export type PairingPollResponse =
  | { status: 'waiting' }
  | { status: 'paired' }
  /** Ask for a new code: this one ran out, was burnt by wrong guesses or replaced. */
  | { status: 'expired' }
  | { status: 'slow_down' }
  | { status: 'unavailable' };

// ---------------------------------------------------------------- devices

/** A paired screen, as the app's /tv resolver sees it. */
export interface TvDevice {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

/** A row in the admin list. */
export interface TvDeviceRow extends TvDevice {
  createdBy: string;
  createdByEmail: string | null;
  revokedAt: string | null;
}

// ---------------------------------------------------------------- /tv

/** The app's rule for tonight's game (spec S3.2 and section 6), given a paired TV. */
export interface ResolveTonightInput {
  device: TvDevice;
  now: Date;
  /** True only for `?rehearsal=1`. Rehearsal games must be skipped otherwise. */
  rehearsal: boolean;
}

/** Tonight's game for this TV, or null for the idle loop. Throwing shows the retry notice. */
export type ResolveTonight<Game> = (input: ResolveTonightInput) => Promise<Game | null>;

/** What /tv should show. */
export type TvView<Game> =
  | { kind: 'unpaired' }
  /** The device lookup or the resolver failed: show nothing of the game and retry. */
  | { kind: 'unavailable'; reason: 'device_lookup' | 'resolver' }
  | { kind: 'idle'; device: TvDevice; rehearsal: boolean }
  | { kind: 'game'; device: TvDevice; game: Game; rehearsal: boolean };

// ---------------------------------------------------------------- forms

/** The pairing actions use the auth module's form result, so the same screens helpers apply. */
export type PairingFormState = AuthFormState;
export type PairingFormAction = AuthFormAction;

export const PAIRING_MESSAGES = Object.freeze({
  paired: 'Paired. The TV switches over in a few seconds.',
  codeInvalid: 'Type the 6 digits shown on the TV.',
  nameTooLong: `Use ${TV_NAME_MAX_LENGTH} characters or fewer for the name.`,
  codeWrong: 'That code does not match a TV waiting to pair. Check the screen and try again. Codes change every 10 minutes.',
  locked: 'Too many wrong codes. Wait 15 minutes, then try again.',
  unavailable: 'We could not pair the TV just now. Please try again in a minute.',
  revoked: 'TV removed. It will show a new pairing code at its next refresh.',
  revokeMissing: 'That TV was already removed.',
  revokeUnavailable: 'We could not remove the TV. Please try again.',
});
