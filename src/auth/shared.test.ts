import { describe, expect, it } from 'vitest';
import {
  AUTH_MESSAGES,
  DEFAULT_AUTH_PATHS,
  PASSWORD_MESSAGES,
  passwordBytes,
  passwordLength,
  passwordLengthProblem,
  roleSatisfies,
  safeNextPath,
  toAppRole,
} from './shared';

describe('toAppRole', () => {
  it('lets only admin and host through', () => {
    expect(toAppRole('admin')).toBe('admin');
    expect(toAppRole('host')).toBe('host');
    for (const value of ['pending', 'Admin', ' host', '', null, undefined, 1, {}, ['admin']]) {
      expect(toAppRole(value), String(value)).toBeNull();
    }
  });
});

describe('roleSatisfies', () => {
  it('is membership, never an ordering', () => {
    expect(roleSatisfies('admin', ['admin'])).toBe(true);
    expect(roleSatisfies('host', ['admin'])).toBe(false);
    expect(roleSatisfies('admin', ['host'])).toBe(false);
    expect(roleSatisfies(null, ['admin', 'host'])).toBe(false);
  });
});

describe('safeNextPath', () => {
  const fallback = '/home';

  it('keeps a plain same-origin path with its query and hash', () => {
    expect(safeNextPath('/sessions/42', fallback)).toBe('/sessions/42');
    expect(safeNextPath('/sessions?tab=live#top', fallback)).toBe('/sessions?tab=live#top');
    expect(safeNextPath('/', fallback)).toBe('/');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/x'],
    ['a protocol-relative URL', '//evil.example/x'],
    ['a backslash host', '/\\evil.example'],
    ['a leading backslash', '\\\\evil.example'],
    ['an encoded slash', '/%2f%2fevil.example'],
    ['an encoded backslash', '/%5cevil.example'],
    ['an encoded newline', '/x%0aSet-Cookie:a=b'],
    ['a raw tab', '/\t/evil.example'],
    ['a raw newline', '/x\ny'],
    ['a null byte', '/x\u0000'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a relative path', 'sessions'],
    ['an empty string', ''],
    ['something too long', `/${'a'.repeat(600)}`],
    ['the sign-in page (a loop)', '/login'],
    ['the sign-in page with a query', '/login?next=/x'],
    ['the pending page', '/pending'],
    ['the confirm page', '/auth/confirm'],
    ['the reset page', '/auth/reset-password'],
    ['the invite page', '/invite'],
    ['a dot-segment escape to sign-in', '/x/../login'],
  ])('refuses %s', (_label, raw) => {
    expect(safeNextPath(raw, fallback)).toBe(fallback);
  });

  it('refuses anything that is not a string', () => {
    for (const value of [null, undefined, 42, ['/x'], { toString: () => '/x' }]) {
      expect(safeNextPath(value, fallback)).toBe(fallback);
    }
  });

  it('uses the app paths when they differ from the defaults', () => {
    const paths = { ...DEFAULT_AUTH_PATHS, signIn: '/sign-in' };
    expect(safeNextPath('/sign-in', fallback, paths)).toBe(fallback);
    expect(safeNextPath('/login', fallback, paths)).toBe('/login');
  });

  it('does not treat a longer segment as the auth page', () => {
    expect(safeNextPath('/login-history', fallback)).toBe('/login-history');
    expect(safeNextPath('/invites', fallback)).toBe('/invites');
  });
});

describe('password length rules', () => {
  it('counts characters as code points and bytes as UTF-8', () => {
    expect(passwordLength('a'.repeat(12))).toBe(12);
    expect(passwordLength('😀'.repeat(12))).toBe(12);
    expect(passwordBytes('😀')).toBe(4);
    expect(passwordBytes('é')).toBe(2);
  });

  it('gives the hint the server would give', () => {
    expect(passwordLengthProblem('')).toBe(PASSWORD_MESSAGES.empty);
    expect(passwordLengthProblem('a'.repeat(11))).toBe(PASSWORD_MESSAGES.tooShort);
    expect(passwordLengthProblem('a'.repeat(12))).toBeNull();
    expect(passwordLengthProblem('a'.repeat(72))).toBeNull();
    expect(passwordLengthProblem('a'.repeat(73))).toBe(PASSWORD_MESSAGES.tooLong);
    expect(passwordLengthProblem('😀'.repeat(19))).toBe(PASSWORD_MESSAGES.tooLong);
  });
});

describe('public messages', () => {
  it('say the same thing for a wrong password, an unknown email and a throttle', () => {
    // One message serves all three, so the screen cannot reveal which it was.
    expect(AUTH_MESSAGES.signInFailed).not.toMatch(/locked|unknown|no account|too many/i);
    expect(AUTH_MESSAGES.resetSent).toMatch(/^If that address has an account/);
  });
});
