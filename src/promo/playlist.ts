// What a TV loops through when no game is being called (spec S7.4), and the
// end-of-night loop (spec S7.5). Pure: the screen passes the feed, its clock
// and its own slide, and draws whatever comes back with PromoSlide and
// SlideLoop.
//
// From Cash Bingo (src/lib/playlist.ts). What changed, and why:
//   - Bingo's own slides (follow-along, rules, break, next game, kitchen) are
//     one `app` slide the app draws itself, passed in as `lead`. The kit has
//     no game logic.
//   - Timings are the spec's: 12 seconds for an event or the next night, 20
//     seconds for everything else. Cash Bingo's thank-you was 15 seconds and
//     its follow-along stood for 30 with no events; both are 20 here.
//   - The end of the night is the ThankYou slide with its two QR cards
//     (Music Bingo's layout), then the next two events in turn (spec S7.5),
//     instead of Cash Bingo's thanks, review and every event.
//   - Which link an event's QR uses is a screen channel passed in, rather
//     than worked out from bingo's phases of the night.
//
// With no events (none, an error, or no key) each loop falls back to its own
// short loop. A screen never shows an error about events.

import { isAllowedReviewUrl, WHATS_ON_URL } from '../events/links';
import { dropStarted, selectNextOfFormat } from '../events/select';
import type { ScreenChannel, ScreenEvent, ScreenEventImage, ScreenFeed } from '../events/types';

/** An upcoming event or the next night. */
export const EVENT_MS = 12_000;
/** The next night of this format. */
export const NEXT_NIGHT_MS = 12_000;
/** Every other slide: the app's own, what's on, review, thank you. */
export const SLIDE_MS = 20_000;

interface SlideBase {
  /** Stable within one playlist: the loop keeps its place while the keys match. */
  key: string;
  durationMs: number;
  /** The next slide's image, so the screen can start loading it now. */
  preloadImage?: ScreenEventImage | null;
}

/** A slide the app draws itself (join, follow along, rules, break). */
export interface AppSlide extends SlideBase {
  kind: 'app';
  /** The app's name for it, for example 'follow_along'. */
  id: string;
}

export interface EventBearingSlide extends SlideBase {
  kind: 'event' | 'next_night';
  event: ScreenEvent;
  /** The QR target on the playlist's channel. */
  qrUrl: string;
}

export interface WhatsOnSlideData extends SlideBase {
  kind: 'whats_on';
  url: string;
}

export interface ReviewSlideData extends SlideBase {
  kind: 'review';
  url: string;
}

export interface ThankYouSlideData extends SlideBase {
  kind: 'thank_you';
  /** The app's review short link; null to show no review card. */
  reviewUrl: string | null;
  /** The next night of this format; null shows "See what's on" (unless hidden). */
  nextNight: ScreenEvent | null;
  nextNightQr: string | null;
  /** True when the host has hidden the "What's on next" card for tonight. */
  hideNext: boolean;
}

export type PromoSlide = AppSlide | EventBearingSlide | WhatsOnSlideData | ReviewSlideData | ThankYouSlideData;
export type PromoSlideKind = PromoSlide['kind'];

export interface UsableEvents {
  /** Upcoming events of other formats. */
  events: ScreenEvent[];
  /** The next night of this format still to come, other than tonight's. */
  nextNight: ScreenEvent | null;
}

/**
 * The events a screen may show at `nowMs`: drops anything that has started,
 * and the night on the screen's own session date (it is tonight). Done at
 * render time, so a cached feed is never wrong after midnight. An error or a
 * missing feed gives nothing, never an error slide.
 */
export function getUsableEvents(feed: ScreenFeed | null, nowMs: number, sessionDate: string | null = null): UsableEvents {
  if (!feed || feed.status !== 'ok') return { events: [], nextNight: null };
  return {
    events: dropStarted(feed.events, nowMs),
    nextNight: selectNextOfFormat(feed.nights, feed.categorySlug, nowMs, { excludeLondonDate: sessionDate }),
  };
}

/** Builds slides with keys that stay unique however often a kind repeats. */
function createSlideList(channel: ScreenChannel) {
  const slides: PromoSlide[] = [];
  const counts = new Map<string, number>();
  const nextKey = (base: string): string => {
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    return `${base}-${n}`;
  };
  return {
    slides,
    app(id: string, durationMs: number) {
      slides.push({ key: nextKey(`app-${id}`), kind: 'app', id, durationMs });
    },
    whatsOn() {
      slides.push({ key: nextKey('whats_on'), kind: 'whats_on', url: WHATS_ON_URL, durationMs: SLIDE_MS });
    },
    event(kind: 'event' | 'next_night', event: ScreenEvent) {
      slides.push({
        key: nextKey(`${kind}-${event.id}`),
        kind,
        event,
        qrUrl: event.links[channel],
        durationMs: kind === 'event' ? EVENT_MS : NEXT_NIGHT_MS,
      });
    },
    push(slide: PromoSlide) {
      slides.push(slide);
    },
  };
}

/** Events two at a time. */
function inPairs<T>(items: ReadonlyArray<T>): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return pairs;
}

