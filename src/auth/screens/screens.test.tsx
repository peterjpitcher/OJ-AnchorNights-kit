// @vitest-environment jsdom
// The screens with a stub action: each public form shows the person the
// error its action returned, and a message when the action could not be
// reached at all (it threw). Never a blank screen or a silent success.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AUTH_MESSAGES, type AuthFormAction, type AuthFormState } from '../shared';
import {
  AcceptInviteScreen,
  ConfirmRecoveryScreen,
  ForgotPasswordScreen,
  InvitePanel,
  PendingScreen,
  ResetPasswordScreen,
  SignInScreen,
  SignOutButton,
  StaffPanel,
  navigation,
} from './index';

const TOKEN = 'A'.repeat(43);

beforeEach(() => {
  // Turnstile "loads" at once and hands back a widget id; reset is watched.
  const turnstile = { render: vi.fn(() => 'w1'), reset: vi.fn(), remove: vi.fn() };
  Object.assign(window, { turnstile });
  vi.spyOn(navigation, 'assign').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { turnstile?: unknown }).turnstile;
  window.history.replaceState(null, '', '/');
});

const failing = (code: string, error: string): AuthFormAction => vi.fn(async (): Promise<AuthFormState> => ({ status: 'error', code: code as 'unexpected', error }));
const throwing = (): AuthFormAction =>
  vi.fn(async (): Promise<AuthFormState> => {
    throw new Error('Failed to fetch');
  });

async function submit(name: RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('SignInScreen', () => {
  it('shows the action error as an alert and resets Turnstile', async () => {
    render(<SignInScreen action={failing('validation_failed', AUTH_MESSAGES.signInFailed)} turnstileSiteKey="site-key" />);
    fill(/email/i, 'host@example.test');
    fill(/^password$/i, 'wrong-password');
    await submit(/sign in/i);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining(AUTH_MESSAGES.signInFailed));
    await waitFor(() => expect(window.turnstile!.reset).toHaveBeenCalled());
  });

  it('shows a service message when the action cannot be reached', async () => {
    render(<SignInScreen action={throwing()} turnstileSiteKey="site-key" />);
    await submit(/sign in/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.serviceUnavailable);
  });

  it('follows the redirect with a full page load on success', async () => {
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: 'ok', redirectTo: '/host' }));
    render(<SignInScreen action={action} turnstileSiteKey="site-key" next="/host/x" />);
    await submit(/sign in/i);
    await waitFor(() => expect(navigation.assign).toHaveBeenCalledWith('/host'));
    const sent = action.mock.calls[0] as unknown as [AuthFormState, FormData];
    expect(sent[1].get('next')).toBe('/host/x');
  });
});

describe('ForgotPasswordScreen', () => {
  it('shows an error when the reset email could not be sent', async () => {
    render(<ForgotPasswordScreen action={failing('service_unavailable', AUTH_MESSAGES.resetUnavailable)} turnstileSiteKey="site-key" />);
    fill(/email/i, 'host@example.test');
    await submit(/send|reset|link/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.resetUnavailable);
  });

  it('shows a service message when the action throws', async () => {
    render(<ForgotPasswordScreen action={throwing()} turnstileSiteKey="site-key" />);
    await submit(/send|reset|link/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.serviceUnavailable);
  });
});

describe('ConfirmRecoveryScreen', () => {
  it('does nothing until Continue is pressed, then POSTs the token and offers a new link on failure', async () => {
    window.history.replaceState(null, '', '/auth/confirm?token_hash=abc&type=recovery');
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: 'error', code: 'invalid_link', error: AUTH_MESSAGES.recoveryLinkInvalid, offerNewLink: true }));
    render(<ConfirmRecoveryScreen action={action} tokenHash="abc123" type="recovery" />);
    expect(window.location.search).toBe('');
    expect(action).not.toHaveBeenCalled();
    await submit(/continue/i);
    const sent = action.mock.calls[0] as unknown as [AuthFormState, FormData];
    expect(sent[1].get('token_hash')).toBe('abc123');
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.recoveryLinkInvalid);
    expect(screen.getByRole('link', { name: /new link/i })).toBeTruthy();
  });

  it('offers no Continue for a link that is not a recovery link', () => {
    render(<ConfirmRecoveryScreen action={vi.fn()} tokenHash="abc123" type="magiclink" />);
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  });
});

