import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_MESSAGES } from '../shared';
import { createAuthAuditor, supabaseAuditSink } from './audit';
import { defineAuthConfig } from './config';
import { canonicalEmail, emailPseudonym, looksLikeEmail, parseHmacKey, randomToken, safeEqual, sha256Hex, TOKEN_SHAPE } from './crypto';
import { readAuthEnv } from './env';
import { errorReason, isCaptchaError, isProviderRateLimit, isServiceError, kitRefusal } from './errors';
import { createHibpChecker, validatePassword } from './password-policy';
import { memoryRateLimiter, supabaseRateLimiter } from './rate-limit';
import { isSameOriginRequest, requestContext } from './request';
import { captchaTokenFrom, SITEVERIFY_URL, verifyTurnstile } from './turnstile';
import { fakeClient, testConfig } from '../../../test/auth-fakes';
import type { AuthAlert } from './types';

const KEY = `v1:${'k'.repeat(40)}`;

describe('defineAuthConfig', () => {
  const base = { app: 'quiz', environment: 'production', appUrl: 'https://quiz.example.test', auditHmacKey: KEY };

  it('completes the defaults and keeps the origin only', () => {
    const config = defineAuthConfig(base);
    expect(config.appUrl).toBe('https://quiz.example.test');
    expect(config.paths.confirm).toBe('/auth/confirm');
    expect(config.homeForRole).toEqual({ admin: '/', host: '/' });
    expect(config.secureCookies).toBe(true);
  });

  it('allows plain http only on localhost, with insecure cookies there', () => {
    expect(defineAuthConfig({ ...base, appUrl: 'http://localhost:3000' }).secureCookies).toBe(false);
    expect(() => defineAuthConfig({ ...base, appUrl: 'http://quiz.example.test' })).toThrow(/https/);
  });

  it('refuses an app URL with a path, a malformed HMAC key or a recovery path outside /auth', () => {
    expect(() => defineAuthConfig({ ...base, appUrl: 'https://quiz.example.test/app' })).toThrow(/origin only/);
    expect(() => defineAuthConfig({ ...base, appUrl: 'not a url' })).toThrow(/not a URL/);
    expect(() => defineAuthConfig({ ...base, auditHmacKey: 'short' })).toThrow(/AUDIT_HMAC_KEY/);
    expect(() => defineAuthConfig({ ...base, paths: { confirm: '/confirm' } })).toThrow(/under \/auth/);
    expect(() => defineAuthConfig({ ...base, paths: { home: 'https://evil.example' } })).toThrow(/plain path/);
  });

  it('never echoes the HMAC secret in an error', () => {
    try {
      defineAuthConfig({ ...base, auditHmacKey: 'v1:tooshort-secret' });
    } catch (error) {
      expect(String(error)).not.toContain('tooshort-secret');
    }
  });
});

describe('readAuthEnv', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-placeholder',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    NEXT_PUBLIC_APP_URL: 'https://quiz.example.test',
    TURNSTILE_SECRET_KEY: 'turnstile-secret-placeholder',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile-site-placeholder',
    AUDIT_HMAC_KEY: KEY,
  };

  it('accepts a complete set', () => {
    expect(readAuthEnv(env).NEXT_PUBLIC_APP_URL).toBe('https://quiz.example.test');
  });

  it('names each missing or bad variable without its value', () => {
    const run = (): unknown => readAuthEnv({ ...env, AUDIT_HMAC_KEY: 'v1:nope', SUPABASE_SERVICE_ROLE_KEY: undefined, NEXT_PUBLIC_APP_URL: 'https://quiz.example.test/path' });
    expect(run).toThrow(/AUDIT_HMAC_KEY/);
    expect(run).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(run).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(run).not.toThrow(/v1:nope/);
  });
});

