'use client';

import * as React from 'react';
import { TURNSTILE_ACTIONS, type AuthFormAction } from '../shared';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { NewPasswordFields } from './passwords';
import { Field, FormMessage, ScreenHeading, fieldError, useAuthForm } from './shell';
import { TurnstileWidget, type TurnstileHandle } from './turnstile';

export interface ChangePasswordFormProps {
  /** The app's changePassword Server Action. */
  action: AuthFormAction;
  turnstileSiteKey: string;
  className?: string;
}

/** For a signed-in account page: current password (checked on the server), then the new one twice. */
export function ChangePasswordForm({ action, turnstileSiteKey, className }: ChangePasswordFormProps): React.ReactElement {
  const turnstile = React.useRef<TurnstileHandle>(null);
  const [state, formAction, pending] = useAuthForm(action, turnstile);
  return (
    <Card className={className ?? 'px-5 py-6'}>
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        <ScreenHeading title="Change your password" lead="Your other devices are signed out when you save." />
        <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required error={fieldError(state, 'currentPassword')} />
        <NewPasswordFields state={state} />
        <TurnstileWidget ref={turnstile} siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS.changePassword} />
        <Button type="submit" size="lg" block isLoading={pending}>
          Change password
        </Button>
        <FormMessage state={state} />
      </form>
    </Card>
  );
}
