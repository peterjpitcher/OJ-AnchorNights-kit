// The public and signed-in flows against fake clients. Every public write
// path (sign in, forgot password, the confirm POST, reset, accept invite) has
// tests that break one dependency at a time and assert the person is shown an
// error, never a success that did not happen.
import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, type AuthFormState } from '../shared';
import { BAN_FOREVER, createAuthActions, RECOVERY_GRANT_TTL_SECONDS } from './actions';
import { sha256Hex } from './crypto';
import { harness, INVITE_ID, OTHER_ID, outage, refusal, STRONG_PASSWORD, TOKEN, user, type Harness } from '../../../test/auth-fakes';

const IDLE: AuthFormState = { status: 'idle' };
const COOKIE = '__Secure-kit-recovery';

function expectError(state: AuthFormState, code?: string): Extract<AuthFormState, { status: 'error' }> {
  expect(state.status).toBe('error');
  const error = state as Extract<AuthFormState, { status: 'error' }>;
  expect(error.error.length).toBeGreaterThan(10);
  if (code) expect(error.code).toBe(code);
  return error;
}

const events = (h: Harness): string[] => h.rows.map((row) => `${row.event}:${row.outcome}`);

// ---------------------------------------------------------------- sign in

describe('signIn', () => {
  const signInForm = (h: Harness, extra: Record<string, string> = {}): FormData =>
    h.form({ email: ' Host@Example.test ', password: 'whatever-it-is', 'cf-turnstile-response': 'tok', ...extra });

  it('forwards the Turnstile token, audits, and sends a host to their home', async () => {
    const h = harness('host');
    const result = await createAuthActions(h.deps).signIn(IDLE, signInForm(h));
    expect(result).toEqual({ status: 'ok', redirectTo: '/host' });
    expect(h.server.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'host@example.test', password: 'whatever-it-is', options: { captchaToken: 'tok' } });
    expect(events(h)).toEqual(['sign_in:success']);
    expect(h.rows[0].email_hmac).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(h.rows[0].ip).toBe('203.0.113.7');
  });

  it('honours a safe next path and ignores an unsafe one', async () => {
    const h = harness('admin');
    const actions = createAuthActions(h.deps);
    expect(await actions.signIn(IDLE, signInForm(h, { next: '/sessions/7' }))).toEqual({ status: 'ok', redirectTo: '/sessions/7' });
    expect(await actions.signIn(IDLE, signInForm(h, { next: '//evil.example' }))).toEqual({ status: 'ok', redirectTo: '/admin' });
  });

  it('sends an account with no role to the pending screen', async () => {
    const h = harness('pending');
    expect(await createAuthActions(h.deps).signIn(IDLE, signInForm(h, { next: '/sessions' }))).toEqual({ status: 'ok', redirectTo: '/pending' });
  });

  it('gives one generic message for a wrong password and counts the failure', async () => {
    const h = harness();
    h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: refusal(400, 'invalid_credentials') });
    const actions = createAuthActions(h.deps);
    const result = expectError(await actions.signIn(IDLE, signInForm(h)), 'validation_failed');
    expect(result.error).toBe(AUTH_MESSAGES.signInFailed);
    expect(events(h)).toEqual(['sign_in:failure']);
    expect(h.rows[0].reason).toBe('invalid_credentials');
    expect(JSON.stringify(h.rows[0])).not.toContain('example.test');
  });

  it('throttles after 10 failures with the same generic message, without calling Supabase', async () => {
    const h = harness();
    h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: refusal(400, 'invalid_credentials') });
    const actions = createAuthActions(h.deps);
    for (let i = 0; i < 10; i += 1) await actions.signIn(IDLE, signInForm(h));
    h.server.auth.signInWithPassword.mockClear();
    const result = expectError(await actions.signIn(IDLE, signInForm(h)), 'rate_limited');
    expect(result.error).toBe(AUTH_MESSAGES.signInFailed);
    expect(h.server.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(h.rows.at(-1)).toMatchObject({ event: 'sign_in', outcome: 'denied', reason: 'rate_limited' });
  });

  it('says so when Supabase refuses the CAPTCHA', async () => {
    const h = harness();
    h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: refusal(400, 'captcha_failed') });
    expectError(await createAuthActions(h.deps).signIn(IDLE, signInForm(h)), 'captcha_failed');
  });

  it('raises a high alert when a sign-in succeeds with no CAPTCHA token (enforcement is off)', async () => {
    const h = harness();
    const form = h.form({ email: 'host@example.test', password: 'whatever-it-is' });
    expect((await createAuthActions(h.deps).signIn(IDLE, form)).status).toBe('ok');
    expect(h.server.auth.signInWithPassword).toHaveBeenCalledWith(expect.objectContaining({ options: undefined }));
    expect(events(h)).toEqual(['sign_in:success', 'captcha_bypass_detected:success']);
    expect(h.alerts).toEqual([expect.objectContaining({ kind: 'captcha_bypass_detected', severity: 'high' })]);
  });

  it('asks for both fields before doing anything', async () => {
    const h = harness();
    expectError(await createAuthActions(h.deps).signIn(IDLE, h.form({ email: 'a@b.co' })), 'validation_failed');
    expect(h.server.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  describe('fails closed', () => {
    it('when the server client cannot be made', async () => {
      const h = harness();
      h.deps.serverClient = async () => {
        throw new Error('no cookies');
      };
      expect(expectError(await createAuthActions(h.deps).signIn(IDLE, signInForm(h)), 'service_unavailable').error).toBe(AUTH_MESSAGES.serviceUnavailable);
    });

    it('when Auth is unreachable (reported as an error, not "wrong password")', async () => {
      const h = harness();
      h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: outage() });
      expectError(await createAuthActions(h.deps).signIn(IDLE, signInForm(h)), 'service_unavailable');
      expect(h.rows[0]).toMatchObject({ event: 'sign_in', outcome: 'error' });
    });

    it('when Auth returns a 500', async () => {
      const h = harness();
      h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: refusal(500, 'unexpected_failure') });
      expectError(await createAuthActions(h.deps).signIn(IDLE, signInForm(h)), 'service_unavailable');
    });

    it('when the Supabase call throws', async () => {
      const h = harness();
      h.server.auth.signInWithPassword.mockRejectedValue(new TypeError('fetch failed'));
      expectError(await createAuthActions(h.deps).signIn(IDLE, signInForm(h)), 'service_unavailable');
    });
  });

  it('fails open with an alert when only the limiter is down (CAPTCHA still applies)', async () => {
    const h = harness();
    h.deps.limiter = {
      check: async () => {
        throw new Error('db down');
      },
      record: async () => {},
    };
    expect((await createAuthActions(h.deps).signIn(IDLE, signInForm(h))).status).toBe('ok');
    expect(events(h)).toContain('limiter_unavailable:error');
    expect(h.alerts.map((a) => a.kind)).toContain('limiter_unavailable');
  });

  it('still signs in when the audit write fails, and alerts', async () => {
    const h = harness();
    h.deps.auditSink = async () => {
      throw new Error('insert failed');
    };
    expect((await createAuthActions(h.deps).signIn(IDLE, signInForm(h))).status).toBe('ok');
    expect(h.alerts.map((a) => a.kind)).toContain('auth_audit_write_failed');
  });
});

