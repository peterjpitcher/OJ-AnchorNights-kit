import { createHash } from 'node:crypto';
import { PASSWORD_MAX_BYTES, PASSWORD_MESSAGES, PASSWORD_MIN_LENGTH, passwordBytes, passwordLength } from '../shared';

// The one password policy (standard section 12, spec S1.5). Every surface that
// sets a password calls validatePassword: reset, invite acceptance and change.
// At least 12 characters, at most 72 bytes (bcrypt's limit, measured in UTF-8
// bytes, never silently truncated), no composition rules, not a known
// breached password, not the current one. No case or Unicode normalisation:
// bytes as typed. The Supabase dashboard minimum is set to 12 as well.

export const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
export const HIBP_TIMEOUT_MS = 2000;

export type BreachResult = 'breached' | 'clean' | 'unavailable';
export type BreachChecker = (password: string) => Promise<BreachResult>;

export interface HibpOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Have I Been Pwned, k-anonymity range API: only the first 5 hex characters
 * of the password's SHA-1 leave the server, with Add-Padding so the response
 * size says nothing. 'unavailable' on a timeout (2 seconds), a non-200 or a
 * network error; the caller then lets the password through and records it
 * (the standard's fail-open rule for this check).
 */
export function createHibpChecker({ fetch: fetchImpl = fetch, timeoutMs = HIBP_TIMEOUT_MS }: HibpOptions = {}): BreachChecker {
  return async (password) => {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) return 'unavailable';
      const body = await response.text();
      for (const line of body.split('\n')) {
        const [candidate, count] = line.trim().split(':');
        if (candidate === suffix && Number(count) > 0) return 'breached';
      }
      return 'clean';
    } catch {
      return 'unavailable';
    } finally {
      clearTimeout(timer);
    }
  };
}

export type PasswordProblem = 'empty' | 'too_short' | 'too_long' | 'breached' | 'same_as_current' | 'mismatch';

export type PasswordCheck =
  | { ok: true; breachCheck: 'clean' | 'unavailable' | 'skipped' }
  | { ok: false; problem: PasswordProblem; message: string };

export interface ValidatePasswordOptions {
  /** The current password, on a signed-in change. It must not be reused. */
  currentPassword?: string;
  /** The confirmation field, when the form has one. */
  confirmation?: string;
  /** The breach check. Leave it out only in a test; every app passes the HIBP checker. */
  breachCheck?: BreachChecker;
}

/** The single shared policy check. Server-side and authoritative. */
export async function validatePassword(password: string, options: ValidatePasswordOptions = {}): Promise<PasswordCheck> {
  if (password.length === 0) return { ok: false, problem: 'empty', message: PASSWORD_MESSAGES.empty };
  if (passwordLength(password) < PASSWORD_MIN_LENGTH) return { ok: false, problem: 'too_short', message: PASSWORD_MESSAGES.tooShort };
  if (passwordBytes(password) > PASSWORD_MAX_BYTES) return { ok: false, problem: 'too_long', message: PASSWORD_MESSAGES.tooLong };
  if (options.confirmation !== undefined && options.confirmation !== password) {
    return { ok: false, problem: 'mismatch', message: PASSWORD_MESSAGES.mismatch };
  }
  if (options.currentPassword !== undefined && options.currentPassword === password) {
    return { ok: false, problem: 'same_as_current', message: PASSWORD_MESSAGES.sameAsCurrent };
  }
  if (!options.breachCheck) return { ok: true, breachCheck: 'skipped' };
  const breach = await options.breachCheck(password);
  if (breach === 'breached') return { ok: false, problem: 'breached', message: PASSWORD_MESSAGES.breached };
  return { ok: true, breachCheck: breach };
}
