// @anchor-nights/kit/auth/headers: the standard's security headers and CSP
// baseline (standard section 3), for next.config.ts `headers()`.
//
// Plain JavaScript with no imports, like @anchor-nights/kit/env, because
// next.config.ts loads it in Node outside the bundler. Types in headers.d.ts.
//
//   import { securityHeaders } from '@anchor-nights/kit/auth/headers';
//   async headers() {
//     return [{ source: '/:path*', headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, cspMode: 'report-only' }) }];
//   }
//
// A CSP change goes out as Report-Only first (at least two weeks of real
// traffic, collected at an app endpoint), then cspMode: 'enforce'.

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

function originOf(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    throw new Error('securityHeaders: supabaseUrl is not a URL');
  }
}

function join(base, extra) {
  return [...base, ...(extra || [])].join(' ');
}

/**
 * The Content-Security-Policy value. `extra` adds each app's documented
 * exceptions (for example scriptSrc ["'unsafe-inline'"] while Next's inline
 * scripts have no nonce, recorded in the app's CLAUDE.md with an owner).
 */
export function buildContentSecurityPolicy({ supabaseUrl, extra = {}, reportUri } = {}) {
  const supabase = originOf(supabaseUrl);
  const supabaseWss = supabase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${join(["'self'", TURNSTILE_ORIGIN], extra.scriptSrc)}`,
    `frame-src ${join([TURNSTILE_ORIGIN], extra.frameSrc)}`,
    `connect-src ${join(["'self'", supabase, supabaseWss, TURNSTILE_ORIGIN], extra.connectSrc)}`,
    `img-src ${join(["'self'", 'data:', 'blob:'], extra.imgSrc)}`,
    `style-src ${join(["'self'"], extra.styleSrc)}`,
    `font-src ${join(["'self'"], extra.fontSrc)}`,
  ];
  if (reportUri) directives.push(`report-uri ${reportUri}`);
  return directives.join('; ');
}

/**
 * Every page response's headers: HSTS, nosniff, frame denial, referrer
 * policy, permissions policy and the CSP (Report-Only unless cspMode is
 * 'enforce'). `includeSubDomains` only once every subdomain is on https.
 */
export function securityHeaders({ supabaseUrl, cspMode = 'report-only', extra, reportUri, hstsIncludeSubDomains = true, hstsPreload = false } = {}) {
  const hsts = ['max-age=63072000', hstsIncludeSubDomains ? 'includeSubDomains' : null, hstsPreload ? 'preload' : null].filter(Boolean).join('; ');
  return [
    { key: 'Strict-Transport-Security', value: hsts },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
      key: cspMode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      value: buildContentSecurityPolicy({ supabaseUrl, extra, reportUri }),
    },
  ];
}
