'use client';

import * as React from 'react';
import { TURNSTILE_ACTIONS, type AuthFormAction } from '../shared';
import { Banner } from '../../ui/banner';
import { Button } from '../../ui/button';
import { AuthShell, Field, FormMessage, ScreenHeading, useAuthForm } from './shell';
import { TurnstileWidget, type TurnstileHandle } from './turnstile';

export interface SignInScreenProps {
  /** The app's signIn Server Action. */
  action: AuthFormAction;
  turnstileSiteKey: string;
  /** Where to go after signing in (validated again on the server). */
  next?: string;
  forgotPasswordHref?: string;
  /** A note above the form, e.g. after an invite: "Your account is ready." */
  notice?: string;
  logoSrc?: string;
}

/** Staff sign in: email and password only, invite only (standard section 0). */
export function SignInScreen({ action, turnstileSiteKey, next, forgotPasswordHref = '/forgot-password', notice, logoSrc }: SignInScreenProps): React.ReactElement {
  const turnstile = React.useRef<TurnstileHandle>(null);
  const [state, formAction, pending] = useAuthForm(action, turnstile);
  const failed = state.status === 'error';
  return (
    <AuthShell greeting="Welcome back" logoSrc={logoSrc}>
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        <ScreenHeading title="Staff sign in" lead="Accounts are invite only. Ask an admin if you need one." />
        {notice && state.status === 'idle' ? <Banner tone="success">{notice}</Banner> : null}
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" required aria-invalid={failed || undefined} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required aria-invalid={failed || undefined} />
        <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS.signIn} />
        <Button type="submit" size="lg" block isLoading={pending}>
          Sign in
        </Button>
        <FormMessage state={state} />
        <a href={forgotPasswordHref} className="self-center font-sans text-sm text-accent-text underline underline-offset-4">
          Forgotten your password?
        </a>
      </form>
    </AuthShell>
  );
}
