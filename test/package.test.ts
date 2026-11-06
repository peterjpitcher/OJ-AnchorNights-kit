// Guards on the package itself, so a release can never point an app at a
// file that is not there or ship text the workspace rules forbid.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string;
  exports: Record<string, string | Record<string, string>>;
  engines: { node: string };
};

function targets(entry: string | Record<string, string>): string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'coverage') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

describe('package.json', () => {
  it('is the kit, on Node 24 or later', () => {
    expect(pkg.name).toBe('@anchor-nights/kit');
    expect(pkg.engines.node).toBe('>=24');
    expect(readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim()).toBe('24');
  });

  it('points every export at a file that exists', () => {
    for (const [key, entry] of Object.entries(pkg.exports)) {
      for (const target of targets(entry)) {
        expect(existsSync(join(ROOT, target)), `${key} -> ${target}`).toBe(true);
      }
    }
  });
});

describe('repository text', () => {
  const files = walk(ROOT).filter((path) => /\.(ts|tsx|js|css|md|json|yml)$/.test(path) && !path.endsWith('package-lock.json'));

  it('has no em dashes anywhere', () => {
    const dash = String.fromCharCode(0x2014);
    const offenders = files.filter((path) => readFileSync(path, 'utf8').includes(dash)).map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);
  });

  it('has nothing that looks like a secret', () => {
    // A management API key, a Supabase service JWT, a GitHub token or a
    // Stripe live key. Test fixtures use obviously fake shapes instead.
    const secret = /(anch_[A-Za-z0-9_-]{40,})|(eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,})|(gh[pousr]_[A-Za-z0-9]{30,})|(sk_live_[A-Za-z0-9]{10,})/;
    const offenders = files.filter((path) => secret.test(readFileSync(path, 'utf8'))).map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);
  });
});