// ---------------------------------------------------------------- sign out

describe('signOut', () => {
  it('signs out this device only and goes to sign in', async () => {
    const h = harness();
    expect(await createAuthActions(h.deps).signOut()).toEqual({ status: 'ok', redirectTo: '/login' });
    expect(h.server.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(events(h)).toEqual(['sign_out:success']);
  });

  it('shows an error when the sign-out did not happen', async () => {
    const h = harness();
    h.server.auth.signOut.mockResolvedValue({ error: refusal(500, 'unexpected_failure') });
    expectError(await createAuthActions(h.deps).signOut(), 'service_unavailable');
  });
});

// ---------------------------------------------------------------- forgot password

describe('requestPasswordReset', () => {
  const resetForm = (h: Harness, email = 'Host@Example.test'): FormData => h.form({ email, 'cf-turnstile-response': 'tok' });

  it('kills old grants, sends the link to /auth/confirm with the token, and answers generically', async () => {
    const h = harness();
    h.admin.onRpc('kit_invalidate_recovery_grants_for_email', () => ({ data: 0, error: null }));
    const result = await createAuthActions(h.deps).requestPasswordReset(IDLE, resetForm(h));
    expect(result).toEqual({ status: 'ok', message: AUTH_MESSAGES.resetSent });
    expect(h.admin.rpcCalls()).toEqual([{ name: 'kit_invalidate_recovery_grants_for_email', args: { p_email: 'host@example.test' } }]);
    expect(h.server.auth.resetPasswordForEmail).toHaveBeenCalledWith('host@example.test', {
      redirectTo: 'https://quiz.example.test/auth/confirm',
      captchaToken: 'tok',
    });
    expect(events(h)).toEqual(['password_reset_requested:success']);
  });

  it('answers the same for a cooldown and for Supabase refusing the address', async () => {
    const h = harness();
    h.admin.onRpc('kit_invalidate_recovery_grants_for_email', () => ({ data: 0, error: null }));
    const actions = createAuthActions(h.deps);
    await actions.requestPasswordReset(IDLE, resetForm(h));
    h.server.auth.resetPasswordForEmail.mockClear();
    expect(await actions.requestPasswordReset(IDLE, resetForm(h))).toEqual({ status: 'ok', message: AUTH_MESSAGES.resetSent });
    expect(h.server.auth.resetPasswordForEmail).not.toHaveBeenCalled();

    h.server.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: refusal(429, 'over_email_send_rate_limit') });
    expect(await actions.requestPasswordReset(IDLE, resetForm(h, 'other@example.test'))).toEqual({ status: 'ok', message: AUTH_MESSAGES.resetSent });
  });

  it('asks for a valid address', async () => {
    const h = harness();
    expect(expectError(await createAuthActions(h.deps).requestPasswordReset(IDLE, h.form({ email: 'nope' }))).field).toBe('email');
  });

  it('says so when the CAPTCHA was refused', async () => {
    const h = harness();
    h.admin.onRpc('kit_invalidate_recovery_grants_for_email', () => ({ data: 0, error: null }));
    h.server.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: refusal(400, 'captcha_failed') });
    expectError(await createAuthActions(h.deps).requestPasswordReset(IDLE, resetForm(h)), 'captcha_failed');
  });

  describe('fails closed', () => {
    it('when the old grants cannot be invalidated', async () => {
      const h = harness();
      h.admin.onRpc('kit_invalidate_recovery_grants_for_email', () => ({ data: null, error: { code: '57P01' } }));
      expect(expectError(await createAuthActions(h.deps).requestPasswordReset(IDLE, resetForm(h)), 'service_unavailable').error).toBe(AUTH_MESSAGES.resetUnavailable);
      expect(h.server.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('when the admin client cannot be made', async () => {
      const h = harness();
      h.deps.adminClient = () => {
        throw new Error('no key');
      };
      expectError(await createAuthActions(h.deps).requestPasswordReset(IDLE, resetForm(h)), 'service_unavailable');
    });

    it('when the email could not be sent (SMTP or Auth failure)', async () => {
      const h = harness();
      h.admin.onRpc('kit_invalidate_recovery_grants_for_email', () => ({ data: 0, error: null }));
      h.server.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: refusal(500, 'unexpected_failure', 'Error sending recovery email') });
      expect(expectError(await createAuthActions(h.deps).requestPasswordReset(IDLE, resetForm(h)), 'service_unavailable').error).toBe(AUTH_MESSAGES.resetUnavailable);
    });

    it('when the Supabase call throws', async () => {
      const h = harness();
      h.admin.onRpc('kit_invalidate_recovery_grants_for_email', () => ({ data: 0, error: null }));
      h.server.auth.resetPasswordForEmail.mockRejectedValue(new TypeError('fetch failed'));
      expectError(await createAuthActions(h.deps).requestPasswordReset(IDLE, resetForm(h)), 'service_unavailable');
    });
  });
});

