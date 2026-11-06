// Which events the screens show. Pure: the current time is passed in, so it
// behaves the same in any server time zone. Safe in the browser.
//
// From Cash Bingo (src/lib/events-feed/select.ts), with the night's own
// format passed in as a category slug instead of 'bingo-night' written in.
//
// 1. Drop events that have already started, and any that are not scheduled.
// 2. Take this format's nights out of the general list; they only appear
//    through the next-night slot, which is fed by its own query.
// 3. Keep one occurrence per event name, the earliest.
// 4. Keep 8 at most.
//
// This format's nights are taken out before the cap, so a busy month of them
// never leaves the carousel short of other events. They are never
// de-duplicated by name: they recur under the same name, and a TV needs the
// one after tonight's.

import { getLondonIsoDate } from '../dates';

/** Most events in the general list. */
export const MAX_SCREEN_EVENTS = 8;

/** Most nights of this format kept; matches the query's limit. */
export const MAX_FORMAT_NIGHTS = 5;

/** The management category slug for each night (spec S7.2). */
export const NIGHT_CATEGORY_SLUGS = Object.freeze({
  quiz: 'quiz-night-stanwell-moor',
  cashBingo: 'bingo-night',
  musicBingo: 'music-bingo',
  tasting: 'tasting-nights',
} as const);

export interface SelectableEvent {
  id: string;
  title: string;
  /** ISO 8601 instant with a zone. */
  startsAt: string;
  category: string | null;
  /** The management `event_status`; null or absent is treated as scheduled. */
  status?: string | null;
}

/** True once the event's start time has passed, or when it has no usable start. */
export function hasStarted(event: Pick<SelectableEvent, 'startsAt'>, nowMs: number): boolean {
  const startMs = Date.parse(event.startsAt);
  return !Number.isFinite(startMs) || startMs <= nowMs;
}

export function dropStarted<T extends Pick<SelectableEvent, 'startsAt'>>(events: readonly T[], nowMs: number): T[] {
  return events.filter((event) => !hasStarted(event, nowMs));
}

function isScheduled(event: SelectableEvent): boolean {
  return event.status == null || event.status === 'scheduled';
}

/** Earliest first; ties broken by id so the order never depends on input order. */
function byStart(a: Pick<SelectableEvent, 'id' | 'startsAt'>, b: Pick<SelectableEvent, 'id' | 'startsAt'>): number {
  const diff = Date.parse(a.startsAt) - Date.parse(b.startsAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Names that differ only in case or spacing are the same event. */
function nameKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface ScreenSelection<T> {
  events: T[];
  nights: T[];
}

export interface SelectScreenEventsOptions {
  /** This app's format, for example 'music-bingo'. */
  categorySlug: string;
  nowMs: number;
  maxEvents?: number;
  maxNights?: number;
}

/**
 * Selects the general list and this format's nights.
 *
 * `nights` comes from the category query. Any of this format's nights in the
 * general list are merged in too (by id), so the next-night slot still works
 * if the category query found nothing.
 */
export function selectScreenEvents<T extends SelectableEvent>(
  general: readonly T[],
  nights: readonly T[],
  options: SelectScreenEventsOptions,
): ScreenSelection<T> {
  const { categorySlug, nowMs } = options;
  const maxEvents = options.maxEvents ?? MAX_SCREEN_EVENTS;
  const maxNights = options.maxNights ?? MAX_FORMAT_NIGHTS;
  const isThisFormat = (event: T): boolean => event.category === categorySlug;
  const upcoming = dropStarted(general, nowMs).filter(isScheduled).sort(byStart);

  const events: T[] = [];
  const seenNames = new Set<string>();
  for (const event of upcoming) {
    if (events.length === maxEvents) break;
    if (isThisFormat(event)) continue;
    const key = nameKey(event.title);
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    events.push(event);
  }

  const candidates = [...dropStarted(nights, nowMs).filter(isScheduled), ...upcoming.filter(isThisFormat)];
  const selectedNights: T[] = [];
  const seenIds = new Set<string>();
  for (const event of candidates.sort(byStart)) {
    if (selectedNights.length === maxNights) break;
    if (seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    selectedNights.push(event);
  }

  return { events, nights: selectedNights };
}

export interface SelectNextOfFormatOptions {
  /**
   * A London date (YYYY-MM-DD) to skip, normally the date of tonight's game,
   * so the screen before the game never says the next night is tonight.
   */
  excludeLondonDate?: string | null;
}

/**
 * The next night of this format still to come at `nowMs`, or null. Matched
 * by category slug only, never by name (spec S7.2).
 */
export function selectNextOfFormat<T extends Pick<SelectableEvent, 'id' | 'startsAt' | 'category'>>(
  events: readonly T[],
  categorySlug: string,
  nowMs: number,
  options: SelectNextOfFormatOptions = {},
): T | null {
  const exclude = options.excludeLondonDate ?? null;
  const candidates = dropStarted(events, nowMs)
    .filter((event) => event.category === categorySlug)
    .filter((event) => !exclude || getLondonIsoDate(event.startsAt) !== exclude)
    .sort(byStart);
  return candidates[0] ?? null;
}
