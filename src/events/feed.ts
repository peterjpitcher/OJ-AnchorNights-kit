// SERVER ONLY. The one cached view of upcoming events that an app's TV and
// phones read (spec S7.1 to S7.3). It does not depend on the phase of the
// night, the session or the viewer, so one cache entry serves everybody; the
// screens work out "Tonight" and pick a channel's link themselves.
//
// From Cash Bingo (src/lib/events-feed/projection.ts). What changed, and why:
//   - The format is a category slug passed in (createEventsFeed({
//     categorySlug })), resolved to its id through /event-categories, instead
//     of 'bingo-night' written in. Never a display name (spec S7.2).
//   - The cache is in this server instance's memory (cache.ts), with Next's
//     data cache under each fetch where Next applies it (client.ts). Cash
//     Bingo used `unstable_cache`, which the kit cannot import without making
//     `next` a hard dependency. Same rules: 5 minutes fresh, stale for up to
//     24 hours while refreshes fail, one refresh at a time, a minute's pause
//     after a failure.
//   - Every event carries a link for each screen channel, with the slug page
//     tagged with the app as the fallback (links.ts).
//   - Failures go to `report` (default: a redacted console line through the
//     kit's logActionFailure); an app passes its own reportError.
//
// A list in which every event is malformed fails the refresh (a 'parse'
// error), so a broken response can never replace a good feed with an empty
// one. A failed event detail does not fail the refresh: that event falls
// back to its page link.

import 'server-only';
import { getTodayIsoDateInLondon } from '../dates';
import { logActionFailure } from '../errors';
import { createStaleIfErrorCache, TtlMemo, type StaleIfErrorCache } from './cache';
import { createManagementClient, type ManagementClient, type ManagementClientOptions } from './client';
import { eventsDateWindows, FORMAT_WINDOW_DAYS, GENERAL_WINDOW_DAYS } from './date-window';
import { EventsFeedError } from './errors';
import { isAllowedEventImageUrl } from './image-host.js';
import { eventLinks, type ScreenShortLinks } from './links';
import { findCategoryId, parseEventList, parseScreenShortLinks, type ManagementEvent } from './schema';
import { dropStarted, MAX_FORMAT_NIGHTS, MAX_SCREEN_EVENTS, selectScreenEvents } from './select';
import type { ScreenChannel, ScreenEvent, ScreenEventImage, ScreenFeed, ScreenFeedStatus } from './types';

/** The whole refresh: lists, category and details together. */
export const REFRESH_BUDGET_MS = 8_000;

/** Each list call and the category call. */
export const LIST_TIMEOUT_MS = 5_000;

/** Each event detail call. */
export const DETAIL_TIMEOUT_MS = 3_000;

const CATEGORY_MEMO_MS = 24 * 60 * 60 * 1000;
const DETAIL_MEMO_MS = 60 * 60 * 1000;

/** The general list's page size. */
const GENERAL_LIMIT = 50;

/** Reports a failure; must not throw or block. */
export type ReportFn = (scope: string, err: unknown) => void;

/** What a successful refresh holds, before per-request filtering. */
export interface BuiltFeed {
  events: ScreenEvent[];
  nights: ScreenEvent[];
}

export interface FeedMemo {
  /** The category id by slug (null when the category does not exist). */
  category: TtlMemo<string | null>;
  /** Each event's screen short links, by event id. Failures are never memoised. */
  links: TtlMemo<Record<ScreenChannel, string | null>>;
}

export function createFeedMemo(): FeedMemo {
  return {
    category: new TtlMemo<string | null>(CATEGORY_MEMO_MS, 8),
    links: new TtlMemo<Record<ScreenChannel, string | null>>(DETAIL_MEMO_MS, 200),
  };
}

/**
 * Landscape, else square, else hero; only URLs in the event-images bucket.
 * The management app's hero image is the square artwork, so both fallbacks
 * are flagged square.
 */
export function pickEventImage(event: ManagementEvent): ScreenEventImage | null {
  const candidates: Array<[string | null, boolean]> = [
    [event.images.landscape, false],
    [event.images.square, true],
    [event.images.hero, true],
  ];
  for (const [url, square] of candidates) {
    if (url && isAllowedEventImageUrl(url)) return { url, alt: event.imageAlt ?? event.title, square };
  }
  return null;
}

