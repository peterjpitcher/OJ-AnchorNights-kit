// Types for index.js. Keep in step with it.

/** How a set value is checked. Leave it out to check only that it is set. */
export type EnvKind =
  /** Any http or https URL (the Supabase URL). */
  | 'url'
  /** An https URL (a sink or webhook). */
  | 'https-url'
  /** A bare https origin; http only for a loopback host outside production (NEXT_PUBLIC_SITE_URL). */
  | 'site-origin'
  /** https with an optional path; http only for a loopback host outside production (ANCHOR_API_BASE_URL). */
  | 'api-base-url'
  /** "anch_" then the key (ANCHOR_API_KEY). */
  | 'management-api-key';

export interface EnvRule {
  /** The variable's name, exactly as set in Vercel. */
  readonly name: string;
  /** true: always needed. 'production': needed on a Vercel production build only. Left out: optional. */
  readonly required?: boolean | 'production';
  readonly kind?: EnvKind;
  /** An extra shape the value must match. */
  readonly pattern?: RegExp;
  /** Completes "NAME ..." when the pattern fails, e.g. "must be a 6-digit code". */
  readonly patternHint?: string;
  /** Completes "production builds need it ...", e.g. "for the events feed". */
  readonly why?: string;
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

export declare const MANAGEMENT_API_KEY_SHAPE: RegExp;
export declare const DEV_BUILD_ID: 'dev';

export declare function isProductionEnv(env?: EnvSource): boolean;
export declare function defineEnv<const T extends readonly EnvRule[]>(rules: T): T;
export declare function checkEnv(rules: readonly EnvRule[], env?: EnvSource): string[];
export declare function validateBuildEnv(rules: readonly EnvRule[], env?: EnvSource): void;
export declare function buildIdFromEnv(env?: EnvSource): string;

export declare const SUPABASE_PUBLIC_ENV: readonly EnvRule[];
export declare const SITE_URL_ENV: readonly EnvRule[];
export declare const ANCHOR_API_ENV: readonly EnvRule[];
export declare const ERROR_SINK_ENV: readonly EnvRule[];

export interface PublicSupabaseEnv {
  url: string;
  anonKey: string;
}

export declare function getPublicSupabaseEnv(): PublicSupabaseEnv;
