// Reading the feed in the browser: the body of the app's screen route,
// checked before a screen uses it. Pure and safe in the browser.
//
// From Cash Bingo (readEventsProjection and chooseEventsProjection in
// src/lib/playlist.ts), for the kit's ScreenFeed shape.

import { SCREEN_CHANNELS } from './links';
import type { ScreenChannel, ScreenEvent, ScreenEventImage, ScreenFeed, ScreenFeedStatus } from './types';

const FEED_STATUSES: ReadonlyArray<ScreenFeedStatus> = ['ok', 'no_events', 'error', 'missing_config'];

const isString = (value: unknown): value is string => typeof value === 'string';

function readLinks(value: unknown): Record<ScreenChannel, string> | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const links = {} as Record<ScreenChannel, string>;
  for (const channel of SCREEN_CHANNELS) {
    const link = raw[channel];
    if (!isString(link)) return null;
    links[channel] = link;
  }
  return links;
}

function readImage(value: unknown): ScreenEventImage | null {
  if (!value || typeof value !== 'object') return null;
  const img = value as Record<string, unknown>;
  if (isString(img.url) && isString(img.alt) && typeof img.square === 'boolean') {
    return { url: img.url, alt: img.alt, square: img.square };
  }
  return null;
}

function readScreenEvent(value: unknown): ScreenEvent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!isString(raw.id) || !isString(raw.title) || !isString(raw.startsAt)) return null;
  if (!Number.isFinite(Date.parse(raw.startsAt))) return null;
  const links = readLinks(raw.links);
  if (!links) return null;
  return {
    id: raw.id,
    slug: isString(raw.slug) ? raw.slug : null,
    title: raw.title,
    startsAt: raw.startsAt,
    category: isString(raw.category) ? raw.category : null,
    image: readImage(raw.image),
    links,
  };
}

function readScreenEvents(value: unknown): ScreenEvent[] {
  if (!Array.isArray(value)) return [];
  return value.map(readScreenEvent).filter((event): event is ScreenEvent => event !== null);
}

/** A feed from JSON, or null when it is not one at all; a malformed event is dropped on its own. */
export function readScreenFeed(value: unknown): ScreenFeed | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const status = FEED_STATUSES.find((candidate) => candidate === raw.status);
  if (!status || !isString(raw.categorySlug)) return null;
  return {
    status,
    fetchedAt: isString(raw.fetchedAt) ? raw.fetchedAt : null,
    categorySlug: raw.categorySlug,
    events: readScreenEvents(raw.events),
    nights: readScreenEvents(raw.nights),
  };
}

/**
 * Which feed a screen keeps after a refresh. An 'error' answer never
 * replaces a good list the screen already has (the screen still drops events
 * as they start). Anything else replaces it.
 */
export function chooseScreenFeed(current: ScreenFeed | null, incoming: ScreenFeed): ScreenFeed {
  if (incoming.status === 'error' && current?.status === 'ok') return current;
  return incoming;
}
