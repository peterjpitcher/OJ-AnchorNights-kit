'use client';

import * as React from 'react';
import type { AuthFormState } from '../shared';
import { Kicker } from '../../ui/kicker';
import { AuthShell } from './shell';
import { SignOutButton } from './sign-out';

export interface PendingScreenProps {
  /** The signed-in account's email. */
  email?: string | null;
  signOutAction: () => Promise<AuthFormState>;
  logoSrc?: string;
}

/**
 * Where a signed-in account with no role lands (pending, deactivated, or
 * waiting for an admin). Without it the account would bounce between sign-in
 * and the home page, which reads as a broken sign-in. (From Cash Bingo's
 * /pending.) It offers no in-app request flow, because nobody reads one.
 */
export function PendingScreen({ email, signOutAction, logoSrc }: PendingScreenProps): React.ReactElement {
  return (
    <AuthShell logoSrc={logoSrc}>
      <div className="flex flex-col items-center gap-3.5 text-center">
        <Kicker>Nearly there</Kicker>
        <h1 className="font-display text-[28px] leading-[1.05] text-fg-strong">Your account is waiting for access</h1>
        {email ? (
          <p className="font-sans text-[15px] leading-normal">
            You are signed in as <strong className="break-all font-semibold">{email}</strong>, but the account has not been given access yet.
          </p>
        ) : null}
        <p className="font-sans text-sm leading-normal text-fg-muted">
          An admin switches staff accounts on. Ask whoever set up your account, then sign in again.
        </p>
        <SignOutButton action={signOutAction} block />
      </div>
    </AuthShell>
  );
}
