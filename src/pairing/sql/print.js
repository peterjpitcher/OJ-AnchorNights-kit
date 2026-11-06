#!/usr/bin/env node
// Prints, or writes, the TV pairing migrations.
//
//   node node_modules/@anchor-nights/kit/src/pairing/sql/print.js
//   node node_modules/@anchor-nights/kit/src/pairing/sql/print.js \
//     --out supabase/migrations --timestamp 20261112120000
//
// --out        a folder to write the files into (refuses to overwrite).
// --timestamp  the first file's 14-digit version; the second adds one. Pick
//              one after the app's kit auth migrations.
//
// Exit codes: 0 done, 2 bad arguments or a file already exists.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pairingMigrationFiles, renderPairingMigrations } from './index.js';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  const out = arg('out');
  if (out) {
    const files = pairingMigrationFiles({ timestamp: arg('timestamp') });
    for (const { file } of files) {
      if (existsSync(join(out, file))) throw new Error(`${join(out, file)} already exists`);
    }
    for (const { file, sql } of files) writeFileSync(join(out, file), sql);
    process.stdout.write(`${JSON.stringify({ ok: true, wrote: files.map((f) => join(out, f.file)) })}\n`);
  } else {
    process.stdout.write(renderPairingMigrations().map(({ name, sql }) => `-- ==== ${name}\n${sql}`).join('\n'));
  }
} catch (err) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })}\n`);
  process.exit(2);
}
