import { describe, expect, it } from 'vitest';
import type { ScreenEvent, ScreenFeed } from '../events/types';
import { buildIdlePlaylist, buildThankYouPlaylist, EVENT_MS, NEXT_NIGHT_MS, playlistSignature, reviewSlide, SLIDE_MS, slideCarriesQr, type PromoSlide } from './playlist';

function screenEvent(id: string, startsAt: string, category: string | null): ScreenEvent {
  const page = `https://www.the-anchor.pub/events/${id}?utm_source=anchor-quiz&utm_medium=screen`;
  return {
    id,
    slug: id,
    title: `Event ${id}`,
    startsAt,
    category,
    image: { url: `https://img.example/${id}.png`, alt: id, square: false },
    links: {
      pre_event_screen: `https://l.the-anchor.pub/pre-${id}`,
      in_game_screen: `https://l.the-anchor.pub/game-${id}`,
      post_event_screen: `https://l.the-anchor.pub/post-${id}`,
      venue_screen: page,
      event_host_slide: page,
    },
  };
}

const QUIZ = 'quiz-night-stanwell-moor';
const NOW = Date.parse('2026-11-18T12:00:00Z');

function feed(eventCount: number, nights: ScreenEvent[] = [screenEvent('q2', '2026-12-02T19:00:00Z', QUIZ)]): ScreenFeed {
  return {
    status: 'ok',
    fetchedAt: '2026-11-18T11:58:00.000Z',
    categorySlug: QUIZ,
    events: Array.from({ length: eventCount }, (_, i) => screenEvent(`e${i + 1}`, `2026-11-${String(20 + i).padStart(2, '0')}T19:00:00Z`, 'parties')),
    nights,
  };
}

const shape = (slides: PromoSlide[]): string[] =>
  slides.map((slide) => ('event' in slide ? `${slide.kind}:${slide.event.id}` : slide.kind === 'app' ? `app:${slide.id}` : slide.kind));

describe('buildIdlePlaylist (spec S7.4)', () => {
  it('runs lead, next night, events in pairs, with what is on once a loop', () => {
    const slides = buildIdlePlaylist({ feed: feed(6), nowMs: NOW, lead: { id: 'join' } });
    expect(shape(slides)).toEqual([
      'app:join', 'next_night:q2', 'event:e1', 'event:e2',
      'app:join', 'whats_on', 'event:e3', 'event:e4',
      'app:join', 'next_night:q2', 'event:e5', 'event:e6',
    ]);
  });

  it('uses the spec timings: 12 seconds per event, 20 for the rest', () => {
    const slides = buildIdlePlaylist({ feed: feed(2), nowMs: NOW, lead: { id: 'join' } });
    for (const slide of slides) {
      if (slide.kind === 'event') expect(slide.durationMs).toBe(EVENT_MS);
      else if (slide.kind === 'next_night') expect(slide.durationMs).toBe(NEXT_NIGHT_MS);
      else expect(slide.durationMs).toBe(SLIDE_MS);
    }
    expect(EVENT_MS).toBe(12_000);
    expect(SLIDE_MS).toBe(20_000);
  });

  it('shows what is on at least once a loop with one event', () => {
    expect(shape(buildIdlePlaylist({ feed: feed(1), nowMs: NOW, lead: { id: 'join' } }))).toEqual([
      'app:join', 'next_night:q2', 'event:e1', 'app:join', 'whats_on',
    ]);
  });

  it('leads with what is on when the app has no slide of its own', () => {
    expect(shape(buildIdlePlaylist({ feed: feed(3), nowMs: NOW }))).toEqual([
      'whats_on', 'next_night:q2', 'event:e1', 'event:e2', 'whats_on', 'event:e3',
    ]);
  });

  it('falls back to its short loop when the feed is empty, down or missing', () => {
    for (const f of [null, { ...feed(0, []), status: 'error' as const }, { ...feed(3), status: 'missing_config' as const }, feed(0, [])]) {
      expect(shape(buildIdlePlaylist({ feed: f, nowMs: NOW, lead: { id: 'join' } }))).toEqual(['app:join', 'whats_on']);
      expect(shape(buildIdlePlaylist({ feed: f, nowMs: NOW }))).toEqual(['whats_on']);
    }
  });

  it('uses the link for its channel', () => {
    const before = buildIdlePlaylist({ feed: feed(1), nowMs: NOW, channel: 'pre_event_screen' });
    const brk = buildIdlePlaylist({ feed: feed(1), nowMs: NOW, channel: 'in_game_screen' });
    const idle = buildIdlePlaylist({ feed: feed(1), nowMs: NOW });
    const qr = (slides: PromoSlide[]) => slides.flatMap((slide) => ('qrUrl' in slide ? [slide.qrUrl] : []));
    expect(qr(before)).toEqual(['https://l.the-anchor.pub/pre-q2', 'https://l.the-anchor.pub/pre-e1']);
    expect(qr(brk)).toEqual(['https://l.the-anchor.pub/game-q2', 'https://l.the-anchor.pub/game-e1']);
    expect(qr(idle)).toEqual(['https://l.the-anchor.pub/post-q2', 'https://l.the-anchor.pub/post-e1']);
  });

  it('never offers tonight as the next night, and drops started events at render time', () => {
    const nights = [screenEvent('q1', '2026-11-18T19:00:00Z', QUIZ), screenEvent('q2', '2026-12-02T19:00:00Z', QUIZ)];
    const slides = buildIdlePlaylist({ feed: feed(2, nights), nowMs: NOW, sessionDate: '2026-11-18' });
    expect(shape(slides)).toContain('next_night:q2');
    expect(shape(slides)).not.toContain('next_night:q1');

    const later = buildIdlePlaylist({ feed: feed(2, nights), nowMs: Date.parse('2026-11-20T19:00:00Z') });
    expect(shape(later)).toEqual(['whats_on', 'next_night:q2', 'event:e2']);
  });

  it('tells each slide the next image to preload, wrapping round', () => {
    const slides = buildIdlePlaylist({ feed: feed(2), nowMs: NOW, lead: { id: 'join' } });
    expect(slides[0].preloadImage?.url).toBe('https://img.example/q2.png');
    expect(slides[slides.length - 1].preloadImage).toBeNull();
  });

  it('gives unique keys and a signature that changes with the slides', () => {
    const slides = buildIdlePlaylist({ feed: feed(6), nowMs: NOW, lead: { id: 'join' } });
    expect(new Set(slides.map((slide) => slide.key)).size).toBe(slides.length);
    expect(playlistSignature(slides)).not.toBe(playlistSignature(buildIdlePlaylist({ feed: feed(4), nowMs: NOW, lead: { id: 'join' } })));
  });
});

