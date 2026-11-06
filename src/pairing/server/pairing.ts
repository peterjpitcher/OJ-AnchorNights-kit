import { randomInt } from 'node:crypto';
import { AUTH_MESSAGES } from '../../auth/shared';
import { fail } from '../../auth/server/actions';
import type { AuthConfig } from '../../auth/server/config';
import { randomToken, sha256Hex, TOKEN_SHAPE } from '../../auth/server/crypto';
import { kitRefusal } from '../../auth/server/errors';
import { requestContext } from '../../auth/server/request';
import { readSession } from '../../auth/server/session';
import type { AnySupabaseClient, HeaderBag } from '../../auth/server/types';
import {
  normalisePairingCode,
  normaliseTvName,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_SECONDS,
  PAIRING_MESSAGES,
  PAIRING_POLL_MS,
  TV_DEVICE_COOKIE_MAX_AGE_SECONDS,
  tvDeviceCookieName,
  tvPairingCookieName,
  type PairingCodeResponse,
  type PairingFormState,
  type PairingPollResponse,
  type ResolveTonight,
  type TvDevice,
  type TvDeviceRow,
  type TvView,
} from '../shared';

// TV pairing (spec S3.1 and K5). The flow:
//
//   1. An unpaired TV POSTs to the pairing endpoint. It gets a 6-digit code
//      to show and an httpOnly pairing cookie holding a 256-bit secret. Only
//      the SHA-256 of each is stored.
//   2. A signed-in host or admin types the code into PairTvForm (pairTv).
//      That approves the code; it creates nothing the TV could not have
//      asked for itself.
//   3. The TV polls (GET) with its pairing cookie. Once approved, the poll
//      makes the device: a fresh 256-bit device token goes into an httpOnly
//      cookie for 400 days, and only its hash is stored in tv_devices.
//   4. Every /tv request reads that cookie through readTvDevice; a revoked
//      device reads as unpaired.
//
// Every public path fails closed: an outage never pairs, never shows a game
// and never hides itself as "unpaired" (the page shows a retry notice).

/** The part of a Request (or Next's cookies()) the device lookup needs. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface TvPairingDeps {
  /** The app's auth config (defineAuthConfig); only secureCookies is read. */
  config: Pick<AuthConfig, 'secureCookies'>;
  /** The app's server client (public key, cookie session): who is pairing. */
  serverClient: () => Promise<AnySupabaseClient>;
  /** The app's admin client (service role, server only): the kit_tv_* functions. */
  adminClient: () => AnySupabaseClient | Promise<AnySupabaseClient>;
  /** Next's `cookies` from next/headers, for requirePairedTv in a page. */
  cookies: () => Promise<CookieReader>;
  /** Next's `headers` from next/headers, for the caller's IP in pairTv. */
  headers: () => Promise<HeaderBag>;
  /** The app's error reporter. Every failure on a public path calls it. */
  report?: (scope: string, error: unknown) => void;
  /** A test seam. */
  now?: () => Date;
  /** A test seam: the next pairing code. */
  drawCode?: () => string;
}

export type TvDeviceState = { status: 'paired'; device: TvDevice } | { status: 'unpaired' } | { status: 'unavailable' };