// ---------------------------------------------------------------- /auth/confirm

describe('confirmRecovery', () => {
  const confirmForm = (h: Harness, type = 'recovery'): FormData => h.form({ token_hash: 'pkce_0123456789abcdef', type });

  it('accepts recovery only: every other link type is refused without a Supabase call', async () => {
    const h = harness();
    const actions = createAuthActions(h.deps);
    for (const type of ['magiclink', 'signup', 'invite', 'email', 'email_change', '']) {
      const result = expectError(await actions.confirmRecovery(IDLE, confirmForm(h, type)), 'invalid_link');
      expect(result.offerNewLink).toBe(true);
    }
    expect(h.server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('mints a 10-minute grant, storing only its hash, in an httpOnly cookie scoped to /auth', async () => {
    const h = harness();
    h.admin.onRpc('kit_mint_recovery_grant', () => ({ data: true, error: null }));
    const result = await createAuthActions(h.deps).confirmRecovery(IDLE, confirmForm(h));
    expect(result).toEqual({ status: 'ok', redirectTo: '/auth/reset-password' });
    expect(h.server.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_0123456789abcdef', type: 'recovery' });
    const cookie = h.jar.store.get(COOKIE);
    expect(cookie?.options).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/auth', maxAge: RECOVERY_GRANT_TTL_SECONDS });
    const mint = h.admin.rpcCalls()[0];
    expect(mint.args).toEqual({ p_user: user().id, p_token_hash: sha256Hex(cookie!.value), p_ttl_seconds: 600 });
    expect(mint.args.p_token_hash).not.toBe(cookie!.value);
    expect(events(h)).toEqual(['password_recovery_confirmed:success']);
  });

  it('offers a new link when the email link is expired or used', async () => {
    const h = harness();
    h.server.auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: refusal(403, 'otp_expired') });
    const result = expectError(await createAuthActions(h.deps).confirmRecovery(IDLE, confirmForm(h)), 'invalid_link');
    expect(result.offerNewLink).toBe(true);
    expect(h.jar.store.size).toBe(0);
  });

  describe('fails closed', () => {
    it('when Auth is unreachable', async () => {
      const h = harness();
      h.server.auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: outage() });
      expectError(await createAuthActions(h.deps).confirmRecovery(IDLE, confirmForm(h)), 'service_unavailable');
    });

    it('when the grant cannot be stored, and signs the recovery session out', async () => {
      const h = harness();
      h.admin.onRpc('kit_mint_recovery_grant', () => ({ data: null, error: { code: '57P01' } }));
      expectError(await createAuthActions(h.deps).confirmRecovery(IDLE, confirmForm(h)), 'service_unavailable');
      expect(h.jar.store.size).toBe(0);
      expect(h.server.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('when the cookie cannot be set', async () => {
      const h = harness();
      h.admin.onRpc('kit_mint_recovery_grant', () => ({ data: true, error: null }));
      h.deps.cookies = async () => {
        throw new Error('read-only cookies');
      };
      expectError(await createAuthActions(h.deps).confirmRecovery(IDLE, confirmForm(h)), 'service_unavailable');
    });
  });
});

// ---------------------------------------------------------------- reset

describe('resetPassword', () => {
  const GRANT = 'G'.repeat(43);
  const resetForm = (h: Harness, password = STRONG_PASSWORD, confirm = password): FormData => h.form({ password, confirmPassword: confirm });

  /** A database grant that can be claimed once, like kit_claim_recovery_grant. */
  function withGrant(h: Harness): void {
    h.jar.set(COOKIE, GRANT, { path: '/auth' });
    let live = true;
    h.admin.onRpc('kit_claim_recovery_grant', (args) => {
      const ok = live && args.p_token_hash === sha256Hex(GRANT);
      live = false;
      return { data: ok, error: null };
    });
  }

  it('claims the grant by its hash, sets the password, signs other sessions out and goes home', async () => {
    const h = harness('host');
    withGrant(h);
    const result = await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h));
    expect(result).toEqual({ status: 'ok', redirectTo: '/host', message: AUTH_MESSAGES.passwordChanged });
    expect(h.admin.rpcCalls()[0].args).toEqual({ p_user: user().id, p_token_hash: sha256Hex(GRANT) });
    expect(h.server.auth.updateUser).toHaveBeenCalledWith({ password: STRONG_PASSWORD });
    expect(h.server.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(h.jar.store.has(COOKIE)).toBe(false);
    expect(events(h)).toEqual(['password_updated:success']);
  });

  it('is single use: the same grant cannot set a second password', async () => {
    const h = harness();
    withGrant(h);
    const actions = createAuthActions(h.deps);
    expect((await actions.resetPassword(IDLE, resetForm(h))).status).toBe('ok');
    h.jar.set(COOKIE, GRANT, { path: '/auth' });
    h.server.auth.updateUser.mockClear();
    const second = expectError(await actions.resetPassword(IDLE, resetForm(h)), 'invalid_link');
    expect(second.offerNewLink).toBe(true);
    expect(h.server.auth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses an expired grant (the database says no) without touching the password', async () => {
    const h = harness();
    h.jar.set(COOKIE, GRANT, { path: '/auth' });
    h.admin.onRpc('kit_claim_recovery_grant', () => ({ data: false, error: null }));
    expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'invalid_link');
    expect(h.server.auth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses with no grant cookie, or a malformed one', async () => {
    const h = harness();
    expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'invalid_link');
    h.jar.set(COOKIE, 'short', { path: '/auth' });
    expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'invalid_link');
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it('checks the policy before spending the grant', async () => {
    const h = harness();
    withGrant(h);
    const actions = createAuthActions(h.deps);
    expect(expectError(await actions.resetPassword(IDLE, resetForm(h, 'short'))).field).toBe('password');
    expect(expectError(await actions.resetPassword(IDLE, resetForm(h, STRONG_PASSWORD, 'different one!'))).field).toBe('confirmPassword');
    h.breach.result = 'breached';
    expectError(await actions.resetPassword(IDLE, resetForm(h)), 'validation_failed');
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it('lets the password through when the breach check is down, and records it', async () => {
    const h = harness();
    withGrant(h);
    h.breach.result = 'unavailable';
    expect((await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h))).status).toBe('ok');
    expect(events(h)).toEqual(['breach_check_unavailable:error', 'password_updated:success']);
  });

  it('tells the person, and alerts, when other sessions could not be signed out', async () => {
    const h = harness();
    withGrant(h);
    h.server.auth.signOut.mockResolvedValue({ error: refusal(500, 'unexpected_failure') });
    const result = await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h));
    expect(result).toMatchObject({ status: 'ok', message: AUTH_MESSAGES.passwordChangedOthersRemain });
    expect(h.server.auth.signOut).toHaveBeenCalledTimes(2);
    expect(h.alerts.map((a) => a.kind)).toEqual(['others_sign_out_failed']);
  });

  describe('fails closed', () => {
    it('when the grant cannot be claimed (database down)', async () => {
      const h = harness();
      h.jar.set(COOKIE, GRANT, { path: '/auth' });
      h.admin.onRpc('kit_claim_recovery_grant', () => ({ data: null, error: { code: '57P01' } }));
      expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'service_unavailable');
      expect(h.server.auth.updateUser).not.toHaveBeenCalled();
    });

    it('when the session cannot be read', async () => {
      const h = harness();
      withGrant(h);
      h.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: outage() });
      expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'service_unavailable');
    });

    it('when the recovery session is gone', async () => {
      const h = harness();
      withGrant(h);
      h.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } });
      expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'invalid_link');
    });

    it('when Auth will not set the password', async () => {
      const h = harness();
      withGrant(h);
      h.server.auth.updateUser.mockResolvedValue({ data: { user: null }, error: outage() });
      const result = expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'service_unavailable');
      expect(result.offerNewLink).toBe(true);
      expect(h.rows.at(-1)).toMatchObject({ event: 'password_updated', outcome: 'error' });
    });

    it('when the cookie store cannot be read', async () => {
      const h = harness();
      h.deps.cookies = async () => {
        throw new Error('no cookies');
      };
      expectError(await createAuthActions(h.deps).resetPassword(IDLE, resetForm(h)), 'service_unavailable');
    });
  });
});

