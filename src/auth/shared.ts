// @anchor-nights/kit/auth/shared: the browser-safe half of the auth module.
//
// Roles, the redirect validator, the form result shape and its messages, the
// password limits for on-screen hints, and the default paths. Nothing here
// touches Supabase, a key or the network, so the screens and an app's client
// components may import it. The server half is @anchor-nights/kit/auth.

// ---------------------------------------------------------------- roles

/** A role that can do something. */
export type AppRole = 'admin' | 'host';
/** What profiles.role may hold. A pending account can do nothing. */
export type StoredRole = AppRole | 'pending';

export const APP_ROLES: readonly AppRole[] = Object.freeze(['admin', 'host']);

/**
 * The stored role as an AppRole, or null. 'pending', a missing profile and
 * any value outside AppRole all mean no access, so a page that only checks
 * for a role cannot let them through. (From Quiz Night's src/lib/auth.ts.)
 */
export function toAppRole(value: unknown): AppRole | null {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value) ? (value as AppRole) : null;
}

/** True when `role` is one of `allowed`. Never an ordered comparison. */
export function roleSatisfies(role: AppRole | null, allowed: readonly AppRole[]): boolean {
  return role !== null && allowed.includes(role);
}

// ---------------------------------------------------------------- paths

export interface AuthPaths {
  signIn: string;
  pending: string;
  forgotPassword: string;
  /** The emailed recovery link lands here. Must be under /auth (the grant cookie's path). */
  confirm: string;
  /** Where a confirmed recovery sets the new password. Must be under /auth. */
  resetPassword: string;
  acceptInvite: string;
  /** Where staff land when no `next` was asked for. */
  home: string;
}

export const DEFAULT_AUTH_PATHS: Readonly<AuthPaths> = Object.freeze({
  signIn: '/login',
  pending: '/pending',
  forgotPassword: '/forgot-password',
  confirm: '/auth/confirm',
  resetPassword: '/auth/reset-password',
  acceptInvite: '/invite',
  home: '/',
});

// ---------------------------------------------------------------- redirects

const MAX_NEXT_LENGTH = 512;
const BASE = 'https://kit.invalid';

/**
 * The one shared same-origin path validator (standard section 3). Returns
 * `raw` as a path when it is a plain same-origin path, otherwise `fallback`.
 * Refused: absolute URLs, `//host`, backslashes, encoded slashes or
 * backslashes, control characters, anything over 512 characters, and the
 * auth pages themselves (a loop back to sign-in).
 */
export function safeNextPath(
  raw: unknown,
  fallback: string,
  authPaths: Readonly<Partial<AuthPaths>> = DEFAULT_AUTH_PATHS,
): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // Control characters (including tab and newline, which URL parsing drops)
  // and any backslash, raw or encoded.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  if (/%(2f|5c|00|0a|0d|09)/i.test(raw)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== BASE) return fallback;

  const path = parsed.pathname;
  const loops = [authPaths.signIn, authPaths.pending, authPaths.forgotPassword, authPaths.confirm, authPaths.resetPassword, authPaths.acceptInvite]
    .filter((p): p is string => typeof p === 'string' && p !== '/');
  if (loops.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;

  return `${path}${parsed.search}${parsed.hash}`;
}

// ---------------------------------------------------------------- results

/**
 * The shared typed result (standard section 9). Every public message is
 * generic and enumeration-safe: a wrong password, an unknown email and a
 * throttled attempt read the same.
 */
export type AuthErrorCode =
  | 'unauthenticated'
  | 'unauthorised'
  | 'rate_limited'
  | 'captcha_failed'
  | 'validation_failed'
  | 'invalid_link'
  | 'service_unavailable'
  | 'unexpected';

export type AuthFormState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message?: string;
      /** Where the screen should go next (a full page load, so the proxy sees the new session). */
      redirectTo?: string;
      /** Extra data for the screen, for example an invite link. */
      data?: Record<string, string>;
    }
  | {
      status: 'error';
      code: AuthErrorCode;
      error: string;
      /** The form field the error belongs to, when it is about one field. */
      field?: string;
      /** The screen should offer a fresh reset link. */
      offerNewLink?: boolean;
    };