export interface TvPairing {
  /** The device for this request, or null (unpaired, revoked, or the database could not be reached). */
  requirePairedTv(source?: Request | CookieReader): Promise<TvDevice | null>;
  /** The same, telling an outage apart from "not paired", for the /tv page. */
  readTvDevice(source?: Request | CookieReader): Promise<TvDeviceState>;
  /** Decides what /tv shows: the code, a retry notice, the idle loop or tonight's game. */
  resolveTvView<Game>(input: { resolveTonight: ResolveTonight<Game>; rehearsal: boolean; source?: Request | CookieReader }): Promise<TvView<Game>>;
  /** The pairing endpoint, e.g. app/api/tv/pairing/route.ts: POST asks for a code, GET polls. */
  routes: { POST(request: Request): Promise<Response>; GET(request: Request): Promise<Response> };
  actions: {
    /** Host or admin: pair the TV showing this code. Fields: code, name. */
    pairTv(previous: PairingFormState, formData: FormData): Promise<PairingFormState>;
    /** Admin: revoke a device. Field: deviceId. */
    revokeTv(previous: PairingFormState, formData: FormData): Promise<PairingFormState>;
    /** Admin pages: live devices (and revoked ones when asked). Null when the caller is not an active admin. */
    listTvDevices(options?: { includeRevoked?: boolean }): Promise<TvDeviceRow[] | null>;
  };
  maintenance: {
    /** Daily clean-up (the app's cron route, beside pruneAuthData). Throws when it fails. */
    prunePairing(): Promise<{ codes: number; attempts: number; revoked_devices: number }>;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_SHAPE = TOKEN_SHAPE;
const CODE_DRAWS = 5;

/** Six digits from the CSPRNG, leading zeros kept. */
export function drawPairingCode(): string {
  return randomInt(0, 10 ** PAIRING_CODE_LENGTH).toString().padStart(PAIRING_CODE_LENGTH, '0');
}

/** Reads one cookie from a Request's Cookie header. */
export function cookieFromRequest(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const raw = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function serialiseCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return [`${name}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : null].filter(Boolean).join('; ');
}

function json(body: PairingCodeResponse | PairingPollResponse, status: number, cookies: string[] = [], extra: Record<string, string> = {}): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

interface DeviceRpcRow {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
}

interface ListRpcRow extends DeviceRpcRow {
  created_by: string;
  created_by_email: string | null;
  revoked_at: string | null;
}

function firstRow<T>(data: unknown): T | undefined {
  return (Array.isArray(data) ? data[0] : data ?? undefined) as T | undefined;
}

export function createTvPairing(deps: TvPairingDeps): TvPairing {
  const secure = deps.config.secureCookies;
  const deviceCookie = tvDeviceCookieName(secure);
  const pairingCookie = tvPairingCookieName(secure);
  const now = deps.now ?? (() => new Date());
  const draw = deps.drawCode ?? drawPairingCode;
  const report = (scope: string, error: unknown): void => {
    try {
      deps.report?.(scope, error);
    } catch {
      // A reporter that throws must never turn a refusal into a crash.
    }
    if (!deps.report) console.error(`[pairing] ${scope}`);
  };

  const readCookie = async (source: Request | CookieReader | undefined, name: string): Promise<string | undefined> => {
    if (source instanceof Request) return cookieFromRequest(source, name);
    const jar = source ?? (await deps.cookies());
    return jar.get(name)?.value;
  };

  const readTvDevice = async (source?: Request | CookieReader): Promise<TvDeviceState> => {
    let token: string | undefined;
    try {
      token = await readCookie(source, deviceCookie);
    } catch (error) {
      report('pairing:read_cookie', error);
      return { status: 'unavailable' };
    }
    if (!token || !TOKEN_SHAPE.test(token)) return { status: 'unpaired' };
    try {
      const admin = await deps.adminClient();
      const { data, error } = await admin.rpc('kit_tv_device_seen', { p_token_hash: sha256Hex(token) });
      if (error) throw error;
      const row = firstRow<DeviceRpcRow>(data);
      if (!row?.id) return { status: 'unpaired' };
      return { status: 'paired', device: { id: row.id, name: row.name, createdAt: row.created_at, lastSeenAt: row.last_seen_at } };
    } catch (error) {
      report('pairing:device_lookup', error);
      return { status: 'unavailable' };
    }
  };

  /** The signed-in caller and their role, or the form result to return instead. */
  const caller = async (allowed: readonly ('admin' | 'host')[]): Promise<{ ok: true; id: string } | { ok: false; result: PairingFormState }> => {
    let session;
    try {
      session = await readSession(await deps.serverClient());
    } catch {
      session = { status: 'unavailable' as const };
    }
    if (session.status === 'unavailable') return { ok: false, result: fail('service_unavailable', AUTH_MESSAGES.serviceUnavailable) };
    if (session.status === 'signed_out') return { ok: false, result: fail('unauthenticated', AUTH_MESSAGES.unauthenticated) };
    if (!session.role || !allowed.includes(session.role)) return { ok: false, result: fail('unauthorised', AUTH_MESSAGES.unauthorised) };
    return { ok: true, id: session.user.id };
  };

  return {
    readTvDevice,

    async requirePairedTv(source) {
      const state = await readTvDevice(source);
      return state.status === 'paired' ? state.device : null;
    },

    async resolveTvView({ resolveTonight, rehearsal, source }) {
      const state = await readTvDevice(source);
      if (state.status === 'unpaired') return { kind: 'unpaired' };
      if (state.status === 'unavailable') return { kind: 'unavailable', reason: 'device_lookup' };
      try {
        const game = await resolveTonight({ device: state.device, now: now(), rehearsal });
        return game === null || game === undefined
          ? { kind: 'idle', device: state.device, rehearsal }
          : { kind: 'game', device: state.device, game, rehearsal };
      } catch (error) {
        report('pairing:resolve_tonight', error);
        return { kind: 'unavailable', reason: 'resolver' };
      }
    },

    routes: {
      // Ask for a code. A TV that is already paired is told so and reloads.
      async POST(request) {
        const paired = await readTvDevice(request);
        if (paired.status === 'paired') return json({ status: 'paired' }, 200);
        if (paired.status === 'unavailable') return json({ status: 'unavailable' }, 503);

        const { ip } = requestContext(request.headers);
        const previous = cookieFromRequest(request, pairingCookie);
        const secret = randomToken();
        try {
          const admin = await deps.adminClient();
          for (let attempt = 1; attempt <= CODE_DRAWS; attempt += 1) {
            const code = draw();
            const { error } = await admin.rpc('kit_tv_issue_code', {
              p_code_hash: sha256Hex(code),
              p_secret_hash: sha256Hex(secret),
              p_ip: ip,
              p_previous_secret_hash: previous && SECRET_SHAPE.test(previous) ? sha256Hex(previous) : null,
              p_ttl_seconds: PAIRING_CODE_TTL_SECONDS,
            });
            if (!error) {
              return json({ status: 'code', code, expiresInSeconds: PAIRING_CODE_TTL_SECONDS, pollMs: PAIRING_POLL_MS }, 200, [
                // A minute longer than the code, so the last poll still carries it.
                serialiseCookie(pairingCookie, secret, PAIRING_CODE_TTL_SECONDS + 60, secure),
              ]);
            }
            const refusal = kitRefusal(error);
            if (refusal === 'kit_tv_code_collision') continue;
            if (refusal === 'kit_tv_code_rate_limited' || refusal === 'kit_tv_code_capacity') {
              report(`pairing:${refusal}`, error);
              return json({ status: 'rate_limited', retryAfterSeconds: 60 }, 429, [], { 'Retry-After': '60' });
            }
            throw error;
          }
          throw new Error('no free pairing code after several draws');
        } catch (error) {
          report('pairing:issue_code', error);
          return json({ status: 'unavailable' }, 503);
        }
      },

      // The poll. Pairs the TV once a host has typed its code.
      async GET(request) {
        const secret = cookieFromRequest(request, pairingCookie);
        if (!secret || !SECRET_SHAPE.test(secret)) {
          const paired = await readTvDevice(request);
          if (paired.status === 'paired') return json({ status: 'paired' }, 200);
          if (paired.status === 'unavailable') return json({ status: 'unavailable' }, 503);
          return json({ status: 'expired' }, 200);
        }
        const token = randomToken();
        try {
          const admin = await deps.adminClient();
          const { data, error } = await admin.rpc('kit_tv_claim', { p_secret_hash: sha256Hex(secret), p_device_token_hash: sha256Hex(token) });
          if (error) throw error;
          const row = firstRow<{ status: string; device_id: string | null }>(data);
          switch (row?.status) {
            case 'waiting':
              return json({ status: 'waiting' }, 200);
            case 'slow_down':
              return json({ status: 'slow_down' }, 429, [], { 'Retry-After': '1' });
            case 'paired':
              if (!row.device_id) throw new Error('paired without a device');
              return json({ status: 'paired' }, 200, [
                serialiseCookie(deviceCookie, token, TV_DEVICE_COOKIE_MAX_AGE_SECONDS, secure),
                serialiseCookie(pairingCookie, '', 0, secure),
              ]);
            case 'expired':
            case 'unknown':
              return json({ status: 'expired' }, 200, [serialiseCookie(pairingCookie, '', 0, secure)]);
            default:
              throw new Error(`unexpected pairing status ${String(row?.status)}`);
          }
        } catch (error) {
          report('pairing:poll', error);
          return json({ status: 'unavailable' }, 503);
        }
      },
    },

    actions: {
      async pairTv(_previous, formData) {
        const who = await caller(['admin', 'host']);
        if (!who.ok) return who.result;
        const code = normalisePairingCode(formData.get('code'));
        if (!code) return fail('validation_failed', PAIRING_MESSAGES.codeInvalid, { field: 'code' });
        const name = normaliseTvName(formData.get('name'));
        if (!name) return fail('validation_failed', PAIRING_MESSAGES.nameTooLong, { field: 'name' });

        try {
          const { ip } = requestContext(await deps.headers());
          const admin = await deps.adminClient();
          const { data, error } = await admin.rpc('kit_tv_pair', { p_code_hash: sha256Hex(code), p_device_name: name, p_user: who.id, p_ip: ip });
          if (error) {
            const refusal = kitRefusal(error);
            if (refusal === 'kit_tv_pair_locked') return fail('rate_limited', PAIRING_MESSAGES.locked);
            if (refusal === 'kit_tv_not_staff') return fail('unauthorised', AUTH_MESSAGES.unauthorised);
            if (refusal === 'kit_tv_invalid_name') return fail('validation_failed', PAIRING_MESSAGES.nameTooLong, { field: 'name' });
            throw error;
          }
          if (data === 'paired') return { status: 'ok', message: PAIRING_MESSAGES.paired, data: { name } };
          if (data === 'wrong') return fail('validation_failed', PAIRING_MESSAGES.codeWrong, { field: 'code' });
          throw new Error(`unexpected pair result ${String(data)}`);
        } catch (error) {
          report('pairing:pair', error);
          return fail('service_unavailable', PAIRING_MESSAGES.unavailable);
        }
      },

      async revokeTv(_previous, formData) {
        const who = await caller(['admin']);
        if (!who.ok) return who.result;
        const deviceId = formData.get('deviceId');
        if (typeof deviceId !== 'string' || !UUID.test(deviceId)) return fail('validation_failed', PAIRING_MESSAGES.revokeMissing);
        try {
          const admin = await deps.adminClient();
          const { data, error } = await admin.rpc('kit_tv_revoke', { p_device: deviceId, p_user: who.id });
          if (error) {
            if (kitRefusal(error) === 'kit_tv_not_admin') return fail('unauthorised', AUTH_MESSAGES.unauthorised);
            throw error;
          }
          if (!data) return fail('validation_failed', PAIRING_MESSAGES.revokeMissing);
          return { status: 'ok', message: PAIRING_MESSAGES.revoked };
        } catch (error) {
          report('pairing:revoke', error);
          return fail('service_unavailable', PAIRING_MESSAGES.revokeUnavailable);
        }
      },

      async listTvDevices(options = {}) {
        const who = await caller(['admin']);
        if (!who.ok) return null;
        const admin = await deps.adminClient();
        const { data, error } = await admin.rpc('kit_tv_list_devices', { p_include_revoked: options.includeRevoked ?? false });
        if (error) throw new Error(`listing TVs failed: ${error.code ?? 'unknown'}`);
        return ((data ?? []) as ListRpcRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
          createdBy: row.created_by,
          createdByEmail: row.created_by_email,
          revokedAt: row.revoked_at,
        }));
      },
    },

    maintenance: {
      async prunePairing() {
        const admin = await deps.adminClient();
        const { data, error } = await admin.rpc('kit_tv_prune_pairing');
        if (error) throw new Error(`pairing clean-up failed: ${error.code ?? 'unknown'}`);
        return data as { codes: number; attempts: number; revoked_devices: number };
      },
    },
  };
}
