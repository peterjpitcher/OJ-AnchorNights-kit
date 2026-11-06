import type { AnySupabaseClient } from './types';

// The app-level limiter (standard section 7). The default counts failures in
// auth_audit through kit_auth_throttle, so every server instance shares it
// and no extra store is needed. Defaults: 10 failures in 15 minutes per
// canonical email and IP, 20 per email across IPs, 50 per IP across emails;
// a success clears the first two, never the IP. Resets: one request per
// address a minute, 20 per IP in 15 minutes.

export type ThrottleScope = 'sign_in' | 'password_reset';

export interface ThrottleInput {
  scope: ThrottleScope;
  /** The HMAC pseudonym of the canonical email, or null when there is none. */
  emailHmac: string | null;
  ip: string | null;
}

export interface AuthRateLimiter {
  /** Seconds to wait, or 0 to go ahead. Throws when the store is unreachable (the caller fails open and alerts). */
  check(input: ThrottleInput): Promise<number>;
  /** Records an outcome. The database limiter reads the audit rows instead, so it does nothing here. */
  record(input: ThrottleInput & { outcome: 'success' | 'failure' }): Promise<void>;
}

export function supabaseRateLimiter(getAdmin: () => AnySupabaseClient | Promise<AnySupabaseClient>): AuthRateLimiter {
  return {
    async check({ scope, emailHmac, ip }) {
      const admin = await getAdmin();
      const { data, error } = await admin.rpc('kit_auth_throttle', { p_scope: scope, p_email_hmac: emailHmac, p_ip: ip });
      if (error) throw new Error(`throttle check failed: ${error.code ?? 'unknown'}`);
      const wait = Number(data);
      return Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 0;
    },
    async record() {},
  };
}

const WINDOW_MS = 15 * 60 * 1000;

/**
 * The same rules in one server's memory, for tests and local runs. Not for
 * production on Vercel: each instance would count on its own.
 */
export function memoryRateLimiter(now: () => number = Date.now): AuthRateLimiter {
  const failures: { emailHmac: string | null; ip: string | null; at: number }[] = [];
  const lastSuccess = new Map<string, number>();
  const resets: { emailHmac: string | null; ip: string | null; at: number }[] = [];

  const waitFor = (times: number[], limit: number, windowMs: number): number => {
    if (times.length < limit) return 0;
    const oldest = Math.min(...times);
    return Math.max(1, Math.ceil((oldest + windowMs - now()) / 1000));
  };

  return {
    async check({ scope, emailHmac, ip }) {
      const since = now() - WINDOW_MS;
      if (scope === 'password_reset') {
        const recent = resets.filter((r) => r.at > since);
        const forEmail = emailHmac ? recent.filter((r) => r.emailHmac === emailHmac && r.at > now() - 60_000).map((r) => r.at) : [];
        const forIp = ip ? recent.filter((r) => r.ip === ip).map((r) => r.at) : [];
        return Math.max(waitFor(forEmail, 1, 60_000), waitFor(forIp, 20, WINDOW_MS));
      }
      const cleared = emailHmac ? Math.max(since, lastSuccess.get(emailHmac) ?? since) : since;
      const recent = failures.filter((f) => f.at > since);
      const pair = emailHmac ? recent.filter((f) => f.emailHmac === emailHmac && f.ip === ip && f.at > cleared).map((f) => f.at) : [];
      const email = emailHmac ? recent.filter((f) => f.emailHmac === emailHmac && f.at > cleared).map((f) => f.at) : [];
      const fromIp = ip ? recent.filter((f) => f.ip === ip).map((f) => f.at) : [];
      return Math.max(waitFor(pair, 10, WINDOW_MS), waitFor(email, 20, WINDOW_MS), waitFor(fromIp, 50, WINDOW_MS));
    },
    async record({ scope, emailHmac, ip, outcome }) {
      if (scope === 'password_reset') {
        resets.push({ emailHmac, ip, at: now() });
      } else if (outcome === 'failure') {
        failures.push({ emailHmac, ip, at: now() });
      } else if (emailHmac) {
        lastSuccess.set(emailHmac, now());
      }
    },
  };
}
