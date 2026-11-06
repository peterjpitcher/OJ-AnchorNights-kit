// Fakes for the auth module's tests: a Supabase client whose every call is a
// vi.fn a test can override, plus a harness wiring them into AuthDeps. Kept
// outside src so it never ships in the package.
import { vi } from 'vitest';
import { defineAuthConfig, type AuthConfig } from '../src/auth/server/config';
import type { AuthDeps } from '../src/auth/server/deps';
import type { AuthAuditRow } from '../src/auth/server/audit';
import { memoryRateLimiter } from '../src/auth/server/rate-limit';
import type { BreachResult } from '../src/auth/server/password-policy';
import type { AnySupabaseClient, AuthAlert, CookieJar, CookieOptions } from '../src/auth/server/types';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_ID = '22222222-2222-4222-8222-222222222222';
export const INVITE_ID = '33333333-3333-4333-8333-333333333333';
/** A token of the right shape (43 base64url characters). Not a secret. */
export const TOKEN = 'A'.repeat(43);
export const STRONG_PASSWORD = 'correct horse battery staple';

export const user = (id = USER_ID, email = 'host@example.test', extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  email,
  ...extra,
});

type Result = { data: unknown; error: unknown };
export type RpcHandler = (args: Record<string, unknown>) => Result | Promise<Result>;

export interface FakeClient {
  client: AnySupabaseClient;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
    verifyOtp: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    admin: {
      createUser: ReturnType<typeof vi.fn>;
      updateUserById: ReturnType<typeof vi.fn>;
      deleteUser: ReturnType<typeof vi.fn>;
      getUserById: ReturnType<typeof vi.fn>;
      listUsers: ReturnType<typeof vi.fn>;
    };
  };
  rpc: ReturnType<typeof vi.fn>;
  /** Replace or add one rpc function's behaviour. */
  onRpc(name: string, handler: RpcHandler): void;
  /** Every rpc call made, in order. */
  rpcCalls(): { name: string; args: Record<string, unknown> }[];
  from: ReturnType<typeof vi.fn>;
}

export function fakeClient(role: string | null = 'host'): FakeClient {
  const handlers = new Map<string, RpcHandler>([['current_staff_role', () => ({ data: role, error: null })]]);
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: user() }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: user(), session: {} }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { user: user(), session: {} }, error: null })),
    updateUser: vi.fn(async () => ({ data: { user: user() }, error: null })),
    admin: {
      createUser: vi.fn(async () => ({ data: { user: user(OTHER_ID, 'new@example.test') }, error: null })),
      updateUserById: vi.fn(async () => ({ data: { user: user(OTHER_ID) }, error: null })),
      deleteUser: vi.fn(async () => ({ data: {}, error: null })),
      getUserById: vi.fn(async (id: string) => ({ data: { user: user(id, 'target@example.test') }, error: null })),
      listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
    },
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ name, args });
    const handler = handlers.get(name);
    if (!handler) return { data: null, error: { message: `no fake for ${name}`, code: 'PGRST202' } };
    return handler(args);
  });
  const from = vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) }));
  const client = { auth, rpc, from } as unknown as AnySupabaseClient;
  return {
    client,
    auth,
    rpc,
    from,
    onRpc: (name, handler) => handlers.set(name, handler),
    rpcCalls: () => calls,
  };
}

export class MemoryJar implements CookieJar {
  store = new Map<string, { value: string; options: CookieOptions }>();
  get(name: string): { value: string } | undefined {
    const found = this.store.get(name);
    return found ? { value: found.value } : undefined;
  }
  set(name: string, value: string, options: CookieOptions): void {
    this.store.set(name, { value, options });
  }
  delete({ name }: { name: string; path?: string }): void {
    this.store.delete(name);
  }
}

export const testConfig = (alerts: AuthAlert[] = []): AuthConfig =>
  defineAuthConfig({
    app: 'kit-test',
    environment: 'test',
    appUrl: 'https://quiz.example.test',
    auditHmacKey: `v1:${'k'.repeat(40)}`,
    homeForRole: { admin: '/admin', host: '/host' },
    alert: (alert) => {
      alerts.push(alert);
    },
  });

export interface Harness {
  server: FakeClient;
  admin: FakeClient;
  jar: MemoryJar;
  alerts: AuthAlert[];
  rows: AuthAuditRow[];
  breach: { result: BreachResult };
  deps: AuthDeps;
  config: AuthConfig;
  form(fields: Record<string, string>): FormData;
}

export function harness(role: string | null = 'host'): Harness {
  const server = fakeClient(role);
  const admin = fakeClient(role);
  const jar = new MemoryJar();
  const alerts: AuthAlert[] = [];
  const rows: AuthAuditRow[] = [];
  const breach = { result: 'clean' as BreachResult };
  const config = testConfig(alerts);
  const headers = new Map([
    ['x-real-ip', '203.0.113.7'],
    ['user-agent', 'vitest'],
  ]);
  const deps: AuthDeps = {
    config,
    serverClient: async () => server.client,
    adminClient: () => admin.client,
    cookies: async () => jar,
    headers: async () => ({ get: (name: string) => headers.get(name) ?? null }),
    limiter: memoryRateLimiter(),
    breachCheck: async () => breach.result,
    auditSink: async (row) => {
      rows.push(row);
    },
  };
  const form = (fields: Record<string, string>): FormData => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };
  return { server, admin, jar, alerts, rows, breach, deps, config, form };
}

/** A Supabase AuthApiError-shaped refusal. */
export const refusal = (status: number, code: string, message = code): Record<string, unknown> => ({ name: 'AuthApiError', status, code, message });
/** A network-level failure, as supabase-js reports one. */
export const outage = (): Record<string, unknown> => ({ name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' });
