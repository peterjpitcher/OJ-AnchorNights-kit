// @anchor-nights/kit/env: environment variables, checked when the app is built.
//
// Based on Cash Bingo's src/lib/env.ts. The checks are the same; what is new
// is that each app lists its own variables as rules instead of the list being
// written into the function.
//
// next.config.ts imports this file directly and Node loads it there, outside
// the bundler, so it MUST stay plain JavaScript with no imports at all. Its
// types are in index.d.ts beside it; keep the two in step.
//
// Usage, in next.config.ts:
//
//   import { validateBuildEnv, SUPABASE_PUBLIC_ENV, SITE_URL_ENV, ANCHOR_API_ENV } from '@anchor-nights/kit/env';
//   validateBuildEnv([...SUPABASE_PUBLIC_ENV, ...SITE_URL_ENV, ...ANCHOR_API_ENV]);
//
// A missing or malformed variable then fails the build (and `next dev`
// start-up) with one message naming every problem, instead of shipping and
// failing on a pub night (spec S6.3). Values are never printed, except URLs,
// which are not secret and are the quickest way to see a typo.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The shape of a management app API key: "anch_" then the key in base64url
 * (32 random bytes, 43 characters). The length is a floor, not an exact
 * match, so a longer key format still passes; the point is to reject text
 * that is plainly not a key.
 */
export const MANAGEMENT_API_KEY_SHAPE = /^anch_[A-Za-z0-9_-]{20,}$/;

/** What a local build reports as its build id. It never triggers a reload. */
export const DEV_BUILD_ID = 'dev';

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isHttpUrl(value) {
  const parsed = parseUrl(value);
  return parsed !== null && (parsed.protocol === 'https:' || parsed.protocol === 'http:');
}

/**
 * Why a value is not usable as a public site origin (the QR origin), or null
 * when it is fine. A bare https origin; plain http only for a loopback host
 * outside production, so a local run can point at itself.
 */
function siteOriginProblem(value, isProduction) {
  const parsed = parseUrl(value);
  if (!parsed) return 'is not a URL';
  const isLocalHttp = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname) && !isProduction;
  if (parsed.protocol !== 'https:' && !isLocalHttp) return 'must use https';
  if (parsed.username || parsed.password) return 'must not contain a username or password';
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return 'must be an origin only, with no path, query or fragment';
  }
  return null;
}

/**
 * Why a value is not usable as an API base URL, or null when it is fine. A
 * key travels in a header on every request to it, so it must be https; plain
 * http only for a loopback host outside production. A path is allowed.
 */
function apiBaseUrlProblem(value, isProduction) {
  const parsed = parseUrl(value);
  if (!parsed) return 'is not a URL';
  const isLocalHttp = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname) && !isProduction;
  if (parsed.protocol !== 'https:' && !isLocalHttp) return 'must use https';
  if (parsed.username || parsed.password) return 'must not contain a username or password';
  if (parsed.search || parsed.hash) return 'must not contain a query or fragment';
  return null;
}

/** Why a value is not an https URL (a sink or webhook), or null when it is fine. */
function httpsUrlProblem(value) {
  const parsed = parseUrl(value);
  if (!parsed) return 'is not a URL';
  if (parsed.protocol !== 'https:') return 'must use https';
  if (parsed.username || parsed.password) return 'must not contain a username or password';
  return null;
}