export function toScreenEvent(event: ManagementEvent, shortLinks: ScreenShortLinks | null, app: string): ScreenEvent {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    startsAt: event.startsAt,
    category: event.category,
    image: pickEventImage(event),
    links: eventLinks({ id: event.id, slug: event.slug, shortLinks }, app),
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'an unknown error';
}

export interface BuildFeedDeps {
  client: Pick<ManagementClient, 'listEvents' | 'getEvent' | 'listCategories'>;
  /** utm_source for the fallback links, for example 'anchor-quiz'. */
  app: string;
  categorySlug: string;
  /** Today's date in London, YYYY-MM-DD. */
  todayIso: string;
  now?: () => number;
  memo?: FeedMemo;
  /** Non-fatal problems (failed details, dropped events, a missing category). */
  report?: ReportFn;
  maxEvents?: number;
  maxNights?: number;
  generalDays?: number;
  formatDays?: number;
}

/**
 * Reads the management app and builds a feed.
 *
 * Throws when the general list, the category lookup or this format's list
 * fails, so the cache keeps its last good value.
 */
export async function buildScreenFeed(deps: BuildFeedDeps): Promise<BuiltFeed> {
  const now = deps.now ?? Date.now;
  const { client, memo, report, categorySlug } = deps;
  const maxNights = deps.maxNights ?? MAX_FORMAT_NIGHTS;
  const deadline = now() + REFRESH_BUDGET_MS;

  /** The call's own timeout, cut short by what is left of the refresh budget. */
  const timeoutWithin = (capMs: number): number => Math.min(capMs, deadline - now());

  const listTimeout = (): number => {
    const timeoutMs = timeoutWithin(LIST_TIMEOUT_MS);
    if (timeoutMs <= 0) throw new EventsFeedError(`The events refresh used up its ${REFRESH_BUDGET_MS}ms budget`, 'timeout');
    return timeoutMs;
  };

  const windows = eventsDateWindows(
    deps.todayIso,
    deps.generalDays ?? GENERAL_WINDOW_DAYS,
    deps.formatDays ?? FORMAT_WINDOW_DAYS,
  );
  let dropped = 0;

  const loadList = async (params: Record<string, string>): Promise<ManagementEvent[]> => {
    const parsed = parseEventList(await client.listEvents(params, listTimeout()));
    if (parsed.events.length === 0 && parsed.dropped > 0) {
      // Not one event could be read: almost certainly a change in the
      // management app's format, not a genuinely empty list.
      throw new EventsFeedError(`All ${parsed.dropped} events in a management events list were malformed`, 'parse');
    }
    dropped += parsed.dropped;
    return parsed.events;
  };

  const resolveCategoryId = async (): Promise<string | null> => {
    const remembered = memo?.category.get(categorySlug, now());
    if (remembered !== undefined) return remembered;
    const id = findCategoryId(await client.listCategories(listTimeout()), categorySlug);
    memo?.category.set(categorySlug, id, now());
    if (id === null) {
      report?.(
        'events-feed:category',
        new Error(`The management app has no "${categorySlug}" category, so the next night comes from the general list only`),
      );
    }
    return id;
  };

  const loadNights = async (): Promise<ManagementEvent[]> => {
    const categoryId = await resolveCategoryId();
    if (categoryId === null) return [];
    return loadList({
      category_id: categoryId,
      status: 'scheduled',
      from_date: windows.from,
      to_date: windows.formatTo,
      limit: String(maxNights),
    });
  };

  const [general, nights] = await Promise.all([
    loadList({ from_date: windows.from, to_date: windows.generalTo, status: 'scheduled', limit: String(GENERAL_LIMIT) }),
    loadNights(),
  ]);

  if (dropped > 0) report?.('events-feed:parse', new Error(`${dropped} events from the management app were malformed and left out`));

  const selection = selectScreenEvents(general, nights, {
    categorySlug,
    nowMs: now(),
    maxEvents: deps.maxEvents ?? MAX_SCREEN_EVENTS,
    maxNights,
  });
  const ids = Array.from(new Set([...selection.events, ...selection.nights].map((event) => event.id)));

  // Details in parallel, each on its own; a failure costs only that event its short links.
  const failures: unknown[] = [];
  const linkEntries = await Promise.all(
    ids.map(async (id): Promise<[string, Record<ScreenChannel, string | null> | null]> => {
      const remembered = memo?.links.get(id, now());
      if (remembered) return [id, remembered];
      const timeoutMs = timeoutWithin(DETAIL_TIMEOUT_MS);
      if (timeoutMs <= 0) {
        failures.push(new EventsFeedError('No time was left in the refresh for this event detail', 'timeout'));
        return [id, null];
      }
      try {
        const links = parseScreenShortLinks(await client.getEvent(id, timeoutMs));
        memo?.links.set(id, links, now());
        return [id, links];
      } catch (err) {
        failures.push(err);
        return [id, null];
      }
    }),
  );
  if (failures.length > 0) {
    report?.(
      'events-feed:details',
      new Error(
        `${failures.length} of ${ids.length} event detail lookups failed, so those events use the page link. First failure: ${messageOf(failures[0])}`,
      ),
    );
  }
  const linksById = new Map(linkEntries);

  return {
    events: selection.events.map((event) => toScreenEvent(event, linksById.get(event.id) ?? null, deps.app)),
    nights: selection.nights.map((event) => toScreenEvent(event, linksById.get(event.id) ?? null, deps.app)),
  };
}

