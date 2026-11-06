// The whole feed against a fake management app: no network, the clock
// injected, so it runs the same under TZ=Europe/London and TZ=UTC.
import { describe, expect, it } from 'vitest';
import { createEventsFeed } from './feed';
import {
  BINGO_NOV_25,
  MUSIC_BINGO_NOV_20,
  PARTY_NOV_28,
  QUIZ_CATEGORY,
  QUIZ_DEC_2,
  QUIZ_NOV_18,
  TASTING_NOV_21,
  categoriesResponse,
  detailResponse,
  fixtureEvent,
  listResponse,
} from './fixtures';

type Handler = (path: string, url: URL) => unknown;

function fakeManagement(handler: Handler) {
  const paths: string[] = [];
  let down = false;
  const fetchImpl = (async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/api/, '') + url.search;
    paths.push(path);
    if (down) throw new TypeError('fetch failed');
    const body = handler(url.pathname.replace(/^\/api/, ''), url);
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return {
    paths,
    fetchImpl,
    setDown: (value: boolean) => {
      down = value;
    },
  };
}

const QUIZ_LINKS = { post_event_screen: 'https://l.the-anchor.pub/nsquiz', pre_event_screen: 'https://l.the-anchor.pub/psquiz' };

function standardHandler(): Handler {
  return (path, url) => {
    if (path === '/event-categories') return categoriesResponse();
    if (path === '/events') {
      if (url.searchParams.get('category_id') === QUIZ_CATEGORY.id) return listResponse([QUIZ_NOV_18, QUIZ_DEC_2]);
      return listResponse([QUIZ_NOV_18, MUSIC_BINGO_NOV_20, TASTING_NOV_21, BINGO_NOV_25, PARTY_NOV_28]);
    }
    if (path === `/events/${QUIZ_NOV_18.id as string}`) return detailResponse(QUIZ_NOV_18.id as string, QUIZ_LINKS);
    if (path.startsWith('/events/')) return detailResponse(path.slice('/events/'.length));
    return undefined;
  };
}

function quizFeed(fake: ReturnType<typeof fakeManagement>, clock: { now: number }, reports: string[] = []) {
  return createEventsFeed({
    app: 'anchor-quiz',
    categorySlug: 'quiz-night-stanwell-moor',
    apiKey: 'test-key',
    baseUrl: 'https://management.example/api',
    fetchImpl: fake.fetchImpl,
    now: () => clock.now,
    report: (scope) => reports.push(scope),
  });
}