/** The value of `name`, trimmed. A value of only spaces is no value. */
function read(env, name) {
  const raw = env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** True on a Vercel production build or deployment. */
export function isProductionEnv(env = process.env) {
  return env.VERCEL_ENV === 'production';
}

/** Returns the rules unchanged. It exists so an app's list is checked against the EnvRule type. */
export function defineEnv(rules) {
  return rules;
}

/**
 * Every problem with `env` against `rules`, as sentences. Empty when all is
 * well. Never includes a value unless it is a URL.
 */
export function checkEnv(rules, env = process.env) {
  const isProduction = isProductionEnv(env);
  const problems = [];

  for (const rule of rules) {
    const value = read(env, rule.name);
    const needed = rule.required === true || (rule.required === 'production' && isProduction);

    if (value === undefined) {
      if (rule.required === true) {
        problems.push(`${rule.name} is not set.`);
      } else if (needed) {
        problems.push(`${rule.name} is not set, and production builds need it${rule.why ? ` ${rule.why}` : ''}.`);
      }
      continue;
    }

    switch (rule.kind) {
      case 'url':
        if (!isHttpUrl(value)) problems.push(`${rule.name} is not a URL.`);
        break;
      case 'https-url': {
        const problem = httpsUrlProblem(value);
        if (problem) problems.push(`${rule.name} ${problem} (got "${value}").`);
        break;
      }
      case 'site-origin': {
        const problem = siteOriginProblem(value, isProduction);
        if (problem) problems.push(`${rule.name} ${problem} (got "${value}").`);
        break;
      }
      case 'api-base-url': {
        const problem = apiBaseUrlProblem(value, isProduction);
        if (problem) problems.push(`${rule.name} ${problem} (got "${value}").`);
        break;
      }
      case 'management-api-key':
        // A value that is set but is not a key is worse than a missing one: it
        // passes "is it set" and the feed then answers 401 for ever. On 1
        // October 2026 Cash Bingo's production held the text of the CLI
        // command pasted as the value. The value itself is never printed.
        if (!MANAGEMENT_API_KEY_SHAPE.test(value)) {
          problems.push(
            `${rule.name} does not look like a management API key ("anch_" followed by the key, no spaces). ` +
              'Paste the key itself from the management app, not a command or a label.',
          );
        }
        break;
      default:
        break;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      problems.push(`${rule.name} ${rule.patternHint || 'is not in the expected format'}.`);
    }
  }

  return problems;
}

/**
 * Checks the environment a build needs and throws one error listing every
 * problem. Call it at the top of next.config.ts.
 */
export function validateBuildEnv(rules, env = process.env) {
  const problems = checkEnv(rules, env);
  if (problems.length > 0) {
    throw new Error(`Environment check failed:\n  - ${problems.join('\n  - ')}`);
  }
}

/**
 * The release a bundle is built from, for NEXT_PUBLIC_BUILD_ID in
 * next.config.ts (the TV's build-update check compares it with the
 * server's). 'dev' outside Vercel, which never triggers a reload.
 */
export function buildIdFromEnv(env = process.env) {
  return read(env, 'VERCEL_GIT_COMMIT_SHA') || DEV_BUILD_ID;
}

/** The public Supabase pair every app needs. */
export const SUPABASE_PUBLIC_ENV = Object.freeze([
  Object.freeze({ name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, kind: 'url' }),
  Object.freeze({ name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true }),
]);

/**
 * The QR origin. Deliberately optional: the qr module falls back to Vercel's
 * own production or preview address. When it is set it must be a bare
 * https origin.
 */
export const SITE_URL_ENV = Object.freeze([Object.freeze({ name: 'NEXT_PUBLIC_SITE_URL', kind: 'site-origin' })]);

/**
 * The management app's events API (spec S7.1). The key is needed on
 * production builds only: previews and local builds run without it and the
 * screens show the no-events loop.
 */
export const ANCHOR_API_ENV = Object.freeze([
  Object.freeze({ name: 'ANCHOR_API_KEY', required: 'production', kind: 'management-api-key', why: 'for the events feed' }),
  Object.freeze({ name: 'ANCHOR_API_BASE_URL', kind: 'api-base-url' }),
]);

/** Where reportError posts. Optional: with none set it only logs. */
export const ERROR_SINK_ENV = Object.freeze([Object.freeze({ name: 'ERROR_SINK_URL', kind: 'https-url' })]);

/**
 * The public Supabase URL and anon key, at runtime. Throws a clear error
 * naming whatever is missing. Each variable is read by its literal name so
 * Next.js can inline it into the browser bundle.
 */
export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error(
      `Missing environment variable ${missing.join(' and ')}. ` +
        'Set it in .env.local for local runs, or in the Vercel project settings.',
    );
  }
  return { url, anonKey };
}
