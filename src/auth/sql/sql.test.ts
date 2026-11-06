// The templates as text. Their behaviour is replayed on a real Postgres by
// test/db/run.sh (npm run test:db), in CI's db job.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTH_MIGRATION_TEMPLATES, authMigrationFiles, renderActiveStaffGate, renderAuthMigrations } from './index.js';

const PRINT = join(import.meta.dirname, 'print.js');

describe('renderAuthMigrations', () => {
  it('renders every template in order with no placeholder left', () => {
    for (const column of ['id', 'user_id'] as const) {
      const rendered = renderAuthMigrations({ profileIdColumn: column });
      expect(rendered.map((r) => r.name)).toEqual(AUTH_MIGRATION_TEMPLATES.map((t) => t.name));
      for (const { sql } of rendered) expect(sql).not.toContain('{{');
    }
  });

  it('refuses any other profile key', () => {
    expect(() => renderAuthMigrations({ profileIdColumn: 'uid' as 'id' })).toThrow(/profileIdColumn/);
  });

  it('keeps the security rules: fixed search_path on every SECURITY DEFINER, execute revoked from public first', () => {
    const sql = renderAuthMigrations({ profileIdColumn: 'id' }).map((r) => r.sql).join('\n');
    const definers = sql.match(/create or replace function[\s\S]*?\$\$;/gi) ?? [];
    expect(definers.length).toBeGreaterThan(15);
    for (const fn of definers) {
      if (/security definer/i.test(fn)) expect(fn, fn.slice(0, 80)).toMatch(/set search_path = ''/i);
    }
    const names = [...sql.matchAll(/create or replace function public\.([a-z_]+)\(/gi)].map((m) => m[1]);
    for (const name of new Set(names)) {
      expect(sql, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`, 'i'));
    }
    expect(sql).not.toMatch(/inviteUserByEmail/i);
  });

  it('never stores a raw token: grants and invites keep only a SHA-256 hash', () => {
    const sql = renderAuthMigrations({ profileIdColumn: 'id' }).map((r) => r.sql).join('\n');
    expect(sql).toMatch(/token_hash text not null[^,]*check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
    expect(sql).not.toMatch(/\btoken text\b/i);
  });
});

describe('renderActiveStaffGate', () => {
  it('makes one restrictive policy per table and refuses odd names', () => {
    const sql = renderActiveStaffGate(['sessions', 'game_states']);
    expect(sql.match(/as restrictive/gi)).toHaveLength(2);
    expect(sql).toContain('public.game_states');
    expect(() => renderActiveStaffGate([])).toThrow();
    expect(() => renderActiveStaffGate(['x; drop table y'])).toThrow(/table name/);
    expect(() => renderActiveStaffGate(['Sessions'])).toThrow(/table name/);
  });
});

describe('authMigrationFiles and the CLI', () => {
  it('names files after the timestamp so they sort in order', () => {
    const files = authMigrationFiles({ profileIdColumn: 'user_id', timestamp: '20261110120000', gateTables: ['sessions'] });
    expect(files.map((f) => f.file)).toEqual([
      '20261110120000_kit_auth_profiles_and_gate.sql',
      '20261110120001_kit_auth_audit.sql',
      '20261110120002_kit_auth_invites.sql',
      '20261110120003_kit_auth_recovery_grants.sql',
      '20261110120004_kit_auth_hooks_and_retention.sql',
      '20261110120005_kit_auth_active_staff_gate.sql',
    ]);
    expect(() => authMigrationFiles({ profileIdColumn: 'id', timestamp: '2026' })).toThrow(/14 digits/);
  });

  it('writes the files once and refuses to overwrite them', () => {
    const out = mkdtempSync(join(tmpdir(), 'kit-sql-'));
    try {
      const args = [PRINT, '--profile-id', 'id', '--gate', 'sessions', '--out', out, '--timestamp', '20261110120000'];
      const result = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
      expect(result.ok).toBe(true);
      expect(readdirSync(out)).toHaveLength(6);
      expect(() => execFileSync(process.execPath, args, { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('exits 2 on a bad argument', () => {
    try {
      execFileSync(process.execPath, [PRINT, '--profile-id', 'nope'], { stdio: 'pipe' });
      expect.unreachable();
    } catch (error) {
      expect((error as { status: number }).status).toBe(2);
    }
  });
});
