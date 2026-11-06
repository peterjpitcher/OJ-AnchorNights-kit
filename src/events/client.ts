// SERVER ONLY. Reads the management app's API with the app's `read:events`
// key (spec S7.1). `import 'server-only'` makes Next fail the build if a
// client component ever imports this, and the window check below stops it
// anywhere else, so the key can never reach a TV or a phone.
//
// From Cash Bingo (src/lib/events-feed/client.ts). What changed:
//   - The key and base URL can be passed in, as well as read from
//     ANCHOR_API_KEY and ANCHOR_API_BASE_URL.
//   - Each GET also asks Next's data cache to keep the answer for five
//     minutes (`next: { revalidate: 300 }`) where the call runs in a cached
//     Next context; elsewhere Next or Node ignores it. Cash Bingo wrapped the
//     whole refresh in `unstable_cache` instead, which the kit cannot import
//     without making `next` a hard dependency.
//   - createManagementClient gives the three routes the feed reads by name.
//
// Nothing here logs. Errors carry a message written here (the status code and
// the path, never the response body or the key), and the caller decides what
// to report.

import 'server-only';
import { EventsFeedError } from './errors';

if (typeof window !== 'undefined') {
  throw new Error('@anchor-nights/kit/events is server only: it sends the management API key.');
}

export const DEFAULT_ANCHOR_API_BASE_URL = 'https://management.orangejelly.co.uk/api';

/** Seconds Next's data cache keeps a management answer, where it applies. */
export const NEXT_REVALIDATE_SECONDS = 300;

export interface EventsFeedConfig {
  /** No trailing slash. */
  baseUrl: string;
  apiKey: string;
}

export interface EventsFeedConfigInput {
  apiKey?: string | null;
  baseUrl?: string | null;
  /** Defaults to process.env. */
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * The management API settings, or null when there is no key. Values passed
 * in win over ANCHOR_API_KEY and ANCHOR_API_BASE_URL.
 */
export function getEventsFeedConfig(input: EventsFeedConfigInput = {}): EventsFeedConfig | null {
  const env = input.env ?? process.env;
  const apiKey = (input.apiKey ?? env.ANCHOR_API_KEY)?.trim();
  if (!apiKey) return null;
  const baseUrl = ((input.baseUrl ?? env.ANCHOR_API_BASE_URL)?.trim() || DEFAULT_ANCHOR_API_BASE_URL).replace(/\/+$/, '');
  return { baseUrl, apiKey };
}

export interface FetchManagementJsonOptions {
  timeoutMs: number;
  config: EventsFeedConfig | null;
  /** Defaults to the global fetch; for tests. */
  fetchImpl?: typeof fetch;
  /** Seconds for Next's data cache; false to leave it out. Defaults to NEXT_REVALIDATE_SECONDS. */
  nextRevalidate?: number | false;
}

/** RequestInit plus Next's own option, which plain fetch ignores. */
type NextRequestInit = RequestInit & { next?: { revalidate: number } };

function isTimeout(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** Frees the connection without reading (or keeping) the body. */
function discardBody(response: Response): void {
  try {
    response.body?.cancel().catch(() => {});
  } catch {
    // Nothing to free.
  }
}

/**
 * GETs `path` (for example '/events?status=scheduled') from the management
 * API and returns the parsed JSON.
 *
 * Throws an EventsFeedError on a missing key, a timeout, a network failure, a
 * non-2xx status or a body that is not JSON.
 */
export async function fetchManagementJson(path: string, options: FetchManagementJsonOptions): Promise<unknown> {
  const { config } = options;
  if (!config) {
    throw new EventsFeedError('ANCHOR_API_KEY is not set, so the events feed cannot be read', 'missing_config');
  }
  if (!path.startsWith('/')) {
    throw new Error(`fetchManagementJson needs a path starting with "/" (got "${path}").`);
  }

  // The path without its query, for messages. Event ids in it are uuids, which
  // reportError redacts.
  const label = path.split('?')[0];
  const fetchImpl = options.fetchImpl ?? fetch;
  const revalidate = options.nextRevalidate ?? NEXT_REVALIDATE_SECONDS;

  const init: NextRequestInit = {
    method: 'GET',
    headers: { 'X-API-Key': config.apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(1, Math.floor(options.timeoutMs))),
  };
  if (revalidate === false) init.cache = 'no-store';
  else init.next = { revalidate };

  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, init);
  } catch (err) {
    if (isTimeout(err)) {
      throw new EventsFeedError(`The management API did not answer ${label} within ${options.timeoutMs}ms`, 'timeout');
    }
    throw new EventsFeedError(`The management API could not be reached for ${label}`, 'network');
  }

  if (!response.ok) {
    discardBody(response);
    throw new EventsFeedError(`The management API answered HTTP ${response.status} for ${label}`, 'http');
  }

  try {
    return await response.json();
  } catch (err) {
    if (isTimeout(err)) {
      throw new EventsFeedError(`The management API did not finish sending ${label} within ${options.timeoutMs}ms`, 'timeout');
    }
    throw new EventsFeedError(`The management API sent ${label} as something other than JSON`, 'parse');
  }
}

export interface ManagementClientOptions extends EventsFeedConfigInput {
  fetchImpl?: typeof fetch;
  nextRevalidate?: number | false;
}

export interface ManagementClient {
  /** Null when there is no key. */
  readonly config: EventsFeedConfig | null;
  /** GET /events with these query parameters (from_date, to_date, category_id, status, limit). */
  listEvents(params: Record<string, string>, timeoutMs: number): Promise<unknown>;
  /** GET /events/{id or slug}: the detail, with `qr_short_links` by channel. */
  getEvent(idOrSlug: string, timeoutMs: number): Promise<unknown>;
  /** GET /event-categories. */
  listCategories(timeoutMs: number): Promise<unknown>;
}

/** The three routes the feed reads, as raw JSON; parse with the schema helpers. */
export function createManagementClient(options: ManagementClientOptions = {}): ManagementClient {
  const config = getEventsFeedConfig(options);
  const get = (path: string, timeoutMs: number): Promise<unknown> =>
    fetchManagementJson(path, { timeoutMs, config, fetchImpl: options.fetchImpl, nextRevalidate: options.nextRevalidate });
  return {
    config,
    listEvents: (params, timeoutMs) => get(`/events?${new URLSearchParams(params).toString()}`, timeoutMs),
    getEvent: (idOrSlug, timeoutMs) => get(`/events/${encodeURIComponent(idOrSlug)}`, timeoutMs),
    listCategories: (timeoutMs) => get('/event-categories', timeoutMs),
  };
}
