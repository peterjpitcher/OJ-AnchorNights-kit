'use client';

import * as React from 'react';
import type { AuthFormAction } from '../shared';
import { Button } from '../../ui/button';
import { AuthShell, FormMessage, ScreenHeading, useAuthForm } from './shell';

export interface ConfirmRecoveryScreenProps {
  /** The app's confirmRecovery Server Action (the POST that verifies the link). */
  action: AuthFormAction;
  /** From the link's query string. */
  tokenHash?: string;
  type?: string;
  forgotPasswordHref?: string;
  logoSrc?: string;
}

/**
 * /auth/confirm. Opening the link does nothing by itself (mail scanners open
 * links too): the person presses Continue, which POSTs. The token is taken
 * off the address bar as soon as the page has it.
 */
export function ConfirmRecoveryScreen({ action, tokenHash, type, forgotPasswordHref = '/forgot-password', logoSrc }: ConfirmRecoveryScreenProps): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(action);
  React.useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const usable = Boolean(tokenHash) && type === 'recovery';
  return (
    <AuthShell logoSrc={logoSrc}>
      <form action={formAction} className="flex flex-col gap-[18px]">
        <ScreenHeading
          title="Reset your password"
          lead={usable ? 'Press Continue to choose a new password.' : 'This link is incomplete. Ask for a new one.'}
        />
        <input type="hidden" name="token_hash" value={tokenHash ?? ''} />
        <input type="hidden" name="type" value={type ?? ''} />
        {usable ? (
          <Button type="submit" size="lg" block isLoading={pending}>
            Continue
          </Button>
        ) : null}
        <FormMessage state={state} />
        {!usable || (state.status === 'error' && state.offerNewLink) ? (
          <a href={forgotPasswordHref} className="self-center font-sans text-sm text-accent-text underline underline-offset-4">
            Ask for a new link
          </a>
        ) : null}
      </form>
    </AuthShell>
  );
}
