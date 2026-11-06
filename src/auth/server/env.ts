import { z } from 'zod';

// Runtime validation of what the auth module reads (standard section 15).
// Build time is covered by AUTH_ENV in @anchor-nights/kit/env; this is the
// same list checked again where the server reads it, with no fallbacks.

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && loopback.has(url.hostname);
    return (url.protocol === 'https:' || local) && url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}, 'must be an https origin (http only for localhost)');

export const authEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().refine((v) => /^https?:\/\/[^\s]+$/.test(v), 'must be a URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: origin,
  TURNSTILE_SECRET_KEY: z.string().min(10),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(10),
  AUDIT_HMAC_KEY: z.string().regex(/^v[0-9]+:[A-Za-z0-9+/=_-]{32,}$/, 'must be a version, a colon, then at least 32 random characters'),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

/** Parses the auth variables or throws naming each bad one (never its value). */
export function readAuthEnv(env: Record<string, string | undefined> = process.env): AuthEnv {
  const result = authEnvSchema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Auth environment check failed: ${names.join(', ')} missing or malformed.`);
  }
  return result.data;
}
