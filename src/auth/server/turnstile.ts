import { CAPTCHA_FIELD } from '../shared';

// Two contracts (standard section 8).
//
// A. Supabase-verified flows (sign-in, forgot password, the current-password
//    check on a change): the app forwards the token as captchaToken and never
//    requires it itself, so switching CAPTCHA off in the dashboard is a
//    complete break-glass. captchaTokenFrom only reads it.
// B. Application-verified public forms (an app's own anonymous write
//    surfaces): verifyTurnstile, the one shared server-side verifier.

/** The Turnstile token a form posted, or undefined. Never required here. */
export function captchaTokenFrom(formData: FormData): string | undefined {
  const value = formData.get(CAPTCHA_FIELD);
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 ? value : undefined;
}

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileFailure = 'missing' | 'invalid' | 'duplicate' | 'action_mismatch' | 'hostname_mismatch' | 'unavailable';

export interface VerifyTurnstileInput {
  token: string | undefined;
  /** TURNSTILE_SECRET_KEY for this environment. */
  secret: string;
  /** The widget's action; it must match exactly. */
  action: string;
  /** Hostnames the widget may be served from; the response's must be one. */
  hostnames: readonly string[];
  remoteIp?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Contract B: siteverify with a 2 second timeout, a mandatory action match
 * and hostname allowlist. A reused token comes back as 'duplicate' (Cloudflare
 * accepts each token once), and the form must reset its widget. The response
 * body is never logged.
 */
export async function verifyTurnstile(input: VerifyTurnstileInput): Promise<{ ok: true } | { ok: false; reason: TurnstileFailure }> {
  if (!input.token) return { ok: false, reason: 'missing' };
  const body = new URLSearchParams({ secret: input.secret, response: input.token });
  if (input.remoteIp) body.set('remoteip', input.remoteIp);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 2000);
  try {
    const response = await (input.fetch ?? fetch)(SITEVERIFY_URL, { method: 'POST', body, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const result = (await response.json()) as { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] };
    if (!result.success) {
      return { ok: false, reason: result['error-codes']?.includes('timeout-or-duplicate') ? 'duplicate' : 'invalid' };
    }
    if (result.action !== input.action) return { ok: false, reason: 'action_mismatch' };
    if (!result.hostname || !input.hostnames.includes(result.hostname)) return { ok: false, reason: 'hostname_mismatch' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
