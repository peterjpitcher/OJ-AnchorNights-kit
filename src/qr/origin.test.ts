// From Cash Bingo (src/lib/site-origin.test.ts), on Vitest, plus the kit's
// loopback and empty-value guards.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildQrUrl, getRequestOrigin, getSiteOrigin, isLoopbackHost, qrValue } from './origin';

const DEV_REQUEST = 'http://localhost:3000';

test('an explicit https NEXT_PUBLIC_SITE_URL wins in production', () => {
  assert.equal(
    getSiteOrigin({
      env: {
        NEXT_PUBLIC_SITE_URL: 'https://bingo.the-anchor.pub/',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'bingo-blast-ten.vercel.app',
      },
      requestOrigin: 'https://attacker.example',
    }),
    'https://bingo.the-anchor.pub'
  );
});

test('an explicit https NEXT_PUBLIC_SITE_URL wins in development too', () => {
  assert.equal(
    getSiteOrigin({ env: { NEXT_PUBLIC_SITE_URL: 'https://bingo.the-anchor.pub' }, requestOrigin: DEV_REQUEST }),
    'https://bingo.the-anchor.pub'
  );
});

test('a NEXT_PUBLIC_SITE_URL that is not https is ignored', () => {
  assert.equal(
    getSiteOrigin({
      env: {
        NEXT_PUBLIC_SITE_URL: 'http://bingo.the-anchor.pub',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'bingo-blast-ten.vercel.app',
      },
      requestOrigin: null,
    }),
    'https://bingo-blast-ten.vercel.app'
  );
});

test('production uses the project production domain, never the request', () => {
  assert.equal(
    getSiteOrigin({
      env: { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'bingo-blast-ten.vercel.app', VERCEL_URL: 'oj-cashbingo-abc123.vercel.app' },
      requestOrigin: 'https://attacker.example',
    }),
    'https://bingo-blast-ten.vercel.app'
  );
});

test('production falls back to the deployment domain, and never to the request', () => {
  assert.equal(
    getSiteOrigin({ env: { VERCEL_ENV: 'production', VERCEL_URL: 'oj-cashbingo-abc123.vercel.app' }, requestOrigin: 'https://x.example' }),
    'https://oj-cashbingo-abc123.vercel.app'
  );
  assert.equal(getSiteOrigin({ env: { VERCEL_ENV: 'production' }, requestOrigin: 'https://x.example' }), null);
});

test('a preview uses its branch domain and ignores NEXT_PUBLIC_SITE_URL', () => {
  assert.equal(
    getSiteOrigin({
      env: {
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SITE_URL: 'https://bingo-blast-ten.vercel.app',
        VERCEL_BRANCH_URL: 'oj-cashbingo-git-feat-guest-display.vercel.app',
        VERCEL_URL: 'oj-cashbingo-abc123.vercel.app',
      },
      requestOrigin: null,
    }),
    'https://oj-cashbingo-git-feat-guest-display.vercel.app'
  );
});

test('a preview without a branch domain uses the deployment domain', () => {
  assert.equal(
    getSiteOrigin({ env: { VERCEL_ENV: 'preview', VERCEL_URL: 'oj-cashbingo-abc123.vercel.app' }, requestOrigin: null }),
    'https://oj-cashbingo-abc123.vercel.app'
  );
});

test('development uses the request origin', () => {
  assert.equal(getSiteOrigin({ env: { NODE_ENV: 'development' }, requestOrigin: DEV_REQUEST }), DEV_REQUEST);
  assert.equal(getSiteOrigin({ env: {}, requestOrigin: 'http://192.168.1.20:3000/' }), 'http://192.168.1.20:3000');
});

test('a malformed host or request origin gives null rather than a broken link', () => {
  assert.equal(getSiteOrigin({ env: { VERCEL_ENV: 'preview', VERCEL_URL: 'not a host/' }, requestOrigin: null }), null);
  assert.equal(getSiteOrigin({ env: {}, requestOrigin: 'javascript:alert(1)' }), null);
  assert.equal(getSiteOrigin({ env: {}, requestOrigin: null }), null);
});

