// Ported from Cash Bingo (src/lib/report-error.test.ts), plus the kit's
// options. The thing these guard is not "does it post", it is "does it post
// anything it should not". These apps deliberately do not identify players,
// and an error reporter is the easiest place to undo that by accident.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createErrorReporter, logActionFailure, logActionLatency, redact, reportError, toSafeError } from './index';

type Captured = { url: string; init: RequestInit; body: Record<string, unknown> };

function capturingFetch(captured: Captured[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
}

const SINK = 'https://sink.invalid/errors';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('reportError', () => {
  it('never sends uuids', async () => {
    const sent: Captured[] = [];
    await reportError({ scope: 'test' }, new Error('winner 7ef7d8b8-6fe1-4d71-80c9-44a7c3e73ba1 failed'), { sinkUrl: SINK, fetch: capturingFetch(sent) });
    expect(sent).toHaveLength(1);
    expect(String(sent[0].body.message)).toMatch(/\[uuid\]/);
    expect(String(sent[0].body.message)).not.toMatch(/7ef7d8b8/);
  });

  it('never sends money amounts', async () => {
    const sent: Captured[] = [];
    await reportError({ scope: 'test' }, new Error('failed to award £110 Cash Jackpot'), { sinkUrl: SINK, fetch: capturingFetch(sent) });
    expect(String(sent[0].body.message)).toMatch(/\[amount\]/);
    expect(String(sent[0].body.message)).not.toMatch(/110/);
  });

  it('never sends email addresses', async () => {
    const sent: Captured[] = [];
    await reportError({ scope: 'test' }, new Error('no profile for host@theanchor.pub'), { sinkUrl: SINK, fetch: capturingFetch(sent) });
    expect(String(sent[0].body.message)).toMatch(/\[email\]/);
    expect(String(sent[0].body.message)).not.toMatch(/theanchor/);
  });

  it('never sends UK phone numbers', async () => {
    const sent: Captured[] = [];
    await reportError({ scope: 'test' }, new Error('sms to 07700 900123 and +44 7700 900456 failed'), { sinkUrl: SINK, fetch: capturingFetch(sent) });
    const message = String(sent[0].body.message);
    expect(message).toBe('sms to [phone] and [phone] failed');
  });

  it('drops Postgres detail and hint, because DETAIL carries the failing row', async () => {
    const sent: Captured[] = [];
    await reportError(
      { scope: 'test' },
      {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
        details: 'Key (prize_description)=(£110 Cash Jackpot) already exists.',
        hint: 'Perhaps you meant Margaret',
      },
      { sinkUrl: SINK, fetch: capturingFetch(sent) },
    );
    const body = JSON.stringify(sent[0].body);
    expect(body).not.toMatch(/Margaret/);
    expect(body).not.toMatch(/already exists/);
    expect(sent[0].body.code).toBe('23505');
  });

  it('posts nothing when no sink is configured, but still logs', async () => {
    vi.stubEnv('ERROR_SINK_URL', '');
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    await reportError({ scope: 'test' }, new Error('boom'), { fetch: fakeFetch });
    expect(called).toBe(false);
    expect(console.error).toHaveBeenCalledWith('[action:test]', { message: 'boom' });
  });

  it('reads the sink, token and app name from the environment by default', async () => {
    vi.stubEnv('ERROR_SINK_URL', SINK);
    vi.stubEnv('ERROR_SINK_TOKEN', 'sink-token');
    vi.stubEnv('ERROR_APP_NAME', 'quiz-night');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const sent: Captured[] = [];
    await reportError({ scope: 'test' }, new Error('boom'), { fetch: capturingFetch(sent) });
    expect(sent[0].url).toBe(SINK);
    expect((sent[0].init.headers as Record<string, string>).authorization).toBe('Bearer sink-token');
    expect(sent[0].body.app).toBe('quiz-night');
    expect(sent[0].body.environment).toBe('preview');
  });

  it('does not become the failure when the sink is down', async () => {
    const down = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    await expect(reportError({ scope: 'test' }, new Error('original problem'), { sinkUrl: SINK, fetch: down })).resolves.toBeUndefined();
  });

  it('gives up on a sink that does not answer within 2 seconds', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    // A sink that never answers and ignores its abort signal.
    const hang = ((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;
    let settled = false;
    const pending = reportError({ scope: 'test' }, new Error('slow'), { sinkUrl: SINK, fetch: hang }).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it('never throws, whatever it is given', async () => {
    const hostile = {
      get message(): string {
        throw new Error('boom');
      },
    };
    const sent: Captured[] = [];
    await expect(reportError({ scope: 'test' }, hostile, { sinkUrl: SINK, fetch: capturingFetch(sent) })).resolves.toBeUndefined();
    await expect(reportError({ scope: 'test' }, Symbol('x'), { sinkUrl: SINK, fetch: capturingFetch(sent) })).resolves.toBeUndefined();
    await expect(reportError({ scope: 'test' }, undefined, { sinkUrl: SINK, fetch: capturingFetch(sent) })).resolves.toBeUndefined();
  });

  it('sends the scope, app and environment so a line can be placed', async () => {
    const sent: Captured[] = [];
    await reportError({ scope: 'recordWinner', correlationId: 'abc' }, new Error('boom'), {
      sinkUrl: SINK,
      app: 'anchor-bingo',
      environment: 'production',
      fetch: capturingFetch(sent),
      now: () => new Date('2026-11-06T20:00:00Z'),
    });
    expect(sent[0].body).toEqual({
      app: 'anchor-bingo',
      environment: 'production',
      scope: 'recordWinner',
      correlationId: 'abc',
      message: 'boom',
      at: '2026-11-06T20:00:00.000Z',
    });
  });
});

describe('createErrorReporter', () => {
  it('fills in the app settings for every call', async () => {
    const sent: Captured[] = [];
    const report = createErrorReporter({ app: 'tasting-night', sinkUrl: SINK, fetch: capturingFetch(sent) });
    await report({ scope: 'pour' }, new Error('boom'));
    expect(sent[0].body.app).toBe('tasting-night');
    expect(sent[0].body.scope).toBe('pour');
  });
});

describe('redaction helpers', () => {
  it('masks every kind it knows and leaves ordinary text alone', () => {
    expect(redact('row 7ef7d8b8-6fe1-4d71-80c9-44a7c3e73ba1 for a@b.co at £1,250.50 to 01784 123456')).toBe(
      'row [uuid] for [email] at [amount] to [phone]',
    );
    expect(redact('timeout after 2000ms on game 3 of 6, code 23505')).toBe('timeout after 2000ms on game 3 of 6, code 23505');
  });

  it('keeps only message and code from an error object', () => {
    expect(toSafeError({ message: 'm', code: 'c', details: 'd', hint: 'h' })).toEqual({ message: 'm', code: 'c' });
    expect(toSafeError({})).toEqual({ message: '[unloggable error]' });
    expect(toSafeError(42)).toEqual({ message: '[unloggable error]' });
    expect(toSafeError('plain a@b.co')).toEqual({ message: 'plain [email]' });
  });

  it('logs action failures redacted, in every environment', () => {
    logActionFailure('saveScore', new Error('team 7ef7d8b8-6fe1-4d71-80c9-44a7c3e73ba1 a@b.co'));
    expect(console.error).toHaveBeenCalledWith('[action:saveScore]', { message: 'team [uuid] [email]' });
  });

  it('logs slow actions only', () => {
    logActionLatency('fast', 1000, 800, 1500);
    expect(console.warn).not.toHaveBeenCalled();
    logActionLatency('slow', 1000, 800, 2000);
    expect(console.warn).toHaveBeenCalledWith('[action:slow] slow: 1000ms (threshold 800ms)');
  });
});
