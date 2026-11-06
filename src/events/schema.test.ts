import { describe, expect, it } from 'vitest';
import { EventsFeedError } from './errors';
import { BINGO_CATEGORY, QUIZ_NOV_18, categoriesResponse, detailResponse, fixtureEvent, listResponse } from './fixtures';
import { findCategoryId, parseEventList, parseManagementEvent, parseScreenShortLinks } from './schema';

describe('parseManagementEvent', () => {
  it('reads the fields the screens use, with the start as a UTC instant', () => {
    expect(parseManagementEvent(QUIZ_NOV_18)).toEqual({
      id: '20000000-0000-4000-8000-000000000001',
      slug: 'test-quiz-night-2026-11-18',
      title: 'Test Quiz Night',
      startsAt: '2026-11-18T19:00:00.000Z',
      status: 'scheduled',
      category: 'quiz-night-stanwell-moor',
      images: {
        landscape: (QUIZ_NOV_18 as { landscapeImageUrl: string }).landscapeImageUrl,
        square: (QUIZ_NOV_18 as { squareImageUrl: string }).squareImageUrl,
        hero: (QUIZ_NOV_18 as { heroImageUrl: string }).heroImageUrl,
      },
      imageAlt: 'Artwork for Test Quiz Night',
    });
  });

  it('normalises an offset start to UTC', () => {
    const event = parseManagementEvent({ ...QUIZ_NOV_18, startDate: '2026-07-01T19:00:00+01:00' });
    expect(event?.startsAt).toBe('2026-07-01T18:00:00.000Z');
  });

  it('drops an event with no id, no name or a start without a zone', () => {
    expect(parseManagementEvent({ ...QUIZ_NOV_18, id: 'not-a-uuid' })).toBeNull();
    expect(parseManagementEvent({ ...QUIZ_NOV_18, name: '  ' })).toBeNull();
    expect(parseManagementEvent({ ...QUIZ_NOV_18, startDate: '2026-11-18T19:00:00' })).toBeNull();
    expect(parseManagementEvent({ ...QUIZ_NOV_18, startDate: '2026-11-18' })).toBeNull();
  });

  it('turns a bad optional field into null instead of dropping the event', () => {
    const event = parseManagementEvent({ ...QUIZ_NOV_18, slug: 42, landscapeImageUrl: 7, category: 'quiz' });
    expect(event).not.toBeNull();
    expect(event?.slug).toBeNull();
    expect(event?.images.landscape).toBeNull();
    expect(event?.category).toBeNull();
  });
});

describe('parseEventList', () => {
  it('keeps the good events and counts the bad ones', () => {
    const parsed = parseEventList(listResponse([QUIZ_NOV_18, { id: 'x' }]));
    expect(parsed.events.map((event) => event.title)).toEqual(['Test Quiz Night']);
    expect(parsed.dropped).toBe(1);
  });

  it('throws a parse error when the envelope is wrong', () => {
    expect(() => parseEventList({ success: false })).toThrow(EventsFeedError);
    expect(() => parseEventList({ data: { events: [] } })).toThrow(/expected shape/);
  });
});

describe('findCategoryId (spec S7.2)', () => {
  it('finds a category by its slug', () => {
    expect(findCategoryId(categoriesResponse(), 'bingo-night')).toBe(BINGO_CATEGORY.id);
    expect(findCategoryId(categoriesResponse(), 'tasting-nights')).toBe('10000000-0000-4000-8000-000000000004');
  });

  it('never matches the display name', () => {
    expect(findCategoryId(categoriesResponse(), 'Cash Bingo')).toBeNull();
    expect(findCategoryId(categoriesResponse(), 'no-such-night')).toBeNull();
  });

  it('throws when the envelope is wrong', () => {
    expect(() => findCategoryId({ success: true, data: {} }, 'bingo-night')).toThrow(EventsFeedError);
  });
});

describe('parseScreenShortLinks', () => {
  it('reads every screen channel, trusted links only, qr links first', () => {
    const json = detailResponse('20000000-0000-4000-8000-000000000001', {
      pre_event_screen: 'https://l.the-anchor.pub/pstest',
      in_game_screen: 'https://evil.example/sc',
      venue_screen: 'https://l.the-anchor.pub/vstest',
    });
    expect(parseScreenShortLinks(json)).toEqual({
      pre_event_screen: 'https://l.the-anchor.pub/pstest',
      in_game_screen: null,
      post_event_screen: null,
      venue_screen: 'https://l.the-anchor.pub/vstest',
      event_host_slide: null,
    });
  });

  it('falls back to the marketing map', () => {
    const json = { success: true, data: { qr_short_links: null, marketing_short_links: { post_event_screen: 'https://l.the-anchor.pub/nstest' } } };
    expect(parseScreenShortLinks(json).post_event_screen).toBe('https://l.the-anchor.pub/nstest');
  });

  it('throws when the envelope is wrong', () => {
    expect(() => parseScreenShortLinks({ success: true })).toThrow(EventsFeedError);
  });

  it('accepts a fixture event built for any category', () => {
    expect(parseManagementEvent(fixtureEvent('20000000-0000-4000-8000-0000000000ff', 's', 'N', '2026-11-18T19:00:00Z', null))?.category).toBeNull();
  });
});