describe('crypto helpers', () => {
  it('makes 256-bit base64url tokens and hashes them to 64 hex characters', () => {
    const token = randomToken();
    expect(token).toMatch(TOKEN_SHAPE);
    expect(randomToken()).not.toBe(token);
    expect(sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('canonicalises email and pseudonymises it with the versioned key', () => {
    expect(canonicalEmail('  Host@Example.TEST ')).toBe('host@example.test');
    expect(canonicalEmail(42)).toBe('');
    const key = parseHmacKey(KEY);
    const a = emailPseudonym('Host@Example.test', key);
    expect(a).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(emailPseudonym('host@example.test ', key)).toBe(a);
    expect(emailPseudonym('host@example.test', parseHmacKey(`v2:${'z'.repeat(40)}`))).not.toBe(a);
  });

  it('checks email shape loosely and compares in constant time', () => {
    expect(looksLikeEmail('a@b.co')).toBe(true);
    expect(looksLikeEmail('a@b')).toBe(false);
    expect(looksLikeEmail('a b@c.co')).toBe(false);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('error reading', () => {
  it('tells an outage from a refusal', () => {
    expect(isServiceError({ name: 'AuthRetryableFetchError', status: 0 })).toBe(true);
    expect(isServiceError({ name: 'AuthUnknownError' })).toBe(true);
    expect(isServiceError({ name: 'AuthApiError', status: 500 })).toBe(true);
    expect(isServiceError({ name: 'AuthApiError', status: 503 })).toBe(true);
    expect(isServiceError(new Error('socket hang up'))).toBe(true);
    expect(isServiceError({ name: 'AuthApiError', status: 400, code: 'invalid_credentials' })).toBe(false);
    expect(isServiceError({ name: 'AuthApiError', status: 429 })).toBe(false);
    expect(isServiceError({ name: 'AuthSessionMissingError', status: 400 })).toBe(false);
  });

  it('spots CAPTCHA refusals, provider limits and kit refusals', () => {
    expect(isCaptchaError({ code: 'captcha_failed' })).toBe(true);
    expect(isCaptchaError({ message: 'captcha protection: request disallowed' })).toBe(true);
    expect(isCaptchaError({ code: 'invalid_credentials' })).toBe(false);
    expect(isProviderRateLimit({ status: 429 })).toBe(true);
    expect(isProviderRateLimit({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(kitRefusal({ message: 'ERROR: kit_invite_account_exists' })).toBe('kit_invite_account_exists');
    expect(kitRefusal({ message: 'other' })).toBeNull();
  });

  it('keeps only a short code in an audit reason, never the message', () => {
    expect(errorReason({ code: 'invalid_credentials', message: 'secret input' }, 'x')).toBe('invalid_credentials');
    expect(errorReason({ status: 500, message: 'secret input' }, 'x')).toBe('x_500');
    expect(errorReason({ code: 'has spaces' }, 'x')).toBe('x');
    expect(errorReason(null, 'x')).toBe('x');
  });
});

describe('validatePassword', () => {
  it('applies length in characters and bytes, and nothing about composition', async () => {
    expect(await validatePassword('')).toMatchObject({ ok: false, problem: 'empty' });
    expect(await validatePassword('a'.repeat(11))).toMatchObject({ ok: false, problem: 'too_short', message: PASSWORD_MESSAGES.tooShort });
    expect(await validatePassword('aaaaaaaaaaaa')).toEqual({ ok: true, breachCheck: 'skipped' });
    expect(await validatePassword('a'.repeat(73))).toMatchObject({ ok: false, problem: 'too_long' });
    expect(await validatePassword('😀'.repeat(19))).toMatchObject({ ok: false, problem: 'too_long' });
  });

  it('checks the confirmation and refuses the current password', async () => {
    expect(await validatePassword('a'.repeat(12), { confirmation: 'b'.repeat(12) })).toMatchObject({ ok: false, problem: 'mismatch' });
    expect(await validatePassword('a'.repeat(12), { currentPassword: 'a'.repeat(12) })).toMatchObject({ ok: false, problem: 'same_as_current' });
  });

  it('refuses a breached password and lets one through when the check is unavailable', async () => {
    expect(await validatePassword('a'.repeat(12), { breachCheck: async () => 'breached' })).toMatchObject({ ok: false, problem: 'breached' });
    expect(await validatePassword('a'.repeat(12), { breachCheck: async () => 'unavailable' })).toEqual({ ok: true, breachCheck: 'unavailable' });
    expect(await validatePassword('a'.repeat(12), { breachCheck: async () => 'clean' })).toEqual({ ok: true, breachCheck: 'clean' });
  });

  it('runs no breach check when the length is wrong', async () => {
    const breachCheck = vi.fn(async () => 'clean' as const);
    await validatePassword('short', { breachCheck });
    expect(breachCheck).not.toHaveBeenCalled();
  });
});

describe('the HIBP checker', () => {
  const password = 'password1234';
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();

  it('sends only the 5-character prefix, with padding, and finds the suffix', async () => {
    const fetchImpl = vi.fn(async () => new Response(`0000000000000000000000000000000000A:0\r\n${sha1.slice(5)}:42\r\n`));
    expect(await createHibpChecker({ fetch: fetchImpl as unknown as typeof fetch })(password)).toBe('breached');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(url).not.toContain(sha1.slice(5));
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('treats a padding row (count 0) and a miss as clean', async () => {
    const padded = vi.fn(async () => new Response(`${sha1.slice(5)}:0\r\n`));
    expect(await createHibpChecker({ fetch: padded as unknown as typeof fetch })(password)).toBe('clean');
    const miss = vi.fn(async () => new Response('ABCDEF:3\r\n'));
    expect(await createHibpChecker({ fetch: miss as unknown as typeof fetch })(password)).toBe('clean');
  });

  it('is unavailable on a non-200, a network error or a timeout', async () => {
    const down = vi.fn(async () => new Response('', { status: 503 }));
    expect(await createHibpChecker({ fetch: down as unknown as typeof fetch })(password)).toBe('unavailable');
    const broken = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await createHibpChecker({ fetch: broken as unknown as typeof fetch })(password)).toBe('unavailable');
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    expect(await createHibpChecker({ fetch: hang as unknown as typeof fetch, timeoutMs: 20 })(password)).toBe('unavailable');
  });
});

describe('Turnstile', () => {
  it('reads the token without requiring it (contract A)', () => {
    const form = new FormData();
    expect(captchaTokenFrom(form)).toBeUndefined();
    form.set('cf-turnstile-response', '');
    expect(captchaTokenFrom(form)).toBeUndefined();
    form.set('cf-turnstile-response', 'token-value');
    expect(captchaTokenFrom(form)).toBe('token-value');
  });

  const verify = (body: unknown, init: ResponseInit = {}) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), init));
    return {
      fetchImpl,
      run: () =>
        verifyTurnstile({
          token: 'tok',
          secret: 'secret-placeholder',
          action: 'sign_in',
          hostnames: ['quiz.example.test'],
          remoteIp: '203.0.113.7',
          fetch: fetchImpl as unknown as typeof fetch,
        }),
    };
  };

  it('passes only with success, the right action and an allowed hostname (contract B)', async () => {
    const ok = verify({ success: true, action: 'sign_in', hostname: 'quiz.example.test' });
    expect(await ok.run()).toEqual({ ok: true });
    const [url, init] = ok.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    expect(String(init.body)).toContain('remoteip=203.0.113.7');
    expect(await verify({ success: true, action: 'other', hostname: 'quiz.example.test' }).run()).toEqual({ ok: false, reason: 'action_mismatch' });
    expect(await verify({ success: true, action: 'sign_in', hostname: 'evil.example' }).run()).toEqual({ ok: false, reason: 'hostname_mismatch' });
    expect(await verify({ success: false, 'error-codes': ['timeout-or-duplicate'] }).run()).toEqual({ ok: false, reason: 'duplicate' });
    expect(await verify({ success: false, 'error-codes': ['invalid-input-response'] }).run()).toEqual({ ok: false, reason: 'invalid' });
    expect(await verify({}, { status: 500 }).run()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('fails closed with no token or on a timeout', async () => {
    expect(await verifyTurnstile({ token: undefined, secret: 's', action: 'a', hostnames: [] })).toEqual({ ok: false, reason: 'missing' });
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    expect(
      await verifyTurnstile({ token: 't', secret: 's', action: 'a', hostnames: ['h'], fetch: hang as unknown as typeof fetch, timeoutMs: 20 }),
    ).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('the memory limiter', () => {
  const at = { now: 0 };
  const clock = (): number => at.now;
  const input = (emailHmac: string | null, ip: string | null) => ({ scope: 'sign_in' as const, emailHmac, ip });

  it('blocks the 11th failure for one email and IP, and a success clears it', async () => {
    at.now = 1_000_000;
    const limiter = memoryRateLimiter(clock);
    for (let i = 0; i < 10; i += 1) {
      expect(await limiter.check(input('e1', 'ip1'))).toBe(0);
      await limiter.record({ ...input('e1', 'ip1'), outcome: 'failure' });
    }
    expect(await limiter.check(input('e1', 'ip1'))).toBeGreaterThan(0);
    await limiter.record({ ...input('e1', 'ip1'), outcome: 'success' });
    at.now += 1;
    expect(await limiter.check(input('e1', 'ip1'))).toBe(0);
  });

  it('counts 20 per email across IPs and 50 per IP across emails; a success never clears the IP', async () => {
    at.now = 2_000_000;
    const limiter = memoryRateLimiter(clock);
    for (let i = 0; i < 20; i += 1) await limiter.record({ ...input('e2', `ip-${i}`), outcome: 'failure' });
    expect(await limiter.check(input('e2', 'fresh-ip'))).toBeGreaterThan(0);

    for (let i = 0; i < 50; i += 1) await limiter.record({ ...input(`e-${i}`, 'shared-ip'), outcome: 'failure' });
    expect(await limiter.check(input('new-email', 'shared-ip'))).toBeGreaterThan(0);
    await limiter.record({ ...input('new-email', 'shared-ip'), outcome: 'success' });
    expect(await limiter.check(input('new-email', 'shared-ip'))).toBeGreaterThan(0);
  });

  it('forgets failures after 15 minutes', async () => {
    at.now = 3_000_000;
    const limiter = memoryRateLimiter(clock);
    for (let i = 0; i < 10; i += 1) await limiter.record({ ...input('e3', 'ip3'), outcome: 'failure' });
    expect(await limiter.check(input('e3', 'ip3'))).toBeGreaterThan(0);
    at.now += 15 * 60 * 1000 + 1;
    expect(await limiter.check(input('e3', 'ip3'))).toBe(0);
  });

  it('allows one reset request per address a minute', async () => {
    at.now = 4_000_000;
    const limiter = memoryRateLimiter(clock);
    const reset = { scope: 'password_reset' as const, emailHmac: 'e4', ip: 'ip4' };
    expect(await limiter.check(reset)).toBe(0);
    await limiter.record({ ...reset, outcome: 'success' });
    expect(await limiter.check(reset)).toBeGreaterThan(0);
    at.now += 61_000;
    expect(await limiter.check(reset)).toBe(0);
  });
});

describe('the database limiter', () => {
  it('asks kit_auth_throttle and throws when it cannot (the caller fails open)', async () => {
    const admin = fakeClient();
    admin.onRpc('kit_auth_throttle', () => ({ data: 37.2, error: null }));
    const limiter = supabaseRateLimiter(() => admin.client);
    expect(await limiter.check({ scope: 'sign_in', emailHmac: 'v1:x', ip: '1.2.3.4' })).toBe(38);
    expect(admin.rpcCalls()[0]).toEqual({ name: 'kit_auth_throttle', args: { p_scope: 'sign_in', p_email_hmac: 'v1:x', p_ip: '1.2.3.4' } });
    admin.onRpc('kit_auth_throttle', () => ({ data: null, error: { code: '57014' } }));
    await expect(limiter.check({ scope: 'sign_in', emailHmac: null, ip: null })).rejects.toThrow(/throttle/);
  });
});

describe('the auditor', () => {
  it('stores a pre-auth email only as its pseudonym', async () => {
    const rows: unknown[] = [];
    const auditor = createAuthAuditor(testConfig(), async (row) => {
      rows.push(row);
    });
    expect(await auditor.log({ event: 'sign_in', outcome: 'failure', subjectEmail: 'Host@Example.test', ip: '203.0.113.7' })).toBe(true);
    const row = rows[0] as Record<string, unknown>;
    expect(row.email_hmac).toBe(auditor.pseudonymise('host@example.test'));
    expect(JSON.stringify(row)).not.toMatch(/example\.test/i);
    expect(row).toMatchObject({ app: 'kit-test', environment: 'test', event: 'sign_in', outcome: 'failure', ip: '203.0.113.7' });
  });

  it('never throws when the write fails, and raises an alert instead', async () => {
    const alerts: AuthAlert[] = [];
    const auditor = createAuthAuditor(testConfig(alerts), async () => {
      throw new Error('db down');
    });
    expect(await auditor.log({ event: 'sign_out', outcome: 'success' })).toBe(false);
    expect(alerts.map((a) => a.kind)).toEqual(['auth_audit_write_failed']);
  });

  it('writes to auth_audit through the admin client by default', async () => {
    const admin = fakeClient();
    const insert = vi.fn(async () => ({ error: { code: '42501' } }));
    admin.from.mockReturnValue({ insert });
    await expect(supabaseAuditSink(() => admin.client)({} as never)).rejects.toThrow('audit insert failed: 42501');
    expect(admin.from).toHaveBeenCalledWith('auth_audit');
  });
});

describe('request helpers', () => {
  const bag = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

  it('takes the platform IP and trims the user agent', () => {
    expect(requestContext(bag({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toMatchObject({ ip: '203.0.113.7' });
    expect(requestContext(bag({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toMatchObject({ ip: '198.51.100.1' });
    expect(requestContext(bag({}))).toEqual({ ip: null, userAgent: null });
    expect(requestContext(bag({ 'user-agent': 'x'.repeat(1000) })).userAgent).toHaveLength(400);
  });

  it('checks Origin, then Sec-Fetch-Site', () => {
    const allowed = ['https://quiz.example.test'];
    expect(isSameOriginRequest(bag({ origin: 'https://quiz.example.test' }), allowed)).toBe(true);
    expect(isSameOriginRequest(bag({ origin: 'https://evil.example' }), allowed)).toBe(false);
    expect(isSameOriginRequest(bag({ 'sec-fetch-site': 'same-origin' }), allowed)).toBe(true);
    expect(isSameOriginRequest(bag({ 'sec-fetch-site': 'cross-site' }), allowed)).toBe(false);
    expect(isSameOriginRequest(bag({}), allowed)).toBe(false);
  });
});
