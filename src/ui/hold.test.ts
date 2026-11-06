import { describe, expect, it } from 'vitest';
import { HOLD_MS, holdDoneLabel, holdProgress, holdSucceeded } from './hold';

describe('holdSucceeded (from Tasting Night)', () => {
  it('counts nothing returned, true and a promise of true as done', async () => {
    expect(await holdSucceeded(() => undefined)).toBe(true);
    expect(await holdSucceeded(() => true)).toBe(true);
    expect(await holdSucceeded(() => Promise.resolve(true))).toBe(true);
    expect(await holdSucceeded(() => Promise.resolve())).toBe(true);
  });

  it('counts false, a promise of false and a failure as refused', async () => {
    expect(await holdSucceeded(() => false)).toBe(false);
    expect(await holdSucceeded(() => Promise.resolve(false))).toBe(false);
    expect(
      await holdSucceeded(() => {
        throw new Error('no');
      }),
    ).toBe(false);
    expect(await holdSucceeded(() => Promise.reject(new Error('no')))).toBe(false);
  });
});

describe('holdProgress', () => {
  it('fills smoothly over 1.2 seconds and stops at full', () => {
    expect(HOLD_MS).toBe(1200);
    expect(holdProgress(0)).toBe(0);
    expect(holdProgress(600)).toBe(0.5);
    expect(holdProgress(1200)).toBe(1);
    expect(holdProgress(5000)).toBe(1);
  });

  it('moves in fifths for reduced motion', () => {
    expect(holdProgress(300, 1200, true)).toBe(0.2);
    expect(holdProgress(500, 1200, true)).toBe(0.4);
    expect(holdProgress(1199, 1200, true)).toBe(0.8);
    expect(holdProgress(1200, 1200, true)).toBe(1);
  });

  it('is never NaN', () => {
    expect(holdProgress(Number.NaN)).toBe(0);
    expect(holdProgress(-5)).toBe(0);
    expect(holdProgress(10, 0)).toBe(1);
  });
});

describe('holdDoneLabel', () => {
  it('turns the instruction into what was done', () => {
    expect(holdDoneLabel('Hold to end the night')).toBe('End the night');
    expect(holdDoneLabel('Hold: reset the game')).toBe('Reset the game');
    expect(holdDoneLabel('Void number 12')).toBe('Void number 12');
  });
});
