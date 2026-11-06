'use client';

import * as React from 'react';
import { AUTH_MESSAGES, type AuthFormState } from '../shared';
import { Button, type ButtonVariant } from '../../ui/button';
import { navigation } from './shell';

export interface SignOutButtonProps {
  /** The app's signOut Server Action (a POST; never a link). */
  action: () => Promise<AuthFormState>;
  label?: string;
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
}

/** Signs out this device only (scope 'local'). Says so plainly if it did not work. */
export function SignOutButton({ action, label = 'Sign out', variant = 'outline', block = false, className }: SignOutButtonProps): React.ReactElement {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const onClick = (): void => {
    setError(null);
    startTransition(async () => {
      let result: AuthFormState;
      try {
        result = await action();
      } catch {
        result = { status: 'error', code: 'service_unavailable', error: AUTH_MESSAGES.signOutFailed };
      }
      if (result.status === 'ok') navigation.assign(result.redirectTo ?? '/login');
      else if (result.status === 'error') setError(result.error);
    });
  };
  return (
    <div className={block ? 'flex w-full flex-col gap-2' : 'inline-flex flex-col gap-2'}>
      <Button type="button" variant={variant} block={block} className={className} isLoading={pending} onClick={onClick}>
        {label}
      </Button>
      {error ? (
        <p role="alert" className="font-sans text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
