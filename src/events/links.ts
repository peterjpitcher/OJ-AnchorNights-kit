// Where an event's QR code points (spec S7.3), and the fixed website links
// the screens use. Pure, so it is safe on the server, in the browser and in
// tests.
//
// From Cash Bingo (src/lib/events-feed/links.ts). What changed, and why:
//   - The fallback is the website's page by SLUG, tagged with the APP
//     (`?utm_source=<app>&utm_medium=screen`), as the spec says. Cash Bingo
//     fell back to the id link tagged with the channel; the website redirects
//     an id link to its slug page and drops the tags on the way, so the slug
//     link is the one whose tags survive. The id link is kept only for an
//     event with no slug.
//   - Five screen channels instead of three, so an app can use venue_screen
//     or event_host_slide where it has such a screen.
//
// Deliberately never the API's `url`, `offers.url` or `bookingUrl`: `url` and
// `offers.url` point at the management app itself, and `bookingUrl` is free
// text a manager types in.

import type { ScreenChannel } from './types';

/** The website's what's-on page (spec S7.4 and S7.5). */
export const WHATS_ON_URL = 'https://www.the-anchor.pub/whats-on';

/** The website's event pages. */
export const EVENT_PAGE_BASE_URL = 'https://www.the-anchor.pub/events';

/** Every screen channel, in the management app's order of use through a night. */
export const SCREEN_CHANNELS: readonly ScreenChannel[] = Object.freeze([
  'pre_event_screen',
  'in_game_screen',
  'post_event_screen',
  'venue_screen',
  'event_host_slide',
]);

/** "the-anchor.pub/whats-on": a link as printed under its QR. */
export function printedAddress(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
}

/**
 * The website's event page, tagged for this app's screens:
 * https://www.the-anchor.pub/events/<slug>?utm_source=<app>&utm_medium=screen.
 * Falls back to the id when the event has no slug.
 */
export function eventPageLink(event: { id: string; slug?: string | null }, app: string): string {
  const path = event.slug?.trim() || event.id;
  const params = new URLSearchParams({ utm_source: app, utm_medium: 'screen' });
  return `${EVENT_PAGE_BASE_URL}/${encodeURIComponent(path)}?${params.toString()}`;
}

/**
 * True for an https link on the-anchor.pub or one of its subdomains (the
 * management app issues short links on l.the-anchor.pub), with a path, and no
 * port or credentials. Anything else is ignored, so a bad value in the
 * management app can never put a QR code for another site on the pub TV.
 */
export function isTrustedShortLink(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    (host === 'the-anchor.pub' || host.endsWith('.the-anchor.pub')) &&
    parsed.pathname.length > 1
  );
}

/**
 * True for a review link the screens may show: an Anchor link, which is the
 * app's own short link to https://l.the-anchor.pub/feedback. A Google review
 * URL is refused on purpose (website docs/SSOT.md section 17: every review
 * ask goes through the feedback page).
 */
export function isAllowedReviewUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && isTrustedShortLink(value.trim());
}

/** An event's screen short links by channel; null or absent where it has none. */
export type ScreenShortLinks = Partial<Record<ScreenChannel, string | null>>;

export interface EventLinkSource {
  id: string;
  slug?: string | null;
  /** From the event's detail lookup; null when that lookup failed. */
  shortLinks?: ScreenShortLinks | null;
}

/** The QR target for an event on one channel: its short link, else its tagged page. */
export function eventLink(event: EventLinkSource, channel: ScreenChannel, app: string): string {
  const shortLink = event.shortLinks?.[channel];
  if (typeof shortLink === 'string' && isTrustedShortLink(shortLink)) return shortLink;
  return eventPageLink(event, app);
}

/** The QR target for every channel. */
export function eventLinks(event: EventLinkSource, app: string): Record<ScreenChannel, string> {
  return {
    pre_event_screen: eventLink(event, 'pre_event_screen', app),
    in_game_screen: eventLink(event, 'in_game_screen', app),
    post_event_screen: eventLink(event, 'post_event_screen', app),
    venue_screen: eventLink(event, 'venue_screen', app),
    event_host_slide: eventLink(event, 'event_host_slide', app),
  };
}
