// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ScreenEvent } from '../events/types';
import { EventSlide } from './event-slide';
import { buildThankYouPlaylist, type PromoSlide as PromoSlideData } from './playlist';
import { PromoSlide } from './promo-slide';
import { ReviewSlide, WhatsOnSlide } from './simple-slides';
import { SlideLoop } from './slide-loop';
import { ThankYouSlide } from './thank-you-slide';

afterEach(cleanup);

const LINK = 'https://l.the-anchor.pub/post-q2';
const NEXT: ScreenEvent = {
  id: 'q2',
  slug: 'test-quiz-night-2026-12-02',
  title: 'Test Quiz Night',
  startsAt: '2026-12-02T19:00:00.000Z',
  category: 'quiz-night-stanwell-moor',
  image: null,
  links: { pre_event_screen: LINK, in_game_screen: LINK, post_event_screen: LINK, venue_screen: LINK, event_host_slide: LINK },
};
const NOW = Date.parse('2026-11-18T21:30:00Z');
const REVIEW = 'https://l.the-anchor.pub/qreview';

const cards = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[data-card]')).map((el) => el.getAttribute('data-card') ?? '');

describe('ThankYouSlide (spec S7.5)', () => {
  it('shows "Review us" and "What\'s on next" with the name and the London date', () => {
    const { container, getByText } = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={NEXT} nextNightQr={LINK} nowMs={NOW} />);
    expect(cards(container)).toEqual(['Review us', "What's on next"]);
    getByText('Test Quiz Night');
    // Wednesday 2 December 2026 at 19:00 GMT: two weeks on, so the short date.
    getByText('Wed 2 Dec at 7pm');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('falls back to "See what\'s on" with the what\'s-on QR when the feed has nothing, with no date at all', () => {
    const { container, getByText } = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={null} nextNightQr={null} nowMs={NOW} />);
    expect(cards(container)).toEqual(['Review us', "See what's on"]);
    getByText('the-anchor.pub/whats-on');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\d{1,2}(am|pm)|Invalid Date|undefined|NaN|TBC|Next event date/i);
    expect(text).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
  });

  it('keeps the fallback address on one line and lets the other lines balance (2.0.1)', () => {
    const fallback = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={null} nextNightQr={null} nowMs={NOW} />);
    const address = fallback.getByText('the-anchor.pub/whats-on');
    expect(address.className.split(' ')).toContain('whitespace-nowrap');
    expect(address.className.split(' ')).not.toContain('text-balance');
    expect(fallback.getByText('Scan to leave feedback').className.split(' ')).toContain('text-balance');
    cleanup();
    const next = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={NEXT} nextNightQr={LINK} nowMs={NOW} />);
    expect(next.getByText('Test Quiz Night').className.split(' ')).not.toContain('whitespace-nowrap');
  });

  it('falls back rather than print a broken date or draw an empty code', () => {
    const broken = { ...NEXT, startsAt: 'not a date' };
    const a = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={broken} nextNightQr={LINK} nowMs={NOW} />);
    expect(cards(a.container)).toEqual(['Review us', "See what's on"]);
    cleanup();
    const b = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={NEXT} nextNightQr="" nowMs={NOW} />);
    expect(cards(b.container)).toEqual(['Review us', "See what's on"]);
  });

  it('shows no review card for a Google URL or none, and no next card when the host hid it', () => {
    const a = render(<ThankYouSlide reviewUrl="https://g.page/r/abc/review" nextNight={NEXT} nextNightQr={LINK} nowMs={NOW} />);
    expect(cards(a.container)).toEqual(["What's on next"]);
    cleanup();
    const b = render(<ThankYouSlide reviewUrl={REVIEW} nextNight={NEXT} nextNightQr={LINK} hideNext nowMs={NOW} />);
    expect(cards(b.container)).toEqual(['Review us']);
  });

  it('draws from a thank-you playlist built on an empty feed', () => {
    const [slide] = buildThankYouPlaylist({ feed: null, nowMs: NOW, reviewUrl: REVIEW });
    const { container } = render(<PromoSlide slide={slide} nowMs={NOW} nextNightLabel="Next quiz night" />);
    expect(cards(container)).toEqual(['Review us', "See what's on"]);
  });
});

describe('the other slides', () => {
  it('draws an event with its London time and its QR', () => {
    const { getByText, container } = render(<EventSlide event={NEXT} qrUrl={LINK} nowMs={NOW} />);
    getByText('Coming up at The Anchor');
    getByText('Wed 2 Dec at 7pm');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('loads artwork through the optimiser at no more than 1200 wide', () => {
    const withImage = { ...NEXT, image: { url: 'https://tfcasgxopxegwrabvwat.supabase.co/storage/v1/object/public/event-images/x.png', alt: 'Art', square: false } };
    const { container } = render(<EventSlide event={withImage} qrUrl={LINK} nowMs={NOW} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`/_next/image?url=${encodeURIComponent(withImage.image.url)}&w=1200&q=75`);
    expect(img?.getAttribute('srcset')).toContain('640w');
  });

  it('draws nothing for a review slide without an Anchor link', () => {
    expect(render(<ReviewSlide url="https://g.page/r/abc/review" />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<ReviewSlide url={REVIEW} />).container.querySelector('svg')).not.toBeNull();
  });

  it('points the what\'s-on slide at the website', () => {
    const { getByText, container } = render(<WhatsOnSlide />);
    getByText('the-anchor.pub/whats-on');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('keeps the what\'s-on address on one line at Cash Bingo\'s size (2.0.1)', () => {
    const { getByText } = render(<WhatsOnSlide />);
    const address = getByText('the-anchor.pub/whats-on');
    const classes = address.className.split(' ');
    expect(classes).toContain('whitespace-nowrap');
    expect(classes).not.toContain('break-all');
    // Cash Bingo's TV_SIZE.url (52px at 1080p), not tv-lg (56px).
    expect(classes).toContain('text-[length:clamp(35px,calc(4.8*var(--anchor-vh,1vh)),78px)]');
    expect(classes.filter((name) => name.startsWith('text-tv-'))).toEqual([]);
    // The hyphen in the text stays a real hyphen: only the CSS keeps it on one line.
    expect(address.textContent).not.toContain('\u2011');
  });

  it('hands the app its own slides', () => {
    const slide: PromoSlideData = { key: 'app-join-0', kind: 'app', id: 'join', durationMs: 20_000 };
    const { getByText } = render(<PromoSlide slide={slide} nowMs={NOW} nextNightLabel="x" renderApp={(s) => <p>app {s.id}</p>} />);
    getByText('app join');
  });
});

describe('SlideLoop', () => {
  it('moves to the next slide after its duration', async () => {
    vi.useFakeTimers();
    try {
      const slides = [
        { key: 'a', kind: 'app', durationMs: 1000 },
        { key: 'b', kind: 'app', durationMs: 1000 },
      ];
      const { container } = render(<SlideLoop slides={slides} renderSlide={(slide) => <p>{slide.key}</p>} />);
      expect(container.textContent).toBe('a');
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.textContent).toBe('b');
    } finally {
      vi.useRealTimers();
    }
  });
});
