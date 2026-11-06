'use client';

import * as React from 'react';
import { Tv } from 'lucide-react';
import type { PairingFormAction, TvDeviceRow } from '../shared';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { formatDateTimeInLondon } from '../../dates';
import { ScreenHeading, useAuthForm } from '../../auth/screens/shell';

export interface TvDevicesPanelProps {
  /** From createTvPairing(...).actions.listTvDevices(). */
  devices: readonly TvDeviceRow[];
  /** The app's Server Action wrapping actions.revokeTv. */
  revokeAction: PairingFormAction;
}

function RevokeButton({ action, device }: { action: PairingFormAction; device: TvDeviceRow }): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(action);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    if (!window.confirm(`Remove ${device.name}? It stops showing games until someone pairs it again.`)) event.preventDefault();
  };
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col items-start gap-1">
      <input type="hidden" name="deviceId" value={device.id} />
      <Button type="submit" variant="outline" size="sm" isLoading={pending}>
        Remove
      </Button>
      {state.status !== 'idle' ? (
        <span role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'font-sans text-sm text-danger-text' : 'font-sans text-sm text-success-text'}>
          {state.status === 'error' ? state.error : state.message}
        </span>
      ) : null}
    </form>
  );
}

/**
 * The admin list of paired TVs with a Remove (revoke) button each (spec
 * S3.1). A removed TV shows a new pairing code at its next request.
 */
export function TvDevicesPanel({ devices, revokeAction }: TvDevicesPanelProps): React.ReactElement {
  return (
    <Card className="flex flex-col gap-3 px-5 py-6">
      <ScreenHeading title="Paired TVs" lead="Remove a TV that has gone, or one you do not recognise." />
      {devices.length === 0 ? (
        <p className="font-sans text-sm text-fg-muted">No TVs are paired.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {devices.map((device) => (
            <li key={device.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Tv aria-hidden="true" size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-sans font-semibold">{device.name}</span>
                    {device.revokedAt ? <Badge>Removed</Badge> : null}
                  </span>
                  <span className="font-sans text-sm text-fg-muted">
                    Paired {formatDateTimeInLondon(device.createdAt)}
                    {device.createdByEmail ? ` by ${device.createdByEmail}` : ''}
                  </span>
                  <span className="font-sans text-sm text-fg-muted">
                    {device.lastSeenAt ? `Last seen ${formatDateTimeInLondon(device.lastSeenAt)}` : 'Not seen since pairing'}
                  </span>
                </div>
              </div>
              {device.revokedAt ? null : <RevokeButton action={revokeAction} device={device} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
