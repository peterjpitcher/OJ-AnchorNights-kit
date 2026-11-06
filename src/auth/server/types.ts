import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Any app's Supabase client. The kit calls only auth methods and its own
 * kit_* functions, so it does not need the app's generated Database type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each app passes its own SupabaseClient<Database>; the kit must accept all of them.
export type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
}

/** The part of Next's `cookies()` the kit uses (writable inside a Server Action). */
export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(options: { name: string; path?: string }): unknown;
}

/** The part of Next's `headers()` the kit uses. */
export interface HeaderBag {
  get(name: string): string | null;
}

export type AlertSeverity = 'high' | 'normal';

export interface AuthAlert {
  /** A short stable name, e.g. 'captcha_bypass_detected'. */
  kind: string;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
}

/** The app's alert: report it (reportError, app_errors) and, for 'high', reach a person. Never throws back. */
export type AuthAlertHandler = (alert: AuthAlert) => void | Promise<void>;
