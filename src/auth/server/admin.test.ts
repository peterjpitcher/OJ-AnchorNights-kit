import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, type AuthFormState } from '../shared';
import { BAN_FOREVER } from './actions';
import { createAdminActions, createAuthMaintenance } from './admin';
import { sha256Hex } from './crypto';
import { createAuthHelpers, AuthServiceUnavailableError } from './helpers';
import { harness, INVITE_ID, OTHER_ID, outage, USER_ID, type Harness } from '../../../test/auth-fakes';

const IDLE: AuthFormState = { status: 'idle' };
const admin = (h: Harness) => createAdminActions({ ...h.deps, profileIdColumn: 'user_id' });

describe('admin actions', () => {
  it('refuse anyone who is not an active admin, on the server', async () => {
    for (const role of ['host', 'pending', null]) {
      const h = harness(role);
      const result = await admin(h).issueInvite(IDLE, h.form({ email: 'new@example.test', role: 'host' }));
      expect(result).toMatchObject({ status: 'error', code: 'unauthorised' });
      expect(h.admin.rpc).not.toHaveBeenCalled();
    }
    const h = harness('admin');
    h.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: outage() });
    expect(await admin(h).issueInvite(IDLE, h.form({ email: 'new@example.test', role: 'host' }))).toMatchObject({ code: 'service_unavailable' });
  });

  it('issue a 7-day invite, storing only the token hash, and return a fragment link to copy', async () => {
    const h = harness('admin');
    h.admin.onRpc('kit_issue_invite', () => ({ data: [{ id: INVITE_ID, expires_at: '2026-11-13T10:00:00Z', cancelled: 1 }], error: null }));
    const result = await admin(h).issueInvite(IDLE, h.form({ email: ' New@Example.test ', role: 'admin' }));
    expect(result.status).toBe('ok');
    const url = (result as Extract<AuthFormState, { status: 'ok' }>).data!.inviteUrl;
    const match = /^https:\/\/quiz\.example\.test\/invite#t=([A-Za-z0-9_-]{43})$/.exec(url);
    expect(match).not.toBeNull();
    const call = h.admin.rpcCalls()[0];
    expect(call.args).toEqual({ p_email: 'new@example.test', p_role: 'admin', p_token_hash: sha256Hex(match![1]), p_invited_by: USER_ID, p_ttl_seconds: 604800 });
    expect(h.rows.at(-1)).toMatchObject({ event: 'invite_sent', outcome: 'success', details: { role: 'admin', delivery: 'copied_link', replaced: 1 } });
    expect(JSON.stringify(h.rows)).not.toContain(match![1]);
  });

  it('turn the database refusals into plain messages', async () => {
    const h = harness('admin');
    h.admin.onRpc('kit_issue_invite', () => ({ data: null, error: { message: 'kit_invite_account_exists' } }));
    expect(await admin(h).issueInvite(IDLE, h.form({ email: 'new@example.test', role: 'host' }))).toMatchObject({ status: 'error', field: 'email', error: 'That email already has an account.' });
    expect(await admin(h).issueInvite(IDLE, h.form({ email: 'new@example.test', role: 'owner' }))).toMatchObject({ status: 'error', field: 'role' });
  });

  it('cancel an invite', async () => {
    const h = harness('admin');
    h.admin.onRpc('kit_cancel_invite', () => ({ data: 'new@example.test', error: null }));
    expect(await admin(h).cancelInvite(IDLE, h.form({ inviteId: INVITE_ID }))).toMatchObject({ status: 'ok' });
    h.admin.onRpc('kit_cancel_invite', () => ({ data: null, error: null }));
    expect(await admin(h).cancelInvite(IDLE, h.form({ inviteId: INVITE_ID }))).toMatchObject({ status: 'error' });
  });

  it('deactivate in order: no access first, then the ban', async () => {
    const h = harness('admin');
    h.admin.onRpc('kit_deactivate_staff', () => ({ data: true, error: null }));
    expect(await admin(h).deactivateUser(IDLE, h.form({ userId: OTHER_ID }))).toEqual({ status: 'ok', message: 'Account deactivated and signed out everywhere.' });
    const deactivate = h.admin.rpc.mock.invocationCallOrder.at(-1)!;
    const banned = h.admin.auth.admin.updateUserById.mock.invocationCallOrder[0];
    expect(banned).toBeGreaterThan(deactivate);
    expect(h.admin.auth.admin.updateUserById).toHaveBeenCalledWith(OTHER_ID, { ban_duration: BAN_FOREVER });
    expect(h.rows.map((r) => r.event)).toEqual(['account_deactivated', 'account_banned']);
  });

  it('say so and alert when the ban after a deactivation failed', async () => {
    const h = harness('admin');
    h.admin.onRpc('kit_deactivate_staff', () => ({ data: true, error: null }));
    h.admin.auth.admin.updateUserById.mockResolvedValue({ data: null, error: outage() });
    const result = await admin(h).deactivateUser(IDLE, h.form({ userId: OTHER_ID }));
    expect(result).toMatchObject({ status: 'ok', message: expect.stringMatching(/ban did not go through/) });
    expect(h.alerts).toEqual([expect.objectContaining({ kind: 'offboarding_incomplete', severity: 'high' })]);
  });

  it('never let an admin demote or deactivate themselves', async () => {
    const h = harness('admin');
    expect(await admin(h).deactivateUser(IDLE, h.form({ userId: USER_ID }))).toMatchObject({ status: 'error' });
    expect(await admin(h).changeRole(IDLE, h.form({ userId: USER_ID, role: 'host' }))).toMatchObject({ status: 'error' });
    expect(h.admin.rpc).not.toHaveBeenCalledWith('kit_deactivate_staff', expect.anything());
  });

  it('reactivate with the role first and the unban last', async () => {
    const h = harness('admin');
    h.admin.onRpc('kit_reactivate_staff', () => ({ data: true, error: null }));
    expect(await admin(h).reactivateUser(IDLE, h.form({ userId: OTHER_ID, role: 'host' }))).toMatchObject({ status: 'ok' });
    expect(h.admin.rpc.mock.invocationCallOrder.at(-1)!).toBeLessThan(h.admin.auth.admin.updateUserById.mock.invocationCallOrder[0]);
    expect(h.admin.auth.admin.updateUserById).toHaveBeenCalledWith(OTHER_ID, { ban_duration: 'none' });
  });

  it('revoke every session by ban then unban, never admin.signOut with a user id', async () => {
    const h = harness('admin');
    expect(await admin(h).revokeSessions(IDLE, h.form({ userId: OTHER_ID }))).toMatchObject({ status: 'ok' });
    expect(h.admin.auth.admin.updateUserById.mock.calls).toEqual([
      [OTHER_ID, { ban_duration: BAN_FOREVER }],
      [OTHER_ID, { ban_duration: 'none' }],
    ]);
  });

  it('change an email as a saga and tell the admin to notify both addresses when no notifier is set', async () => {
    const h = harness('admin');
    const result = await admin(h).changeEmail(IDLE, h.form({ userId: OTHER_ID, email: 'moved@example.test' }));
    expect(result).toMatchObject({ status: 'ok', message: expect.stringMatching(/both the old and the new address/) });
    expect(h.admin.auth.admin.updateUserById.mock.calls[0]).toEqual([OTHER_ID, { email: 'moved@example.test', email_confirm: true }]);
  });

  it('list staff with their live state', async () => {
    const h = harness('admin');
    h.admin.from.mockReturnValue({
      select: async () => ({
        data: [
          { user_id: USER_ID, role: 'admin', deactivated_at: null },
          { user_id: OTHER_ID, role: 'host', deactivated_at: '2026-11-01T10:00:00Z' },
        ],
        error: null,
      }),
    });
    h.admin.auth.admin.listUsers.mockResolvedValue({ data: { users: [{ id: USER_ID, email: 'a@example.test' }, { id: OTHER_ID, email: 'b@example.test', banned_until: '2126-01-01T00:00:00Z' }] }, error: null });
    const staff = await admin(h).listStaff();
    expect(staff?.map((s) => [s.userId, s.role, s.active])).toEqual([
      [USER_ID, 'admin', true],
      [OTHER_ID, 'host', false],
    ]);
  });
});

