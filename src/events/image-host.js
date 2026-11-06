// Where event images may be loaded from. One source for an app's
// next.config.ts (`images.remotePatterns`) and for the feed, which drops any
// image URL next/image would refuse, so a stray URL becomes a text-only card
// instead of a broken image on the pub TV.
//
// From Cash Bingo (src/lib/events-feed/image-host.ts), as plain JavaScript
// with no imports: next.config.ts loads it at build time, and Node will not
// strip types from a file inside node_modules. Types live in image-host.d.ts.

/** The management app's Supabase project, which hosts the event artwork. */
export const EVENT_IMAGE_HOST = 'tfcasgxopxegwrabvwat.supabase.co';

/** The public event-images bucket; nothing else on that host is allowed. */
export const EVENT_IMAGE_PATH_PREFIX = '/storage/v1/object/public/event-images/';

/**
 * For next.config.ts: `images: { remotePatterns: [EVENT_IMAGE_REMOTE_PATTERN] }`.
 * Exactly what isAllowedEventImageUrl accepts.
 */
export const EVENT_IMAGE_REMOTE_PATTERN = Object.freeze({
  protocol: 'https',
  hostname: EVENT_IMAGE_HOST,
  port: '',
  pathname: `${EVENT_IMAGE_PATH_PREFIX}**`,
  search: '',
});

/**
 * True when the URL is an https image in the event-images bucket, with no
 * port, credentials or query string.
 */
export function isAllowedEventImageUrl(value) {
  if (typeof value !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === EVENT_IMAGE_HOST &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.search === '' &&
    parsed.pathname.startsWith(EVENT_IMAGE_PATH_PREFIX) &&
    parsed.pathname.length > EVENT_IMAGE_PATH_PREFIX.length
  );
}
