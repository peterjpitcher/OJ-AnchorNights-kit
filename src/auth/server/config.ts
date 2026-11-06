import { z } from 'zod';
import { DEFAULT_AUTH_PATHS, type AppRole, type AuthPaths } from '../shared';
import { parseHmacKey, type HmacKey } from './crypto';
import type { AuthAlertHandler } from './types';

export interface AuthConfigInput {
  /** The app's short name in audit rows, e.g. 'anchor-quiz'. */
  app: string;
  /** 'production', 'preview' or 'development' (VERCEL_ENV), stored on every audit row. */
  environment: string;
  /** The app's own origin (NEXT_PUBLIC_APP_URL). Reset and invite links are built on it. */
  appUrl: string;
  /** AUDIT_HMAC_KEY: `v1:` then at least 32 random characters. */
  auditHmacKey: string;
  paths?: Partial<AuthPaths>;
  /** Where each role lands after sign-in. Defaults to paths.home for both. */
  homeForRole?: Partial<Record<AppRole, string>>;
  /** Called for anything a person must look at (a sign-in with no CAPTCHA token, an orphaned invite user). */
  alert?: AuthAlertHandler;
}

export interface AuthConfig {
  app: string;
  environment: string;
  appUrl: string;
  hmacKey: HmacKey;
  paths: AuthPaths;
  homeForRole: Record<AppRole, string>;
  /** Secure cookies everywhere except plain-http localhost. */
  secureCookies: boolean;
  alert: AuthAlertHandler;
}

const path = z.string().regex(/^\/[A-Za-z0-9/_-]*$/, 'must be a plain path starting with /');

const schema = z.object({
  app: z.string().min(1).max(60),
  environment: z.string().min(1).max(30),
  appUrl: z.string().min(1),
  auditHmacKey: z.string().min(1),
});

/**
 * Checks and completes the app's auth settings. Throws on anything unsafe:
 * a non-https app URL outside localhost, a malformed HMAC key, or a confirm
 * or reset path outside /auth (the recovery grant cookie is scoped there).
 */
export function defineAuthConfig(input: AuthConfigInput): AuthConfig {
  const parsed = schema.parse(input);
  let url: URL;
  try {
    url = new URL(parsed.appUrl);
  } catch {
    throw new Error('auth config: appUrl is not a URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('auth config: appUrl must use https (plain http only for localhost).');
  }
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('auth config: appUrl must be an origin only.');

  const paths: AuthPaths = { ...DEFAULT_AUTH_PATHS, ...input.paths };
  for (const [name, value] of Object.entries(paths)) {
    if (!path.safeParse(value).success) throw new Error(`auth config: paths.${name} must be a plain path starting with /.`);
  }
  if (!paths.confirm.startsWith('/auth/') || !paths.resetPassword.startsWith('/auth/')) {
    throw new Error('auth config: paths.confirm and paths.resetPassword must be under /auth/, where the recovery grant cookie lives.');
  }

  const alert = input.alert ?? ((a) => console.error(`[auth] ${a.severity} ${a.kind}: ${a.message}`));
  return {
    app: parsed.app,
    environment: parsed.environment,
    appUrl: url.origin,
    hmacKey: parseHmacKey(parsed.auditHmacKey),
    paths,
    homeForRole: { admin: input.homeForRole?.admin ?? paths.home, host: input.homeForRole?.host ?? paths.home },
    secureCookies: url.protocol === 'https:',
    alert,
  };
}

/** Runs the app's alert handler without ever letting it throw into a sign-in. */
export async function raiseAlert(config: AuthConfig, alert: Parameters<AuthAlertHandler>[0]): Promise<void> {
  try {
    await config.alert(alert);
  } catch {
    console.error(`[auth] alert handler failed for ${alert.kind}`);
  }
}
