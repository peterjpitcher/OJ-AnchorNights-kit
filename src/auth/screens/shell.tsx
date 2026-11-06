'use client';

import * as React from 'react';
import { AUTH_MESSAGES, IDLE, type AuthFormAction, type AuthFormState } from '../shared';
import { Banner } from '../../ui/banner';
import { Card } from '../../ui/card';
import { Input, fieldHintClass, fieldLabelClass } from '../../ui/input';
import { AnchorLogo } from '../../ui/logo';
import type { TurnstileHandle } from './turnstile';

/** The page around every auth screen: logo, script greeting, one card (from Cash Bingo's login). */
export function AuthShell({
  greeting,
  logoSrc,
  children,
  footer,
}: {
  greeting?: string;
  logoSrc?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-fg">
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-5 pb-10 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AnchorLogo height={80} priority src={logoSrc} />
          {greeting ? <span className="font-script text-[32px] text-accent">{greeting}</span> : null}
        </div>
        <Card accent className="px-5 py-6">
          {children}
        </Card>
        {footer}
      </main>
    </div>
  );
}

export function ScreenHeading({ title, lead }: { title: string; lead?: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-[28px] leading-[1.05] text-fg-strong">{title}</h1>
      {lead ? <p className="font-sans text-sm text-fg-muted">{lead}</p> : null}
    </div>
  );
}

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

/** A labelled input whose error is tied to it for screen readers. */
export function Field({ label, name, error, hint, id, ...props }: FieldProps): React.ReactElement {
  const inputId = id ?? `field-${name}`;
  const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label className={fieldLabelClass} htmlFor={inputId}>
        {label}
      </label>
      <Input id={inputId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {hint ? (
        <p id={`${inputId}-hint`} className={fieldHintClass}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="font-sans text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The form's result: an error is announced at once, a success politely. */
export function FormMessage({ state }: { state: AuthFormState }): React.ReactElement | null {
  if (state.status === 'error' && !state.field) return <Banner tone="danger">{state.error}</Banner>;
  if (state.status === 'ok' && state.message) return <Banner tone="success">{state.message}</Banner>;
  return null;
}

/** The error for one field, if the result is about it. */
export function fieldError(state: AuthFormState, field: string): string | undefined {
  return state.status === 'error' && state.field === field ? state.error : undefined;
}

/** Navigates with a full page load, so the proxy sees the new session. A test seam. */
export const navigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/**
 * useActionState plus the two things every auth form does after a
 * submission: reset Turnstile (single-use tokens) and follow a redirect.
 */
export function useAuthForm(
  action: AuthFormAction,
  turnstile?: React.RefObject<TurnstileHandle | null>,
): [AuthFormState, (formData: FormData) => void, boolean] {
  // A Server Action that cannot be reached (offline, a deploy mid-request)
  // throws; the user is told, rather than shown nothing or an error page.
  const safeAction = React.useCallback<AuthFormAction>(
    async (previous, formData) => {
      try {
        return await action(previous, formData);
      } catch {
        return { status: 'error', code: 'service_unavailable', error: AUTH_MESSAGES.serviceUnavailable };
      }
    },
    [action],
  );
  const [state, formAction, pending] = React.useActionState(safeAction, IDLE);
  React.useEffect(() => {
    if (state === IDLE) return;
    turnstile?.current?.reset();
    if (state.status === 'ok' && state.redirectTo) navigation.assign(state.redirectTo);
  }, [state, turnstile]);
  return [state, formAction, pending];
}
