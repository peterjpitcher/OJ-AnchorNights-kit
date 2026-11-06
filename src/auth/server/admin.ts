import { AUTH_MESSAGES, toAppRole, type AppRole, type AuthFormState } from '../shared';
import { BAN_FOREVER, fail } from './actions';
import { raiseAlert } from './config';
import { canonicalEmail, looksLikeEmail, newOperationId, randomToken, sha256Hex } from './crypto';
import { resolveDeps, type AuthDeps } from './deps';
import { errorReason, kitRefusal } from './errors';
import { readSession } from './session';
import type { AnySupabaseClient } from './types';

// Admin-only account management (standard sections 4, 10 and 11; spec S1.3).
// Every action re-checks, on the server, that the caller is an active admin.
// Invites are links the admin copies and sends by text or WhatsApp: there is
// no email service for them. Revocation is by ban (admin.updateUserById with
// ban_duration), never admin.signOut with a user id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PendingInvite {
  id: string;
  email: string;
  role: AppRole;
  status: 'pending' | 'accepting';
  createdAt: string;
  expiresAt: string;
}

export interface StaffMember {
  userId: string;
  email: string | null;
  role: AppRole | 'pending';
  active: boolean;
  deactivatedAt: string | null;
  bannedUntil: string | null;
  lastSignInAt: string | null;
}

