import type { User } from '@supabase/supabase-js';
import { AUTH_MESSAGES, roleSatisfies, type AppRole, type AuthFormState } from '../shared';
import type { AuthConfig } from './config';
import { readSession, type SessionState } from './session';
import type { AnySupabaseClient } from './types';

// The verified-auth helpers for pages, Server Actions and Route Handlers
// (standard section 9; spec S1.2). Each re-reads the user and role on the
// server, so hiding a button is never the control, and an auth outage is
// reported as one rather than as "signed out".

export class AuthServiceUnavailableError extends Error {
  constructor() {
    super('The sign-in service is unavailable.');
    this.name = 'AuthServiceUnavailableError';
  }
}

export interface AuthHelpersDeps {
  config: AuthConfig;
  serverClient: () => Promise<AnySupabaseClient>;
  /** Next's `redirect` from next/navigation. */
  redirect: (path: string) => never;
}

export type Authorised = { ok: true; user: User; role: AppRole };

export interface AuthHelpers {
  getSessionState(): Promise<SessionState>;
  /** The verified user or null. Throws AuthServiceUnavailableError on an outage. */
  getCurrentUser(): Promise<User | null>;
  /** The role the user may act with now, or null (signed out, pending, deactivated, banned). Throws on an outage. */
  getCurrentRole(): Promise<AppRole | null>;
  /** Pages: the user, or a redirect to sign-in. */
  requireAuth(): Promise<User>;
  /** Pages: the user and role, or a redirect (sign-in, pending, or the role's own home). */
  requireRole(allowed: readonly AppRole[]): Promise<{ user: User; role: AppRole }>;
  /** Server Actions: the typed result instead of a throw. */
  authorise(allowed: readonly AppRole[]): Promise<Authorised | { ok: false; result: AuthFormState }>;
  /** Route Handlers: JSON 401, 403 or 503 with no-store. */
  authoriseRoute(allowed: readonly AppRole[]): Promise<Authorised | { ok: false; response: Response }>;
}

export function createAuthHelpers(deps: AuthHelpersDeps): AuthHelpers {
  const { config, redirect } = deps;
  const state = async (): Promise<SessionState> => {
    try {
      return await readSession(await deps.serverClient());
    } catch {
      return { status: 'unavailable' };
    }
  };

  return {
    getSessionState: state,
    async getCurrentUser() {
      const s = await state();
      if (s.status === 'unavailable') throw new AuthServiceUnavailableError();
      return s.status === 'signed_in' ? s.user : null;
    },
    async getCurrentRole() {
      const s = await state();
      if (s.status === 'unavailable') throw new AuthServiceUnavailableError();
      return s.status === 'signed_in' ? s.role : null;
    },
    async requireAuth() {
      const s = await state();
      if (s.status === 'unavailable') throw new AuthServiceUnavailableError();
      if (s.status === 'signed_out') redirect(config.paths.signIn);
      return (s as Extract<SessionState, { status: 'signed_in' }>).user;
    },
    async requireRole(allowed) {
      const s = await state();
      if (s.status === 'unavailable') throw new AuthServiceUnavailableError();
      if (s.status === 'signed_out') redirect(config.paths.signIn);
      const signedIn = s as Extract<SessionState, { status: 'signed_in' }>;
      if (!signedIn.role) redirect(config.paths.pending);
      if (!roleSatisfies(signedIn.role, allowed)) redirect(config.homeForRole[signedIn.role as AppRole]);
      return { user: signedIn.user, role: signedIn.role as AppRole };
    },
    async authorise(allowed) {
      const s = await state();
      if (s.status === 'unavailable') return { ok: false, result: { status: 'error', code: 'service_unavailable', error: AUTH_MESSAGES.serviceUnavailable } };
      if (s.status === 'signed_out') return { ok: false, result: { status: 'error', code: 'unauthenticated', error: AUTH_MESSAGES.unauthenticated } };
      if (!roleSatisfies(s.role, allowed)) return { ok: false, result: { status: 'error', code: 'unauthorised', error: AUTH_MESSAGES.unauthorised } };
      return { ok: true, user: s.user, role: s.role as AppRole };
    },
    async authoriseRoute(allowed) {
      const s = await state();
      const json = (status: number, error: string): Response =>
        new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      if (s.status === 'unavailable') return { ok: false, response: json(503, 'service_unavailable') };
      if (s.status === 'signed_out') return { ok: false, response: json(401, 'unauthenticated') };
      if (!roleSatisfies(s.role, allowed)) return { ok: false, response: json(403, 'unauthorised') };
      return { ok: true, user: s.user, role: s.role as AppRole };
    },
  };
}
