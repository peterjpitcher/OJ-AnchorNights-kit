// Test fixtures shaped like the management API's real responses (the fields
// the feed reads, plus the link fields it must ignore). For tests only, in the
// kit and in apps (`@anchor-nights/kit/events/fixtures`). Every name, id and
// date here is made up; the short link codes are not real codes.

import { EVENT_IMAGE_HOST, EVENT_IMAGE_PATH_PREFIX } from './image-host.js';

const BUCKET = `https://${EVENT_IMAGE_HOST}${EVENT_IMAGE_PATH_PREFIX}events`;

export type RawEvent = Record<string, unknown>;

export interface FixtureCategory {
  id: string;
  name: string;
  slug: string;
}

export const QUIZ_CATEGORY: FixtureCategory = { id: '10000000-0000-4000-8000-000000000001', name: 'Quiz Night', slug: 'quiz-night-stanwell-moor' };
export const BINGO_CATEGORY: FixtureCategory = { id: '10000000-0000-4000-8000-000000000002', name: 'Cash Bingo', slug: 'bingo-night' };
export const MUSIC_BINGO_CATEGORY: FixtureCategory = { id: '10000000-0000-4000-8000-000000000003', name: 'Music Bingo', slug: 'music-bingo' };
export const TASTING_CATEGORY: FixtureCategory = { id: '10000000-0000-4000-8000-000000000004', name: 'Tasting Nights', slug: 'tasting-nights' };
export const PARTY_CATEGORY: FixtureCategory = { id: '10000000-0000-4000-8000-000000000005', name: 'Parties', slug: 'parties' };

export const ALL_CATEGORIES: FixtureCategory[] = [QUIZ_CATEGORY, BINGO_CATEGORY, MUSIC_BINGO_CATEGORY, TASTING_CATEGORY, PARTY_CATEGORY];

/** One event as GET /events lists it. `startDate` is an ISO instant with a zone. */
export function fixtureEvent(id: string, slug: string, name: string, startDate: string, category: FixtureCategory | null): RawEvent {
  return {
    id,
    slug,
    name,
    startDate,
    date: startDate.slice(0, 10),
    event_status: 'scheduled',
    category,
    landscapeImageUrl: `${BUCKET}/${id}/landscape/branded/landscape.png`,
    squareImageUrl: `${BUCKET}/${id}/square/branded/square.png`,
    heroImageUrl: `${BUCKET}/${id}/square/branded/square.png`,
    image_alt_text: `Artwork for ${name}`,
    // The feed must never use these three for a QR code.
    url: `https://management.orangejelly.co.uk/events/${slug}`,
    bookingUrl: null,
    offers: { '@type': 'Offer', url: `https://management.orangejelly.co.uk/events/${slug}` },
  };
}

// Wednesday 18 November 2026, 19:00 GMT.
export const QUIZ_NOV_18 = fixtureEvent(
  '20000000-0000-4000-8000-000000000001',
  'test-quiz-night-2026-11-18',
  'Test Quiz Night',
  '2026-11-18T19:00:00.000Z',
  QUIZ_CATEGORY,
);

// Wednesday 2 December 2026, 19:00 GMT.
export const QUIZ_DEC_2 = fixtureEvent(
  '20000000-0000-4000-8000-000000000002',
  'test-quiz-night-2026-12-02',
  'Test Quiz Night',
  '2026-12-02T19:00:00.000Z',
  QUIZ_CATEGORY,
);

// Friday 20 November 2026, 19:00 GMT.
export const MUSIC_BINGO_NOV_20 = fixtureEvent(
  '20000000-0000-4000-8000-000000000003',
  'test-music-bingo-2026-11-20',
  'Test Music Bingo',
  '2026-11-20T19:00:00.000Z',
  MUSIC_BINGO_CATEGORY,
);

// Saturday 21 November 2026, 18:30 GMT.
export const TASTING_NOV_21 = fixtureEvent(
  '20000000-0000-4000-8000-000000000004',
  'test-tasting-night-2026-11-21',
  'Test Tasting Night',
  '2026-11-21T18:30:00.000Z',
  TASTING_CATEGORY,
);

// Wednesday 25 November 2026, 19:00 GMT.
export const BINGO_NOV_25 = fixtureEvent(
  '20000000-0000-4000-8000-000000000005',
  'test-cash-bingo-2026-11-25',
  'Test Cash Bingo',
  '2026-11-25T19:00:00.000Z',
  BINGO_CATEGORY,
);

// Saturday 28 November 2026, 20:00 GMT.
export const PARTY_NOV_28 = fixtureEvent(
  '20000000-0000-4000-8000-000000000006',
  'test-party-2026-11-28',
  'Test Party',
  '2026-11-28T20:00:00.000Z',
  PARTY_CATEGORY,
);

/** GET /events: { success, data: { events, meta } }. */
export function listResponse(events: unknown[]): unknown {
  return {
    success: true,
    data: {
      events,
      meta: { total: events.length, limit: 50, offset: 0, has_more: false, lastUpdated: '2026-11-06T08:00:00.000Z' },
    },
  };
}

/** GET /event-categories: { success, data: { categories, meta } }. */
export function categoriesResponse(categories: FixtureCategory[] = ALL_CATEGORIES): unknown {
  return {
    success: true,
    data: { categories, meta: { total: categories.length, lastUpdated: '2026-11-06T08:00:00.000Z' } },
  };
}

/** GET /events/{id}, with the link maps keyed by channel. */
export function detailResponse(id: string, links: Record<string, string> = {}): unknown {
  return {
    success: true,
    data: {
      id,
      qr_short_links: links,
      marketing_short_links: { facebook: 'https://l.the-anchor.pub/fbtest', ...links },
      bookingUrl: null,
      url: 'https://management.orangejelly.co.uk/events/some-event',
    },
  };
}
