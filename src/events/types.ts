// The shapes the screens receive from the events feed. Types only, with no
// runtime imports, so a client component can `import type` from here without
// pulling server code (or the management key) into the browser bundle.
//
// From Cash Bingo (src/lib/events-feed/types.ts), generalised: the night's
// own format is a category slug passed in, not bingo written in, and every
// event carries its link for each of the management app's screen channels.

/**
 * - `ok`: at least one upcoming event or night of this format.
 * - `no_events`: the feed answered, but nothing upcoming is left to show.
 * - `error`: the feed failed with nothing good to fall back on (a cold
 *   start), or the last good answer is more than 24 hours old.
 * - `missing_config`: ANCHOR_API_KEY is not set (a local run or a preview).
 */
export type ScreenFeedStatus = 'ok' | 'no_events' | 'error' | 'missing_config';

/**
 * The management app's screen QR channels (its src/lib/short-links/channels.ts):
 * before the night, during it (a break or between games), after it, the
 * venue's own screens, and a slide the host shows.
 */
export type ScreenChannel =
  | 'pre_event_screen'
  | 'in_game_screen'
  | 'post_event_screen'
  | 'venue_screen'
  | 'event_host_slide';

export interface ScreenEventImage {
  /** An https URL in the event-images bucket (see image-host.js). */
  url: string;
  /** The event's alt text, or its title when the event has none. */
  alt: string;
  /** True for the square artwork (no landscape was usable), shown whole beside the text. */
  square: boolean;
}

/** One upcoming event as the TV and phones see it; never the raw API event. */
export interface ScreenEvent {
  id: string;
  /** The website slug; null when the management app has none. */
  slug: string | null;
  title: string;
  /** When it starts, as an ISO 8601 UTC instant (2026-11-18T19:00:00.000Z). */
  startsAt: string;
  /** The management category slug, for example 'music-bingo', or null. */
  category: string | null;
  /** Landscape, else square, else hero artwork; null for a text-only card. */
  image: ScreenEventImage | null;
  /**
   * The QR target for each channel: the event's management short link for
   * that channel when it has one, otherwise the website's event page with
   * this app's utm tags (spec S7.3).
   */
  links: Record<ScreenChannel, string>;
}

export interface ScreenFeed {
  status: ScreenFeedStatus;
  /** When the management app was last read successfully; null when it never was. */
  fetchedAt: string | null;
  /** This app's format, for example 'quiz-night-stanwell-moor'. */
  categorySlug: string;
  /** Up to 8 upcoming events of other formats, earliest first, one per name. */
  events: ScreenEvent[];
  /** Up to 5 upcoming nights of this format, earliest first. */
  nights: ScreenEvent[];
}
