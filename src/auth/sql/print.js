#!/usr/bin/env node
// Prints, or writes, the auth migrations rendered for one app.
//
//   node node_modules/@anchor-nights/kit/src/auth/sql/print.js --profile-id user_id
//   node node_modules/@anchor-nights/kit/src/auth/sql/print.js --profile-id id \
//     --gate sessions,game_states --out supabase/migrations --timestamp 20261110120000
//
// --profile-id  the profiles key column: id (Cash Bingo) or user_id (Quiz Night).
// --gate        comma-separated public tables the authenticated role can reach;
//               adds one more migration putting the active_staff_gate on each.
// --out         a folder to write the files into (refuses to overwrite).
// --timestamp   the first file's 14-digit version; each next file adds one.
//
// Exit codes: 0 done, 2 bad arguments or a file already exists.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authMigrationFiles, renderActiveStaffGate, renderAuthMigrations } from './index.js';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  const profileIdColumn = arg('profile-id');
  const gateTables = (arg('gate') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const out = arg('out');
  if (out) {
    const files = authMigrationFiles({ profileIdColumn, timestamp: arg('timestamp'), gateTables });
    for (const { file } of files) {
      if (existsSync(join(out, file))) throw new Error(`${join(out, file)} already exists`);
    }
    for (const { file, sql } of files) writeFileSync(join(out, file), sql);
    process.stdout.write(`${JSON.stringify({ ok: true, wrote: files.map((f) => join(out, f.file)) })}\n`);
  } else {
    const parts = renderAuthMigrations({ profileIdColumn }).map(({ name, sql }) => `-- ==== ${name}\n${sql}`);
    if (gateTables.length > 0) parts.push(`-- ==== kit_auth_active_staff_gate\n${renderActiveStaffGate(gateTables)}`);
    process.stdout.write(parts.join('\n'));
  }
} catch (err) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })}\n`);
  process.exit(2);
}
