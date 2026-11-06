// The key must never reach the browser: the server entry and the client are
// marked server-only, and nothing a browser loads imports them.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');

const BROWSER_SAFE = [
  'events/shared.ts',
  'events/read.ts',
  'events/select.ts',
  'events/links.ts',
  'events/types.ts',
  ...readdirSync(join(SRC, 'promo'))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .map((name) => `promo/${name}`),
];

describe('the server boundary', () => {
  it('marks the events entry, the client and the feed server-only', () => {
    for (const path of ['events/index.ts', 'events/client.ts', 'events/feed.ts']) {
      expect(read(path), path).toMatch(/^import 'server-only';$/m);
    }
  });

  it('keeps every browser-safe file away from the server code', () => {
    const forbidden = /from '(\.\/client|\.\/feed|\.\/cache|\.\.\/events|\.\.\/events\/index|\.\.\/events\/client|\.\.\/events\/feed|server-only)'/;
    for (const path of BROWSER_SAFE) {
      expect(read(path), path).not.toMatch(forbidden);
      expect(read(path), path).not.toMatch(/process\.env\.ANCHOR_API_KEY|env\.ANCHOR_API_KEY/);
    }
  });
});
