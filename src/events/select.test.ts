// Selection runs on instants, so it must give the same answer under
// TZ=Europe/London and TZ=UTC, including across the clock change.
import { describe, expect, it } from 'vitest';
import { dropStarted, hasStarted, NIGHT_CATEGORY_SLUGS, selectNextOfFormat, selectScreenEvents, type SelectableEvent } from './select';

function ev(id: string, startsAt: string, category: string | null, title = `Event ${id}`, status: string | null = 'scheduled'): SelectableEvent {
  return { id, title, startsAt, category, status };
}

describe('started events', () => {
  it('drops an event once its start has passed, and one with no usable start', () => {
    const now = Date.parse('2026-11-18T19:00:00Z');
    expect(hasStarted(ev('a', '2026-11-18T19:00:00.000Z', null), now)).toBe(true);
    expect(hasStarted(ev('b', '2026-11-18T19:00:01.000Z', null), now)).toBe(false);
    expect(hasStarted(ev('c', 'soon', null), now)).toBe(true);
  });

  it('judges a start across the October clock change by the instant, not the wall clock', () => {
    // Sunday 25 October 2026: BST ends at 02:00 BST (01:00 UTC); 01:00 to 02:00 London happens twice.
    // An event at 01:30 GMT (the second 01:30) is 01:30 UTC.
    const secondHalfPastOne = ev('gmt', '2026-10-25T01:30:00.000Z', null);
    // The first 01:30 London was 01:30 BST, which is 00:30 UTC.
    const firstHalfPastOne = ev('bst', '2026-10-25T00:30:00.000Z', null);
    const now = Date.parse('2026-10-25T01:00:00Z'); // 01:00 GMT, just after the clocks went back
    expect(dropStarted([secondHalfPastOne, firstHalfPastOne], now).map((event) => event.id)).toEqual(['gmt']);
  });

  it('judges a start across the March clock change the same way', () => {
    // Sunday 28 March 2027: GMT jumps from 01:00 to 02:00 BST. 19:00 BST is 18:00 UTC.
    const evening = ev('bst', '2027-03-28T18:00:00.000Z', null);
    expect(dropStarted([evening], Date.parse('2027-03-28T17:59:00Z'))).toHaveLength(1);
    expect(dropStarted([evening], Date.parse('2027-03-28T18:00:00Z'))).toHaveLength(0);
  });
});

describe('selectScreenEvents', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');

  it('takes this format out of the general list and keeps it for the nights', () => {
    const general = [
      ev('q1', '2026-11-18T19:00:00Z', NIGHT_CATEGORY_SLUGS.quiz, 'Quiz'),
      ev('m1', '2026-11-20T19:00:00Z', NIGHT_CATEGORY_SLUGS.musicBingo, 'Music'),
      ev('p1', '2026-11-28T20:00:00Z', 'parties', 'Party'),
    ];
    const selection = selectScreenEvents(general, [], { categorySlug: NIGHT_CATEGORY_SLUGS.quiz, nowMs: now });
    expect(selection.events.map((event) => event.id)).toEqual(['m1', 'p1']);
    expect(selection.nights.map((event) => event.id)).toEqual(['q1']);
  });

  it('sorts earliest first, keeps one per name, drops started and unscheduled events, and caps at 8', () => {
    const general = [
      ev('late', '2026-12-01T19:00:00Z', 'parties', 'Same'),
      ev('early', '2026-11-10T19:00:00Z', 'parties', ' same '),
      ev('gone', '2026-11-01T19:00:00Z', 'parties', 'Gone'),
      ev('off', '2026-11-11T19:00:00Z', 'parties', 'Off', 'cancelled'),
      ...Array.from({ length: 10 }, (_, i) => ev(`x${i}`, `2026-11-${String(12 + i).padStart(2, '0')}T19:00:00Z`, 'other', `X${i}`)),
    ];
    const selection = selectScreenEvents(general, [], { categorySlug: 'bingo-night', nowMs: now });
    expect(selection.events[0].id).toBe('early');
    expect(selection.events).toHaveLength(8);
    expect(selection.events.map((event) => event.id)).not.toContain('late');
    expect(selection.events.map((event) => event.id)).not.toContain('gone');
    expect(selection.events.map((event) => event.id)).not.toContain('off');
  });

  it('merges nights from the category query and the general list by id, and never de-duplicates them by name', () => {
    const nights = [ev('b2', '2026-12-16T19:00:00Z', 'bingo-night', 'Cash Bingo'), ev('b1', '2026-11-25T19:00:00Z', 'bingo-night', 'Cash Bingo')];
    const general = [ev('b1', '2026-11-25T19:00:00Z', 'bingo-night', 'Cash Bingo')];
    const selection = selectScreenEvents(general, nights, { categorySlug: 'bingo-night', nowMs: now });
    expect(selection.nights.map((event) => event.id)).toEqual(['b1', 'b2']);
  });
});

describe('selectNextOfFormat', () => {
  const nights = [
    ev('tonight', '2026-11-18T19:00:00Z', 'quiz-night-stanwell-moor'),
    ev('next', '2026-12-02T19:00:00Z', 'quiz-night-stanwell-moor'),
    ev('other', '2026-11-20T19:00:00Z', 'music-bingo'),
  ];

  it('picks the earliest upcoming night of this category slug only', () => {
    expect(selectNextOfFormat(nights, 'quiz-night-stanwell-moor', Date.parse('2026-11-06T12:00:00Z'))?.id).toBe('tonight');
    expect(selectNextOfFormat(nights, 'music-bingo', Date.parse('2026-11-06T12:00:00Z'))?.id).toBe('other');
    expect(selectNextOfFormat(nights, 'Quiz Night', Date.parse('2026-11-06T12:00:00Z'))).toBeNull();
  });

  it('skips tonight by its London date, and a night that has started', () => {
    expect(selectNextOfFormat(nights, 'quiz-night-stanwell-moor', Date.parse('2026-11-18T12:00:00Z'), { excludeLondonDate: '2026-11-18' })?.id).toBe('next');
    expect(selectNextOfFormat(nights, 'quiz-night-stanwell-moor', Date.parse('2026-11-18T19:30:00Z'))?.id).toBe('next');
  });

  it('reads tonight in London time in summer, where 23:30 UTC is already tomorrow', () => {
    // 00:30 BST on Thursday 2 July 2026 is 23:30 UTC on Wednesday 1 July.
    const summer = [ev('late', '2026-07-01T23:30:00Z', 'tasting-nights'), ev('after', '2026-07-08T18:00:00Z', 'tasting-nights')];
    const now = Date.parse('2026-07-01T12:00:00Z');
    expect(selectNextOfFormat(summer, 'tasting-nights', now, { excludeLondonDate: '2026-07-01' })?.id).toBe('late');
    expect(selectNextOfFormat(summer, 'tasting-nights', now, { excludeLondonDate: '2026-07-02' })?.id).toBe('after');
  });

  it('gives null with nothing to come', () => {
    expect(selectNextOfFormat([], 'bingo-night', Date.now())).toBeNull();
  });
});