describe('createEventsFeed', () => {
  it('resolves the category by slug and splits this format from the rest', async () => {
    const fake = fakeManagement(standardHandler());
    const clock = { now: Date.parse('2026-11-06T12:00:00Z') };
    const feed = await quizFeed(fake, clock).getFeed();

    expect(feed.status).toBe('ok');
    expect(feed.categorySlug).toBe('quiz-night-stanwell-moor');
    expect(feed.nights.map((event) => event.title)).toEqual(['Test Quiz Night', 'Test Quiz Night']);
    expect(feed.events.map((event) => event.title)).toEqual(['Test Music Bingo', 'Test Tasting Night', 'Test Cash Bingo', 'Test Party']);
    expect(fake.paths).toContain('/event-categories');
    expect(fake.paths).toContain(
      `/events?category_id=${QUIZ_CATEGORY.id}&status=scheduled&from_date=2026-11-06&to_date=2027-03-06&limit=5`,
    );
    expect(fake.paths).toContain('/events?from_date=2026-11-06&to_date=2027-01-05&status=scheduled&limit=50');
  });

  it('uses the short link for a channel when there is one, else the slug page tagged with the app', async () => {
    const fake = fakeManagement(standardHandler());
    const feed = await quizFeed(fake, { now: Date.parse('2026-11-06T12:00:00Z') }).getFeed();
    const quiz = feed.nights[0];
    expect(quiz.links.post_event_screen).toBe('https://l.the-anchor.pub/nsquiz');
    expect(quiz.links.in_game_screen).toBe('https://www.the-anchor.pub/events/test-quiz-night-2026-11-18?utm_source=anchor-quiz&utm_medium=screen');
    expect(feed.events[0].links.post_event_screen).toBe(
      'https://www.the-anchor.pub/events/test-music-bingo-2026-11-20?utm_source=anchor-quiz&utm_medium=screen',
    );
  });

  it('keeps only images in the event-images bucket', async () => {
    const stray = { ...fixtureEvent('20000000-0000-4000-8000-000000000009', 'stray', 'Stray', '2026-11-30T19:00:00Z', null), landscapeImageUrl: 'https://evil.example/a.png', squareImageUrl: null, heroImageUrl: null };
    const fake = fakeManagement((path, url) => (path === '/events' && !url.searchParams.get('category_id') ? listResponse([stray]) : standardHandler()(path, url)));
    const feed = await quizFeed(fake, { now: Date.parse('2026-11-06T12:00:00Z') }).getFeed();
    expect(feed.events.find((event) => event.title === 'Stray')?.image).toBeNull();
    expect(feed.nights[0].image?.square).toBe(false);
  });

  it('asks for the date window from today in London, not UTC (00:30 BST on 25 October)', async () => {
    const fake = fakeManagement(standardHandler());
    // 23:30 UTC on Saturday 24 October 2026 is 00:30 BST on Sunday 25 October.
    await quizFeed(fake, { now: Date.parse('2026-10-24T23:30:00Z') }).getFeed();
    expect(fake.paths.some((path) => path.includes('from_date=2026-10-25'))).toBe(true);
    expect(fake.paths.some((path) => path.includes('from_date=2026-10-24'))).toBe(false);
  });

  it('drops events that have started since the cached answer was built', async () => {
    const fake = fakeManagement(standardHandler());
    const clock = { now: Date.parse('2026-11-18T18:58:00Z') };
    const feed = quizFeed(fake, clock);
    expect((await feed.getFeed()).nights[0].title).toBe('Test Quiz Night');
    expect((await feed.getFeed()).nights[0].startsAt).toBe('2026-11-18T19:00:00.000Z');
    clock.now = Date.parse('2026-11-18T19:00:00Z'); // still inside the 5 minutes
    const after = await feed.getFeed();
    expect(after.nights.map((event) => event.startsAt)).toEqual(['2026-12-02T19:00:00.000Z']);
  });

  it('serves the last good answer while the management app is down, then error after 24 hours', async () => {
    const fake = fakeManagement(standardHandler());
    const clock = { now: Date.parse('2026-11-06T12:00:00Z') };
    const reports: string[] = [];
    const feed = quizFeed(fake, clock, reports);
    const good = await feed.getFeed();

    fake.setDown(true);
    clock.now += 10 * 60_000;
    const stale = await feed.getFeed();
    expect(stale.status).toBe('ok');
    expect(stale.fetchedAt).toBe(good.fetchedAt);
    expect(reports).toContain('events-feed:refresh');

    clock.now += 24 * 60 * 60_000;
    expect((await feed.getFeed()).status).toBe('error');
  });

  it('answers error on a cold failure, and missing_config without a key, never throwing', async () => {
    const fake = fakeManagement(standardHandler());
    fake.setDown(true);
    expect((await quizFeed(fake, { now: Date.now() }).getFeed()).status).toBe('error');

    const noKey = createEventsFeed({ app: 'anchor-quiz', categorySlug: 'quiz-night-stanwell-moor', env: {}, fetchImpl: fake.fetchImpl });
    const feed = await noKey.getFeed();
    expect(feed).toEqual({ status: 'missing_config', fetchedAt: null, categorySlug: 'quiz-night-stanwell-moor', events: [], nights: [] });
  });

  it('carries on from the general list when the category does not exist, and reports it', async () => {
    const fake = fakeManagement((path, url) => (path === '/event-categories' ? categoriesResponse([]) : standardHandler()(path, url)));
    const reports: string[] = [];
    const feed = await quizFeed(fake, { now: Date.parse('2026-11-06T12:00:00Z') }, reports).getFeed();
    expect(feed.nights.map((event) => event.id)).toEqual([QUIZ_NOV_18.id]);
    expect(reports).toContain('events-feed:category');
  });

  it('fails the refresh when every event in a list is malformed, rather than caching nothing', async () => {
    const fake = fakeManagement((path, url) => (path === '/events' ? listResponse([{ id: 'bad' }]) : standardHandler()(path, url)));
    expect((await quizFeed(fake, { now: Date.now() }).getFeed()).status).toBe('error');
  });

  it('gives a failed detail lookup the page link instead of failing the feed', async () => {
    const fake = fakeManagement((path, url) => (path.startsWith('/events/') ? undefined : standardHandler()(path, url)));
    const reports: string[] = [];
    const feed = await quizFeed(fake, { now: Date.parse('2026-11-06T12:00:00Z') }, reports).getFeed();
    expect(feed.status).toBe('ok');
    expect(feed.nights[0].links.post_event_screen).toMatch(/^https:\/\/www\.the-anchor\.pub\/events\/test-quiz-night-2026-11-18\?/);
    expect(reports).toContain('events-feed:details');
  });

  it('refuses a display name in place of a category slug', () => {
    expect(() => createEventsFeed({ app: 'a', categorySlug: 'Quiz Night', env: {} })).toThrow(/category slug/);
  });
});