/** Each slide learns the next slide's image (wrapping round), for preloading. */
function withPreloads(slides: PromoSlide[]): PromoSlide[] {
  return slides.map((slide, index) => {
    const next = slides[(index + 1) % slides.length];
    const image = next && next !== slide && 'event' in next ? next.event.image : null;
    return { ...slide, preloadImage: image };
  });
}

export interface IdlePlaylistOptions {
  feed: ScreenFeed | null;
  /** The screen's clock (epoch milliseconds). */
  nowMs: number;
  /**
   * Which short link the event QR codes use: 'pre_event_screen' before the
   * night, 'in_game_screen' on a break or between games, 'post_event_screen'
   * after it and on an idle screen (Cash Bingo's choice). Defaults to
   * 'post_event_screen'.
   */
  channel?: ScreenChannel;
  /** The London date of tonight's game, so the next night is never tonight's. */
  sessionDate?: string | null;
  /** The app's own slide (join or follow along), where it has one. */
  lead?: { id: string; durationMs?: number } | null;
}

/**
 * The idle loop (spec S7.4): the app's slide, the next night of this format,
 * the events two at a time with the app's slide again between pairs, and the
 * what's-on slide once a loop. With no app slide, the what's-on slide leads.
 *
 * With a lead: lead, next night, E1, E2, lead, what's on, E3, E4, lead, next
 * night, E5, E6, ... There are always at least two rounds, so what's on shows
 * once a loop even with one event or none.
 */
export function buildIdlePlaylist(options: IdlePlaylistOptions): PromoSlide[] {
  const usable = getUsableEvents(options.feed, options.nowMs, options.sessionDate ?? null);
  const list = createSlideList(options.channel ?? 'post_event_screen');
  const lead = options.lead ?? null;
  const leadMs = lead?.durationMs ?? SLIDE_MS;
  const anchor = (): void => (lead ? list.app(lead.id, leadMs) : list.whatsOn());

  if (usable.events.length === 0 && !usable.nextNight) {
    anchor();
    if (lead) list.whatsOn();
    return list.slides;
  }

  const pairs = inPairs(usable.events);
  const rounds = Math.max(pairs.length, lead ? 2 : 1);
  for (let round = 0; round < rounds; round += 1) {
    anchor();
    if (round % 2 === 0) {
      if (usable.nextNight) list.event('next_night', usable.nextNight);
    } else if (lead) {
      list.whatsOn();
    }
    for (const event of pairs[round] ?? []) list.event('event', event);
  }
  return withPreloads(list.slides);
}

export interface ThankYouPlaylistOptions {
  feed: ScreenFeed | null;
  nowMs: number;
  /** The app's own review short link (to https://l.the-anchor.pub/feedback). Anything else shows no review card. */
  reviewUrl: string | null | undefined;
  sessionDate?: string | null;
  /** Defaults to 'post_event_screen'. */
  channel?: ScreenChannel;
  /** The host's switches for tonight (spec S7.6): hide a card, never type one. */
  hideReview?: boolean;
  hideNext?: boolean;
}

/**
 * The end of the night (spec S7.5): the thank-you slide with "Review us" and
 * "What's on next" (or "See what's on" when the feed has nothing), then the
 * next two upcoming events in turn, and round again.
 */
export function buildThankYouPlaylist(options: ThankYouPlaylistOptions): PromoSlide[] {
  const channel = options.channel ?? 'post_event_screen';
  const usable = getUsableEvents(options.feed, options.nowMs, options.sessionDate ?? null);
  const list = createSlideList(channel);
  const reviewUrl = !options.hideReview && isAllowedReviewUrl(options.reviewUrl) ? options.reviewUrl.trim() : null;
  const hideNext = options.hideNext === true;
  const nextNight = hideNext ? null : usable.nextNight;
  list.push({
    key: 'thank_you-0',
    kind: 'thank_you',
    durationMs: SLIDE_MS,
    reviewUrl,
    nextNight,
    nextNightQr: nextNight ? nextNight.links[channel] : null,
    hideNext,
  });
  for (const event of usable.events.slice(0, 2)) list.event('event', event);
  return withPreloads(list.slides);
}

/** A single review slide (Cash Bingo's), for an app that wants one in its own loop. Null without an allowed link. */
export function reviewSlide(url: string | null | undefined): ReviewSlideData | null {
  if (!isAllowedReviewUrl(url)) return null;
  return { key: 'review-0', kind: 'review', url: url.trim(), durationMs: SLIDE_MS };
}

/**
 * True for a slide that shows a QR code of its own, so the screen can hide
 * any corner QR while it is up (never two codes on screen to scan). The app
 * decides for its own slides.
 */
export function slideCarriesQr(slide: PromoSlide): boolean {
  return slide.kind !== 'app';
}

/** A string that changes whenever the slides do, for resetting a loop. */
export function playlistSignature(slides: ReadonlyArray<Pick<PromoSlide, 'key' | 'durationMs'>>): string {
  return slides.map((slide) => `${slide.key}:${slide.durationMs}`).join('|');
}

