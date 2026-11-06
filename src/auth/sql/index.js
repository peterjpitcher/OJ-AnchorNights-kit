// @anchor-nights/kit/auth/sql: the migration templates for the auth module.
//
// Plain JavaScript using only node: built-ins, so the CLI beside it
// (print.js) runs with bare `node` and the replay test can render the same
// files the apps apply. Types are in index.d.ts; keep the two in step.
//
// The templates live in ./templates. They are rendered for one app, never
// applied as they are: the only placeholder is the profile key column, which
// is "id" in Cash Bingo and "user_id" in Quiz Night.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'templates');

/** The templates, in the order they must be applied. */
export const AUTH_MIGRATION_TEMPLATES = Object.freeze([
  { name: 'kit_auth_profiles_and_gate', file: '01_profiles_and_gate.sql' },
  { name: 'kit_auth_audit', file: '02_auth_audit.sql' },
  { name: 'kit_auth_invites', file: '03_invites.sql' },
  { name: 'kit_auth_recovery_grants', file: '04_recovery_grants.sql' },
  { name: 'kit_auth_hooks_and_retention', file: '05_hooks_and_retention.sql' },
]);

/** The profile key columns the templates support. */
export const PROFILE_ID_COLUMNS = Object.freeze(['id', 'user_id']);

const TABLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const TIMESTAMP = /^\d{14}$/;

function readTemplate(file) {
  return readFileSync(join(TEMPLATE_DIR, file), 'utf8');
}

function assertProfileIdColumn(profileIdColumn) {
  if (!PROFILE_ID_COLUMNS.includes(profileIdColumn)) {
    throw new Error(`profileIdColumn must be one of ${PROFILE_ID_COLUMNS.join(', ')}; got ${JSON.stringify(profileIdColumn)}`);
  }
}

/**
 * Every auth template rendered for one app, in order.
 * @param {{ profileIdColumn: 'id' | 'user_id' }} options
 */
export function renderAuthMigrations({ profileIdColumn }) {
  assertProfileIdColumn(profileIdColumn);
  return AUTH_MIGRATION_TEMPLATES.map(({ name, file }) => {
    const sql = readTemplate(file).replaceAll('{{profile_id}}', profileIdColumn);
    if (sql.includes('{{')) throw new Error(`${file} still has a placeholder after rendering`);
    return { name, sql };
  });
}

/**
 * The restrictive active_staff_gate policy for each named table in public.
 * Every table the authenticated role can reach needs it (spec S1.9).
 * @param {readonly string[]} tables
 */
export function renderActiveStaffGate(tables) {
  if (!Array.isArray(tables) || tables.length === 0) throw new Error('renderActiveStaffGate needs at least one table name');
  const template = readTemplate('active_staff_gate.sql');
  return tables
    .map((table) => {
      if (typeof table !== 'string' || !TABLE_NAME.test(table)) {
        throw new Error(`not a plain lower-case table name: ${JSON.stringify(table)}`);
      }
      return template.replaceAll('{{table}}', table);
    })
    .join('\n');
}

/**
 * The migration files for an app: one per template, named
 * `<timestamp + n>_<name>.sql` so they sort after the app's existing ones.
 * @param {{ profileIdColumn: 'id' | 'user_id', timestamp: string, gateTables?: readonly string[] }} options
 */
export function authMigrationFiles({ profileIdColumn, timestamp, gateTables = [] }) {
  if (typeof timestamp !== 'string' || !TIMESTAMP.test(timestamp)) {
    throw new Error('timestamp must be 14 digits, YYYYMMDDHHMMSS (UTC, as the Supabase CLI writes them)');
  }
  const base = BigInt(timestamp);
  const files = renderAuthMigrations({ profileIdColumn }).map(({ name, sql }, index) => ({
    file: `${(base + BigInt(index)).toString()}_${name}.sql`,
    sql,
  }));
  if (gateTables.length > 0) {
    files.push({
      file: `${(base + BigInt(files.length)).toString()}_kit_auth_active_staff_gate.sql`,
      sql: renderActiveStaffGate(gateTables),
    });
  }
  return files;
}

/**
 * Lists every table in public that the authenticated role can reach but that
 * has no restrictive policy calling is_active_staff(), or has RLS off. Run it
 * in an app's replay test and expect no rows.
 */
export const ACTIVE_STAFF_GATE_AUDIT_SQL = `select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and (
    has_table_privilege('authenticated', c.oid, 'select')
    or has_table_privilege('authenticated', c.oid, 'insert')
    or has_table_privilege('authenticated', c.oid, 'update')
    or has_table_privilege('authenticated', c.oid, 'delete')
  )
  and (
    not c.relrowsecurity
    or not exists (
      select 1 from pg_policy p
      where p.polrelid = c.oid
        and not p.polpermissive
        and pg_get_expr(p.polqual, p.polrelid) like '%is_active_staff()%'
    )
  )
order by 1`;
