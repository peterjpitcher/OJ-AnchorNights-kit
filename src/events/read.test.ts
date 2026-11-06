import { describe, expect, it } from 'vitest';
import { chooseScreenFeed, readScreenFeed } from './read';
import type { ScreenFeed } from './types';

const LINK = 'https://www.the-anchor.pub/events/x?utm_source=a&utm_medium=screen';
const links = { pre_event_screen: LINK, in_game_screen: LINK, post_event_screen: LINK, venue_screen: LINK, event_host_slide: LINK };
const event = { id: 'e1', slug: 'x', title: 'X', startsAt: '2026-11-18T19:00:00.000Z', category: 'parties', image: null, links };

describe('readScreenFeed', () => {
  it('reads a feed and drops a malformed event on its own', () => {
    const feed = readScreenFeed({
      status: 'ok',
      fetchedAt: '2026-11-06T12:00:00.000Z',
      categorySlug: 'bingo-night',
      events: [event, { ...event, id: 'e2', links: { pre_event_screen: LINK } }, { ...event, id: 'e3', startsAt: 'soon' }],
      nights: [],
    });
    expect(feed?.events.map((e) => e.id)).toEqual(['e1']);
  });

  it('gives null for something that is not a feed', () => {
    expect(readScreenFeed(null)).toBeNull();
    expect(readScreenFeed({ status: 'fine', categorySlug: 'x' })).toBeNull();
    expect(readScreenFeed({ status: 'ok' })).toBeNull();
  });
});

describe('chooseScreenFeed', () => {
  const ok: ScreenFeed = { status: 'ok', fetchedAt: 'x', categorySlug: 'c', events: [event], nights: [] };
  const error: ScreenFeed = { status: 'error', fetchedAt: null, categorySlug: 'c', events: [], nights: [] };
  const none: ScreenFeed = { ...error, status: 'no_events' };

  it('never lets an error replace a good list, but lets anything else', () => {
    expect(chooseScreenFeed(ok, error)).toBe(ok);
    expect(chooseScreenFeed(null, error)).toBe(error);
    expect(chooseScreenFeed(ok, none)).toBe(none);
  });
});