describe('ResetPasswordScreen', () => {
  it('shows the error when the password could not be set', async () => {
    render(<ResetPasswordScreen action={failing('service_unavailable', AUTH_MESSAGES.passwordUpdateFailed)} />);
    await submit(/password/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.passwordUpdateFailed);
  });

  it('shows a service message when the action throws', async () => {
    render(<ResetPasswordScreen action={throwing()} />);
    await submit(/password/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.serviceUnavailable);
  });
});

describe('AcceptInviteScreen', () => {
  it('reads the token from the fragment, takes it off the address bar and posts it', async () => {
    window.history.replaceState(null, '', `/invite#t=${TOKEN}`);
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: 'error', code: 'service_unavailable', error: AUTH_MESSAGES.inviteSetupFailed }));
    render(<AcceptInviteScreen action={action} turnstileSiteKey="site-key" />);
    await waitFor(() => expect(window.location.hash).toBe(''));
    await submit(/create my account/i);
    const sent = action.mock.calls[0] as unknown as [AuthFormState, FormData];
    expect(sent[1].get('token')).toBe(TOKEN);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.inviteSetupFailed);
  });

  it('shows a service message when the action throws', async () => {
    window.history.replaceState(null, '', `/invite#t=${TOKEN}`);
    render(<AcceptInviteScreen action={throwing()} turnstileSiteKey="site-key" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /create my account/i })).toHaveProperty('disabled', false));
    await submit(/create my account/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.serviceUnavailable);
  });

  it('explains an incomplete link instead of showing the form', async () => {
    window.history.replaceState(null, '', '/invite');
    render(<AcceptInviteScreen action={vi.fn()} turnstileSiteKey="site-key" />);
    expect(await screen.findByText(/invite link is incomplete/i)).toBeTruthy();
  });
});

describe('PendingScreen and SignOutButton', () => {
  it('shows the waiting message and signs out', async () => {
    const signOut = vi.fn(async (): Promise<AuthFormState> => ({ status: 'ok', redirectTo: '/login' }));
    render(<PendingScreen signOutAction={signOut} />);
    expect(screen.getByText('Your account is waiting for access')).toBeTruthy();
    await submit(/sign out/i);
    await waitFor(() => expect(navigation.assign).toHaveBeenCalledWith('/login'));
  });

  it('says so when the sign-out failed', async () => {
    render(<SignOutButton action={vi.fn(async (): Promise<AuthFormState> => ({ status: 'error', code: 'service_unavailable', error: AUTH_MESSAGES.signOutFailed }))} />);
    await submit(/sign out/i);
    expect((await screen.findByRole('alert')).textContent).toContain(AUTH_MESSAGES.signOutFailed);
    expect(navigation.assign).not.toHaveBeenCalled();
  });
});

describe('admin panels', () => {
  it('shows the invite link once with a copy button', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const issue = vi.fn(async (): Promise<AuthFormState> => ({ status: 'ok', message: 'Invite ready.', data: { inviteUrl: `https://quiz.example.test/invite#t=${TOKEN}` } }));
    render(<InvitePanel issueAction={issue} cancelAction={vi.fn()} invites={[]} />);
    fill(/their email address/i, 'new@example.test');
    await submit(/create invite link/i);
    expect(((await screen.findByLabelText(/invite link/i)) as HTMLInputElement).value).toContain('#t=');
    await submit(/copy link/i);
    expect(writeText).toHaveBeenCalledWith(`https://quiz.example.test/invite#t=${TOKEN}`);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('hides self-service actions for the signed-in admin', () => {
    render(
      <StaffPanel
        staff={[
          { userId: 'me', email: 'me@example.test', role: 'admin', active: true, deactivatedAt: null },
          { userId: 'you', email: 'you@example.test', role: 'host', active: true, deactivatedAt: null },
        ]}
        currentUserId="me"
        changeRoleAction={vi.fn()}
        deactivateAction={vi.fn()}
        reactivateAction={vi.fn()}
        revokeSessionsAction={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /deactivate/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /make admin/i })).toBeTruthy();
  });
});