// ---------------------------------------------------------------- change (signed in)

describe('changePassword', () => {
  const changeForm = (h: Harness, current = 'the-old-password', next = STRONG_PASSWORD): FormData =>
    h.form({ currentPassword: current, password: next, confirmPassword: next, 'cf-turnstile-response': 'tok' });

  it('re-checks the current password with a token, then changes it and signs other sessions out', async () => {
    const h = harness();
    expect(await createAuthActions(h.deps).changePassword(IDLE, changeForm(h))).toEqual({ status: 'ok', message: AUTH_MESSAGES.passwordChanged });
    expect(h.server.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'host@example.test', password: 'the-old-password', options: { captchaToken: 'tok' } });
    expect(h.server.auth.updateUser).toHaveBeenCalledWith({ password: STRONG_PASSWORD });
    expect(h.server.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('refuses a wrong current password and counts it as a sign-in failure', async () => {
    const h = harness();
    h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: refusal(400, 'invalid_credentials') });
    expect(expectError(await createAuthActions(h.deps).changePassword(IDLE, changeForm(h))).field).toBe('currentPassword');
    expect(h.server.auth.updateUser).not.toHaveBeenCalled();
    expect(h.rows.at(-1)).toMatchObject({ event: 'sign_in', outcome: 'failure', reason: 'reverify_failed' });
  });

  it('refuses reusing the current password', async () => {
    const h = harness();
    expect(expectError(await createAuthActions(h.deps).changePassword(IDLE, changeForm(h, STRONG_PASSWORD, STRONG_PASSWORD))).error).toMatch(/different/);
  });

  it('needs a signed-in user', async () => {
    const h = harness();
    h.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expectError(await createAuthActions(h.deps).changePassword(IDLE, changeForm(h)), 'unauthenticated');
  });
});

