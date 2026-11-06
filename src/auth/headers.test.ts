import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, securityHeaders, TURNSTILE_ORIGIN } from './headers.js';

describe('securityHeaders', () => {
  const headers = (options = {}) => Object.fromEntries(securityHeaders({ supabaseUrl: 'https://abc.supabase.co/', ...options }).map((h) => [h.key, h.value]));

  it('sends the baseline, with the CSP report-only by default', () => {
    const h = headers();
    expect(h['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Content-Security-Policy-Report-Only']).toBeDefined();
    expect(h['Content-Security-Policy']).toBeUndefined();
    expect(headers({ cspMode: 'enforce' })['Content-Security-Policy']).toBeDefined();
  });

  it('allows Supabase, its realtime socket and Turnstile, and nothing wider', () => {
    const csp = buildContentSecurityPolicy({ supabaseUrl: 'https://abc.supabase.co/rest', reportUri: '/api/csp-report' });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain(`script-src 'self' ${TURNSTILE_ORIGIN}`);
    expect(csp).toContain(`connect-src 'self' https://abc.supabase.co wss://abc.supabase.co ${TURNSTILE_ORIGIN}`);
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).not.toMatch(/\*|'unsafe-eval'/);
  });

  it('adds documented exceptions and refuses a bad Supabase URL', () => {
    expect(buildContentSecurityPolicy({ supabaseUrl: 'https://abc.supabase.co', extra: { scriptSrc: ["'unsafe-inline'"] } })).toContain(
      `script-src 'self' ${TURNSTILE_ORIGIN} 'unsafe-inline'`,
    );
    expect(() => securityHeaders({ supabaseUrl: 'nope' })).toThrow(/supabaseUrl/);
  });
});
