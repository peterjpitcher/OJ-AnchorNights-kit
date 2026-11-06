import type { User } from '@supabase/supabase-js';
import { toAppRole, type AppRole, type StoredRole } from '../shared';
import { isServiceError } from './errors';
import type { AnySupabaseClient } from './types';

export type SessionState =
  | { status: 'signed_out' }
  | { status: 'unavailable' }
  | { status: 'signed_in'; user: User; storedRole: StoredRole | null; role: AppRole | null };

function bannedNow(user: User, now: number): boolean {
  const until = (user as User & { banned_until?: string | null }).banned_until;
  if (!until) return false;
  const ms = Date.parse(until);
  return Number.isFinite(ms) && ms > now;
}

/**
 * The verified user and the role they may act with now, from the server
 * client (cookie session). getUser() checks the token with the Auth server;
 * getSession() alone is never used. The role comes from current_staff_role(),
 * which applies the active-identity rule in the database: a pending,
 * deactivated, banned or deleted account has no role. An outage at either
 * step is 'unavailable', never 'signed_out'.
 */
export async function readSession(client: AnySupabaseClient, now: number = Date.now()): Promise<SessionState> {
  let user: User | null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return isServiceError(error) ? { status: 'unavailable' } : { status: 'signed_out' };
    user = data.user;
  } catch {
    return { status: 'unavailable' };
  }
  if (!user) return { status: 'signed_out' };

  try {
    const { data, error } = await client.rpc('current_staff_role');
    if (error) return { status: 'unavailable' };
    const stored = data === 'admin' || data === 'host' || data === 'pending' ? (data as StoredRole) : null;
    const role = bannedNow(user, now) ? null : toAppRole(stored);
    return { status: 'signed_in', user, storedRole: stored, role };
  } catch {
    return { status: 'unavailable' };
  }
}
