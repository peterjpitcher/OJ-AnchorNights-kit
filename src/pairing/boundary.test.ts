// Device tokens and the service-role client must never reach a browser: the
// server entry is marked server-only, and nothing a browser loads imports
// the server half.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAIRING = import.meta.dirname;
const read = (path: string): string => readFileSync(join(PAIRING, path), 'utf8');
const sources = (dir: string): string[] =>
  readdirSync(join(PAIRING, dir))
    .filter((name) => /\.(tsx?|js)$/.test(name) && !/\.test\./.test(name))
    .map((name) => (dir === '.' ? name : `${dir}/${name}`));

describe('the pairing server boundary', () => {
  it('marks the server entry server-only', () => {
    expect(read('index.ts')).toMatch(/^import 'server-only';$/m);
  });

  it('keeps the shared half, the page shell and the screens away from server code', () => {
    for (const path of ['shared.ts', 'page-shell.tsx', ...sources('screens')]) {
      const text = read(path);
      expect(text, path).not.toMatch(/from '(\.\.\/)*(server|index)(\/[a-z-]+)?'/);
      expect(text, path).not.toMatch(/from '(\.\.\/)+auth\/server\/|from '(\.\.\/)+auth'|from '(\.\.\/)+auth\/index'/);
      expect(text, path).not.toMatch(/from '\.\.'|from '\.'/);
      expect(text, path).not.toMatch(/node:crypto|SERVICE_ROLE/);
    }
  });

  it("marks every screen 'use client'", () => {
    for (const path of sources('screens').filter((p) => p.endsWith('.tsx'))) {
      expect(read(path).startsWith("'use client';"), path).toBe(true);
    }
  });

  it('keeps the SQL entry plain JavaScript with node built-ins only', () => {
    expect(read('sql/index.js').match(/^import .* from '([^']+)';$/gm)?.every((line) => /'node:/.test(line))).toBe(true);
  });
});
