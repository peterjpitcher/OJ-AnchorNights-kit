import { createAuthAuditor, supabaseAuditSink, type AuditSink, type AuthAuditor } from './audit';
import type { AuthConfig } from './config';
import { createHibpChecker, type BreachChecker } from './password-policy';
import { supabaseRateLimiter, type AuthRateLimiter } from './rate-limit';
import type { AnySupabaseClient, CookieJar, HeaderBag } from './types';

/**
 * What the kit's server actions need from the app. Each is the app's own:
 * the kit never makes a Supabase client or reads a key itself.
 */
export interface AuthDeps {
  config: AuthConfig;
  /** The app's server client (public key, cookie session), e.g. `createClient` from src/lib/supabase/server.ts. */
  serverClient: () => Promise<AnySupabaseClient>;
  /** The app's admin client (service-role key, server only), from src/lib/supabase/admin.ts. */
  adminClient: () => AnySupabaseClient | Promise<AnySupabaseClient>;
  /** Next's `cookies` from next/headers. */
  cookies: () => Promise<CookieJar>;
  /** Next's `headers` from next/headers. */
  headers: () => Promise<HeaderBag>;
  /** Defaults to the shared database limiter (kit_auth_throttle). */
  limiter?: AuthRateLimiter;
  /** Defaults to Have I Been Pwned's range API with a 2 second timeout. */
  breachCheck?: BreachChecker;
  /** Defaults to the auth_audit table. */
  auditSink?: AuditSink;
}

export interface ResolvedDeps extends AuthDeps {
  limiter: AuthRateLimiter;
  breachCheck: BreachChecker;
  audit: AuthAuditor;
}

export function resolveDeps(deps: AuthDeps): ResolvedDeps {
  return {
    ...deps,
    limiter: deps.limiter ?? supabaseRateLimiter(deps.adminClient),
    breachCheck: deps.breachCheck ?? createHibpChecker(),
    audit: createAuthAuditor(deps.config, deps.auditSink ?? supabaseAuditSink(deps.adminClient)),
  };
}