// ---------------------------------------------------------------- accept an invite

describe('acceptInvite', () => {
  const inviteForm = (h: Harness, token = TOKEN, password = STRONG_PASSWORD): FormData =>
    h.form({ token, password, confirmPassword: password, 'cf-turnstile-response': 'tok' });

  function withInvite(h: Harness, role = 'host'): void {
    h.admin.onRpc('kit_claim_invite', () => ({ data: [{ id: INVITE_ID, email: 'new@example.test', role }], error: null }));
    h.admin.onRpc('kit_attach_invite_user', () => ({ data: true, error: null }));
    h.admin.onRpc('kit_complete_invite', () => ({ data: true, error: null }));
    h.admin.onRpc('kit_fail_invite', () => ({ data: true, error: null }));
  }

  it('creates the user banned, links the profile, unbans last, then signs them in', async () => {
    const h = harness();
    withInvite(h);
    const result = await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h));
    expect(result).toEqual({ status: 'ok', redirectTo: '/host' });

    const claim = h.admin.rpcCalls()[0];
    expect(claim.name).toBe('kit_claim_invite');
    expect(claim.args.p_token_hash).toBe(sha256Hex(TOKEN));
    expect(JSON.stringify(h.admin.rpcCalls())).not.toContain(TOKEN);

    expect(h.admin.auth.admin.createUser).toHaveBeenCalledWith({ email: 'new@example.test', password: STRONG_PASSWORD, email_confirm: true, ban_duration: BAN_FOREVER });
    expect(h.admin.rpcCalls().map((c) => c.name)).toEqual(['kit_claim_invite', 'kit_attach_invite_user', 'kit_complete_invite']);
    expect(h.admin.auth.admin.updateUserById).toHaveBeenCalledWith(OTHER_ID, { ban_duration: 'none' });

    // Unban is the last admin step: after the profile is linked and active.
    const completeOrder = h.admin.rpc.mock.invocationCallOrder[2];
    const unbanOrder = h.admin.auth.admin.updateUserById.mock.invocationCallOrder[0];
    expect(unbanOrder).toBeGreaterThan(completeOrder);
    expect(h.server.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'new@example.test', password: STRONG_PASSWORD, options: { captchaToken: 'tok' } });
    expect(events(h)).toEqual(['account_unbanned:success', 'invite_accepted:success', 'sign_in:success']);
  });

  it('refuses a malformed token and a used, expired or replaced invite', async () => {
    const h = harness();
    const actions = createAuthActions(h.deps);
    expectError(await actions.acceptInvite(IDLE, inviteForm(h, 'not-a-token')), 'invalid_link');
    expect(h.admin.rpc).not.toHaveBeenCalled();
    h.admin.onRpc('kit_claim_invite', () => ({ data: [], error: null }));
    expect(expectError(await actions.acceptInvite(IDLE, inviteForm(h)), 'invalid_link').error).toBe(AUTH_MESSAGES.inviteUnusable);
    expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('checks the password before spending the invite', async () => {
    const h = harness();
    withInvite(h);
    expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h, TOKEN, 'too short')), 'validation_failed');
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it('sends them to sign in when the account is ready but the automatic sign-in did not work', async () => {
    const h = harness();
    withInvite(h);
    h.server.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: refusal(400, 'captcha_failed') });
    expect(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h))).toEqual({ status: 'ok', redirectTo: '/login', message: AUTH_MESSAGES.inviteReadySignIn });
  });

  describe('fails closed', () => {
    it('when the invite cannot be claimed (database down)', async () => {
      const h = harness();
      h.admin.onRpc('kit_claim_invite', () => ({ data: null, error: { code: '57P01' } }));
      expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h)), 'service_unavailable');
      expect(h.admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('when the admin client cannot be made', async () => {
      const h = harness();
      h.deps.adminClient = () => {
        throw new Error('no key');
      };
      expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h)), 'service_unavailable');
    });

    it('when the Auth user cannot be created, marking the invite failed', async () => {
      const h = harness();
      withInvite(h);
      h.admin.auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: refusal(500, 'unexpected_failure') });
      expect(expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h)), 'service_unavailable').error).toBe(AUTH_MESSAGES.inviteSetupFailed);
      expect(h.admin.rpcCalls().map((c) => c.name)).toEqual(['kit_claim_invite', 'kit_fail_invite']);
      expect(h.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('when the profile cannot be linked: the banned user is deleted and the invite marked failed', async () => {
      const h = harness();
      withInvite(h);
      h.admin.onRpc('kit_complete_invite', () => ({ data: null, error: { code: '23505' } }));
      expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h)), 'service_unavailable');
      expect(h.admin.auth.admin.deleteUser).toHaveBeenCalledWith(OTHER_ID);
      expect(h.admin.rpcCalls().at(-1)).toMatchObject({ name: 'kit_fail_invite', args: { p_id: INVITE_ID, p_reason: 'link_failed' } });
      expect(h.admin.auth.admin.updateUserById).not.toHaveBeenCalled();
      expect(h.alerts).toEqual([expect.objectContaining({ kind: 'invite_acceptance_failed' })]);
    });

    it('raises a high alert when the compensation itself fails (an orphan is left banned)', async () => {
      const h = harness();
      withInvite(h);
      h.admin.onRpc('kit_attach_invite_user', () => ({ data: false, error: null }));
      h.admin.auth.admin.deleteUser.mockResolvedValue({ data: null, error: refusal(500, 'unexpected_failure') });
      expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h)), 'service_unavailable');
      expect(h.alerts).toEqual([expect.objectContaining({ kind: 'invite_orphan_left', severity: 'high' })]);
    });

    it('when the unban fails: the account stays unusable and the person is told', async () => {
      const h = harness();
      withInvite(h);
      h.admin.auth.admin.updateUserById.mockResolvedValue({ data: null, error: outage() });
      expect(expectError(await createAuthActions(h.deps).acceptInvite(IDLE, inviteForm(h)), 'service_unavailable').error).toBe(AUTH_MESSAGES.inviteNotSwitchedOn);
      expect(h.server.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(h.alerts).toEqual([expect.objectContaining({ kind: 'invite_unban_failed', severity: 'high' })]);
    });
  });
});
