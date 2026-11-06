// The pairing templates as text. Their behaviour is replayed on a real
// Postgres by test/db/checks-pairing.sh (npm run test:db), in CI's db job.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAIRING_MIGRATION_TEMPLATES, pairingMigrationFiles, renderPairingMigrations } from './index.js';

const PRINT = join(import.meta.dirname, 'print.js');
const sql = (): string => renderPairingMigrations().map((r) => r.sql).join('\n');

describe('renderPairingMigrations', () => {
  it('renders both templates in order', () => {
    expect(renderPairingMigrations().map((r) => r.name)).toEqual(PAIRING_MIGRATION_TEMPLATES.map((t) => t.name));
    expect(PAIRING_MIGRATION_TEMPLATES.map((t) => t.name)).toEqual(['kit_tv_pairing_tables', 'kit_tv_pairing_functions']);
  });

  it('refuses to run before the auth migrations', () => {
    expect(renderPairingMigrations()[0].sql).toMatch(/to_regprocedure\('public\.kit_staff_role_for\(uuid\)'\) is null/);
  });

  it('keeps the security rules: definer functions with a fixed search_path, revoked from public, anon and authenticated, granted only to the service role', () => {
    const text = sql();
    const functions = text.match(/create or replace function[\s\S]*?\$\$;/gi) ?? [];
    expect(functions).toHaveLength(7);
    for (const fn of functions) {
      expect(fn, fn.slice(0, 80)).toMatch(/security definer/i);
      expect(fn, fn.slice(0, 80)).toMatch(/set search_path = ''/i);
    }
    const names = [...text.matchAll(/create or replace function public\.([a-z_]+)\(/gi)].map((m) => m[1]);
    for (const name of names) {
      expect(text, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`, 'i'));
      const grants = [...text.matchAll(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to ([a-z_, ]+);`, 'gi'))].map((m) => m[1]);
      expect(grants, name).toEqual(['service_role']);
    }
  });

  it('closes every table: RLS on, revoked from public, anon and authenticated', () => {
    const text = sql();
    for (const table of ['tv_devices', 'tv_pairing_codes', 'tv_pairing_attempts']) {
      expect(text).toContain(`alter table public.${table} enable row level security;`);
      expect(text).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
      expect(text).not.toMatch(new RegExp(`grant [a-z, ]+ on table public\\.${table} to [a-z_, ]*(anon|authenticated)`, 'i'));
    }
    expect(text).not.toMatch(/create policy/i);
  });

  it('never stores a raw token, secret or code', () => {
    const text = sql();
    for (const column of ['token_hash', 'secret_hash', 'code_hash']) {
      expect(text).toMatch(new RegExp(`${column} text not null[^,]*check \\(${column} ~ '\\^\\[0-9a-f\\]\\{64\\}\\$'\\)`, 'i'));
    }
    expect(text).not.toMatch(/\b(token|secret|code) text\b/i);
  });
});

describe('pairingMigrationFiles and the CLI', () => {
  it('names files after the timestamp', () => {
    expect(pairingMigrationFiles({ timestamp: '20261112120000' }).map((f) => f.file)).toEqual([
      '20261112120000_kit_tv_pairing_tables.sql',
      '20261112120001_kit_tv_pairing_functions.sql',
    ]);
    expect(() => pairingMigrationFiles({ timestamp: '2026' })).toThrow(/14 digits/);
  });

  it('writes the files once and refuses to overwrite them', () => {
    const out = mkdtempSync(join(tmpdir(), 'kit-pairing-sql-'));
    try {
      const args = [PRINT, '--out', out, '--timestamp', '20261112120000'];
      expect(JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' })).ok).toBe(true);
      expect(readdirSync(out)).toHaveLength(2);
      expect(() => execFileSync(process.execPath, args, { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('prints both migrations with no arguments', () => {
    const printed = execFileSync(process.execPath, [PRINT], { encoding: 'utf8' });
    expect(printed).toContain('-- ==== kit_tv_pairing_tables');
    expect(printed).toContain('-- ==== kit_tv_pairing_functions');
  });
});
