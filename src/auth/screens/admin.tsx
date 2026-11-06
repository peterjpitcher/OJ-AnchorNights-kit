'use client';

import * as React from 'react';
import type { AppRole, AuthFormAction } from '../shared';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { fieldClass, fieldLabelClass } from '../../ui/input';
import { formatDateTimeInLondon } from '../../dates';
import { Field, FormMessage, ScreenHeading, fieldError, useAuthForm } from './shell';

// The admin side of invite-only accounts (spec S1.3): issue an invite and copy
// its link to send by text or WhatsApp, cancel one, and run the leaver,
// rehire, role and sign-out-everywhere actions. Every action is re-checked on
// the server; these screens only collect the request.

export interface InviteRow {
  id: string;
  email: string;
  role: AppRole;
  status: 'pending' | 'accepting';
  expiresAt: string;
}

export interface InvitePanelProps {
  issueAction: AuthFormAction;
  cancelAction: AuthFormAction;
  invites: readonly InviteRow[];
}

function CopyLink({ url }: { url: string }): React.ReactElement {
  const [copied, setCopied] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <label className={fieldLabelClass} htmlFor="invite-link">
        Invite link
      </label>
      <input id="invite-link" readOnly value={url} className={fieldClass} onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        {copied === 'copied' ? 'Copied' : 'Copy link'}
      </Button>
      <p aria-live="polite" className="font-sans text-sm text-fg-muted">
        {copied === 'failed' ? 'Copying did not work here. Select the link and copy it by hand.' : 'This is the only time the link is shown.'}
      </p>
    </div>
  );
}

function CancelInvite({ action, invite }: { action: AuthFormAction; invite: InviteRow }): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(action);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="inviteId" value={invite.id} />
      <Button type="submit" variant="ghost" tone="quiet" size="sm" isLoading={pending} disabled={invite.status !== 'pending'}>
        Cancel
      </Button>
      {state.status === 'error' ? <span className="font-sans text-sm text-danger-text">{state.error}</span> : null}
    </form>
  );
}

export function InvitePanel({ issueAction, cancelAction, invites }: InvitePanelProps): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(issueAction);
  const link = state.status === 'ok' ? state.data?.inviteUrl : undefined;
  return (
    <Card className="flex flex-col gap-6 px-5 py-6">
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        <ScreenHeading title="Invite someone" lead="They get a link that works once, for 7 days. Sending it again later cancels this one." />
        <Field label="Their email address" name="email" type="email" autoComplete="off" required error={fieldError(state, 'email')} />
        <div className="flex flex-col gap-2">
          <label className={fieldLabelClass} htmlFor="invite-role">
            Role
          </label>
          <select id="invite-role" name="role" defaultValue="host" className={fieldClass}>
            <option value="host">Host</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" isLoading={pending}>
          Create invite link
        </Button>
        <FormMessage state={state} />
        {link ? <CopyLink url={link} /> : null}
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-fg-strong">Waiting to be accepted</h2>
        {invites.length === 0 ? (
          <p className="font-sans text-sm text-fg-muted">No invites are waiting.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="break-all font-sans font-semibold">{invite.email}</span>
                  <span className="font-sans text-sm text-fg-muted">
                    {invite.role === 'admin' ? 'Admin' : 'Host'}, {invite.status === 'accepting' ? 'being accepted now' : `until ${formatDateTimeInLondon(invite.expiresAt)}`}
                  </span>
                </div>
                <CancelInvite action={cancelAction} invite={invite} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export interface StaffRow {
  userId: string;
  email: string | null;
  role: AppRole | 'pending';
  active: boolean;
  deactivatedAt: string | null;
}

export interface StaffPanelProps {
  staff: readonly StaffRow[];
  /** The signed-in admin, who cannot change or deactivate themselves here. */
  currentUserId: string;
  changeRoleAction: AuthFormAction;
  deactivateAction: AuthFormAction;
  reactivateAction: AuthFormAction;
  revokeSessionsAction: AuthFormAction;
}

function RowAction({
  action,
  userId,
  label,
  role,
  confirmText,
}: {
  action: AuthFormAction;
  userId: string;
  label: string;
  role?: AppRole;
  confirmText?: string;
}): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(action);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    if (confirmText && !window.confirm(confirmText)) event.preventDefault();
  };
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      {role ? <input type="hidden" name="role" value={role} /> : null}
      <Button type="submit" variant="outline" size="sm" isLoading={pending}>
        {label}
      </Button>
      {state.status !== 'idle' ? (
        <span className={state.status === 'error' ? 'font-sans text-sm text-danger-text' : 'font-sans text-sm text-success-text'}>
          {state.status === 'error' ? state.error : state.message}
        </span>
      ) : null}
    </form>
  );
}

export function StaffPanel({ staff, currentUserId, changeRoleAction, deactivateAction, reactivateAction, revokeSessionsAction }: StaffPanelProps): React.ReactElement {
  return (
    <Card className="flex flex-col gap-3 px-5 py-6">
      <ScreenHeading title="Staff" lead="Deactivating someone ends their access at once and signs them out everywhere." />
      <ul className="flex flex-col divide-y divide-line">
        {staff.map((person) => {
          const self = person.userId === currentUserId;
          return (
            <li key={person.userId} className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all font-sans font-semibold">{person.email ?? 'No sign-in email'}</span>
                <Badge>{person.active ? (person.role === 'admin' ? 'Admin' : 'Host') : person.deactivatedAt ? 'Deactivated' : 'Waiting for access'}</Badge>
                {self ? <span className="font-sans text-sm text-fg-muted">(you)</span> : null}
              </div>
              {self ? null : (
                <div className="flex flex-wrap gap-3">
                  {person.active && person.role === 'host' ? <RowAction action={changeRoleAction} userId={person.userId} role="admin" label="Make admin" /> : null}
                  {person.active && person.role === 'admin' ? <RowAction action={changeRoleAction} userId={person.userId} role="host" label="Make host" /> : null}
                  {person.active ? (
                    <RowAction action={revokeSessionsAction} userId={person.userId} label="Sign out everywhere" />
                  ) : null}
                  {person.active ? (
                    <RowAction
                      action={deactivateAction}
                      userId={person.userId}
                      label="Deactivate"
                      confirmText={`Deactivate ${person.email ?? 'this account'}? Their access ends now.`}
                    />
                  ) : (
                    <>
                      <RowAction action={reactivateAction} userId={person.userId} role="host" label="Give host access" />
                      <RowAction action={reactivateAction} userId={person.userId} role="admin" label="Give admin access" />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
