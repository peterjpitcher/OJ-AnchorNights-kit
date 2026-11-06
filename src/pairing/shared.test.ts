import { describe, expect, it } from 'vitest';
import {
  formatPairingCode,
  isRehearsalRequest,
  normalisePairingCode,
  normaliseTvName,
  tvDeviceCookieName,
  tvPairingCookieName,
} from './shared';

describe('pairing codes', () => {
  it('accepts six digits with spaces, dashes or dots, and nothing else', () => {
    expect(normalisePairingCode('123456')).toBe('123456');
    expect(normalisePairingCode(' 123 456 ')).toBe('123456');
    expect(normalisePairingCode('123-456')).toBe('123456');
    expect(normalisePairingCode('012.345')).toBe('012345');
    for (const bad of ['12345', '1234567', '12345a', '１２３４５６', '', null, 123456]) expect(normalisePairingCode(bad)).toBeNull();
  });

  it('groups the code in threes for the TV', () => {
    expect(formatPairingCode('012345')).toBe('012 345');
  });
});

describe('normaliseTvName', () => {
  it('trims and squeezes, defaults when blank, refuses over 40 characters', () => {
    expect(normaliseTvName('  Bar \n TV ')).toBe('Bar TV');
    expect(normaliseTvName('')).toBe('Pub TV');
    expect(normaliseTvName(undefined)).toBe('Pub TV');
    expect(normaliseTvName('x'.repeat(40))).toHaveLength(40);
    expect(normaliseTvName('x'.repeat(41))).toBeNull();
  });
});

describe('isRehearsalRequest', () => {
  it('is true only for rehearsal=1 exactly', () => {
    expect(isRehearsalRequest({ rehearsal: '1' })).toBe(true);
    expect(isRehearsalRequest(new URLSearchParams('rehearsal=1'))).toBe(true);
    expect(isRehearsalRequest(new URL('https://x.test/tv?rehearsal=1'))).toBe(true);
    for (const value of ['true', '0', 'yes', '', undefined]) expect(isRehearsalRequest({ rehearsal: value })).toBe(false);
    expect(isRehearsalRequest({ rehearsal: ['1', '1'] })).toBe(false);
    expect(isRehearsalRequest(new URLSearchParams('rehearsal=1&rehearsal=0'))).toBe(false);
    expect(isRehearsalRequest(null)).toBe(false);
  });
});

describe('cookie names', () => {
  it('use the __Host- prefix on https only', () => {
    expect(tvDeviceCookieName(true)).toBe('__Host-anchor-tv');
    expect(tvDeviceCookieName(false)).toBe('anchor-tv');
    expect(tvPairingCookieName(true)).toBe('__Host-anchor-tv-pairing');
  });
});
