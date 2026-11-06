import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { createAuthProxy, type AuthProxyOptions } from './proxy';

type GetUser = () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;

interface Fake {
  getUser?: GetUser;
  role?: () => Promise<{ data: unknown; error: unknown }>;
  /** Cookies the "refresh" writes. */
  refreshed?: { name: string; value: string }[];
}

function proxyWith(fake: Fake, options: Partial<AuthProxyOptions> = {}) {
  const createClient = vi.fn((_url: string, _key: string, config: { cookies: { setAll(c: { name: string; value: string; options?: object }[]): void } }) => ({
    auth: {
      getUser: async () => {
        if (fake.refreshed) config.cookies.setAll(fake.refreshed.map((c) => ({ ...c, options: { path: '/', httpOnly: true } })));
        return (fake.getUser ?? (async () => ({ data: { user: { id: 'u1' } }, error: null })))();
      },
    },
    rpc: vi.fn(async () => (fake.role ?? (async () => ({ data: 'host', error: null })))()),
  }));
  const proxy = createAuthProxy({
    supabaseUrl: 'https://abc.supabase.co',
    supabaseKey: 'public-key-placeholder',
    routes: [
      { prefix: '/admin', roles: ['admin'] },
      { prefix: '/host', roles: ['admin', 'host'] },
      { prefix: '/api/admin', roles: ['admin'] },
    ],
    homeForRole: { admin: '/admin', host: '/host' },
    createClient: createClient as unknown as AuthProxyOptions['createClient'],
    ...options,
  });
  return { proxy, createClient };
}

const request = (path: string, cookies: Record<string, string> = { 'sb-abc-auth-token': 'x' }): NextRequest => {
  const req = new NextRequest(`https://quiz.example.test${path}`);
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
};

const signedOut: GetUser = async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } });
const down: GetUser = async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } });

describe('createAuthProxy', () => {
  it('lets the right role through with private, no-store', async () => {
    const res = await proxyWith({ role: async () => ({ data: 'admin', error: null }) }).proxy(request('/admin/staff'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('sends a signed-out visitor to sign in with a safe next', async () => {
    const res = await proxyWith({ getUser: signedOut }).proxy(request('/host/sessions?x=1'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://quiz.example.test/login?next=%2Fhost%2Fsessions%3Fx%3D1');
  });

  it('sends the wrong role to their own home, and no role to the pending screen', async () => {
    const host = await proxyWith({}).proxy(request('/admin'));
    expect(host.headers.get('location')).toBe('https://quiz.example.test/host');
    const pending = await proxyWith({ role: async () => ({ data: null, error: null }) }).proxy(request('/host'));
    expect(pending.headers.get('location')).toBe('https://quiz.example.test/pending');
  });

  it('matches whole segments only', async () => {
    const { proxy, createClient } = proxyWith({ getUser: signedOut });
    const res = await proxy(request('/administrator', {}));
    expect(res.headers.get('location')).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('answers API routes with JSON 401 and 403, never a redirect', async () => {
    const out = await proxyWith({ getUser: signedOut }).proxy(request('/api/admin/invites'));
    expect(out.status).toBe(401);
    expect(await out.json()).toEqual({ error: 'unauthenticated' });
    const host = await proxyWith({}).proxy(request('/api/admin/invites'));
    expect(host.status).toBe(403);
    expect(host.headers.get('Cache-Control')).toMatch(/no-store/);
  });

  it('fails closed with a 503 when Auth or the role lookup is down, never a sign-in loop', async () => {
    expect((await proxyWith({ getUser: down }).proxy(request('/host'))).status).toBe(503);
    expect((await proxyWith({ role: async () => ({ data: null, error: { code: '57P01' } }) }).proxy(request('/host'))).status).toBe(503);
    const thrown = await proxyWith({
      getUser: async () => {
        throw new TypeError('fetch failed');
      },
    }).proxy(request('/api/admin/x'));
    expect(thrown.status).toBe(503);
    expect(await thrown.json()).toEqual({ error: 'service_unavailable' });
  });

  it('carries refreshed session cookies onto a redirect', async () => {
    const res = await proxyWith({ refreshed: [{ name: 'sb-abc-auth-token', value: 'fresh' }] }).proxy(request('/admin'));
    expect(res.status).toBe(307);
    const cookie = res.cookies.get('sb-abc-auth-token');
    expect(cookie?.value).toBe('fresh');
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
  });

  it('moves a signed-in user off the sign-in page, and a staff member off the pending page', async () => {
    expect((await proxyWith({}).proxy(request('/login'))).headers.get('location')).toBe('https://quiz.example.test/host');
    expect((await proxyWith({ role: async () => ({ data: 'pending', error: null }) }).proxy(request('/login'))).headers.get('location')).toBe(
      'https://quiz.example.test/pending',
    );
    expect((await proxyWith({}).proxy(request('/pending'))).headers.get('location')).toBe('https://quiz.example.test/host');
    expect((await proxyWith({ getUser: signedOut }).proxy(request('/pending'))).headers.get('location')).toBe('https://quiz.example.test/login');
  });

  it('marks auth pages no-store and token pages no-referrer', async () => {
    const { proxy } = proxyWith({ getUser: signedOut });
    const login = await proxy(request('/login', {}));
    expect(login.headers.get('Cache-Control')).toBe('no-store');
    expect(login.headers.get('Referrer-Policy')).toBeNull();
    for (const path of ['/auth/confirm', '/auth/reset-password', '/invite']) {
      const res = await proxy(request(path, {}));
      expect(res.headers.get('Cache-Control'), path).toBe('no-store');
      expect(res.headers.get('Referrer-Policy'), path).toBe('no-referrer');
    }
  });
});
