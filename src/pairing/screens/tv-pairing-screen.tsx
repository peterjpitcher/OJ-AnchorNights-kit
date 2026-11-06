'use client';

import * as React from 'react';
import {
  DEFAULT_PAIRING_ENDPOINT,
  formatPairingCode,
  PAIRING_CODE_LENGTH,
  PAIRING_POLL_MS,
  type PairingCodeResponse,
  type PairingPollResponse,
} from '../shared';
import { tvText, TV_KICKER_CLASS } from '../../tv/tv-text';
import { tvNavigation } from './tv-notice';
import { TvCanvas } from './tv-shell';

export interface TvPairingScreenProps {
  /** The app's night, e.g. "Quiz Night", shown above the code. */
  appName?: string;
  /** Where to ask for a code and poll. Defaults to /api/tv/pairing. */
  endpoint?: string;
  /** Where the host types the code. Defaults to the host console wording. */
  instructions?: string;
  logoSrc?: string;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'code'; code: string; expiresAt: number; pollMs: number; connection: 'ok' | 'lost' }
  | { kind: 'error'; message: string };

export const TV_PAIRING_MESSAGES = Object.freeze({
  loading: 'Getting a pairing code...',
  unavailable: 'We could not get a pairing code. Trying again by itself.',
  rateLimited: 'Too many codes were asked for from this connection. Trying again shortly.',
  connectionLost: 'Connection lost. Trying again...',
  instructions: 'In the host console, choose Pair a TV and type this code.',
  lifetime: 'The code works for 10 minutes and changes by itself.',
});

const CODE_SHAPE = new RegExp(`^[0-9]{${PAIRING_CODE_LENGTH}}$`);
const MAX_BACKOFF_MS = 60_000;

const clampPoll = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 1000), 30_000) : PAIRING_POLL_MS;

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * What an unpaired /tv shows (spec S3.1): a 6-digit code, large, for a host
 * to type into the host console. It asks for a new code when this one runs
 * out or is burnt, polls every few seconds, and reloads once paired so the
 * server shows tonight's game. When the server cannot be reached it says so
 * and keeps trying, with growing waits; it never shows a made-up code.
 */
export function TvPairingScreen({ appName, endpoint = DEFAULT_PAIRING_ENDPOINT, instructions, logoSrc }: TvPairingScreenProps): React.ReactElement {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' });
  const [generation, setGeneration] = React.useState(0);

  const renew = React.useCallback((): void => {
    setPhase({ kind: 'loading' });
    setGeneration((g) => g + 1);
  }, []);

  // Ask for a code, retrying with growing waits until one arrives.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = async (failures: number): Promise<void> => {
      let body: PairingCodeResponse | null = null;
      try {
        const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
        body = await readJson<PairingCodeResponse>(response);
      } catch {
        body = null;
      }
      if (cancelled) return;
      if (body?.status === 'code' && typeof body.code === 'string' && CODE_SHAPE.test(body.code) && body.expiresInSeconds > 0) {
        setPhase({ kind: 'code', code: body.code, expiresAt: Date.now() + body.expiresInSeconds * 1000, pollMs: clampPoll(body.pollMs), connection: 'ok' });
        return;
      }
      if (body?.status === 'paired') {
        tvNavigation.reload();
        return;
      }
      const limited = body?.status === 'rate_limited' ? body : null;
      const wait = limited
        ? Math.min(Math.max(Number(limited.retryAfterSeconds) || 60, 5), 300) * 1000
        : Math.min(5000 * 2 ** failures, MAX_BACKOFF_MS);
      setPhase({ kind: 'error', message: limited ? TV_PAIRING_MESSAGES.rateLimited : TV_PAIRING_MESSAGES.unavailable });
      timer = setTimeout(() => void request(failures + 1), wait);
    };
    void request(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [endpoint, generation]);

  const code = phase.kind === 'code' ? phase.code : null;
  const expiresAt = phase.kind === 'code' ? phase.expiresAt : 0;
  const pollMs = phase.kind === 'code' ? phase.pollMs : PAIRING_POLL_MS;

  // Poll while a code is showing.
  React.useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setConnection = (connection: 'ok' | 'lost'): void =>
      setPhase((p) => (p.kind === 'code' && p.connection !== connection ? { ...p, connection } : p));
    const tick = async (): Promise<void> => {
      if (Date.now() >= expiresAt) {
        renew();
        return;
      }
      let body: PairingPollResponse | null = null;
      try {
        const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
        body = await readJson<PairingPollResponse>(response);
      } catch {
        body = null;
      }
      if (cancelled) return;
      if (body?.status === 'paired') {
        tvNavigation.reload();
        return;
      }
      if (body?.status === 'expired') {
        renew();
        return;
      }
      if (body?.status === 'waiting' || body?.status === 'slow_down') {
        failures = 0;
        setConnection('ok');
      } else {
        failures += 1;
        setConnection('lost');
      }
      timer = setTimeout(() => void tick(), failures === 0 ? pollMs : Math.min(pollMs * 2 ** failures, 30_000));
    };
    timer = setTimeout(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [code, expiresAt, pollMs, endpoint, renew]);

  return (
    <TvCanvas logoSrc={logoSrc}>
      <p className={TV_KICKER_CLASS}>{appName ? `${appName}: pair this screen` : 'Pair this screen'}</p>
      {phase.kind === 'code' ? (
        <>
          <p
            aria-label={`Pairing code ${phase.code.split('').join(' ')}`}
            className="font-display leading-none tracking-[0.08em] text-fg-strong tabular-nums text-[calc(22*var(--anchor-vh,1vh))]"
          >
            {formatPairingCode(phase.code)}
          </p>
          <p className={tvText('base', 'max-w-[34ch] text-fg')}>{instructions ?? TV_PAIRING_MESSAGES.instructions}</p>
          <p className={tvText('xs', 'text-fg-muted')}>{TV_PAIRING_MESSAGES.lifetime}</p>
          {phase.connection === 'lost' ? (
            <p role="status" className={tvText('xs', 'text-accent-text')}>
              {TV_PAIRING_MESSAGES.connectionLost}
            </p>
          ) : null}
        </>
      ) : (
        <p role="status" className={tvText('lg', 'max-w-[30ch] font-display text-fg-strong')}>
          {phase.kind === 'error' ? phase.message : TV_PAIRING_MESSAGES.loading}
        </p>
      )}
    </TvCanvas>
  );
}