describe('maintenance', () => {
  it('deletes only a still-banned orphan and marks the stale invite failed', async () => {
    const h = harness();
    h.admin.onRpc('kit_stale_invites', () => ({ data: [{ id: INVITE_ID, attempt_id: 'a1', user_id: OTHER_ID, email: 'new@example.test' }], error: null }));
    h.admin.onRpc('kit_fail_invite', () => ({ data: true, error: null }));
    h.admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: OTHER_ID, banned_until: '2126-01-01T00:00:00Z' } }, error: null });
    const result = await createAuthMaintenance(h.deps).reconcileInvites();
    expect(result).toEqual({ failed: 1, usersDeleted: 1, problems: 0 });
    expect(h.admin.auth.admin.deleteUser).toHaveBeenCalledWith(OTHER_ID);

    h.admin.auth.admin.deleteUser.mockClear();
    h.admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: OTHER_ID, banned_until: null } }, error: null });
    await createAuthMaintenance(h.deps).reconcileInvites();
    expect(h.admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe('auth helpers', () => {
  const redirected = (path: string): never => {
    throw new Error(`redirect:${path}`);
  };
  const helpers = (h: Harness) => createAuthHelpers({ config: h.config, serverClient: h.deps.serverClient, redirect: redirected });

  it('requireRole lets the right role through and redirects the rest', async () => {
    const host = harness('host');
    expect((await helpers(host).requireRole(['host'])).role).toBe('host');
    await expect(helpers(host).requireRole(['admin'])).rejects.toThrow('redirect:/host');
    await expect(helpers(harness('pending')).requireRole(['host'])).rejects.toThrow('redirect:/pending');
    const out = harness();
    out.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(helpers(out).requireRole(['host'])).rejects.toThrow('redirect:/login');
  });

  it('getCurrentRole is null for pending or banned, and throws on an outage rather than saying signed out', async () => {
    expect(await helpers(harness('admin')).getCurrentRole()).toBe('admin');
    expect(await helpers(harness('pending')).getCurrentRole()).toBeNull();
    const banned = harness('host');
    banned.server.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, banned_until: '2126-01-01T00:00:00Z' } }, error: null });
    expect(await helpers(banned).getCurrentRole()).toBeNull();
    const down = harness('host');
    down.server.onRpc('current_staff_role', () => ({ data: null, error: { code: '57P01' } }));
    await expect(helpers(down).getCurrentRole()).rejects.toBeInstanceOf(AuthServiceUnavailableError);
  });

  it('authoriseRoute answers 401, 403 and 503 as JSON with no-store', async () => {
    const out = harness();
    out.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const cases: [Harness, number][] = [[out, 401], [harness('host'), 403]];
    const down = harness('admin');
    down.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: outage() });
    cases.push([down, 503]);
    for (const [h, status] of cases) {
      const result = await helpers(h).authoriseRoute(['admin']);
      expect(result.ok).toBe(false);
      const response = (result as { response: Response }).response;
      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect((await helpers(harness('admin')).authoriseRoute(['admin'])).ok).toBe(true);
  });

  it('authorise gives Server Actions a typed result', async () => {
    expect(await helpers(harness('host')).authorise(['admin'])).toEqual({ ok: false, result: { status: 'error', code: 'unauthorised', error: AUTH_MESSAGES.unauthorised } });
  });
});
