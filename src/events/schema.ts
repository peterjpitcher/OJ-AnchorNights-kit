// Parsing for the three management API responses the feed reads. Only the
// fields the screens use are declared; everything else is ignored.
//
// From Cash Bingo (src/lib/events-feed/schema.ts). What changed: the event's
// `slug` is read (the QR fallback is the slug page, spec S7.3), and the link
// maps are read for all five screen channels.
//
// Tolerance is deliberate and layered:
// - A response whose envelope is wrong throws, so the refresh fails and the
//   last good feed keeps serving.
// - Each event is parsed on its own, so one bad event is dropped alone and the
//   rest of the list still shows.
// - An optional field with a bad value (an image URL that is a number, say)
//   becomes null rather than costing the event its place.
//
// Response shapes (management app, read 6 November 2026):
// - GET /events and /events?category_id=...: { success, data: { events, meta } }
// - GET /events/{id or slug}: { success, data: { ..., qr_short_links, marketing_short_links } },
//   both link maps keyed by channel and holding l.the-anchor.pub short links.
// - GET /event-categories: { success, data: { categories: [{ id, slug, ... }] } }

import { z } from 'zod';
import { EventsFeedError } from './errors';
import { SCREEN_CHANNELS, isTrustedShortLink } from './links';
import type { ScreenChannel } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An instant with an explicit zone, so parsing never depends on the server's TZ. */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Optional text: a bad or blank value becomes null instead of failing the event. */
const optionalText = z.string().trim().min(1).nullish().catch(null);

const managementEventSchema = z.object({
  id: z.string().regex(UUID_RE),
  slug: optionalText,
  name: z.string().trim().min(1),
  startDate: z
    .string()
    .regex(ISO_INSTANT_RE)
    .refine((value) => Number.isFinite(Date.parse(value))),
  event_status: optionalText,
  category: z.object({ slug: optionalText }).nullish().catch(null),
  landscapeImageUrl: optionalText,
  squareImageUrl: optionalText,
  heroImageUrl: optionalText,
  image_alt_text: optionalText,
});

/** One management event, reduced to the fields the screens use. */
export interface ManagementEvent {
  id: string;
  slug: string | null;
  title: string;
  /** ISO 8601 UTC instant. */
  startsAt: string;
  /** The management `event_status`, for example 'scheduled'; null when absent. */
  status: string | null;
  /** The category slug, for example 'bingo-night'; null when absent. */
  category: string | null;
  images: {
    landscape: string | null;
    square: string | null;
    hero: string | null;
  };
  imageAlt: string | null;
}

/** Parses one raw event; null when it is malformed. */
export function parseManagementEvent(raw: unknown): ManagementEvent | null {
  const result = managementEventSchema.safeParse(raw);
  if (!result.success) return null;
  const event = result.data;
  return {
    id: event.id,
    slug: event.slug ?? null,
    title: event.name,
    // Normalised to one UTC form; this is an instant for sorting and comparing,
    // not a user-facing date (the screens format it in Europe/London).
    startsAt: new Date(Date.parse(event.startDate)).toISOString(),
    status: event.event_status ?? null,
    category: event.category?.slug ?? null,
    images: {
      landscape: event.landscapeImageUrl ?? null,
      square: event.squareImageUrl ?? null,
      hero: event.heroImageUrl ?? null,
    },
    imageAlt: event.image_alt_text ?? null,
  };
}

const eventListEnvelope = z.object({
  success: z.literal(true),
  data: z.object({ events: z.array(z.unknown()) }),
});

export interface ParsedEventList {
  events: ManagementEvent[];
  /** How many events were malformed and left out. */
  dropped: number;
}

/**
 * Parses a GET /events response. Throws when the envelope is wrong; drops any
 * single malformed event and counts it.
 */
export function parseEventList(json: unknown): ParsedEventList {
  const envelope = eventListEnvelope.safeParse(json);
  if (!envelope.success) {
    throw new EventsFeedError('The management events list did not have the expected shape', 'parse');
  }
  const events: ManagementEvent[] = [];
  let dropped = 0;
  for (const raw of envelope.data.data.events) {
    const event = parseManagementEvent(raw);
    if (event) events.push(event);
    else dropped += 1;
  }
  return { events, dropped };
}

const categoriesEnvelope = z.object({
  success: z.literal(true),
  data: z.object({ categories: z.array(z.unknown()) }),
});

const categorySchema = z.object({
  id: z.string().trim().min(1),
  slug: optionalText,
});

/**
 * The id of the category with this slug in a GET /event-categories response,
 * or null when there is none. Matched on the slug only, never the display
 * name (spec S7.2). Throws when the envelope is wrong.
 */
export function findCategoryId(json: unknown, slug: string): string | null {
  const envelope = categoriesEnvelope.safeParse(json);
  if (!envelope.success) {
    throw new EventsFeedError('The management categories list did not have the expected shape', 'parse');
  }
  for (const raw of envelope.data.data.categories) {
    const category = categorySchema.safeParse(raw);
    if (category.success && category.data.slug === slug) return category.data.id;
  }
  return null;
}

const linkMap = z.record(z.string(), z.unknown()).nullish().catch(null);

const eventDetailEnvelope = z.object({
  success: z.literal(true),
  data: z.object({
    qr_short_links: linkMap,
    marketing_short_links: linkMap,
  }),
});

function pickLink(
  maps: ReadonlyArray<Record<string, unknown> | null | undefined>,
  channel: ScreenChannel,
): string | null {
  for (const map of maps) {
    const value = map?.[channel];
    if (typeof value === 'string' && isTrustedShortLink(value)) return value;
  }
  return null;
}

/**
 * The screen short links in a GET /events/{id} response. `qr_short_links` is
 * read first and `marketing_short_links` (the same links, unfiltered) second.
 * A channel with no trusted link is null. Throws when the envelope is wrong.
 */
export function parseScreenShortLinks(json: unknown): Record<ScreenChannel, string | null> {
  const envelope = eventDetailEnvelope.safeParse(json);
  if (!envelope.success) {
    throw new EventsFeedError('A management event detail did not have the expected shape', 'parse');
  }
  const maps = [envelope.data.data.qr_short_links, envelope.data.data.marketing_short_links];
  const links = {} as Record<ScreenChannel, string | null>;
  for (const channel of SCREEN_CHANNELS) links[channel] = pickLink(maps, channel);
  return links;
}
