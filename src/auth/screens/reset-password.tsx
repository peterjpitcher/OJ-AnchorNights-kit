'use client';

import * as React from 'react';
import type { AuthFormAction } from '../shared';
import { Button } from '../../ui/button';
import { NewPasswordFields } from './passwords';
import { AuthShell, FormMessage, ScreenHeading, useAuthForm } from './shell';

export interface ResetPasswordScreenProps {
  /** The app's resetPassword Server Action (needs the recovery grant cookie). */
  action: AuthFormAction;
  forgotPasswordHref?: string;
  logoSrc?: string;
}

export function ResetPasswordScreen({ action, forgotPasswordHref = '/forgot-password', logoSrc }: ResetPasswordScreenProps): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(action);
  return (
    <AuthShell logoSrc={logoSrc}>
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        <ScreenHeading title="Choose a new password" lead="You have 10 minutes. Other devices are signed out when you save." />
        <NewPasswordFields state={state} />
        <Button type="submit" size="lg" block isLoading={pending}>
          Save the new password
        </Button>
        <FormMessage state={state} />
        {state.status === 'error' && state.offerNewLink ? (
          <a href={forgotPasswordHref} className="self-center font-sans text-sm text-accent-text underline underline-offset-4">
            Ask for a new link
          </a>
        ) : null}
      </form>
    </AuthShell>
  );
}
