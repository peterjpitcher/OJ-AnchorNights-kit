import { describe, expect, it } from 'vitest';
import { buildFitSteps, layoutFits } from './fit';
import { computeScale } from './scale';
import { tvText } from './tv-text';

describe('computeScale (from Quiz Night)', () => {
  it('returns 1 for native 1920x1080', () => {
    expect(computeScale(1920, 1080)).toBe(1);
  });

  it('returns 2 for 4K 3840x2160', () => {
    expect(computeScale(3840, 2160)).toBe(2);
  });

  it('is height-bound for a short viewport and width-bound for a narrow one', () => {
    expect(computeScale(1920, 540)).toBe(0.5);
    expect(computeScale(960, 1080)).toBe(0.5);
  });

  it('letterboxes extra-wide viewports rather than cropping the sides', () => {
    expect(computeScale(2560, 1080)).toBe(1);
  });

  it('keeps the whole canvas on a 16:10 laptop screen', () => {
    const scale = computeScale(1512, 945);
    expect(scale).toBeCloseTo(0.7875);
    expect(1920 * scale).toBeLessThanOrEqual(1512);
    expect(1080 * scale).toBeLessThanOrEqual(945);
  });
});

describe('buildFitSteps', () => {
  // A Quiz Night question screen's shape: question and body, then answer, then notes.
  const input = {
    start: { question: 112, body: 64, answer: 124, notes: 30 },
    floor: { question: 72, body: 48, answer: 84, notes: 26 },
    step: { question: 4, body: 4, answer: 8, notes: 2 },
    shrinkOrder: [['notes'], ['answer'], ['question', 'body']] as const,
  };

  it('starts at the targets', () => {
    expect(buildFitSteps(input)[0]).toEqual(input.start);
  });

  it('gives way least important first: notes, then the answer, then the question and body in turn', () => {
    const steps = buildFitSteps(input);
    expect(steps[1]).toEqual({ question: 112, body: 64, answer: 124, notes: 28 });
    expect(steps[2]).toEqual({ question: 112, body: 64, answer: 124, notes: 26 });
    expect(steps[3]).toEqual({ question: 112, body: 64, answer: 116, notes: 26 });
    const firstQuestionStep = steps.findIndex((s) => s.question < 112);
    expect(steps[firstQuestionStep - 1].answer).toBe(84);
    expect(steps[firstQuestionStep + 1]).toEqual({ ...steps[firstQuestionStep], body: 60 });
  });

  it('ends at the floors and never goes below them', () => {
    const steps = buildFitSteps(input);
    expect(steps[steps.length - 1]).toEqual(input.floor);
    for (const step of steps) {
      for (const key of Object.keys(input.floor) as Array<keyof typeof input.floor>) {
        expect(step[key]).toBeGreaterThanOrEqual(input.floor[key]);
      }
    }
  });

  it('stays well under the 50 layout passes React allows', () => {
    expect(buildFitSteps(input).length).toBeLessThan(50);
  });

  it('treats a floor above the start as the start, and never loops on a zero step', () => {
    const steps = buildFitSteps({
      start: { title: 40, body: 30 },
      floor: { title: 56, body: 20 },
      step: { title: 4, body: 0 },
      shrinkOrder: [['title', 'body']],
    });
    expect(steps).toEqual([{ title: 40, body: 30 }]);
  });
});

describe('layoutFits', () => {
  it('fits when the content clears the bottom padding, with a pixel of rounding', () => {
    expect(layoutFits({ containerHeight: 900, paddingBottom: 40, contentBottom: 860 })).toBe(true);
    expect(layoutFits({ containerHeight: 900, paddingBottom: 40, contentBottom: 861 })).toBe(true);
    expect(layoutFits({ containerHeight: 900, paddingBottom: 40, contentBottom: 862 })).toBe(false);
  });

  it('needs every reserved area at its minimum (a picture keeps 380px)', () => {
    expect(layoutFits({ containerHeight: 900, paddingBottom: 0, contentBottom: 800, reserved: [{ height: 400, min: 380 }] })).toBe(true);
    expect(layoutFits({ containerHeight: 900, paddingBottom: 0, contentBottom: 800, reserved: [{ height: 379, min: 380 }] })).toBe(false);
  });

  it('counts nothing laid out as fitting', () => {
    expect(layoutFits({ containerHeight: 0, paddingBottom: 0, contentBottom: 5000 })).toBe(true);
  });
});

describe('tvText (from Cash Bingo)', () => {
  it('always keeps the size, whatever else is passed', () => {
    expect(tvText('base')).toBe('text-tv-base');
    expect(tvText('xs', 'text-anchor-cream-text', 'font-semibold')).toBe('text-tv-xs text-anchor-cream-text font-semibold');
    expect(tvText('lg', false, null, 'leading-none')).toBe('text-tv-lg leading-none');
  });
});
