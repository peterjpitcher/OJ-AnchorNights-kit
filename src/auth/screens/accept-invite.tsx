'use client';

import * as React from 'react';
import { TURNSTILE_ACTIONS, type AuthFormAction } from '../shared';
import { Button } from '../../ui/button';
import { NewPasswordFields } from './passwords';
import { AuthShell, FormMessage, ScreenHeading, useAuthForm } from './shell';
import { TurnstileWidget, type TurnstileHandle } from './turnstile';

export interface AcceptInviteScreenProps {
  /** The app's acceptInvite Server Action. */
  action: AuthFormAction;
  /** For signing the new account straight in (Supabase CAPTCHA applies to that sign-in). */
  turnstileSiteKey: string;
  logoSrc?: string;
}

/** Reads the invite token from the link's fragment (#t=...), which never reaches a server log, then hides it. */
function readInviteToken(): string {
  const match = /(?:^#|&)t=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  return match ? match[1] : '';
}

/**
 * The invite link. Accepting is a form POST, never something opening the
 * link does by itself.
 */
export function AcceptInviteScreen({ action, turnstileSiteKey, logoSrc }: AcceptInviteScreenProps): React.ReactElement {
  const turnstile = React.useRef<TurnstileHandle>(null);
  const [state, formAction, pending] = useAuthForm(action, turnstile);
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    const found = readInviteToken();
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    // Reading the address bar is a one-off effect on mount.
    setToken(found);
  }, []);

  if (token === '') {
    return (
      <AuthShell logoSrc={logoSrc}>
        <ScreenHeading title="This invite link is incomplete" lead="Open the whole link you were sent, or ask the person who invited you for a new one." />
      </AuthShell>
    );
  }

  return (
    <AuthShell greeting="Welcome aboard" logoSrc={logoSrc}>
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        <ScreenHeading title="Set up your account" lead="Choose the password you will sign in with." />
        <input type="hidden" name="token" value={token ?? ''} />
        <NewPasswordFields state={state} label="Password" />
        <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS.acceptInvite} />
        <Button type="submit" size="lg" block isLoading={pending} disabled={token === null}>
          Create my account
        </Button>
        <FormMessage state={state} />
      </form>
    </AuthShell>
  );
}
