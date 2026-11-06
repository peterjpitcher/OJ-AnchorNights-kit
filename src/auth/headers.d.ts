// Types for headers.js. Keep in step with it.

export interface CspExtra {
  scriptSrc?: readonly string[];
  frameSrc?: readonly string[];
  connectSrc?: readonly string[];
  imgSrc?: readonly string[];
  styleSrc?: readonly string[];
  fontSrc?: readonly string[];
}

export interface CspOptions {
  supabaseUrl: string | undefined;
  extra?: CspExtra;
  reportUri?: string;
}

export interface SecurityHeadersOptions extends CspOptions {
  /** 'report-only' (default) while violations are collected; 'enforce' after at least two weeks clean. */
  cspMode?: 'report-only' | 'enforce';
  hstsIncludeSubDomains?: boolean;
  hstsPreload?: boolean;
}

export declare const TURNSTILE_ORIGIN: 'https://challenges.cloudflare.com';
export declare function buildContentSecurityPolicy(options: CspOptions): string;
export declare function securityHeaders(options: SecurityHeadersOptions): { key: string; value: string }[];
