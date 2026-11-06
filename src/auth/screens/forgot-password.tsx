'use client';

import * as React from 'react';
import { TURNSTILE_ACTIONS, type AuthFormAction } from '../shared';
import { Button } from '../../ui/button';
import { AuthShell, Field, FormMessage, ScreenHeading, fieldError, useAuthForm } from './shell';
import { TurnstileWidget, type TurnstileHandle } from './turnstile';

export interface ForgotPasswordScreenProps {
  action: AuthFormAction;
  turnstileSiteKey: string;
  signInHref?: string;
  logoSrc?: string;
}

/** Ask for a reset link. Always the same answer, whether or not the address has an account. */
export function ForgotPasswordScreen({ action, turnstileSiteKey, signInHref = '/login', logoSrc }: ForgotPasswordScreenProps): React.ReactElement {
  const turnstile = React.useRef<TurnstileHandle>(null);
  const [state, formAction, pending] = useAuthForm(action, turnstile);
  return (
    <AuthShell logoSrc={logoSrc}>
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        <ScreenHeading title="Reset your password" lead="Enter the email you sign in with. We will send a link that works for 60 minutes." />
        <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" required error={fieldError(state, 'email')} />
        <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS.forgotPassword} />
        <Button type="submit" size="lg" block isLoading={pending}>
          Send the link
        </Button>
        <FormMessage state={state} />
        <a href={signInHref} className="self-center font-sans text-sm text-accent-text underline underline-offset-4">
          Back to sign in
        </a>
      </form>
    </AuthShell>
  );
}
