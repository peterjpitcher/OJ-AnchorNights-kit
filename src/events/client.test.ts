// The management API client. No network: fetch is injected. The key goes in
// the X-API-Key header, and no error may carry the response body or the key.
import { describe, expect, it } from 'vitest';
import { createManagementClient, DEFAULT_ANCHOR_API_BASE_URL, fetchManagementJson, getEventsFeedConfig } from './client';
import { EventsFeedError } from './errors';

const CONFIG = { baseUrl: 'https://management.example/api', apiKey: 'test-key' };

type Call = { url: string; init: (RequestInit & { next?: { revalidate: number } }) | undefined };

function recordingFetch(body: unknown = { success: true, data: { events: [] } }): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('getEventsFeedConfig', () => {
  it('needs a key; the base URL defaults and loses its trailing slash', () => {
    expect(getEventsFeedConfig({ env: {} })).toBeNull();
    expect(getEventsFeedConfig({ env: { ANCHOR_API_KEY: '   ' } })).toBeNull();
    expect(getEventsFeedConfig({ env: { ANCHOR_API_KEY: 'k' } })).toEqual({ baseUrl: DEFAULT_ANCHOR_API_BASE_URL, apiKey: 'k' });
    expect(DEFAULT_ANCHOR_API_BASE_URL).toBe('https://management.orangejelly.co.uk/api');
    expect(getEventsFeedConfig({ env: { ANCHOR_API_KEY: 'k', ANCHOR_API_BASE_URL: 'https://staging.example/api/' } })).toEqual({
      baseUrl: 'https://staging.example/api',
      apiKey: 'k',
    });
  });

  it('takes values passed in over the environment', () => {
    expect(getEventsFeedConfig({ apiKey: 'passed', baseUrl: 'https://x.example/api', env: { ANCHOR_API_KEY: 'env' } })).toEqual({
      baseUrl: 'https://x.example/api',
      apiKey: 'passed',
    });
  });
});

describe('fetchManagementJson', () => {
  it('sends the key in X-API-Key, asks Next to cache for 5 minutes, and returns the JSON', async () => {
    const { calls, fetchImpl } = recordingFetch();
    const json = await fetchManagementJson('/events?status=scheduled', { timeoutMs: 5000, config: CONFIG, fetchImpl });
    expect(json).toEqual({ success: true, data: { events: [] } });
    expect(calls[0].url).toBe('https://management.example/api/events?status=scheduled');
    expect((calls[0].init?.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].init?.signal).toBeDefined();
    expect(calls[0].init?.next).toEqual({ revalidate: 300 });
  });

  it('can switch the Next cache off', async () => {
    const { calls, fetchImpl } = recordingFetch();
    await fetchManagementJson('/events', { timeoutMs: 5000, config: CONFIG, fetchImpl, nextRevalidate: false });
    expect(calls[0].init?.next).toBeUndefined();
    expect(calls[0].init?.cache).toBe('no-store');
  });

  it('throws on a non-2xx status with the status and path, never the body, key or query', async () => {
    const fetchImpl = (async () => new Response('{"error":"SECRET-BODY-TEXT"}', { status: 429 })) as unknown as typeof fetch;
    const err = await fetchManagementJson('/events?category_id=abc', { timeoutMs: 5000, config: CONFIG, fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EventsFeedError);
    expect((err as EventsFeedError).code).toBe('http');
    expect((err as Error).message).toMatch(/HTTP 429/);
    expect((err as Error).message).not.toMatch(/SECRET-BODY-TEXT|test-key|category_id/);
  });

  it('throws a parse error for a body that is not JSON, without the body', async () => {
    const fetchImpl = (async () => new Response('<html>SECRET-BODY-TEXT</html>', { status: 200 })) as unknown as typeof fetch;
    const err = await fetchManagementJson('/event-categories', { timeoutMs: 5000, config: CONFIG, fetchImpl }).catch((e: unknown) => e);
    expect((err as EventsFeedError).code).toBe('parse');
    expect((err as Error).message).not.toMatch(/SECRET/);
  });

  it('tells a timeout from a network failure', async () => {
    const timingOut = (async () => {
      throw new DOMException('aborted', 'TimeoutError');
    }) as unknown as typeof fetch;
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(((await fetchManagementJson('/events', { timeoutMs: 5000, config: CONFIG, fetchImpl: timingOut }).catch((e: unknown) => e)) as EventsFeedError).code).toBe('timeout');
    expect(((await fetchManagementJson('/events', { timeoutMs: 5000, config: CONFIG, fetchImpl: offline }).catch((e: unknown) => e)) as EventsFeedError).code).toBe('network');
  });

  it('really aborts a call that hangs', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const err = await fetchManagementJson('/events', { timeoutMs: 20, config: CONFIG, fetchImpl: hanging }).catch((e: unknown) => e);
    expect((err as EventsFeedError).code).toBe('timeout');
  });

  it('fetches nothing without a key', async () => {
    const { calls, fetchImpl } = recordingFetch();
    const err = await fetchManagementJson('/events', { timeoutMs: 5000, config: null, fetchImpl }).catch((e: unknown) => e);
    expect((err as EventsFeedError).code).toBe('missing_config');
    expect(calls).toHaveLength(0);
  });
});

describe('createManagementClient', () => {
  it('reads the three routes', async () => {
    const { calls, fetchImpl } = recordingFetch();
    const client = createManagementClient({ apiKey: 'test-key', baseUrl: 'https://management.example/api', fetchImpl });
    await client.listEvents({ from_date: '2026-11-06', status: 'scheduled' }, 1000);
    await client.getEvent('test-quiz-night-2026-11-18', 1000);
    await client.listCategories(1000);
    expect(calls.map((call) => call.url)).toEqual([
      'https://management.example/api/events?from_date=2026-11-06&status=scheduled',
      'https://management.example/api/events/test-quiz-night-2026-11-18',
      'https://management.example/api/event-categories',
    ]);
  });
});
