// The service-role key and the recovery grant must never reach a browser:
// the server entry is marked server-only, and nothing a browser loads imports
// the server half.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AUTH = import.meta.dirname;
const read = (path: string): string => readFileSync(join(AUTH, path), 'utf8');
const sources = (dir: string): string[] =>
  readdirSync(join(AUTH, dir))
    .filter((name) => /\.(tsx?|js)$/.test(name) && !/\.test\./.test(name))
    .map((name) => (dir === '.' ? name : `${dir}/${name}`));

describe('the auth server boundary', () => {
  it('marks the server entry server-only', () => {
    expect(read('index.ts')).toMatch(/^import 'server-only';$/m);
  });

  it('keeps the shared half, the screens, the proxy and the headers away from the server code', () => {
    const browserSafe = ['shared.ts', 'proxy.ts', 'headers.js', ...sources('screens')];
    for (const path of browserSafe) {
      const text = read(path);
      expect(text, path).not.toMatch(/from '(\.\.?\/)+(server|index)(\/[a-z-]+)?'/);
      expect(text, path).not.toMatch(/from '(\.\.\/)*\.\/?auth'|from '\.\.'|from '\.'/);
      expect(text, path).not.toMatch(/SERVICE_ROLE|AUDIT_HMAC_KEY|TURNSTILE_SECRET/);
      expect(text, path).not.toMatch(/node:crypto/);
    }
  });

  it("marks every screen 'use client'", () => {
    for (const path of sources('screens').filter((p) => p.endsWith('.tsx'))) {
      expect(read(path).startsWith("'use client';"), path).toBe(true);
    }
  });

  it('never calls inviteUserByEmail or getSession anywhere', () => {
    const all = [...sources('.'), ...sources('server'), ...sources('screens')];
    for (const path of all) {
      expect(read(path), path).not.toMatch(/inviteUserByEmail|\.getSession\(/);
    }
  });

  it('keeps the plain JavaScript entries free of imports a config file cannot load', () => {
    expect(read('headers.js')).not.toMatch(/^import /m);
    expect(read('sql/index.js').match(/^import .* from '([^']+)';$/gm)?.every((line) => /'node:/.test(line))).toBe(true);
  });
});