export interface CreateEventsFeedOptions extends ManagementClientOptions {
  /** utm_source on the fallback links: the app's name, for example 'anchor-quiz'. */
  app: string;
  /** This app's format (spec S7.2), for example NIGHT_CATEGORY_SLUGS.quiz. */
  categorySlug: string;
  /** Defaults to a redacted console line; pass the app's reportError. */
  report?: ReportFn;
  now?: () => number;
  maxEvents?: number;
  maxNights?: number;
  /** Defaults: 5 minutes fresh, 24 hours stale-if-error, 1 minute fail-fast. */
  freshMs?: number;
  maxStaleMs?: number;
  failFastMs?: number;
}

export interface EventsFeed {
  /** Upcoming events for the screens. Never throws. */
  getFeed(): Promise<ScreenFeed>;
  /** Forgets the cached answer, for tests and a manual refresh. */
  clear(): void;
}

function emptyFeed(status: ScreenFeedStatus, categorySlug: string): ScreenFeed {
  return { status, fetchedAt: null, categorySlug, events: [], nights: [] };
}

const defaultReport: ReportFn = (scope, err) => logActionFailure(scope, err);

/**
 * One feed per app and server instance: create it once at module level in
 * the screen route, then call getFeed() per request.
 */
export function createEventsFeed(options: CreateEventsFeedOptions): EventsFeed {
  if (!options.app.trim()) throw new Error('createEventsFeed needs the app name for the utm tags.');
  if (!/^[a-z0-9-]+$/.test(options.categorySlug)) {
    throw new Error(`createEventsFeed needs a category slug such as "music-bingo" (got "${options.categorySlug}").`);
  }
  const now = options.now ?? Date.now;
  const report = options.report ?? defaultReport;
  const client = createManagementClient(options);
  const memo = createFeedMemo();

  const cache: StaleIfErrorCache<BuiltFeed> = createStaleIfErrorCache({
    load: () =>
      buildScreenFeed({
        client,
        app: options.app,
        categorySlug: options.categorySlug,
        todayIso: getTodayIsoDateInLondon(new Date(now())),
        now,
        memo,
        report,
        maxEvents: options.maxEvents,
        maxNights: options.maxNights,
      }),
    now,
    freshMs: options.freshMs,
    maxStaleMs: options.maxStaleMs,
    failFastMs: options.failFastMs,
    onRefreshError: (err) => report('events-feed:refresh', err),
  });

  return {
    async getFeed(): Promise<ScreenFeed> {
      if (!client.config) return emptyFeed('missing_config', options.categorySlug);
      let cached;
      try {
        cached = await cache.get();
      } catch {
        // Already reported by the refresh that failed.
        return emptyFeed('error', options.categorySlug);
      }
      // The cache can be minutes (or, while failing, hours) old, so drop
      // anything that has started since.
      const nowMs = now();
      const events = dropStarted(cached.value.events, nowMs);
      const nights = dropStarted(cached.value.nights, nowMs);
      return {
        status: events.length > 0 || nights.length > 0 ? 'ok' : 'no_events',
        fetchedAt: new Date(cached.fetchedAtMs).toISOString(),
        categorySlug: options.categorySlug,
        events,
        nights,
      };
    },
    clear: () => cache.clear(),
  };
}
