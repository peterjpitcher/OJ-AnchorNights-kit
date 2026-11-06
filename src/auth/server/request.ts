import type { HeaderBag } from './types';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

/**
 * The caller's IP and user agent. The IP comes from the hosting platform's
 * own headers: on Vercel, x-real-ip and the first x-forwarded-for entry are
 * written by the edge and a client cannot set them (standard section 7).
 */
export function requestContext(headers: HeaderBag): RequestContext {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = headers.get('x-real-ip')?.trim() || forwarded || null;
  const userAgent = headers.get('user-agent');
  return {
    ip: ip && ip.length <= 64 ? ip : null,
    userAgent: userAgent ? userAgent.slice(0, 400) : null,
  };
}

/**
 * The one shared same-origin guard for a browser-called, cookie-authenticated
 * Route Handler that changes something (standard section 6). Server Actions
 * do not need it: Next checks their Origin itself.
 */
export function isSameOriginRequest(headers: HeaderBag, allowedOrigins: readonly string[]): boolean {
  const origin = headers.get('origin');
  if (origin) return allowedOrigins.includes(origin);
  return headers.get('sec-fetch-site') === 'same-origin';
}
