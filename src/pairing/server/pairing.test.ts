// The pairing endpoint, the device lookup and the actions against fake
// clients. Every public path (asking for a code, the poll, the pair action)
// has tests that break one dependency at a time and assert the caller is
// told, never paired by accident and never shown as paired.
import { describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES, type AuthFormState } from '../../auth/shared';
import { sha256Hex } from '../../auth/server/crypto';
import { fakeClient, OTHER_ID, USER_ID, type FakeClient } from '../../../test/auth-fakes';
import { PAIRING_MESSAGES, TV_DEVICE_COOKIE_MAX_AGE_SECONDS, type TvDevice } from '../shared';
import { cookieFromRequest, createTvPairing, drawPairingCode, type TvPairingDeps } from './pairing';

const IDLE: AuthFormState = { status: 'idle' };
const TOKEN = 'T'.repeat(43);
const SECRET = 'S'.repeat(43);
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const DEVICE_ROW = { id: DEVICE_ID, name: 'Bar TV', created_at: '2026-11-06T20:00:00Z', last_seen_at: null };
const ORIGIN = 'https://quiz.example.test';

interface Rig {
  server: FakeClient;
  admin: FakeClient;
  reports: string[];
  deps: TvPairingDeps;
  jar: Map<string, string>;
}

function rig(role: string | null = 'host', secure = true): Rig {
  const server = fakeClient(role);
  const admin = fakeClient(role);
  const reports: string[] = [];
  const jar = new Map<string, string>();
  const codes = ['123456', '654321', '111111', '222222', '333333', '444444'];
  const deps: TvPairingDeps = {
    config: { secureCookies: secure },
    serverClient: async () => server.client,
    adminClient: () => admin.client,
    cookies: async () => ({ get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined) }),
    headers: async () => ({ get: (name: string) => (name === 'x-real-ip' ? '203.0.113.7' : null) }),
    report: (scope) => {
      reports.push(scope);
    },
    now: () => new Date('2026-11-06T20:30:00Z'),
    drawCode: () => codes.shift() ?? '999999',
  };
  return { server, admin, reports, deps, jar };
}

