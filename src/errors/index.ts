// @anchor-nights/kit/errors: where a technical failure goes so somebody can
// find it the morning after (spec S6.4).
//
// From Cash Bingo (src/lib/report-error.ts and src/lib/log-action-failure.ts).
// What changed: the app name, sink URL, token and timeout are options instead
// of being written in; the console line uses the same redaction as the sink
// (Cash Bingo's console line stripped only uuids); and UK phone numbers are
// redacted as well as uuids, emails and pound amounts.
//
// WHY A GENERIC ENDPOINT RATHER THAN AN SDK
//   A fifty-line boundary with no dependency that posts a redacted JSON
//   payload to whatever URL is configured. Each app points it at its own
//   route, which writes the `app_errors` table its admin page lists (spec
//   assumption A3). If the volume ever justifies a real SDK, this is the seam.
//
// WITH NO URL CONFIGURED IT ONLY LOGS, so it is safe to ship before an app's
// sink route exists.
//
// REDACTION IS THE POINT, NOT AN EXTRA
//   These apps deliberately do not identify players. Postgres puts the failing
//   ROW into DETAIL on a constraint violation, so an un-redacted insert
//   failure would post names, prizes or contact details to the sink. Only the
//   message and code are ever kept, and uuids, emails, phone numbers and pound
//   amounts are masked.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const MONEY_RE = /£\s?\d[\d,]*(\.\d{1,2})?/g;
// A UK number: 07700 900123, 01784 123456, +44 7700 900123, +447700900123.
const PHONE_RE = /(?:\+44\s?(?:\(0\)\s?)?|\b0)\d(?:[\s-]?\d){8,9}\b/g;

/** How long to wait before giving up on the sink. A slow sink must never slow a game. */
export const SINK_TIMEOUT_MS = 2000;

/** Masks uuids, emails, UK phone numbers and pound amounts in a message. */
export function redact(value: string): string {
  return value
    .replace(UUID_RE, '[uuid]')
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(MONEY_RE, '[amount]');
}

export interface SafeError {
  message: string;
  code?: string;
}

/**
 * The safe fields of an unknown thrown value: its message and code,
 * redacted. `details` and `hint` are dropped deliberately, because Postgres
 * puts the failing row into DETAIL on a check or unique violation.
 */
export function toSafeError(err: unknown): SafeError {
  try {
    if (err instanceof Error) return { message: redact(err.message) };
    if (typeof err === 'string') return { message: redact(err) };
    if (err !== null && typeof err === 'object') {
      const source = err as Record<string, unknown>;
      const message = typeof source.message === 'string' && source.message.length > 0 ? redact(source.message) : '[unloggable error]';
      const code = typeof source.code === 'string' && source.code.length > 0 ? redact(source.code) : undefined;
      return code ? { message, code } : { message };
    }
  } catch {
    // A hostile getter or a broken object: fall through.
  }
  return { message: '[unloggable error]' };
}

/**
 * Always logs, including in production, because a failed call during a live
 * night has to be diagnosable from the Vercel logs afterwards. Redacted.
 * Never pass a user id, a name or a prize value as `action`.
 */
export function logActionFailure(action: string, err: unknown): void {
  try {
    console.error(`[action:${action}]`, toSafeError(err));
  } catch {
    // Logging must never become the failure.
  }
}

/** Logs slow actions so call latency is observable in the Vercel logs. */
export function logActionLatency(action: string, startedAtMs: number, thresholdMs = 800, now: number = Date.now()): void {
  const elapsedMs = now - startedAtMs;
  if (elapsedMs < thresholdMs) return;
  try {
    console.warn(`[action:${action}] slow: ${elapsedMs}ms (threshold ${thresholdMs}ms)`);
  } catch {
    // As above.
  }
}

export interface ErrorContext {
  /** Where it happened, e.g. 'recordWinner' or 'display:poll'. Never a value. */
  scope: string;
  /** Correlates this technical failure with a business audit row, if there is one. */
  correlationId?: string;
}

export interface ReportErrorOptions {
  /** The app's name in the report ('anchor-bingo', 'quiz-night'). Defaults to ERROR_APP_NAME, then 'unknown'. */
  app?: string;
  /** Where to post. Defaults to ERROR_SINK_URL. With none, reportError only logs. */
  sinkUrl?: string | null;
  /** Sent as a bearer token. Defaults to ERROR_SINK_TOKEN. Server only: never give it to the browser. */
  sinkToken?: string | null;
  /** Defaults to VERCEL_ENV, then NODE_ENV, then 'unknown'. */
  environment?: string;
  /** Defaults to SINK_TIMEOUT_MS (2 seconds). */
  timeoutMs?: number;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** For tests. Defaults to the current time. */
  now?: () => Date;
}

/** The JSON body posted to the sink. */
export interface ErrorReport {
  app: string;
  environment: string;
  scope: string;
  correlationId?: string;
  message: string;
  code?: string;
  at: string;
}

function envValue(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/**
 * Reports a technical failure. Always logs to the console (what Vercel
 * captures), redacted. Additionally posts a redacted report to the sink
 * when one is configured, so the record outlives Vercel's retention.
 *
 * Never throws and never rejects. A failure to report a failure must not
 * become the failure: if the sink is down mid-game, the game carries on. A
 * sink that does not answer within 2 seconds is abandoned.
 */
export async function reportError(context: ErrorContext, err: unknown, options: ReportErrorOptions = {}): Promise<void> {
  let safe: SafeError;
  try {
    safe = toSafeError(err);
    // The console line goes out first and unconditionally, so nothing
    // depends on the sink being reachable or configured.
    logActionFailure(context.scope, err);
  } catch {
    return;
  }

  const sinkUrl = options.sinkUrl === undefined ? envValue('ERROR_SINK_URL') : options.sinkUrl;
  if (!sinkUrl) return;

  const timeoutMs = options.timeoutMs ?? SINK_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = options.sinkToken === undefined ? envValue('ERROR_SINK_TOKEN') : options.sinkToken;
    const report: ErrorReport = {
      app: options.app ?? envValue('ERROR_APP_NAME') ?? 'unknown',
      environment: options.environment ?? envValue('VERCEL_ENV') ?? envValue('NODE_ENV') ?? 'unknown',
      scope: context.scope,
      correlationId: context.correlationId,
      message: safe.message,
      code: safe.code,
      at: (options.now ? options.now() : new Date()).toISOString(),
    };
    const post = (options.fetch ?? fetch)(sinkUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(report),
      signal: controller.signal,
      // Never let a reporting call hold up a response the host is waiting on.
      keepalive: true,
      cache: 'no-store',
    }).then(
      () => undefined,
      // Handled here so an abort after the race below never surfaces as an
      // unhandled rejection.
      () => undefined,
    );
    // The timer also bounds a fetch that ignores its abort signal.
    await Promise.race([
      post,
      new Promise<void>((resolve) => controller.signal.addEventListener('abort', () => resolve(), { once: true })),
    ]);
  } catch {
    // Deliberately silent. The console line above already recorded the
    // original failure, and a sink outage is not something the host can act
    // on mid-game.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * reportError with an app's own settings filled in, so call sites only pass
 * the context and the error:
 *
 *   export const reportError = createErrorReporter({ app: 'anchor-bingo' });
 */
export function createErrorReporter(defaults: ReportErrorOptions): (context: ErrorContext, err: unknown) => Promise<void> {
  return (context, err) => reportError(context, err, defaults);
}
