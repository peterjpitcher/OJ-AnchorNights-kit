// @anchor-nights/kit/pairing/sql: the migration templates for TV pairing.
//
// Plain JavaScript using only node: built-ins, so the CLI beside it
// (print.js) runs with bare `node` and the replay test applies the same
// files the apps do. Types are in index.d.ts; keep the two in step.
//
// The templates have no placeholders. They must be applied after the kit
// auth migrations (they call public.kit_staff_role_for), and refuse to run
// without them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'templates');

/** The templates, in the order they must be applied. */
export const PAIRING_MIGRATION_TEMPLATES = Object.freeze([
  { name: 'kit_tv_pairing_tables', file: '01_tables.sql' },
  { name: 'kit_tv_pairing_functions', file: '02_functions.sql' },
]);

const TIMESTAMP = /^\d{14}$/;

/** Every pairing template, in order. */
export function renderPairingMigrations() {
  return PAIRING_MIGRATION_TEMPLATES.map(({ name, file }) => {
    const sql = readFileSync(join(TEMPLATE_DIR, file), 'utf8');
    if (sql.includes('{{')) throw new Error(`${file} has a placeholder, which pairing templates must not`);
    return { name, sql };
  });
}

/**
 * The migration files for an app: `<timestamp + n>_<name>.sql`. Pick a
 * timestamp after the app's kit auth migrations.
 * @param {{ timestamp: string }} options
 */
export function pairingMigrationFiles({ timestamp }) {
  if (typeof timestamp !== 'string' || !TIMESTAMP.test(timestamp)) {
    throw new Error('timestamp must be 14 digits, YYYYMMDDHHMMSS (UTC, as the Supabase CLI writes them)');
  }
  const base = BigInt(timestamp);
  return renderPairingMigrations().map(({ name, sql }, index) => ({
    file: `${(base + BigInt(index)).toString()}_${name}.sql`,
    sql,
  }));
}