const request = (method: 'GET' | 'POST', cookies: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}/api/tv/pairing`, {
    method,
    headers: {
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      'x-real-ip': '198.51.100.20',
    },
  });

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const setCookies = (response: Response): string[] => response.headers.getSetCookie();
const dbError = (code = 'XX000', message = 'boom'): { code: string; message: string } => ({ code, message });

describe('drawPairingCode and cookieFromRequest', () => {
  it('draws six digits, keeping leading zeros', () => {
    for (let i = 0; i < 200; i += 1) expect(drawPairingCode()).toMatch(/^[0-9]{6}$/);
  });

  it('reads one cookie and ignores the rest', () => {
    const r = request('GET', { other: 'x', '__Host-anchor-tv': TOKEN });
    expect(cookieFromRequest(r, '__Host-anchor-tv')).toBe(TOKEN);
    expect(cookieFromRequest(r, 'missing')).toBeUndefined();
    expect(cookieFromRequest(new Request(ORIGIN), 'x')).toBeUndefined();
  });
});

describe('readTvDevice and requirePairedTv', () => {
  it('finds the device by the hash of its cookie, never the token itself', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: [DEVICE_ROW], error: null }));
    const pairing = createTvPairing(r.deps);
    const device = await pairing.requirePairedTv(request('GET', { '__Host-anchor-tv': TOKEN }));
    expect(device).toEqual({ id: DEVICE_ID, name: 'Bar TV', createdAt: '2026-11-06T20:00:00Z', lastSeenAt: null });
    expect(r.admin.rpcCalls()).toEqual([{ name: 'kit_tv_device_seen', args: { p_token_hash: sha256Hex(TOKEN) } }]);
  });

  it("reads Next's cookies() when given no request", async () => {
    const r = rig();
    r.jar.set('__Host-anchor-tv', TOKEN);
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: [DEVICE_ROW], error: null }));
    expect((await createTvPairing(r.deps).readTvDevice()).status).toBe('paired');
  });

  it('is unpaired with no cookie or a malformed one, without asking the database', async () => {
    const r = rig();
    const pairing = createTvPairing(r.deps);
    expect(await pairing.readTvDevice(request('GET'))).toEqual({ status: 'unpaired' });
    expect(await pairing.readTvDevice(request('GET', { '__Host-anchor-tv': 'short' }))).toEqual({ status: 'unpaired' });
    expect(r.admin.rpcCalls()).toEqual([]);
  });

  it('is unpaired for a revoked or unknown device', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: [], error: null }));
    expect(await createTvPairing(r.deps).requirePairedTv(request('GET', { '__Host-anchor-tv': TOKEN }))).toBeNull();
  });

  it('fails closed on an outage: null from requirePairedTv, unavailable from readTvDevice, and reported', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: null, error: dbError() }));
    const pairing = createTvPairing(r.deps);
    const req = (): Request => request('GET', { '__Host-anchor-tv': TOKEN });
    expect(await pairing.requirePairedTv(req())).toBeNull();
    expect(await pairing.readTvDevice(req())).toEqual({ status: 'unavailable' });
    expect(r.reports).toContain('pairing:device_lookup');
  });

  it('uses the plain cookie name on http localhost', async () => {
    const r = rig('host', false);
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: [DEVICE_ROW], error: null }));
    expect(await createTvPairing(r.deps).requirePairedTv(request('GET', { 'anchor-tv': TOKEN }))).not.toBeNull();
  });
});

describe('resolveTvView', () => {
  const paired = (): Rig => {
    const r = rig();
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: [DEVICE_ROW], error: null }));
    return r;
  };
  const source = (): Request => request('GET', { '__Host-anchor-tv': TOKEN });

  it('passes the device, the time and the rehearsal flag to the app', async () => {
    const r = paired();
    const resolveTonight = vi.fn(async ({ device }: { device: TvDevice }) => ({ sessionId: 'abc', on: device.name }));
    const view = await createTvPairing(r.deps).resolveTvView({ resolveTonight, rehearsal: true, source: source() });
    expect(view).toMatchObject({ kind: 'game', game: { sessionId: 'abc', on: 'Bar TV' }, rehearsal: true });
    expect(resolveTonight.mock.calls[0][0]).toMatchObject({ rehearsal: true, now: new Date('2026-11-06T20:30:00Z') });
  });

  it('shows the idle loop when there is nothing tonight', async () => {
    const view = await createTvPairing(paired().deps).resolveTvView({ resolveTonight: async () => null, rehearsal: false, source: source() });
    expect(view.kind).toBe('idle');
  });

  it('never calls the resolver for an unpaired screen', async () => {
    const resolveTonight = vi.fn(async () => 'game');
    const view = await createTvPairing(rig().deps).resolveTvView({ resolveTonight, rehearsal: false, source: request('GET') });
    expect(view).toEqual({ kind: 'unpaired' });
    expect(resolveTonight).not.toHaveBeenCalled();
  });

  it('shows the retry notice, not the game and not a code, when the resolver or the lookup fails', async () => {
    const r = paired();
    const view = await createTvPairing(r.deps).resolveTvView({
      resolveTonight: async () => {
        throw new Error('db down');
      },
      rehearsal: false,
      source: source(),
    });
    expect(view).toEqual({ kind: 'unavailable', reason: 'resolver' });
    expect(r.reports).toContain('pairing:resolve_tonight');

    const down = rig();
    down.admin.onRpc('kit_tv_device_seen', () => ({ data: null, error: dbError() }));
    expect(await createTvPairing(down.deps).resolveTvView({ resolveTonight: async () => 'x', rehearsal: false, source: source() })).toEqual({
      kind: 'unavailable',
      reason: 'device_lookup',
    });
  });
});

describe('POST: asking for a code', () => {
  it('stores only hashes, answers the code and sets the pairing cookie', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_issue_code', () => ({ data: '2026-11-06T20:40:00Z', error: null }));
    const response = await createTvPairing(r.deps).routes.POST(request('POST'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'code', code: '123456', expiresInSeconds: 600, pollMs: 3000 });
    const [call] = r.admin.rpcCalls();
    expect(call.args).toMatchObject({ p_code_hash: sha256Hex('123456'), p_ip: '198.51.100.20', p_previous_secret_hash: null, p_ttl_seconds: 600 });
    const [cookie] = setCookies(response);
    expect(cookie).toMatch(/^__Host-anchor-tv-pairing=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=660; HttpOnly; SameSite=Lax; Secure$/);
    const secret = cookie.split(';')[0].split('=')[1];
    expect(call.args.p_secret_hash).toBe(sha256Hex(secret));
    expect(JSON.stringify(call.args)).not.toContain('123456');
  });

  it('replaces the code the same screen held before', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_issue_code', () => ({ data: 'x', error: null }));
    await createTvPairing(r.deps).routes.POST(request('POST', { '__Host-anchor-tv-pairing': SECRET }));
    expect(r.admin.rpcCalls()[0].args.p_previous_secret_hash).toBe(sha256Hex(SECRET));
  });

  it('draws again when another screen holds the same code', async () => {
    const r = rig();
    let calls = 0;
    r.admin.onRpc('kit_tv_issue_code', () => {
      calls += 1;
      return calls === 1 ? { data: null, error: dbError('23505', 'kit_tv_code_collision') } : { data: 'x', error: null };
    });
    const body = await (await createTvPairing(r.deps).routes.POST(request('POST'))).json();
    expect(body.code).toBe('654321');
    expect(r.admin.rpcCalls()[1].args.p_code_hash).toBe(sha256Hex('654321'));
  });

  it('answers 429 when the IP has asked too often or too many codes are live', async () => {
    for (const refusal of ['kit_tv_code_rate_limited', 'kit_tv_code_capacity']) {
      const r = rig();
      r.admin.onRpc('kit_tv_issue_code', () => ({ data: null, error: dbError('54000', refusal) }));
      const response = await createTvPairing(r.deps).routes.POST(request('POST'));
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(await response.json()).toEqual({ status: 'rate_limited', retryAfterSeconds: 60 });
      expect(setCookies(response)).toEqual([]);
    }
  });

  it('fails closed with 503, no code and no cookie when the database fails or cannot be reached', async () => {
    const broken = rig();
    broken.admin.onRpc('kit_tv_issue_code', () => ({ data: null, error: dbError() }));
    const unreachable = rig();
    unreachable.deps.adminClient = () => {
      throw new Error('no service role key');
    };
    const collisions = rig();
    collisions.admin.onRpc('kit_tv_issue_code', () => ({ data: null, error: dbError('23505', 'kit_tv_code_collision') }));
    for (const r of [broken, unreachable, collisions]) {
      const response = await createTvPairing(r.deps).routes.POST(request('POST'));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: 'unavailable' });
      expect(setCookies(response)).toEqual([]);
      expect(r.reports).toContain('pairing:issue_code');
    }
  });

  it('tells a screen that is already paired to reload, and refuses while the device lookup is down', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_device_seen', () => ({ data: [DEVICE_ROW], error: null }));
    const response = await createTvPairing(r.deps).routes.POST(request('POST', { '__Host-anchor-tv': TOKEN }));
    expect(await response.json()).toEqual({ status: 'paired' });
    expect(r.admin.rpcCalls().map((c) => c.name)).toEqual(['kit_tv_device_seen']);

    const down = rig();
    down.admin.onRpc('kit_tv_device_seen', () => ({ data: null, error: dbError() }));
    expect((await createTvPairing(down.deps).routes.POST(request('POST', { '__Host-anchor-tv': TOKEN }))).status).toBe(503);
  });
});

describe('GET: the poll', () => {
  const poll = (r: Rig, cookies: Record<string, string> = { '__Host-anchor-tv-pairing': SECRET }): Promise<Response> =>
    createTvPairing(r.deps).routes.GET(request('GET', cookies));

  it('waits', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_claim', () => ({ data: [{ status: 'waiting', device_id: null, device_name: null }], error: null }));
    const response = await poll(r);
    expect(await response.json()).toEqual({ status: 'waiting' });
    expect(setCookies(response)).toEqual([]);
  });

  it('pairs: a fresh device token in a 400-day httpOnly cookie, its hash to the database, the pairing cookie cleared', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_claim', () => ({ data: [{ status: 'paired', device_id: DEVICE_ID, device_name: 'Bar TV' }], error: null }));
    const response = await poll(r);
    expect(await response.json()).toEqual({ status: 'paired' });
    const [device, cleared] = setCookies(response);
    expect(device).toMatch(new RegExp(`^__Host-anchor-tv=[A-Za-z0-9_-]{43}; Path=/; Max-Age=${TV_DEVICE_COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax; Secure$`));
    expect(TV_DEVICE_COOKIE_MAX_AGE_SECONDS).toBe(34_560_000);
    expect(cleared).toBe('__Host-anchor-tv-pairing=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
    const token = device.split(';')[0].split('=')[1];
    expect(r.admin.rpcCalls()[0].args).toEqual({ p_secret_hash: sha256Hex(SECRET), p_device_token_hash: sha256Hex(token) });
  });

  it('asks for a new code when this one expired or is unknown, clearing the cookie', async () => {
    for (const status of ['expired', 'unknown']) {
      const r = rig();
      r.admin.onRpc('kit_tv_claim', () => ({ data: [{ status, device_id: null, device_name: null }], error: null }));
      const response = await poll(r);
      expect(await response.json()).toEqual({ status: 'expired' });
      expect(setCookies(response)[0]).toContain('Max-Age=0');
    }
  });

  it('is rate limited per code', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_claim', () => ({ data: [{ status: 'slow_down', device_id: null, device_name: null }], error: null }));
    const response = await poll(r);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ status: 'slow_down' });
  });

  it('with no pairing cookie, asks for a code without touching the codes table', async () => {
    const r = rig();
    const response = await poll(r, {});
    expect(await response.json()).toEqual({ status: 'expired' });
    expect(r.admin.rpcCalls().map((c) => c.name)).not.toContain('kit_tv_claim');
  });

  it('fails closed with 503 and no device cookie on any failure', async () => {
    const cases: ((r: Rig) => void)[] = [
      (r) => r.admin.onRpc('kit_tv_claim', () => ({ data: null, error: dbError() })),
      (r) => r.admin.onRpc('kit_tv_claim', () => ({ data: [{ status: 'paired', device_id: null }], error: null })),
      (r) => r.admin.onRpc('kit_tv_claim', () => ({ data: [{ status: 'something_else' }], error: null })),
      (r) => {
        r.deps.adminClient = () => Promise.reject(new Error('down'));
      },
    ];
    for (const breakIt of cases) {
      const r = rig();
      breakIt(r);
      const response = await poll(r);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: 'unavailable' });
      expect(setCookies(response)).toEqual([]);
      expect(r.reports).toContain('pairing:poll');
    }
  });
});

describe('pairTv', () => {
  const paired = (r: Rig, result: { data: unknown; error: unknown } = { data: 'paired', error: null }): void =>
    r.admin.onRpc('kit_tv_pair', () => result);

  it('pairs for a host: the code goes to the database as a hash, with the caller and IP', async () => {
    const r = rig('host');
    paired(r);
    const result = await createTvPairing(r.deps).actions.pairTv(IDLE, form({ code: '123 456', name: '  Bar   TV ' }));
    expect(result).toEqual({ status: 'ok', message: PAIRING_MESSAGES.paired, data: { name: 'Bar TV' } });
    expect(r.admin.rpcCalls()).toEqual([
      { name: 'kit_tv_pair', args: { p_code_hash: sha256Hex('123456'), p_device_name: 'Bar TV', p_user: USER_ID, p_ip: '203.0.113.7' } },
    ]);
  });

  it('names a blank TV "Pub TV" and lets an admin pair too', async () => {
    const r = rig('admin');
    paired(r);
    await createTvPairing(r.deps).actions.pairTv(IDLE, form({ code: '123456', name: '' }));
    expect(r.admin.rpcCalls()[0].args.p_device_name).toBe('Pub TV');
  });

  it('refuses a signed-out, pending or deactivated caller without touching the codes', async () => {
    const out = rig();
    out.server.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await createTvPairing(out.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({ status: 'error', code: 'unauthenticated' });
    for (const role of ['pending', null]) {
      const r = rig(role);
      expect(await createTvPairing(r.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({ status: 'error', code: 'unauthorised' });
      expect(r.admin.rpcCalls()).toEqual([]);
    }
  });

  it('refuses when the database says the caller is no longer staff', async () => {
    const r = rig('host');
    paired(r, { data: null, error: dbError('42501', 'kit_tv_not_staff') });
    expect(await createTvPairing(r.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({ code: 'unauthorised', error: AUTH_MESSAGES.unauthorised });
  });

  it('checks the code shape and the name length before asking the database', async () => {
    const r = rig();
    const actions = createTvPairing(r.deps).actions;
    for (const code of ['12345', '1234567', 'abcdef', '']) {
      expect(await actions.pairTv(IDLE, form({ code }))).toMatchObject({ status: 'error', field: 'code', error: PAIRING_MESSAGES.codeInvalid });
    }
    expect(await actions.pairTv(IDLE, form({ code: '123456', name: 'x'.repeat(41) }))).toMatchObject({ field: 'name' });
    expect(r.admin.rpcCalls()).toEqual([]);
  });

  it('says a wrong code is wrong, and a locked caller is locked', async () => {
    const wrong = rig();
    paired(wrong, { data: 'wrong', error: null });
    expect(await createTvPairing(wrong.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({
      status: 'error',
      code: 'validation_failed',
      field: 'code',
      error: PAIRING_MESSAGES.codeWrong,
    });
    const locked = rig();
    paired(locked, { data: null, error: dbError('54000', 'kit_tv_pair_locked') });
    expect(await createTvPairing(locked.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({ code: 'rate_limited', error: PAIRING_MESSAGES.locked });
  });

  it('fails closed: an outage or an odd answer is an error the host sees, never a success', async () => {
    const cases: ((r: Rig) => void)[] = [
      (r) => paired(r, { data: null, error: dbError() }),
      (r) => paired(r, { data: 'maybe', error: null }),
      (r) => {
        r.deps.adminClient = () => {
          throw new Error('down');
        };
      },
      (r) => {
        r.deps.headers = () => Promise.reject(new Error('no headers'));
      },
    ];
    for (const breakIt of cases) {
      const r = rig();
      breakIt(r);
      expect(await createTvPairing(r.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({
        status: 'error',
        code: 'service_unavailable',
        error: PAIRING_MESSAGES.unavailable,
      });
      expect(r.reports).toContain('pairing:pair');
    }
    const authDown = rig();
    authDown.server.auth.getUser.mockRejectedValue(new Error('auth down'));
    expect(await createTvPairing(authDown.deps).actions.pairTv(IDLE, form({ code: '123456' }))).toMatchObject({ code: 'service_unavailable' });
  });
});

describe('revokeTv, listTvDevices and prunePairing', () => {
  it('lets an admin revoke a device', async () => {
    const r = rig('admin');
    r.admin.onRpc('kit_tv_revoke', () => ({ data: 'Bar TV', error: null }));
    expect(await createTvPairing(r.deps).actions.revokeTv(IDLE, form({ deviceId: DEVICE_ID }))).toEqual({ status: 'ok', message: PAIRING_MESSAGES.revoked });
    expect(r.admin.rpcCalls()).toEqual([{ name: 'kit_tv_revoke', args: { p_device: DEVICE_ID, p_user: USER_ID } }]);
  });

  it('refuses a host, a bad id, and says when the device was already gone', async () => {
    const host = rig('host');
    expect(await createTvPairing(host.deps).actions.revokeTv(IDLE, form({ deviceId: DEVICE_ID }))).toMatchObject({ code: 'unauthorised' });
    expect(host.admin.rpcCalls()).toEqual([]);
    const r = rig('admin');
    r.admin.onRpc('kit_tv_revoke', () => ({ data: null, error: null }));
    const actions = createTvPairing(r.deps).actions;
    expect(await actions.revokeTv(IDLE, form({ deviceId: 'nope' }))).toMatchObject({ error: PAIRING_MESSAGES.revokeMissing });
    expect(await actions.revokeTv(IDLE, form({ deviceId: DEVICE_ID }))).toMatchObject({ error: PAIRING_MESSAGES.revokeMissing });
  });

  it('reports a failed revoke as an error', async () => {
    const r = rig('admin');
    r.admin.onRpc('kit_tv_revoke', () => ({ data: null, error: dbError() }));
    expect(await createTvPairing(r.deps).actions.revokeTv(IDLE, form({ deviceId: DEVICE_ID }))).toMatchObject({ code: 'service_unavailable' });
    const notAdmin = rig('admin');
    notAdmin.admin.onRpc('kit_tv_revoke', () => ({ data: null, error: dbError('42501', 'kit_tv_not_admin') }));
    expect(await createTvPairing(notAdmin.deps).actions.revokeTv(IDLE, form({ deviceId: DEVICE_ID }))).toMatchObject({ code: 'unauthorised' });
  });

  it('lists devices for an admin only', async () => {
    const r = rig('admin');
    r.admin.onRpc('kit_tv_list_devices', () => ({
      data: [{ ...DEVICE_ROW, created_by: OTHER_ID, created_by_email: 'host@example.test', revoked_at: null }],
      error: null,
    }));
    expect(await createTvPairing(r.deps).actions.listTvDevices()).toEqual([
      { id: DEVICE_ID, name: 'Bar TV', createdAt: '2026-11-06T20:00:00Z', lastSeenAt: null, createdBy: OTHER_ID, createdByEmail: 'host@example.test', revokedAt: null },
    ]);
    expect(r.admin.rpcCalls().at(-1)?.args).toEqual({ p_include_revoked: false });
    expect(await createTvPairing(rig('host').deps).actions.listTvDevices()).toBeNull();
    const broken = rig('admin');
    broken.admin.onRpc('kit_tv_list_devices', () => ({ data: null, error: dbError() }));
    await expect(createTvPairing(broken.deps).actions.listTvDevices()).rejects.toThrow(/listing TVs failed/);
  });

  it('prunes, and throws when the clean-up fails', async () => {
    const r = rig();
    r.admin.onRpc('kit_tv_prune_pairing', () => ({ data: { codes: 3, attempts: 1, revoked_devices: 0 }, error: null }));
    expect(await createTvPairing(r.deps).maintenance.prunePairing()).toEqual({ codes: 3, attempts: 1, revoked_devices: 0 });
    const broken = rig();
    broken.admin.onRpc('kit_tv_prune_pairing', () => ({ data: null, error: dbError() }));
    await expect(createTvPairing(broken.deps).maintenance.prunePairing()).rejects.toThrow(/clean-up failed/);
  });
});
