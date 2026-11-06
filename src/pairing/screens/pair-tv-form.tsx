'use client';

import * as React from 'react';
import { Tv } from 'lucide-react';
import { DEFAULT_TV_NAME, TV_NAME_MAX_LENGTH, type PairingFormAction } from '../shared';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Field, FormMessage, ScreenHeading, fieldError, useAuthForm } from '../../auth/screens/shell';

export interface PairTvFormProps {
  /** The app's Server Action wrapping createTvPairing(...).actions.pairTv. */
  action: PairingFormAction;
  /** Drop the card around the form, for a sheet or a dock. */
  bare?: boolean;
}

/**
 * The host console's "Pair a TV" form (spec S3.1): the 6-digit code from the
 * screen and a name for the list. The server checks the person is active
 * staff, and counts wrong codes; this form only collects them.
 */
export function PairTvForm({ action, bare = false }: PairTvFormProps): React.ReactElement {
  const [state, formAction, pending] = useAuthForm(action);
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state.status === 'ok') formRef.current?.reset();
  }, [state]);

  const form = (
    <form ref={formRef} action={formAction} className="flex flex-col gap-[18px]" noValidate>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card border border-line-gold text-accent">
          <Tv aria-hidden="true" size={22} strokeWidth={2} />
        </span>
        <ScreenHeading title="Pair a TV" lead="Open /tv on the screen. Type the 6 digits it shows." />
      </div>
      <Field
        label="Code on the TV"
        name="code"
        inputMode="numeric"
        autoComplete="off"
        maxLength={9}
        placeholder="123 456"
        required
        error={fieldError(state, 'code')}
        className="font-display text-2xl tracking-[0.2em] tabular-nums"
      />
      <Field
        label="Name for this TV"
        name="name"
        autoComplete="off"
        maxLength={TV_NAME_MAX_LENGTH}
        placeholder="Bar TV"
        hint={`Leave blank for "${DEFAULT_TV_NAME}".`}
        error={fieldError(state, 'name')}
      />
      <Button type="submit" isLoading={pending}>
        Pair TV
      </Button>
      <FormMessage state={state} />
    </form>
  );
  return bare ? form : <Card className="px-5 py-6">{form}</Card>;
}