export const IDLE: AuthFormState = Object.freeze({ status: 'idle' });

/** A server action as the kit's screens call it (React's useActionState shape). */
export type AuthFormAction = (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export const AUTH_MESSAGES = Object.freeze({
  signInFailed: 'That email and password did not work. Check them and try again, or reset your password.',
  signInMissing: 'Enter your email address and password.',
  captchaFailed: 'The security check did not pass. Wait for it to finish, then try again.',
  serviceUnavailable: 'We could not reach the sign-in service. Please try again in a minute.',
  unexpected: 'Something went wrong. Please try again.',
  resetSent: 'If that address has an account, we have sent it a link to reset the password. The link works for 60 minutes.',
  resetUnavailable: 'We could not send the reset email just now. Please try again in a few minutes.',
  invalidEmail: 'Enter a valid email address.',
  recoveryLinkInvalid: 'This reset link has expired or has already been used. Ask for a new one.',
  recoverySessionExpired: 'Your reset session has run out. Ask for a new reset link.',
  passwordChanged: 'Your password is changed. Other devices have been signed out.',
  passwordChangedOthersRemain:
    'Your password is changed, but we could not sign out your other devices, so they may still be signed in. Tell an admin if you are worried.',
  passwordUpdateFailed: 'We could not change your password. Ask for a new reset link and try again.',
  currentPasswordWrong: 'Your current password is not right.',
  inviteLinkInvalid: 'This invite link is not valid. Ask the person who invited you for a new one.',
  inviteUnusable: 'This invite has expired, been replaced or already been used. Ask the person who invited you for a new one.',
  inviteSetupFailed: 'We could not set up your account. Ask the person who invited you to send a new invite.',
  inviteNotSwitchedOn: 'Your account is set up, but we could not switch it on. Ask an admin to finish it for you.',
  inviteReadySignIn: 'Your account is ready. Sign in with your new password.',
  signOutFailed: 'We could not sign you out. Please try again.',
  unauthenticated: 'Please sign in again.',
  unauthorised: 'You do not have access to do that.',
});

// ---------------------------------------------------------------- passwords

/** Standard section 12: at least 12 characters, at most 72 bytes, no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_MESSAGES = Object.freeze({
  empty: 'Enter a password.',
  tooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  tooLong: `That password is too long. Use ${PASSWORD_MAX_BYTES} bytes or fewer (72 plain letters, fewer with accents or emoji).`,
  breached: 'That password has appeared in a data breach, so it is easy to guess. Choose a different one.',
  sameAsCurrent: 'Choose a password that is different from your current one.',
  mismatch: 'The two passwords do not match.',
});

/** The password's length in characters (code points, not UTF-16 units). */
export function passwordLength(password: string): number {
  return [...password].length;
}

/** The password's length in UTF-8 bytes, which is what bcrypt counts. */
export function passwordBytes(password: string): number {
  return new TextEncoder().encode(password).byteLength;
}

/**
 * The length rules only, for an on-screen hint as the user types. The server
 * check (validatePassword in @anchor-nights/kit/auth) is the one that counts.
 */
export function passwordLengthProblem(password: string): string | null {
  if (password.length === 0) return PASSWORD_MESSAGES.empty;
  if (passwordLength(password) < PASSWORD_MIN_LENGTH) return PASSWORD_MESSAGES.tooShort;
  if (passwordBytes(password) > PASSWORD_MAX_BYTES) return PASSWORD_MESSAGES.tooLong;
  return null;
}

// ---------------------------------------------------------------- form fields

/** The field Turnstile writes its token into. */
export const CAPTCHA_FIELD = 'cf-turnstile-response';

/** Turnstile actions, one per widget. Hostnames are restricted in the widget's own settings. */
export const TURNSTILE_ACTIONS = Object.freeze({
  signIn: 'sign_in',
  forgotPassword: 'forgot_password',
  acceptInvite: 'accept_invite',
  changePassword: 'change_password',
});