describe('buildThankYouPlaylist (spec S7.5)', () => {
  const REVIEW = 'https://l.the-anchor.pub/qreview';

  it('shows thank you with both cards, then the next two events in turn', () => {
    const slides = buildThankYouPlaylist({ feed: feed(5), nowMs: NOW, reviewUrl: REVIEW });
    expect(shape(slides)).toEqual(['thank_you', 'event:e1', 'event:e2']);
    const thanks = slides[0];
    expect(thanks.kind).toBe('thank_you');
    if (thanks.kind !== 'thank_you') return;
    expect(thanks.reviewUrl).toBe(REVIEW);
    expect(thanks.nextNight?.id).toBe('q2');
    expect(thanks.nextNightQr).toBe('https://l.the-anchor.pub/post-q2');
    expect(thanks.durationMs).toBe(SLIDE_MS);
  });

  it('has no next night when the feed is empty or down, so the slide shows the fallback', () => {
    for (const f of [null, { ...feed(0, []), status: 'error' as const }]) {
      const slides = buildThankYouPlaylist({ feed: f, nowMs: NOW, reviewUrl: REVIEW });
      expect(shape(slides)).toEqual(['thank_you']);
      if (slides[0].kind === 'thank_you') {
        expect(slides[0].nextNight).toBeNull();
        expect(slides[0].nextNightQr).toBeNull();
        expect(slides[0].hideNext).toBe(false);
      }
    }
  });

  it('refuses a review link that is not an Anchor link, and honours the host hiding a card', () => {
    const google = buildThankYouPlaylist({ feed: feed(1), nowMs: NOW, reviewUrl: 'https://g.page/r/abc/review' })[0];
    expect(google.kind === 'thank_you' && google.reviewUrl).toBeNull();
    const hidden = buildThankYouPlaylist({ feed: feed(1), nowMs: NOW, reviewUrl: REVIEW, hideReview: true, hideNext: true })[0];
    expect(hidden.kind === 'thank_you' && [hidden.reviewUrl, hidden.nextNight, hidden.hideNext]).toEqual([null, null, true]);
  });

  it('builds a review slide only for an allowed link', () => {
    expect(reviewSlide(REVIEW)?.url).toBe(REVIEW);
    expect(reviewSlide('https://g.page/r/abc/review')).toBeNull();
    expect(reviewSlide(null)).toBeNull();
  });

  it('says which slides carry their own QR', () => {
    const slides = buildIdlePlaylist({ feed: feed(1), nowMs: NOW, lead: { id: 'join' } });
    expect(slides.map(slideCarriesQr)).toEqual([false, true, true, false, true]);
  });
});
