import { AUTH_MESSAGES, safeNextPath, type AuthErrorCode, type AuthFormState } from '../shared';
import { raiseAlert } from './config';
import { canonicalEmail, looksLikeEmail, newOperationId, randomToken, sha256Hex, TOKEN_SHAPE } from './crypto';
import { resolveDeps, type AuthDeps, type ResolvedDeps } from './deps';
import { errorReason, isCaptchaError, isProviderRateLimit, isServiceError } from './errors';
import { validatePassword, type ValidatePasswordOptions } from './password-policy';
import type { ThrottleInput } from './rate-limit';
import { requestContext, type RequestContext } from './request';
import { readSession } from './session';
import { captchaTokenFrom } from './turnstile';
import type { AnySupabaseClient } from './types';

// The public and signed-in auth flows as Server Action bodies (standard
// sections 7, 8, 10, 11 and 12). Each runs on the server only, forwards the
// Turnstile token to Supabase without ever requiring it, audits what it did,
// and fails closed: when a dependency fails the user is told, never shown a
// success that did not happen.

export const RECOVERY_GRANT_TTL_SECONDS = 600;
/** 100 years: a far-future ban, lifted only as the last step of an acceptance or a rehire. */
export const BAN_FOREVER = '876000h';

export function recoveryCookieName(secure: boolean): string {
  return secure ? '__Secure-kit-recovery' : 'kit-recovery';
}

export function fail(code: AuthErrorCode, error: string, extra: { field?: string; offerNewLink?: boolean } = {}): AuthFormState {
  return { status: 'error', code, error, ...extra };
}

function text(formData: FormData, name: string, max = 1000): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function context(d: ResolvedDeps): Promise<RequestContext> {
  try {
    return requestContext(await d.headers());
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** The limiter, failing open with an alert when its store is down (standard section 7). */
async function throttle(d: ResolvedDeps, input: ThrottleInput, ctx: RequestContext): Promise<number> {
  try {
    return await d.limiter.check(input);
  } catch {
    await d.audit.log({ event: 'limiter_unavailable', outcome: 'error', reason: input.scope, ip: ctx.ip });
    await raiseAlert(d.config, {
      kind: 'limiter_unavailable',
      severity: 'normal',
      message: `The ${input.scope} limiter could not be read, so the attempt went ahead (CAPTCHA still applies).`,
    });
    return 0;
  }
}

async function record(d: ResolvedDeps, input: ThrottleInput & { outcome: 'success' | 'failure' }): Promise<void> {
  try {
    await d.limiter.record(input);
  } catch {
    // The database limiter records nothing here; a memory one cannot fail.
  }
}

/** The password policy plus the audit event when the breach check could not run. */
async function checkPassword(
  d: ResolvedDeps,
  password: string,
  options: Omit<ValidatePasswordOptions, 'breachCheck'>,
  ctx: RequestContext,
  actor?: { id: string; email?: string | null },
): Promise<AuthFormState | null> {
  const result = await validatePassword(password, { ...options, breachCheck: d.breachCheck });
  if (!result.ok) {
    const field = result.problem === 'mismatch' ? 'confirmPassword' : 'password';
    return fail('validation_failed', result.message, { field });
  }
  if (result.breachCheck === 'unavailable') {
    await d.audit.log({ event: 'breach_check_unavailable', outcome: 'error', actor, ip: ctx.ip });
  }
  return null;
}

/** signOut({ scope: 'others' }) with one retry. False when both attempts failed. */
async function signOutOthers(client: AnySupabaseClient): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await client.auth.signOut({ scope: 'others' });
      if (!error) return true;
    } catch {
      // try once more
    }
  }
  return false;
}

