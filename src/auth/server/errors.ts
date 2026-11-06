// How the kit reads Supabase failures. The rule everywhere: an outage is
// never mistaken for "signed out" or "wrong password" (standard sections 3
// and 9), so a caller can fail closed with an honest message.

interface MaybeAuthError {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
}

function asError(error: unknown): MaybeAuthError {
  return typeof error === 'object' && error !== null ? (error as MaybeAuthError) : {};
}

/** The auth service (or the network to it) failed, as opposed to refusing the request. */
export function isServiceError(error: unknown): boolean {
  const e = asError(error);
  if (e.name === 'AuthRetryableFetchError' || e.name === 'AuthUnknownError') return true;
  if (e.name === 'AuthSessionMissingError') return false;
  if (typeof e.status === 'number') return e.status === 0 || e.status >= 500;
  // No status at all: a thrown network or programming error, not a refusal.
  return true;
}

/** Supabase refused because the CAPTCHA token was missing, used or wrong. */
export function isCaptchaError(error: unknown): boolean {
  const e = asError(error);
  return e.code === 'captcha_failed' || /captcha/i.test(e.message ?? '');
}

/** Supabase's own rate limit (429). */
export function isProviderRateLimit(error: unknown): boolean {
  const e = asError(error);
  return e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit';
}

/** A short code to keep in an audit row's reason. Never the message, which may echo input. */
export function errorReason(error: unknown, fallback: string): string {
  const e = asError(error);
  const code = typeof e.code === 'string' && /^[a-z0-9_]{1,60}$/i.test(e.code) ? e.code : null;
  return code ?? (typeof e.status === 'number' ? `${fallback}_${e.status}` : fallback);
}

/** The kit_* function raised one of its named refusals, e.g. 'kit_invite_account_exists'. */
export function kitRefusal(error: unknown): string | null {
  const match = /\b(kit_[a-z_]+)\b/.exec(asError(error).message ?? '');
  return match ? match[1] : null;
}
