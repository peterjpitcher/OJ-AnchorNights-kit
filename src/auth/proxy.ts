// @anchor-nights/kit/auth/proxy: the session adapter for Next 16's proxy.ts
// (standard sections 2 and 3; spec S1.8).
//
//   * Refreshes the Supabase session with getUser() (never getSession() alone)
//     and carries the refreshed cookies onto every response, redirects
//     included (Cash Bingo's lesson: a redirect without them logged hosts out
//     mid-shift).
//   * Protects routes by role, segment-bounded: '/admin' covers '/admin' and
//     '/admin/x', not '/administrator'. The role comes from
//     current_staff_role(), so a pending, deactivated or banned account has
//     none and is sent to the pending screen.
//   * Fails closed: if Auth or the role lookup is down, a protected request
//     gets a 503, never a silent "signed out" redirect loop.
//   * Auth pages get Cache-Control: no-store; the token pages (confirm, reset,
//     invite) also Referrer-Policy: no-referrer.
//
// This is the one permitted middleware adapter: public key, request and
// response cookie plumbing, nothing else.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_AUTH_PATHS, roleSatisfies, safeNextPath, toAppRole, type AppRole, type AuthPaths } from './shared';

export interface ProtectedRoute {
  /** A path prefix, matched on whole segments. */
  prefix: string;
  /** Who may open it. */
  roles: readonly AppRole[];
}

export interface AuthProxyOptions {
  /** NEXT_PUBLIC_SUPABASE_URL */
  supabaseUrl: string;
  /** NEXT_PUBLIC_SUPABASE_ANON_KEY (the public key) */
  supabaseKey: string;
  routes: readonly ProtectedRoute[];
  paths?: Partial<AuthPaths>;
  homeForRole?: Partial<Record<AppRole, string>>;
  /** Test seam: defaults to @supabase/ssr's createServerClient. */
  createClient?: typeof createServerClient;
}

interface MaybeError {
  name?: string;
  status?: number;
}

function isOutage(error: unknown): boolean {
  const e = (typeof error === 'object' && error !== null ? error : {}) as MaybeError;
  if (e.name === 'AuthSessionMissingError') return false;
  if (e.name === 'AuthRetryableFetchError' || e.name === 'AuthUnknownError') return true;
  return typeof e.status === 'number' ? e.status === 0 || e.status >= 500 : true;
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

export function createAuthProxy(options: AuthProxyOptions): (request: NextRequest) => Promise<NextResponse> {
  const paths: AuthPaths = { ...DEFAULT_AUTH_PATHS, ...options.paths };
  const home = (role: AppRole): string => options.homeForRole?.[role] ?? paths.home;
  const makeClient = options.createClient ?? createServerClient;
  const authPages = [paths.signIn, paths.pending, paths.forgotPassword, paths.confirm, paths.resetPassword, paths.acceptInvite];
  const tokenPages = [paths.confirm, paths.resetPassword, paths.acceptInvite];

  return async function authProxy(request: NextRequest): Promise<NextResponse> {
    const { pathname, search } = request.nextUrl;
    const secure = request.nextUrl.protocol === 'https:';
    const route = options.routes.find((r) => matches(pathname, r.prefix));
    const isApi = matches(pathname, '/api');
    const onSignIn = pathname === paths.signIn;
    const onPending = pathname === paths.pending;
    const isAuthPage = authPages.some((p) => matches(pathname, p)) || matches(pathname, '/auth');
    const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));

    let response = NextResponse.next({ request });

    const finish = (res: NextResponse): NextResponse => {
      if (isAuthPage) res.headers.set('Cache-Control', 'no-store');
      else if (route) res.headers.set('Cache-Control', 'private, no-store');
      if (tokenPages.some((p) => matches(pathname, p))) res.headers.set('Referrer-Policy', 'no-referrer');
      return res;
    };
    const redirect = (target: string): NextResponse => {
      const url = request.nextUrl.clone();
      const [targetPath, targetQuery] = target.split('?');
      url.pathname = targetPath;
      url.search = targetQuery ? `?${targetQuery}` : '';
      const res = NextResponse.redirect(url);
      // Carry the refreshed session cookies onto the redirect.
      response.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
      return finish(res);
    };
    const unavailable = (): NextResponse =>
      finish(
        isApi
          ? NextResponse.json({ error: 'service_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } })
          : new NextResponse('Sign-in is unavailable right now. Please try again in a minute.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' },
            }),
      );

    if (!route && !onSignIn && !onPending && !hasSessionCookie) return finish(response);

    const supabase = makeClient(options.supabaseUrl, options.supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
            response.cookies.set(name, value, { ...cookieOptions, sameSite: cookieOptions?.sameSite ?? 'lax', secure: cookieOptions?.secure ?? secure }),
          );
        },
      },
    });

    let userId: string | null = null;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error && isOutage(error)) return route || onSignIn || onPending ? unavailable() : finish(response);
      userId = data?.user?.id ?? null;
    } catch {
      return route || onSignIn || onPending ? unavailable() : finish(response);
    }

    let role: AppRole | null = null;
    if (userId && (route || onSignIn || onPending)) {
      try {
        const { data, error } = await supabase.rpc('current_staff_role');
        if (error) return unavailable();
        role = toAppRole(data);
      } catch {
        return unavailable();
      }
    }

    if (route) {
      if (!userId) {
        if (isApi) return finish(NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }));
        const next = safeNextPath(`${pathname}${search}`, '', paths);
        return redirect(next ? `${paths.signIn}?next=${encodeURIComponent(next)}` : paths.signIn);
      }
      if (!roleSatisfies(role, route.roles)) {
        if (isApi) return finish(NextResponse.json({ error: 'unauthorised' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }));
        return redirect(role ? home(role) : paths.pending);
      }
      return finish(response);
    }

    if (onSignIn && userId) return redirect(role ? home(role) : paths.pending);
    if (onPending) {
      if (!userId) return redirect(paths.signIn);
      if (role) return redirect(home(role));
    }
    return finish(response);
  };
}