export interface AuthActions {
  signIn(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  signOut(): Promise<AuthFormState>;
  requestPasswordReset(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  confirmRecovery(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  resetPassword(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  changePassword(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
  acceptInvite(previous: AuthFormState, formData: FormData): Promise<AuthFormState>;
}

/**
 * The flows, bound to the app's clients. An app exposes each one from its own
 * 'use server' file (Next requires the directive in the app):
 *
 *   'use server';
 *   const auth = createAuthActions({ config, serverClient: createClient, adminClient: createAdminClient, cookies, headers });
 *   export async function signIn(prev: AuthFormState, fd: FormData) { return auth.signIn(prev, fd); }
 */
export function createAuthActions(input: AuthDeps): AuthActions {
  const d = resolveDeps(input);
  const { config, audit } = d;
  const { paths } = config;
  const cookieName = recoveryCookieName(config.secureCookies);

  return {
    // ------------------------------------------------------------ sign in
    async signIn(_previous, formData) {
      const email = canonicalEmail(formData.get('email'));
      const password = text(formData, 'password', 4096);
      if (!email || !password) return fail('validation_failed', AUTH_MESSAGES.signInMissing);
      const captchaToken = captchaTokenFrom(formData);
      const ctx = await context(d);
      const emailHmac = audit.pseudonymise(email);
      const limit = { scope: 'sign_in' as const, emailHmac, ip: ctx.ip };

      if ((await throttle(d, limit, ctx)) > 0) {
        await audit.log({ event: 'sign_in', outcome: 'denied', reason: 'rate_limited', subjectEmail: email, ip: ctx.ip, userAgent: ctx.userAgent });
        return fail('rate_limited', AUTH_MESSAGES.signInFailed);
      }

      let client: AnySupabaseClient;
      let result: Awaited<ReturnType<AnySupabaseClient['auth']['signInWithPassword']>>;
      try {
        client = await d.serverClient();
        result = await client.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
      } catch {
        await audit.log({ event: 'sign_in', outcome: 'error', reason: 'service_unavailable', subjectEmail: email, ip: ctx.ip, userAgent: ctx.userAgent });
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }

      const { data, error } = result;
      if (error || !data.user) {
        if (error && isServiceError(error)) {
          await audit.log({ event: 'sign_in', outcome: 'error', reason: errorReason(error, 'service_unavailable'), subjectEmail: email, ip: ctx.ip, userAgent: ctx.userAgent });
          return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
        }
        await audit.log({ event: 'sign_in', outcome: 'failure', reason: errorReason(error, 'invalid_credentials'), subjectEmail: email, ip: ctx.ip, userAgent: ctx.userAgent });
        await record(d, { ...limit, outcome: 'failure' });
        if (error && isCaptchaError(error)) return fail('captcha_failed', AUTH_MESSAGES.captchaFailed);
        return fail('validation_failed', AUTH_MESSAGES.signInFailed);
      }

      const user = data.user;
      await record(d, { ...limit, outcome: 'success' });
      await audit.log({
        event: 'sign_in',
        outcome: 'success',
        actor: { id: user.id, email: user.email ?? email },
        subjectEmail: email,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        details: { captcha_token: Boolean(captchaToken) },
      });
      if (!captchaToken) {
        // Supabase let a sign-in through with no token, so its CAPTCHA
        // enforcement is off (break-glass, or a mistake). Standard section 8.
        await audit.log({ event: 'captcha_bypass_detected', outcome: 'success', actor: { id: user.id, email: user.email ?? email }, ip: ctx.ip });
        await raiseAlert(config, {
          kind: 'captcha_bypass_detected',
          severity: 'high',
          message: 'A sign-in succeeded with no CAPTCHA token, so Supabase CAPTCHA enforcement is off. Switch it back on within 24 hours.',
        });
      }

      // A signed-in account with no role goes to the pending screen. Staff go
      // where they asked (validated) or to their home. If the role cannot be
      // read right now, the proxy decides on the next request.
      const session = await readSession(client);
      if (session.status === 'signed_in' && !session.role) return { status: 'ok', redirectTo: paths.pending };
      const home = session.status === 'signed_in' && session.role ? config.homeForRole[session.role] : paths.home;
      return { status: 'ok', redirectTo: safeNextPath(text(formData, 'next', 600), home, paths) };
    },

    // ------------------------------------------------------------ sign out
    async signOut() {
      const ctx = await context(d);
      let actor: { id: string; email?: string | null } | undefined;
      try {
        const client = await d.serverClient();
        const { data } = await client.auth.getUser();
        if (data.user) actor = { id: data.user.id, email: data.user.email };
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error && error.name !== 'AuthSessionMissingError') throw error;
      } catch (error) {
        await audit.log({ event: 'sign_out', outcome: 'error', reason: errorReason(error, 'sign_out_failed'), actor, ip: ctx.ip });
        return fail('service_unavailable', AUTH_MESSAGES.signOutFailed);
      }
      await audit.log({ event: 'sign_out', outcome: 'success', actor, ip: ctx.ip, userAgent: ctx.userAgent });
      return { status: 'ok', redirectTo: paths.signIn };
    },

    // ------------------------------------------------------------ forgot password
    async requestPasswordReset(_previous, formData) {
      const email = canonicalEmail(formData.get('email'));
      if (!looksLikeEmail(email)) return fail('validation_failed', AUTH_MESSAGES.invalidEmail, { field: 'email' });
      const captchaToken = captchaTokenFrom(formData);
      const ctx = await context(d);
      const emailHmac = audit.pseudonymise(email);
      const limit = { scope: 'password_reset' as const, emailHmac, ip: ctx.ip };
      const sent: AuthFormState = { status: 'ok', message: AUTH_MESSAGES.resetSent };

      if ((await throttle(d, limit, ctx)) > 0) {
        // Generic success: a throttled request must read like any other.
        await audit.log({ event: 'password_reset_requested', outcome: 'denied', reason: 'cooldown', subjectEmail: email, ip: ctx.ip, userAgent: ctx.userAgent });
        return sent;
      }

      try {
        // A new request kills any recovery grant still outstanding for the address.
        const admin = await d.adminClient();
        const { error } = await admin.rpc('kit_invalidate_recovery_grants_for_email', { p_email: email });
        if (error) throw error;
      } catch (error) {
        await audit.log({ event: 'password_reset_requested', outcome: 'error', reason: errorReason(error, 'grant_invalidation_failed'), subjectEmail: email, ip: ctx.ip });
        return fail('service_unavailable', AUTH_MESSAGES.resetUnavailable);
      }

      let error: unknown = null;
      try {
        const client = await d.serverClient();
        ({ error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${config.appUrl}${paths.confirm}`,
          captchaToken,
        }));
      } catch (thrown) {
        error = thrown ?? new Error('reset failed');
      }
      await record(d, { ...limit, outcome: 'success' });

      if (error) {
        if (isCaptchaError(error)) {
          await audit.log({ event: 'password_reset_requested', outcome: 'failure', reason: 'captcha_failed', subjectEmail: email, ip: ctx.ip });
          return fail('captcha_failed', AUTH_MESSAGES.captchaFailed);
        }
        if (isServiceError(error)) {
          // Includes a failed SMTP send: the user must not wait for an email that is not coming.
          await audit.log({ event: 'password_reset_requested', outcome: 'error', reason: errorReason(error, 'service_unavailable'), subjectEmail: email, ip: ctx.ip });
          return fail('service_unavailable', AUTH_MESSAGES.resetUnavailable);
        }
        // Supabase's own limits and refusals: generic, so nothing is revealed about the address.
        await audit.log({ event: 'password_reset_requested', outcome: 'denied', reason: errorReason(error, isProviderRateLimit(error) ? 'provider_rate_limited' : 'refused'), subjectEmail: email, ip: ctx.ip });
        return sent;
      }

      await audit.log({ event: 'password_reset_requested', outcome: 'success', subjectEmail: email, ip: ctx.ip, userAgent: ctx.userAgent, details: { captcha_token: Boolean(captchaToken) } });
      return sent;
    },

    // ------------------------------------------------------------ /auth/confirm (POST)
    async confirmRecovery(_previous, formData) {
      const tokenHash = text(formData, 'token_hash', 400);
      const type = text(formData, 'type', 40);
      // Recovery only (standard section 10): any other token type is refused.
      if (type !== 'recovery' || !/^[A-Za-z0-9_-]{8,300}$/.test(tokenHash)) {
        return fail('invalid_link', AUTH_MESSAGES.recoveryLinkInvalid, { offerNewLink: true });
      }
      const ctx = await context(d);

      let client: AnySupabaseClient;
      let userId: string;
      let userEmail: string | null | undefined;
      try {
        client = await d.serverClient();
        const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        if (error || !data.user) {
          if (error && isServiceError(error)) return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
          await audit.log({ event: 'password_recovery_confirmed', outcome: 'failure', reason: errorReason(error, 'invalid_link'), ip: ctx.ip });
          return fail('invalid_link', AUTH_MESSAGES.recoveryLinkInvalid, { offerNewLink: true });
        }
        userId = data.user.id;
        userEmail = data.user.email;
      } catch {
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }

      const grant = randomToken();
      try {
        const admin = await d.adminClient();
        const { error } = await admin.rpc('kit_mint_recovery_grant', {
          p_user: userId,
          p_token_hash: sha256Hex(grant),
          p_ttl_seconds: RECOVERY_GRANT_TTL_SECONDS,
        });
        if (error) throw error;
        const jar = await d.cookies();
        jar.set(cookieName, grant, {
          httpOnly: true,
          secure: config.secureCookies,
          sameSite: 'lax',
          path: '/auth',
          maxAge: RECOVERY_GRANT_TTL_SECONDS,
        });
      } catch (error) {
        // No grant means no reset: do not leave the recovery session behind either.
        try {
          await client.auth.signOut({ scope: 'local' });
        } catch {
          // already failing closed
        }
        await audit.log({ event: 'password_recovery_confirmed', outcome: 'error', reason: errorReason(error, 'grant_failed'), actor: { id: userId, email: userEmail }, ip: ctx.ip });
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }

      await audit.log({ event: 'password_recovery_confirmed', outcome: 'success', actor: { id: userId, email: userEmail }, ip: ctx.ip, userAgent: ctx.userAgent });
      return { status: 'ok', redirectTo: paths.resetPassword };
    },

    // ------------------------------------------------------------ reset (with a grant)
    async resetPassword(_previous, formData) {
      const password = text(formData, 'password', 4096);
      const confirmation = text(formData, 'confirmPassword', 4096);
      const ctx = await context(d);

      // (1) The policy first, so a weak password never spends the grant.
      const problem = await checkPassword(d, password, { confirmation }, ctx);
      if (problem) return problem;

      let jar;
      let grant: string | undefined;
      try {
        jar = await d.cookies();
        grant = jar.get(cookieName)?.value;
      } catch {
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }
      if (!grant || !TOKEN_SHAPE.test(grant)) return fail('invalid_link', AUTH_MESSAGES.recoverySessionExpired, { offerNewLink: true });

      let client: AnySupabaseClient;
      try {
        client = await d.serverClient();
      } catch {
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }
      const session = await readSession(client);
      if (session.status === 'unavailable') return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      if (session.status === 'signed_out') return fail('invalid_link', AUTH_MESSAGES.recoverySessionExpired, { offerNewLink: true });
      const actor = { id: session.user.id, email: session.user.email };

      // (2) Claim the grant: one conditional UPDATE, exactly one winner.
      try {
        const admin = await d.adminClient();
        const { data, error } = await admin.rpc('kit_claim_recovery_grant', { p_user: actor.id, p_token_hash: sha256Hex(grant) });
        if (error) throw error;
        if (data !== true) {
          await audit.log({ event: 'password_updated', outcome: 'denied', reason: 'grant_not_claimable', actor, ip: ctx.ip });
          return fail('invalid_link', AUTH_MESSAGES.recoverySessionExpired, { offerNewLink: true });
        }
      } catch (error) {
        await audit.log({ event: 'password_updated', outcome: 'error', reason: errorReason(error, 'grant_claim_failed'), actor, ip: ctx.ip });
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }
      try {
        jar.delete({ name: cookieName, path: '/auth' });
      } catch {
        // the grant is consumed server-side; the cookie is now worthless
      }

      // (3) The provider update. A failure leaves the grant consumed; offer a fresh link.
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
      } catch (error) {
        await audit.log({ event: 'password_updated', outcome: 'error', reason: errorReason(error, 'update_failed'), actor, ip: ctx.ip, details: { via: 'reset' } });
        return fail(isServiceError(error) ? 'service_unavailable' : 'validation_failed', AUTH_MESSAGES.passwordUpdateFailed, { offerNewLink: true });
      }

      // (4) Sign out every other session; (5) audit.
      const othersSignedOut = await signOutOthers(client);
      await audit.log({ event: 'password_updated', outcome: 'success', actor, ip: ctx.ip, userAgent: ctx.userAgent, details: { via: 'reset', others_signed_out: othersSignedOut } });
      if (!othersSignedOut) {
        await audit.log({ event: 'sessions_revoked', outcome: 'failure', reason: 'others_sign_out_failed', actor, ip: ctx.ip });
        await raiseAlert(config, { kind: 'others_sign_out_failed', severity: 'normal', message: 'A password reset could not sign out the account\'s other sessions.', details: { userId: actor.id } });
      }
      const home = session.role ? config.homeForRole[session.role] : paths.pending;
      return { status: 'ok', redirectTo: home, message: othersSignedOut ? AUTH_MESSAGES.passwordChanged : AUTH_MESSAGES.passwordChangedOthersRemain };
    },

    // ------------------------------------------------------------ change (signed in)
    async changePassword(_previous, formData) {
      const current = text(formData, 'currentPassword', 4096);
      const password = text(formData, 'password', 4096);
      const confirmation = text(formData, 'confirmPassword', 4096);
      const captchaToken = captchaTokenFrom(formData);
      const ctx = await context(d);

      let client: AnySupabaseClient;
      try {
        client = await d.serverClient();
      } catch {
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }
      const session = await readSession(client);
      if (session.status === 'unavailable') return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      if (session.status === 'signed_out' || !session.user.email) return fail('unauthenticated', AUTH_MESSAGES.unauthenticated);
      const email = canonicalEmail(session.user.email);
      const actor = { id: session.user.id, email: session.user.email };
      if (!current) return fail('validation_failed', AUTH_MESSAGES.currentPasswordWrong, { field: 'currentPassword' });

      const problem = await checkPassword(d, password, { confirmation, currentPassword: current }, ctx, actor);
      if (problem) return problem;

      // The current password, verified server-side with its own CAPTCHA token
      // (credential-change confirmation). Failures count as sign-in failures,
      // so this form cannot be used to guess passwords faster than sign-in.
      const limit = { scope: 'sign_in' as const, emailHmac: audit.pseudonymise(email), ip: ctx.ip };
      if ((await throttle(d, limit, ctx)) > 0) return fail('rate_limited', AUTH_MESSAGES.currentPasswordWrong, { field: 'currentPassword' });
      try {
        const { error } = await client.auth.signInWithPassword({ email, password: current, options: captchaToken ? { captchaToken } : undefined });
        if (error) {
          if (isServiceError(error)) return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
          await audit.log({ event: 'sign_in', outcome: 'failure', reason: 'reverify_failed', subjectEmail: email, actor, ip: ctx.ip });
          await record(d, { ...limit, outcome: 'failure' });
          if (isCaptchaError(error)) return fail('captcha_failed', AUTH_MESSAGES.captchaFailed);
          return fail('validation_failed', AUTH_MESSAGES.currentPasswordWrong, { field: 'currentPassword' });
        }
      } catch {
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }

      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
      } catch (error) {
        await audit.log({ event: 'password_updated', outcome: 'error', reason: errorReason(error, 'update_failed'), actor, ip: ctx.ip, details: { via: 'change' } });
        return fail(isServiceError(error) ? 'service_unavailable' : 'validation_failed', 'We could not change your password. Please try again.');
      }

      const othersSignedOut = await signOutOthers(client);
      await audit.log({ event: 'password_updated', outcome: 'success', actor, ip: ctx.ip, userAgent: ctx.userAgent, details: { via: 'change', others_signed_out: othersSignedOut } });
      if (!othersSignedOut) {
        await audit.log({ event: 'sessions_revoked', outcome: 'failure', reason: 'others_sign_out_failed', actor, ip: ctx.ip });
        await raiseAlert(config, { kind: 'others_sign_out_failed', severity: 'normal', message: 'A password change could not sign out the account\'s other sessions.', details: { userId: actor.id } });
      }
      return { status: 'ok', message: othersSignedOut ? AUTH_MESSAGES.passwordChanged : AUTH_MESSAGES.passwordChangedOthersRemain };
    },

    // ------------------------------------------------------------ accept an invite
    async acceptInvite(_previous, formData) {
      const token = text(formData, 'token', 200);
      const password = text(formData, 'password', 4096);
      const confirmation = text(formData, 'confirmPassword', 4096);
      const captchaToken = captchaTokenFrom(formData);
      if (!TOKEN_SHAPE.test(token)) return fail('invalid_link', AUTH_MESSAGES.inviteLinkInvalid);
      const ctx = await context(d);

      // The policy before the claim, so a weak password never spends the invite.
      const problem = await checkPassword(d, password, { confirmation }, ctx);
      if (problem) return problem;

      let admin: AnySupabaseClient;
      const attempt = newOperationId();
      let invite: { id: string; email: string; role: string };
      try {
        admin = await d.adminClient();
        const { data, error } = await admin.rpc('kit_claim_invite', { p_token_hash: sha256Hex(token), p_attempt: attempt });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.id) {
          await audit.log({ event: 'invite_accepted', outcome: 'denied', reason: 'not_claimable', operationId: attempt, ip: ctx.ip });
          return fail('invalid_link', AUTH_MESSAGES.inviteUnusable);
        }
        invite = row as { id: string; email: string; role: string };
      } catch (error) {
        await audit.log({ event: 'invite_accepted', outcome: 'error', reason: errorReason(error, 'claim_failed'), operationId: attempt, ip: ctx.ip });
        return fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable);
      }

      const failInvite = async (reason: string, userId: string | null): Promise<AuthFormState> => {
        // Compensation: delete the still-banned Auth user, then mark the invite failed.
        let orphan = false;
        if (userId) {
          try {
            const { error } = await admin.auth.admin.deleteUser(userId);
            if (error) orphan = true;
          } catch {
            orphan = true;
          }
        }
        try {
          await admin.rpc('kit_fail_invite', { p_id: invite.id, p_attempt: attempt, p_reason: reason });
        } catch {
          orphan = true;
        }
        await audit.log({ event: 'invite_accepted', outcome: 'failure', reason, target: { id: userId, email: invite.email }, operationId: attempt, ip: ctx.ip });
        await raiseAlert(config, {
          kind: orphan ? 'invite_orphan_left' : 'invite_acceptance_failed',
          severity: orphan ? 'high' : 'normal',
          message: orphan
            ? 'An invite acceptance failed and its banned Auth user could not be removed. Run the invite reconciliation.'
            : 'An invite acceptance failed; the invite is marked failed and the admin can issue a new one.',
          details: { inviteId: invite.id, reason },
        });
        return fail('service_unavailable', AUTH_MESSAGES.inviteSetupFailed);
      };

      // Create the Auth user banned: no usable account exists until the very last step.
      let userId: string;
      try {
        const { data, error } = await admin.auth.admin.createUser({
          email: invite.email,
          password,
          email_confirm: true,
          ban_duration: BAN_FOREVER,
        });
        if (error || !data.user) return failInvite(errorReason(error, 'create_user_failed'), null);
        userId = data.user.id;
      } catch (error) {
        return failInvite(errorReason(error, 'create_user_failed'), null);
      }

      try {
        const attached = await admin.rpc('kit_attach_invite_user', { p_id: invite.id, p_attempt: attempt, p_user: userId });
        if (attached.error || attached.data !== true) return failInvite('attach_failed', userId);
        // Link the profile with the invited role and mark the invite active, in one transaction.
        const completed = await admin.rpc('kit_complete_invite', { p_id: invite.id, p_attempt: attempt, p_user: userId });
        if (completed.error || completed.data !== true) return failInvite('link_failed', userId);
      } catch {
        return failInvite('link_failed', userId);
      }

      // Unban last.
      try {
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
        if (error) throw error;
      } catch (error) {
        await audit.log({ event: 'account_unbanned', outcome: 'error', reason: errorReason(error, 'unban_failed'), target: { id: userId, email: invite.email }, operationId: attempt });
        await raiseAlert(config, {
          kind: 'invite_unban_failed',
          severity: 'high',
          message: 'An invited account was linked but could not be unbanned. An admin can finish it with Reactivate.',
          details: { userId },
        });
        return fail('service_unavailable', AUTH_MESSAGES.inviteNotSwitchedOn);
      }
      await audit.log({ event: 'account_unbanned', outcome: 'success', target: { id: userId, email: invite.email }, operationId: attempt });
      await audit.log({ event: 'invite_accepted', outcome: 'success', actor: { id: userId, email: invite.email }, operationId: attempt, ip: ctx.ip, userAgent: ctx.userAgent, details: { role: invite.role } });

      // Sign the new user in. If that does not work (CAPTCHA, a blip) the
      // account is still ready, so send them to sign in rather than failing.
      try {
        const client = await d.serverClient();
        const { error } = await client.auth.signInWithPassword({ email: invite.email, password, options: captchaToken ? { captchaToken } : undefined });
        if (error) throw error;
        await audit.log({ event: 'sign_in', outcome: 'success', actor: { id: userId, email: invite.email }, subjectEmail: invite.email, ip: ctx.ip, details: { via: 'invite', captcha_token: Boolean(captchaToken) } });
      } catch {
        return { status: 'ok', redirectTo: paths.signIn, message: AUTH_MESSAGES.inviteReadySignIn };
      }
      const role = invite.role === 'admin' || invite.role === 'host' ? invite.role : null;
      return { status: 'ok', redirectTo: role ? config.homeForRole[role] : paths.home };
    },
  };
}
