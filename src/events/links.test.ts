import { describe, expect, it } from 'vitest';
import { eventLink, eventLinks, eventPageLink, isAllowedReviewUrl, isTrustedShortLink, printedAddress, WHATS_ON_URL } from './links';

const ID = '20000000-0000-4000-8000-000000000001';
const SLUG = 'test-quiz-night-2026-11-18';

describe('event links (spec S7.3)', () => {
  it('prefers the short link for the channel', () => {
    const event = {
      id: ID,
      slug: SLUG,
      shortLinks: { pre_event_screen: 'https://l.the-anchor.pub/pstest', post_event_screen: 'https://l.the-anchor.pub/nstest' },
    };
    expect(eventLink(event, 'pre_event_screen', 'anchor-quiz')).toBe('https://l.the-anchor.pub/pstest');
    expect(eventLink(event, 'post_event_screen', 'anchor-quiz')).toBe('https://l.the-anchor.pub/nstest');
  });

  it('falls back to the slug page tagged with the app, exactly', () => {
    const expected = `https://www.the-anchor.pub/events/${SLUG}?utm_source=anchor-quiz&utm_medium=screen`;
    expect(eventLink({ id: ID, slug: SLUG, shortLinks: { in_game_screen: null } }, 'in_game_screen', 'anchor-quiz')).toBe(expected);
    expect(eventLink({ id: ID, slug: SLUG, shortLinks: null }, 'pre_event_screen', 'anchor-quiz')).toBe(expected);
    // Another channel's short link is never lent to this one.
    expect(eventLink({ id: ID, slug: SLUG, shortLinks: { pre_event_screen: 'https://l.the-anchor.pub/pstest' } }, 'post_event_screen', 'anchor-quiz')).toBe(expected);
  });

  it('uses the id only when the event has no slug, and escapes it', () => {
    expect(eventPageLink({ id: ID, slug: null }, 'anchor-bingo')).toBe(
      `https://www.the-anchor.pub/events/${ID}?utm_source=anchor-bingo&utm_medium=screen`,
    );
    expect(eventPageLink({ id: 'a/b?c', slug: '  ' }, 'x')).toBe('https://www.the-anchor.pub/events/a%2Fb%3Fc?utm_source=x&utm_medium=screen');
  });

  it('ignores any short link that is not an https the-anchor.pub link with a path', () => {
    for (const bad of [
      'http://l.the-anchor.pub/pstest',
      'https://evil.example/pstest',
      'https://the-anchor.pub.evil.example/pstest',
      'https://l.the-anchor.pub:8443/pstest',
      'https://user:pass@l.the-anchor.pub/pstest',
      'https://l.the-anchor.pub/',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(isTrustedShortLink(bad), bad).toBe(false);
      expect(eventLink({ id: ID, slug: SLUG, shortLinks: { pre_event_screen: bad } }, 'pre_event_screen', 'a')).toBe(eventPageLink({ id: ID, slug: SLUG }, 'a'));
    }
    expect(isTrustedShortLink('https://L.The-Anchor.pub/pstest')).toBe(true);
  });

  it('builds a link for all five screen channels', () => {
    const links = eventLinks({ id: ID, slug: SLUG, shortLinks: { venue_screen: 'https://l.the-anchor.pub/vstest' } }, 'a');
    expect(Object.keys(links).sort()).toEqual(['event_host_slide', 'in_game_screen', 'post_event_screen', 'pre_event_screen', 'venue_screen']);
    expect(links.venue_screen).toBe('https://l.the-anchor.pub/vstest');
  });
});

describe('review links', () => {
  it('allows an Anchor short link and refuses a Google review URL or nothing', () => {
    expect(isAllowedReviewUrl('https://l.the-anchor.pub/feedback')).toBe(true);
    expect(isAllowedReviewUrl('https://l.the-anchor.pub/qtest')).toBe(true);
    expect(isAllowedReviewUrl('https://g.page/r/abc/review')).toBe(false);
    expect(isAllowedReviewUrl('https://search.google.com/local/writereview?placeid=x')).toBe(false);
    expect(isAllowedReviewUrl('')).toBe(false);
    expect(isAllowedReviewUrl(null)).toBe(false);
  });
});

describe('printed addresses', () => {
  it('prints the what-is-on link without its scheme or www', () => {
    expect(printedAddress(WHATS_ON_URL)).toBe('the-anchor.pub/whats-on');
  });
});
