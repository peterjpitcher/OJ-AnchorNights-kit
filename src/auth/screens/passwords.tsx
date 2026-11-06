'use client';

import * as React from 'react';
import { PASSWORD_MIN_LENGTH, passwordLengthProblem, type AuthFormState } from '../shared';
import { Field, fieldError } from './shell';

/** New password and its confirmation, with the length rule shown as you type (the server check decides). */
export function NewPasswordFields({ state, label = 'New password' }: { state: AuthFormState; label?: string }): React.ReactElement {
  const [value, setValue] = React.useState('');
  const hint = value ? passwordLengthProblem(value) ?? 'Long enough.' : `At least ${PASSWORD_MIN_LENGTH} characters. A few words together works well.`;
  return (
    <>
      <Field
        label={label}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        hint={hint}
        error={fieldError(state, 'password')}
      />
      <Field label="Type it again" name="confirmPassword" type="password" autoComplete="new-password" required error={fieldError(state, 'confirmPassword')} />
    </>
  );
}