test('a Vercel host given with a scheme is still read correctly', () => {
  assert.equal(
    getSiteOrigin({ env: { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'https://bingo-blast-ten.vercel.app' }, requestOrigin: null }),
    'https://bingo-blast-ten.vercel.app'
  );
});

test('the request origin comes from the forwarded host and protocol', () => {
  const headers = new Map([
    ['x-forwarded-host', 'bingo.local:3000'],
    ['x-forwarded-proto', 'http'],
    ['host', 'ignored:1'],
  ]);
  assert.equal(getRequestOrigin((name) => headers.get(name) ?? null), 'http://bingo.local:3000');
});

test('the request origin falls back to the host header, http on localhost and https elsewhere', () => {
  assert.equal(getRequestOrigin((name) => (name === 'host' ? 'localhost:3000' : null)), 'http://localhost:3000');
  assert.equal(getRequestOrigin((name) => (name === 'host' ? 'bingo.example' : null)), 'https://bingo.example');
  assert.equal(getRequestOrigin(() => null), null);
});

// New in the kit.

test('a production deployment never yields a loopback origin, even from NEXT_PUBLIC_SITE_URL', () => {
  assert.equal(
    getSiteOrigin({
      env: { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://localhost:3000', VERCEL_PROJECT_PRODUCTION_URL: 'bingo-blast-ten.vercel.app' },
      requestOrigin: null,
    }),
    null,
  );
  assert.equal(
    getSiteOrigin({ env: { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://127.0.0.1' }, requestOrigin: null }),
    null,
  );
});

test('a preview never yields the production origin', () => {
  const origin = getSiteOrigin({
    env: { VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'https://bingo.the-anchor.pub', VERCEL_PROJECT_PRODUCTION_URL: 'bingo.the-anchor.pub' },
    requestOrigin: 'https://bingo.the-anchor.pub',
  });
  assert.equal(origin, null, 'with no preview host there is no QR, not a production one');
});

test('loopback hosts are recognised in every spelling', () => {
  for (const host of ['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]', '::1', '0.0.0.0', 'localhost.']) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ['bingo.the-anchor.pub', '192.168.1.20', '10.0.0.5', 'localhost-tv.example', '128.0.0.1']) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test('qrValue refuses empty, malformed, credentialled and localhost values', () => {
  for (const bad of [null, undefined, '', '   ', 'not a url', 'javascript:alert(1)', 'ftp://x.example/a', 'https://u:p@x.example/', 'http://localhost:3000/play', 'https://127.0.0.1/x', 'http://[::1]:3000/']) {
    assert.equal(qrValue(bad), null, String(bad));
  }
});

test('qrValue passes a real link through, normalised', () => {
  assert.equal(qrValue(' https://bingo.the-anchor.pub/play?s=abc '), 'https://bingo.the-anchor.pub/play?s=abc');
  assert.equal(qrValue('http://192.168.1.20:3000/play'), 'http://192.168.1.20:3000/play', 'a LAN address works on the phones in the room');
});

test('buildQrUrl joins a path to the origin and refuses to leave it', () => {
  assert.equal(buildQrUrl('https://bingo.the-anchor.pub', '/play?s=abc'), 'https://bingo.the-anchor.pub/play?s=abc');
  assert.equal(buildQrUrl(null, '/play'), null);
  assert.equal(buildQrUrl('https://bingo.the-anchor.pub', '//evil.example/x'), null);
  assert.equal(buildQrUrl('https://bingo.the-anchor.pub', 'https://evil.example/x'), null);
  assert.equal(buildQrUrl('http://localhost:3000', '/play'), null);
  assert.equal(buildQrUrl('not an origin', '/play'), null);
});