export interface AdminActions {
  issueInvite(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  cancelInvite(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  changeRole(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  deactivateUser(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  reactivateUser(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  revokeSessions(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  changeEmail(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  /** Admin pages: live invites. Null when the caller is not an active admin. */
  listInvites(): Promise<PendingInvite[] | null>;
  /** Admin pages: every profile with its Auth state. Null when the caller is not an active admin. */
  listStaff(): Promise<StaffMember[] | null>;
}

export interface AdminDeps extends AuthDeps {
  /** profiles key column: 'id' (Cash Bingo) or 'user_id' (Quiz Night). */
  profileIdColumn: 'id' | 'user_id';
  /**
   * Tells the old and the new address that an admin changed the account's
   * email (standard section 10). Without it the change still happens and the
   * result tells the admin to let both people know.
   */
  notifyEmailChange?: (change: { userId: string; oldEmail: string | null; newEmail: string }) => Promise<void>;
  /** The app's own record of the email (Cash Bingo's profiles.email, for example), updated in the same saga. */
  onEmailChanged?: (change: { userId: string; newEmail: string }) => Promise<void>;
}

export function createAdminActions(input: AdminDeps): AdminActions {
  const d = resolveDeps(input);
  const { config, audit } = d;

  /** The caller, if they are an active admin right now. */
  const gate = async (): Promise<{ ok: true; id: string; email: string | null } | { ok: false; result: AuthFormState }> => {
    let session;
    try {
      session = await readSession(await d.serverClient());
    } catch {
      session = { status: 'unavailable' as const };
    }
    if (session.status === 'unavailable') return { ok: false, result: fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable) };
    if (session.status === 'signed_out') return { ok: false, result: fail('unauthenticated', AUTH_MESSAGES.unauthenticated) };
    if (session.role !== 'admin') return { ok: false, result: fail('unauthorised', AUTH_MESSAGES.unauthorised) };
    return { ok: true, id: session.user.id, email: session.user.email ?? null };
  };

  const targetUser = (formData: FormData): string | null => {
    const value = formData.get('userId');
    return typeof value === 'string' && UUID.test(value) ? value : null;
  };
  const roleFrom = (formData: FormData): AppRole | null => toAppRole(formData.get('role'));

  const emailOf = async (admin: AnySupabaseClient, userId: string): Promise<string | null> => {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      return data.user?.email ?? null;
    } catch {
      return null;
    }
  };

  const ban = async (admin: AnySupabaseClient, userId: string, duration: string): Promise<boolean> => {
    try {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: duration });
      return !error;
    } catch {
      return false;
    }
  };

  return {
    async issueInvite(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const email = canonicalEmail(formData.get('email'));
      const role = roleFrom(formData);
      if (!looksLikeEmail(email)) return fail('validation_failed', AUTH_MESSAGES.invalidEmail, { field: 'email' });
      if (!role) return fail('validation_failed', 'Choose admin or host.', { field: 'role' });

      const token = randomToken();
      let row: { id: string; expires_at: string; cancelled: number } | undefined;
      try {
        const admin = await d.adminClient();
        const { data, error } = await admin.rpc('kit_issue_invite', {
          p_email: email,
          p_role: role,
          p_token_hash: sha256Hex(token),
          p_invited_by: caller.id,
          p_ttl_seconds: INVITE_TTL_SECONDS,
        });
        if (error) {
          const refusal = kitRefusal(error);
          if (refusal === 'kit_invite_account_exists') return fail('validation_failed', 'That email already has an account.', { field: 'email' });
          if (refusal === 'kit_invite_in_progress') return fail('validation_failed', 'That person is accepting an invite right now. Try again in a few minutes.', { field: 'email' });
          throw error;
        }
        row = (Array.isArray(data) ? data[0] : data) as typeof row;
        if (!row?.id) throw new Error('no invite row');
      } catch (error) {
        await audit.log({ event: 'invite_sent', outcome: 'error', reason: errorReason(error, 'issue_failed'), actor: caller, target: { email } });
        return fail('service_unavailable', 'We could not create the invite. Please try again.');
      }

      await audit.log({
        event: 'invite_sent',
        outcome: 'success',
        actor: caller,
        target: { email },
        details: { role, delivery: 'copied_link', replaced: row.cancelled ?? 0 },
      });
      // The token travels in the fragment, which browsers never send to a
      // server, so it stays out of request logs and link-preview fetches.
      return {
        status: 'ok',
        message: 'Invite ready. Copy the link and send it by text or WhatsApp. It works once, for 7 days.',
        data: { inviteUrl: `${config.appUrl}${config.paths.acceptInvite}#t=${token}`, email, role, expiresAt: row.expires_at },
      };
    },

    async cancelInvite(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const id = formData.get('inviteId');
      if (typeof id !== 'string' || !UUID.test(id)) return fail('validation_failed', 'That invite was not found.');
      try {
        const admin = await d.adminClient();
        const { data, error } = await admin.rpc('kit_cancel_invite', { p_id: id });
        if (error) throw error;
        if (!data) return fail('validation_failed', 'That invite is no longer pending.');
        await audit.log({ event: 'invite_cancelled', outcome: 'success', actor: caller, target: { email: String(data) } });
        return { status: 'ok', message: 'Invite cancelled. The link no longer works.' };
      } catch (error) {
        await audit.log({ event: 'invite_cancelled', outcome: 'error', reason: errorReason(error, 'cancel_failed'), actor: caller });
        return fail('service_unavailable', 'We could not cancel the invite. Please try again.');
      }
    },

    async changeRole(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const userId = targetUser(formData);
      const role = roleFrom(formData);
      if (!userId || !role) return fail('validation_failed', 'Choose a person and a role.');
      if (userId === caller.id) return fail('validation_failed', 'You cannot change your own role. Ask another admin.');
      try {
        const admin = await d.adminClient();
        const { data, error } = await admin.rpc('kit_set_staff_role', { p_user: userId, p_role: role });
        if (error) {
          if (kitRefusal(error) === 'kit_profile_deactivated') return fail('validation_failed', 'That account is deactivated. Reactivate it instead.');
          if (kitRefusal(error) === 'kit_profile_missing') return fail('validation_failed', 'That account has no profile.');
          throw error;
        }
        // The role is read from the database on every request, so the change applies at once.
        await audit.log({ event: 'role_changed', outcome: 'success', actor: caller, target: { id: userId, email: await emailOf(admin, userId) }, details: { from: String(data ?? ''), to: role } });
        return { status: 'ok', message: `Role changed to ${role}.` };
      } catch (error) {
        await audit.log({ event: 'role_changed', outcome: 'error', reason: errorReason(error, 'change_failed'), actor: caller, target: { id: userId } });
        return fail('service_unavailable', 'We could not change the role. Please try again.');
      }
    },

    // The leaver workflow, in the standard's order: inactive and no role (the
    // active-identity gate ends database access at once), then ban (defence in
    // depth; refresh tokens die), auditing each step.
    async deactivateUser(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const userId = targetUser(formData);
      if (!userId) return fail('validation_failed', 'Choose a person.');
      if (userId === caller.id) return fail('validation_failed', 'You cannot deactivate yourself. Ask another admin.');
      const operationId = newOperationId();
      const admin = await d.adminClient();
      const target = { id: userId, email: await emailOf(admin, userId) };

      try {
        const { error } = await admin.rpc('kit_deactivate_staff', { p_user: userId });
        if (error) {
          if (kitRefusal(error) === 'kit_profile_missing') return fail('validation_failed', 'That account has no profile.');
          throw error;
        }
      } catch (error) {
        await audit.log({ event: 'account_deactivated', outcome: 'error', reason: errorReason(error, 'deactivate_failed'), actor: caller, target, operationId });
        return fail('service_unavailable', 'We could not deactivate the account. Nothing was changed. Please try again.');
      }
      const audited = [await audit.log({ event: 'account_deactivated', outcome: 'success', actor: caller, target, operationId })];

      const banned = await ban(admin, userId, BAN_FOREVER);
      audited.push(await audit.log({ event: 'account_banned', outcome: banned ? 'success' : 'error', actor: caller, target, operationId }));
      if (!banned || audited.includes(false)) {
        await raiseAlert(config, {
          kind: 'offboarding_incomplete',
          severity: 'high',
          message: banned
            ? 'An account was deactivated and banned, but an audit record is missing. Re-run to record it.'
            : 'An account was deactivated (no access now) but the Auth ban failed. Run Deactivate again.',
          details: { userId, operationId },
        });
        return {
          status: 'ok',
          message: banned
            ? 'Account deactivated. One audit record could not be written; it has been flagged.'
            : 'Account deactivated, so it has no access, but the ban did not go through. Run Deactivate again.',
        };
      }
      return { status: 'ok', message: 'Account deactivated and signed out everywhere.' };
    },

    // Rehire: identity and role first, unban last. A partial failure leaves
    // the account unusable, alerts, and can be run again.
    async reactivateUser(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const userId = targetUser(formData);
      const role = roleFrom(formData);
      if (!userId || !role) return fail('validation_failed', 'Choose a person and a role.');
      const operationId = newOperationId();
      const admin = await d.adminClient();
      const target = { id: userId, email: await emailOf(admin, userId) };
      try {
        const { error } = await admin.rpc('kit_reactivate_staff', { p_user: userId, p_role: role });
        if (error) {
          if (kitRefusal(error) === 'kit_profile_missing') return fail('validation_failed', 'That account has no profile.');
          throw error;
        }
      } catch (error) {
        await audit.log({ event: 'account_reactivated', outcome: 'error', reason: errorReason(error, 'reactivate_failed'), actor: caller, target, operationId });
        return fail('service_unavailable', 'We could not reactivate the account. Please try again.');
      }
      await audit.log({ event: 'account_reactivated', outcome: 'success', actor: caller, target, operationId, details: { role } });
      const unbanned = await ban(admin, userId, 'none');
      await audit.log({ event: 'account_unbanned', outcome: unbanned ? 'success' : 'error', actor: caller, target, operationId });
      if (!unbanned) {
        await raiseAlert(config, { kind: 'rehire_incomplete', severity: 'normal', message: 'An account was reactivated but is still banned. Run Reactivate again.', details: { userId, operationId } });
        return fail('service_unavailable', 'The account has its role back but is still banned, so it cannot sign in yet. Run Reactivate again.');
      }
      return { status: 'ok', message: `Account reactivated as ${role}.` };
    },

    // Emergency full revocation: ban then unban at once, so every refresh
    // token dies and sessions end within one JWT lifetime (15 minutes).
    async revokeSessions(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const userId = targetUser(formData);
      if (!userId) return fail('validation_failed', 'Choose a person.');
      const admin = await d.adminClient();
      const target = { id: userId, email: await emailOf(admin, userId) };
      const operationId = newOperationId();
      if (!(await ban(admin, userId, BAN_FOREVER))) {
        await audit.log({ event: 'sessions_revoked', outcome: 'error', reason: 'ban_failed', actor: caller, target, operationId });
        return fail('service_unavailable', 'We could not sign them out. Please try again.');
      }
      const unbanned = await ban(admin, userId, 'none');
      await audit.log({ event: 'sessions_revoked', outcome: unbanned ? 'success' : 'failure', reason: unbanned ? undefined : 'unban_failed', actor: caller, target, operationId });
      if (!unbanned) {
        await raiseAlert(config, { kind: 'revoke_left_banned', severity: 'high', message: 'Sessions were revoked but the account was left banned.', details: { userId, operationId } });
        return { status: 'ok', message: 'Signed out everywhere, but the account is still banned. Use Reactivate to let them back in.' };
      }
      return { status: 'ok', message: 'Signed out on every device within 15 minutes.' };
    },

    // Admin email change, as a re-runnable saga: validate and check it is
    // free, change Auth, change the app's own record, force a fresh sign-in
    // (ban then unban), tell both addresses, audit with one operation id.
    async changeEmail(_previous, formData) {
      const caller = await gate();
      if (!caller.ok) return caller.result;
      const userId = targetUser(formData);
      const newEmail = canonicalEmail(formData.get('email'));
      if (!userId) return fail('validation_failed', 'Choose a person.');
      if (!looksLikeEmail(newEmail)) return fail('validation_failed', AUTH_MESSAGES.invalidEmail, { field: 'email' });
      const operationId = newOperationId();
      const admin = await d.adminClient();
      const oldEmail = await emailOf(admin, userId);
      const target = { id: userId, email: oldEmail };
      if (oldEmail && canonicalEmail(oldEmail) === newEmail) return fail('validation_failed', 'That is already their email.', { field: 'email' });

      try {
        const { error } = await admin.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
        if (error) {
          const taken = /already|exists|registered/i.test(error.message ?? '') || error.code === 'email_exists';
          if (taken) return fail('validation_failed', 'That email already has an account.', { field: 'email' });
          throw error;
        }
      } catch (error) {
        await audit.log({ event: 'email_changed', outcome: 'error', reason: errorReason(error, 'auth_update_failed'), actor: caller, target, operationId });
        return fail('service_unavailable', 'We could not change the email. Nothing was changed. Please try again.');
      }

      const problems: string[] = [];
      if (input.onEmailChanged) {
        try {
          await input.onEmailChanged({ userId, newEmail });
        } catch {
          problems.push('app_record');
        }
      }
      if (!(await ban(admin, userId, BAN_FOREVER)) || !(await ban(admin, userId, 'none'))) problems.push('force_sign_in');
      let notified = false;
      if (input.notifyEmailChange) {
        try {
          await input.notifyEmailChange({ userId, oldEmail, newEmail });
          notified = true;
        } catch {
          problems.push('notify');
        }
      }
      await audit.log({
        event: 'email_changed',
        outcome: problems.length ? 'failure' : 'success',
        reason: problems.length ? problems.join(',') : undefined,
        actor: caller,
        target,
        operationId,
        details: { new_email: newEmail, notified },
      });
      if (problems.length) {
        await raiseAlert(config, { kind: 'email_change_incomplete', severity: 'high', message: `An email change is incomplete (${problems.join(', ')}). Run it again.`, details: { userId, operationId } });
        return { status: 'ok', message: 'The sign-in email is changed, but some steps did not finish and have been flagged. Run it again.' };
      }
      return {
        status: 'ok',
        message: notified
          ? 'Email changed. They must sign in again, and both addresses have been told.'
          : 'Email changed. They must sign in again. Tell them, at both the old and the new address, that it changed.',
      };
    },

    async listInvites() {
      const caller = await gate();
      if (!caller.ok) return null;
      const admin = await d.adminClient();
      const { data, error } = await admin
        .from('invites')
        .select('id, email, role, status, created_at, expires_at')
        .in('status', ['pending', 'accepting'])
        .order('created_at', { ascending: false });
      if (error) throw new Error('Could not read invites.');
      return (data ?? []).map((row: Record<string, string>) => ({
        id: row.id,
        email: row.email,
        role: row.role as AppRole,
        status: row.status as PendingInvite['status'],
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }));
    },

    async listStaff() {
      const caller = await gate();
      if (!caller.ok) return null;
      const admin = await d.adminClient();
      const idColumn = input.profileIdColumn;
      const { data: profiles, error } = await admin.from('profiles').select(`${idColumn}, role, deactivated_at`);
      if (error) throw new Error('Could not read profiles.');
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw new Error('Could not read accounts.');
      const byId = new Map(users.users.map((u) => [u.id, u]));
      const now = Date.now();
      return (profiles ?? []).map((row: Record<string, string | null>) => {
        const userId = String(row[idColumn]);
        const user = byId.get(userId) as (typeof users.users)[number] & { banned_until?: string | null } | undefined;
        const bannedUntil = user?.banned_until ?? null;
        const banned = bannedUntil ? Date.parse(bannedUntil) > now : false;
        const role = toAppRole(row.role) ?? 'pending';
        return {
          userId,
          email: user?.email ?? null,
          role,
          active: role !== 'pending' && !row.deactivated_at && !banned && Boolean(user),
          deactivatedAt: row.deactivated_at ?? null,
          bannedUntil,
          lastSignInAt: user?.last_sign_in_at ?? null,
        };
      });
    },
  };
}

/**
 * Housekeeping for a cron route (protected by the app's CRON_SECRET, never
 * browser-callable): retention and the invite orphan reconciliation.
 */
export function createAuthMaintenance(input: Pick<AuthDeps, 'config' | 'adminClient' | 'auditSink'>): {
  pruneAuthData(): Promise<Record<string, number>>;
  reconcileInvites(): Promise<{ failed: number; usersDeleted: number; problems: number }>;
} {
  const d = resolveDeps({ ...input, serverClient: async () => { throw new Error('not used'); }, cookies: async () => { throw new Error('not used'); }, headers: async () => { throw new Error('not used'); } });
  return {
    async pruneAuthData() {
      const admin = await d.adminClient();
      const { data, error } = await admin.rpc('kit_prune_auth_data');
      if (error) throw new Error(`prune failed: ${error.code ?? 'unknown'}`);
      return data as Record<string, number>;
    },
    async reconcileInvites() {
      const admin = await d.adminClient();
      const { data, error } = await admin.rpc('kit_stale_invites', { p_older_than_seconds: 900 });
      if (error) throw new Error(`stale invite read failed: ${error.code ?? 'unknown'}`);
      let failed = 0;
      let usersDeleted = 0;
      let problems = 0;
      for (const row of (data ?? []) as { id: string; attempt_id: string; user_id: string | null; email: string }[]) {
        if (row.user_id) {
          // Only a user that is still banned was never switched on; leave anyone else alone.
          const { data: found } = await admin.auth.admin.getUserById(row.user_id);
          const until = (found.user as { banned_until?: string | null } | null)?.banned_until;
          if (found.user && until && Date.parse(until) > Date.now()) {
            const { error: deleteError } = await admin.auth.admin.deleteUser(row.user_id);
            if (deleteError) {
              problems += 1;
              continue;
            }
            usersDeleted += 1;
            await d.audit.log({ event: 'account_deleted', outcome: 'success', reason: 'invite_reconciliation', target: { id: row.user_id, email: row.email } });
          }
        }
        const { error: failError } = await admin.rpc('kit_fail_invite', { p_id: row.id, p_attempt: row.attempt_id, p_reason: 'reconciled' });
        if (failError) problems += 1;
        else failed += 1;
      }
      if (problems > 0) {
        await raiseAlert(d.config, { kind: 'invite_reconciliation_problems', severity: 'high', message: `Invite reconciliation could not finish ${problems} item(s).` });
      }
      return { failed, usersDeleted, problems };
    },
  };
}
